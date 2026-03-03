from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime

class QuotaSchema(BaseModel):
    max_vcpu: int
    max_ram_mb: int
    max_instances: int

    class Config:
        from_attributes = True

class TenantBase(BaseModel):
    name: str

class TenantCreate(TenantBase):
    pass

class TenantResponse(TenantBase):
    id: UUID
    created_at: datetime
    quota: Optional[QuotaSchema] = None

    class Config:
        from_attributes = True
