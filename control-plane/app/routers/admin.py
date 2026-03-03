from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.base import User, Role, Tenant, Instance
from app.routers.deps import get_current_user

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
