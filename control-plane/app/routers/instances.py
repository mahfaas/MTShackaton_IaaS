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
        created_by_id=str(current_user.id),
        name=req.name,
        vcpu=req.vcpu,
        ram_mb=req.ram_mb,
        image=req.image,
        tags=f"{current_user.email.split('@')[0]}/{req.tags}" if req.tags else current_user.email.split('@')[0]
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
        "created_by_id": instance.created_by_id,
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
    from app.models.base import Role
    
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    result = await db.execute(member_query)
    member = result.scalars().first()
    
    if not member and current_user.role != Role.ADMIN:
        return []
        
    instances_query = select(Instance)
    
    if member:
        instances_query = instances_query.where(Instance.tenant_id == member.tenant_id)
        if not member.is_owner and current_user.role != Role.ADMIN:
            instances_query = instances_query.where(Instance.created_by_id == current_user.id)
            
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
        tenant_id=str(instance.tenant_id),
        force_db_remove=True
    )
    return {"message": "Instance deletion queued"}

@router.post("/{instance_id}/stop", status_code=202)
async def stop_instance(
    instance_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.base import InstanceStatus, Role
    from app.services.instance import stop_worker
    
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    member = (await db.execute(member_query)).scalars().first()
    
    query = select(Instance).where(Instance.id == instance_id)
    if member and current_user.role != Role.ADMIN:
        query = query.where(Instance.tenant_id == member.tenant_id)
        if not member.is_owner:
            query = query.where(Instance.created_by_id == current_user.id)
            
    instance = (await db.execute(query)).scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found or access denied")
        
    if instance.status != InstanceStatus.RUNNING:
        raise HTTPException(status_code=400, detail=f"Cannot stop instance in state {instance.status.value}")
        
    background_tasks.add_task(stop_worker, instance_id=str(instance.id))
    return {"message": "Instance stop queued"}

@router.post("/{instance_id}/start", status_code=202)
async def start_instance(
    instance_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.base import InstanceStatus, Role
    from app.services.instance import start_worker
    
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    member = (await db.execute(member_query)).scalars().first()
    
    query = select(Instance).where(Instance.id == instance_id)
    if member and current_user.role != Role.ADMIN:
        query = query.where(Instance.tenant_id == member.tenant_id)
        if not member.is_owner:
            query = query.where(Instance.created_by_id == current_user.id)
            
    instance = (await db.execute(query)).scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found or access denied")
        
    if instance.status != InstanceStatus.STOPPED:
        raise HTTPException(status_code=400, detail=f"Cannot start instance in state {instance.status.value}")
        
    # Check quotas before starting
    from app.services.instance import get_tenant_quotas_usage
    usage = await get_tenant_quotas_usage(db, str(instance.tenant_id))
    
    if usage["used_instances"] + 1 > usage["max_instances"]:
         raise HTTPException(status_code=400, detail="Instance count quota exceeded")
    if usage["used_vcpu"] + instance.vcpu > usage["max_vcpu"]:
         raise HTTPException(status_code=400, detail="vCPU quota exceeded")
    if usage["used_ram"] + instance.ram_mb > usage["max_ram_mb"]:
         raise HTTPException(status_code=400, detail="RAM quota exceeded")
         
    background_tasks.add_task(start_worker, instance_id=str(instance.id))
    return {"message": "Instance start queued"}

# ==========================================
#  TENANT ACCESS REQUESTS (User-facing)
# ==========================================

@router.get("/{instance_id}/stats")
async def get_instance_stats(
    instance_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.base import InstanceStatus, Role
    from app.grpc_client import get_container_stats_via_grpc
    
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    member = (await db.execute(member_query)).scalars().first()
    
    query = select(Instance).where(Instance.id == instance_id)
    if member and current_user.role != Role.ADMIN:
        query = query.where(Instance.tenant_id == member.tenant_id)
        if not member.is_owner:
            query = query.where(Instance.created_by_id == current_user.id)
            
    instance = (await db.execute(query)).scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found or access denied")
        
    if instance.status != InstanceStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Cannot fetch stats for non-running instance")
        
    stats = await get_container_stats_via_grpc(instance_id)
    if not stats.get("success"):
        raise HTTPException(status_code=500, detail="Failed to fetch stats from Compute Node")
        
    return stats

# ==========================================
#  SNAPSHOT / BACKUP MANAGEMENT
# ==========================================

@router.post("/{instance_id}/snapshots")
async def create_snapshot(
    instance_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.base import InstanceStatus, Role, Backup, BackupStatus
    from app.grpc_client import create_snapshot_via_grpc
    from datetime import datetime
    
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    member = (await db.execute(member_query)).scalars().first()
    
    query = select(Instance).where(Instance.id == instance_id)
    if member and current_user.role != Role.ADMIN:
        query = query.where(Instance.tenant_id == member.tenant_id)
    instance = (await db.execute(query)).scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    if instance.status != InstanceStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Can only snapshot running instances")
    
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    snapshot_name = f"snapshot-{instance_id}-{timestamp}"
    
    backup = Backup(
        instance_id=instance.id,
        name=snapshot_name,
        status=BackupStatus.CREATING
    )
    db.add(backup)
    await db.commit()
    await db.refresh(backup)
    
    result = await create_snapshot_via_grpc(str(instance_id), snapshot_name)
    
    if result.get("success"):
        backup.status = BackupStatus.READY
        backup.snapshot_image = result.get("snapshot_image", snapshot_name)
        backup.size_mb = int((result.get("size_bytes", 0)) / (1024 * 1024))
    else:
        backup.status = BackupStatus.FAILED
    
    db.add(backup)
    await db.commit()
    await db.refresh(backup)
    
    return {
        "id": backup.id,
        "name": backup.name,
        "status": backup.status.value,
        "size_mb": backup.size_mb,
        "snapshot_image": backup.snapshot_image,
        "created_at": backup.created_at,
        "success": result.get("success", False),
        "message": result.get("message", "")
    }

@router.get("/{instance_id}/snapshots")
async def list_snapshots(
    instance_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.base import Role, Backup
    
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    member = (await db.execute(member_query)).scalars().first()
    
    query = select(Instance).where(Instance.id == instance_id)
    if member and current_user.role != Role.ADMIN:
        query = query.where(Instance.tenant_id == member.tenant_id)
    instance = (await db.execute(query)).scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    
    backups_q = select(Backup).where(Backup.instance_id == instance_id).order_by(Backup.created_at.desc())
    result = await db.execute(backups_q)
    backups = result.scalars().all()
    
    return [{
        "id": b.id,
        "name": b.name,
        "status": b.status.value,
        "size_mb": b.size_mb,
        "snapshot_image": b.snapshot_image,
        "created_at": b.created_at
    } for b in backups]

@router.post("/{instance_id}/snapshots/{backup_id}/restore")
async def restore_snapshot(
    instance_id: str,
    backup_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.base import InstanceStatus, Role, Backup, BackupStatus
    from app.grpc_client import restore_snapshot_via_grpc
    
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    member = (await db.execute(member_query)).scalars().first()
    
    query = select(Instance).where(Instance.id == instance_id)
    if member and current_user.role != Role.ADMIN:
        query = query.where(Instance.tenant_id == member.tenant_id)
    instance = (await db.execute(query)).scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    
    backup = (await db.execute(select(Backup).where(Backup.id == backup_id, Backup.instance_id == instance_id))).scalar_one_or_none()
    if not backup or backup.status != BackupStatus.READY:
        raise HTTPException(status_code=404, detail="Backup not found or not ready")
    
    backup.status = BackupStatus.RESTORING
    db.add(backup)
    await db.commit()
    
    result = await restore_snapshot_via_grpc(
        instance_id=str(instance_id),
        snapshot_image=backup.snapshot_image,
        tenant_id=str(instance.tenant_id),
        vcpu=instance.vcpu,
        ram_mb=instance.ram_mb,
        image=instance.image
    )
    
    if result.get("success"):
        instance.status = InstanceStatus.RUNNING
        ip = result.get("ip_address", instance.ip_address)
        msg = result.get("message", "")
        # Parse port mapping (format: "Restored|port:XXXX")
        if "|port:" in msg:
            port = msg.split("|port:")[1]
            instance.ip_address = f"{ip}|port:{port}"
        else:
            instance.ip_address = ip
        backup.status = BackupStatus.READY
    else:
        backup.status = BackupStatus.FAILED
    
    db.add(instance)
    db.add(backup)
    await db.commit()
    
    return {
        "success": result.get("success", False),
        "message": result.get("message", ""),
        "ip_address": instance.ip_address
    }

@router.get("/{instance_id}/snapshots/{backup_id}/export")
async def export_snapshot(
    instance_id: str,
    backup_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export a snapshot as a downloadable tar stream."""
    from app.models.base import Role, Backup, BackupStatus
    from fastapi.responses import StreamingResponse
    import socket as sock
    import json as export_json
    
    member_query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    member = (await db.execute(member_query)).scalars().first()
    
    query = select(Instance).where(Instance.id == instance_id)
    if member and current_user.role != Role.ADMIN:
        query = query.where(Instance.tenant_id == member.tenant_id)
    instance = (await db.execute(query)).scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    
    backup = (await db.execute(select(Backup).where(Backup.id == backup_id, Backup.instance_id == instance_id))).scalar_one_or_none()
    if not backup or backup.status != BackupStatus.READY:
        raise HTTPException(status_code=404, detail="Backup not found or not ready")
    
    image_name = backup.snapshot_image
    
    def docker_image_stream():
        """Stream docker image as tar via Docker API unix socket."""
        s = sock.socket(sock.AF_UNIX, sock.SOCK_STREAM)
        s.settimeout(120)
        s.connect("/var/run/docker.sock")
        request = f"GET /images/{image_name}/get HTTP/1.1\r\nHost: localhost\r\n\r\n".encode()
        s.sendall(request)
        # Read HTTP headers
        header_data = b""
        while b"\r\n\r\n" not in header_data:
            chunk = s.recv(4096)
            if not chunk:
                break
            header_data += chunk
        # After headers, stream the body
        if b"\r\n\r\n" in header_data:
            _, body_start = header_data.split(b"\r\n\r\n", 1)
            if body_start:
                yield body_start
        while True:
            try:
                chunk = s.recv(65536)
                if not chunk:
                    break
                yield chunk
            except sock.timeout:
                break
        s.close()
    
    return StreamingResponse(
        docker_image_stream(),
        media_type="application/x-tar",
        headers={"Content-Disposition": f"attachment; filename={image_name}.tar"}
    )

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
