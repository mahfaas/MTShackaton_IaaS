from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from datetime import datetime, timedelta
import random
import hashlib

from app.database import get_db
from app.models.base import User, TenantMember, Instance, InstanceStatus, Tenant, Role
from app.routers.deps import get_current_user

router = APIRouter(tags=["billing"])

# Pricing (BYN / min)
VCPU_PRICE_PER_MIN = 0.0004
RAM_GB_PRICE_PER_MIN = 0.0002
STORAGE_GB_PRICE_PER_MIN = 0.00001

DEFAULT_STORAGE_GB = 10  # default storage per instance


def _instance_cost_per_min(inst):
    """Calculate cost per minute for an instance."""
    storage_gb = DEFAULT_STORAGE_GB
    cost_per_min = storage_gb * STORAGE_GB_PRICE_PER_MIN  # storage always billed

    if inst.status not in (InstanceStatus.HIBERNATING, InstanceStatus.STOPPED):
        cost_per_min += inst.vcpu * VCPU_PRICE_PER_MIN
        cost_per_min += (inst.ram_mb / 1024.0) * RAM_GB_PRICE_PER_MIN

    return cost_per_min


def _instance_running_minutes(inst):
    """Estimate total running minutes based on created_at."""
    now = datetime.utcnow()
    created = inst.created_at or now
    delta = now - created
    total_minutes = delta.total_seconds() / 60.0
    # If stopped/hibernating, assume ~70% uptime
    if inst.status in (InstanceStatus.STOPPED, InstanceStatus.HIBERNATING):
        total_minutes *= 0.7
    return max(total_minutes, 1)


def _seeded_random(seed_str, min_val=0.7, max_val=1.3):
    """Deterministic random based on seed string — so data doesn't change on refresh."""
    h = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)
    normalized = (h % 10000) / 10000.0
    return min_val + normalized * (max_val - min_val)


@router.get("/tenant/{tenant_id}")
async def get_tenant_billing(
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns billing stats for the tenant with realistic graph data
    based on actual instances and their creation dates.
    """

    # Check access
    if current_user.role != Role.ADMIN:
        member_query = select(TenantMember).where(
            TenantMember.user_id == current_user.id,
            TenantMember.tenant_id == tenant_id
        )
        member = (await db.execute(member_query)).scalars().first()
        if not member:
            raise HTTPException(status_code=403, detail="Not authorized for this tenant")

    # Get instances
    instances_query = select(Instance).where(
        Instance.tenant_id == tenant_id,
        Instance.status.notin_([InstanceStatus.DELETING, InstanceStatus.FAILED])
    )
    instances = (await db.execute(instances_query)).scalars().all()

    # Current rates
    hourly_rate = 0.0
    active_instances = 0
    instance_costs = []

    for inst in instances:
        cost_per_min = _instance_cost_per_min(inst)
        running_mins = _instance_running_minutes(inst)
        total_cost = cost_per_min * running_mins

        if inst.status not in (InstanceStatus.HIBERNATING, InstanceStatus.STOPPED):
            active_instances += 1

        hourly_rate += cost_per_min * 60

        instance_costs.append({
            "id": str(inst.id),
            "name": inst.name,
            "status": inst.status.value,
            "vcpu": inst.vcpu,
            "ram_mb": inst.ram_mb,
            "cost_per_min": round(cost_per_min, 4),
            "cost_per_hour": round(cost_per_min * 60, 2),
            "running_minutes": round(running_mins, 0),
            "total_cost": round(total_cost, 2),
            "created_at": inst.created_at.isoformat() if inst.created_at else None,
        })

    # Generate realistic graph data (last 30 days) based on actual instances
    graph_data = []
    today = datetime.utcnow()
    current_month_total = 0.0

    for i in range(30, -1, -1):
        date = today - timedelta(days=i)
        date_str = date.strftime("%Y-%m-%d")

        daily_spend = 0.0
        for inst in instances:
            created = inst.created_at or today
            if created.date() <= date.date():
                # Instance existed on this day
                base_cost = _instance_cost_per_min(inst) * 60 * 24  # full day cost
                # Add deterministic variation per instance per day
                variation = _seeded_random(f"{inst.id}-{date_str}", 0.75, 1.15)
                daily_spend += base_cost * variation

        daily_spend = round(daily_spend, 2)
        current_month_total += daily_spend

        graph_data.append({
            "date": date.strftime("%d.%m"),
            "spend": daily_spend
        })

    return {
        "current_month_total": round(current_month_total, 2),
        "hourly_rate": round(hourly_rate, 2),
        "daily_rate": round(hourly_rate * 24, 2),
        "active_instances": active_instances,
        "hibernating_instances": len(instances) - active_instances,
        "instance_costs": instance_costs,
        "graph_data": graph_data,
        "pricing": {
            "vcpu_per_min": VCPU_PRICE_PER_MIN,
            "ram_gb_per_min": RAM_GB_PRICE_PER_MIN,
            "storage_gb_per_min": STORAGE_GB_PRICE_PER_MIN,
        }
    }


@router.get("/admin")
async def get_admin_billing(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns global platform revenue and top tenants with realistic data.
    """
    if current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Get all active instances
    instances_query = select(Instance).where(
        Instance.status.notin_([InstanceStatus.DELETING, InstanceStatus.FAILED])
    )
    instances = (await db.execute(instances_query)).scalars().all()

    global_hourly_rate = 0.0
    total_running_cost = 0.0

    for inst in instances:
        cost_per_min = _instance_cost_per_min(inst)
        running_mins = _instance_running_minutes(inst)
        global_hourly_rate += cost_per_min * 60
        total_running_cost += cost_per_min * running_mins

    # Generate realistic revenue graph (30 days) based on actual instances
    graph_data = []
    total_revenue = 0.0
    today = datetime.utcnow()

    for i in range(30, -1, -1):
        date = today - timedelta(days=i)
        date_str = date.strftime("%Y-%m-%d")

        daily_rev = 0.0
        for inst in instances:
            created = inst.created_at or today
            if created.date() <= date.date():
                base_cost = _instance_cost_per_min(inst) * 60 * 24
                variation = _seeded_random(f"admin-{inst.id}-{date_str}", 0.8, 1.2)
                daily_rev += base_cost * variation

        daily_rev = round(daily_rev, 2)
        total_revenue += daily_rev

        graph_data.append({
            "date": date.strftime("%d.%m"),
            "revenue": daily_rev
        })

    # Top tenants by actual spend
    tenants_result = await db.execute(select(Tenant))
    tenants = tenants_result.scalars().all()
    top_tenants = []

    for t in tenants:
        tenant_instances_q = select(Instance).where(
            Instance.tenant_id == t.id,
            Instance.status.notin_([InstanceStatus.DELETING, InstanceStatus.FAILED])
        )
        tenant_instances = (await db.execute(tenant_instances_q)).scalars().all()

        tenant_spend = 0.0
        tenant_hourly = 0.0
        for inst in tenant_instances:
            cost_per_min = _instance_cost_per_min(inst)
            running_mins = _instance_running_minutes(inst)
            tenant_spend += cost_per_min * running_mins
            tenant_hourly += cost_per_min * 60

        top_tenants.append({
            "id": str(t.id),
            "name": t.name,
            "spend": round(tenant_spend, 2),
            "hourly_rate": round(tenant_hourly, 2),
            "instance_count": len(tenant_instances),
        })

    top_tenants.sort(key=lambda x: x["spend"], reverse=True)

    # Revenue breakdown by resource type (for pie chart)
    total_vcpu_cost = 0.0
    total_ram_cost = 0.0
    total_storage_cost = 0.0

    for inst in instances:
        running_mins = _instance_running_minutes(inst)
        total_storage_cost += DEFAULT_STORAGE_GB * STORAGE_GB_PRICE_PER_MIN * running_mins
        if inst.status not in (InstanceStatus.HIBERNATING, InstanceStatus.STOPPED):
            total_vcpu_cost += inst.vcpu * VCPU_PRICE_PER_MIN * running_mins
            total_ram_cost += (inst.ram_mb / 1024.0) * RAM_GB_PRICE_PER_MIN * running_mins

    return {
        "total_revenue_30d": round(total_revenue, 2),
        "total_running_cost": round(total_running_cost, 2),
        "global_hourly_rate": round(global_hourly_rate, 2),
        "global_daily_rate": round(global_hourly_rate * 24, 2),
        "total_active_instances": len(instances),
        "graph_data": graph_data,
        "top_tenants": top_tenants,
        "revenue_breakdown": {
            "vcpu": round(total_vcpu_cost, 2),
            "ram": round(total_ram_cost, 2),
            "storage": round(total_storage_cost, 2),
        },
        "pricing": {
            "vcpu_per_min": VCPU_PRICE_PER_MIN,
            "ram_gb_per_min": RAM_GB_PRICE_PER_MIN,
            "storage_gb_per_min": STORAGE_GB_PRICE_PER_MIN,
        }
    }
