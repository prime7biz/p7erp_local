"""Small edit log for business documents (PO, requisition, ...) in the shared `audit_logs` table.

    resource = "<doc_type>:<id>"   e.g. "purchase_order:42"
    action   = "<doc_type>.<event>" e.g. "purchase_order.status"
    details  = JSON {summary, from_status, to_status, reason, extra}

Same pattern as app/modules/finance/voucher_history.py: the row is written in a SAVEPOINT
inside the caller's transaction, so it commits with the change and never blocks it.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.user import User

logger = logging.getLogger(__name__)


def doc_resource(doc_type: str, doc_id: int) -> str:
    return f"{doc_type}:{doc_id}"[:64]


async def record_doc_event(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    doc_type: str,
    doc_id: int,
    event: str,
    summary: str,
    from_status: str | None = None,
    to_status: str | None = None,
    reason: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    payload = {
        "summary": summary,
        "from_status": from_status,
        "to_status": to_status,
        "reason": (reason or "").strip() or None,
        "extra": extra or None,
    }
    try:
        async with db.begin_nested():
            db.add(
                AuditLog(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    action=f"{doc_type}.{event}"[:64],
                    resource=doc_resource(doc_type, doc_id),
                    details=json.dumps(payload, default=str),
                )
            )
    except Exception:
        logger.exception("document_history_write_failed tenant=%s %s=%s event=%s", tenant_id, doc_type, doc_id, event)


async def list_doc_events(
    db: AsyncSession, *, tenant_id: int, doc_type: str, doc_id: int, limit: int = 200
) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            select(AuditLog, User.username)
            .outerjoin(User, User.id == AuditLog.user_id)
            .where(AuditLog.tenant_id == tenant_id, AuditLog.resource == doc_resource(doc_type, doc_id))
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
        )
    ).all()
    out: list[dict[str, Any]] = []
    prefix = f"{doc_type}."
    for log, username in rows:
        try:
            details = json.loads(log.details) if log.details else {}
        except (TypeError, ValueError):
            details = {"summary": log.details}
        out.append(
            {
                "id": log.id,
                "event": log.action.removeprefix(prefix),
                "at": log.created_at.isoformat() if log.created_at else None,
                "user_id": log.user_id,
                "username": username,
                "summary": details.get("summary"),
                "from_status": details.get("from_status"),
                "to_status": details.get("to_status"),
                "reason": details.get("reason"),
                "extra": details.get("extra"),
            }
        )
    return out
