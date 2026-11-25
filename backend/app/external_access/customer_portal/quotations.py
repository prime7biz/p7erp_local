"""Customer portal: buyers see SENT quotations and answer ACCEPT / REQUEST_REVISION.

Behind tenant flag ``customer_portal_quotations_enabled`` (strict, default OFF).
- Only the CURRENT (not superseded) SENT quotations of the principal's allowed customers are visible.
- A response is recorded and staff are told; it never changes the quotation status.
- Buyer-safe fields only: no costs, margins, commission, notes or internal ids beyond the quotation id.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.document_history import record_doc_event
from app.common.tenant_feature_keys import is_customer_portal_quotations_enabled
from app.database import get_db, safe_async_session_rollback
from app.external_access.audit import log_external_action
from app.external_access.deps import get_allowed_customer_ids, require_customer_external
from app.external_access.permissions import customer_can_add_notes, get_role_codes, require_customer_portal_roles
from app.models import ExternalPrincipal, Role, Tenant, User
from app.models.external_access import ExternalQuotationResponse
from app.models.merch import Quotation
from app.modules.notifications.service import notify_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["external-customer"])

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_NOTIFY_ROLE_NAMES = ("admin", "manager", "owner", "merchandiser", "merchandising", "merch")
MAX_NOTIFY_USERS = 30


class PortalQuotationOut(BaseModel):
    """Whitelist of what a buyer may see. Never add cost, margin, commission, notes or customer fields."""

    id: int
    quotation_code: str
    version_no: int
    status: str
    style_ref: str | None = None
    quantity: int | None = None
    quoted_unit_price: str | None = None
    total_amount: str | None = None
    currency: str | None = None
    valid_until: date | None = None
    my_last_response: Literal["ACCEPT", "REQUEST_REVISION"] | None = None


class PortalQuotationListOut(BaseModel):
    items: list[PortalQuotationOut]
    total: int


class QuotationResponseBody(BaseModel):
    response_type: Literal["ACCEPT", "REQUEST_REVISION"]
    note: str | None = Field(default=None, max_length=1000)
    request_id: str = Field(min_length=8, max_length=64)

    @field_validator("request_id")
    @classmethod
    def _request_id_shape(cls, v: str) -> str:
        if not _REQUEST_ID_RE.fullmatch(v):
            raise ValueError("request_id must be 8-64 letters, digits, '_' or '-'")
        return v

    @field_validator("note")
    @classmethod
    def _clean_note(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


class QuotationResponseOut(BaseModel):
    id: int
    quotation_id: int
    response_type: str
    note: str | None
    created_at: datetime
    replayed: bool = False


def _money(value: object) -> str | None:
    return None if value is None else f"{value:.4f}"


def _quoted_unit_price(q: Quotation) -> str | None:
    """Order-total quoted_price / quantity → per-piece unit price for buyers."""
    from decimal import Decimal, ROUND_HALF_UP

    qty = q.projected_quantity or 0
    if q.costing_basis is not None and q.quoted_price_per_piece is not None:
        # Dozen-first quotation: the per-piece price is stored, so it needs no quantity.
        return _money(q.quoted_price_per_piece)
    raw = q.total_amount if q.total_amount is not None else q.quoted_price
    if raw is None or qty <= 0:
        return None
    try:
        total = Decimal(str(raw))
    except Exception:
        return None
    return f"{(total / Decimal(qty)).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP):.4f}"


def _quoted_total_amount(q: Quotation) -> str | None:
    """Order total for buyers; a dozen-first quotation without a quantity has no order total yet."""
    if q.costing_basis is not None and (q.projected_quantity or 0) <= 0:
        return None
    return _money(q.total_amount if q.total_amount is not None else q.quoted_price)


def _to_out(q: Quotation, last_response: str | None) -> PortalQuotationOut:
    return PortalQuotationOut(
        id=q.id,
        quotation_code=q.quotation_code,
        version_no=q.version_no,
        status=q.status,
        style_ref=q.style_ref,
        quantity=q.projected_quantity,
        quoted_unit_price=_quoted_unit_price(q),
        total_amount=_quoted_total_amount(q),
        currency=q.currency,
        valid_until=q.valid_until,
        my_last_response=last_response,  # type: ignore[arg-type]
    )


async def _require_enabled_and_role(db: AsyncSession, principal: ExternalPrincipal) -> Tenant:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == principal.tenant_id))).scalar_one_or_none()
    if tenant is None or not is_customer_portal_quotations_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Quotations are not enabled for this portal")
    await require_customer_portal_roles(await get_role_codes(db, principal))
    return tenant


def _visible_filters(principal: ExternalPrincipal, customer_ids: list[int]):  # noqa: ANN202
    return (
        Quotation.tenant_id == principal.tenant_id,
        Quotation.customer_id.in_(customer_ids),
        Quotation.status == "SENT",
        Quotation.superseded_at.is_(None),
    )


async def _last_responses(db: AsyncSession, principal: ExternalPrincipal, quotation_ids: list[int]) -> dict[int, str]:
    if not quotation_ids:
        return {}
    rows = (
        await db.execute(
            select(ExternalQuotationResponse.quotation_id, ExternalQuotationResponse.response_type)
            .where(
                ExternalQuotationResponse.tenant_id == principal.tenant_id,
                ExternalQuotationResponse.external_principal_id == principal.id,
                ExternalQuotationResponse.quotation_id.in_(quotation_ids),
            )
            .order_by(ExternalQuotationResponse.id.asc())
        )
    ).all()
    return {qid: rtype for qid, rtype in rows}  # later rows win


async def _get_visible(db: AsyncSession, principal: ExternalPrincipal, quotation_id: int, *, lock: bool = False) -> Quotation:
    customer_ids = await get_allowed_customer_ids(db, principal)
    if not customer_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    stmt = select(Quotation).where(Quotation.id == quotation_id, *_visible_filters(principal, customer_ids))
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    quotation = (await db.execute(stmt)).scalar_one_or_none()
    if quotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    return quotation


async def _staff_user_ids(db: AsyncSession, tenant_id: int) -> list[int]:
    """Admin / manager / merchandising users: by role name, or a role that explicitly grants merch access."""
    try:
        rows = (
            await db.execute(
                select(User.id, Role.name, Role.permissions)
                .join(Role, Role.id == User.role_id)
                .where(User.tenant_id == tenant_id, User.is_active.is_(True))
                .order_by(User.id)
                .limit(500)
            )
        ).all()
    except Exception:
        logger.exception("portal_quotation_notify_lookup_failed tenant_id=%s", tenant_id)
        await safe_async_session_rollback(db)
        return []
    out: list[int] = []
    for uid, role_name, perms in rows:
        perms = perms if isinstance(perms, dict) else {}
        if (
            (role_name or "").strip().lower() in _NOTIFY_ROLE_NAMES
            or perms.get("merch.access") is True
            or perms.get("merch.*") is True
        ):
            out.append(uid)
        if len(out) >= MAX_NOTIFY_USERS:
            break
    return out

@router.get("/quotations", response_model=PortalQuotationListOut)
async def portal_list_quotations(
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    await _require_enabled_and_role(db, principal)
    customer_ids = await get_allowed_customer_ids(db, principal)
    if not customer_ids:
        return PortalQuotationListOut(items=[], total=0)
    filters = _visible_filters(principal, customer_ids)
    total = (await db.execute(select(func.count(Quotation.id)).where(*filters))).scalar_one()
    rows = list(
        (
            await db.execute(
                select(Quotation).where(*filters).order_by(Quotation.id.desc()).limit(limit).offset(offset)
            )
        ).scalars()
    )
    last = await _last_responses(db, principal, [q.id for q in rows])
    return PortalQuotationListOut(items=[_to_out(q, last.get(q.id)) for q in rows], total=int(total))


@router.get("/quotations/{quotation_id}", response_model=PortalQuotationOut)
async def portal_get_quotation(
    quotation_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _require_enabled_and_role(db, principal)
    quotation = await _get_visible(db, principal, quotation_id)
    last = await _last_responses(db, principal, [quotation.id])
    return _to_out(quotation, last.get(quotation.id))


@router.post("/quotations/{quotation_id}/response", response_model=QuotationResponseOut, status_code=201)
async def portal_respond_to_quotation(
    quotation_id: int,
    body: QuotationResponseBody,
    response: Response,
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _require_enabled_and_role(db, principal)
    if not customer_can_add_notes(await get_role_codes(db, principal)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to respond to quotations")
    if body.response_type == "REQUEST_REVISION" and not body.note:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Please say what should change")

    # Lock the quotation first: a double-submit waits here and then finds the stored response.
    quotation = await _get_visible(db, principal, quotation_id, lock=True)

    existing = (
        await db.execute(
            select(ExternalQuotationResponse).where(
                ExternalQuotationResponse.tenant_id == principal.tenant_id,
                ExternalQuotationResponse.external_principal_id == principal.id,
                ExternalQuotationResponse.request_id == body.request_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.quotation_id != quotation.id or existing.response_type != body.response_type:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="request_id was already used")
        response.status_code = status.HTTP_200_OK
        return QuotationResponseOut(
            id=existing.id,
            quotation_id=existing.quotation_id,
            response_type=existing.response_type,
            note=existing.note,
            created_at=existing.created_at,
            replayed=True,
        )

    already_accepted = (
        await db.execute(
            select(func.count(ExternalQuotationResponse.id)).where(
                ExternalQuotationResponse.tenant_id == principal.tenant_id,
                ExternalQuotationResponse.quotation_id == quotation.id,
                ExternalQuotationResponse.response_type == "ACCEPT",
            )
        )
    ).scalar_one()
    if already_accepted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This quotation was already accepted")

    row = ExternalQuotationResponse(
        tenant_id=principal.tenant_id,
        quotation_id=quotation.id,
        external_principal_id=principal.id,
        customer_id=quotation.customer_id,
        response_type=body.response_type,
        note=body.note,
        request_id=body.request_id,
    )
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate response") from None

    verb = "accepted" if body.response_type == "ACCEPT" else "asked for a revision of"
    await log_external_action(
        db,
        tenant_id=principal.tenant_id,
        action=f"EXTERNAL_QUOTATION_{body.response_type}",
        resource_type="quotation",
        resource_id=quotation.id,
        external_principal_id=principal.id,
        details={"response_id": row.id, "has_note": bool(body.note)},
    )
    await record_doc_event(
        db,
        tenant_id=principal.tenant_id,
        user_id=None,
        doc_type="quotation",
        doc_id=quotation.id,
        event="buyer_response",
        summary=f"Buyer {verb} quotation {quotation.quotation_code}",
        reason=body.note,
        extra={"response_type": body.response_type, "external_principal_id": principal.id},
    )
    for uid in await _staff_user_ids(db, principal.tenant_id):
        notify_user(
            db,
            tenant_id=principal.tenant_id,
            user_id=uid,
            kind="customer.quotation.response",
            title=f"{principal.full_name} {verb} quotation {quotation.quotation_code}",
            body=(body.note or None) and body.note[:200],
            href=f"/app/quotations/{quotation.id}",
        )
    return QuotationResponseOut(
        id=row.id,
        quotation_id=quotation.id,
        response_type=row.response_type,
        note=row.note,
        created_at=row.created_at or datetime.utcnow(),
    )
