"""Admin operations for external access."""

from __future__ import annotations

import secrets

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.auth import hash_password
from app.common.db_datetime import utc_naive_plus
from app.models import (
    Customer,
    ExternalAuditLog,
    ExternalCustomerAccess,
    ExternalFinancierAccess,
    ExternalInvitation,
    ExternalPrincipal,
    ExternalPrincipalRole,
    ExternalRole,
    Tenant,
    User,
    Vendor,
)
from app.models.supplier_portal import ExternalSupplierAccess

from app.external_access.audit import log_external_action
from app.external_access.tokens import bump_session_version
from app.external_access.constants import (
    FF_CUSTOMER_NOTES_ENABLED,
    FF_CUSTOMER_PORTAL_ENABLED,
    FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED,
    FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED,
    FF_FINANCIER_PORTAL_ENABLED,
    FF_FINANCIER_PROJECTION_ENABLED,
    PRINCIPAL_CUSTOMER,
    PRINCIPAL_FINANCIER,
    PRINCIPAL_SUPPLIER,
)


def _merge_feature_flags(tenant: Tenant, patch: dict) -> dict:
    base = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    out = {**base}
    for k, v in patch.items():
        if v is None:
            continue
        out[k] = v
    return out


async def patch_tenant_external_flags(db: AsyncSession, tenant: Tenant, patch: dict) -> dict:
    merged = _merge_feature_flags(tenant, patch)
    tenant.feature_flags = merged
    await db.flush()
    return merged


async def create_invitation(
    db: AsyncSession,
    *,
    tenant: Tenant,
    invited_by: User,
    principal_type: str,
    email: str,
    full_name: str,
    payload: dict,
) -> tuple[ExternalInvitation, str]:
    plain = secrets.token_urlsafe(48)
    token_hash = await hash_password(plain)
    expires_at = utc_naive_plus(days=14)
    inv = ExternalInvitation(
        tenant_id=tenant.id,
        principal_type=principal_type,
        email=email.strip(),
        token_hash=token_hash,
        expires_at=expires_at,
        invited_by_user_id=invited_by.id,
        payload_json={
            **payload,
            "full_name": full_name.strip(),
        },
    )
    db.add(inv)
    await db.flush()
    await db.refresh(inv)
    # "<id>.<secret>" lets accept-invite look up one row instead of bcrypt-scanning all pending invites.
    return inv, f"{inv.id}.{plain}"


async def assert_vendors_in_tenant(db: AsyncSession, tenant_id: int, vendor_ids: list[int]) -> None:
    found = (
        await db.execute(select(Vendor.id).where(Vendor.id.in_(vendor_ids), Vendor.tenant_id == tenant_id))
    ).scalars().all()
    if set(found) != set(vendor_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more suppliers are not in your organization")


async def build_principal_row(db: AsyncSession, p: ExternalPrincipal) -> dict:
    result = await db.execute(
        select(ExternalPrincipal)
        .options(
            selectinload(ExternalPrincipal.role_links).selectinload(ExternalPrincipalRole.role),
        )
        .where(ExternalPrincipal.id == p.id)
    )
    p2 = result.scalar_one()
    role_codes: list[str] = []
    for link in p2.role_links:
        if link.role:
            role_codes.append(link.role.code)
    row: dict = {
        "id": p2.id,
        "email": p2.email,
        "full_name": p2.full_name,
        "principal_type": p2.principal_type,
        "is_active": p2.is_active,
        "locked_at": p2.locked_at,
        "last_login_at": p2.last_login_at,
        "accepted_at": p2.accepted_at,
        "role_codes": sorted(set(role_codes)),
        "customer_ids": None,
        "access_scope": None,
        "financier_party_id": None,
        "vendor_ids": None,
    }
    if p2.principal_type == PRINCIPAL_SUPPLIER:
        r = await db.execute(
            select(ExternalSupplierAccess.vendor_id)
            .where(ExternalSupplierAccess.external_principal_id == p2.id)
            .order_by(ExternalSupplierAccess.vendor_id)
        )
        row["vendor_ids"] = [x[0] for x in r.all()]
    elif p2.principal_type == PRINCIPAL_CUSTOMER:
        r = await db.execute(
            select(ExternalCustomerAccess.customer_id).where(
                ExternalCustomerAccess.external_principal_id == p2.id
            )
        )
        row["customer_ids"] = [x[0] for x in r.all()]
    elif p2.principal_type == PRINCIPAL_FINANCIER:
        r = await db.execute(
            select(ExternalFinancierAccess).where(
                ExternalFinancierAccess.external_principal_id == p2.id
            )
        )
        fa = r.scalar_one_or_none()
        if fa:
            row["access_scope"] = fa.access_scope
            row["financier_party_id"] = fa.financier_party_id
    return row


async def sync_principal_roles(db: AsyncSession, principal_id: int, role_codes: list[str]) -> None:
    await db.execute(
        delete(ExternalPrincipalRole).where(ExternalPrincipalRole.external_principal_id == principal_id)
    )
    for code in role_codes:
        code = (code or "").strip()
        if not code:
            continue
        rr = await db.execute(select(ExternalRole).where(ExternalRole.code == code))
        role = rr.scalar_one_or_none()
        if not role:
            continue
        db.add(ExternalPrincipalRole(external_principal_id=principal_id, role_id=role.id))
    await db.flush()


async def update_principal(
    db: AsyncSession,
    tenant: Tenant,
    principal_id: int,
    body,
) -> ExternalPrincipal:
    result = await db.execute(
        select(ExternalPrincipal).where(
            ExternalPrincipal.id == principal_id,
            ExternalPrincipal.tenant_id == tenant.id,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Principal not found")

    if body.full_name is not None:
        p.full_name = body.full_name.strip()
    if body.phone is not None:
        p.phone = (body.phone or "").strip() or None
    if body.is_active is not None:
        if p.is_active and not body.is_active:
            bump_session_version(p)
        p.is_active = body.is_active
    if getattr(body, "clear_lock", None) is True:
        p.locked_at = None
        p.failed_login_count = 0
    if body.role_codes is not None:
        await sync_principal_roles(db, p.id, body.role_codes)

    if p.principal_type == PRINCIPAL_SUPPLIER and getattr(body, "vendor_ids", None) is not None:
        vendor_ids = sorted({int(v) for v in body.vendor_ids})
        if not vendor_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A supplier login needs at least one vendor")
        await assert_vendors_in_tenant(db, tenant.id, vendor_ids)
        await db.execute(delete(ExternalSupplierAccess).where(ExternalSupplierAccess.external_principal_id == p.id))
        for vid in vendor_ids:
            db.add(ExternalSupplierAccess(tenant_id=tenant.id, external_principal_id=p.id, vendor_id=vid))

    if p.principal_type == PRINCIPAL_CUSTOMER and body.customer_ids is not None:
        cids = {int(c) for c in body.customer_ids}
        found = (
            await db.execute(select(Customer.id).where(Customer.id.in_(cids), Customer.tenant_id == tenant.id))
        ).scalars().all()
        if set(found) != cids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more customers are not in your organization")
        await db.execute(
            delete(ExternalCustomerAccess).where(ExternalCustomerAccess.external_principal_id == p.id)
        )
        for cid in body.customer_ids:
            db.add(
                ExternalCustomerAccess(
                    tenant_id=tenant.id,
                    external_principal_id=p.id,
                    customer_id=int(cid),
                    is_primary=False,
                )
            )
    if p.principal_type == PRINCIPAL_FINANCIER:
        if body.access_scope is not None or body.financier_party_id is not None:
            r = await db.execute(
                select(ExternalFinancierAccess).where(
                    ExternalFinancierAccess.external_principal_id == p.id
                )
            )
            fa = r.scalar_one_or_none()
            if fa:
                if body.access_scope is not None:
                    fa.access_scope = body.access_scope
                if body.financier_party_id is not None:
                    fa.financier_party_id = body.financier_party_id
            else:
                db.add(
                    ExternalFinancierAccess(
                        tenant_id=tenant.id,
                        external_principal_id=p.id,
                        financier_party_id=body.financier_party_id,
                        access_scope=body.access_scope or "orders_and_pipeline",
                    )
                )
    await db.flush()
    return p
