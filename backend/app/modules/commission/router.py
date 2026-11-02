"""Commission engine API (flag `commission_engine_enabled`, default on)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.codegen import next_tenant_code_entity_key
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_commission_engine_enabled
from app.database import get_db, safe_async_session_rollback
from app.models import Customer, Order, Tenant, User, Vendor
from app.models.commission import (
    COUNTERPARTY_CUSTOMER,
    COUNTERPARTY_INTERMEDIARY,
    COUNTERPARTY_VENDOR,
    DIRECTION_PAYABLE,
    DIRECTION_RECEIVABLE,
    CommissionEntry,
    CommissionRule,
    CommissionSettings,
    CommissionShipment,
    CommissionStatement,
)
from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.models.parties import Intermediary
from app.modules.commission.service import build_entries, get_settings_row, money

router = APIRouter(prefix="/commission", tags=["commission"])

Direction = Literal["RECEIVABLE", "PAYABLE"]
RateType = Literal["PERCENTAGE", "FIXED"]
CounterpartyType = Literal["CUSTOMER", "VENDOR", "INTERMEDIARY"]
ACCOUNT_FIELDS = (
    "income_account_id",
    "receivable_account_id",
    "expense_account_id",
    "payable_account_id",
    "tds_receivable_account_id",
    "tds_payable_account_id",
    "vds_receivable_account_id",
    "vds_payable_account_id",
)
SCOPES_BY_DIRECTION = {DIRECTION_RECEIVABLE: {"DEFAULT", "CUSTOMER", "VENDOR"}, DIRECTION_PAYABLE: {"DEFAULT", "INTERMEDIARY"}}


# ---------------------------------------------------------------- guards


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _require_enabled(tenant: Tenant) -> None:
    if not is_commission_engine_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FEATURE_DISABLED", "message": "Commission engine is not enabled for this company."},
        )


async def _require_manager(db: AsyncSession, user: User, tenant_id: int) -> None:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    if (role.name if role else "").strip().lower() not in {"admin", "manager", "owner", "super_admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Only a manager or admin can do this")


async def _owned(db: AsyncSession, model: Any, obj_id: int | None, tenant_id: int, label: str) -> Any:
    if obj_id is None:
        return None
    row = await db.get(model, obj_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail=f"{label} {obj_id} not found")
    return row


async def _counterparty_names(db: AsyncSession, tenant_id: int, refs: set[tuple[str, int]]) -> dict[tuple[str, int], str]:
    names: dict[tuple[str, int], str] = {}
    for kind, model in ((COUNTERPARTY_CUSTOMER, Customer), (COUNTERPARTY_VENDOR, Vendor), (COUNTERPARTY_INTERMEDIARY, Intermediary)):
        ids = [i for k, i in refs if k == kind]
        if not ids:
            continue
        rows = (await db.execute(select(model.id, model.name).where(model.tenant_id == tenant_id, model.id.in_(ids)))).all()
        names.update({(kind, rid): name for rid, name in rows})
    return names


# ---------------------------------------------------------------- settings


class SettingsBody(BaseModel):
    tds_rate_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    vds_rate_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    income_account_id: int | None = None
    receivable_account_id: int | None = None
    expense_account_id: int | None = None
    payable_account_id: int | None = None
    tds_receivable_account_id: int | None = None
    tds_payable_account_id: int | None = None
    vds_receivable_account_id: int | None = None
    vds_payable_account_id: int | None = None


class SettingsOut(SettingsBody):
    enabled: bool


def _settings_out(tenant: Tenant, row: CommissionSettings | None) -> SettingsOut:
    data: dict[str, Any] = {f: getattr(row, f) for f in ACCOUNT_FIELDS} if row else {}
    return SettingsOut(
        enabled=is_commission_engine_enabled(tenant.feature_flags),
        tds_rate_pct=row.tds_rate_pct if row else Decimal("0"),
        vds_rate_pct=row.vds_rate_pct if row else Decimal("0"),
        **data,
    )


@router.get("/settings", response_model=SettingsOut)
async def get_settings(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return _settings_out(tenant, await get_settings_row(db, tenant.id))


@router.put("/settings", response_model=SettingsOut)
async def put_settings(
    body: SettingsBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    await _require_manager(db, user, tenant.id)
    for f in ACCOUNT_FIELDS:
        await _owned(db, ChartOfAccount, getattr(body, f), tenant.id, "Account")
    row = await get_settings_row(db, tenant.id)
    if not row:
        row = CommissionSettings(tenant_id=tenant.id)
        db.add(row)
    row.tds_rate_pct = body.tds_rate_pct
    row.vds_rate_pct = body.vds_rate_pct
    for f in ACCOUNT_FIELDS:
        setattr(row, f, getattr(body, f))
    await db.commit()
    await db.refresh(row)
    return _settings_out(tenant, row)


# ---------------------------------------------------------------- rules


class RuleBody(BaseModel):
    direction: Direction
    scope: Literal["DEFAULT", "CUSTOMER", "VENDOR", "INTERMEDIARY"]
    customer_id: int | None = None
    vendor_id: int | None = None
    intermediary_id: int | None = None
    rate_type: RateType = "PERCENTAGE"
    rate: Decimal = Field(..., ge=0, le=1_000_000)
    notes: str | None = Field(default=None, max_length=2000)


class RulePatch(BaseModel):
    rate_type: RateType | None = None
    rate: Decimal | None = Field(default=None, ge=0, le=1_000_000)
    is_active: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)


class RuleOut(BaseModel):
    id: int
    direction: str
    scope: str
    customer_id: int | None
    vendor_id: int | None
    intermediary_id: int | None
    target_name: str | None
    rate_type: str
    rate: Decimal
    is_active: bool
    notes: str | None


async def _rules_out(db: AsyncSession, tenant_id: int, rows: list[CommissionRule]) -> list[RuleOut]:
    refs: set[tuple[str, int]] = set()
    for r in rows:
        if r.customer_id:
            refs.add((COUNTERPARTY_CUSTOMER, r.customer_id))
        if r.vendor_id:
            refs.add((COUNTERPARTY_VENDOR, r.vendor_id))
        if r.intermediary_id:
            refs.add((COUNTERPARTY_INTERMEDIARY, r.intermediary_id))
    names = await _counterparty_names(db, tenant_id, refs)

    def target(r: CommissionRule) -> str | None:
        if r.customer_id:
            return names.get((COUNTERPARTY_CUSTOMER, r.customer_id))
        if r.vendor_id:
            return names.get((COUNTERPARTY_VENDOR, r.vendor_id))
        if r.intermediary_id:
            return names.get((COUNTERPARTY_INTERMEDIARY, r.intermediary_id))
        return None

    return [
        RuleOut(
            id=r.id,
            direction=r.direction,
            scope=r.scope,
            customer_id=r.customer_id,
            vendor_id=r.vendor_id,
            intermediary_id=r.intermediary_id,
            target_name=target(r),
            rate_type=r.rate_type,
            rate=r.rate,
            is_active=r.is_active,
            notes=r.notes,
        )
        for r in rows
    ]


@router.get("/rules", response_model=list[RuleOut])
async def list_rules(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    rows = list(
        (
            await db.execute(
                select(CommissionRule).where(CommissionRule.tenant_id == tenant.id).order_by(CommissionRule.direction, CommissionRule.scope, CommissionRule.id)
            )
        ).scalars()
    )
    return await _rules_out(db, tenant.id, rows)


@router.post("/rules", response_model=RuleOut, status_code=201)
async def create_rule(
    body: RuleBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    await _require_manager(db, user, tenant.id)
    if body.scope not in SCOPES_BY_DIRECTION[body.direction]:
        raise HTTPException(status_code=400, detail=f"{body.direction} rules cannot use scope {body.scope}")
    refs = {"CUSTOMER": body.customer_id, "VENDOR": body.vendor_id, "INTERMEDIARY": body.intermediary_id}
    for scope, ref in refs.items():
        if (scope == body.scope) != (ref is not None):
            raise HTTPException(status_code=400, detail=f"Scope {body.scope} needs exactly its own target id")
    await _owned(db, Customer, body.customer_id, tenant.id, "Customer")
    await _owned(db, Vendor, body.vendor_id, tenant.id, "Vendor")
    await _owned(db, Intermediary, body.intermediary_id, tenant.id, "Agent")
    if body.rate_type == "PERCENTAGE" and body.rate > 100:
        raise HTTPException(status_code=400, detail="Percentage rate cannot exceed 100")
    row = CommissionRule(tenant_id=tenant.id, is_active=True, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return (await _rules_out(db, tenant.id, [row]))[0]


@router.patch("/rules/{rule_id}", response_model=RuleOut)
async def update_rule(
    rule_id: int,
    body: RulePatch,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    await _require_manager(db, user, tenant.id)
    row = await db.get(CommissionRule, rule_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Rule not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(row, k, v)
    if row.rate_type == "PERCENTAGE" and row.rate > 100:
        raise HTTPException(status_code=400, detail="Percentage rate cannot exceed 100")
    await db.commit()
    await db.refresh(row)
    return (await _rules_out(db, tenant.id, [row]))[0]


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    await _require_manager(db, user, tenant.id)
    row = await db.get(CommissionRule, rule_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(row)
    await db.commit()


# ---------------------------------------------------------------- shipments & entries


class ShipmentBody(BaseModel):
    order_id: int
    vendor_id: int | None = None
    shipment_ref: str = Field(..., min_length=1, max_length=64)
    shipment_date: date
    shipped_qty: int | None = Field(default=None, ge=0, le=100_000_000)
    shipped_value: Decimal = Field(..., ge=0, le=Decimal("1e13"))
    currency: str = Field(default="USD", min_length=3, max_length=10)
    exchange_rate_to_base: Decimal = Field(default=Decimal("1"), gt=0, le=Decimal("1e6"))
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("shipment_ref")
    @classmethod
    def _ref(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("shipment reference is required")
        return v

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: str) -> str:
        return v.strip().upper()


class EntryOut(BaseModel):
    id: int
    shipment_id: int
    shipment_ref: str | None = None
    order_code: str | None = None
    direction: str
    counterparty_type: str
    counterparty_id: int
    counterparty_name: str | None
    rate_type: str
    rate: Decimal
    rate_source: str
    base_amount: Decimal
    gross_amount: Decimal
    tds_amount: Decimal
    vds_amount: Decimal
    net_amount: Decimal
    currency: str
    status: str
    statement_id: int | None


class ShipmentOut(BaseModel):
    id: int
    order_id: int
    order_code: str | None
    vendor_id: int | None
    vendor_name: str | None
    shipment_ref: str
    shipment_date: date
    shipped_qty: int | None
    shipped_value: Decimal
    currency: str
    exchange_rate_to_base: Decimal
    notes: str | None
    entries: list[EntryOut]


async def _entries_out(db: AsyncSession, tenant_id: int, rows: list[CommissionEntry]) -> list[EntryOut]:
    names = await _counterparty_names(db, tenant_id, {(e.counterparty_type, e.counterparty_id) for e in rows})
    ship_ids = {e.shipment_id for e in rows}
    ships: dict[int, tuple[str, str | None]] = {}
    if ship_ids:
        for sid, ref, code in (
            await db.execute(
                select(CommissionShipment.id, CommissionShipment.shipment_ref, Order.order_code)
                .join(Order, Order.id == CommissionShipment.order_id)
                .where(CommissionShipment.id.in_(ship_ids))
            )
        ).all():
            ships[sid] = (ref, code)
    return [
        EntryOut(
            id=e.id,
            shipment_id=e.shipment_id,
            shipment_ref=ships.get(e.shipment_id, (None, None))[0],
            order_code=ships.get(e.shipment_id, (None, None))[1],
            direction=e.direction,
            counterparty_type=e.counterparty_type,
            counterparty_id=e.counterparty_id,
            counterparty_name=names.get((e.counterparty_type, e.counterparty_id)),
            rate_type=e.rate_type,
            rate=e.rate,
            rate_source=e.rate_source,
            base_amount=e.base_amount,
            gross_amount=e.gross_amount,
            tds_amount=e.tds_amount,
            vds_amount=e.vds_amount,
            net_amount=e.net_amount,
            currency=e.currency,
            status=e.status,
            statement_id=e.statement_id,
        )
        for e in rows
    ]


async def _shipments_out(db: AsyncSession, tenant_id: int, rows: list[CommissionShipment]) -> list[ShipmentOut]:
    ids = [s.id for s in rows]
    entries = (
        list((await db.execute(select(CommissionEntry).where(CommissionEntry.shipment_id.in_(ids)).order_by(CommissionEntry.id))).scalars())
        if ids
        else []
    )
    entries_out = await _entries_out(db, tenant_id, entries)
    by_ship: dict[int, list[EntryOut]] = {}
    for e in entries_out:
        by_ship.setdefault(e.shipment_id, []).append(e)
    order_codes = dict(
        (await db.execute(select(Order.id, Order.order_code).where(Order.id.in_({s.order_id for s in rows})))).all()
    ) if rows else {}
    vendor_names = await _counterparty_names(db, tenant_id, {(COUNTERPARTY_VENDOR, s.vendor_id) for s in rows if s.vendor_id})
    return [
        ShipmentOut(
            id=s.id,
            order_id=s.order_id,
            order_code=order_codes.get(s.order_id),
            vendor_id=s.vendor_id,
            vendor_name=vendor_names.get((COUNTERPARTY_VENDOR, s.vendor_id)) if s.vendor_id else None,
            shipment_ref=s.shipment_ref,
            shipment_date=s.shipment_date,
            shipped_qty=s.shipped_qty,
            shipped_value=s.shipped_value,
            currency=s.currency,
            exchange_rate_to_base=s.exchange_rate_to_base,
            notes=s.notes,
            entries=by_ship.get(s.id, []),
        )
        for s in rows
    ]


@router.get("/shipments", response_model=list[ShipmentOut])
async def list_shipments(
    order_id: int | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    stmt = select(CommissionShipment).where(CommissionShipment.tenant_id == tenant.id)
    if order_id:
        stmt = stmt.where(CommissionShipment.order_id == order_id)
    rows = list(
        (await db.execute(stmt.order_by(CommissionShipment.shipment_date.desc(), CommissionShipment.id.desc()).limit(limit).offset(offset))).scalars()
    )
    return await _shipments_out(db, tenant.id, rows)


@router.post("/shipments", response_model=ShipmentOut, status_code=201)
async def create_shipment(
    body: ShipmentBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    order = await _owned(db, Order, body.order_id, tenant.id, "Order")
    await _owned(db, Vendor, body.vendor_id, tenant.id, "Vendor")
    duplicate = await db.scalar(
        select(CommissionShipment.id).where(
            CommissionShipment.tenant_id == tenant.id,
            CommissionShipment.order_id == order.id,
            CommissionShipment.shipment_ref == body.shipment_ref,
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail=f"Shipment {body.shipment_ref} is already recorded for this order")
    shipment = CommissionShipment(tenant_id=tenant.id, created_by=user.id, **body.model_dump())
    db.add(shipment)
    try:
        await db.flush()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=409, detail=f"Shipment {body.shipment_ref} is already recorded for this order")
    for entry in await build_entries(db, tenant.id, order, shipment):
        db.add(entry)
    await db.commit()
    await db.refresh(shipment)
    return (await _shipments_out(db, tenant.id, [shipment]))[0]


async def _lock_shipment(db: AsyncSession, tenant_id: int, shipment_id: int) -> tuple[CommissionShipment, list[CommissionEntry]]:
    shipment = (
        await db.execute(
            select(CommissionShipment)
            .where(CommissionShipment.id == shipment_id, CommissionShipment.tenant_id == tenant_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    entries = list(
        (await db.execute(select(CommissionEntry).where(CommissionEntry.shipment_id == shipment.id).with_for_update())).scalars()
    )
    if any(e.status != "PENDING" for e in entries):
        raise HTTPException(
            status_code=409,
            detail="This shipment's commission is already on a statement. Cancel that statement first.",
        )
    return shipment, entries


@router.post("/shipments/{shipment_id}/recalculate", response_model=ShipmentOut)
async def recalculate_shipment(
    shipment_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-apply current rules and tax rates to a shipment whose commission is not yet on a statement."""
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    await _require_manager(db, user, tenant.id)
    shipment, entries = await _lock_shipment(db, tenant.id, shipment_id)
    for e in entries:
        await db.delete(e)
    await db.flush()
    order = await db.get(Order, shipment.order_id)
    for entry in await build_entries(db, tenant.id, order, shipment):
        db.add(entry)
    await db.commit()
    return (await _shipments_out(db, tenant.id, [shipment]))[0]


@router.delete("/shipments/{shipment_id}", status_code=204)
async def delete_shipment(
    shipment_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    await _require_manager(db, user, tenant.id)
    shipment, _entries = await _lock_shipment(db, tenant.id, shipment_id)
    await db.delete(shipment)
    await db.commit()


@router.get("/entries", response_model=list[EntryOut])
async def list_entries(
    direction: Direction | None = None,
    status_filter: Literal["PENDING", "STATEMENTED"] | None = Query(default=None, alias="status"),
    counterparty_type: CounterpartyType | None = None,
    counterparty_id: int | None = None,
    limit: int = Query(200, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    stmt = select(CommissionEntry).where(CommissionEntry.tenant_id == tenant.id)
    if direction:
        stmt = stmt.where(CommissionEntry.direction == direction)
    if status_filter:
        stmt = stmt.where(CommissionEntry.status == status_filter)
    if counterparty_type:
        stmt = stmt.where(CommissionEntry.counterparty_type == counterparty_type)
    if counterparty_id:
        stmt = stmt.where(CommissionEntry.counterparty_id == counterparty_id)
    rows = list((await db.execute(stmt.order_by(CommissionEntry.id.desc()).limit(limit))).scalars())
    return await _entries_out(db, tenant.id, rows)


# ---------------------------------------------------------------- statements


class StatementBody(BaseModel):
    direction: Direction
    counterparty_type: CounterpartyType
    counterparty_id: int
    currency: str = Field(..., min_length=3, max_length=10)
    # Omit to include every pending entry for this counterparty and currency.
    entry_ids: list[int] | None = Field(default=None, max_length=1000)
    statement_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class StatementOut(BaseModel):
    id: int
    statement_code: str
    direction: str
    counterparty_type: str
    counterparty_id: int
    counterparty_name: str | None
    statement_date: date
    currency: str
    gross_total: Decimal
    tds_total: Decimal
    vds_total: Decimal
    net_total: Decimal
    base_gross_total: Decimal
    status: str
    voucher_id: int | None
    voucher_number: str | None
    notes: str | None
    issued_at: datetime | None
    entries: list[EntryOut] = []
    warning: str | None = None


async def _statement_out(
    db: AsyncSession, tenant_id: int, row: CommissionStatement, *, with_entries: bool = False, warning: str | None = None
) -> StatementOut:
    names = await _counterparty_names(db, tenant_id, {(row.counterparty_type, row.counterparty_id)})
    voucher_number = None
    if row.voucher_id:
        voucher_number = await db.scalar(select(Voucher.voucher_number).where(Voucher.id == row.voucher_id))
    entries: list[EntryOut] = []
    if with_entries:
        rows = list(
            (await db.execute(select(CommissionEntry).where(CommissionEntry.statement_id == row.id).order_by(CommissionEntry.id))).scalars()
        )
        entries = await _entries_out(db, tenant_id, rows)
    return StatementOut(
        id=row.id,
        statement_code=row.statement_code,
        direction=row.direction,
        counterparty_type=row.counterparty_type,
        counterparty_id=row.counterparty_id,
        counterparty_name=names.get((row.counterparty_type, row.counterparty_id)),
        statement_date=row.statement_date,
        currency=row.currency,
        gross_total=row.gross_total,
        tds_total=row.tds_total,
        vds_total=row.vds_total,
        net_total=row.net_total,
        base_gross_total=row.base_gross_total,
        status=row.status,
        voucher_id=row.voucher_id,
        voucher_number=voucher_number,
        notes=row.notes,
        issued_at=row.issued_at,
        entries=entries,
        warning=warning,
    )


async def _lock_statement(db: AsyncSession, tenant_id: int, statement_id: int) -> CommissionStatement:
    row = (
        await db.execute(
            select(CommissionStatement)
            .where(CommissionStatement.id == statement_id, CommissionStatement.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Statement not found")
    return row


@router.get("/statements", response_model=list[StatementOut])
async def list_statements(
    direction: Direction | None = None,
    limit: int = Query(100, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    stmt = select(CommissionStatement).where(CommissionStatement.tenant_id == tenant.id)
    if direction:
        stmt = stmt.where(CommissionStatement.direction == direction)
    rows = list((await db.execute(stmt.order_by(CommissionStatement.id.desc()).limit(limit))).scalars())
    return [await _statement_out(db, tenant.id, r) for r in rows]


@router.get("/statements/{statement_id}", response_model=StatementOut)
async def get_statement(
    statement_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    row = await db.get(CommissionStatement, statement_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Statement not found")
    return await _statement_out(db, tenant.id, row, with_entries=True)


@router.post("/statements", response_model=StatementOut, status_code=201)
async def create_statement(
    body: StatementBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    await _require_manager(db, user, tenant.id)
    currency = body.currency.strip().upper()
    stmt = (
        select(CommissionEntry)
        .where(
            CommissionEntry.tenant_id == tenant.id,
            CommissionEntry.direction == body.direction,
            CommissionEntry.counterparty_type == body.counterparty_type,
            CommissionEntry.counterparty_id == body.counterparty_id,
            CommissionEntry.currency == currency,
            CommissionEntry.status == "PENDING",
        )
        .order_by(CommissionEntry.id)
        .with_for_update()
    )
    if body.entry_ids is not None:
        stmt = stmt.where(CommissionEntry.id.in_(body.entry_ids))
    entries = list((await db.execute(stmt)).scalars())
    if body.entry_ids is not None and len(entries) != len(set(body.entry_ids)):
        raise HTTPException(
            status_code=409,
            detail="Some selected entries are already on a statement or do not match this party and currency.",
        )
    if not entries:
        raise HTTPException(status_code=400, detail="No pending commission for this party and currency")

    rates = dict(
        (
            await db.execute(
                select(CommissionShipment.id, CommissionShipment.exchange_rate_to_base).where(
                    CommissionShipment.id.in_({e.shipment_id for e in entries})
                )
            )
        ).all()
    )
    prefix = "CMR-" if body.direction == DIRECTION_RECEIVABLE else "CMP-"
    code = await next_tenant_code_entity_key(db, tenant_id=tenant.id, entity_key=f"commission_statements:{prefix}", prefix=prefix, width=5)
    row = CommissionStatement(
        tenant_id=tenant.id,
        statement_code=code,
        direction=body.direction,
        counterparty_type=body.counterparty_type,
        counterparty_id=body.counterparty_id,
        statement_date=body.statement_date or date.today(),
        currency=currency,
        gross_total=sum((e.gross_amount for e in entries), Decimal("0")),
        tds_total=sum((e.tds_amount for e in entries), Decimal("0")),
        vds_total=sum((e.vds_amount for e in entries), Decimal("0")),
        net_total=sum((e.net_amount for e in entries), Decimal("0")),
        base_gross_total=money(sum((e.gross_amount * rates.get(e.shipment_id, Decimal("1")) for e in entries), Decimal("0"))),
        status="DRAFT",
        notes=body.notes,
        created_by=user.id,
    )
    db.add(row)
    await db.flush()
    for e in entries:
        e.status = "STATEMENTED"
        e.statement_id = row.id
    await db.commit()
    await db.refresh(row)
    return await _statement_out(db, tenant.id, row, with_entries=True)


async def _create_draft_voucher(
    db: AsyncSession, tenant: Tenant, user: User, row: CommissionStatement, entries: list[CommissionEntry]
) -> tuple[int | None, str | None]:
    """Balanced DRAFT journal in base currency, or (None, reason) when accounts are not configured."""
    from app.modules.finance.voucher_controls import allocate_series_voucher_number

    settings = await get_settings_row(db, tenant.id)
    rates = dict(
        (
            await db.execute(
                select(CommissionShipment.id, CommissionShipment.exchange_rate_to_base).where(
                    CommissionShipment.id.in_({e.shipment_id for e in entries})
                )
            )
        ).all()
    )

    def base(attr: str) -> Decimal:
        return money(sum((getattr(e, attr) * rates.get(e.shipment_id, Decimal("1")) for e in entries), Decimal("0")))

    gross, tds, vds = base("gross_amount"), base("tds_amount"), base("vds_amount")
    net = gross - tds - vds
    receivable = row.direction == DIRECTION_RECEIVABLE
    if receivable:
        plan = [
            ("receivable_account_id", "DEBIT", net, "Commission receivable"),
            ("tds_receivable_account_id", "DEBIT", tds, "TDS/AIT deducted by payer"),
            ("vds_receivable_account_id", "DEBIT", vds, "VDS deducted by payer"),
            ("income_account_id", "CREDIT", gross, "Commission income"),
        ]
    else:
        plan = [
            ("expense_account_id", "DEBIT", gross, "Commission expense"),
            ("payable_account_id", "CREDIT", net, "Commission payable to agent"),
            ("tds_payable_account_id", "CREDIT", tds, "TDS/AIT to deposit"),
            ("vds_payable_account_id", "CREDIT", vds, "VDS to deposit"),
        ]
    plan = [p for p in plan if p[2] > 0]
    missing = [field for field, *_ in plan if not settings or not getattr(settings, field)]
    if missing:
        labels = ", ".join(f.replace("_account_id", "").replace("_", " ") for f in missing)
        return None, f"Draft voucher not created: set the commission accounts in settings ({labels})."

    number, seq, series_key, fy = await allocate_series_voucher_number(
        db, tenant_id=tenant.id, voucher_date=row.statement_date, voucher_type="JOURNAL", branch_code="MAIN"
    )
    voucher = Voucher(
        tenant_id=tenant.id,
        voucher_number=number,
        voucher_type="JOURNAL",
        voucher_date=row.statement_date,
        status="DRAFT",
        description=(
            f"Commission {'invoice' if receivable else 'statement'} {row.statement_code}: "
            f"{row.gross_total} {row.currency} gross (converted to base currency)"
        ),
        reference=row.statement_code,
        branch_code="MAIN",
        fiscal_year=fy,
        series_sequence=seq,
        number_series_key=series_key,
        source_module="COMMISSION",
        source_module_ref=f"statement:{row.id}",
        created_by=user.id,
    )
    db.add(voucher)
    await db.flush()
    for field, entry_type, amount, note in plan:
        db.add(
            VoucherLine(
                tenant_id=tenant.id,
                voucher_id=voucher.id,
                account_id=getattr(settings, field),
                entry_type=entry_type,
                amount=amount,
                base_amount=amount,
                notes=note,
            )
        )
    return voucher.id, None


@router.post("/statements/{statement_id}/issue", response_model=StatementOut)
async def issue_statement(
    statement_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    await _require_manager(db, user, tenant.id)
    row = await _lock_statement(db, tenant.id, statement_id)
    if row.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Statement is already {row.status}")
    entries = list((await db.execute(select(CommissionEntry).where(CommissionEntry.statement_id == row.id))).scalars())
    voucher_id, warning = await _create_draft_voucher(db, tenant, user, row, entries)
    row.voucher_id = voucher_id
    row.status = "ISSUED"
    row.issued_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return await _statement_out(db, tenant.id, row, with_entries=True, warning=warning)


@router.post("/statements/{statement_id}/cancel", response_model=StatementOut)
async def cancel_statement(
    statement_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Release the entries back to PENDING; a linked voucher must still be a draft."""
    _ensure_tenant(user, tenant)
    _require_enabled(tenant)
    await _require_manager(db, user, tenant.id)
    row = await _lock_statement(db, tenant.id, statement_id)
    if row.status == "CANCELLED":
        raise HTTPException(status_code=409, detail="Statement is already cancelled")
    if row.voucher_id:
        voucher = (
            await db.execute(select(Voucher).where(Voucher.id == row.voucher_id, Voucher.tenant_id == tenant.id).with_for_update())
        ).scalar_one_or_none()
        if voucher and voucher.status not in {"DRAFT", "CANCELLED", "REJECTED"}:
            raise HTTPException(
                status_code=409,
                detail=f"Voucher {voucher.voucher_number} is {voucher.status}. Cancel or reverse it in Accounts first.",
            )
        if voucher and voucher.status == "DRAFT":
            voucher.status = "CANCELLED"
    entries = list(
        (await db.execute(select(CommissionEntry).where(CommissionEntry.statement_id == row.id).with_for_update())).scalars()
    )
    for e in entries:
        e.status = "PENDING"
        e.statement_id = None
    row.status = "CANCELLED"
    await db.commit()
    await db.refresh(row)
    return await _statement_out(db, tenant.id, row)
