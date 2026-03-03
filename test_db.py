import asyncio
from sqlalchemy.future import select
from app.database import AsyncSessionLocal
from app.models.base import User, TenantMember, Quota
from app.core.security import get_password_hash

async def test():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User))
        users = res.scalars().all()
        for u in users:
            print(f"User: {u.id} - {u.email} - {u.role}")

            mem_query = select(TenantMember).where(TenantMember.user_id == u.id)
            mems = (await db.execute(mem_query)).scalars().all()
            for m in mems:
                print(f"  Tenant: {m.tenant_id}")
                q_query = select(Quota).where(Quota.tenant_id == m.tenant_id)
                q = (await db.execute(q_query)).scalar_one_or_none()
                print(f"    Quota: {q.max_vcpu if q else 'NONE'}")

if __name__ == "__main__":
    asyncio.run(test())
