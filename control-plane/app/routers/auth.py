from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.database import get_db
from app.models.base import User, Tenant, TenantMember, Quota
from app.core.security import verify_password, create_access_token, get_password_hash
from app.schemas.user import Token
from app.routers.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    query = select(User).where(User.email == form_data.username)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

# Вспомогательный эндпоинт для регистрации 
class RegisterData(BaseModel):
    email: str
    password: str

@router.post("/register")
async def register(data: RegisterData, db: AsyncSession = Depends(get_db)):
    query = select(User).where(User.email == data.email)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = User(email=data.email, hashed_password=get_password_hash(data.password))
    db.add(new_user)
    
    # Auto-provision Tenant and Quota to fix the "NaN/NaN" issue on the frontend
    tenant_name = data.email.split('@')[0] + "-tenant"
    new_tenant = Tenant(name=tenant_name)
    db.add(new_tenant)
    await db.flush() # flush to get new_tenant.id without committing
    
    tenant_member = TenantMember(user_id=new_user.id, tenant_id=new_tenant.id, is_owner=True)
    db.add(tenant_member)
    
    default_quota = Quota(tenant_id=new_tenant.id, max_vcpu=4, max_ram_mb=8192, max_instances=2)
    db.add(default_quota)

    await db.commit()
    await db.refresh(new_user)
    return {"message": "User created successfully", "id": new_user.id}

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.base import TenantMember
    # Fetch user's first tenant for the hackathon (simplification)
    query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    res = await db.execute(query)
    member = res.scalars().first()
    
    # Auto-provision tenant and quota for users without one (fixes 0/0 quotas)
    if not member:
        tenant_name = current_user.email.split('@')[0] + "-tenant"
        # Check if tenant name already exists (avoid unique constraint violation)
        existing = await db.execute(select(Tenant).where(Tenant.name == tenant_name))
        tenant = existing.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(name=tenant_name)
            db.add(tenant)
            await db.flush()
        
        member = TenantMember(user_id=current_user.id, tenant_id=tenant.id, is_owner=True)
        db.add(member)
        
        # Create quota if not exists
        quota_check = await db.execute(select(Quota).where(Quota.tenant_id == tenant.id))
        if not quota_check.scalar_one_or_none():
            db.add(Quota(tenant_id=tenant.id, max_vcpu=4, max_ram_mb=8192, max_instances=2))
        
        await db.commit()
    
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role.value,
        "tenant_id": member.tenant_id if member else None
    }
