from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.database import get_db
from app.models.base import User, Tenant, TenantMember, Quota, TenantRequest, RequestStatus
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

class RegisterData(BaseModel):
    email: str
    password: str

@router.post("/register")
async def register(data: RegisterData, db: AsyncSession = Depends(get_db)):
    query = select(User).where(User.email == data.email)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Just create the user — no auto-tenant creation
    new_user = User(email=data.email, hashed_password=get_password_hash(data.password))
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {"message": "User created successfully", "id": new_user.id}

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Find user's tenant membership (if any)
    query = select(TenantMember).where(TenantMember.user_id == current_user.id)
    res = await db.execute(query)
    member = res.scalars().first()
    
    # Check if user has a pending request
    req_query = select(TenantRequest).where(
        TenantRequest.user_id == current_user.id,
        TenantRequest.status == RequestStatus.PENDING
    )
    req_res = await db.execute(req_query)
    pending_request = req_res.scalar_one_or_none()
    
    # Get tenant name if assigned
    tenant_name = None
    if member:
        tenant_query = select(Tenant).where(Tenant.id == member.tenant_id)
        tenant_res = await db.execute(tenant_query)
        tenant = tenant_res.scalar_one_or_none()
        if tenant:
            tenant_name = tenant.name
    
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role.value,
        "tenant_id": member.tenant_id if member else None,
        "tenant_name": tenant_name,
        "has_pending_request": pending_request is not None
    }
