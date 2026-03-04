import asyncio
import uuid
from sqlalchemy.future import select
from app.database import AsyncSessionLocal
from app.models.base import User, Role, Tenant, TenantMember, Quota
from app.core.security import get_password_hash

async def seed():
    async with AsyncSessionLocal() as db:
        # Check if already seeded
        res = await db.execute(select(User).limit(1))
        if res.scalar_one_or_none():
            print("Database already seeded!")
            return

        # Create Admin
        admin_email = "admin@iaas.local"
        admin_user = User(email=admin_email, hashed_password=get_password_hash("admin"), role=Role.ADMIN)
        db.add(admin_user)
        
        # Create Client user (already assigned to a tenant for demo)
        client_email = "user@iaas.local"
        client_user = User(email=client_email, hashed_password=get_password_hash("user"), role=Role.CLIENT)
        db.add(client_user)

        # Create Tenant (admin creates tenants)
        tenant_uuid = uuid.UUID("123e4567-e89b-12d3-a456-426614174000")
        tenant = Tenant(id=tenant_uuid, name="MTS Cloud Project")
        db.add(tenant)
        await db.flush()

        # Admin assigns client user to tenant
        db.add(TenantMember(user_id=client_user.id, tenant_id=tenant.id, is_owner=False))

        # Create Quota for the tenant
        quota = Quota(
            tenant_id=tenant.id,
            max_vcpu=16,
            max_ram_mb=32768,
            max_instances=5
        )
        db.add(quota)

        await db.commit()
        print("✅ DB Seeded Successfully!")
        print(f"🔹 Administrator: {admin_email} / admin")
        print(f"🔹 Client: {client_email} / user")
        print(f"🔹 Tenant: {tenant.name} (ID: {tenant.id})")

if __name__ == "__main__":
    asyncio.run(seed())
