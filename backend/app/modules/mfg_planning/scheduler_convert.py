"""Convert a scheduler proposal into a PROPOSED plan revision (Manufacturing Intelligence Phase 5; doc 16 15.10-15.12).

Order (15.12):
1. Replay first: the stored request_id is `sch-<proposal_hash[:24]>-<client request_id>`. When it exists, the same
   note replays it (200, no re-run); another note is 409 REQUEST_ID_REUSED.
2. Re-run the read-only engine inside a SAVEPOINT with a local `statement_timeout` of 20 s (the previous value is
   restored afterwards). A cancelled query is 503 SCHEDULER_TIMEOUT.
3. A different proposal hash is 409 PROPOSAL_STALE; an item starting on or before frozen_end is 422 FROZEN_ZONE;
   no items is 422 NOTHING_TO_CONVERT.
4. `plan_revision_service.propose(title="Scheduler proposal <hash[:12]>", reason=note)` (its own request_id
   idempotency, ownership checks and audit), then the extra audit `mfg_scheduler.convert`.
The whole current proposal is converted (<= 50 items); nothing changes on the plan until an approver applies it.
This module never commits (the router commits once) and never calls `safe_async_session_rollback` mid-request.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.models import Tenant, User
from app.models.mfg_planning import MfgPlanRevision
from app.modules.audit.service import log_action
from app.modules.mfg_intelligence import forward_plan_params as fp
from app.modules.mfg_intelligence.advanced_planning_router import STATEMENT_TIMEOUT_MS, _is_query_canceled
from app.modules.mfg_intelligence.advanced_planning_schemas import SchedulerConvertIn
from app.modules.mfg_intelligence.forward_plan_service import TooManyLines
from app.modules.mfg_intelligence.scheduler_service import (
    MAX_LINES,
    build_scheduler_params,
    load_scheduler_inputs,
    run_scheduler,
)
from app.modules.production import plan_revision_service as prs
from app.modules.production.plan_revision_service import RevisionItemIn

TITLE_PREFIX = "Scheduler proposal"


def stored_request_id(proposal_hash: str, client_request_id: str) -> str:
    return f"{prs.SCHEDULER_REQUEST_PREFIX}{proposal_hash[:24]}-{client_request_id}"


def revision_items(items: list[dict[str, Any]]) -> list[RevisionItemIn]:
    out: list[RevisionItemIn] = []
    for it in items:
        if it["action"] == "UPDATE":
            out.append(RevisionItemIn(action="UPDATE", config_id=it["config_id"], line_id=it["line_id"],
                                      start_date=it["start_date"], planned_end_date=it["planned_end_date"]))
        else:
            out.append(RevisionItemIn(
                action="CREATE", line_id=it["line_id"], order_id=it["order_id"], style_id=it["style_id"],
                start_date=it["start_date"], planned_end_date=it["planned_end_date"],
                planned_qty=Decimal(it["planned_qty"]), reservation_status="SOFT_BOOKED",
                target_efficiency_pct=Decimal(it["target_efficiency_pct"]) if it["target_efficiency_pct"] else None,
            ))
    return out


async def _rerun(db: AsyncSession, tenant: Tenant, params: Any, today: date) -> dict[str, Any]:
    previous = (await db.execute(select(func.current_setting("statement_timeout")))).scalar()
    try:
        async with db.begin_nested():
            await db.execute(select(func.set_config("statement_timeout", STATEMENT_TIMEOUT_MS, True)))
            inputs = await load_scheduler_inputs(db, tenant, params, today=today)
            result = run_scheduler(inputs)
    except TooManyLines as exc:
        raise fp.coded_error(422, "TOO_MANY_LINES", f"{exc.count} active lines; at most {MAX_LINES} - choose a factory_unit") from None
    except DBAPIError as exc:
        if _is_query_canceled(exc):
            raise fp.coded_error(503, "SCHEDULER_TIMEOUT", "The scheduler took too long; choose a factory unit") from None
        raise
    finally:
        await db.execute(select(func.set_config("statement_timeout", str(previous or "0"), True)))
    return result


async def convert(
    db: AsyncSession, *, tenant: Tenant, user: User, body: SchedulerConvertIn
) -> tuple[MfgPlanRevision, bool, dict[str, Any]]:
    """Returns (revision, created, info). created False = idempotent replay."""
    note = body.note.strip()
    if len(note) < prs.MIN_REASON_LEN:
        raise fp.coded_error(422, "NOTE_TOO_SHORT", f"A note of at least {prs.MIN_REASON_LEN} characters is required")
    request_id = stored_request_id(body.proposal_hash, body.request_id)
    existing = (
        await db.execute(
            select(MfgPlanRevision).where(MfgPlanRevision.tenant_id == tenant.id, MfgPlanRevision.request_id == request_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if (existing.reason or "").strip() != note:
            raise fp.coded_error(409, "REQUEST_ID_REUSED", "This request_id was already used with a different note")
        return existing, False, {"proposal_hash": body.proposal_hash, "replay": True, "items": None}

    p = body.params
    params = build_scheduler_params(
        horizon_days=p.horizon_days, factory_unit=p.factory_unit, material_delay_days=p.material_delay_days,
        btb_delay_days=p.btb_delay_days, exclude_job_ids=p.exclude_job_ids,
    )
    today = today_local(tenant)
    result = await _rerun(db, tenant, params, today)
    if result["proposal_hash"] != body.proposal_hash:
        raise fp.coded_error(409, "PROPOSAL_STALE", "The plan changed since the preview; run the preview again")
    items = result["items"]
    if not items:
        raise fp.coded_error(422, "NOTHING_TO_CONVERT", "The proposal has no changes")
    frozen_end: date = result["frozen_end"]
    if any(it["start_date"] <= frozen_end for it in items):
        raise fp.coded_error(422, "FROZEN_ZONE", "A proposed booking starts inside the frozen zone")
    rev, created = await prs.propose(
        db, tenant=tenant, user=user, items=revision_items(items), reason=note,
        title=f"{TITLE_PREFIX} {body.proposal_hash[:12]}", request_id=request_id,
    )
    if created:
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            action="mfg_scheduler.convert",
            resource=f"mfg_plan_revision:{rev.id}",
            details=f"proposal_hash={body.proposal_hash[:24]} items={len(items)} frozen_end={frozen_end.isoformat()}",
        )
    return rev, created, {"proposal_hash": body.proposal_hash, "replay": not created, "items": len(items)}
