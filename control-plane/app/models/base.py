import enum
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Enum, Boolean, Text
from sqlalchemy.orm import declarative_base, relationship, backref
from sqlalchemy.dialects.postgresql import UUID

Base = declarative_base()

class InstanceStatus(enum.Enum):
    PROVISIONING = "PROVISIONING"
    RUNNING = "RUNNING"
    STOPPED = "STOPPED"
    FAILED = "FAILED"
    DELETING = "DELETING"

class Role(enum.Enum):
    ADMIN = "ADMIN"
    CLIENT = "CLIENT"

class RequestStatus(enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(Role), default=Role.CLIENT, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    tenants = relationship("TenantMember", back_populates="user")

class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    members = relationship("TenantMember", back_populates="tenant")
    quota = relationship("Quota", back_populates="tenant", uselist=False)
    instances = relationship("Instance", back_populates="tenant")

class TenantMember(Base):
    __tablename__ = "tenant_members"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), primary_key=True)
    is_owner = Column(Boolean, default=False)

    user = relationship("User", back_populates="tenants")
    tenant = relationship("Tenant", back_populates="members")

class Quota(Base):
    __tablename__ = "quotas"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), unique=True)
    max_vcpu = Column(Integer, default=4)
    max_ram_mb = Column(Integer, default=8192)
    max_instances = Column(Integer, default=2)

    tenant = relationship("Tenant", back_populates="quota")

class Instance(Base):
    __tablename__ = "instances"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"))
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True) # owner of the instance
    name = Column(String, nullable=False)
    vcpu = Column(Integer, nullable=False)
    ram_mb = Column(Integer, nullable=False)
    image = Column(String, default="ubuntu:22.04")
    status = Column(Enum(InstanceStatus), default=InstanceStatus.PROVISIONING)
    tags = Column(String, default="")
    ip_address = Column(String, nullable=True) # Заполнится после ответа от Go
    created_at = Column(DateTime, default=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="instances")
    creator = relationship("User")

class TenantRequest(Base):
    __tablename__ = "tenant_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)  # optional: request specific tenant
    message = Column(Text, default="")
    status = Column(Enum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    admin_comment = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    user = relationship("User")
    tenant = relationship("Tenant")

class BackupStatus(enum.Enum):
    CREATING = "CREATING"
    READY = "READY"
    RESTORING = "RESTORING"
    FAILED = "FAILED"

class Backup(Base):
    __tablename__ = "backups"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instance_id = Column(UUID(as_uuid=True), ForeignKey("instances.id"), nullable=False)
    name = Column(String, nullable=False)
    snapshot_image = Column(String, nullable=True)  # Docker image tag
    status = Column(Enum(BackupStatus), default=BackupStatus.CREATING, nullable=False)
    size_mb = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    instance = relationship("Instance", backref=backref("backups", cascade="all, delete-orphan"))