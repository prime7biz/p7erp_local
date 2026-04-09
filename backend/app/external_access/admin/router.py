"""Tenant admin HTTP API for external access (mounted under /api/v1/settings)."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import ensure_user_is_tenant_admin
from app.common.email_service import send_external_invitation_email
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Customer,
    ExternalAuditLog,
    ExternalInvitation,
    ExternalPrincipal,
    Tenant,
    User,
)
from app.modules.audit.service import log_action

from app.external_access.admin.schemas import (
    ExternalAccessOverviewResponse,
    ExternalAuditListResponse,
    ExternalAuditRow,
    ExternalFeatureFlagsPatch,
    ExternalInviteCustomerRequest,
    ExternalInviteFinancierRequest,
    ExternalInviteResponse,
    ExternalMessageResponse,
    ExternalPrincipalAdminRow,
    ExternalPrincipalListResponse,
    ExternalPrincipalPatchRequest,
)
from app.external_access.admin.service import (
    build_principal_row,
    create_invitation,
    patch_tenant_external_flags,
    update_principal,
)
from app.external_access.audit import log_external_action
from app.external_access.constants import (
    FF_CUSTOMER_NOTES_ENABLED,
    FF_CUSTOMER_PORTAL_ENABLED,
    FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED,
    FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED,
    FF_FINANCIER_PORTAL_ENABLED,
    FF_FINANCIER_PROJECTION_ENABLED,
    PRINCIPAL_CUSTOMER,
    PRINCIPAL_FINANCIER,
)
from app.external_access.feature_flags import (
    is_customer_notes_enabled,
    is_customer_portal_enabled,
    is_external_document_download_enabled,
    is_financier_financial_summary_enabled,
    is_financier_portal_enabled,
    is_financier_projection_enabled,
    require_portal_enabled,
)

router = APIRouter(prefix="/external-access", tags=["settings-external-access"])
logger = logging.getLogger(__name__)


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _send_invite_email_with_fallback(
    *,
    tenant: Tenant,
    principal_type: str,
    email: str,
    full_name: str,
    token: str,
    expires_at: datetime,
) -> tuple[bool, str | None, str]:
    try:
        await send_external_invitation_email(
            to_email=email,
            recipient_name=full_name,
            tenant_name=tenant.name,
            company_code=tenant.company_code,
            principal_type=principal_type,
            invite_token=token,
            expires_at_label=expires_at.strftime("%Y-%m-%d %H:%M"),
        )
    except Exception as exc:
        logger.warning("External invite email send failed for %s (%s): %s", email, principal_type, exc)
        return (
            False,
            token,
            "Invitation created. SMTP email failed, so share the token manually.",
        )
    return True, None, "Invitation email sent."


async def _overview_response(db: AsyncSession, tenant: Tenant) -> ExternalAccessOverviewResponse:
    c1 = await db.execute(
        select(func.count()).select_from(ExternalPrincipal).where(
            ExternalPrincipal.tenant_id == tenant.id,
            ExternalPrincipal.principal_type == PRINCIPAL_CUSTOMER,
        )
    )
    c2 = await db.execute(
        select(func.count()).select_from(ExternalPrincipal).where(
            ExternalPrincipal.tenant_id == tenant.id,
            ExternalPrincipal.principal_type == PRINCIPAL_FINANCIER,
        )
    )
    c3 = await db.execute(
        select(func.count()).select_from(ExternalInvitation).where(
            ExternalInvitation.tenant_id == tenant.id,
            ExternalInvitation.accepted_at.is_(None),
        )
    )
    return ExternalAccessOverviewResponse(
        customer_portal_enabled=is_customer_portal_enabled(tenant),
        financier_portal_enabled=is_financier_portal_enabled(tenant),
        customer_notes_enabled=is_customer_notes_enabled(tenant),
        financier_financial_summary_enabled=is_financier_financial_summary_enabled(tenant),
        financier_projection_enabled=is_financier_projection_enabled(tenant),
        external_portal_document_downloads_enabled=is_external_document_download_enabled(tenant),
        customer_principal_count=int(c1.scalar() or 0),
        financier_principal_count=int(c2.scalar() or 0),
        pending_invitation_count=int(c3.scalar() or 0),
    )


@router.get("/overview", response_model=ExternalAccessOverviewResponse)
async def external_access_overview(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    return await _overview_response(db, tenant)


@router.patch("/feature-flags", response_model=ExternalAccessOverviewResponse)
async def external_access_feature_flags_patch(
    body: ExternalFeatureFlagsPatch,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)

    patch = {
        FF_CUSTOMER_PORTAL_ENABLED: body.customer_portal_enabled,
        FF_FINANCIER_PORTAL_ENABLED: body.financier_portal_enabled,
        FF_CUSTOMER_NOTES_ENABLED: body.customer_notes_enabled,
        FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED: body.financier_financial_summary_enabled,
        FF_FINANCIER_PROJECTION_ENABLED: body.financier_projection_enabled,
        FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED: body.external_portal_document_downloads_enabled,
    }
    await patch_tenant_external_flags(db, tenant, patch)
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="EXTERNAL_ACCESS_FLAGS_UPDATE",
        resource="tenant",
        details=str({k: v for k, v in patch.items() if v is not None}),
    )
    await db.refresh(tenant)
    return await _overview_response(db, tenant)


async def _list_principals(
    db: AsyncSession,
    tenant: Tenant,
    principal_type: str,
    limit: int,
    offset: int,
) -> tuple[list[ExternalPrincipal], int]:
    q = select(ExternalPrincipal).where(
        ExternalPrincipal.tenant_id == tenant.id,
        ExternalPrincipal.principal_type == principal_type,
    )
    total_r = await db.execute(
        select(func.count()).select_from(ExternalPrincipal).where(
            ExternalPrincipal.tenant_id == tenant.id,
            ExternalPrincipal.principal_type == principal_type,
        )
    )
    total = int(total_r.scalar() or 0)
    q = q.order_by(ExternalPrincipal.id.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    return list(result.scalars().all()), total


@router.get("/customers", response_model=ExternalPrincipalListResponse)
async def list_customer_principals(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    rows, total = await _list_principals(db, tenant, PRINCIPAL_CUSTOMER, limit, offset)
    items = [ExternalPrincipalAdminRow(**await build_principal_row(db, p)) for p in rows]
    return ExternalPrincipalListResponse(items=items, total=total)


@router.get("/financiers", response_model=ExternalPrincipalListResponse)
async def list_financier_principals(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    rows, total = await _list_principals(db, tenant, PRINCIPAL_FINANCIER, limit, offset)
    items = [ExternalPrincipalAdminRow(**await build_principal_row(db, p)) for p in rows]
    return ExternalPrincipalListResponse(items=items, total=total)


@router.post("/customers/invite", response_model=ExternalInviteResponse)
async def invite_customer_principal(
    body: ExternalInviteCustomerRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    require_portal_enabled(tenant=tenant, principal_type=PRINCIPAL_CUSTOMER)

    for cid in body.customer_ids:
        if cid < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid customer ID: {cid}",
            )
        cr = await db.execute(
            select(Customer.id).where(
                Customer.id == cid,
                Customer.tenant_id == tenant.id,
            )
        )
        if cr.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Customer ID {cid} not found in your organization",
            )

    inv, plain = await create_invitation(
        db,
        tenant=tenant,
        invited_by=user,
        principal_type=PRINCIPAL_CUSTOMER,
        email=str(body.email),
        full_name=body.full_name,
        payload={"role_codes": body.role_codes, "customer_ids": body.customer_ids},
    )
    await log_external_action(
        db,
        tenant_id=tenant.id,
        action="EXTERNAL_INVITE_CREATED",
        resource_type="external_invitation",
        resource_id=inv.id,
        internal_user_id=user.id,
        details={"principal_type": PRINCIPAL_CUSTOMER, "email": body.email},
    )
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="EXTERNAL_INVITE_CUSTOMER",
        resource="external_invitation",
        details=str(inv.id),
    )
    invite_email_sent, invite_token, message = await _send_invite_email_with_fallback(
        tenant=tenant,
        principal_type=PRINCIPAL_CUSTOMER,
        email=str(body.email),
        full_name=body.full_name,
        token=plain,
        expires_at=inv.expires_at,
    )
    return ExternalInviteResponse(
        invitation_id=inv.id,
        expires_at=inv.expires_at,
        invite_token=invite_token,
        invite_email_sent=invite_email_sent,
        message=message,
    )


@router.post("/financiers/invite", response_model=ExternalInviteResponse)
async def invite_financier_principal(
    body: ExternalInviteFinancierRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    require_portal_enabled(tenant=tenant, principal_type=PRINCIPAL_FINANCIER)

    if body.financier_party_id is not None:
        pr = await db.execute(
            select(ExternalPrincipal.id).where(
                ExternalPrincipal.id == body.financier_party_id,
                ExternalPrincipal.tenant_id == tenant.id,
            )
        )
        if pr.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Financier party ID {body.financier_party_id} not found",
            )

    inv, plain = await create_invitation(
        db,
        tenant=tenant,
        invited_by=user,
        principal_type=PRINCIPAL_FINANCIER,
        email=str(body.email),
        full_name=body.full_name,
        payload={
            "role_codes": body.role_codes,
            "access_scope": body.access_scope,
            "financier_party_id": body.financier_party_id,
        },
    )
    await log_external_action(
        db,
        tenant_id=tenant.id,
        action="EXTERNAL_INVITE_CREATED",
        resource_type="external_invitation",
        resource_id=inv.id,
        internal_user_id=user.id,
        details={"principal_type": PRINCIPAL_FINANCIER, "email": body.email},
    )
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="EXTERNAL_INVITE_FINANCIER",
        resource="external_invitation",
        details=str(inv.id),
    )
    invite_email_sent, invite_token, message = await _send_invite_email_with_fallback(
        tenant=tenant,
        principal_type=PRINCIPAL_FINANCIER,
        email=str(body.email),
        full_name=body.full_name,
        token=plain,
        expires_at=inv.expires_at,
    )
    return ExternalInviteResponse(
        invitation_id=inv.id,
        expires_at=inv.expires_at,
        invite_token=invite_token,
        invite_email_sent=invite_email_sent,
        message=message,
    )


@router.patch("/customers/{principal_id}", response_model=ExternalPrincipalAdminRow)
async def patch_customer_principal(
    principal_id: int,
    body: ExternalPrincipalPatchRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    p = await update_principal(db, tenant, principal_id, body)
    if p.principal_type != PRINCIPAL_CUSTOMER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a customer principal")
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="EXTERNAL_PRINCIPAL_UPDATE",
        resource="external_principal",
        details=f"customer:{principal_id}",
    )
    return ExternalPrincipalAdminRow(**await build_principal_row(db, p))


@router.patch("/financiers/{principal_id}", response_model=ExternalPrincipalAdminRow)
async def patch_financier_principal(
    principal_id: int,
    body: ExternalPrincipalPatchRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    p = await update_principal(db, tenant, principal_id, body)
    if p.principal_type != PRINCIPAL_FINANCIER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a financier principal")
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="EXTERNAL_PRINCIPAL_UPDATE",
        resource="external_principal",
        details=f"financier:{principal_id}",
    )
    return ExternalPrincipalAdminRow(**await build_principal_row(db, p))


@router.get("/audit", response_model=ExternalAuditListResponse)
async def list_external_audit(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)

    total_r = await db.execute(
        select(func.count()).select_from(ExternalAuditLog).where(ExternalAuditLog.tenant_id == tenant.id)
    )
    total = int(total_r.scalar() or 0)
    result = await db.execute(
        select(ExternalAuditLog)
        .where(ExternalAuditLog.tenant_id == tenant.id)
        .order_by(ExternalAuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = result.scalars().all()
    items = [
        ExternalAuditRow(
            id=r.id,
            action=r.action,
            resource_type=r.resource_type,
            resource_id=r.resource_id,
            external_principal_id=r.external_principal_id,
            internal_user_id=r.internal_user_id,
            created_at=r.created_at,
            details_json=r.details_json if isinstance(r.details_json, dict) else None,
        )
        for r in rows
    ]
    return ExternalAuditListResponse(items=items, total=total)


@router.post("/principals/{principal_id}/deactivate", response_model=ExternalMessageResponse)
async def deactivate_external_principal(
    principal_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    p = await update_principal(
        db,
        tenant,
        principal_id,
        ExternalPrincipalPatchRequest(is_active=False),
    )
    await log_external_action(
        db,
        tenant_id=tenant.id,
        action="EXTERNAL_PRINCIPAL_DEACTIVATED",
        resource_type="external_principal",
        resource_id=p.id,
        internal_user_id=user.id,
    )
    return ExternalMessageResponse(message="Deactivated")


@router.post("/principals/{principal_id}/reactivate", response_model=ExternalMessageResponse)
async def reactivate_external_principal(
    principal_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    p = await update_principal(
        db,
        tenant,
        principal_id,
        ExternalPrincipalPatchRequest(is_active=True),
    )
    await log_external_action(
        db,
        tenant_id=tenant.id,
        action="EXTERNAL_PRINCIPAL_REACTIVATED",
        resource_type="external_principal",
        resource_id=p.id,
        internal_user_id=user.id,
    )
    return ExternalMessageResponse(message="Reactivated")
