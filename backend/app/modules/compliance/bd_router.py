"""Bangladesh bond / UD / Mushak registers (flag `bd_bond_compliance_enabled`, default on).

Two routers:
- ``bd_trade_router``  — UD register, permitted-import lines, bond register (trade.access).
- ``bd_vat_router``    — Mushak 6.1 purchase register / 6.2 sales register (finance.access).

These are generic registers with CSV/XLSX export from the UI. Official e-UD / CBMS / NBR
upload file formats are not produced here.
"""

from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_bd_bond_compliance_enabled
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.compliance import BondedWarehouseEntry, UdEntitlement, UtilizationDeclaration
from app.models.trade import TradeCase
from app.modules.compliance import mushak_service
from app.modules.compliance.bd_registers_service import bond_register_rows, compute_utilization

bd_trade_router = APIRouter(prefix="/compliance/bd", tags=["compliance-bd"])
bd_vat_router = APIRouter(prefix="/compliance/bd", tags=["compliance-bd"])

UD_ISSUERS = {"BGMEA", "BKMEA", "BEPZA", "OTHER"}
UD_STATUSES = {"DRAFT", "APPROVED", "CLOSED"}
UD_TRANSITIONS = {"DRAFT": {"APPROVED"}, "APPROVED": {"DRAFT", "CLOSED"}, "CLOSED": set()}
MAX_ENTITLEMENTS = 200


def _guard(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    if not is_bd_bond_compliance_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FEATURE_DISABLED", "message": "BD bond & VAT registers are not enabled for this company."},
        )


def _dec(v: str | None, field: str, *, allow_none: bool = True) -> Decimal | None:
    if v is None or str(v).strip() == "":
        if allow_none:
            return None
        return Decimal("0")
    try:
        d = Decimal(str(v).strip())
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail=f"{field} must be a number") from None
    if d < 0:
        raise HTTPException(status_code=400, detail=f"{field} cannot be negative")
    return d


def _s(v: Decimal | None) -> str | None:
    return None if v is None else str(v)


# ---------------------------------------------------------------- schemas


class EntitlementIn(BaseModel):
    id: int | None = None
    item_description: str = Field(..., min_length=1, max_length=255)
    hs_code: str | None = Field(default=None, max_length=16)
    uom: str | None = Field(default=None, max_length=16)
    entitled_qty: str = "0"
    entitled_value_usd: str | None = None

    @field_validator("item_description")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("item description is required")
        return v


class UdBody(BaseModel):
    ud_no: str = Field(..., min_length=1, max_length=64)
    amendment_no: int = Field(default=0, ge=0, le=999)
    ud_date: date | None = None
    issuer: str = "BGMEA"
    trade_case_id: int | None = None
    export_lc_no: str | None = Field(default=None, max_length=64)
    buyer_name: str | None = Field(default=None, max_length=255)
    export_value_usd: str | None = None
    garment_qty: str | None = None
    expiry_date: date | None = None
    notes: str | None = None
    entitlements: list[EntitlementIn] = Field(default_factory=list, max_length=MAX_ENTITLEMENTS)


class UdStatusBody(BaseModel):
    status: str


class BondEntryBody(BaseModel):
    reference_no: str = Field(..., min_length=1, max_length=64)
    entry_type: str = "IMPORT"
    ud_entitlement_id: int | None = None
    ud_no: str | None = Field(default=None, max_length=64)
    up_no: str | None = Field(default=None, max_length=64)
    item_description: str | None = Field(default=None, max_length=255)
    quantity: str
    value_bdt: str | None = None
    entry_date: date | None = None
    notes: str | None = None


# ---------------------------------------------------------------- helpers


def _ud_header(ud: UtilizationDeclaration, trade_ref: str | None = None) -> dict:
    return {
        "id": ud.id,
        "ud_no": ud.ud_no,
        "amendment_no": ud.amendment_no,
        "ud_date": ud.ud_date.isoformat() if ud.ud_date else None,
        "issuer": ud.issuer,
        "trade_case_id": ud.trade_case_id,
        "trade_case_reference": trade_ref,
        "export_lc_no": ud.export_lc_no,
        "buyer_name": ud.buyer_name,
        "export_value_usd": _s(ud.export_value_usd),
        "garment_qty": _s(ud.garment_qty),
        "expiry_date": ud.expiry_date.isoformat() if ud.expiry_date else None,
        "status": ud.status,
        "notes": ud.notes,
    }


def _ent_dict(e: UdEntitlement) -> dict:
    return {
        "id": e.id,
        "item_description": e.item_description,
        "hs_code": e.hs_code,
        "uom": e.uom,
        "entitled_qty": e.entitled_qty,
        "entitled_value_usd": e.entitled_value_usd,
    }


def _entry_dict(e: BondedWarehouseEntry) -> dict:
    return {
        "id": e.id,
        "entry_type": (e.entry_type or "").upper(),
        "ud_entitlement_id": e.ud_entitlement_id,
        "ud_no": e.ud_no,
        "up_no": e.up_no,
        "reference_no": e.reference_no,
        "item_description": e.item_description,
        "quantity": e.quantity,
        "value_bdt": e.value_bdt,
        "entry_date": e.entry_date,
        "status": e.status,
    }


async def _get_ud(db: AsyncSession, tenant_id: int, ud_id: int, *, lock: bool = False) -> UtilizationDeclaration:
    stmt = select(UtilizationDeclaration).where(
        UtilizationDeclaration.id == ud_id, UtilizationDeclaration.tenant_id == tenant_id
    )
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    ud = (await db.execute(stmt)).scalar_one_or_none()
    if not ud:
        raise HTTPException(status_code=404, detail="UD not found")
    return ud


async def _assert_trade_case(db: AsyncSession, tenant_id: int, trade_case_id: int | None) -> None:
    if trade_case_id is None:
        return
    ok = (
        await db.execute(select(TradeCase.id).where(TradeCase.id == trade_case_id, TradeCase.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not ok:
        raise HTTPException(status_code=400, detail="Trade case not found")


def _apply_header(ud: UtilizationDeclaration, body: UdBody) -> None:
    issuer = body.issuer.strip().upper()
    if issuer not in UD_ISSUERS:
        raise HTTPException(status_code=400, detail=f"issuer must be one of {sorted(UD_ISSUERS)}")
    ud.ud_no = body.ud_no.strip()
    ud.amendment_no = body.amendment_no
    ud.ud_date = body.ud_date
    ud.issuer = issuer
    ud.trade_case_id = body.trade_case_id
    ud.export_lc_no = (body.export_lc_no or "").strip() or None
    ud.buyer_name = (body.buyer_name or "").strip() or None
    ud.export_value_usd = _dec(body.export_value_usd, "export_value_usd")
    ud.garment_qty = _dec(body.garment_qty, "garment_qty")
    ud.expiry_date = body.expiry_date
    ud.notes = body.notes
    if ud.ud_date and ud.expiry_date and ud.expiry_date < ud.ud_date:
        raise HTTPException(status_code=400, detail="Expiry date cannot be before the UD date")


async def _ud_detail(db: AsyncSession, tenant_id: int, ud: UtilizationDeclaration) -> dict:
    ents = (
        await db.execute(
            select(UdEntitlement)
            .where(UdEntitlement.tenant_id == tenant_id, UdEntitlement.ud_id == ud.id)
            .order_by(UdEntitlement.sort_order, UdEntitlement.id)
        )
    ).scalars().all()
    ent_ids = [e.id for e in ents]
    entry_q = select(BondedWarehouseEntry).where(BondedWarehouseEntry.tenant_id == tenant_id)
    if ent_ids:
        entry_q = entry_q.where(
            (BondedWarehouseEntry.ud_entitlement_id.in_(ent_ids))
            | (
                BondedWarehouseEntry.ud_entitlement_id.is_(None)
                & (func.lower(BondedWarehouseEntry.ud_no) == ud.ud_no.lower())
            )
        )
    else:
        entry_q = entry_q.where(func.lower(BondedWarehouseEntry.ud_no) == ud.ud_no.lower())
    entries = (await db.execute(entry_q)).scalars().all()
    trade_ref = None
    if ud.trade_case_id:
        trade_ref = (
            await db.execute(select(TradeCase.reference).where(TradeCase.id == ud.trade_case_id))
        ).scalar_one_or_none()
    util = compute_utilization(
        {"ud_no": ud.ud_no, "expiry_date": ud.expiry_date, "status": ud.status},
        [_ent_dict(e) for e in ents],
        [_entry_dict(e) for e in entries],
    )
    return {
        **_ud_header(ud, trade_ref),
        "entitlements": [
            {
                "id": e.id,
                "item_description": e.item_description,
                "hs_code": e.hs_code,
                "uom": e.uom,
                "entitled_qty": str(e.entitled_qty),
                "entitled_value_usd": _s(e.entitled_value_usd),
            }
            for e in ents
        ],
        "utilization": util,
    }


# ---------------------------------------------------------------- UD register


@bd_trade_router.get("/ud")
async def list_uds(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=64),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    _guard(user, tenant)
    stmt = select(UtilizationDeclaration).where(UtilizationDeclaration.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(UtilizationDeclaration.status == status_filter.upper())
    if q:
        like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        stmt = stmt.where(
            UtilizationDeclaration.ud_no.ilike(like, escape="\\")
            | UtilizationDeclaration.export_lc_no.ilike(like, escape="\\")
            | UtilizationDeclaration.buyer_name.ilike(like, escape="\\")
        )
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await db.execute(stmt.order_by(UtilizationDeclaration.id.desc()).offset(offset).limit(limit))
    ).scalars().all()
    counts: dict[int, int] = {}
    if rows:
        cnt_rows = (
            await db.execute(
                select(UdEntitlement.ud_id, func.count(UdEntitlement.id))
                .where(UdEntitlement.tenant_id == tenant.id, UdEntitlement.ud_id.in_([r.id for r in rows]))
                .group_by(UdEntitlement.ud_id)
            )
        ).all()
        counts = {int(a): int(b) for a, b in cnt_rows}
    today = today_local()
    return {
        "items": [
            {
                **_ud_header(r),
                "entitlement_count": counts.get(r.id, 0),
                "days_to_expiry": (r.expiry_date - today).days if r.expiry_date else None,
            }
            for r in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def _validate_entitlements(items: list[EntitlementIn]) -> None:
    """Input checks that need no DB access — run before any write so errors never need a rollback."""
    seen: set[str] = set()
    for it in items:
        key = it.item_description.lower()
        if key in seen:
            raise HTTPException(status_code=400, detail=f"'{it.item_description}' is listed twice on this UD")
        seen.add(key)
        _dec(it.entitled_qty, "entitled_qty", allow_none=False)
        _dec(it.entitled_value_usd, "entitled_value_usd")


async def _sync_entitlements(db: AsyncSession, tenant_id: int, ud: UtilizationDeclaration, items: list[EntitlementIn]) -> None:
    existing = {
        e.id: e
        for e in (
            await db.execute(
                select(UdEntitlement).where(UdEntitlement.tenant_id == tenant_id, UdEntitlement.ud_id == ud.id)
            )
        ).scalars().all()
    }
    keep: set[int] = set()
    seen_desc: set[str] = set()
    for idx, it in enumerate(items):
        key = it.item_description.lower()
        if key in seen_desc:
            raise HTTPException(status_code=400, detail=f"'{it.item_description}' is listed twice on this UD")
        seen_desc.add(key)
        qty = _dec(it.entitled_qty, "entitled_qty", allow_none=False)
        val = _dec(it.entitled_value_usd, "entitled_value_usd")
        if it.id is not None:
            row = existing.get(it.id)
            if row is None:
                raise HTTPException(status_code=400, detail=f"UD line {it.id} does not belong to this UD")
            keep.add(it.id)
        else:
            row = UdEntitlement(tenant_id=tenant_id, ud_id=ud.id)
            db.add(row)
        row.item_description = it.item_description
        row.hs_code = (it.hs_code or "").strip() or None
        row.uom = (it.uom or "").strip() or None
        row.entitled_qty = qty
        row.entitled_value_usd = val
        row.sort_order = idx
    removed = [rid for rid in existing if rid not in keep]
    if removed:
        linked = (
            await db.execute(
                select(func.count(BondedWarehouseEntry.id)).where(
                    BondedWarehouseEntry.tenant_id == tenant_id,
                    BondedWarehouseEntry.ud_entitlement_id.in_(removed),
                )
            )
        ).scalar_one()
        if linked:
            raise HTTPException(
                status_code=409,
                detail="A UD line you removed already has bond entries linked to it. Keep the line or relink the entries first.",
            )
        for rid in removed:
            await db.delete(existing[rid])


async def _assert_unique_ud(db: AsyncSession, tenant_id: int, ud_no: str, amendment_no: int, exclude_id: int | None) -> None:
    stmt = select(UtilizationDeclaration.id).where(
        UtilizationDeclaration.tenant_id == tenant_id,
        func.lower(UtilizationDeclaration.ud_no) == ud_no.strip().lower(),
        UtilizationDeclaration.amendment_no == amendment_no,
    )
    if exclude_id is not None:
        stmt = stmt.where(UtilizationDeclaration.id != exclude_id)
    if (await db.execute(stmt)).first():
        raise HTTPException(status_code=409, detail="This UD number and amendment already exist")


@bd_trade_router.post("/ud", status_code=201)
async def create_ud(
    body: UdBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    _validate_entitlements(body.entitlements)
    await _assert_trade_case(db, tenant.id, body.trade_case_id)
    await _assert_unique_ud(db, tenant.id, body.ud_no, body.amendment_no, None)
    ud = UtilizationDeclaration(tenant_id=tenant.id, status="DRAFT", created_by=user.id)
    _apply_header(ud, body)
    try:
        db.add(ud)
        await db.flush()
        await _sync_entitlements(db, tenant.id, ud, body.entitlements)
        await db.commit()
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    ud = await _get_ud(db, tenant.id, ud.id)
    return await _ud_detail(db, tenant.id, ud)


@bd_trade_router.get("/ud/{ud_id}")
async def get_ud(
    ud_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    ud = await _get_ud(db, tenant.id, ud_id)
    return await _ud_detail(db, tenant.id, ud)


@bd_trade_router.put("/ud/{ud_id}")
async def update_ud(
    ud_id: int,
    body: UdBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    _validate_entitlements(body.entitlements)
    ud = await _get_ud(db, tenant.id, ud_id, lock=True)
    if ud.status != "DRAFT":
        raise HTTPException(
            status_code=409,
            detail=f"UD is {ud.status}. Move it back to DRAFT (or record an amendment) before editing.",
        )
    await _assert_trade_case(db, tenant.id, body.trade_case_id)
    await _assert_unique_ud(db, tenant.id, body.ud_no, body.amendment_no, ud.id)
    try:
        _apply_header(ud, body)
        await _sync_entitlements(db, tenant.id, ud, body.entitlements)
        await db.commit()
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    ud = await _get_ud(db, tenant.id, ud.id)
    return await _ud_detail(db, tenant.id, ud)


@bd_trade_router.post("/ud/{ud_id}/status")
async def set_ud_status(
    ud_id: int,
    body: UdStatusBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    target = body.status.strip().upper()
    if target not in UD_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(UD_STATUSES)}")
    ud = await _get_ud(db, tenant.id, ud_id, lock=True)
    if target not in UD_TRANSITIONS.get(ud.status, set()):
        raise HTTPException(status_code=409, detail=f"Cannot move UD from {ud.status} to {target}")
    if target == "APPROVED":
        has_lines = (
            await db.execute(
                select(func.count(UdEntitlement.id)).where(
                    UdEntitlement.tenant_id == tenant.id, UdEntitlement.ud_id == ud.id
                )
            )
        ).scalar_one()
        if not has_lines:
            raise HTTPException(status_code=400, detail="Add at least one permitted import line before approving")
    ud.status = target
    await db.commit()
    ud = await _get_ud(db, tenant.id, ud.id)
    return await _ud_detail(db, tenant.id, ud)


@bd_trade_router.delete("/ud/{ud_id}", status_code=204)
async def delete_ud(
    ud_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    ud = await _get_ud(db, tenant.id, ud_id, lock=True)
    if ud.status != "DRAFT":
        raise HTTPException(status_code=409, detail="Only DRAFT UDs can be deleted")
    linked = (
        await db.execute(
            select(func.count(BondedWarehouseEntry.id))
            .join(UdEntitlement, UdEntitlement.id == BondedWarehouseEntry.ud_entitlement_id)
            .where(UdEntitlement.ud_id == ud.id, BondedWarehouseEntry.tenant_id == tenant.id)
        )
    ).scalar_one()
    if linked:
        raise HTTPException(status_code=409, detail="Bond entries are linked to this UD; it cannot be deleted")
    await db.delete(ud)
    await db.commit()


# ---------------------------------------------------------------- bond register


@bd_trade_router.get("/bond-register")
async def bond_register(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    from_date: date | None = None,
    to_date: date | None = None,
    ud_no: str | None = Query(default=None, max_length=64),
):
    _guard(user, tenant)
    if from_date and to_date and to_date < from_date:
        raise HTTPException(status_code=400, detail="to_date must be on or after from_date")
    stmt = select(BondedWarehouseEntry).where(
        BondedWarehouseEntry.tenant_id == tenant.id,
        func.upper(BondedWarehouseEntry.status) != "CANCELLED",
    )
    if ud_no:
        stmt = stmt.where(func.lower(BondedWarehouseEntry.ud_no) == ud_no.strip().lower())
    if to_date:
        stmt = stmt.where((BondedWarehouseEntry.entry_date.is_(None)) | (BondedWarehouseEntry.entry_date <= to_date))
    entries = (await db.execute(stmt.limit(5000))).scalars().all()
    return bond_register_rows([_entry_dict(e) for e in entries], from_date=from_date)


@bd_trade_router.post("/bond-entries", status_code=201)
async def create_bond_entry(
    body: BondEntryBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    entry_type = body.entry_type.strip().upper()
    if entry_type not in {"IMPORT", "EXPORT"}:
        raise HTTPException(status_code=400, detail="entry_type must be IMPORT or EXPORT")
    qty = _dec(body.quantity, "quantity", allow_none=False)
    if not qty or qty <= 0:
        raise HTTPException(status_code=400, detail="quantity must be greater than zero")
    ud_no = (body.ud_no or "").strip() or None
    description = (body.item_description or "").strip() or None
    if body.ud_entitlement_id is not None:
        row = (
            await db.execute(
                select(UdEntitlement, UtilizationDeclaration)
                .join(UtilizationDeclaration, UtilizationDeclaration.id == UdEntitlement.ud_id)
                .where(UdEntitlement.id == body.ud_entitlement_id, UdEntitlement.tenant_id == tenant.id)
            )
        ).first()
        if not row:
            raise HTTPException(status_code=400, detail="UD line not found")
        ent, ud = row
        if ud.status == "CLOSED":
            raise HTTPException(status_code=409, detail="UD is CLOSED; new bond entries cannot be linked to it")
        ud_no = ud.ud_no
        description = description or ent.item_description
    if not description:
        raise HTTPException(status_code=400, detail="item_description is required when no UD line is selected")
    entry = BondedWarehouseEntry(
        tenant_id=tenant.id,
        reference_no=body.reference_no.strip(),
        entry_type=entry_type,
        ud_no=ud_no,
        up_no=(body.up_no or "").strip() or None,
        ud_entitlement_id=body.ud_entitlement_id,
        item_description=description,
        quantity=qty,
        value_bdt=_dec(body.value_bdt, "value_bdt"),
        status="OPEN",
        entry_date=body.entry_date or today_local(),
        notes=body.notes,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    d = _entry_dict(entry)
    return {
        **d,
        "quantity": _s(entry.quantity),
        "value_bdt": _s(entry.value_bdt),
        "entry_date": entry.entry_date.isoformat() if entry.entry_date else None,
    }


# ---------------------------------------------------------------- Mushak registers


def _month_range(year: int, month: int) -> tuple[date, date]:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


@bd_vat_router.get("/mushak/6-1")
async def mushak_purchase_register(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """Mushak 6.1-style purchase register from recorded vendor bills (amounts in base currency)."""
    _guard(user, tenant)
    start, end = _month_range(year, month)
    out, totals = await mushak_service.purchase_register(db, tenant.id, start, end)
    return {
        "register": "6.1",
        "title": "Purchase register (Mushak 6.1 style)",
        "period": f"{year}-{month:02d}",
        "rows": out,
        "totals": totals,
        "note": "Generated from recorded vendor bills. Verify against NBR Mushak 6.1 before filing.",
    }


@bd_vat_router.get("/mushak/6-2")
async def mushak_sales_register(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """Mushak 6.2-style sales register from issued commercial invoices (exports treated as zero-rated)."""
    _guard(user, tenant)
    start, end = _month_range(year, month)
    out, totals = await mushak_service.sales_register(db, tenant.id, start, end)
    return {
        "register": "6.2",
        "title": "Sales register (Mushak 6.2 style)",
        "period": f"{year}-{month:02d}",
        "rows": out,
        "totals": {"taxable_value": totals["taxable_value"], "vat_amount": totals["vat_amount"]},
        "note": "Commercial invoices are treated as zero-rated exports. Add local sales manually before filing.",
    }


@bd_vat_router.get("/mushak/6-10")
async def mushak_6_10(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """Purchases and sales above BDT 2 lakh in the month (Mushak 6.10)."""
    _guard(user, tenant)
    start, end = _month_range(year, month)
    data = await mushak_service.mushak_6_10(db, tenant.id, start, end)
    return {"form": "6.10", "period": f"{year}-{month:02d}", **data}


@bd_vat_router.get("/mushak/9-1")
async def mushak_9_1(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """Draft monthly return summary (Mushak 9.1) from the 6.1 / 6.2 registers."""
    _guard(user, tenant)
    start, end = _month_range(year, month)
    data = await mushak_service.mushak_9_1_summary(db, tenant, start, end)
    return {"period": f"{year}-{month:02d}", **data}


@bd_vat_router.get("/mushak/6-3/{invoice_id}")
async def mushak_6_3(
    invoice_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tax invoice (Mushak 6.3) data for one commercial invoice."""
    _guard(user, tenant)
    data = await mushak_service.mushak_6_3(db, tenant, invoice_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return data
