"""Transparent composite health score (deterministic)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.external_access.financier_portal.financier_inventory_service import cogs_outbound_90d
from app.modules.finance.business_overview_service import build_business_overview
from app.services.fifo_inventory import fifo_on_hand_value


def _clamp_score(x: float) -> float:
    return max(0.0, min(100.0, x))


async def build_health_score(db: AsyncSession, *, tenant_id: int) -> dict:
    ov = await build_business_overview(db, tenant_id=tenant_id)
    rec = float(ov.get("receivables_open") or 0)
    pay = float(ov.get("payables_open") or 0)
    wc_ratio = (rec / pay) if pay > 0 else (100.0 if rec > 0 else 50.0)
    sub_wc = 100.0 if wc_ratio >= 2.0 else 75.0 if wc_ratio >= 1.0 else 50.0 if wc_ratio >= 0.5 else 25.0

    debt = float(ov.get("active_debt_principal") or 0)
    ob = float(ov.get("open_orders_count") or 0)
    dscr_proxy = (ob / debt) if debt > 0 else 100.0
    sub_dscr = 100.0 if dscr_proxy >= 1.5 else 75.0 if dscr_proxy >= 1.0 else 50.0 if dscr_proxy >= 0.7 else 25.0

    btb = ov.get("btb_master_contracts") or []
    sub_btb = 100.0
    for row in btb:
        p = row.get("utilization_percent")
        if p is None:
            continue
        if p > 65:
            sub_btb = min(sub_btb, 50.0)
        elif p > 50:
            sub_btb = min(sub_btb, 75.0)

    liq = float(ov.get("liquid_funds_bank_balances") or 0)
    inv_val = float(await fifo_on_hand_value(db, tenant_id, as_of_date=None))
    assets_proxy = rec + liq + inv_val
    debt_to_asset_ratio = (debt / assets_proxy) if assets_proxy > 0 else (1.0 if debt > 0 else 0.0)
    sub_debt_asset = (
        100.0
        if debt_to_asset_ratio < 0.5
        else 75.0
        if debt_to_asset_ratio < 0.7
        else 50.0
        if debt_to_asset_ratio < 0.9
        else 25.0
    )

    cogs_90 = float(await cogs_outbound_90d(db, tenant_id))
    turn_ratio = cogs_90 / max(inv_val, 1.0)
    sub_turn = min(100.0, turn_ratio * 15.0)

    weights = {
        "dscr": 0.25,
        "wc": 0.20,
        "btb": 0.10,
        "placeholder_payment": 0.20,
        "debt_asset": 0.10,
        "placeholder_pipeline": 0.10,
        "inventory_turnover": 0.05,
    }
    sub_pay = 80.0
    sub_pipe = 75.0

    score = (
        weights["dscr"] * sub_dscr
        + weights["wc"] * sub_wc
        + weights["btb"] * sub_btb
        + weights["placeholder_payment"] * sub_pay
        + weights["debt_asset"] * sub_debt_asset
        + weights["placeholder_pipeline"] * sub_pipe
        + weights["inventory_turnover"] * sub_turn
    )
    score = _clamp_score(score)

    return {
        "score": round(score, 2),
        "component_weights": weights,
        "debt_to_asset_ratio": round(debt_to_asset_ratio, 4),
        "assets_proxy_denominator": round(assets_proxy, 2),
        "total_inventory_value": round(inv_val, 2),
        "cogs_outbound_90d": round(cogs_90, 2),
        "sub_scores": [
            {"key": "dscr_proxy", "label": "Coverage vs debt", "weight": weights["dscr"], "value": round(sub_dscr, 2), "raw_metric": round(dscr_proxy, 4)},
            {"key": "working_capital", "label": "Receivables / payables shape", "weight": weights["wc"], "value": round(sub_wc, 2), "raw_metric": round(wc_ratio, 4)},
            {"key": "btb_utilization", "label": "BTB utilization headroom", "weight": weights["btb"], "value": round(sub_btb, 2), "raw_metric": None},
            {"key": "payment_discipline", "label": "Payment discipline (placeholder)", "weight": weights["placeholder_payment"], "value": sub_pay, "raw_metric": None},
            {"key": "debt_to_asset", "label": "Debt vs liquid assets + AR + inventory", "weight": weights["debt_asset"], "value": round(sub_debt_asset, 2), "raw_metric": round(debt_to_asset_ratio, 4)},
            {"key": "pipeline", "label": "Pipeline (placeholder)", "weight": weights["placeholder_pipeline"], "value": sub_pipe, "raw_metric": None},
            {"key": "inventory_turnover", "label": "COGS-style outflow / inventory (90d proxy)", "weight": weights["inventory_turnover"], "value": round(sub_turn, 2), "raw_metric": round(turn_ratio, 4)},
        ],
        "change_from_last_month": None,
        "change_reason": "First calculation in session; store snapshots month-over-month for deltas.",
        "drill_down_links": [
            {"label": "Facilities", "path": "/app/finance/facilities"},
            {"label": "Cash forecast", "path": "/app/finance/cash-forecast"},
        ],
    }
