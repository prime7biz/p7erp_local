"""Rule-based cost benchmarking vs tenant historical quotations (Phase 13) — advisory only."""

from __future__ import annotations

import statistics
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Quotation
from app.models.ai_tool import AiAuditLog
from app.modules.ai_tool.audit import log_ai_event
from app.modules.master_data_ai.request_context import get_master_data_ai_request_id
from app.modules.quotations.quotation_commercial_money import parse_money_decimal

PROMPT_CATEGORY = "quotation_costing_ai"
BENCHMARK_ACTION = "QUOTATION_COST_BENCHMARK"

STATUSES_PEER = frozenset({"APPROVED", "SENT", "CONVERTED"})


def _dec(s: str | Decimal | None) -> Decimal | None:
    if s is None:
        return None
    if isinstance(s, Decimal):
        return s
    try:
        return parse_money_decimal(str(s), field="v", allow_empty_as_zero=False)
    except Exception:
        try:
            return Decimal(str(s).strip().replace(",", ""))
        except Exception:
            return None


def _ratio(num: Decimal | None, den: Decimal | None) -> float | None:
    if num is None or den is None or den == 0:
        return None
    return float(num / den)


def _pct_deviation(current: float | None, bench_avg: float | None) -> float | None:
    if current is None or bench_avg is None or bench_avg == 0:
        return None
    return (current - bench_avg) / abs(bench_avg) * 100.0


def _classify(dev: float | None) -> str:
    if dev is None:
        return "insufficient_data"
    ad = abs(dev)
    if ad < 5:
        return "normal"
    if ad < 12:
        return "slightly_high" if dev > 0 else "slightly_low"
    if ad < 25:
        return "high" if dev > 0 else "low"
    return "abnormal"


def _overall_from_metric_classes(classes: list[str]) -> str:
    meaningful = [x for x in classes if x != "insufficient_data"]
    if not meaningful:
        return "insufficient_data"
    if "abnormal" in meaningful:
        return "abnormal"
    if any(x in ("high", "low") for x in meaningful):
        return "high" if "high" in meaningful else "low"
    if any(x in ("slightly_high", "slightly_low") for x in meaningful):
        return "slightly_high" if "slightly_high" in meaningful else "slightly_low"
    if all(x == "normal" for x in meaningful):
        return "normal"
    return "insufficient_data"


async def _fetch_peer_quotations(
    db: AsyncSession,
    *,
    tenant_id: int,
    exclude_id: int,
    months_back: int,
    department: str | None,
    currency: str | None,
    customer_id: int | None,
    same_customer_only: bool,
    qty: int | None,
) -> list[Quotation]:
    since = datetime.utcnow() - timedelta(days=30 * months_back)
    stmt = select(Quotation).where(
        Quotation.tenant_id == tenant_id,
        Quotation.id != exclude_id,
        Quotation.status.in_(STATUSES_PEER),
        Quotation.created_at >= since,
    )
    if same_customer_only and customer_id:
        stmt = stmt.where(Quotation.customer_id == customer_id)
    if department and department.strip():
        stmt = stmt.where(Quotation.department == department)
    if currency and currency.strip():
        c = currency.strip().upper()
        stmt = stmt.where(Quotation.currency == c)
    r = await db.execute(stmt.order_by(Quotation.created_at.desc()).limit(500))
    peers = list(r.scalars().all())
    if qty and qty > 0:
        lo = int(qty * 0.5)
        hi = int(qty * 1.5) + 1
        filtered: list[Quotation] = []
        for p in peers:
            pq = p.projected_quantity
            if pq is None:
                continue
            if lo <= pq <= hi:
                filtered.append(p)
        return filtered
    return peers


def _metrics_for_quotation(q: Quotation) -> dict[str, float | None]:
    tc = _dec(q.total_cost)
    mc = _dec(q.material_cost)
    mfgc = _dec(q.manufacturing_cost)
    oc = _dec(q.other_cost)
    pq = float(q.projected_quantity) if q.projected_quantity and q.projected_quantity > 0 else None
    cpp = float(tc / Decimal(str(pq))) if tc is not None and pq else None
    prof = _dec(q.profit_percentage)
    mat_r = _ratio(mc, tc)
    mfg_r = _ratio(mfgc, tc)
    oth_r = _ratio(oc, tc)
    return {
        "material_ratio": mat_r,
        "mfg_ratio": mfg_r,
        "other_ratio": oth_r,
        "cost_per_piece": cpp,
        "margin_pct": float(prof) if prof is not None else None,
    }


def _metric_confidence(peer_values_count: int, st: dict[str, float | None]) -> float:
    """Higher with more peers; reduced when inter-quartile spread is large vs mean."""
    if peer_values_count < 1:
        return 0.15
    base = 0.28 + min(0.55, 0.035 * float(peer_values_count))
    avg = st.get("avg")
    p25, p75 = st.get("p25"), st.get("p75")
    if avg is not None and abs(avg) > 1e-9 and p25 is not None and p75 is not None:
        iqr = abs(float(p75) - float(p25))
        rel = iqr / abs(float(avg))
        if rel > 0.35:
            base *= max(0.55, 1.0 - min(0.35, (rel - 0.35) * 0.8))
    return round(min(0.95, max(0.15, base)), 4)


def _overall_confidence_from_metrics(metric_confidences: list[float], insufficient: bool) -> float:
    if insufficient or not metric_confidences:
        return 0.2
    return round(min(0.95, max(0.2, sum(metric_confidences) / len(metric_confidences))), 4)


def _stats(vals: list[float]) -> dict[str, float | None]:
    if not vals:
        return {"min": None, "max": None, "avg": None, "p25": None, "p75": None}
    s = sorted(vals)
    if len(s) == 1:
        v = float(s[0])
        return {"min": v, "max": v, "avg": v, "p25": v, "p75": v}
    qs = statistics.quantiles(s, n=4)
    return {
        "min": float(s[0]),
        "max": float(s[-1]),
        "avg": float(statistics.mean(s)),
        "p25": float(qs[0]),
        "p75": float(qs[2]),
    }


async def compute_cost_benchmark(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    quotation_id: int,
    same_customer_only: bool = False,
    months_back: int = 12,
) -> dict[str, Any]:
    q = await db.get(Quotation, quotation_id)
    if not q or q.tenant_id != tenant_id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

    peers = await _fetch_peer_quotations(
        db,
        tenant_id=tenant_id,
        exclude_id=quotation_id,
        months_back=months_back,
        department=q.department,
        currency=q.currency,
        customer_id=q.customer_id,
        same_customer_only=same_customer_only,
        qty=q.projected_quantity,
    )

    peer_metrics = [_metrics_for_quotation(p) for p in peers]
    keys = ["material_ratio", "mfg_ratio", "other_ratio", "cost_per_piece", "margin_pct"]
    insufficient = len(peers) < 3

    cur = _metrics_for_quotation(q)
    metrics_out: list[dict[str, Any]] = []
    reason_codes: list[str] = []
    m_classes: list[str] = []

    metric_confidences: list[float] = []
    for key in keys:
        vals = [pm[key] for pm in peer_metrics if pm.get(key) is not None]
        float_vals = [float(v) for v in vals if v is not None]
        st = _stats(float_vals)
        current_f = cur.get(key)
        dev = _pct_deviation(current_f, st["avg"])
        cls = "insufficient_data" if insufficient or st["avg"] is None else _classify(dev)
        if cls not in ("normal", "insufficient_data"):
            reason_codes.append(f"benchmark_{key}_{cls}")
        m_classes.append(cls)
        mconf = _metric_confidence(len(float_vals), st) if not insufficient else 0.2
        metric_confidences.append(mconf)
        metrics_out.append(
            {
                "metric_key": key,
                "benchmark_range": st,
                "current_value": current_f,
                "deviation_percent": dev,
                "confidence": mconf,
                "classification": cls,
                "reason_code": None if cls in ("normal", "insufficient_data") else f"benchmark_{key}_{cls}",
                "explanation": None,
            }
        )

    overall = "insufficient_data" if insufficient else _overall_from_metric_classes(m_classes)
    overall_confidence = _overall_confidence_from_metrics(metric_confidences, insufficient)

    summary = (
        f"Compared to {len(peers)} similar quotations in your tenant (rule-based filters). "
        f"Overall: {overall}."
        if not insufficient
        else "Not enough comparable historical quotations (need at least 3 peers)."
    )
    next_actions: list[str] = []
    if insufficient:
        next_actions.append("Widen filters or accumulate more approved/sent quotations for benchmarking.")
    else:
        next_actions.append("Review any high/abnormal metrics with merchandising before approval.")

    details = {
        "quotation_id": quotation_id,
        "similar_quotation_count": len(peers),
        "insufficient_data": insufficient,
        "overall_classification": overall,
        "overall_confidence": overall_confidence,
        "reason_codes": reason_codes[:24],
    }

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=BENCHMARK_ACTION,
        resource="quotation",
        request_id=get_master_data_ai_request_id(),
        trace_id=get_master_data_ai_request_id(),
        severity="INFO",
        details_json={
            **details,
            "summary": summary[:2000],
        },
        prompt_category=PROMPT_CATEGORY,
    )

    return {
        "advisory_notice": "Advisory only — rules-based benchmark vs tenant history. Does not change costing.",
        "quotation_id": quotation_id,
        "insufficient_data": insufficient,
        "similar_quotation_count": len(peers),
        "overall_classification": overall,
        "overall_confidence": overall_confidence,
        "metrics": metrics_out,
        "summary": summary,
        "next_actions": next_actions,
        "source_mode": "deterministic_only",
        "reason_codes": sorted(set(reason_codes))[:40],
    }


async def list_cost_benchmark_history(
    db: AsyncSession,
    *,
    tenant_id: int,
    quotation_id: int | None,
    limit: int = 40,
) -> list[dict[str, Any]]:
    stmt = select(AiAuditLog).where(
        AiAuditLog.tenant_id == tenant_id,
        AiAuditLog.action == BENCHMARK_ACTION,
    )
    if quotation_id is not None:
        # JSON filter — portable: fetch and filter in Python for small limits
        stmt = stmt.order_by(AiAuditLog.created_at.desc()).limit(min(500, limit * 20))
    else:
        stmt = stmt.order_by(AiAuditLog.created_at.desc()).limit(limit)

    r = await db.execute(stmt)
    rows = list(r.scalars().all())
    out: list[dict[str, Any]] = []
    for row in rows:
        dj = row.details_json or {}
        qid = dj.get("quotation_id")
        if quotation_id is not None and int(qid or 0) != quotation_id:
            continue
        oc = dj.get("overall_confidence")
        out.append(
            {
                "id": row.id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "action": row.action,
                "quotation_id": qid,
                "summary": (dj.get("summary") or "")[:500],
                "overall_classification": dj.get("overall_classification"),
                "overall_confidence": float(oc) if oc is not None else None,
            }
        )
        if len(out) >= limit:
            break
    return out


async def benchmark_hints_for_quotation_ids(
    db: AsyncSession,
    *,
    tenant_id: int,
    quotation_ids: list[int],
) -> dict[int, str]:
    """Map quotation_id -> label for list badges (from latest benchmark audit per quote)."""
    if not quotation_ids:
        return {}
    stmt = (
        select(AiAuditLog)
        .where(
            AiAuditLog.tenant_id == tenant_id,
            AiAuditLog.action == BENCHMARK_ACTION,
        )
        .order_by(AiAuditLog.created_at.desc())
        .limit(2000)
    )
    r = await db.execute(stmt)
    rows = list(r.scalars().all())
    want = set(quotation_ids)
    found: dict[int, str] = {}
    for row in rows:
        dj = row.details_json or {}
        qid = dj.get("quotation_id")
        if qid is None:
            continue
        iq = int(qid)
        if iq not in want or iq in found:
            continue
        oc = str(dj.get("overall_classification") or "")
        label = "normal"
        if oc == "insufficient_data":
            label = "insufficient_data"
        elif oc in ("high", "slightly_high"):
            label = "over_cost"
        elif oc in ("low", "slightly_low"):
            label = "under_cost"
        elif oc == "abnormal":
            label = "abnormal"
        elif oc == "normal":
            label = "normal"
        else:
            label = oc or "normal"
        found[iq] = label
        if len(found) >= len(want):
            break
    return found
