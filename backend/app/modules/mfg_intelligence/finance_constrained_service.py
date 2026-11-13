"""Finance-constrained scenario (Manufacturing Intelligence Phase 5; doc 16 D28-D30, 4.6, 15.14, 15.15). Read-only.

Money (base currency, Decimal, 4 dp strings). Behind the finance gate in the router; never edits finance.

1. Capacity first: the CAPACITY_CONSTRAINED run (BASE demand, P50) decides which tentative bookings are admitted.
2. Phase 3 weekly net cash: `build_cash_requirement` is called exactly once (close_w, facility headroom H = memo
   amount; `unknown_by_currency` excluded).
3. CONFIRMED_MATERIAL_NOT_ORDERED (ESTIMATED): `cost_at_completion_service` remaining material (budget - procured)
   of confirmed orders (first 200 by delivery date, its own cap), dated at the order's first live plan row start
   (else need-by). Deferred by `btb_usance_days` only while a linked master contract / export LC is opened
   (`is_lc_received_status`), not expired on the outflow date, and its BTB room (amount - btb_utilized_amount, in base
   currency; unknown FX = no deferral) covers the whole item.
4. Each admitted tentative booking needs (quotation material + other) x rate x booking qty / projected qty at its
   start date - whole bookings, full quantity, never weighted. No conversion / CPM: payroll is already in the Phase 3
   rows (CONVERSION_IN_PAYROLL). No inflow (no contract). Inquiry-only booking, unknown FX or projected quantity:
   CASH_NEED_UNKNOWN, cut.
5. Feasible when every week: close_w - cumulative extra_w + H >= 0. Tentative bookings are cut in reverse priority
   (lowest confidence, latest start, highest id) until feasible. Confirmed demand is never cut: a remaining shortfall is
   CONFIRMED_FINANCING_GAP. Forecast is never funded (FORECAST_NOT_FUNDED).
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.master_contract_workflow import is_lc_received_status
from app.models import Order, ProformaInvoice, ProformaInvoiceOrder, Tenant
from app.models.commercial import MasterContract
from app.modules.mfg_intelligence import forward_plan_params as fp
from app.modules.mfg_intelligence.cash_requirement_service import build_cash_requirement
from app.modules.mfg_intelligence.confirmed_demand import confirmed_status_clause
from app.modules.mfg_intelligence.cost_at_completion_service import MAX_ORDERS as COST_MAX_ORDERS
from app.modules.mfg_intelligence.cost_at_completion_service import build_order_cost, load_batch
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, to_dec
from app.modules.mfg_intelligence.forward_plan_service import (
    EngineInputs,
    admission_order,
    bucket_ranges,
    capacity_by_day,
    constrain,
    layer_days_of,
)
from app.modules.mfg_intelligence.money import CLASS_ESTIMATED, CLASS_FORECAST, base_currency, fx, m4, norm_ccy
from app.modules.mfg_intelligence.revenue_resolver import (
    PI_CLOSED_STATUSES,
    RATE_QUOTATION,
    load_order_money_context,
    resolve_budget,
)

MAX_LIST = 500
CAT_CONFIRMED_MATERIAL = "CONFIRMED_MATERIAL_NOT_ORDERED"
RATE_CONTRACT = "CONTRACT_CURRENCY_QUOTATION_RATE"

ASSUMPTIONS = [
    "Estimate - not posted. Starts from the weekly cash requirement (net cash, drawn overdraft deducted).",
    "Facility headroom (available balance of active facilities) is counted as financing; undrawn BTB limits are not.",
    "Confirmed orders' material not yet ordered = material budget - purchase orders already placed (ESTIMATED).",
    "A tentative booking needs its quotation material + other cost for the booked quantity at its start date; "
    "conversion cost is already in payroll, and there is no inflow without a contract.",
    "Confirmed orders are never cut; forecast demand is never funded; tentative bookings are cut lowest confidence "
    "first until every week stays at or above zero.",
]


def _week(d: date, today: date) -> int:
    return (d - today).days // 7


async def _contracts_by_order(db: AsyncSession, tenant_id: int, order_ids: list[int]) -> dict[int, list[Any]]:
    """Master contracts linked to each order: `orders.master_contract_id` and live export proforma invoices
    (two queries)."""
    if not order_ids:
        return {}
    pi, pio, mc = ProformaInvoice, ProformaInvoiceOrder, MasterContract
    cols = (mc.id, mc.status, mc.expiry_date, mc.amount, mc.btb_utilized_amount, mc.currency)
    direct = (
        await db.execute(
            select(Order.id, *cols)
            .join(mc, and_(mc.id == Order.master_contract_id, mc.tenant_id == tenant_id))
            .where(Order.tenant_id == tenant_id, Order.id.in_(order_ids))
        )
    ).all()
    via_pi = (
        await db.execute(
            select(pio.order_id, *cols)
            .join(pi, and_(pi.id == pio.proforma_invoice_id, pi.tenant_id == tenant_id))
            .join(mc, and_(mc.id == pi.master_contract_id, mc.tenant_id == tenant_id))
            .where(
                pio.order_id.in_(order_ids),
                func.upper(func.coalesce(pi.direction, "EXPORT")) != "IMPORT",
                func.upper(func.coalesce(pi.status, "")).notin_(PI_CLOSED_STATUSES),
            )
        )
    ).all()
    out: dict[int, list[Any]] = {}
    seen: set[tuple[int, int]] = set()
    for oid, cid, status, expiry, amount, utilized, ccy in sorted(list(direct) + list(via_pi), key=lambda r: (int(r[0]), int(r[1]))):
        if (int(oid), int(cid)) in seen:
            continue
        seen.add((int(oid), int(cid)))
        out.setdefault(int(oid), []).append(
            SimpleNamespace(id=int(cid), status=status, expiry_date=expiry, amount=to_dec(amount),
                            utilized=to_dec(utilized) or ZERO, currency=norm_ccy(ccy))
        )
    return out


def lc_opened_on(contract: Any, day: date) -> bool:
    """15.14: LC opened = an LC-received status and not expired on the outflow date."""
    return is_lc_received_status(contract.status) and (contract.expiry_date is None or contract.expiry_date >= day)


async def build_finance_constrained(
    db: AsyncSession,
    tenant: Tenant,
    inputs: EngineInputs,
    *,
    planning_math_v2: bool,
) -> dict[str, Any]:
    tid = tenant.id
    today, end = inputs.today, inputs.end
    base = base_currency(tenant)
    params = fp.build_params(fp.CAPACITY_CONSTRAINED)

    # 1. capacity-constrained admission
    cap_days, _modes = capacity_by_day(inputs, params)
    layer_days = layer_days_of(inputs)
    booked: dict[date, Decimal] = {}
    for layer in fp.BOOKED_LAYERS:
        for d, m in layer_days.get(layer, {}).items():
            booked[d] = booked.get(d, ZERO) + m
    items = [i for i in admission_order(inputs) if any(layer in params.layers for layer in i.days_by_layer)]
    constrained = constrain(inputs, cap_days, booked, items)

    # 2. Phase 3 weekly cash, called exactly once
    phase3 = await build_cash_requirement(
        db, tenant, date_from=today, horizon_days=inputs.horizon_days, today=today,
        planning_math_v2=planning_math_v2, integrated_planning=inputs.integrated,
    )
    weeks = bucket_ranges(today, end, fp.BUCKET_WEEK)
    n_weeks = len(weeks)
    close = [Decimal(w["closing"]) for w in phase3["weeks"]][:n_weeks]
    close += [close[-1] if close else ZERO] * (n_weeks - len(close))
    headroom = Decimal(phase3["facility_headroom"]["amount"] or "0")
    settings = phase3.get("settings") or {}
    btb_usance = int(settings.get("btb_usance_days", inputs.settings.get("btb_usance_days", 120)))

    # 3. confirmed material not ordered
    orders = list(
        (
            await db.execute(
                select(Order)
                .where(Order.tenant_id == tid, confirmed_status_clause())
                .order_by(Order.delivery_date.asc().nulls_last(), Order.id)
                .limit(COST_MAX_ORDERS + 1)
            )
        ).scalars().all()
    )
    orders_truncated = len(orders) > COST_MAX_ORDERS
    orders = orders[:COST_MAX_ORDERS]
    data = await load_batch(db, tenant, orders, today=today, use_style_standard=inputs.integrated) if orders else None
    contracts = await _contracts_by_order(db, tid, [o.id for o in orders])
    room: dict[int, Decimal | None] = {}
    conf_extra = [ZERO] * n_weeks
    conf_items: list[dict[str, Any]] = []
    unknown_orders = undated_orders = beyond_orders = 0
    pending: list[tuple[date, Any, Decimal]] = []
    for o in orders:
        cost = build_order_cost(o, data, tenant) if data is not None else None
        amount_text = cost["material"]["remaining"]["amount"] if cost is not None else None
        if amount_text is None:
            unknown_orders += 1
            continue
        amount = Decimal(amount_text)
        if amount <= ZERO:
            continue
        meta = inputs.layers.order_meta.get(o.id, {})
        due = meta.get("first_live_start") or meta.get("need_by")
        if due is None:
            undated_orders += 1
            continue
        pending.append((max(due, today), o, amount))
    for due, o, amount in sorted(pending, key=lambda p: (p[0], p[1].id)):
        reasons = ["ESTIMATED"]
        deferred_by: int | None = None
        quotation = data.ctx.quotations.get(int(o.quotation_id)) if data is not None and o.quotation_id else None
        for c in contracts.get(o.id, []):
            if not lc_opened_on(c, due):
                continue
            if c.id not in room:
                rate, _src = fx(c.currency, base, None, RATE_CONTRACT)
                if rate is None and quotation is not None and c.currency == quotation.currency:
                    rate, _src = fx(c.currency, base, quotation.exchange_rate, RATE_QUOTATION)
                room[c.id] = (max(ZERO, (c.amount or ZERO) - c.utilized) * rate) if rate is not None and c.amount is not None else None
            left = room[c.id]
            if left is None:
                reasons.append("BTB_FX_UNKNOWN")
                continue
            if left >= amount:
                room[c.id] = left - amount
                deferred_by = c.id
                break
        when = due + timedelta(days=btb_usance) if deferred_by is not None else due
        if deferred_by is not None:
            reasons.append("BTB_DEFERRED")
        week = _week(when, today) if when <= end else None
        if week is None:
            beyond_orders += 1
            reasons.append("BEYOND_HORIZON")
        else:
            conf_extra[week] += amount
        if len(conf_items) < MAX_LIST:
            conf_items.append({
                "order_id": o.id, "order_code": o.order_code, "amount": m4(amount), "due_date": when,
                "week_index": week, "master_contract_id": deferred_by, "value_class": CLASS_ESTIMATED,
                "reason_codes": reasons,
            })

    # 4. tentative bookings admitted by capacity, with their cash need
    tentative = [i for i in inputs.layers.tentative_items if constrained.item_admitted.get(i.key, ZERO) > ZERO]
    not_admitted = len(inputs.layers.tentative_items) - len(tentative)
    pseudo = [
        SimpleNamespace(id=-int(i.meta["booking_id"]), quotation_id=i.meta["quotation_id"], customer_intermediary_id=None,
                        quantity=i.meta["planned_qty"], commercial_snapshot_json=None)
        for i in tentative if i.meta.get("quotation_id")
    ]
    ctx = await load_order_money_context(db, tid, base, pseudo) if pseudo else None
    pseudo_by_booking = {-p.id: p for p in pseudo}
    rows: list[dict[str, Any]] = []
    for i in tentative:
        meta = i.meta
        reasons = ["CONVERSION_IN_PAYROLL"]
        cash: Decimal | None = None
        p = pseudo_by_booking.get(int(meta["booking_id"]))
        if p is None:
            reasons.append("INQUIRY_ONLY_BOOKING")
        else:
            budget = resolve_budget(p, ctx)
            if not budget.usable:
                reasons += budget.reason_codes
            elif budget.scale_factor is None:
                reasons.append("PROJECTED_QTY_UNKNOWN")
            else:
                cash = budget.scaled["material"] + budget.scaled["other"]
        due = max(meta["start_date"], today)
        rows.append({"item": i, "cash": cash, "due": due, "week": _week(due, today) if due <= end else None,
                     "reasons": reasons})

    def position(kept_extra: list[Decimal]) -> list[Decimal]:
        out: list[Decimal] = []
        cum = ZERO
        for w in range(n_weeks):
            cum += conf_extra[w] + kept_extra[w]
            out.append(close[w] - cum + headroom)
        return out

    kept_extra = [ZERO] * n_weeks
    kept: list[dict[str, Any]] = []
    cut: list[dict[str, Any]] = []
    for r in rows:
        if r["cash"] is None:
            r["reasons"].append("CASH_NEED_UNKNOWN")
            cut.append(r)
            continue
        kept.append(r)
        if r["week"] is not None:
            kept_extra[r["week"]] += r["cash"]
    # cut order: lowest confidence, latest start, highest booking id first
    kept.sort(key=lambda r: (r["item"].meta["confidence_pct"], -r["item"].meta["start_date"].toordinal(), -r["item"].meta["booking_id"]))
    while kept and any(v < ZERO for v in position(kept_extra)):
        r = kept.pop(0)
        if r["week"] is not None:
            kept_extra[r["week"]] -= r["cash"]
        r["reasons"].append("FINANCE_CUT")
        cut.append(r)
    final = position(kept_extra)
    after_conf = position([ZERO] * n_weeks)
    gap_week = next((w for w in range(n_weeks) if final[w] < ZERO), None)

    def booking_out(r: dict[str, Any]) -> dict[str, Any]:
        meta = r["item"].meta
        return {
            "booking_id": meta["booking_id"], "key": r["item"].key, "line_id": meta["line_id"],
            "quotation_id": meta["quotation_id"], "inquiry_id": meta["inquiry_id"],
            "confidence_pct": dec_str(meta["confidence_pct"]), "start_date": meta["start_date"],
            "end_date": meta["end_date"], "planned_qty": dec_str(meta["planned_qty"], 3),
            "full_minutes": dec_str(meta["full_minutes"]), "weighted_minutes": dec_str(meta["weighted_minutes"]),
            "admitted_minutes": dec_str(constrained.item_admitted.get(r["item"].key, ZERO)),
            "cash_need": m4(r["cash"]), "due_date": r["due"], "week_index": r["week"],
            "value_class": CLASS_ESTIMATED, "reason_codes": list(dict.fromkeys(r["reasons"])),
        }

    kept.sort(key=lambda r: r["item"].priority)
    cut.sort(key=lambda r: r["item"].priority)
    cum_conf = cum_kept = ZERO
    weeks_out = []
    for w, (start, stop, _p) in enumerate(weeks):
        cum_conf += conf_extra[w]
        cum_kept += sum((r["cash"] for r in kept if r["week"] == w), ZERO)
        weeks_out.append({
            "week_index": w, "week_start": start, "week_end": stop,
            "phase3_closing": m4(close[w]),
            "after_confirmed_material": m4(close[w] - cum_conf),
            "after_kept_tentative": m4(close[w] - cum_conf - cum_kept),
            "position_with_headroom": m4(final[w]),
            "below_zero": final[w] < ZERO,
        })
    forecast_cut = [
        {"key": i.key, "month": i.meta.get("month"), "family": i.meta.get("family"), "minutes": dec_str(i.minutes),
         "reason_codes": ["FORECAST_NOT_FUNDED"]}
        for i in admission_order(inputs) if i.kind == "FORECAST"
    ][:MAX_LIST]
    reason_codes: list[str] = ["CONVERSION_IN_PAYROLL"]
    if gap_week is not None:
        reason_codes.append("CONFIRMED_FINANCING_GAP")
    if any(r for r in cut if "FINANCE_CUT" in r["reasons"]):
        reason_codes.append("TENTATIVE_CUT")
    if forecast_cut:
        reason_codes.append("FORECAST_NOT_FUNDED")
    if orders_truncated:
        reason_codes.append("ORDERS_TRUNCATED")
    if not phase3.get("forecast_complete", True):
        reason_codes.append("CASH_FORECAST_INCOMPLETE")
    return {
        "as_of": today,
        "date_from": today,
        "date_to": end,
        "horizon_days": inputs.horizon_days,
        "factory_unit": inputs.factory_unit,
        "base_currency": base,
        "value_class": CLASS_FORECAST,
        "capacity_parameters": params.out(),
        "facility_headroom": {
            "amount": m4(headroom),
            "facilities": phase3["facility_headroom"].get("facilities"),
            "unknown_by_currency": phase3["facility_headroom"].get("unknown_by_currency", {}),
        },
        "weeks": weeks_out,
        "confirmed_material": {
            "category": CAT_CONFIRMED_MATERIAL,
            "value_class": CLASS_ESTIMATED,
            "total": m4(sum(conf_extra, ZERO)),
            "items": conf_items,
            "orders_unknown": unknown_orders,
            "orders_undated": undated_orders,
            "orders_beyond_horizon": beyond_orders,
            "orders_truncated": orders_truncated,
        },
        "kept": [booking_out(r) for r in kept[:MAX_LIST]],
        "cut": [booking_out(r) for r in cut[:MAX_LIST]],
        "tentative_not_admitted_by_capacity": not_admitted,
        "forecast_cut": forecast_cut,
        "confirmed_financing_gap": (
            {"week_index": gap_week, "week_start": weeks[gap_week][0], "shortfall": m4(-final[gap_week])}
            if gap_week is not None else None
        ),
        "after_confirmed_only_gap": next(
            ({"week_index": w, "week_start": weeks[w][0], "shortfall": m4(-after_conf[w])} for w in range(n_weeks) if after_conf[w] < ZERO),
            None,
        ),
        "phase3": {
            "financing_gap": phase3.get("financing_gap"),
            "forecast_complete": phase3.get("forecast_complete"),
            "reason_codes": phase3.get("reason_codes", []),
        },
        "reason_codes": reason_codes,
        "notices": list(inputs.notices),
        "assumptions": list(ASSUMPTIONS),
    }

