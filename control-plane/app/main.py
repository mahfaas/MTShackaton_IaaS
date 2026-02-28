from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from pydantic import BaseModel
import uuid

from app.database import get_db, engine
from app.models.base import Base, Instance, InstanceStatus, Tenant, Quota
from app.grpc_client import provision_instance_via_grpc

app = FastAPI(title="IaaS Control Plane API")

# Схемы Pydantic для валидации (в реальном проекте выносим в schemas.py)
class InstanceCreateRequest(BaseModel):
    tenant_id: str
    name: str
    vcpu: int
    ram_mb: int
    image: str = "ubuntu:latest"

@app.on_event("startup")
async def startup():
    # Создаем таблицы при старте (для хакатона можно без Alembic ради скорости)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.post("/api/v1/instances")
async def create_instance(req: InstanceCreateRequest, db: AsyncSession = Depends(get_db)):
    tenant_uuid = uuid.UUID(req.tenant_id)

    # 1. Транзакция: Проверка квот
    query = select(Quota).where(Quota.tenant_id == tenant_uuid)
    result = await db.execute(query)
    quota = result.scalar_one_or_none()
    
    if not quota:
        raise HTTPException(status_code=404, detail="Tenant quota not found")

    # Считаем текущее потребление ресурсов
    usage_query = select(
        func.sum(Instance.vcpu).label("used_vcpu"),
        func.sum(Instance.ram_mb).label("used_ram"),
        func.count(Instance.id).label("used_instances")
    ).where(Instance.tenant_id == tenant_uuid, Instance.status != InstanceStatus.FAILED)
    
    usage_result = await db.execute(usage_query)
    usage = usage_result.one()

    used_vcpu = usage.used_vcpu or 0
    used_ram = usage.used_ram or 0
    used_instances = usage.used_instances or 0

    # 2. Логика проверки (хватает ли места?)
    if used_instances + 1 > quota.max_instances:
        raise HTTPException(status_code=400, detail="Instance count quota exceeded")
    if used_vcpu + req.vcpu > quota.max_vcpu:
        raise HTTPException(status_code=400, detail="vCPU quota exceeded")
    if used_ram + req.ram_mb > quota.max_ram_mb:
        raise HTTPException(status_code=400, detail="RAM quota exceeded")

    # 3. Резервируем ресурсы (State: PROVISIONING)
    new_instance = Instance(
        tenant_id=tenant_uuid,
        name=req.name,
        vcpu=req.vcpu,
        ram_mb=req.ram_mb,
        status=InstanceStatus.PROVISIONING
    )
    db.add(new_instance)
    await db.commit()
    await db.refresh(new_instance)

    # 4. Отправляем асинхронную команду в Go-микросервис
    grpc_result = await provision_instance_via_grpc(
        instance_id=str(new_instance.id),
        vcpu=req.vcpu,
        ram_mb=req.ram_mb,
        image=req.image
    )

    # 5. Обрабатываем ответ от воркера
    if grpc_result["success"]:
        new_instance.status = InstanceStatus.RUNNING
        new_instance.ip_address = grpc_result["ip_address"]
    else:
        new_instance.status = InstanceStatus.FAILED
        # Здесь мы не удаляем запись, а ставим FAILED, чтобы квота (в шаге 2) освободилась 
        # (обрати внимание, в usage_query мы игнорируем FAILED).
        print(f"Provisioning failed: {grpc_result['message']}")

    db.add(new_instance)
    await db.commit()

    return {"id": new_instance.id, "status": new_instance.status.value, "ip_address": new_instance.ip_address}