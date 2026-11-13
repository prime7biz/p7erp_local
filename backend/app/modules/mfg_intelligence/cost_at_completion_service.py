"""Order cost at completion (Manufacturing Intelligence Phase 3; doc 14 sections 12-14 are binding). Read-only.

Per confirmed order (status NEW / CONFIRMED / IN_PROGRESS), all amounts in base currency, Decimal, 4 decimals:

    revenue (gross, net)  revenue_resolver (contract value chain, buying commission deducted for net)
    budget                quotation budget, finance rule, scaled by order qty / projected qty (BUDGET_SCALED)
    material budget       approved / frozen Order BOM (sum of bom_expected_total_cost, else quoted_total_cost, x order
                          qty / order_qty_at_approval (else order_qty_snapshot); converted with the quotation rate only
                          when the BOM currency is the quotation currency or base), else scaled quotation material
    procured (COMMITTED)  PO lines where coalesce(line.source_order_id, po.source_order_id) = order:
                          APPROVED / PARTIALLY_RECEIVED / FULLY_RECEIVED -> ordered qty x unit price x PO rate;
                          CLOSED -> QC-accepted qty (RECEIVED GRNs) x unit price x PO rate; DRAFT / SUBMITTED /
                          CANCELLED excluded; a foreign PO without a stored rate is UNKNOWN (listed, not added)
    remaining material    max(0, material budget - procured)                                 (ESTIMATED)
    conversion            order SAH minutes (qty x SMV) x CPM (cpm_service; `cpm_override` wins) (ESTIMATED);
                          CPM or SMV unknown -> scaled budget CM, status PARTIAL, NO_ORDER_COST_POSTING + CPM_UNKNOWN
    other                 scaled quotation other cost                                        (ESTIMATED)
    EAC                   procured + remaining material + conversion + other (each rounded first: reconciles exactly)
    margin                net revenue - EAC; margin % = margin / net revenue x 100 (null when revenue is 0 / unknown)
    progress p            sewing-department hourly good qty / order qty (cap 1); fallback plan completed qty;
                          none -> UNKNOWN. Informational split: earned = conversion x p, remaining = conversion x (1-p).

GL order actual is never added to EAC (doc 14 section 12 #1): the single-order endpoint shows it from the public
finance `build_entity_profit` (informational; GL_MATERIAL_EXCEEDS_PROCURED when GL material > procured).

Query budget for a batch (independent of the number of orders): revenue context 4, BOM 1, PO lines 1, closed
receipts 1, sewing output 1, plan rows 1, SMV <= 3, settings 1, CPM <= 9 (none with an override).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bom, BomItem, HourlyProductionEntry, Order, Tenant
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, PurchaseOrder, PurchaseOrderItem
from app.modules.inventory.open_po_supply_service import usable_received_qty
from app.modules.mfg_intelligence.confirmed_demand import is_confirmed_status
from app.modules.mfg_intelligence.cpm_service import CpmResult, compute_cpm, order_smv_map, sewing_clause
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, to_dec
from app.modules.mfg_intelligence.line_loading_service import fetch_order_plan_rows
from app.modules.mfg_intelligence.money import (
    CLASS_ACTUAL,
    CLASS_COMMITTED,
    CLASS_ESTIMATED,
    HUNDRED,
    ONE,
    UnknownByCurrency,
    base_currency,
    fx,
    m4,
    norm_ccy,
    positive,
    q4,
    value_out,
)
from app.modules.mfg_intelligence.readiness_service import APPROVED_BOM_STATUSES
from app.modules.mfg_intelligence.revenue_resolver import (
    RATE_QUOTATION,
    Budget,
    OrderMoneyContext,
    Revenue,
    load_order_money_context,
    resolve_budget,
    resolve_revenue,
)
from app.modules.production.planning_settings_service import parse_cpm_override, read_planning_settings

MAX_ORDERS = 200
# PO status allowlist (verified in inventory/router.py PO_TRANSITIONS; doc 14 M6)
PO_ORDERED_BASIS_STATUSES = ("APPROVED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED")
PO_ACCEPTED_BASIS_STATUSES = ("CLOSED",)
RATE_PO = "PO_EXCHANGE_RATE"

STATUS_COMPLETE = "COMPLETE_DATA"
STATUS_PARTIAL = "PARTIAL"
STATUS_UNKNOWN = "UNKNOWN"

PROGRESS_HOURLY = "HOURLY_SEWING_GOOD_QTY"
PROGRESS_PLAN = "PLAN_COMPLETED_QTY"
PROGRESS_UNKNOWN = "UNKNOWN"

FINANCE_LINK = "/app/finance/profitability/entity?kind=order&id={order_id}"
ASSUMPTIONS = [
    "Estimate - not posted. Nothing here is an accounting entry.",
    "Revenue at completion = contract value (snapshot price, single-order PI, else quotation total scaled to order qty).",
    "Material at completion = procured purchase-order value + the part of the material budget not yet procured.",
    "Conversion at completion = order standard minutes x factory cost per minute; factory overhead is not allocated.",
    "Ledger (GL) order cost is shown for information only and never added to the estimate.",
]


@dataclass
class Procured:
    base: Decimal = ZERO
    lines: int = 0
    unknown_lines: int = 0
    unknown: UnknownByCurrency = field(default_factory=UnknownByCurrency)
    currencies: set[str] = field(default_factory=set)
    rate_sources: set[str] = field(default_factory=set)
    assumed_base_lines: int = 0


@dataclass
class BomBudget:
    bom_id: int
    status: str
    amount_base: Decimal | None
    reason_codes: list[str]


@dataclass
class BatchData:
    ctx: OrderMoneyContext
    procured: dict[int, Procured]
    bom: dict[int, BomBudget]
    sewing_good: dict[int, Decimal]
    plan_done: dict[int, Decimal]
    has_plan: set[int]
    smv: dict[int, Any]
    cpm: CpmResult


# ------------------------------------------------------------------ batched reads


async def _procured_by_order(db: AsyncSession, tenant_id: int, base: str, order_ids: list[int]) -> dict[int, Procured]:
    eff_order = func.coalesce(PurchaseOrderItem.source_order_id, PurchaseOrder.source_order_id)
    status = func.upper(func.trim(PurchaseOrder.status))
    rows = (
        await db.execute(
            select(
                PurchaseOrderItem.id,
                eff_order,
                status,
                PurchaseOrderItem.quantity,
                PurchaseOrderItem.unit_price,
                PurchaseOrder.currency,
                PurchaseOrder.exchange_rate_to_base,
            )
            .join(PurchaseOrder, and_(PurchaseOrder.id == PurchaseOrderItem.purchase_order_id, PurchaseOrder.tenant_id == tenant_id))
            .where(
                PurchaseOrderItem.tenant_id == tenant_id,
                eff_order.in_(order_ids),
                status.in_(PO_ORDERED_BASIS_STATUSES + PO_ACCEPTED_BASIS_STATUSES),
            )
        )
    ).all()
    closed_line_ids = [int(r[0]) for r in rows if r[2] in PO_ACCEPTED_BASIS_STATUSES]
    accepted: dict[int, Decimal] = defaultdict(lambda: ZERO)
    if closed_line_ids:
        for line_id, acc, rec in (
            await db.execute(
                select(GoodsReceivingItem.purchase_order_line_id, GoodsReceivingItem.accepted_qty, GoodsReceivingItem.received_qty)
                .join(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
                .where(
                    GoodsReceiving.tenant_id == tenant_id,
                    GoodsReceivingItem.tenant_id == tenant_id,
                    GoodsReceiving.status == "RECEIVED",
                    GoodsReceivingItem.purchase_order_line_id.in_(closed_line_ids),
                )
            )
        ).all():
            accepted[int(line_id)] += usable_received_qty(acc, rec)
    out: dict[int, Procured] = defaultdict(Procured)
    for line_id, oid, st, qty, price, ccy, rate in rows:
        p = out[int(oid)]
        quantity = accepted[int(line_id)] if st in PO_ACCEPTED_BASIS_STATUSES else (to_dec(qty) or ZERO)
        source_amount = quantity * (to_dec(price) or ZERO)
        currency = norm_ccy(ccy)
        if currency is None:
            p.assumed_base_lines += 1
        r, r_src = fx(currency, base, rate, RATE_PO)
        p.lines += 1
        p.currencies.add(currency or base)
        if r is None:
            p.unknown_lines += 1
            p.unknown.add(currency, source_amount)
            continue
        p.rate_sources.add(r_src)
        p.base += source_amount * r
    for p in out.values():
        p.base = q4(p.base)
    return dict(out)


async def _bom_budgets(
    db: AsyncSession, tenant_id: int, base: str, orders: list[Order], ctx: OrderMoneyContext
) -> dict[int, BomBudget]:
    priced = func.coalesce(BomItem.bom_expected_total_cost, BomItem.quoted_total_cost)
    rows = (
        await db.execute(
            select(
                Bom.id,
                Bom.order_id,
                func.upper(func.trim(Bom.status)),
                Bom.currency_snapshot,
                Bom.order_qty_at_approval,
                Bom.order_qty_snapshot,
                func.count(BomItem.id),
                func.count(priced),
                func.coalesce(func.sum(priced), 0),
            )
            .outerjoin(BomItem, and_(BomItem.bom_id == Bom.id, BomItem.tenant_id == tenant_id))
            .where(
                Bom.tenant_id == tenant_id,
                Bom.order_id.in_([o.id for o in orders]),
                Bom.is_active.is_(True),
                func.upper(func.trim(Bom.status)).in_(APPROVED_BOM_STATUSES),
            )
            .group_by(Bom.id, Bom.order_id, Bom.status, Bom.currency_snapshot, Bom.order_qty_at_approval, Bom.order_qty_snapshot)
            .order_by(Bom.id.desc())
        )
    ).all()
    by_id = {o.id: o for o in orders}
    out: dict[int, BomBudget] = {}
    for bom_id, oid, status, ccy, qty_appr, qty_snap, n_items, n_priced, total in rows:
        oid = int(oid)
        if oid in out:
            continue
        order = by_id[oid]
        reasons: list[str] = []
        amount: Decimal | None = None
        quotation = ctx.quotations.get(int(order.quotation_id)) if order.quotation_id else None
        qty = to_dec(order.quantity)
        qty_base = qty_appr or qty_snap
        currency = norm_ccy(ccy)
        if not n_items or n_priced < n_items:
            reasons.append("BOM_NOT_PRICED" if not n_priced else "BOM_PARTIALLY_PRICED")
        elif not qty_base or qty_base <= 0 or qty is None or qty <= ZERO:
            reasons.append("BOM_QTY_BASE_MISSING")
        elif currency is None:
            reasons.append("BOM_CURRENCY_UNKNOWN")
        else:
            rate = None
            if currency == base:
                rate = ONE
            elif quotation is not None and currency == quotation.currency:
                rate = positive(quotation.exchange_rate)
            if rate is None:
                reasons.append("BOM_FX_UNKNOWN")
            else:
                amount = q4((to_dec(total) or ZERO) * qty / Decimal(int(qty_base)) * rate)
        out[oid] = BomBudget(bom_id=int(bom_id), status=status, amount_base=amount, reason_codes=reasons)
    return out


async def _progress(db: AsyncSession, tenant_id: int, order_ids: list[int]) -> tuple[dict[int, Decimal], list[Any]]:
    sewing = {
        int(oid): to_dec(total) or ZERO
        for oid, total in (
            await db.execute(
                select(HourlyProductionEntry.order_id, func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0))
                .where(
                    HourlyProductionEntry.tenant_id == tenant_id,
                    HourlyProductionEntry.order_id.in_(order_ids),
                    sewing_clause(),
                )
                .group_by(HourlyProductionEntry.order_id)
            )
        ).all()
    }
    plan_rows = await fetch_order_plan_rows(db, tenant_id, order_ids, include_completed=True)
    return sewing, plan_rows


async def load_batch(db: AsyncSession, tenant: Tenant, orders: list[Order], *, today: date, use_style_standard: bool) -> BatchData:
    base = base_currency(tenant)
    order_ids = [o.id for o in orders]
    ctx = await load_order_money_context(db, tenant.id, base, orders)
    procured = await _procured_by_order(db, tenant.id, base, order_ids) if order_ids else {}
    bom = await _bom_budgets(db, tenant.id, base, orders, ctx) if order_ids else {}
    sewing, plan_rows = await _progress(db, tenant.id, order_ids) if order_ids else ({}, [])
    plan_done: dict[int, Decimal] = defaultdict(lambda: ZERO)
    has_plan: set[int] = set()
    for r in plan_rows:
        plan_done[int(r.order_id)] += to_dec(r.completed_qty) or ZERO
        has_plan.add(int(r.order_id))
    smv = await order_smv_map(
        db, tenant.id, {o.id: o.style_id for o in orders}, use_style_standard=use_style_standard, plan_rows=plan_rows
    )
    settings = await read_planning_settings(db, tenant.id)
    try:
        override = parse_cpm_override(settings.get("cpm_override"))
    except Exception:  # noqa: BLE001 - stored junk is ignored (settings reader already cleans it)
        override = None
    cpm = await compute_cpm(db, tenant.id, today=today, override=override, use_style_standard=use_style_standard)
    return BatchData(
        ctx=ctx, procured=procured, bom=bom, sewing_good=sewing, plan_done=dict(plan_done), has_plan=has_plan, smv=smv, cpm=cpm
    )


# ------------------------------------------------------------------ pure calculation


def material_eac(procured: Decimal, budget: Decimal | None) -> tuple[Decimal | None, Decimal]:
    """(remaining material, material EAC). Remaining is never negative; unknown budget = only what is procured."""
    if budget is None:
        return None, q4(procured)
    remaining = q4(max(ZERO, budget - procured))
    return remaining, q4(procured) + remaining


def progress_ratio(produced: Decimal | None, qty: Decimal | None) -> Decimal | None:
    if produced is None or qty is None or qty <= ZERO:
        return None
    return min(ONE, max(ZERO, produced / qty))


def margin_pct(margin: Decimal | None, revenue: Decimal | None) -> Decimal | None:
    if margin is None or revenue is None or revenue == ZERO:
        return None
    return q4(margin / revenue * HUNDRED)


def _revenue_block(rev: Revenue) -> dict[str, Any]:
    reasons, missing = rev.reason_codes, rev.missing_inputs
    gross = value_out(
        rev.gross_base, rev.value_class or CLASS_ESTIMATED, rev.source, currency=rev.currency,
        source_amount=rev.gross_source, rate=rev.rate, rate_source=rev.rate_source, reason_codes=reasons, missing_inputs=missing,
    )
    commission = value_out(
        rev.commission_base if rev.source else None, rev.value_class or CLASS_ESTIMATED,
        f"ORDER_COMMISSION_{rev.commission_basis}" if rev.commission_basis else "NO_PAYABLE_COMMISSION",
        currency=rev.currency, source_amount=rev.commission_source if rev.source else None, rate=rev.rate,
        rate_source=rev.rate_source,
    )
    net = value_out(
        rev.net_base, rev.value_class or CLASS_ESTIMATED, "GROSS_LESS_COMMISSION", currency=None,
        reason_codes=reasons, missing_inputs=missing,
    )
    return {"gross": gross, "commission": commission, "net": net}


def _budget_block(b: Budget) -> dict[str, Any]:
    def strs(d: dict[str, Decimal]) -> dict[str, str | None]:
        return {k: m4(d.get(k)) for k in ("revenue", "material", "cm", "other")} if d else {k: None for k in ("revenue", "material", "cm", "other")}

    return {
        "usable": b.usable,
        "source": "QUOTATION_BUDGET",
        "value_class": CLASS_ESTIMATED,
        "currency": b.currency,
        "rate": format(b.rate.normalize(), "f") if b.rate is not None else None,
        "rate_source": b.rate_source,
        "scale_factor": format(q4(b.scale_factor), "f") if b.scale_factor is not None else None,
        "scaled": strs(b.scaled),
        "unscaled": strs(b.unscaled),
        "reason_codes": list(b.reason_codes),
    }


def build_order_cost(order: Order, data: BatchData, tenant: Tenant) -> dict[str, Any]:
    base = base_currency(tenant)
    reasons: list[str] = []
    missing: list[str] = []
    partial = False
    qty = to_dec(order.quantity)
    if not is_confirmed_status(order.status):
        reasons.append("ORDER_NOT_CONFIRMED")
    if qty is None or qty <= ZERO:
        reasons.append("ORDER_QUANTITY_MISSING")
        missing.append("order_quantity")
        qty = None

    rev = resolve_revenue(order, data.ctx)
    budget = resolve_budget(order, data.ctx)
    reasons += [r for r in budget.reason_codes if r in ("NO_QUOTATION_BUDGET", "BUDGET_FX_UNKNOWN")]
    unknown = UnknownByCurrency()
    if rev.gross_base is None and rev.gross_source is not None:
        unknown.add(rev.currency, rev.gross_source)

    # material
    proc = data.procured.get(order.id, Procured())
    for ccy, amount in proc.unknown.as_dict().items():
        unknown.add(ccy, Decimal(amount))
    mat_reasons: list[str] = []
    bom = data.bom.get(order.id)
    mat_budget: Decimal | None = None
    mat_source: str | None = None
    if bom is not None and bom.amount_base is not None:
        mat_budget, mat_source = bom.amount_base, "ORDER_BOM_SCALED"
    else:
        if bom is not None:
            mat_reasons += bom.reason_codes
        if budget.usable:
            mat_budget, mat_source = budget.scaled["material"], "QUOTATION_MATERIAL_SCALED"
            mat_reasons.append("MATERIAL_BUDGET_FROM_QUOTATION")
    if mat_budget is None:
        mat_reasons.append("MATERIAL_BUDGET_UNKNOWN")
        missing.append("material_budget")
        partial = True
    if proc.unknown_lines:
        mat_reasons.append("PO_FX_UNKNOWN")
        missing.append("po_exchange_rate")
        partial = True
    if proc.assumed_base_lines:
        mat_reasons.append("PO_CURRENCY_ASSUMED_BASE")
    remaining_mat, mat_eac = material_eac(proc.base, mat_budget)

    # conversion
    smv_res = data.smv.get(order.id)
    smv = smv_res.value if smv_res is not None else None
    sah = q4(qty * smv) if qty is not None and smv is not None else None
    conv_reasons: list[str] = []
    cpm = data.cpm
    conversion: Decimal | None = None
    conv_source: str | None = None
    if sah is not None and cpm.value is not None:
        conversion, conv_source = q4(sah * cpm.value), "ORDER_SAH_X_CPM"
    else:
        if smv is None:
            conv_reasons.append("SMV_UNKNOWN")
            missing.append("smv")
        if cpm.value is None:
            conv_reasons += [r for r in cpm.reason_codes if r != "CPM_UNKNOWN"]
            conv_reasons.append("CPM_UNKNOWN")
            missing.append("cpm")
        conv_reasons.append("NO_ORDER_COST_POSTING")
        partial = True
        if budget.usable:
            conversion, conv_source = budget.scaled["cm"], "QUOTATION_CM_SCALED"
            conv_reasons.append("CONVERSION_FROM_BUDGET_CM")
    budget_cm = budget.scaled.get("cm") if budget.usable else None
    variance = q4(budget_cm - conversion) if budget_cm is not None and conversion is not None and conv_source == "ORDER_SAH_X_CPM" else None

    other = budget.scaled["other"] if budget.usable else None
    if other is None:
        missing.append("other_cost_budget")

    # progress (informational)
    sewing = data.sewing_good.get(order.id)
    plan_done = data.plan_done.get(order.id) if order.id in data.has_plan else None
    if sewing is not None:
        produced, p_source = sewing, PROGRESS_HOURLY
    elif plan_done is not None:
        produced, p_source = plan_done, PROGRESS_PLAN
    else:
        produced, p_source = None, PROGRESS_UNKNOWN
    p = progress_ratio(produced, qty)
    if p is None:
        reasons.append("PROGRESS_UNKNOWN")
        partial = True
    earned_conv = q4(conversion * p) if conversion is not None and p is not None else None
    remaining_conv = q4(conversion - earned_conv) if earned_conv is not None and conversion is not None else None

    eac: Decimal | None = None
    if conversion is not None and other is not None:
        eac = mat_eac + conversion + other
    net = rev.net_base
    margin = (net - eac) if net is not None and eac is not None else None
    if eac is None or rev.gross_base is None:
        status = STATUS_UNKNOWN
    elif partial or unknown:
        status = STATUS_PARTIAL
    else:
        status = STATUS_COMPLETE

    rate_srcs = sorted(proc.rate_sources)
    return {
        "order_id": order.id,
        "order_code": order.order_code,
        "order_status": (order.status or "").strip().upper(),
        "order_qty": dec_str(qty, 3),
        "delivery_date": order.delivery_date,
        "base_currency": base,
        "status": status,
        "reason_codes": list(dict.fromkeys(reasons + rev.reason_codes)),
        "missing_inputs": list(dict.fromkeys(missing + rev.missing_inputs)),
        "revenue": _revenue_block(rev),
        "budget": _budget_block(budget),
        "material": {
            "procured": value_out(
                proc.base, CLASS_COMMITTED, "PURCHASE_ORDERS",
                currency=",".join(sorted(proc.currencies)) or None,
                rate_source=",".join(rate_srcs) or None,
                reason_codes=[r for r in mat_reasons if r.startswith("PO_")],
            ),
            "budget": value_out(mat_budget, CLASS_ESTIMATED, mat_source, reason_codes=[r for r in mat_reasons if not r.startswith("PO_")]),
            "remaining": value_out(remaining_mat, CLASS_ESTIMATED, "MATERIAL_BUDGET_LESS_PROCURED"),
            "eac": value_out(mat_eac, CLASS_ESTIMATED, "PROCURED_PLUS_REMAINING", reason_codes=mat_reasons),
            "po_lines": proc.lines,
            "po_lines_unknown_fx": proc.unknown_lines,
            "bom_id": bom.bom_id if bom is not None else None,
        },
        "conversion": {
            "smv": dec_str(smv, 4),
            "smv_source": smv_res.source if smv_res is not None else None,
            "sah_minutes": m4(sah),
            "cpm": m4(cpm.value),
            "cpm_source": cpm.source if cpm.value is not None else None,
            "eac": value_out(conversion, CLASS_ESTIMATED, conv_source, reason_codes=conv_reasons),
            "budget_cm": m4(budget_cm),
            "variance_vs_budget_cm": m4(variance),
        },
        "other": value_out(other, CLASS_ESTIMATED, "QUOTATION_OTHER_SCALED" if other is not None else None),
        "progress": {
            "p": dec_str(p, 4),
            "source": p_source,
            "sewing_good_qty": dec_str(sewing, 3),
            "plan_completed_qty": dec_str(plan_done, 3),
            "produced_qty": dec_str(produced, 3),
            "earned_conversion": m4(earned_conv),
            "remaining_conversion": m4(remaining_conv),
        },
        "eac": value_out(eac, CLASS_ESTIMATED, "MATERIAL_PLUS_CONVERSION_PLUS_OTHER"),
        "margin": {
            "amount": m4(margin),
            "margin_pct": m4(margin_pct(margin, net)),
            "basis": "NET_REVENUE",
            "value_class": CLASS_ESTIMATED,
        },
        "unknown_by_currency": unknown.as_dict(),
        "gl_actual": None,
        "finance_link": FINANCE_LINK.format(order_id=order.id),
    }


def cpm_block(cpm: CpmResult) -> dict[str, Any]:
    return {
        "value": m4(cpm.value),
        "source": cpm.source,
        "period_start": cpm.period_start,
        "period_end": cpm.period_end,
        "cm_total": m4(cpm.cm_total),
        "earned_minutes": m4(cpm.earned_minutes),
        "reason_codes": list(dict.fromkeys(cpm.reason_codes)),
        "warnings": cpm.warnings,
    }


def gl_actual_block(profit: Any, procured_base: Decimal | None) -> dict[str, Any]:
    """Informational GL order actual from finance `build_entity_profit` (never added to the estimate)."""
    actual = profit.actual
    material = to_dec(actual.material) or ZERO
    reasons: list[str] = []
    if procured_base is not None and material > procured_base:
        reasons.append("GL_MATERIAL_EXCEEDS_PROCURED")
    return {
        "value_class": CLASS_ACTUAL,
        "source": "FINANCE_ORDER_PROFITABILITY",
        "revenue": m4(to_dec(actual.revenue)),
        "material": m4(material),
        "cm": m4(to_dec(actual.cm)),
        "other": m4(to_dec(actual.other)),
        "overhead": m4(to_dec(actual.overhead)),
        "finance_cost": m4(to_dec(actual.finance_cost)),
        "direct_voucher_lines": int(profit.coverage.direct_voucher_lines),
        "reason_codes": reasons,
        "note": "Informational only; never added to the estimate at completion.",
    }


__all__ = [
    "ASSUMPTIONS",
    "MAX_ORDERS",
    "RATE_QUOTATION",
    "build_order_cost",
    "cpm_block",
    "gl_actual_block",
    "load_batch",
    "margin_pct",
    "material_eac",
    "progress_ratio",
]
