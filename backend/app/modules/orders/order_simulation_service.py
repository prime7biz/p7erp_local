"""Deterministic capacity overlap + bottleneck heuristics for order planning (read-only)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order
from app.models.production import SewingLineStyleConfig

_PEER_RESERVATION_STATUSES = frozenset({"SOFT_BOOKED", "FIRM_BOOKED", "IN_PROGRESS", "COMPLETED"})


def _cfg_window_end(cfg: SewingLineStyleConfig) -> date:
    if cfg.planned_end_date:
        return cfg.planned_end_date
    return cfg.start_date + timedelta(days=60)


def _ranges_overlap(a_start: date, a_end: date, b_start: date, b_end: date) -> bool:
    return a_start <= b_end and b_start <= a_end


async def scan_capacity_bottlenecks_for_order(
    db: AsyncSession,
    *,
    tenant_id: int,
    order: Order,
) -> dict[str, Any]:
    """Heuristic overlap scan on sewing line style configs — not a finite-capacity APS."""
    configs = (
        await db.execute(
            select(SewingLineStyleConfig)
            .where(
                SewingLineStyleConfig.tenant_id == tenant_id,
                SewingLineStyleConfig.order_id == order.id,
            )
            .order_by(SewingLineStyleConfig.start_date, SewingLineStyleConfig.id)
        )
    ).scalars().all()

    if not configs:
        return {
            "config_count": 0,
            "distinct_lines": 0,
            "overlap_hits": 0,
            "severity_score": 0,
            "bottlenecks": [],
            "limitations": [
                "No sewing line / style configs are linked to this order; only header and ATP/CTP signals apply.",
            ],
        }

    line_ids = {c.line_id for c in configs}
    peer_stmt = select(SewingLineStyleConfig).where(
        SewingLineStyleConfig.tenant_id == tenant_id,
        SewingLineStyleConfig.line_id.in_(line_ids),
        SewingLineStyleConfig.order_id.is_not(None),
        SewingLineStyleConfig.order_id != order.id,
        SewingLineStyleConfig.reservation_status.in_(tuple(_PEER_RESERVATION_STATUSES)),
    )
    peers = (await db.execute(peer_stmt)).scalars().all()

    bottlenecks: list[dict[str, Any]] = []
    hits = 0
    for cfg in configs:
        a0, a1 = cfg.start_date, _cfg_window_end(cfg)
        for p in peers:
            if p.line_id != cfg.line_id:
                continue
            b0, b1 = p.start_date, _cfg_window_end(p)
            if _ranges_overlap(a0, a1, b0, b1):
                hits += 1
                this_min = float(cfg.planned_qty or 0) * float(getattr(cfg, "smv_per_piece", None) or 0)
                peer_min = float(p.planned_qty or 0) * float(getattr(p, "smv_per_piece", None) or 0)
                msg = "Another order overlaps this line in the same window."
                if this_min > 0 or peer_min > 0:
                    msg += f" Approx committed SMV-minutes (this={round(this_min, 2)}, peer={round(peer_min, 2)})."
                else:
                    msg += " (SMV per piece not set — date overlap only.)"
                bottlenecks.append(
                    {
                        "line_id": cfg.line_id,
                        "this_config_id": cfg.id,
                        "peer_config_id": p.id,
                        "peer_order_id": p.order_id,
                        "window_start": a0.isoformat(),
                        "window_end": a1.isoformat(),
                        "peer_window_start": b0.isoformat(),
                        "peer_window_end": b1.isoformat(),
                        "this_reservation_status": getattr(cfg, "reservation_status", None),
                        "peer_reservation_status": getattr(p, "reservation_status", None),
                        "severity_hint": "warning",
                        "message": msg,
                    }
                )
                if len(bottlenecks) >= 40:
                    break
        if len(bottlenecks) >= 40:
            break

    severity = 0
    if len(configs) >= 2:
        severity += min(40, 15 * (len(configs) - 1))
    severity += min(60, hits * 12)
    severity = min(100, severity)

    limitations: list[str] = []
    if hits == 0 and line_ids:
        limitations.append(
            "No overlapping peer configs detected; constraints outside line boards are not modeled here."
        )

    return {
        "config_count": len(configs),
        "distinct_lines": len(line_ids),
        "overlap_hits": hits,
        "severity_score": severity,
        "bottlenecks": bottlenecks[:40],
        "limitations": limitations,
    }
