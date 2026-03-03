from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.base import User, Role, Tenant, Instance, Quota
from app.routers.deps import get_current_user
from pydantic import BaseModel

class QuotaUpdate(BaseModel):
    max_vcpu: int
    max_ram_mb: int
    max_instances: int

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/tenants")
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin privileges required")
        
    # Fetch all tenants with their instances and quotas
    query = select(Tenant).options(selectinload(Tenant.instances), selectinload(Tenant.quota))
    result = await db.execute(query)
    tenants = result.scalars().all()
    
    response = []
    for t in tenants:
        active_instances = [i for i in t.instances if i.status.value != "FAILED" and i.status.value != "DELETED"]
        used_vcpu = sum(i.vcpu for i in active_instances)
        used_ram = sum(i.ram_mb for i in active_instances)
        
        response.append({
            "id": t.id,
            "name": t.name,
            "instances_count": len(active_instances),
            "quota_usage": {
                "max_vcpu": t.quota.max_vcpu if t.quota else 0,
                "used_vcpu": used_vcpu,
                "max_ram_mb": t.quota.max_ram_mb if t.quota else 0,
                "used_ram": used_ram,
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

@router.put("/tenants/{tenant_id}/quotas")
async def update_tenant_quotas(
    tenant_id: str,
    quota_update: QuotaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin privileges required")
        
    query = select(Quota).where(Quota.tenant_id == tenant_id)
    result = await db.execute(query)
    quota = result.scalar_one_or_none()
    
    if not quota:
        # Create a new quota row if it doesn't exist
        quota = Quota(
            tenant_id=tenant_id,
            max_vcpu=quota_update.max_vcpu,
            max_ram_mb=quota_update.max_ram_mb,
            max_instances=quota_update.max_instances
        )
        db.add(quota)
    else:
        # Update existing
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
    if current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    
    from app.models.base import TenantMember, Instance
    
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
    
    # Delete tenant
    tenant_query = select(Tenant).where(Tenant.id == tenant_id)
    tenant_result = await db.execute(tenant_query)
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    await db.delete(tenant)
    await db.commit()
    
    return {"message": f"Tenant '{tenant.name}' deleted successfully"}
