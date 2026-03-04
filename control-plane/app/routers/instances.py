from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_db
from app.models.base import User, TenantMember, Instance
from app.routers.deps import get_current_user
from app.schemas.instance import InstanceCreateRequest, InstanceResponse
from app.services.instance import create_instance_service, provision_worker

router = APIRouter(prefix="/instances", tags=["instances"])

@router.post("", response_model=InstanceResponse, status_code=202)
async def create_instance(
    req: InstanceCreateRequest, 
    background_tasks: BackgroundTasks, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Verify User Authorization to Tenant
    query = select(TenantMember).where(
        TenantMember.user_id == current_user.id,
        TenantMember.tenant_id == req.tenant_id
    )
    result = await db.execute(query)
    member = result.scalar_one_or_none()
    
    if not member:
        raise HTTPException(status_code=403, detail="Not authorized to access this tenant")

    # 2. Call Business Logic (with Row-Level Lock on Quotas)
    service_result = await create_instance_service(
        db=db, 
        tenant_id=str(req.tenant_id),
        name=req.name,
        vcpu=req.vcpu,
        ram_mb=req.ram_mb,
        image=req.image,
        tags=req.tags
    )
    
    if not service_result["success"]:
        raise HTTPException(status_code=service_result["status_code"], detail=service_result["error"])
        
    instance = service_result["instance"]

    # 3. Queue Background Task (Non-blocking)
    background_tasks.add_task(
        provision_worker,
        instance_id=str(instance.id),
        tenant_id=str(instance.tenant_id),
        vcpu=req.vcpu,
        ram_mb=req.ram_mb,
        image=req.image
    )

    return {
        "id": instance.id,
        "tenant_id": instance.tenant_id,
        "name": instance.name,
        "vcpu": instance.vcpu,
        "ram_mb": instance.ram_mb,
        "image": instance.image,
        "tags": instance.tags,
        "status": instance.status.value,
        "ip_address": instance.ip_address,
        "created_at": instance.created_at
    }

@router.get("", response_model=list[InstanceResponse])
async def list_instances(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    result = await db.execute(member_query)
    member = result.scalars().first()
    
    if not member:
        return []
        
    instances_query = select(Instance).where(Instance.tenant_id == member.tenant_id)
    instances_result = await db.execute(instances_query)
    return instances_result.scalars().all()

@router.get("/quotas")
async def get_quotas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.services.instance import get_tenant_quotas_usage
    
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    result = await db.execute(member_query)
    member = result.scalars().first()
    
    if not member:
        raise HTTPException(status_code=404, detail="No tenant associated with user")
        
    usage = await get_tenant_quotas_usage(db, str(member.tenant_id))
    if not usage:
        raise HTTPException(status_code=404, detail="Quota not found")
        
    return usage

@router.delete("/{instance_id}", status_code=202)
async def delete_instance(
    instance_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.base import InstanceStatus
    from app.services.instance import delete_worker
    
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    member = (await db.execute(member_query)).scalars().first()
    if not member:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    instance_query = select(Instance).where(
        Instance.id == instance_id, 
        Instance.tenant_id == member.tenant_id
    )
    instance = (await db.execute(instance_query)).scalar_one_or_none()
    
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
        
    # Mark as deleting
    instance.status = InstanceStatus.DELETING
    db.add(instance)
    await db.commit()
    
    # Queue background task to delete from Docker and then remove from DB
    background_tasks.add_task(
        delete_worker, 
        instance_id=str(instance.id), 
        tenant_id=str(instance.tenant_id)
    )
    return {"message": "Instance deletion queued"}

# ==========================================
#  TENANT ACCESS REQUESTS (User-facing)
# ==========================================

from pydantic import BaseModel as PydanticBase

class AccessRequestCreate(PydanticBase):
    message: str = ""

@router.post("/request-access", status_code=201)
async def request_tenant_access(
    req: AccessRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.base import TenantRequest, RequestStatus
    
    # Check if user already has a tenant
    member = (await db.execute(
        select(TenantMember).where(TenantMember.user_id == current_user.id)
    )).scalar_one_or_none()
    if member:
        raise HTTPException(status_code=400, detail="You are already assigned to a tenant")
    
    # Check if there's already a pending request
    existing = (await db.execute(
        select(TenantRequest).where(
            TenantRequest.user_id == current_user.id,
            TenantRequest.status == RequestStatus.PENDING
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending request")
    
    request = TenantRequest(
        user_id=current_user.id,
        message=req.message
    )
    db.add(request)
    await db.commit()
    
    return {"message": "Access request submitted successfully"}

@router.get("/my-request")
async def get_my_request(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.base import TenantRequest, RequestStatus
    
    # Get latest request
    query = select(TenantRequest).where(
        TenantRequest.user_id == current_user.id
    ).order_by(TenantRequest.created_at.desc())
    result = await db.execute(query)
    req = result.scalars().first()
    
    if not req:
        return {"status": None}
    
    return {
        "id": req.id,
        "status": req.status.value,
        "message": req.message,
        "admin_comment": req.admin_comment,
        "created_at": req.created_at,
        "resolved_at": req.resolved_at
    }
