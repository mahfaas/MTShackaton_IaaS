from pydantic import BaseModel, Field, validator
from typing import Optional
from uuid import UUID
from datetime import datetime

class InstanceBase(BaseModel):
    name: str
    vcpu: int = Field(gt=0, le=16)
    ram_mb: int = Field(gt=0, le=32768)
    image: str = "ubuntu:22.04"

    @validator("image")
    def validate_image(cls, v):
        allowed_images = ["ubuntu:22.04", "alpine:3.18", "debian:12", "ubuntu:latest", "alpine:latest"]
        if v not in allowed_images:
            raise ValueError(f"Image {v} not allowed. Please use one of {allowed_images}")
        return v

class InstanceCreateRequest(InstanceBase):
    tenant_id: UUID

class InstanceResponse(InstanceBase):
    id: UUID
    tenant_id: UUID
    status: str
    ip_address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
