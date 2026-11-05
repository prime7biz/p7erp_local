"""Per-voucher edit log (Tally "Edit Log"), stored in the shared `audit_logs` table.

Each event is one AuditLog row with:
    resource = "voucher:<id>"   (so history survives even if the voucher is deleted)
    action   = "voucher.<event>" e.g. voucher.created / voucher.updated / voucher.status
    details  = JSON {summary, from_status, to_status, reason, changes}

Writes go through a SAVEPOINT in the caller's transaction: the history row commits
together with the voucher change, and a logging failure can never block a posting.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.finance import Voucher, VoucherLine
from app.models.user import User

logger = logging.getLogger(__name__)

HEADER_FIELDS = ("voucher_type", "voucher_date", "description", "reference", "currency", "exchange_rate")


def voucher_resource(voucher_id: int) -> str:
    return f"voucher:{voucher_id}"


def _fmt(v: Any) -> Any:
    if v is None:
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)


def header_snapshot(row: Voucher) -> dict[str, Any]:
    snap = {f: _fmt(getattr(row, f, None)) for f in HEADER_FIELDS}
    try:
        # Stored as text with varying precision ("1" vs "1.00000000"); compare numerically.
        snap["exchange_rate"] = f"{float(snap['exchange_rate'] or 1):.6f}"
    except (TypeError, ValueError):
        pass
    return snap


def lines_snapshot(lines: Iterable[VoucherLine]) -> list[dict[str, Any]]:
    out = [
        {
            "account_id": ln.account_id,
            "entry_type": ln.entry_type,
            "amount": f"{float(ln.amount or 0):.4f}",
            "cost_center_id": ln.cost_center_id,
        }
        for ln in lines
    ]
    out.sort(key=lambda d: (d["entry_type"], d["account_id"], d["amount"]))
    return out


def _total(lines: list[dict[str, Any]], side: str) -> float:
    return round(sum(float(d["amount"]) for d in lines if d["entry_type"] == side), 4)


def diff_voucher(
    before_header: dict[str, Any],
    before_lines: list[dict[str, Any]],
    after_header: dict[str, Any],
    after_lines: list[dict[str, Any]],
) -> dict[str, Any]:
    """Field-level header changes plus a compact line summary (lines are replaced wholesale on edit)."""
    changes: dict[str, Any] = {}
    for f in HEADER_FIELDS:
        if before_header.get(f) != after_header.get(f):
            changes[f] = {"from": before_header.get(f), "to": after_header.get(f)}
    if before_lines != after_lines:
        changes["lines"] = {
            "from": {"count": len(before_lines), "debit_total": _total(before_lines, "DEBIT")},
            "to": {"count": len(after_lines), "debit_total": _total(after_lines, "DEBIT")},
            "before": before_lines,
            "after": after_lines,
        }
    return changes


async def record_voucher_event(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    voucher_id: int,
    event: str,
    summary: str,
    from_status: str | None = None,
    to_status: str | None = None,
    reason: str | None = None,
    changes: dict[str, Any] | None = None,
) -> None:
    payload = {
        "summary": summary,
        "from_status": from_status,
        "to_status": to_status,
        "reason": (reason or None),
        "changes": changes or None,
    }
    try:
        async with db.begin_nested():
            db.add(
                AuditLog(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    action=f"voucher.{event}"[:64],
                    resource=voucher_resource(voucher_id),
                    details=json.dumps(payload, default=str),
                )
            )
    except Exception:
        logger.exception("voucher_history_write_failed tenant=%s voucher=%s event=%s", tenant_id, voucher_id, event)


async def list_voucher_events(db: AsyncSession, *, tenant_id: int, voucher_id: int, limit: int = 200) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            select(AuditLog, User.username)
            .outerjoin(User, User.id == AuditLog.user_id)
            .where(AuditLog.tenant_id == tenant_id, AuditLog.resource == voucher_resource(voucher_id))
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
        )
    ).all()
    out: list[dict[str, Any]] = []
    for log, username in rows:
        try:
            details = json.loads(log.details) if log.details else {}
        except (TypeError, ValueError):
            details = {"summary": log.details}
        out.append(
            {
                "id": log.id,
                "event": log.action.removeprefix("voucher."),
                "at": log.created_at.isoformat() if log.created_at else None,
                "user_id": log.user_id,
                "username": username,
                "summary": details.get("summary"),
                "from_status": details.get("from_status"),
                "to_status": details.get("to_status"),
                "reason": details.get("reason"),
                "changes": details.get("changes"),
            }
        )
    return out
