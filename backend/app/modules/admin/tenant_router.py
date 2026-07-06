"""Platform admin: tenant lifecycle and stats."""

from __future__ import annotations

import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.storage import get_media_root
from app.common.tenant_feature_keys import normalize_feature_flags
from app.config import get_settings
from app.common.celery_app import celery_app
from app.database import get_db
from app.models import AuditLog, Customer, Order, PlatformBackgroundJob, PlatformPlan, Tenant, TenantSubscription, User
from app.models.tenant import TenantType
from app.modules.admin.auth import AdminContext, any_admin, client_ip, log_admin_action, super_only
from app.modules.admin.schemas import (
    PaginatedMeta,
    TenantBulkCreateBody,
    TenantCreateBody,
    TenantDetailResponse,
    TenantListItem,
    TenantStatsResponse,
    TenantUpdateBody,
)
from app.modules.admin.tenant_provisioning import provision_tenant_row
from app.modules.audit.service import log_action
from app.common.platform_jobs import JOB_TYPE_BULK_TENANT

router = APIRouter(prefix="/tenants", tags=["platform-admin-tenants"])


def _tenant_dir_size_bytes(tenant_id: int) -> int:
    root = get_media_root() / str(tenant_id)
    if not root.exists():
        return 0
    total = 0
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total


@router.get("")
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
    is_active: bool | None = None,
    include_deleted: bool = False,
    tenant_type: str | None = None,
    sort_by: str | None = None,
    sort_dir: str = "desc",
):
    conditions = []
    if not include_deleted:
        conditions.append(Tenant.deleted_at.is_(None))
    if is_active is not None:
        conditions.append(Tenant.is_active.is_(is_active))
    if tenant_type:
        try:
            tt = TenantType(tenant_type)
            conditions.append(Tenant.tenant_type == tt)
        except ValueError:
            pass
    if search:
        term = f"%{search.strip()}%"
        conditions.append(
            or_(
                Tenant.name.ilike(term),
                Tenant.company_code.ilike(term),
                Tenant.domain.ilike(term),
            )
        )
    total_stmt = select(func.count()).select_from(Tenant)
    if conditions:
        total_stmt = total_stmt.where(and_(*conditions))
    total = (await db.execute(total_stmt)).scalar_one()
    q = select(Tenant)
    if conditions:
        q = q.where(and_(*conditions))
    sort_dir = (sort_dir or "desc").lower()
    asc = sort_dir == "asc"
    if sort_by == "name":
        q = q.order_by(Tenant.name.asc() if asc else Tenant.name.desc())
    elif sort_by == "created_at":
        q = q.order_by(Tenant.created_at.asc() if asc else Tenant.created_at.desc())
    else:
        q = q.order_by(Tenant.id.desc())
    q = q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()
    items = [
        TenantListItem(
            id=t.id,
            name=t.name,
            company_code=t.company_code,
            tenant_type=t.tenant_type,
            is_active=t.is_active,
            deleted_at=t.deleted_at,
            created_at=t.created_at,
        )
        for t in rows
    ]
    return {"items": items, "meta": PaginatedMeta(total=total, page=page, page_size=page_size)}


@router.get("/{tenant_id}", response_model=TenantDetailResponse)
async def get_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return TenantDetailResponse(
        id=t.id,
        name=t.name,
        company_code=t.company_code,
        domain=t.domain,
        tenant_type=t.tenant_type,
        is_active=t.is_active,
        deleted_at=t.deleted_at,
        feature_flags=t.feature_flags,
        country_code=t.country_code,
        timezone=t.timezone,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_tenant_admin(
    body: TenantCreateBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    """Create tenant (admin-initiated). Same default roles as public tenant create."""
    domain = (body.domain or "").strip() or None
    if domain:
        existing = await db.execute(select(Tenant.id).where(Tenant.domain == domain))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Domain already registered")
    tenant = await provision_tenant_row(
        db,
        name=body.name,
        tenant_type=body.tenant_type,
        domain=domain,
        plan_id=None,
    )
    await log_action(db, tenant_id=tenant.id, action="TENANT_CREATE", resource="tenant", details=f"by_admin={ctx.admin.id}")
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_TENANT_CREATE",
        target_tenant_id=tenant.id,
        resource="tenant",
        details=tenant.company_code,
        ip_address=client_ip(request),
    )
    await db.commit()
    await db.refresh(tenant)
    return {"id": tenant.id, "company_code": tenant.company_code, "name": tenant.name}


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_tenants(
    body: TenantBulkCreateBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    """Platform batch tenant onboarding: create many factories with optional plan assignment."""
    if not body.members:
        raise HTTPException(status_code=400, detail="members list is empty")
    if len(body.members) > 200:
        raise HTTPException(status_code=400, detail="Maximum 200 members per bulk request")

    settings = get_settings()
    if settings.platform_bulk_tenant_async_enabled:
        job = PlatformBackgroundJob(
            job_type=JOB_TYPE_BULK_TENANT,
            status="pending",
            admin_id=ctx.admin.id,
            progress_json={"processed": 0, "total": len(body.members), "items": []},
        )
        db.add(job)
        await db.flush()
        members_payload = [
            {"name": m.name, "tenant_type": m.tenant_type.value if hasattr(m.tenant_type, "value") else str(m.tenant_type)}
            for m in body.members
        ]
        task = celery_app.send_task(
            "platform.bulk_create_tenants",
            args=[job.id, members_payload, body.plan_id, ctx.admin.id],
        )
        job.celery_task_id = task.id
        await log_admin_action(
            db,
            admin_id=ctx.admin.id,
            action="ADMIN_TENANT_BULK_CREATE_QUEUED",
            target_tenant_id=None,
            resource="tenant",
            details=f"job_id={job.id} count={len(body.members)}",
            ip_address=client_ip(request),
        )
        await db.commit()
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"job_id": job.id, "status": "pending"})

    created: list[dict] = []
    for item in body.members:
        tenant = await provision_tenant_row(
            db,
            name=item.name,
            tenant_type=item.tenant_type,
            domain=None,
            plan_id=body.plan_id,
        )
        created.append({"id": tenant.id, "company_code": tenant.company_code, "name": tenant.name})
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_TENANT_BULK_CREATE",
        target_tenant_id=None,
        resource="tenant",
        details=f"count={len(created)}",
        ip_address=client_ip(request),
    )
    await db.commit()
    return {"created_count": len(created), "items": created}


@router.get("/bulk-status/{job_id}")
async def bulk_create_job_status(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    job = await db.get(PlatformBackgroundJob, job_id)
    if not job or job.job_type != JOB_TYPE_BULK_TENANT:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.admin_id and job.admin_id != ctx.admin.id and ctx.admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="Not allowed to view this job")
    return {
        "job_id": job.id,
        "job_type": job.job_type,
        "status": job.status,
        "celery_task_id": job.celery_task_id,
        "progress": job.progress_json,
        "result": job.result_json,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
    }


@router.patch("/{tenant_id}")
async def patch_tenant(
    tenant_id: int,
    body: TenantUpdateBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if body.name is not None:
        t.name = body.name.strip()
    if body.domain is not None:
        t.domain = body.domain.strip() or None
    if body.tenant_type is not None:
        t.tenant_type = body.tenant_type
    if body.is_active is not None:
        t.is_active = body.is_active
    if body.feature_flags is not None:
        try:
            t.feature_flags = normalize_feature_flags(body.feature_flags)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_TENANT_UPDATE",
        target_tenant_id=tenant_id,
        resource="tenant",
        ip_address=client_ip(request),
    )
    await db.commit()
    return {"ok": True}


@router.post("/{tenant_id}/suspend")
async def suspend_tenant(
    tenant_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    t.is_active = False
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_TENANT_SUSPEND",
        target_tenant_id=tenant_id,
        resource="tenant",
        ip_address=client_ip(request),
    )
    await db.commit()
    return {"ok": True}


@router.post("/{tenant_id}/reactivate")
async def reactivate_tenant(
    tenant_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    t.is_active = True
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_TENANT_REACTIVATE",
        target_tenant_id=tenant_id,
        resource="tenant",
        ip_address=client_ip(request),
    )
    await db.commit()
    return {"ok": True}


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def soft_delete_tenant(
    tenant_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    t.deleted_at = datetime.utcnow()
    t.is_active = False
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_TENANT_SOFT_DELETE",
        target_tenant_id=tenant_id,
        resource="tenant",
        ip_address=client_ip(request),
    )
    await db.commit()
    return None


@router.get("/{tenant_id}/health")
async def tenant_health(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    last_login = (
        await db.execute(select(func.max(User.last_login)).where(User.tenant_id == tenant_id))
    ).scalar_one()
    api_errorish = (
        await db.execute(
            select(func.count())
            .select_from(AuditLog)
            .where(
                AuditLog.tenant_id == tenant_id,
                AuditLog.response_status.isnot(None),
                AuditLog.response_status >= 500,
            )
        )
    ).scalar_one()
    return {
        "tenant_id": tenant_id,
        "is_active": t.is_active,
        "deleted_at": t.deleted_at,
        "last_user_login": last_login,
        "recent_5xx_request_logs": int(api_errorish or 0),
    }


@router.get("/{tenant_id}/stats", response_model=TenantStatsResponse)
async def tenant_stats(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    user_count = (
        await db.execute(select(func.count()).select_from(User).where(User.tenant_id == tenant_id))
    ).scalar_one()
    order_count = (
        await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id))
    ).scalar_one()
    customer_count = (
        await db.execute(select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id))
    ).scalar_one()
    storage = _tenant_dir_size_bytes(tenant_id)
    return TenantStatsResponse(
        user_count=int(user_count or 0),
        order_count=int(order_count or 0),
        customer_count=int(customer_count or 0),
        storage_bytes_used=storage,
    )


@router.get("/{tenant_id}/entitlements")
async def tenant_entitlements(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    """Effective limits: subscription plan merged with tenant feature_flags (for UI; enforcement stays in app services)."""
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    sub = (
        await db.execute(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    ).scalar_one_or_none()
    plan: PlatformPlan | None = None
    if sub:
        plan = await db.get(PlatformPlan, sub.plan_id)
    tf = t.feature_flags if isinstance(t.feature_flags, dict) else {}
    pm = plan.features_included if plan and isinstance(plan.features_included, dict) else {}
    return {
        "tenant_id": tenant_id,
        "subscription": (
            {
                "id": sub.id,
                "plan_id": sub.plan_id,
                "status": sub.status,
                "billing_cycle": sub.billing_cycle,
            }
            if sub
            else None
        ),
        "plan": (
            {
                "id": plan.id,
                "code": plan.code,
                "name": plan.name,
                "max_users": plan.max_users,
                "max_storage_gb": plan.max_storage_gb,
                "max_ai_tokens_monthly": plan.max_ai_tokens_monthly,
                "support_level": plan.support_level,
                "features_included": plan.features_included,
                "optional_addons": plan.optional_addons,
                "overage_rules": plan.overage_rules,
            }
            if plan
            else None
        ),
        "tenant_feature_flags": tf,
        "effective_modules": {**pm, **tf},
    }
