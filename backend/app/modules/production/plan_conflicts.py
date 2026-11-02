"""Plan-board conflict detection (multi-factory planning board).

Pure functions so the rules are easy to unit-test. The board endpoint passes in
plain dicts built from SewingLineStyleConfig / SewingLine / Order rows.

Conflict kinds:
- LINE_OVERLAP  : two active plans on the same sewing line overlap in dates.
- LATE_DELIVERY : a plan finishes sewing after the order's delivery date.
- INACTIVE_LINE : a plan is booked on a line marked inactive.
"""

from __future__ import annotations

from datetime import date
from typing import Any

CLOSED_PLAN_STATUSES = {"completed", "cancelled", "canceled", "closed"}


def _end(item: dict[str, Any]) -> date | None:
    return item.get("planned_end_date") or item.get("start_date")


def compute_plan_conflicts(
    items: list[dict[str, Any]],
    lines: dict[int, dict[str, Any]],
    orders: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return a list of conflict dicts: {kind, severity, config_ids, line_id, order_id, message}."""
    active = [i for i in items if str(i.get("status") or "").lower() not in CLOSED_PLAN_STATUSES]
    out: list[dict[str, Any]] = []

    by_line: dict[int, list[dict[str, Any]]] = {}
    for it in active:
        by_line.setdefault(int(it["line_id"]), []).append(it)

    for line_id, plans in by_line.items():
        line = lines.get(line_id) or {}
        label = line.get("line_code") or f"Line {line_id}"
        if line and line.get("is_active") is False:
            for p in plans:
                out.append(
                    {
                        "kind": "INACTIVE_LINE",
                        "severity": "warning",
                        "config_ids": [p["id"]],
                        "line_id": line_id,
                        "order_id": p.get("order_id"),
                        "message": f"{label} is inactive but still has a plan starting {p['start_date'].isoformat()}.",
                    }
                )
        plans.sort(key=lambda x: (x["start_date"], x["id"]))
        for idx, a in enumerate(plans):
            a_end = _end(a)
            for b in plans[idx + 1 :]:
                if a_end is None or b["start_date"] > a_end:
                    break
                out.append(
                    {
                        "kind": "LINE_OVERLAP",
                        "severity": "error",
                        "config_ids": [a["id"], b["id"]],
                        "line_id": line_id,
                        "order_id": b.get("order_id"),
                        "message": (
                            f"{label}: plans overlap between {b['start_date'].isoformat()} and "
                            f"{min(a_end, _end(b) or a_end).isoformat()}."
                        ),
                    }
                )

    for it in active:
        oid = it.get("order_id")
        if not oid:
            continue
        order = orders.get(int(oid)) or {}
        due = order.get("delivery_date")
        end = _end(it)
        if due and end and end > due:
            late_days = (end - due).days
            out.append(
                {
                    "kind": "LATE_DELIVERY",
                    "severity": "error",
                    "config_ids": [it["id"]],
                    "line_id": int(it["line_id"]),
                    "order_id": int(oid),
                    "message": (
                        f"{order.get('order_code') or f'Order {oid}'} finishes sewing {end.isoformat()}, "
                        f"{late_days} day(s) after delivery {due.isoformat()}."
                    ),
                }
            )
    return out


def summarize_factory_load(
    items: list[dict[str, Any]],
    lines: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Per factory unit: line count, active plan count, planned / completed qty."""
    units: dict[str, dict[str, Any]] = {}
    for line in lines.values():
        unit = line.get("factory_unit") or "Main factory"
        u = units.setdefault(
            unit, {"factory_unit": unit, "line_count": 0, "plan_count": 0, "planned_qty": 0.0, "completed_qty": 0.0}
        )
        if line.get("is_active") is not False:
            u["line_count"] += 1
    for it in items:
        if str(it.get("status") or "").lower() in CLOSED_PLAN_STATUSES:
            continue
        line = lines.get(int(it["line_id"])) or {}
        unit = line.get("factory_unit") or "Main factory"
        u = units.setdefault(
            unit, {"factory_unit": unit, "line_count": 0, "plan_count": 0, "planned_qty": 0.0, "completed_qty": 0.0}
        )
        u["plan_count"] += 1
        u["planned_qty"] += float(it.get("planned_qty") or 0)
        u["completed_qty"] += float(it.get("completed_qty") or 0)
    return sorted(units.values(), key=lambda x: x["factory_unit"])
