import asyncio
from sqlalchemy import delete, select
from app.database import AsyncSessionLocal
from app.models.base import User, TenantMember, Instance, TenantRequest

async def run():
    async with AsyncSessionLocal() as db:
        admin_email = "admin@iaas.local"
        client_email = "user@iaas.local"
        
        # Get extra user IDs
        res = await db.execute(select(User.id).where(User.email.notin_([admin_email, client_email])))
        extra_user_ids = [row[0] for row in res.fetchall()]
        
        if not extra_user_ids:
            print("No extra users found.")
            return

        # Delete from tenant_requests
        res_tr = await db.execute(delete(TenantRequest).where(TenantRequest.user_id.in_(extra_user_ids)))
        
        # Delete from tenant_members
        res_tm = await db.execute(delete(TenantMember).where(TenantMember.user_id.in_(extra_user_ids)))
        
        # Delete instances created by them
        res_inst = await db.execute(delete(Instance).where(Instance.created_by_id.in_(extra_user_ids)))
        
        # Delete from users
        res_u = await db.execute(delete(User).where(User.id.in_(extra_user_ids)))
        
        await db.commit()
        print(f"Deleted {res_tr.rowcount} tenant_requests, {res_tm.rowcount} tenant_members, {res_inst.rowcount} instances, {res_u.rowcount} users.")

if __name__ == "__main__":
    asyncio.run(run())
