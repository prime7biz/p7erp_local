"""Commission calculation and rate resolution (pure money maths + rule lookup)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order
from app.models.commission import (
    COUNTERPARTY_CUSTOMER,
    COUNTERPARTY_INTERMEDIARY,
    COUNTERPARTY_VENDOR,
    DIRECTION_PAYABLE,
    DIRECTION_RECEIVABLE,
    RATE_FIXED,
    RATE_PERCENTAGE,
    CommissionEntry,
    CommissionRule,
    CommissionSettings,
    CommissionShipment,
)
from app.models.parties import CustomerIntermediary

CENT = Decimal("0.01")
HUNDRED = Decimal("100")


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class ResolvedRate:
    counterparty_type: str
    counterparty_id: int
    rate_type: str
    rate: Decimal
    source: str


@dataclass(frozen=True)
class Amounts:
    base_amount: Decimal
    gross: Decimal
    tds: Decimal
    vds: Decimal
    net: Decimal


def calculate_amounts(
    *,
    shipped_value: Decimal,
    shipped_qty: int | None,
    rate_type: str,
    rate: Decimal,
    tds_rate_pct: Decimal,
    vds_rate_pct: Decimal,
) -> Amounts | None:
    """Gross = value × rate% (PERCENTAGE) or pieces × rate (FIXED); net = gross − TDS − VDS. None if not computable."""
    if rate <= 0:
        return None
    if rate_type == RATE_FIXED:
        if not shipped_qty or shipped_qty <= 0:
            return None
        gross = money(Decimal(shipped_qty) * rate)
    else:
        gross = money(shipped_value * rate / HUNDRED)
    if gross <= 0:
        return None
    tds = money(gross * tds_rate_pct / HUNDRED)
    vds = money(gross * vds_rate_pct / HUNDRED)
    return Amounts(base_amount=money(shipped_value), gross=gross, tds=tds, vds=vds, net=gross - tds - vds)


def _norm_rate_type(raw: str | None) -> str:
    return RATE_FIXED if (raw or "").strip().upper() == RATE_FIXED else RATE_PERCENTAGE


def _order_terms(order: Order) -> tuple[str, Decimal] | None:
    if order.commission_value is None or not (order.commission_type or "").strip():
        return None
    return _norm_rate_type(order.commission_type), Decimal(str(order.commission_value))


async def _rule(db: AsyncSession, tenant_id: int, direction: str, scope: str, **ref: int | None) -> CommissionRule | None:
    stmt = select(CommissionRule).where(
        CommissionRule.tenant_id == tenant_id,
        CommissionRule.direction == direction,
        CommissionRule.scope == scope,
        CommissionRule.is_active.is_(True),
    )
    for col, val in ref.items():
        if val is None:
            return None
        stmt = stmt.where(getattr(CommissionRule, col) == val)
    return (await db.execute(stmt.order_by(CommissionRule.id.desc()).limit(1))).scalar_one_or_none()


async def resolve_receivable(db: AsyncSession, tenant_id: int, order: Order, shipment: CommissionShipment) -> ResolvedRate | None:
    payer = (
        (COUNTERPARTY_VENDOR, shipment.vendor_id) if shipment.vendor_id else (COUNTERPARTY_CUSTOMER, order.customer_id)
    )
    # Order commission terms describe our own commission only when no agent is attached to the order.
    terms = _order_terms(order) if not order.customer_intermediary_id else None
    if terms:
        return ResolvedRate(payer[0], payer[1], terms[0], terms[1], "order")
    if shipment.vendor_id:
        rule = await _rule(db, tenant_id, DIRECTION_RECEIVABLE, "VENDOR", vendor_id=shipment.vendor_id)
        if rule:
            return ResolvedRate(COUNTERPARTY_VENDOR, shipment.vendor_id, rule.rate_type, rule.rate, f"rule:{rule.id}")
    rule = await _rule(db, tenant_id, DIRECTION_RECEIVABLE, "CUSTOMER", customer_id=order.customer_id)
    if rule:
        return ResolvedRate(COUNTERPARTY_CUSTOMER, order.customer_id, rule.rate_type, rule.rate, f"rule:{rule.id}")
    rule = await _rule(db, tenant_id, DIRECTION_RECEIVABLE, "DEFAULT")
    if rule:
        return ResolvedRate(payer[0], payer[1], rule.rate_type, rule.rate, f"rule:{rule.id}")
    return None


async def resolve_payable(db: AsyncSession, tenant_id: int, order: Order) -> ResolvedRate | None:
    if not order.customer_intermediary_id:
        return None
    link = await db.get(CustomerIntermediary, order.customer_intermediary_id)
    if not link or link.tenant_id != tenant_id:
        return None
    agent = link.intermediary_id
    terms = _order_terms(order)
    if terms:
        return ResolvedRate(COUNTERPARTY_INTERMEDIARY, agent, terms[0], terms[1], "order")
    if link.commission_value is not None and (link.commission_type or "").strip():
        return ResolvedRate(
            COUNTERPARTY_INTERMEDIARY,
            agent,
            _norm_rate_type(link.commission_type),
            Decimal(str(link.commission_value)),
            "customer_intermediary",
        )
    rule = await _rule(db, tenant_id, DIRECTION_PAYABLE, "INTERMEDIARY", intermediary_id=agent)
    if not rule:
        rule = await _rule(db, tenant_id, DIRECTION_PAYABLE, "DEFAULT")
    if rule:
        return ResolvedRate(COUNTERPARTY_INTERMEDIARY, agent, rule.rate_type, rule.rate, f"rule:{rule.id}")
    return None


async def get_settings_row(db: AsyncSession, tenant_id: int) -> CommissionSettings | None:
    return (await db.execute(select(CommissionSettings).where(CommissionSettings.tenant_id == tenant_id))).scalar_one_or_none()


async def build_entries(db: AsyncSession, tenant_id: int, order: Order, shipment: CommissionShipment) -> list[CommissionEntry]:
    """Calculate RECEIVABLE and PAYABLE entries for one shipment (caller adds/commits)."""
    settings = await get_settings_row(db, tenant_id)
    tds_pct = settings.tds_rate_pct if settings else Decimal("0")
    vds_pct = settings.vds_rate_pct if settings else Decimal("0")
    entries: list[CommissionEntry] = []
    for direction, resolved in (
        (DIRECTION_RECEIVABLE, await resolve_receivable(db, tenant_id, order, shipment)),
        (DIRECTION_PAYABLE, await resolve_payable(db, tenant_id, order)),
    ):
        if not resolved:
            continue
        amounts = calculate_amounts(
            shipped_value=Decimal(shipment.shipped_value),
            shipped_qty=shipment.shipped_qty,
            rate_type=resolved.rate_type,
            rate=resolved.rate,
            tds_rate_pct=Decimal(tds_pct),
            vds_rate_pct=Decimal(vds_pct),
        )
        if not amounts:
            continue
        entries.append(
            CommissionEntry(
                tenant_id=tenant_id,
                shipment_id=shipment.id,
                direction=direction,
                counterparty_type=resolved.counterparty_type,
                counterparty_id=resolved.counterparty_id,
                rate_type=resolved.rate_type,
                rate=resolved.rate,
                rate_source=resolved.source,
                base_amount=amounts.base_amount,
                gross_amount=amounts.gross,
                tds_rate_pct=Decimal(tds_pct),
                tds_amount=amounts.tds,
                vds_rate_pct=Decimal(vds_pct),
                vds_amount=amounts.vds,
                net_amount=amounts.net,
                currency=shipment.currency,
                status="PENDING",
            )
        )
    return entries
