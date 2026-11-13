"""Plan revisions: propose, approve-and-apply, reject and cancel changes to order-linked line bookings
(Manufacturing Intelligence Phase 2, run R3; tenant flag `mfg_integrated_planning_v1`).

A revision is a list of items on `sewing_line_style_configs`:
    CREATE  a new order-linked row (DRAFT / SOFT_BOOKED / FIRM_BOOKED)
    UPDATE  change line, dates, quantity, status, shift, operators or efficiency of a live row
    CANCEL  set a live row CANCELLED (an IN_PROGRESS row cannot be cancelled)

Rules
- Only a confirmed order (status NEW / CONFIRMED / IN_PROGRESS) may get a FIRM_BOOKED row. This is allowed even when
  materials are not ready (owner rule); the impact carries a material warning instead of blocking.
- COMPLETED and CANCELLED rows are immutable. Every client id passes `ensure_owned` (another tenant's id = 404).
- propose is idempotent per `request_id` (same payload -> same revision, different payload -> 409).
- approve locks the revision, enforces four-eyes (flag `mfg_plan_four_eyes`: the proposer cannot approve), locks the
  rows in id order, compares each row's `lock_version` (a database trigger bumps it for every legacy planning change,
  NULL counts as 0): any mismatch -> 409 and NOTHING is written. Then it applies every item in the caller's transaction
  (the router commits once). Approving an APPLIED revision returns the stored result.
- New / changed rows get `smv_per_piece` = the resolved per-piece SMV (approved OB total_smv, same hierarchy as the
  Phase 1 readers) and `total_smv_minutes` = planned_qty x smv_per_piece.
- A new FIRM row syncs the follow-up (TNA) like the legacy confirm does, but inside a savepoint: a failure is logged and
  never aborts the approval. Same gate as legacy: `line_allocation_confirm_enabled`.
- This service never commits and never calls `safe_async_session_rollback` mid-request.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.document_history import record_doc_event
from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_line_allocation_confirm_enabled, is_mfg_plan_four_eyes_enabled
from app.models import (
    GarmentStyle,
    OperationBulletin,
    Order,
    ProductionShift,
    SewingLine,
    SewingLineStyleConfig,
    Tenant,
    User,
)
from app.models.mfg_planning import (
    REVISION_APPLIED,
    REVISION_CANCELLED,
    REVISION_PROPOSED,
    REVISION_REJECTED,
    MfgPlanRevision,
    MfgPlanRevisionItem,
)
from app.modules.audit.service import log_action
from app.modules.mfg_intelligence.confirmed_demand import is_confirmed_status
from app.modules.mfg_intelligence.flags import (
    allocation_v1_on,
    integrated_planning_on,
    order_bom_readiness_v2_on,
    planning_math_v2_on,
)
from app.modules.mfg_intelligence.impact_service import MAX_IMPACT_ITEMS, compute_scenario_impact
from app.modules.mfg_intelligence.scenario import NEW_ROW_ID_BASE, Scenario, ScenarioRow
from app.modules.mfg_intelligence.smv_resolver import SmvResult, resolve_smv_for_rows

logger = logging.getLogger(__name__)

ACTION_CREATE = "CREATE"
ACTION_UPDATE = "UPDATE"
ACTION_CANCEL = "CANCEL"

BOOKABLE_STATUSES = ("DRAFT", "SOFT_BOOKED", "FIRM_BOOKED")
LIVE_STATUSES = ("DRAFT", "SOFT_BOOKED", "FIRM_BOOKED", "IN_PROGRESS")
FIRM = "FIRM_BOOKED"
MAX_SPAN_DAYS = 366
MIN_REASON_LEN = 5
MAX_REVISION_LIST = 100
# Phase 5 scheduler proposals are stored with request_id "sch-<proposal hash[:24]>-<client id>" (frozen fence).
SCHEDULER_REQUEST_PREFIX = "sch-"

PLAN_FIELDS = (
    "line_id",
    "order_id",
    "style_id",
    "ob_id",
    "shift_id",
    "start_date",
    "planned_end_date",
    "planned_qty",
    "reservation_status",
    "operator_count",
    "target_efficiency_pct",
)


class RevisionItemIn(BaseModel):
    """One requested change. For UPDATE only the fields that are sent change (unsent fields keep the stored value)."""

    model_config = ConfigDict(extra="forbid")

    action: Literal["CREATE", "UPDATE", "CANCEL"]
    config_id: int | None = Field(None, ge=1)
    line_id: int | None = Field(None, ge=1)
    order_id: int | None = Field(None, ge=1)
    style_id: int | None = Field(None, ge=1)
    ob_id: int | None = Field(None, ge=1)
    shift_id: int | None = Field(None, ge=1)
    start_date: date | None = None
    planned_end_date: date | None = None
    planned_qty: Decimal | None = Field(None, gt=0, max_digits=18, decimal_places=3)
    reservation_status: Literal["DRAFT", "SOFT_BOOKED", "FIRM_BOOKED"] | None = None
    operator_count: int | None = Field(None, ge=0, le=100000)
    target_efficiency_pct: Decimal | None = Field(None, gt=0, le=100, max_digits=8, decimal_places=2)


# ------------------------------------------------------------------ JSON helpers


def _jsonable(fields: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in fields.items():
        if isinstance(v, (date, datetime)):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = format(v, "f")
        else:
            out[k] = v
    return out


def _parse_fields(raw: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = dict(raw)
    for k in ("start_date", "planned_end_date"):
        if out.get(k):
            out[k] = date.fromisoformat(out[k]) if isinstance(out[k], str) else out[k]
    for k in ("planned_qty", "target_efficiency_pct"):
        if out.get(k) is not None:
            try:
                out[k] = Decimal(str(out[k]))
            except InvalidOperation:
                raise HTTPException(status_code=409, detail="Stored revision data is invalid") from None
    return out


def _snapshot(cfg: SewingLineStyleConfig) -> dict[str, Any]:
    return {
        "line_id": cfg.line_id,
        "order_id": cfg.order_id,
        "style_id": cfg.style_id,
        "ob_id": cfg.ob_id,
        "shift_id": cfg.shift_id,
        "start_date": cfg.start_date,
        "planned_end_date": cfg.planned_end_date,
        "planned_qty": Decimal(str(cfg.planned_qty)),
        "reservation_status": (cfg.reservation_status or "").strip().upper(),
        "operator_count": int(cfg.operator_count or 0),
        "target_efficiency_pct": Decimal(str(cfg.target_efficiency_pct)),
    }


def _lv(value: Any) -> int:
    return int(value or 0)  # NULL lock_version counts as 0


def payload_hash(items: list[RevisionItemIn], reason: str, title: str | None) -> str:
    body = {
        "items": [i.model_dump(mode="json", exclude_unset=True) for i in items],
        "reason": reason.strip(),
        "title": (title or "").strip() or None,
    }
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()


# ------------------------------------------------------------------ validation


@dataclass
class PlannedItem:
    action: str
    cfg: SewingLineStyleConfig | None
    before: dict[str, Any] | None
    after: dict[str, Any] | None  # full resulting planning fields (None for CANCEL)
    sort_order: int = 0
    smv: SmvResult | None = None
    row: ScenarioRow | None = None


@dataclass
class Plan:
    items: list[PlannedItem] = field(default_factory=list)
    orders: dict[int, Order] = field(default_factory=dict)


async def _load_configs_locked(
    db: AsyncSession, tenant_id: int, ids: list[int], *, lock: bool
) -> dict[int, SewingLineStyleConfig]:
    if not ids:
        return {}
    stmt = (
        select(SewingLineStyleConfig)
        .where(SewingLineStyleConfig.tenant_id == tenant_id, SewingLineStyleConfig.id.in_(sorted(set(ids))))
        .order_by(SewingLineStyleConfig.id)
        .execution_options(populate_existing=True)
    )
    if lock:
        stmt = stmt.with_for_update()
    return {c.id: c for c in (await db.execute(stmt)).scalars().all()}


def _err(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


async def _check_after_fields(
    db: AsyncSession, tenant_id: int, after: dict[str, Any], plan: Plan, index: int
) -> None:
    label = f"item {index + 1}"
    await ensure_owned(db, SewingLine, after["line_id"], tenant_id, "Sewing line", status_code=404)
    order = plan.orders.get(after["order_id"])
    if order is None:
        order = await ensure_owned(db, Order, after["order_id"], tenant_id, "Order", status_code=404)
        plan.orders[after["order_id"]] = order  # type: ignore[assignment]
    await ensure_owned(db, GarmentStyle, after.get("style_id"), tenant_id, "Style", status_code=404)
    await ensure_owned(db, OperationBulletin, after.get("ob_id"), tenant_id, "Operation bulletin", status_code=404)
    await ensure_owned(db, ProductionShift, after.get("shift_id"), tenant_id, "Shift", status_code=404)
    start, end = after["start_date"], after.get("planned_end_date")
    if end is not None and end < start:
        raise _err(422, f"{label}: planned_end_date must be on or after start_date")
    if end is not None and (end - start).days > MAX_SPAN_DAYS:
        raise _err(422, f"{label}: a booking cannot span more than {MAX_SPAN_DAYS} days")
    if after["reservation_status"] == FIRM and not is_confirmed_status(order.status):  # type: ignore[union-attr]
        raise _err(422, f"{label}: only a confirmed order can have a FIRM_BOOKED row (order is {order.status})")  # type: ignore[union-attr]


async def validate_items(db: AsyncSession, tenant_id: int, items: list[RevisionItemIn]) -> Plan:
    """Validate every item against current data and build the plan (no writes)."""
    if not items:
        raise _err(422, "A revision needs at least one item")
    if len(items) > MAX_IMPACT_ITEMS:
        raise _err(422, f"A revision can have at most {MAX_IMPACT_ITEMS} items")
    plan = Plan()
    config_ids = [i.config_id for i in items if i.config_id]
    if len(config_ids) != len(set(config_ids)):
        raise _err(422, "The same booking is listed more than once")
    configs = await _load_configs_locked(db, tenant_id, config_ids, lock=False)

    for idx, item in enumerate(items):
        label = f"item {idx + 1}"
        if item.action == ACTION_CREATE:
            if item.config_id is not None:
                raise _err(422, f"{label}: CREATE must not have a config_id")
            missing = [
                n for n in ("line_id", "order_id", "start_date", "planned_qty") if getattr(item, n) is None
            ]
            if missing:
                raise _err(422, f"{label}: CREATE needs {', '.join(missing)}")
            order = await ensure_owned(db, Order, item.order_id, tenant_id, "Order", status_code=404)
            plan.orders[int(item.order_id)] = order  # type: ignore[arg-type]
            after = {
                "line_id": item.line_id,
                "order_id": item.order_id,
                "style_id": item.style_id if item.style_id is not None else order.style_id,  # type: ignore[union-attr]
                "ob_id": item.ob_id,
                "shift_id": item.shift_id,
                "start_date": item.start_date,
                "planned_end_date": item.planned_end_date,
                "planned_qty": item.planned_qty,
                "reservation_status": item.reservation_status or "DRAFT",
                "operator_count": item.operator_count if item.operator_count is not None else 0,
                "target_efficiency_pct": item.target_efficiency_pct
                if item.target_efficiency_pct is not None
                else Decimal("65"),
            }
            await _check_after_fields(db, tenant_id, after, plan, idx)
            plan.items.append(PlannedItem(ACTION_CREATE, None, None, after, idx))
            continue

        if item.config_id is None:
            raise _err(422, f"{label}: {item.action} needs a config_id")
        cfg = configs.get(item.config_id)
        if cfg is None:
            raise _err(404, f"{label}: booking not found")
        if cfg.order_id is None:
            raise _err(422, f"{label}: only order-linked bookings can be revised")
        current = (cfg.reservation_status or "").strip().upper()
        if current in ("COMPLETED", "CANCELLED"):
            raise _err(409, f"{label}: a {current} booking cannot be changed")
        before = _snapshot(cfg)
        if item.action == ACTION_CANCEL:
            if current == "IN_PROGRESS":
                raise _err(409, f"{label}: an IN_PROGRESS booking cannot be cancelled")
            plan.orders.setdefault(
                int(cfg.order_id),
                await ensure_owned(db, Order, cfg.order_id, tenant_id, "Order", status_code=404),  # type: ignore[arg-type]
            )
            plan.items.append(PlannedItem(ACTION_CANCEL, cfg, before, None, idx))
            continue

        # UPDATE: unsent fields keep the stored value
        sent = item.model_fields_set
        after = dict(before)
        for name in PLAN_FIELDS:
            if name == "order_id":
                if "order_id" in sent and item.order_id != cfg.order_id:
                    raise _err(422, f"{label}: the order of a booking cannot be changed")
                continue
            if name in sent:
                value = getattr(item, name)
                if value is None and name in ("line_id", "start_date", "planned_qty", "reservation_status",
                                              "operator_count", "target_efficiency_pct"):
                    raise _err(422, f"{label}: {name} cannot be empty")
                after[name] = value
        if current == "IN_PROGRESS" and after["reservation_status"] != "IN_PROGRESS":
            if "reservation_status" in sent:
                raise _err(422, f"{label}: the status of an IN_PROGRESS booking cannot be changed")
            after["reservation_status"] = "IN_PROGRESS"
        if Decimal(str(after["planned_qty"])) < _completed(cfg):
            raise _err(422, f"{label}: planned_qty cannot be below the quantity already produced ({_completed(cfg)})")
        await _check_after_fields(db, tenant_id, after, plan, idx)
        plan.items.append(PlannedItem(ACTION_UPDATE, cfg, before, after, idx))
    return plan


def _completed(cfg: SewingLineStyleConfig) -> Decimal:
    return Decimal(str(cfg.completed_qty or 0))


# ------------------------------------------------------------------ scenario and SMV


def _row_from_after(tenant_id: int, after: dict[str, Any], *, row_id: int, cfg: SewingLineStyleConfig | None) -> ScenarioRow:
    return ScenarioRow(
        id=row_id,
        tenant_id=tenant_id,
        line_id=after["line_id"],
        order_id=after["order_id"],
        style_id=after.get("style_id"),
        ob_id=after.get("ob_id"),
        shift_id=after.get("shift_id"),
        operator_count=int(after.get("operator_count") or 0),
        target_efficiency_pct=Decimal(str(after.get("target_efficiency_pct"))),
        start_date=after["start_date"],
        planned_end_date=after.get("planned_end_date"),
        reservation_status=after["reservation_status"],
        planned_qty=Decimal(str(after["planned_qty"])),
        completed_qty=Decimal(str(cfg.completed_qty)) if cfg is not None else Decimal("0"),
        smv_per_piece=Decimal(str(cfg.smv_per_piece)) if cfg is not None and cfg.smv_per_piece is not None else None,
    )


async def build_scenario(db: AsyncSession, tenant_id: int, plan: Plan) -> Scenario:
    """In-memory what-if rows for the plan (also resolves each new / changed row's SMV)."""
    sc = Scenario()
    rows: list[ScenarioRow] = []
    for n, it in enumerate(plan.items):
        if it.action == ACTION_CANCEL:
            assert it.cfg is not None and it.before is not None
            sc.replacements[it.cfg.id] = None
            sc.order_ids.add(int(it.before["order_id"]))
            sc.line_ids.add(int(it.before["line_id"]))
            _extend_dates(sc, it.before)
            continue
        assert it.after is not None
        if it.action == ACTION_CREATE:
            row = _row_from_after(tenant_id, it.after, row_id=NEW_ROW_ID_BASE - n, cfg=None)
            sc.additions.append(row)
        else:
            assert it.cfg is not None and it.before is not None
            row = _row_from_after(tenant_id, it.after, row_id=it.cfg.id, cfg=it.cfg)
            sc.replacements[it.cfg.id] = row
            sc.line_ids.add(int(it.before["line_id"]))
            _extend_dates(sc, it.before)
        it.row = row
        rows.append(row)
        sc.order_ids.add(int(it.after["order_id"]))
        sc.line_ids.add(int(it.after["line_id"]))
        _extend_dates(sc, it.after)
        was_firm = it.before is not None and it.before["reservation_status"] in (FIRM, "IN_PROGRESS")
        if it.after["reservation_status"] == FIRM and not was_firm:
            sc.gaining_firm_order_ids.add(int(it.after["order_id"]))
    if rows:
        # Plan revisions exist only behind mfg_integrated_planning_v1, so the style standard SMV level applies.
        smv_by_id = await resolve_smv_for_rows(db, tenant_id, rows, use_style_standard=True)
        for it in plan.items:
            if it.row is not None:
                it.smv = smv_by_id[it.row.id]
                if it.smv.value is not None:
                    it.row.smv_per_piece = it.smv.value
    return sc


def _extend_dates(sc: Scenario, fields: dict[str, Any]) -> None:
    start = fields["start_date"]
    end = fields.get("planned_end_date") or start
    sc.date_min = start if sc.date_min is None else min(sc.date_min, start)
    sc.date_max = end if sc.date_max is None else max(sc.date_max, end)


async def _impact(db: AsyncSession, tenant: Tenant, sc: Scenario) -> dict[str, Any]:
    flags = tenant
    return await compute_scenario_impact(
        db,
        tenant.id,
        sc,
        today=today_local(tenant),
        planning_math_v2=planning_math_v2_on(flags),
        order_bom_v2=order_bom_readiness_v2_on(flags),
        allocation_v1=allocation_v1_on(flags),
        integrated_planning=integrated_planning_on(flags),
    )


def _jsonable_impact(impact: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(impact, default=str))


async def preview(db: AsyncSession, tenant: Tenant, items: list[RevisionItemIn]) -> dict[str, Any]:
    """Validate + impact, writes nothing."""
    plan = await validate_items(db, tenant.id, items)
    sc = await build_scenario(db, tenant.id, plan)
    impact = await _impact(db, tenant, sc)
    return {
        "items": [_preview_item(it) for it in plan.items],
        "impact": impact,
    }


def _preview_item(it: PlannedItem) -> dict[str, Any]:
    return {
        "action": it.action,
        "config_id": it.cfg.id if it.cfg is not None else None,
        "before": _jsonable(it.before) if it.before else None,
        "after": _jsonable(it.after) if it.after else None,
        "smv_per_piece": format(it.smv.value, "f") if it.smv is not None and it.smv.value is not None else None,
        "smv_source": it.smv.source if it.smv is not None else None,
    }


# ------------------------------------------------------------------ propose


async def _lock_revision_numbers(db: AsyncSession, tenant_id: int) -> None:
    await db.execute(select(func.pg_advisory_xact_lock(297_001, int(tenant_id))))


async def _find_by_request_id(db: AsyncSession, tenant_id: int, request_id: str) -> MfgPlanRevision | None:
    return (
        await db.execute(
            select(MfgPlanRevision).where(MfgPlanRevision.tenant_id == tenant_id, MfgPlanRevision.request_id == request_id)
        )
    ).scalar_one_or_none()


async def revision_items(db: AsyncSession, tenant_id: int, revision_id: int) -> list[MfgPlanRevisionItem]:
    return list(
        (
            await db.execute(
                select(MfgPlanRevisionItem)
                .where(MfgPlanRevisionItem.tenant_id == tenant_id, MfgPlanRevisionItem.revision_id == revision_id)
                .order_by(MfgPlanRevisionItem.sort_order, MfgPlanRevisionItem.id)
            )
        )
        .scalars()
        .all()
    )


async def propose(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    items: list[RevisionItemIn],
    reason: str,
    title: str | None,
    request_id: str | None,
) -> tuple[MfgPlanRevision, bool]:
    """Create a PROPOSED revision. Returns (revision, created); created is False for an idempotent replay."""
    reason = (reason or "").strip()
    if len(reason) < MIN_REASON_LEN:
        raise _err(422, f"A reason of at least {MIN_REASON_LEN} characters is required")
    request_id = (request_id or "").strip() or None
    digest = payload_hash(items, reason, title)
    tenant_id = tenant.id
    await _lock_revision_numbers(db, tenant_id)
    if request_id:
        existing = await _find_by_request_id(db, tenant_id, request_id)
        if existing is not None:
            if existing.payload_hash != digest:
                raise _err(409, "This request_id was already used with different content")
            return existing, False

    plan = await validate_items(db, tenant_id, items)
    sc = await build_scenario(db, tenant_id, plan)
    impact = _jsonable_impact(await _impact(db, tenant, sc))

    next_no = (
        await db.execute(select(func.coalesce(func.max(MfgPlanRevision.revision_no), 0)).where(MfgPlanRevision.tenant_id == tenant_id))
    ).scalar_one() + 1
    rev = MfgPlanRevision(
        tenant_id=tenant_id,
        revision_no=int(next_no),
        status=REVISION_PROPOSED,
        title=(title or "").strip()[:200] or None,
        reason=reason,
        request_id=request_id,
        payload_hash=digest,
        proposed_by_user_id=user.id,
        proposed_at=datetime.utcnow(),
        impact_json=impact,
        lock_version=0,
    )
    try:
        async with db.begin_nested():
            db.add(rev)
            await db.flush()
    except IntegrityError:
        # a concurrent request with the same request_id won the race: replay it
        if request_id:
            existing = await _find_by_request_id(db, tenant_id, request_id)
            if existing is not None and existing.payload_hash == digest:
                return existing, False
            if existing is not None:
                raise _err(409, "This request_id was already used with different content") from None
        raise
    for it in plan.items:
        db.add(
            MfgPlanRevisionItem(
                tenant_id=tenant_id,
                revision_id=rev.id,
                action=it.action,
                config_id=it.cfg.id if it.cfg is not None else None,
                before_json=_jsonable(it.before) if it.before else None,
                after_json=_jsonable(it.after) if it.after else None,
                before_lock_version=_lv(it.cfg.lock_version) if it.cfg is not None else None,
                sort_order=it.sort_order,
            )
        )
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="mfg_plan_revision.propose",
        resource=f"mfg_plan_revision:{rev.id}",
        details=f"revision_no={rev.revision_no} items={len(plan.items)} reason={reason[:200]}",
    )
    return rev, True


# ------------------------------------------------------------------ decide


async def _lock_revision(db: AsyncSession, tenant_id: int, revision_id: int) -> MfgPlanRevision:
    rev = (
        await db.execute(
            select(MfgPlanRevision)
            .where(MfgPlanRevision.tenant_id == tenant_id, MfgPlanRevision.id == revision_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if rev is None:
        raise _err(404, "Plan revision not found")
    return rev


async def _check_scheduler_frozen_fence(db: AsyncSession, tenant: Tenant, stored: list[MfgPlanRevisionItem]) -> None:
    """Phase 5 (doc 16 15.1): a scheduler proposal may not create or move load into today's frozen zone."""
    from app.modules.production.planning_settings_service import read_planning_settings

    settings = await read_planning_settings(db, tenant.id)
    frozen_end = today_local(tenant) + timedelta(days=int(settings["frozen_horizon_days"]) - 1)
    for i in stored:
        if i.action not in (ACTION_CREATE, ACTION_UPDATE) or not i.after_json or not i.after_json.get("start_date"):
            continue
        if date.fromisoformat(str(i.after_json["start_date"])) <= frozen_end:
            raise _err(
                409,
                f"PROPOSAL_ENTERED_FROZEN_ZONE: a scheduler booking now starts on or before the frozen-zone end "
                f"({frozen_end.isoformat()}). Nothing was applied; run the scheduler again",
            )


def can_user_approve(tenant: Tenant, user: User, rev: MfgPlanRevision, *, has_approve_permission: bool) -> bool:
    """UI hint: PROPOSED, has the approve permission, and (four-eyes on) is not the proposer."""
    if rev.status != REVISION_PROPOSED or not has_approve_permission:
        return False
    if is_mfg_plan_four_eyes_enabled(tenant.feature_flags) and rev.proposed_by_user_id == user.id:
        return False
    return True


async def approve_and_apply(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    revision_id: int,
    expected_lock_version: int,
    decision_note: str | None,
) -> tuple[MfgPlanRevision, bool]:
    """Apply the revision in the caller's transaction. Returns (revision, applied_now)."""
    tenant_id = tenant.id
    rev = await _lock_revision(db, tenant_id, revision_id)
    if rev.status == REVISION_APPLIED:
        return rev, False
    if rev.status != REVISION_PROPOSED:
        raise _err(409, f"Revision is {rev.status} and cannot be approved")
    if is_mfg_plan_four_eyes_enabled(tenant.feature_flags) and rev.proposed_by_user_id == user.id:
        raise _err(403, "Four-eyes rule: the person who proposed a plan change cannot approve it")
    if int(expected_lock_version) != _lv(rev.lock_version):
        raise _err(409, "The revision changed since you loaded it. Reload and review it again")

    stored = await revision_items(db, tenant_id, rev.id)
    if not stored:
        raise _err(409, "The revision has no items")
    if (rev.request_id or "").startswith(SCHEDULER_REQUEST_PREFIX):
        await _check_scheduler_frozen_fence(db, tenant, stored)
    cfg_ids = [i.config_id for i in stored if i.config_id]
    # an item whose row was deleted (config_id SET NULL) is stale
    for i in stored:
        if i.action != ACTION_CREATE and i.config_id is None:
            raise _err(409, "A booking in this revision no longer exists. Propose a new revision")
    # Orders that end up FIRM are locked first (sorted, same order as allocation), so a concurrent cancel cannot slip
    # between the confirmed-order re-check below and the commit.
    firm_order_ids = {
        int(i.after_json["order_id"])
        for i in stored
        if i.after_json and i.after_json.get("reservation_status") == FIRM and i.after_json.get("order_id")
    }
    from app.modules.inventory.reservation_service import lock_orders

    locked_orders = await lock_orders(db, tenant_id, firm_order_ids) if firm_order_ids else {}
    configs = await _load_configs_locked(db, tenant_id, cfg_ids, lock=True)

    plan = Plan()
    plan.orders.update(locked_orders)  # type: ignore[arg-type]
    stale: list[int] = []
    for i in stored:
        after = _parse_fields(i.after_json) if i.after_json else None
        before = _parse_fields(i.before_json) if i.before_json else None
        cfg = configs.get(i.config_id) if i.config_id else None
        if i.action != ACTION_CREATE:
            if cfg is None:
                raise _err(409, "A booking in this revision no longer exists. Propose a new revision")
            if _lv(cfg.lock_version) != _lv(i.before_lock_version):
                stale.append(cfg.id)
                continue
            if (cfg.reservation_status or "").strip().upper() in ("COMPLETED", "CANCELLED"):
                stale.append(cfg.id)
                continue
            if i.action == ACTION_CANCEL and (cfg.reservation_status or "").strip().upper() == "IN_PROGRESS":
                stale.append(cfg.id)
                continue
            # the lock_version trigger does not watch order / style / OB: compare them with the proposal snapshot
            if before is not None and any(before.get(k) != getattr(cfg, k) for k in ("order_id", "style_id", "ob_id")):
                stale.append(cfg.id)
                continue
            # completed_qty is not a trigger field: output reported since the proposal can overtake the new plan
            if after is not None and Decimal(str(after["planned_qty"])) < _completed(cfg):
                stale.append(cfg.id)
                continue
        plan.items.append(PlannedItem(i.action, cfg, before, after, i.sort_order))
    if stale:
        raise _err(
            409,
            "The plan changed after this revision was proposed (booking ids: "
            + ", ".join(str(x) for x in sorted(set(stale)))
            + "). Nothing was applied; propose a new revision",
        )
    # re-validate ownership / confirmed-order rule against current data (no writes yet)
    for n, it in enumerate(plan.items):
        if it.action in (ACTION_CREATE, ACTION_UPDATE):
            assert it.after is not None
            await _check_after_fields(db, tenant_id, it.after, plan, n)
        elif it.before is not None and int(it.before["order_id"]) not in plan.orders:
            plan.orders[int(it.before["order_id"])] = await ensure_owned(  # type: ignore[assignment]
                db, Order, it.before["order_id"], tenant_id, "Order", status_code=404
            )

    sc = await build_scenario(db, tenant_id, plan)
    impact = _jsonable_impact(await _impact(db, tenant, sc))  # before-write comparison against the stored plan

    now = datetime.utcnow()
    applied_rows: list[tuple[PlannedItem, SewingLineStyleConfig]] = []
    firm_new: list[SewingLineStyleConfig] = []
    stored_by_sort = {i.sort_order: i for i in stored}
    create_line_ids = {int(it.after["line_id"]) for it in plan.items if it.action == ACTION_CREATE and it.after}
    lines_by_id: dict[int, SewingLine] = {}
    if create_line_ids:
        lines_by_id = {
            ln.id: ln
            for ln in (
                await db.execute(
                    select(SewingLine).where(SewingLine.tenant_id == tenant_id, SewingLine.id.in_(create_line_ids))
                )
            ).scalars()
        }
    for it in plan.items:
        item_row = stored_by_sort[it.sort_order]
        if it.action == ACTION_CANCEL:
            assert it.cfg is not None
            it.cfg.reservation_status = "CANCELLED"
            item_row.applied_config_id = it.cfg.id
            applied_rows.append((it, it.cfg))
            continue
        assert it.after is not None and it.row is not None
        smv_value = it.smv.value if it.smv is not None else None
        qty = Decimal(str(it.after["planned_qty"]))
        if it.action == ACTION_CREATE:
            line = lines_by_id.get(int(it.after["line_id"]))
            cfg = SewingLineStyleConfig(
                tenant_id=tenant_id,
                line_id=it.after["line_id"],
                order_id=it.after["order_id"],
                style_id=it.after.get("style_id"),
                ob_id=it.after.get("ob_id"),
                machine_count=int(line.running_machine_count or 0) if line is not None else 0,
                operator_count=int(it.after.get("operator_count") or 0),
                helper_count=0,
                target_efficiency_pct=it.after["target_efficiency_pct"],
                shift_id=it.after.get("shift_id"),
                start_date=it.after["start_date"],
                planned_end_date=it.after.get("planned_end_date"),
                status="planned",
                reservation_status=it.after["reservation_status"],
                planned_qty=qty,
                completed_qty=0,
                sort_order=0,
            )
            db.add(cfg)
        else:
            cfg = it.cfg  # type: ignore[assignment]
            assert cfg is not None and it.before is not None
            if (
                it.after["line_id"] != it.before["line_id"]
                or it.after["start_date"] != it.before["start_date"]
                or it.after.get("planned_end_date") != it.before.get("planned_end_date")
            ):
                cfg.schedule_version = _lv(cfg.schedule_version) + 1
            cfg.line_id = it.after["line_id"]
            cfg.style_id = it.after.get("style_id")
            cfg.ob_id = it.after.get("ob_id")
            cfg.shift_id = it.after.get("shift_id")
            cfg.start_date = it.after["start_date"]
            cfg.planned_end_date = it.after.get("planned_end_date")
            cfg.planned_qty = qty
            cfg.reservation_status = it.after["reservation_status"]
            cfg.operator_count = int(it.after.get("operator_count") or 0)
            cfg.target_efficiency_pct = it.after["target_efficiency_pct"]
        if smv_value is not None:
            cfg.smv_per_piece = smv_value
            cfg.total_smv_minutes = (qty * smv_value).quantize(Decimal("0.01"))
            cfg.source_smv_type = it.smv.source if it.smv is not None else None
        else:
            if it.action == ACTION_CREATE:
                cfg.smv_per_piece = None
            cfg.total_smv_minutes = None  # unknown SMV: an old total would no longer match the new quantity
            cfg.source_smv_type = None
        new_status = it.after["reservation_status"]
        old_status = it.before["reservation_status"] if it.before else None
        if new_status == "SOFT_BOOKED" and old_status != "SOFT_BOOKED":
            cfg.soft_booked_at = now
        if new_status == FIRM and old_status != FIRM:
            cfg.firm_booked_at = now
            firm_new.append(cfg)
        applied_rows.append((it, cfg))
    await db.flush()
    for it, cfg in applied_rows:
        item_row = stored_by_sort[it.sort_order]
        item_row.applied_config_id = cfg.id
        await db.refresh(cfg, ["lock_version"])  # the database trigger bumped it

    # Follow-up (TNA) sync for new FIRM rows: same gate as the legacy confirm, but in a savepoint.
    # Plain values are read first: a rolled-back savepoint must not leave us reading expired ORM attributes.
    revision_no = rev.revision_no
    next_lock_version = _lv(rev.lock_version) + 1
    firm_targets = [(int(c.id), int(c.order_id)) for c in firm_new if c.order_id]
    if firm_targets and is_line_allocation_confirm_enabled(tenant.feature_flags):
        from app.modules.merch.constants import TNA_EVENT_LINE_ALLOCATED
        from app.modules.merch.followup_sync_service import maybe_sync_followup

        for cfg_id, order_id in firm_targets:
            try:
                async with db.begin_nested():
                    await maybe_sync_followup(
                        db,
                        tenant=tenant,
                        order_id=order_id,
                        event_key=TNA_EVENT_LINE_ALLOCATED,
                        external_id=cfg_id,
                        user_id=user.id,
                        note=f"[auto-sync] Line allocation confirmed config={cfg_id} (plan revision {revision_no})",
                        rollback_on_error=False,
                    )
            except Exception:  # noqa: BLE001 - the savepoint is rolled back; the approval must go on
                logger.exception("mfg_plan_revision follow-up sync failed config_id=%s", cfg_id)

    rev.status = REVISION_APPLIED
    rev.decided_by_user_id = user.id
    rev.decided_at = now
    rev.applied_at = now
    rev.decision_note = (decision_note or "").strip() or None
    rev.impact_json = impact
    rev.lock_version = next_lock_version
    await db.flush()

    await log_action(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="mfg_plan_revision.approve",
        resource=f"mfg_plan_revision:{rev.id}",
        details=f"revision_no={rev.revision_no} items={len(applied_rows)}",
    )
    for oid in sorted({int(o) for o in sc.order_ids}):
        await record_doc_event(
            db,
            tenant_id=tenant_id,
            user_id=user.id,
            doc_type="order",
            doc_id=oid,
            event="plan_revision_applied",
            summary=f"Line plan revision #{rev.revision_no} applied",
            reason=rev.reason,
            extra={"revision_id": rev.id},
        )
    return rev, True


async def reject(
    db: AsyncSession, *, tenant: Tenant, user: User, revision_id: int, decision_note: str
) -> tuple[MfgPlanRevision, bool]:
    note = (decision_note or "").strip()
    if not note:
        raise _err(422, "A decision note is required to reject a revision")
    rev = await _lock_revision(db, tenant.id, revision_id)
    if rev.status == REVISION_REJECTED:
        return rev, False
    if rev.status != REVISION_PROPOSED:
        raise _err(409, f"Revision is {rev.status} and cannot be rejected")
    now = datetime.utcnow()
    rev.status = REVISION_REJECTED
    rev.decided_by_user_id = user.id
    rev.decided_at = now
    rev.decision_note = note
    rev.lock_version = _lv(rev.lock_version) + 1
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="mfg_plan_revision.reject",
        resource=f"mfg_plan_revision:{rev.id}",
        details=f"revision_no={rev.revision_no} note={note[:200]}",
    )
    return rev, True


async def cancel(
    db: AsyncSession, *, tenant: Tenant, user: User, revision_id: int, can_approve: bool
) -> tuple[MfgPlanRevision, bool]:
    """The proposer or an approver may cancel a PROPOSED revision."""
    rev = await _lock_revision(db, tenant.id, revision_id)
    if rev.proposed_by_user_id != user.id and not can_approve:
        raise _err(status.HTTP_403_FORBIDDEN, "Only the proposer or an approver can cancel this revision")
    if rev.status == REVISION_CANCELLED:
        return rev, False
    if rev.status != REVISION_PROPOSED:
        raise _err(409, f"Revision is {rev.status} and cannot be cancelled")
    rev.status = REVISION_CANCELLED
    rev.decided_by_user_id = user.id
    rev.decided_at = datetime.utcnow()
    rev.lock_version = _lv(rev.lock_version) + 1
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="mfg_plan_revision.cancel",
        resource=f"mfg_plan_revision:{rev.id}",
        details=f"revision_no={rev.revision_no}",
    )
    return rev, True
