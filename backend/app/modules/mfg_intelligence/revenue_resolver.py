"""Order revenue at completion, buying commission and quotation budget (Phase 3, doc 14 sections 13 Q1 / Q8, 14 N3 / M2).

Read-only. `load_order_money_context` preloads everything for a batch of orders in a fixed number of queries
(quotations 1, proforma links 1, proforma order counts 1, customer intermediaries 1), never per order.

Revenue chain (gross, contract value; never `Quotation.quoted_price` as a unit price):
  1. order snapshot `quoted_price` (unit price) x order qty                         SNAPSHOT_QUOTED   (COMMITTED)
  2. proforma invoice amount, only when that PI links exactly one order            PI_SINGLE_ORDER   (COMMITTED)
     (a PI linking several orders is skipped: reason PI_MULTI_ORDER; several live PIs: PI_MULTIPLE_FOR_ORDER)
  3. `Quotation.total_amount` x order qty / projected qty                          QUOTATION_TOTAL_SCALED (ESTIMATED)
  else UNKNOWN (missing input `selling_price`).
FX (M2): base currency = 1; the quotation's stored `exchange_rate` when the revenue currency is the quotation
currency; anything else is UNKNOWN (left out of totals, listed in `unknown_by_currency`).

Buying commission (deduction, same semantics as `commission/service.py`): order terms describe a PAYABLE agent
commission only when the order has a customer intermediary; then order terms, else the intermediary link terms.
PERCENTAGE = gross x rate / 100, FIXED = order qty x rate (revenue currency). Net revenue = gross - commission.

Budget (same rule as finance `profitability_service._budget_and_counts`): quotation currency (else base) and its
stored `exchange_rate`; material / CM / other / revenue = column x rate. Unscaled values equal finance's order
budget exactly (contract test); the scaled budget multiplies by order qty / projected qty (reason BUDGET_SCALED).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order, ProformaInvoice, ProformaInvoiceOrder, Quotation
from app.models.parties import CustomerIntermediary
from app.modules.mfg_intelligence.decimals import ZERO, to_dec
from app.modules.mfg_intelligence.money import (
    CLASS_COMMITTED,
    CLASS_ESTIMATED,
    HUNDRED,
    ONE,
    Q4,
    RATE_UNKNOWN,
    fx,
    norm_ccy,
    positive,
    q4,
)

RATE_QUOTATION = "QUOTATION_EXCHANGE_RATE"
SRC_SNAPSHOT = "SNAPSHOT_QUOTED"
SRC_PI = "PI_SINGLE_ORDER"
SRC_QUOTATION = "QUOTATION_TOTAL_SCALED"
SRC_QUOTATION_UNSCALED = "QUOTATION_TOTAL"
PI_CLOSED_STATUSES = ("CANCELLED", "CANCELED", "VOID", "REJECTED")


@dataclass
class QuotationInfo:
    id: int
    currency: str
    exchange_rate: Decimal | None
    total_amount: Decimal | None
    material_cost: Decimal | None
    manufacturing_cost: Decimal | None
    other_cost: Decimal | None
    projected_quantity: int | None


@dataclass
class OrderMoneyContext:
    base: str
    quotations: dict[int, QuotationInfo] = field(default_factory=dict)
    pis_by_order: dict[int, list[tuple[int, Decimal | None, str | None]]] = field(default_factory=dict)
    pi_order_count: dict[int, int] = field(default_factory=dict)
    intermediary_terms: dict[int, tuple[str | None, Any]] = field(default_factory=dict)


@dataclass
class Revenue:
    source: str | None = None
    value_class: str | None = None
    currency: str | None = None
    gross_source: Decimal | None = None
    rate: Decimal | None = None
    rate_source: str | None = None
    gross_base: Decimal | None = None
    commission_source: Decimal = ZERO
    commission_base: Decimal | None = None
    commission_basis: str | None = None
    net_base: Decimal | None = None
    reason_codes: list[str] = field(default_factory=list)
    missing_inputs: list[str] = field(default_factory=list)


@dataclass
class Budget:
    usable: bool
    currency: str | None = None
    rate: Decimal | None = None
    rate_source: str | None = None
    scale_factor: Decimal | None = None
    unscaled: dict[str, Decimal] = field(default_factory=dict)  # finance rule, 4 decimals
    scaled: dict[str, Decimal] = field(default_factory=dict)  # x order qty / projected qty, 4 decimals
    reason_codes: list[str] = field(default_factory=list)


def _snapshot_currency(order: Order) -> str | None:
    snap = order.commercial_snapshot_json if isinstance(order.commercial_snapshot_json, dict) else {}
    for key in ("document_currency", "target_price_currency", "currency"):
        ccy = norm_ccy(snap.get(key))
        if ccy:
            return ccy
    return None


async def load_order_money_context(db: AsyncSession, tenant_id: int, base: str, orders: list[Order]) -> OrderMoneyContext:
    ctx = OrderMoneyContext(base=base)
    if not orders:
        return ctx
    order_ids = [o.id for o in orders]
    q_ids = {int(o.quotation_id) for o in orders if o.quotation_id}
    if q_ids:
        for row in (
            await db.execute(
                select(
                    Quotation.id,
                    Quotation.currency,
                    Quotation.exchange_rate,
                    Quotation.total_amount,
                    Quotation.material_cost,
                    Quotation.manufacturing_cost,
                    Quotation.other_cost,
                    Quotation.projected_quantity,
                ).where(Quotation.tenant_id == tenant_id, Quotation.id.in_(q_ids))
            )
        ).all():
            ctx.quotations[int(row[0])] = QuotationInfo(
                id=int(row[0]),
                currency=norm_ccy(row[1]) or base,
                exchange_rate=to_dec(row[2]),
                total_amount=to_dec(row[3]),
                material_cost=to_dec(row[4]),
                manufacturing_cost=to_dec(row[5]),
                other_cost=to_dec(row[6]),
                projected_quantity=int(row[7]) if row[7] else None,
            )
    pis: dict[int, list[tuple[int, Decimal | None, str | None]]] = defaultdict(list)
    for oid, pi_id, amount, ccy in (
        await db.execute(
            select(ProformaInvoiceOrder.order_id, ProformaInvoice.id, ProformaInvoice.amount, ProformaInvoice.currency)
            .join(ProformaInvoice, ProformaInvoice.id == ProformaInvoiceOrder.proforma_invoice_id)
            .where(
                ProformaInvoice.tenant_id == tenant_id,
                ProformaInvoiceOrder.order_id.in_(order_ids),
                func.upper(func.coalesce(ProformaInvoice.direction, "EXPORT")) != "IMPORT",
                func.upper(func.coalesce(ProformaInvoice.status, "")).notin_(PI_CLOSED_STATUSES),
            )
        )
    ).all():
        pis[int(oid)].append((int(pi_id), to_dec(amount), norm_ccy(ccy)))
    ctx.pis_by_order = dict(pis)
    pi_ids = {p[0] for rows in pis.values() for p in rows}
    if pi_ids:
        ctx.pi_order_count = {
            int(pid): int(n)
            for pid, n in (
                await db.execute(
                    select(ProformaInvoiceOrder.proforma_invoice_id, func.count(ProformaInvoiceOrder.id))
                    .where(ProformaInvoiceOrder.proforma_invoice_id.in_(pi_ids))
                    .group_by(ProformaInvoiceOrder.proforma_invoice_id)
                )
            ).all()
        }
    ci_ids = {int(o.customer_intermediary_id) for o in orders if o.customer_intermediary_id}
    if ci_ids:
        ctx.intermediary_terms = {
            int(cid): (ctype, cval)
            for cid, ctype, cval in (
                await db.execute(
                    select(CustomerIntermediary.id, CustomerIntermediary.commission_type, CustomerIntermediary.commission_value).where(
                        CustomerIntermediary.tenant_id == tenant_id, CustomerIntermediary.id.in_(ci_ids)
                    )
                )
            ).all()
        }
    return ctx


def _qty(order: Order) -> Decimal | None:
    q = to_dec(order.quantity)
    return q if q is not None and q > ZERO else None


def scale_factor(order: Order, quotation: QuotationInfo | None) -> Decimal | None:
    """order qty / projected qty, or None when either is missing."""
    qty = _qty(order)
    if quotation is None or qty is None or not quotation.projected_quantity or quotation.projected_quantity <= 0:
        return None
    return qty / Decimal(quotation.projected_quantity)


def _revenue_rate(currency: str, ctx: OrderMoneyContext, quotation: QuotationInfo | None) -> tuple[Decimal | None, str]:
    if currency == ctx.base:
        return fx(currency, ctx.base, None, RATE_QUOTATION)
    if quotation is not None and currency == quotation.currency:
        return fx(currency, ctx.base, quotation.exchange_rate, RATE_QUOTATION)
    return None, RATE_UNKNOWN


def _commission_terms(order: Order, ctx: OrderMoneyContext) -> tuple[str, Decimal] | None:
    if not order.customer_intermediary_id:
        return None
    ctype, cval = order.commission_type, order.commission_value
    if cval is None or not (ctype or "").strip():
        ctype, cval = ctx.intermediary_terms.get(int(order.customer_intermediary_id), (None, None))
    rate = positive(cval)
    if rate is None or not (ctype or "").strip():
        return None
    return ("FIXED" if str(ctype).strip().upper() == "FIXED" else "PERCENTAGE"), rate


def resolve_revenue(order: Order, ctx: OrderMoneyContext) -> Revenue:
    rev = Revenue()
    qty = _qty(order)
    quotation = ctx.quotations.get(int(order.quotation_id)) if order.quotation_id else None
    snap = order.commercial_snapshot_json if isinstance(order.commercial_snapshot_json, dict) else {}
    unit = positive(snap.get("quoted_price"))
    if unit is not None and qty is not None:
        rev.source, rev.value_class = SRC_SNAPSHOT, CLASS_COMMITTED
        rev.currency = _snapshot_currency(order) or (quotation.currency if quotation else ctx.base)
        rev.gross_source = q4(unit * qty)
    else:
        pi_rows = ctx.pis_by_order.get(order.id, [])
        single = [p for p in pi_rows if ctx.pi_order_count.get(p[0], 0) == 1]
        if any(ctx.pi_order_count.get(p[0], 0) > 1 for p in pi_rows):
            rev.reason_codes.append("PI_MULTI_ORDER")
        if len(single) > 1:
            rev.reason_codes.append("PI_MULTIPLE_FOR_ORDER")
        elif len(single) == 1 and positive(single[0][1]) is not None:
            rev.source, rev.value_class = SRC_PI, CLASS_COMMITTED
            rev.currency = single[0][2] or (quotation.currency if quotation else ctx.base)
            rev.gross_source = q4(single[0][1])
        if rev.source is None and quotation is not None and positive(quotation.total_amount) is not None:
            factor = scale_factor(order, quotation)
            rev.currency = quotation.currency
            rev.value_class = CLASS_ESTIMATED
            if factor is not None:
                rev.source = SRC_QUOTATION
                rev.gross_source = q4(quotation.total_amount * factor)
            else:
                rev.source = SRC_QUOTATION_UNSCALED
                rev.gross_source = q4(quotation.total_amount)
                rev.reason_codes.append("REVENUE_NOT_SCALED_NO_PROJECTED_QTY")
            rev.reason_codes.append("REVENUE_FROM_QUOTATION")
    if rev.source is None:
        rev.reason_codes.append("REVENUE_UNKNOWN")
        rev.missing_inputs.append("selling_price")
        return rev
    rev.rate, rev.rate_source = _revenue_rate(rev.currency or ctx.base, ctx, quotation)
    terms = _commission_terms(order, ctx)
    if terms is not None:
        kind, rate = terms
        if kind == "FIXED":
            rev.commission_source = q4(rate * qty) if qty is not None else ZERO
        else:
            rev.commission_source = q4(rev.gross_source * rate / HUNDRED)
        rev.commission_basis = kind
    if rev.rate is None:
        rev.reason_codes.append("REVENUE_FX_UNKNOWN")
        rev.missing_inputs.append(f"exchange_rate:{rev.currency}")
        return rev
    rev.gross_base = q4(rev.gross_source * rev.rate)
    rev.commission_base = q4(rev.commission_source * rev.rate)
    rev.net_base = rev.gross_base - rev.commission_base
    return rev


_BUDGET_COLUMNS = (
    ("revenue", "total_amount"),
    ("material", "material_cost"),
    ("cm", "manufacturing_cost"),
    ("other", "other_cost"),
)


def resolve_budget(order: Order, ctx: OrderMoneyContext) -> Budget:
    quotation = ctx.quotations.get(int(order.quotation_id)) if order.quotation_id else None
    if quotation is None:
        return Budget(usable=False, reason_codes=["NO_QUOTATION_BUDGET"])
    rate, rate_source = fx(quotation.currency, ctx.base, quotation.exchange_rate, RATE_QUOTATION)
    if rate is None:
        return Budget(
            usable=False, currency=quotation.currency, rate_source=RATE_UNKNOWN, reason_codes=["BUDGET_FX_UNKNOWN"]
        )
    out = Budget(usable=True, currency=quotation.currency, rate=rate, rate_source=rate_source)
    factor = scale_factor(order, quotation)
    out.scale_factor = factor
    if factor is not None and factor != ONE:
        out.reason_codes.append("BUDGET_SCALED")
    elif factor is None:
        out.reason_codes.append("BUDGET_NOT_SCALED_NO_PROJECTED_QTY")
    for key, attr in _BUDGET_COLUMNS:
        exact = (getattr(quotation, attr) or ZERO) * rate
        out.unscaled[key] = exact.quantize(Q4)  # same rounding as finance `_q` (context default)
        out.scaled[key] = q4(exact * factor) if factor is not None else q4(exact)
    return out
