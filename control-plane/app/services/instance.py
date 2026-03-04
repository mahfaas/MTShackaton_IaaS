import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.models.base import Instance, InstanceStatus, Quota

from app.grpc_client import provision_instance_via_grpc, delete_instance_via_grpc
from app.database import AsyncSessionLocal

async def provision_worker(instance_id: str, tenant_id: str, vcpu: int, ram_mb: int, image: str):
    """Background task to provision the instance and update the DB status."""
    # We create a new session just for this worker task since it's background
    async with AsyncSessionLocal() as db:
        try:
            grpc_result = await provision_instance_via_grpc(
                instance_id=instance_id,
                tenant_id=tenant_id,
                vcpu=vcpu,
                ram_mb=ram_mb,
                image=image
            )
            
            # Fetch instance again to update
            query = select(Instance).where(Instance.id == instance_id)
            result = await db.execute(query)
            instance = result.scalar_one_or_none()
            if not instance:
                return
            
            if grpc_result["success"]:
                instance.status = InstanceStatus.RUNNING
                ip = grpc_result.get("ip_address", "unknown")
                msg = grpc_result.get("message", "")
                # Parse port mapping from gRPC message (format: "Running|port:XXXX")
                if "|port:" in msg:
                    port = msg.split("|port:")[1]
                    instance.ip_address = f"{ip}|port:{port}"
                else:
                    instance.ip_address = ip
            else:
                instance.status = InstanceStatus.FAILED
                print(f"Provisioning failed: {grpc_result.get('message')}")
            
            db.add(instance)
            await db.commit()
        except Exception as e:
            # Handle unexpected failures
            query = select(Instance).where(Instance.id == instance_id)
            result = await db.execute(query)
            instance = result.scalar_one_or_none()
            if instance:
                instance.status = InstanceStatus.FAILED
                db.add(instance)
                await db.commit()
            print(f"Background worker failed: {e}")

async def create_instance_service(db: AsyncSession, tenant_id: str, created_by_id: str, name: str, vcpu: int, ram_mb: int, image: str, tags: str = ""):
    """Business logic combining quota calculation and DB persistence."""
    # 1. Row-level Lock for Transaction (SELECT ... FOR UPDATE) to fix Race Condition
    query = select(Quota).where(Quota.tenant_id == tenant_id).with_for_update()
    result = await db.execute(query)
    quota = result.scalar_one_or_none()
    
    if not quota:
        return {"success": False, "error": "Tenant quota not found", "status_code": 404}

    # Считаем потребление ресурсов
    usage_query = select(
        func.sum(Instance.vcpu).label("used_vcpu"),
        func.sum(Instance.ram_mb).label("used_ram"),
        func.count(Instance.id).label("used_instances")
    ).where(
        Instance.tenant_id == tenant_id, 
        Instance.status.notin_([InstanceStatus.FAILED, InstanceStatus.STOPPED])
    )
    
    usage_result = await db.execute(usage_query)
    usage = usage_result.one()

    used_vcpu = usage.used_vcpu or 0
    used_ram = usage.used_ram or 0
    used_instances = usage.used_instances or 0

    if used_instances + 1 > quota.max_instances:
        return {"success": False, "error": "Instance count quota exceeded", "status_code": 400}
    if used_vcpu + vcpu > quota.max_vcpu:
        return {"success": False, "error": "vCPU quota exceeded", "status_code": 400}
    if used_ram + ram_mb > quota.max_ram_mb:
        return {"success": False, "error": "RAM quota exceeded", "status_code": 400}

    # Резервируем ресурсы (State: PROVISIONING)
    new_instance = Instance(
        tenant_id=tenant_id,
        created_by_id=created_by_id,
        name=name,
        vcpu=vcpu,
        ram_mb=ram_mb,
        image=image,
        status=InstanceStatus.PROVISIONING,
        tags=tags
    )
    db.add(new_instance)
    await db.commit()
    await db.refresh(new_instance)

    return {"success": True, "instance": new_instance}

async def delete_worker(instance_id: str, tenant_id: str):
    """Background task to delete an instance from Docker and DB."""
    async with AsyncSessionLocal() as db:
        try:
            grpc_result = await delete_instance_via_grpc(instance_id, tenant_id)
            query = select(Instance).where(Instance.id == instance_id)
            result = await db.execute(query)
            instance = result.scalar_one_or_none()
            if instance:
                if grpc_result["success"]:
                    await db.delete(instance)
                else:
                    print(f"Delete via gRPC failed: {grpc_result.get('message')}")
                    # Allow deletion from DB anyway or mark as FAILED
                    await db.delete(instance)
                await db.commit()
        except Exception as e:
            print(f"Background delete worker failed: {e}")

async def get_tenant_quotas_usage(db: AsyncSession, tenant_id: str) -> dict:
    query = select(Quota).where(Quota.tenant_id == tenant_id)
    result = await db.execute(query)
    quota = result.scalar_one_or_none()
    
    if not quota:
        # Default fallback for users who might not have quota row created
        return {
            "max_vcpu": 4,
            "max_ram_mb": 8192,
            "max_instances": 2,
            "used_vcpu": 0,
            "used_ram": 0,
            "used_instances": 0
        }

    usage_query = select(
        func.sum(Instance.vcpu).label("used_vcpu"),
        func.sum(Instance.ram_mb).label("used_ram"),
        func.count(Instance.id).label("used_instances")
    ).where(
        Instance.tenant_id == tenant_id, 
        Instance.status.notin_([InstanceStatus.FAILED, InstanceStatus.STOPPED])
    )
    
    usage_result = await db.execute(usage_query)
    usage = usage_result.one()

    return {
        "max_vcpu": quota.max_vcpu,
        "max_ram_mb": quota.max_ram_mb,
        "max_instances": quota.max_instances,
        "used_vcpu": usage.used_vcpu or 0,
        "used_ram": usage.used_ram or 0,
        "used_instances": usage.used_instances or 0
    }

async def stop_worker(instance_id: str):
    """Background task to stop an instance via Docker API."""
    from app.routers.terminal import docker_api
    async with AsyncSessionLocal() as db:
        try:
            loop = asyncio.get_event_loop()
            # docker stop timeout is 10s by default
            status, _ = await loop.run_in_executor(
                None, docker_api, "POST", f"/containers/iaas-vm-{instance_id}/stop"
            )
            query = select(Instance).where(Instance.id == instance_id)
            result = await db.execute(query)
            instance = result.scalar_one_or_none()
            if instance:
                if status in (204, 304):
                    instance.status = InstanceStatus.STOPPED
                else:
                    instance.status = InstanceStatus.FAILED
                db.add(instance)
                await db.commit()
        except Exception as e:
            print(f"Background stop worker failed: {e}")

async def start_worker(instance_id: str):
    """Background task to start an instance via Docker API."""
    from app.routers.terminal import docker_api
    async with AsyncSessionLocal() as db:
        try:
            loop = asyncio.get_event_loop()
            status, _ = await loop.run_in_executor(
                None, docker_api, "POST", f"/containers/iaas-vm-{instance_id}/start"
            )
            query = select(Instance).where(Instance.id == instance_id)
            result = await db.execute(query)
            instance = result.scalar_one_or_none()
            if instance:
                if status in (204, 304):
                    instance.status = InstanceStatus.RUNNING
                else:
                    instance.status = InstanceStatus.FAILED
                db.add(instance)
                await db.commit()
        except Exception as e:
            print(f"Background start worker failed: {e}")
