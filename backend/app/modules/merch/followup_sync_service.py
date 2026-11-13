"""Complete merch OrderFollowupAction milestones from real business events.

Fail-closed: never raise into the caller request path; log and skip on error.
Guarded by tenants.feature_flags.tna_event_sync (default off).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.tenant_feature_keys import is_tna_event_sync_enabled
from app.database import safe_async_session_rollback
from app.models import Tenant
from app.models.merch import FollowupActionTemplate, OrderFollowupAction
from app.modules.merch.constants import milestones_for_event

logger = logging.getLogger(__name__)

_DONE = frozenset({"completed", "approved", "cancelled"})
_SYSTEM_REMARK_PREFIX = "[auto-sync]"


async def sync_order_followup_from_events(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
    event_key: str,
    sample_type: str | None = None,
    external_id: int | None = None,
    merch_sample_request_id: int | None = None,
    user_id: int | None = None,
    note: str | None = None,
    rollback_on_error: bool = True,
) -> list[int]:
    """Mark matching open TNA actions completed. Returns completed action ids.

    Matching: ``milestone_type`` in codes, or linked template ``code`` in codes,
    or (for samples) ``merch_sample_request_id`` match.
    Idempotent for already-completed rows.

    ``rollback_on_error=False`` re-raises instead of rolling back the whole session, for callers that run
    the sync inside their own savepoint (``begin_nested``) and must keep the outer transaction.
    """
    completed_ids: list[int] = []
    try:
        tenant = await db.get(Tenant, tenant_id)
        if not tenant or not is_tna_event_sync_enabled(tenant.feature_flags):
            return completed_ids

        codes = milestones_for_event(event_key, sample_type=sample_type)
        if not codes and merch_sample_request_id is None:
            return completed_ids

        codes_l = tuple(c.lower() for c in codes)
        stmt = select(OrderFollowupAction).where(
            OrderFollowupAction.tenant_id == tenant_id,
            OrderFollowupAction.order_id == order_id,
            OrderFollowupAction.is_active.is_(True),
        )
        rows = (await db.execute(stmt)).scalars().all()
        if not rows:
            return completed_ids

        # Resolve template codes for rows missing milestone_type
        template_ids = {r.template_id for r in rows if r.template_id and not r.milestone_type}
        tmpl_code: dict[int, str] = {}
        if template_ids:
            tres = await db.execute(
                select(FollowupActionTemplate.id, FollowupActionTemplate.code).where(
                    FollowupActionTemplate.tenant_id == tenant_id,
                    FollowupActionTemplate.id.in_(template_ids),
                )
            )
            tmpl_code = {int(i): str(c) for i, c in tres.all()}

        now = datetime.utcnow()
        today = today_local(tenant)
        remark = note or f"{_SYSTEM_REMARK_PREFIX} event={event_key}"
        for row in rows:
            st = (row.status or "").lower()
            if st in _DONE:
                continue
            mt = (row.milestone_type or "").strip().lower()
            if not mt and row.template_id:
                mt = (tmpl_code.get(row.template_id) or "").strip().lower()
            linked_sample = (
                merch_sample_request_id is not None
                and row.merch_sample_request_id == merch_sample_request_id
            )
            if linked_sample:
                pass  # always complete linked sample action
            elif codes_l and mt and mt in codes_l:
                pass
            else:
                continue

            if not row.milestone_type and mt:
                row.milestone_type = mt
            row.status = "completed"
            row.actual_completion_date = today
            row.completed_at = now
            if user_id is not None:
                row.completed_by_id = user_id
            if external_id is not None and row.external_id is None:
                row.external_id = external_id
            if merch_sample_request_id is not None and row.merch_sample_request_id is None:
                row.merch_sample_request_id = merch_sample_request_id
            existing = (row.remarks or "").strip()
            if _SYSTEM_REMARK_PREFIX not in existing:
                row.remarks = f"{existing}\n{remark}".strip() if existing else remark
            completed_ids.append(row.id)

        if completed_ids:
            await db.flush()
            logger.info(
                "tna_event_sync completed actions=%s tenant_id=%s order_id=%s event=%s",
                completed_ids,
                tenant_id,
                order_id,
                event_key,
            )
    except Exception:
        logger.exception(
            "tna_event_sync failed tenant_id=%s order_id=%s event=%s",
            tenant_id,
            order_id,
            event_key,
        )
        if not rollback_on_error:
            raise
        await safe_async_session_rollback(db)
        return []
    return completed_ids


async def maybe_sync_followup(
    db: AsyncSession,
    *,
    tenant: Tenant | Any,
    order_id: int | None,
    event_key: str,
    **kwargs: Any,
) -> list[int]:
    """Convenience wrapper used at inventory/sample/production call sites."""
    if not order_id:
        return []
    tenant_id = int(getattr(tenant, "id", 0) or 0)
    if not tenant_id:
        return []
    return await sync_order_followup_from_events(
        db,
        tenant_id=tenant_id,
        order_id=int(order_id),
        event_key=event_key,
        **kwargs,
    )
