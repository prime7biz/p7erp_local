"""Commission calculation and rate resolution (pure money maths + rule lookup)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
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
    fixed_gross: Decimal | None = None,
) -> Amounts | None:
    """Gross = value × rate% (PERCENTAGE) or pieces × rate (FIXED); net = gross − TDS − VDS. None if not computable.

    ``fixed_gross`` is the already-allocated share of a PER-ORDER fixed commission for this shipment
    (see ``per_order_fixed_gross``); it replaces pieces × rate for that case only."""
    if rate <= 0:
        return None
    if rate_type == RATE_FIXED:
        if fixed_gross is not None:
            gross = money(fixed_gross)
        else:
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


def is_per_order_fixed(order: Order) -> bool:
    """True when the order came from a dozen-first quotation whose FIXED commission is ONE amount for the order."""
    snap = order.commercial_snapshot_json if isinstance(order.commercial_snapshot_json, dict) else {}
    return str(snap.get("fixed_commission_basis") or "").strip().upper() == "PER_ORDER"


async def per_order_fixed_gross(
    db: AsyncSession,
    tenant_id: int,
    order: Order,
    shipment: CommissionShipment,
    resolved: ResolvedRate,
    direction: str,
) -> Decimal | None:
    """Share of a per-order fixed commission recognised on ``shipment``.

    Proportional to shipped quantity, capped so the cumulative total never passes the order amount, and the
    shipment that completes the order quantity takes the rounding remainder. None = nothing to recognise.
    """
    order_qty = int(order.quantity or 0)
    shipped = int(shipment.shipped_qty or 0)
    if order_qty <= 0 or shipped <= 0:
        return None
    # Serialise concurrent shipments of one order so two requests cannot both take the remainder.
    await db.execute(select(Order.id).where(Order.id == order.id, Order.tenant_id == tenant_id).with_for_update())
    total = money(resolved.rate)
    prior_qty = int(
        await db.scalar(
            select(func.coalesce(func.sum(CommissionShipment.shipped_qty), 0)).where(
                CommissionShipment.tenant_id == tenant_id,
                CommissionShipment.order_id == order.id,
                CommissionShipment.id != shipment.id,
            )
        )
        or 0
    )
    prior_gross = Decimal(
        str(
            await db.scalar(
                select(func.coalesce(func.sum(CommissionEntry.gross_amount), 0))
                .join(CommissionShipment, CommissionShipment.id == CommissionEntry.shipment_id)
                .where(
                    CommissionEntry.tenant_id == tenant_id,
                    CommissionShipment.order_id == order.id,
                    CommissionShipment.id != shipment.id,
                    CommissionEntry.direction == direction,
                    # No counterparty filter: the order amount is ONE amount, whichever factory ships it.
                    CommissionEntry.rate_source == "order",
                )
            )
            or 0
        )
    )
    remaining = total - prior_gross
    if remaining <= 0:
        return None
    if prior_qty + shipped >= order_qty:
        return remaining  # final shipment: whatever is left, so the entries add up to the order amount
    return min(money(total * Decimal(shipped) / Decimal(order_qty)), remaining)


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
        fixed_gross: Decimal | None = None
        if resolved.rate_type == RATE_FIXED and resolved.source == "order" and is_per_order_fixed(order):
            fixed_gross = await per_order_fixed_gross(db, tenant_id, order, shipment, resolved, direction)
            if fixed_gross is None:
                continue
        amounts = calculate_amounts(
            shipped_value=Decimal(shipment.shipped_value),
            shipped_qty=shipment.shipped_qty,
            rate_type=resolved.rate_type,
            rate=resolved.rate,
            tds_rate_pct=Decimal(tds_pct),
            vds_rate_pct=Decimal(vds_pct),
            fixed_gross=fixed_gross,
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
