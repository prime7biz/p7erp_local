"""SMV (standard minute value) per piece for a line plan row.

Order of sources (doc 04, section 1):
1. the row's own operation bulletin (`ob_id`) -> `OperationBulletin.total_smv` (per piece, must be > 0)
2. the latest approved operation bulletin of the row's style (highest version)
3. (Phase 2, only with `use_style_standard=True`, i.e. tenant flag `mfg_integrated_planning_v1` on) the style's
   approved `garment_styles.standard_smv` (reason SMV_FROM_STYLE_STANDARD, confidence as approved)
4. `smv_per_piece` stored on the plan row (reason SMV_FROM_PLAN_ROW, low confidence)
5. otherwise UNKNOWN (value None). We never divide by quantity and never default to 12.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GarmentStyle, OperationBulletin
from app.modules.mfg_intelligence.decimals import ZERO, to_dec

SMV_OB = "OB"
SMV_STYLE_APPROVED_OB = "STYLE_APPROVED_OB"
SMV_STYLE_STANDARD = "STYLE_STANDARD"
SMV_PLAN_ROW = "PLAN_ROW"


@dataclass
class SmvResult:
    value: Decimal | None
    source: str | None = None
    confidence: str | None = None  # high | medium | low
    reason_codes: list[str] = field(default_factory=list)


def _positive(value: Any) -> Decimal | None:
    d = to_dec(value)
    return d if d is not None and d > ZERO else None


async def resolve_smv_for_rows(
    db: AsyncSession, tenant_id: int, rows: Iterable[Any], *, use_style_standard: bool = False
) -> dict[int, SmvResult]:
    """Resolve SMV for plan rows in batched queries (by OB id, by style id). Key = plan row id.

    Order: row OB approved (high) -> latest approved OB of the style (high) -> [only with `use_style_standard`:
    approved style standard SMV] -> row OB not approved (low, SMV_FROM_UNAPPROVED_OB) -> plan row smv_per_piece
    (low) -> UNKNOWN. With `use_style_standard=False` (default) the result is exactly the Phase 1 result.
    """
    rows = list(rows)
    ob_ids = {int(r.ob_id) for r in rows if r.ob_id}
    ob_info: dict[int, tuple[Decimal, bool, int | None]] = {}  # id -> (total, approved, style_id)
    if ob_ids:
        for oid, total, status, sid in (
            await db.execute(
                select(
                    OperationBulletin.id,
                    OperationBulletin.total_smv,
                    OperationBulletin.status,
                    OperationBulletin.style_id,
                ).where(OperationBulletin.tenant_id == tenant_id, OperationBulletin.id.in_(ob_ids))
            )
        ).all():
            v = _positive(total)
            if v is not None:
                approved = (status or "").strip().lower() == "approved"
                ob_info[int(oid)] = (v, approved, int(sid) if sid else None)

    def _row_style(r: Any) -> int | None:
        if r.style_id:
            return int(r.style_id)
        info = ob_info.get(int(r.ob_id)) if r.ob_id else None
        return info[2] if info else None

    style_ids: set[int] = set()
    for r in rows:
        info = ob_info.get(int(r.ob_id)) if r.ob_id else None
        if info is not None and info[1]:
            continue
        sid = _row_style(r)
        if sid is not None:
            style_ids.add(sid)
    style_smv: dict[int, Decimal] = {}
    if style_ids:
        ob_rows = (
            await db.execute(
                select(OperationBulletin.style_id, OperationBulletin.total_smv)
                .where(
                    OperationBulletin.tenant_id == tenant_id,
                    OperationBulletin.style_id.in_(style_ids),
                    func.lower(func.trim(OperationBulletin.status)) == "approved",
                )
                .order_by(OperationBulletin.style_id, OperationBulletin.version_no.desc(), OperationBulletin.id.desc())
            )
        ).all()
        # Highest approved version per style wins (rows arrive newest version first).
        seen: set[int] = set()
        for sid, total in ob_rows:
            if int(sid) in seen:
                continue
            seen.add(int(sid))
            v = _positive(total)
            if v is not None:
                style_smv[int(sid)] = v

    standard: dict[int, tuple[Decimal, str]] = {}
    standard_ids = style_ids - set(style_smv)
    if use_style_standard and standard_ids:
        for sid, value, confidence in (
            await db.execute(
                select(GarmentStyle.id, GarmentStyle.standard_smv, GarmentStyle.standard_smv_confidence).where(
                    GarmentStyle.tenant_id == tenant_id,
                    GarmentStyle.id.in_(standard_ids),
                    GarmentStyle.standard_smv.isnot(None),
                )
            )
        ).all():
            v = _positive(value)
            if v is not None:
                standard[int(sid)] = (v, (confidence or "").strip().lower() or "medium")

    out: dict[int, SmvResult] = {}
    for r in rows:
        info = ob_info.get(int(r.ob_id)) if r.ob_id else None
        style_id = _row_style(r)
        if info is not None and info[1]:
            out[r.id] = SmvResult(info[0], SMV_OB, "high")
        elif style_id is not None and style_id in style_smv:
            out[r.id] = SmvResult(style_smv[style_id], SMV_STYLE_APPROVED_OB, "high")
        elif style_id is not None and style_id in standard:
            value, confidence = standard[style_id]
            out[r.id] = SmvResult(value, SMV_STYLE_STANDARD, confidence, ["SMV_FROM_STYLE_STANDARD"])
        elif info is not None:
            out[r.id] = SmvResult(info[0], SMV_OB, "low", ["SMV_FROM_UNAPPROVED_OB"])
        else:
            plan_smv = _positive(r.smv_per_piece)
            if plan_smv is not None:
                out[r.id] = SmvResult(plan_smv, SMV_PLAN_ROW, "low", ["SMV_FROM_PLAN_ROW"])
            else:
                out[r.id] = SmvResult(None, None, None, ["SMV_UNKNOWN"])
    return out
