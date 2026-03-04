from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime

from app.database import get_db
from app.models.base import User, Role, Tenant, Instance, Quota, TenantMember, TenantRequest, RequestStatus
from app.routers.deps import get_current_user
from pydantic import BaseModel
from typing import Optional
from uuid import UUID

# --- Pydantic Schemas ---

class QuotaUpdate(BaseModel):
    max_vcpu: int
    max_ram_mb: int
    max_instances: int

class TenantCreateRequest(BaseModel):
    name: str
    max_vcpu: int = 4
    max_ram_mb: int = 8192
    max_instances: int = 2

class AssignUserRequest(BaseModel):
    user_id: UUID

class RequestAction(BaseModel):
    action: str  # "approve" or "reject"
    tenant_id: Optional[UUID] = None  # required for approve
    comment: str = ""

# --- Helpers ---

def require_admin(user: User):
    if user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin privileges required")

router = APIRouter(prefix="/admin", tags=["admin"])

# ==========================================
#  CLUSTER STATS
# ==========================================

@router.get("/cluster/stats")
async def get_cluster_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    
    # 1. Tenant resource distribution
    query = select(Tenant).options(
        selectinload(Tenant.instances),
        selectinload(Tenant.quota)
    )
    result = await db.execute(query)
    tenants = result.scalars().all()
    
    tenant_stats = []
    status_counts = {"RUNNING": 0, "STOPPED": 0, "FAILED": 0, "DELETED": 0, "PROVISIONING": 0, "DELETING": 0}
    
    for t in tenants:
        t_vcpu = 0
        t_ram = 0
        for i in t.instances:
            status_counts[i.status.value] = status_counts.get(i.status.value, 0) + 1
            if i.status.value not in ("FAILED", "DELETED"):
                t_vcpu += i.vcpu
                t_ram += i.ram_mb
        tenant_stats.append({
            "tenant_id": t.id,
            "name": t.name,
            "used_vcpu": t_vcpu,
            "used_ram_mb": t_ram,
            "active_instances": len([i for i in t.instances if i.status.value not in ("FAILED", "DELETED")])
        })
        
    # 2. Node physical stats
    from app.grpc_client import get_node_stats_via_grpc
    node_stats = await get_node_stats_via_grpc()
    
    return {
        "tenant_distribution": tenant_stats,
        "instance_statuses": status_counts,
        "node_health": node_stats
    }

@router.get("/cluster/history")
async def get_cluster_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns a single time-series data point of current aggregate cluster load.
    Frontend polls this every 5s and accumulates client-side."""
    require_admin(current_user)
    
    from app.grpc_client import get_node_stats_via_grpc, get_container_stats_via_grpc
    
    # Get all running instances
    running_q = select(Instance).where(Instance.status == "RUNNING")
    result = await db.execute(running_q)
    running_instances = result.scalars().all()
    
    total_cpu = 0.0
    total_ram = 0.0
    total_net_rx = 0.0
    total_net_tx = 0.0
    
    for inst in running_instances:
        try:
            stats = await get_container_stats_via_grpc(str(inst.id))
            if stats.get("success"):
                total_cpu += stats.get("cpu_usage_percent", 0)
                total_ram += stats.get("ram_usage_mb", 0)
                total_net_rx += stats.get("network_rx_bytes", 0)
                total_net_tx += stats.get("network_tx_bytes", 0)
        except:
            pass
    
    node_stats = await get_node_stats_via_grpc()
    
    from datetime import datetime
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "total_cpu_percent": round(total_cpu, 2),
        "total_ram_mb": round(total_ram, 2),
        "total_net_rx_kb": round(total_net_rx / 1024, 2),
        "total_net_tx_kb": round(total_net_tx / 1024, 2),
        "node_cpu": round(node_stats.get("cpu_usage_percent", 0), 2),
        "node_ram_percent": round(
            (node_stats.get("ram_usage_mb", 0) / max(node_stats.get("ram_total_mb", 1), 1)) * 100, 2
        ),
        "containers_running": node_stats.get("containers_running", 0)
    }

@router.get("/activity/heatmap")
async def get_activity_heatmap(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns VM launch counts per day for the past 365 days (GitHub-style heatmap)."""
    require_admin(current_user)
    
    from sqlalchemy import func, cast, Date
    from datetime import datetime, timedelta
    
    start_date = datetime.utcnow() - timedelta(days=365)
    
    query = (
        select(
            cast(Instance.created_at, Date).label("date"),
            func.count(Instance.id).label("count")
        )
        .where(Instance.created_at >= start_date)
        .group_by(cast(Instance.created_at, Date))
        .order_by(cast(Instance.created_at, Date))
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    heatmap = {}
    for row in rows:
        heatmap[row.date.isoformat()] = row.count
    
    return heatmap

@router.post("/cleanup-stuck")
async def cleanup_stuck_instances(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Force-remove all instances stuck in DELETING status."""
    require_admin(current_user)
    
    from app.models.base import InstanceStatus
    
    query = select(Instance).where(Instance.status == InstanceStatus.DELETING)
    result = await db.execute(query)
    stuck = result.scalars().all()
    
    count = 0
    for inst in stuck:
        await db.delete(inst)
        count += 1
    
    await db.commit()
    return {"cleaned": count, "message": f"Removed {count} stuck instances"}

# ==========================================
#  TENANTS
# ==========================================

@router.get("/tenants")
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
        
    query = select(Tenant).options(
        selectinload(Tenant.instances),
        selectinload(Tenant.quota),
        selectinload(Tenant.members).selectinload(TenantMember.user)
    )
    result = await db.execute(query)
    tenants = result.scalars().all()
    
    response = []
    for t in tenants:
        active_instances = [i for i in t.instances if i.status.value not in ("FAILED", "DELETED")]
        used_vcpu = sum(i.vcpu for i in active_instances)
        used_ram = sum(i.ram_mb for i in active_instances)
        
        response.append({
            "id": t.id,
            "name": t.name,
            "instances_count": len(active_instances),
            "members": [
                {
                    "user_id": m.user.id,
                    "email": m.user.email,
                    "is_owner": m.is_owner
                } for m in t.members
            ],
            "quota_usage": {
                "max_vcpu": t.quota.max_vcpu if t.quota else 0,
                "used_vcpu": used_vcpu,
                "max_ram_mb": t.quota.max_ram_mb if t.quota else 0,
                "used_ram": used_ram,
                "max_instances": t.quota.max_instances if t.quota else 0,
                "used_instances": len(active_instances),
            },
            "instances": [
                {
                    "id": i.id,
                    "name": i.name,
                    "status": i.status.value,
                    "vcpu": i.vcpu,
                    "ram_mb": i.ram_mb,
                    "ip_address": i.ip_address
                } for i in active_instances
            ]
        })
        
    return response

@router.post("/tenants")
async def create_tenant(
    req: TenantCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    
    # Check unique name
    existing = await db.execute(select(Tenant).where(Tenant.name == req.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tenant with this name already exists")
    
    tenant = Tenant(name=req.name)
    db.add(tenant)
    await db.flush()
    
    quota = Quota(
        tenant_id=tenant.id,
        max_vcpu=req.max_vcpu,
        max_ram_mb=req.max_ram_mb,
        max_instances=req.max_instances
    )
    db.add(quota)
    await db.commit()
    
    return {
        "id": tenant.id,
        "name": tenant.name,
        "message": "Tenant created successfully"
    }

@router.put("/tenants/{tenant_id}/quotas")
async def update_tenant_quotas(
    tenant_id: str,
    quota_update: QuotaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
        
    query = select(Quota).where(Quota.tenant_id == tenant_id)
    result = await db.execute(query)
    quota = result.scalar_one_or_none()
    
    if not quota:
        quota = Quota(
            tenant_id=tenant_id,
            max_vcpu=quota_update.max_vcpu,
            max_ram_mb=quota_update.max_ram_mb,
            max_instances=quota_update.max_instances
        )
        db.add(quota)
    else:
        quota.max_vcpu = quota_update.max_vcpu
        quota.max_ram_mb = quota_update.max_ram_mb
        quota.max_instances = quota_update.max_instances
        
    await db.commit()
    return {"message": "Quotas updated successfully"}

@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    
    # Delete all instances for this tenant
    instances_query = select(Instance).where(Instance.tenant_id == tenant_id)
    instances_result = await db.execute(instances_query)
    for inst in instances_result.scalars().all():
        await db.delete(inst)
    
    # Delete quota
    quota_query = select(Quota).where(Quota.tenant_id == tenant_id)
    quota_result = await db.execute(quota_query)
    quota = quota_result.scalar_one_or_none()
    if quota:
        await db.delete(quota)
    
    # Delete tenant members
    members_query = select(TenantMember).where(TenantMember.tenant_id == tenant_id)
    members_result = await db.execute(members_query)
    for member in members_result.scalars().all():
        await db.delete(member)
    
    # Delete related requests
    req_query = select(TenantRequest).where(TenantRequest.tenant_id == tenant_id)
    req_result = await db.execute(req_query)
    for r in req_result.scalars().all():
        await db.delete(r)
    
    # Delete tenant
    tenant_query = select(Tenant).where(Tenant.id == tenant_id)
    tenant_result = await db.execute(tenant_query)
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    await db.delete(tenant)
    await db.commit()
    
    return {"message": f"Tenant '{tenant.name}' deleted successfully"}

# ==========================================
#  TENANT MEMBERS
# ==========================================

@router.post("/tenants/{tenant_id}/members")
async def add_member_to_tenant(
    tenant_id: str,
    req: AssignUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    
    # Check tenant exists
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Check user exists
    user = (await db.execute(select(User).where(User.id == req.user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove user from any existing tenant first
    old_members = (await db.execute(
        select(TenantMember).where(TenantMember.user_id == req.user_id)
    )).scalars().all()
    for m in old_members:
        await db.delete(m)
    
    # Add to new tenant
    member = TenantMember(user_id=req.user_id, tenant_id=tenant_id, is_owner=False)
    db.add(member)
    await db.commit()
    
    return {"message": f"User {user.email} assigned to tenant {tenant.name}"}

@router.delete("/tenants/{tenant_id}/members/{user_id}")
async def remove_member_from_tenant(
    tenant_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    
    member = (await db.execute(
        select(TenantMember).where(
            TenantMember.user_id == user_id,
            TenantMember.tenant_id == tenant_id
        )
    )).scalar_one_or_none()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    await db.delete(member)
    await db.commit()
    return {"message": "Member removed from tenant"}

@router.put("/tenants/{tenant_id}/members/{user_id}/set-owner")
async def set_tenant_owner(
    tenant_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    
    member = (await db.execute(
        select(TenantMember).where(
            TenantMember.user_id == user_id,
            TenantMember.tenant_id == tenant_id
        )
    )).scalar_one_or_none()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this tenant")
    
    member.is_owner = not member.is_owner
    await db.commit()
    
    role = "Owner" if member.is_owner else "Member"
    return {"message": f"User role updated to {role} successfully"}

# ==========================================
#  USERS
# ==========================================

@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    
    query = select(User).options()
    result = await db.execute(query)
    users = result.scalars().all()
    
    response = []
    for u in users:
        # Find tenant membership
        member_query = select(TenantMember).where(TenantMember.user_id == u.id)
        member_result = await db.execute(member_query)
        member = member_result.scalar_one_or_none()
        
        tenant_name = None
        tenant_id = None
        if member:
            tenant = (await db.execute(select(Tenant).where(Tenant.id == member.tenant_id))).scalar_one_or_none()
            if tenant:
                tenant_name = tenant.name
                tenant_id = tenant.id
        
        response.append({
            "id": u.id,
            "email": u.email,
            "role": u.role.value,
            "tenant_id": tenant_id,
            "tenant_name": tenant_name,
            "created_at": u.created_at
        })
    
    return response

# ==========================================
#  TENANT ACCESS REQUESTS
# ==========================================

@router.get("/requests")
async def list_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    
    query = select(TenantRequest).order_by(TenantRequest.created_at.desc())
    result = await db.execute(query)
    requests = result.scalars().all()
    
    response = []
    for r in requests:
        # Get user info
        user = (await db.execute(select(User).where(User.id == r.user_id))).scalar_one_or_none()
        tenant_name = None
        if r.tenant_id:
            tenant = (await db.execute(select(Tenant).where(Tenant.id == r.tenant_id))).scalar_one_or_none()
            if tenant:
                tenant_name = tenant.name
        
        response.append({
            "id": r.id,
            "user_id": r.user_id,
            "user_email": user.email if user else "Unknown",
            "tenant_id": r.tenant_id,
            "tenant_name": tenant_name,
            "message": r.message,
            "status": r.status.value,
            "admin_comment": r.admin_comment,
            "created_at": r.created_at,
            "resolved_at": r.resolved_at
        })
    
    return response

@router.post("/requests/{request_id}/resolve")
async def resolve_request(
    request_id: str,
    action: RequestAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    
    req = (await db.execute(select(TenantRequest).where(TenantRequest.id == request_id))).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if req.status != RequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request already resolved")
    
    if action.action == "approve":
        tenant_id = action.tenant_id or req.tenant_id
        if not tenant_id:
            raise HTTPException(status_code=400, detail="tenant_id is required for approval")
        
        # Check tenant exists
        tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Remove from old tenants
        old_members = (await db.execute(
            select(TenantMember).where(TenantMember.user_id == req.user_id)
        )).scalars().all()
        for m in old_members:
            await db.delete(m)
        
        # Add to tenant
        member = TenantMember(user_id=req.user_id, tenant_id=tenant_id, is_owner=False)
        db.add(member)
        
        req.status = RequestStatus.APPROVED
        req.tenant_id = tenant_id
        req.admin_comment = action.comment
        req.resolved_at = datetime.utcnow()
        
        await db.commit()
        return {"message": f"Request approved. User assigned to tenant '{tenant.name}'."}
    
    elif action.action == "reject":
        req.status = RequestStatus.REJECTED
        req.admin_comment = action.comment
        req.resolved_at = datetime.utcnow()
        await db.commit()
        return {"message": "Request rejected."}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'approve' or 'reject'.")
