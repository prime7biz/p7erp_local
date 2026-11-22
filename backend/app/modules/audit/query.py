"""Shared tenant-scoped audit list queries for Settings User Activity."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.geoip_lookup import lookup_ip_location
from app.models import AuditLog, User
from app.modules.audit.service import (
    APPROVAL_ACTIONS_SUFFIXES,
    AUDIT_CATEGORIES,
    AUTH_ACTIONS,
    REPORT_ACTIONS,
    TECHNICAL_ACTIONS,
)
from app.modules.settings.schemas import SettingsAuditLogListResponse, SettingsAuditLogRow


def _user_full_name(first_name: str | None, last_name: str | None) -> str | None:
    parts = [p.strip() for p in (first_name or "", last_name or "") if p and p.strip()]
    if not parts:
        return None
    return " ".join(parts)


def build_audit_filters(
    *,
    tenant_id: int,
    action: str | None = None,
    resource: str | None = None,
    user_id: int | None = None,
    search: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    category: str | None = None,
    ip_address: str | None = None,
) -> list:
    """Build allowlisted filters. Technical API rows are always excluded for tenant UIs."""
    filters: list = [
        AuditLog.tenant_id == tenant_id,
        AuditLog.action.notin_(tuple(TECHNICAL_ACTIONS)),
    ]
    if action:
        filters.append(AuditLog.action == action.strip()[:64])
    if resource:
        filters.append(AuditLog.resource == resource.strip()[:64])
    if user_id is not None:
        filters.append(AuditLog.user_id == int(user_id))
    if search:
        needle = search.strip().lower()[:200]
        if needle:
            filters.append(func.lower(func.coalesce(AuditLog.details, "")).like(f"%{needle}%"))
    if created_from is not None:
        filters.append(AuditLog.created_at >= created_from)
    if created_to is not None:
        filters.append(AuditLog.created_at <= created_to)
    if ip_address:
        filters.append(AuditLog.ip_address == ip_address.strip()[:45])

    cat = (category or "").strip().lower()
    if cat:
        if cat not in AUDIT_CATEGORIES:
            # Invalid category -> empty result rather than open filter injection.
            filters.append(AuditLog.id == -1)
        elif cat == "auth":
            filters.append(AuditLog.action.in_(tuple(AUTH_ACTIONS)))
        elif cat == "report":
            filters.append(AuditLog.action.in_(tuple(REPORT_ACTIONS)))
        elif cat == "approval":
            filters.append(
                or_(
                    AuditLog.action.like("voucher.%"),
                    *[AuditLog.action.ilike(f"%{suf}") for suf in APPROVAL_ACTIONS_SUFFIXES],
                    AuditLog.action.ilike("%.approve"),
                    AuditLog.action.ilike("%approve%"),
                )
            )
        elif cat == "data":
            filters.append(AuditLog.action.notin_(tuple(AUTH_ACTIONS | REPORT_ACTIONS | TECHNICAL_ACTIONS)))
            filters.append(~AuditLog.action.like("voucher.%"))
            # Exclude common approval-looking actions from the "data" bucket.
            for suf in APPROVAL_ACTIONS_SUFFIXES:
                filters.append(~AuditLog.action.ilike(f"%{suf}"))
    return filters


async def list_tenant_audit_logs(
    db: AsyncSession,
    *,
    tenant_id: int,
    limit: int,
    offset: int,
    action: str | None = None,
    resource: str | None = None,
    user_id: int | None = None,
    search: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    category: str | None = None,
    ip_address: str | None = None,
) -> SettingsAuditLogListResponse:
    filters = build_audit_filters(
        tenant_id=tenant_id,
        action=action,
        resource=resource,
        user_id=user_id,
        search=search,
        created_from=created_from,
        created_to=created_to,
        category=category,
        ip_address=ip_address,
    )

    total_result = await db.execute(select(func.count()).select_from(AuditLog).where(*filters))
    total = int(total_result.scalar() or 0)

    # Join user only within the same tenant so cross-tenant user ids never leak names.
    result = await db.execute(
        select(
            AuditLog,
            User.username,
            User.first_name,
            User.last_name,
        )
        .outerjoin(
            User,
            and_(User.id == AuditLog.user_id, User.tenant_id == AuditLog.tenant_id),
        )
        .where(*filters)
        .order_by(desc(AuditLog.created_at), desc(AuditLog.id))
        .limit(limit)
        .offset(offset)
    )
    rows = result.all()
    items = [
        SettingsAuditLogRow(
            id=r.AuditLog.id,
            tenant_id=r.AuditLog.tenant_id,
            user_id=r.AuditLog.user_id,
            username=r.username,
            full_name=_user_full_name(r.first_name, r.last_name),
            action=r.AuditLog.action,
            resource=r.AuditLog.resource,
            details=r.AuditLog.details,
            ip_address=r.AuditLog.ip_address,
            user_agent=r.AuditLog.user_agent,
            location=lookup_ip_location(r.AuditLog.ip_address),
            created_at=r.AuditLog.created_at,
        )
        for r in rows
    ]
    return SettingsAuditLogListResponse(items=items, total=total, limit=limit, offset=offset)
