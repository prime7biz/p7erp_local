"""Quotation costing line suggestions (Phase 2) — review-first; deterministic generation; guarded apply."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Literal, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.money import (
    format_money,
    format_pct,
    format_rate,
    line_consumption_from_input,
    line_money_from_input,
    line_pct_from_input,
    line_rate_from_input,
)
from app.config import get_settings
from app.models import Quotation, User
from app.models.costing import QuotationManufacturing, QuotationMaterial, QuotationOtherCost, QuotationSizeRatio
from app.models.quotation_costing_suggestion import QuotationCostingSuggestionBatch, QuotationCostingSuggestionItem
from app.modules.ai_tool.audit import log_ai_event
from app.modules.master_data_ai.request_context import get_master_data_ai_request_id
from app.modules.orders.commercial_fields import is_quotation_commercial_locked
from app.modules.quotations.quotation_costing_intelligence import build_costing_intelligence_bundle

PROMPT_CATEGORY = "quotation_costing_ai"

ALLOWED_MATERIAL_FIELDS: frozenset[str] = frozenset(
    {
        "serial_no",
        "category_id",
        "item_id",
        "description",
        "unit",
        "consumption_per_dozen",
        "unit_price",
        "amount_per_dozen",
        "total_amount",
        "currency",
        "exchange_rate",
        "base_amount",
        "local_amount",
    }
)

ALLOWED_MFG_FIELDS: frozenset[str] = frozenset(
    {
        "serial_no",
        "style_part",
        "machines_required",
        "production_per_hour",
        "production_per_day",
        "cost_per_machine",
        "total_line_cost",
        "cost_per_dozen",
        "cm_per_piece",
        "total_order_cost",
        "currency",
        "exchange_rate",
        "base_amount",
        "local_amount",
    }
)

_Q_MAT_NUM: frozenset[str] = frozenset(
    {
        "consumption_per_dozen",
        "unit_price",
        "amount_per_dozen",
        "total_amount",
        "exchange_rate",
        "base_amount",
        "local_amount",
    }
)
_Q_MFG_NUM: frozenset[str] = frozenset(
    {
        "production_per_hour",
        "production_per_day",
        "cost_per_machine",
        "total_line_cost",
        "cost_per_dozen",
        "cm_per_piece",
        "total_order_cost",
        "exchange_rate",
        "base_amount",
        "local_amount",
    }
)
_Q_OTH_NUM: frozenset[str] = frozenset(
    {
        "percentage",
        "total_amount",
        "value",
        "calculated_amount",
        "exchange_rate",
        "base_amount",
        "local_amount",
    }
)


ALLOWED_OTHER_FIELDS: frozenset[str] = frozenset(
    {
        "serial_no",
        "cost_head",
        "percentage",
        "total_amount",
        "cost_type",
        "value",
        "based_on",
        "calculated_amount",
        "notes",
        "currency",
        "exchange_rate",
        "base_amount",
        "local_amount",
    }
)


def _allowed_fields_for_category(cat: str) -> frozenset[str]:
    if cat == "material":
        return ALLOWED_MATERIAL_FIELDS
    if cat == "manufacturing":
        return ALLOWED_MFG_FIELDS
    if cat == "other_cost":
        return ALLOWED_OTHER_FIELDS
    return frozenset()


def _batch_retention_days() -> int:
    try:
        return max(1, min(3650, int(get_settings().customer_ai_batch_retention_days)))
    except Exception:
        return 90


def _material_line_dict(m: QuotationMaterial) -> dict[str, Any]:
    return {
        "id": m.id,
        "serial_no": m.serial_no,
        "category_id": m.category_id,
        "item_id": m.item_id,
        "description": m.description,
        "unit": m.unit,
        "consumption_per_dozen": format_rate(m.consumption_per_dozen),
        "unit_price": format_money(m.unit_price),
        "amount_per_dozen": format_money(m.amount_per_dozen),
        "total_amount": format_money(m.total_amount),
        "currency": m.currency,
        "exchange_rate": format_rate(m.exchange_rate),
        "base_amount": format_money(m.base_amount),
        "local_amount": format_money(m.local_amount),
    }


def _mfg_line_dict(m: QuotationManufacturing) -> dict[str, Any]:
    return {
        "id": m.id,
        "serial_no": m.serial_no,
        "style_part": m.style_part,
        "machines_required": m.machines_required,
        "production_per_hour": format_rate(m.production_per_hour),
        "production_per_day": format_rate(m.production_per_day),
        "cost_per_machine": format_money(m.cost_per_machine),
        "total_line_cost": format_money(m.total_line_cost),
        "cost_per_dozen": format_money(m.cost_per_dozen),
        "cm_per_piece": format_money(m.cm_per_piece),
        "total_order_cost": format_money(m.total_order_cost),
        "currency": m.currency,
        "exchange_rate": format_rate(m.exchange_rate),
        "base_amount": format_money(m.base_amount),
        "local_amount": format_money(m.local_amount),
    }


def _other_line_dict(m: QuotationOtherCost) -> dict[str, Any]:
    return {
        "id": m.id,
        "serial_no": m.serial_no,
        "cost_head": m.cost_head,
        "percentage": format_pct(m.percentage),
        "total_amount": format_money(m.total_amount),
        "cost_type": m.cost_type,
        "value": format_money(m.value),
        "based_on": m.based_on,
        "calculated_amount": format_money(m.calculated_amount),
        "notes": m.notes,
        "currency": m.currency,
        "exchange_rate": format_rate(m.exchange_rate),
        "base_amount": format_money(m.base_amount),
        "local_amount": format_money(m.local_amount),
    }


def _sr_line_dict(m: QuotationSizeRatio) -> dict[str, Any]:
    return {
        "id": m.id,
        "serial_no": m.serial_no,
        "size": m.size,
        "ratio_percentage": format_pct(m.ratio_percentage),
        "fabric_factor": format_money(m.fabric_factor),
        "quantity": m.quantity,
    }


async def _load_lines_for_suggestions(
    db: AsyncSession, *, tenant_id: int, quotation_id: int
) -> tuple[
    Quotation,
    list[QuotationMaterial],
    list[QuotationManufacturing],
    list[QuotationOtherCost],
    list[QuotationSizeRatio],
]:
    q = await db.get(Quotation, quotation_id)
    if not q or q.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

    mats = (
        await db.execute(
            select(QuotationMaterial)
            .where(
                QuotationMaterial.quotation_id == quotation_id,
                QuotationMaterial.tenant_id == tenant_id,
            )
            .order_by(QuotationMaterial.serial_no)
        )
    ).scalars().all()
    mfg = (
        await db.execute(
            select(QuotationManufacturing)
            .where(
                QuotationManufacturing.quotation_id == quotation_id,
                QuotationManufacturing.tenant_id == tenant_id,
            )
            .order_by(QuotationManufacturing.serial_no)
        )
    ).scalars().all()
    oth = (
        await db.execute(
            select(QuotationOtherCost)
            .where(
                QuotationOtherCost.quotation_id == quotation_id,
                QuotationOtherCost.tenant_id == tenant_id,
            )
            .order_by(QuotationOtherCost.serial_no)
        )
    ).scalars().all()
    sr = (
        await db.execute(
            select(QuotationSizeRatio)
            .where(
                QuotationSizeRatio.quotation_id == quotation_id,
                QuotationSizeRatio.tenant_id == tenant_id,
            )
            .order_by(QuotationSizeRatio.serial_no)
        )
    ).scalars().all()
    return q, list(mats), list(mfg), list(oth), list(sr)


def _intel_dicts_for_bundle(
    mats: list[QuotationMaterial],
    mfg: list[QuotationManufacturing],
    oth: list[QuotationOtherCost],
    sr: list[QuotationSizeRatio],
) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    return (
        [_material_line_dict(x) for x in mats],
        [_mfg_line_dict(x) for x in mfg],
        [_other_line_dict(x) for x in oth],
        [_sr_line_dict(x) for x in sr],
    )


def _parse_row_index(message: str, prefix: str) -> int | None:
    m = re.search(rf"{re.escape(prefix)} row (\d+):", message, re.I)
    if not m:
        return None
    return int(m.group(1)) - 1


def _parse_negative_field_key(message: str) -> str | None:
    m = re.search(r"negative (\w+)", message)
    if m:
        return m.group(1)
    return None


def _build_items_from_bundle(
    bundle: dict[str, Any],
    mats: list[QuotationMaterial],
    mfg: list[QuotationManufacturing],
    oth: list[QuotationOtherCost],
) -> list[dict[str, Any]]:
    """Return list of item payloads (not ORM) for batch insert."""
    out: list[dict[str, Any]] = []
    ordinal = 0

    for it in bundle.get("completeness_items", []):
        if it.get("internal_code") == "NO_MATERIAL_LINES":
            ordinal += 1
            out.append(
                {
                    "ordinal": ordinal,
                    "cost_category": "material",
                    "target_line_id": None,
                    "suggestion_type": "add_line",
                    "field_changes_json": {
                        "description": "Fabric / material (add details)",
                        "unit": "Yds",
                        "consumption_per_dozen": "0",
                        "unit_price": "0",
                        "amount_per_dozen": "0",
                        "total_amount": "0",
                        "currency": "USD",
                        "exchange_rate": "1",
                    },
                    "confidence": 0.55,
                    "reason_code": str(it.get("reason_code") or "no_material_rows"),
                    "explanation": it.get("message") or "",
                    "source_mode": "deterministic_only",
                }
            )
            break

    for it in bundle.get("completeness_items", []):
        if it.get("internal_code") == "NO_MANUFACTURING_LINES":
            ordinal += 1
            out.append(
                {
                    "ordinal": ordinal,
                    "cost_category": "manufacturing",
                    "target_line_id": None,
                    "suggestion_type": "add_line",
                    "field_changes_json": {
                        "style_part": "CM / sewing",
                        "machines_required": 0,
                        "production_per_hour": "0",
                        "production_per_day": "0",
                        "cost_per_machine": "0",
                        "total_line_cost": "0",
                        "cost_per_dozen": "0",
                        "cm_per_piece": "0",
                        "total_order_cost": "0",
                        "currency": "USD",
                        "exchange_rate": "1",
                    },
                    "confidence": 0.55,
                    "reason_code": str(it.get("reason_code") or "no_manufacturing_rows"),
                    "explanation": it.get("message") or "",
                    "source_mode": "deterministic_only",
                }
            )
            break

    for it in bundle.get("completeness_items", []):
        if it.get("internal_code") == "NO_OTHER_COST_LINES":
            ordinal += 1
            out.append(
                {
                    "ordinal": ordinal,
                    "cost_category": "other_cost",
                    "target_line_id": None,
                    "suggestion_type": "add_line",
                    "field_changes_json": {
                        "cost_head": "Logistics / overhead",
                        "percentage": "0",
                        "total_amount": "0",
                        "cost_type": "fixed",
                        "value": "0",
                        "based_on": "subtotal",
                        "calculated_amount": "0",
                        "currency": "USD",
                        "exchange_rate": "1",
                    },
                    "confidence": 0.5,
                    "reason_code": str(it.get("reason_code") or "no_other_cost_lines"),
                    "explanation": it.get("message") or "",
                    "source_mode": "deterministic_only",
                }
            )
            break

    for a in bundle.get("anomaly_items", []):
        msg = a.get("message") or ""
        fk = _parse_negative_field_key(msg)
        if not fk:
            continue
        if "Material row" in msg:
            idx = _parse_row_index(msg, "Material")
            if idx is None or idx < 0 or idx >= len(mats):
                continue
            row = mats[idx]
            ordinal += 1
            out.append(
                {
                    "ordinal": ordinal,
                    "cost_category": "material",
                    "target_line_id": row.id,
                    "suggestion_type": "modify_line",
                    "field_changes_json": {fk: "0"},
                    "confidence": 0.85,
                    "reason_code": str(a.get("reason_code") or "negative_material_amount"),
                    "explanation": msg,
                    "source_mode": "deterministic_only",
                }
            )
        elif "Manufacturing row" in msg:
            idx = _parse_row_index(msg, "Manufacturing")
            if idx is None or idx < 0 or idx >= len(mfg):
                continue
            row = mfg[idx]
            ordinal += 1
            out.append(
                {
                    "ordinal": ordinal,
                    "cost_category": "manufacturing",
                    "target_line_id": row.id,
                    "suggestion_type": "modify_line",
                    "field_changes_json": {fk: "0"},
                    "confidence": 0.85,
                    "reason_code": str(a.get("reason_code") or "negative_mfg_amount"),
                    "explanation": msg,
                    "source_mode": "deterministic_only",
                }
            )
        elif "Other cost row" in msg:
            idx = _parse_row_index(msg, "Other cost")
            if idx is None or idx < 0 or idx >= len(oth):
                continue
            row = oth[idx]
            ordinal += 1
            out.append(
                {
                    "ordinal": ordinal,
                    "cost_category": "other_cost",
                    "target_line_id": row.id,
                    "suggestion_type": "modify_line",
                    "field_changes_json": {fk: "0"},
                    "confidence": 0.85,
                    "reason_code": str(a.get("reason_code") or "negative_other_cost"),
                    "explanation": msg,
                    "source_mode": "deterministic_only",
                }
            )

    return out


def _recompute_batch_status(batch: QuotationCostingSuggestionBatch, items: list[QuotationCostingSuggestionItem]) -> None:
    if batch.status == "discarded":
        return
    terminal = {
        "applied",
        "rejected",
        "marked_skip",
        "blocked_locked",
    }
    if not items:
        batch.status = "generated"
        return
    pending_like = [i for i in items if i.disposition not in terminal]
    if not pending_like:
        applied = sum(1 for i in items if i.disposition == "applied")
        if applied == len(items):
            batch.status = "fully_applied"
        elif applied > 0:
            batch.status = "partially_applied"
        else:
            batch.status = "generated"
    else:
        any_done = any(i.disposition in ("applied", "rejected", "marked_skip", "blocked_locked") for i in items)
        batch.status = "partially_applied" if any_done else "generated"


async def generate_costing_suggestions(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    quotation_id: int,
) -> dict[str, Any]:
    q, mats, mfg, oth, sr = await _load_lines_for_suggestions(db, tenant_id=tenant_id, quotation_id=quotation_id)
    md, mfd, od, srd = _intel_dicts_for_bundle(mats, mfg, oth, sr)
    bundle = build_costing_intelligence_bundle(
        q,
        material_lines=md,
        manufacturing_lines=mfd,
        other_cost_lines=od,
        size_ratio_lines=srd,
        signal_scope="full_costing",
    )
    payloads = _build_items_from_bundle(bundle, mats, mfg, oth)
    now = datetime.utcnow()
    expires = now + timedelta(days=_batch_retention_days())
    batch = QuotationCostingSuggestionBatch(
        tenant_id=tenant_id,
        quotation_id=quotation_id,
        action_type="costing_review",
        provider="rules",
        model_hint=None,
        request_id=get_master_data_ai_request_id(),
        generated_by_user_id=user_id,
        source_type="deterministic",
        status="generated",
        meta_json={
            "bundle_snapshot": {
                "cost_completeness_score": bundle.get("cost_completeness_score"),
                "costing_confidence_score": bundle.get("costing_confidence_score"),
                "anomaly_severity": bundle.get("anomaly_severity"),
                "reason_codes": bundle.get("reason_codes"),
            },
            "item_count": len(payloads),
        },
        created_at=now,
        updated_at=now,
        expires_at=expires,
    )
    db.add(batch)
    await db.flush()

    for p in payloads:
        it = QuotationCostingSuggestionItem(
            batch_id=batch.id,
            tenant_id=tenant_id,
            ordinal=p["ordinal"],
            cost_category=p["cost_category"],
            target_line_id=p.get("target_line_id"),
            suggestion_type=p["suggestion_type"],
            field_changes_json=p["field_changes_json"],
            confidence=p.get("confidence"),
            reason_code=p.get("reason_code"),
            explanation=p.get("explanation"),
            source_mode=p.get("source_mode") or "deterministic_only",
            disposition="pending",
            before_snapshot_json=None,
        )
        db.add(it)
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_COSTING_SUGGESTIONS_GENERATE",
        resource="quotation",
        request_id=get_master_data_ai_request_id(),
        trace_id=get_master_data_ai_request_id(),
        severity="INFO",
        details_json={
            "quotation_id": quotation_id,
            "batch_id": batch.id,
            "item_count": len(payloads),
            "read_only_phase": False,
        },
        prompt_category=PROMPT_CATEGORY,
    )

    return await get_costing_suggestion_batch(db, tenant_id=tenant_id, batch_id=batch.id)


async def get_costing_suggestion_batch(
    db: AsyncSession, *, tenant_id: int, batch_id: int
) -> dict[str, Any]:
    batch = await db.get(QuotationCostingSuggestionBatch, batch_id)
    if not batch or batch.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BATCH_NOT_FOUND", "message": "Costing suggestion batch not found."},
        )
    r = await db.execute(
        select(QuotationCostingSuggestionItem)
        .where(
            QuotationCostingSuggestionItem.batch_id == batch_id,
            QuotationCostingSuggestionItem.tenant_id == tenant_id,
        )
        .order_by(QuotationCostingSuggestionItem.ordinal)
    )
    items = list(r.scalars().all())
    return {
        "batch": batch,
        "items": items,
        "quotation_id": batch.quotation_id,
    }


async def mark_costing_suggestion_decisions(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    batch_id: int,
    decisions: list[tuple[int, Literal["apply", "reject", "skip"]]],
) -> None:
    if not decisions:
        return
    data = await get_costing_suggestion_batch(db, tenant_id=tenant_id, batch_id=batch_id)
    batch: QuotationCostingSuggestionBatch = data["batch"]
    items: list[QuotationCostingSuggestionItem] = data["items"]
    by_id = {i.id: i for i in items}
    for item_id, dec in decisions:
        it = by_id.get(item_id)
        if not it:
            continue
        if dec == "apply":
            it.disposition = "marked_apply"
        elif dec == "reject":
            it.disposition = "marked_reject"
        else:
            it.disposition = "marked_skip"
        it.updated_at = datetime.utcnow()
    _recompute_batch_status(batch, items)
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_COSTING_SUGGESTIONS_MARKED",
        resource="quotation",
        details_json={
            "quotation_id": batch.quotation_id,
            "batch_id": batch.id,
            "decisions": [{"item_id": a, "decision": b} for a, b in decisions],
        },
        prompt_category=PROMPT_CATEGORY,
        severity="INFO",
    )


def _filter_field_changes(
    cat: str, changes: dict[str, Any]
) -> dict[str, Any]:
    """Allow only line-level fields for this category.

    Note: keys like ``total_amount`` exist on both header and lines — we never apply to
    ``Quotation`` here, only to costing line models, so line ``total_amount`` is allowed.
    """
    allowed = _allowed_fields_for_category(cat)
    out: dict[str, Any] = {}
    for k, v in (changes or {}).items():
        if k not in allowed:
            continue
        out[k] = v
    return out


def _snap_json_val(v: Any) -> Any:
    if isinstance(v, Decimal):
        return str(v)
    return v


def _coerce_setattr(obj: Any, key: str, val: Any) -> None:
    if key in ("category_id", "item_id"):
        if val is None or val == "":
            setattr(obj, key, None)
        else:
            setattr(obj, key, int(val))
        return
    if key == "serial_no":
        setattr(obj, key, int(val) if val is not None and str(val).strip() != "" else 0)
        return
    if key == "machines_required":
        setattr(obj, key, int(val) if val is not None and str(val).strip() != "" else 0)
        return
    if isinstance(obj, QuotationMaterial) and key in _Q_MAT_NUM:
        if key == "exchange_rate":
            setattr(obj, key, line_rate_from_input(val))
        elif key == "consumption_per_dozen":
            setattr(obj, key, line_consumption_from_input(val))
        else:
            setattr(obj, key, line_money_from_input(val))
        return
    if isinstance(obj, QuotationManufacturing) and key in _Q_MFG_NUM:
        if key == "exchange_rate":
            setattr(obj, key, line_rate_from_input(val))
        elif key in ("production_per_hour", "production_per_day"):
            setattr(obj, key, line_rate_from_input(val, default=Decimal("0")))
        else:
            setattr(obj, key, line_money_from_input(val))
        return
    if isinstance(obj, QuotationOtherCost) and key in _Q_OTH_NUM:
        if key == "exchange_rate":
            setattr(obj, key, line_rate_from_input(val))
        elif key == "percentage":
            setattr(obj, key, line_pct_from_input(val))
        else:
            setattr(obj, key, line_money_from_input(val))
        return
    setattr(obj, key, val)


async def _next_serial(
    db: AsyncSession,
    model: type,
    *,
    tenant_id: int,
    quotation_id: int,
) -> int:
    r = await db.execute(
        select(func.coalesce(func.max(model.serial_no), 0)).where(
            model.quotation_id == quotation_id,
            model.tenant_id == tenant_id,
        )
    )
    cur = int(r.scalar_one() or 0)
    return cur + 1


async def apply_costing_suggestions(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    quotation_id: int,
    batch_id: int,
    actions: list[Tuple[int, Literal["apply", "reject", "skip"]]],
) -> dict[str, Any]:
    """Apply or finalize line suggestions. Blocked when quotation is commercially locked (no line-level CR)."""
    q, mats, mfg, oth, _sr = await _load_lines_for_suggestions(db, tenant_id=tenant_id, quotation_id=quotation_id)
    if q.id != quotation_id:
        raise HTTPException(status_code=404, detail="Quotation not found")

    data = await get_costing_suggestion_batch(db, tenant_id=tenant_id, batch_id=batch_id)
    batch: QuotationCostingSuggestionBatch = data["batch"]
    if batch.quotation_id != quotation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BATCH_QUOTE_MISMATCH", "message": "Batch does not belong to this quotation."},
        )
    if batch.status == "discarded":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BATCH_DISCARDED", "message": "Batch was discarded."},
        )

    items = {i.id: i for i in data["items"]}
    locked = is_quotation_commercial_locked(q.status)

    applied_ids: list[int] = []
    skipped_ids: list[int] = []
    rejected_ids: list[int] = []
    blocked: list[dict[str, Any]] = []

    for item_id, decision in actions:
        it = items.get(item_id)
        if not it:
            continue
        if decision == "reject":
            it.disposition = "rejected"
            rejected_ids.append(item_id)
            it.updated_at = datetime.utcnow()
            continue
        if decision == "skip":
            it.disposition = "marked_skip"
            skipped_ids.append(item_id)
            it.updated_at = datetime.utcnow()
            continue

        # apply
        if locked:
            it.disposition = "blocked_locked"
            blocked.append(
                {
                    "item_id": item_id,
                    "message": "Quotation is commercially locked — costing line edits require Revise to draft or approval workflow.",
                }
            )
            it.updated_at = datetime.utcnow()
            continue

        cat = it.cost_category
        changes = _filter_field_changes(cat, dict(it.field_changes_json or {}))
        if not changes:
            skipped_ids.append(item_id)
            it.disposition = "marked_skip"
            it.updated_at = datetime.utcnow()
            continue

        if it.suggestion_type == "modify_line" and it.target_line_id:
            if cat == "material":
                row = await db.get(QuotationMaterial, it.target_line_id)
                if not row or row.tenant_id != tenant_id or row.quotation_id != quotation_id:
                    skipped_ids.append(item_id)
                    it.disposition = "marked_skip"
                    continue
                it.before_snapshot_json = {
                    k: _snap_json_val(getattr(row, k, None)) for k in sorted(changes.keys())
                }
                for k, v in changes.items():
                    _coerce_setattr(row, k, v)
                row.updated_at = datetime.utcnow()
            elif cat == "manufacturing":
                row = await db.get(QuotationManufacturing, it.target_line_id)
                if not row or row.tenant_id != tenant_id or row.quotation_id != quotation_id:
                    skipped_ids.append(item_id)
                    it.disposition = "marked_skip"
                    continue
                it.before_snapshot_json = {
                    k: _snap_json_val(getattr(row, k, None)) for k in sorted(changes.keys())
                }
                for k, v in changes.items():
                    _coerce_setattr(row, k, v)
                row.updated_at = datetime.utcnow()
            elif cat == "other_cost":
                row = await db.get(QuotationOtherCost, it.target_line_id)
                if not row or row.tenant_id != tenant_id or row.quotation_id != quotation_id:
                    skipped_ids.append(item_id)
                    it.disposition = "marked_skip"
                    continue
                it.before_snapshot_json = {
                    k: _snap_json_val(getattr(row, k, None)) for k in sorted(changes.keys())
                }
                for k, v in changes.items():
                    _coerce_setattr(row, k, v)
                row.updated_at = datetime.utcnow()
            it.disposition = "applied"
            applied_ids.append(item_id)
            it.updated_at = datetime.utcnow()

        elif it.suggestion_type == "add_line" and it.target_line_id is None:
            serial = await _next_serial(
                db,
                QuotationMaterial if cat == "material" else QuotationManufacturing if cat == "manufacturing" else QuotationOtherCost,
                tenant_id=tenant_id,
                quotation_id=quotation_id,
            )
            if cat == "material":
                row = QuotationMaterial(
                    tenant_id=tenant_id,
                    quotation_id=quotation_id,
                    serial_no=serial,
                    description=changes.get("description"),
                    unit=changes.get("unit"),
                    consumption_per_dozen=line_consumption_from_input(changes.get("consumption_per_dozen", "0")),
                    unit_price=line_money_from_input(changes.get("unit_price", "0")),
                    amount_per_dozen=line_money_from_input(changes.get("amount_per_dozen", "0")),
                    total_amount=line_money_from_input(changes.get("total_amount", "0")),
                    currency=str(changes.get("currency", "USD")),
                    exchange_rate=line_rate_from_input(changes.get("exchange_rate", "1")),
                    base_amount=line_money_from_input(changes.get("base_amount", "0")),
                    local_amount=line_money_from_input(changes.get("local_amount", "0")),
                )
                if changes.get("category_id") is not None:
                    row.category_id = int(changes["category_id"]) if changes["category_id"] != "" else None
                if changes.get("item_id") is not None:
                    row.item_id = int(changes["item_id"]) if changes["item_id"] != "" else None
                db.add(row)
                await db.flush()
                it.target_line_id = row.id
            elif cat == "manufacturing":
                row = QuotationManufacturing(
                    tenant_id=tenant_id,
                    quotation_id=quotation_id,
                    serial_no=serial,
                    style_part=str(changes.get("style_part") or "CM"),
                    machines_required=int(changes.get("machines_required", 0) or 0),
                    production_per_hour=line_rate_from_input(
                        changes.get("production_per_hour", "0"), default=Decimal("0")
                    ),
                    production_per_day=line_rate_from_input(
                        changes.get("production_per_day", "0"), default=Decimal("0")
                    ),
                    cost_per_machine=line_money_from_input(changes.get("cost_per_machine", "0")),
                    total_line_cost=line_money_from_input(changes.get("total_line_cost", "0")),
                    cost_per_dozen=line_money_from_input(changes.get("cost_per_dozen", "0")),
                    cm_per_piece=line_money_from_input(changes.get("cm_per_piece", "0")),
                    total_order_cost=line_money_from_input(changes.get("total_order_cost", "0")),
                    currency=str(changes.get("currency", "USD")),
                    exchange_rate=line_rate_from_input(changes.get("exchange_rate", "1")),
                    base_amount=line_money_from_input(changes.get("base_amount", "0")),
                    local_amount=line_money_from_input(changes.get("local_amount", "0")),
                )
                db.add(row)
                await db.flush()
                it.target_line_id = row.id
            else:
                row = QuotationOtherCost(
                    tenant_id=tenant_id,
                    quotation_id=quotation_id,
                    serial_no=serial,
                    cost_head=str(changes.get("cost_head") or "Other"),
                    percentage=line_pct_from_input(changes.get("percentage", "0")),
                    total_amount=line_money_from_input(changes.get("total_amount", "0")),
                    cost_type=str(changes.get("cost_type", "fixed")),
                    value=line_money_from_input(changes.get("value", "0")),
                    based_on=str(changes.get("based_on", "subtotal")),
                    calculated_amount=line_money_from_input(changes.get("calculated_amount", "0")),
                    notes=changes.get("notes"),
                    currency=str(changes.get("currency", "USD")),
                    exchange_rate=line_rate_from_input(changes.get("exchange_rate", "1")),
                    base_amount=line_money_from_input(changes.get("base_amount", "0")),
                    local_amount=line_money_from_input(changes.get("local_amount", "0")),
                )
                db.add(row)
                await db.flush()
                it.target_line_id = row.id
            it.before_snapshot_json = None
            it.disposition = "applied"
            applied_ids.append(item_id)
            it.updated_at = datetime.utcnow()
        else:
            skipped_ids.append(item_id)
            it.disposition = "marked_skip"
            it.updated_at = datetime.utcnow()

    _recompute_batch_status(batch, list(items.values()))
    batch.updated_at = datetime.utcnow()
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_COSTING_SUGGESTIONS_APPLY",
        resource="quotation",
        details_json={
            "quotation_id": quotation_id,
            "batch_id": batch_id,
            "applied_item_ids": applied_ids,
            "skipped_item_ids": skipped_ids,
            "rejected_item_ids": rejected_ids,
            "blocked": blocked,
        },
        prompt_category=PROMPT_CATEGORY,
        severity="INFO",
    )

    return {
        "quotation_id": quotation_id,
        "batch_id": batch_id,
        "applied_item_ids": applied_ids,
        "skipped_item_ids": skipped_ids,
        "rejected_item_ids": rejected_ids,
        "blocked_items": blocked,
        "requires_revision": bool(blocked),
    }


async def discard_costing_suggestion_batch(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    batch_id: int,
) -> None:
    data = await get_costing_suggestion_batch(db, tenant_id=tenant_id, batch_id=batch_id)
    batch: QuotationCostingSuggestionBatch = data["batch"]
    items: list[QuotationCostingSuggestionItem] = data["items"]
    batch.status = "discarded"
    batch.updated_at = datetime.utcnow()
    for it in items:
        if it.disposition == "pending":
            it.disposition = "marked_skip"
        it.updated_at = datetime.utcnow()
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_COSTING_SUGGESTIONS_DISCARD",
        resource="quotation",
        details_json={"batch_id": batch_id, "quotation_id": batch.quotation_id},
        prompt_category=PROMPT_CATEGORY,
        severity="INFO",
    )


def item_to_dict(it: QuotationCostingSuggestionItem) -> dict[str, Any]:
    return {
        "id": it.id,
        "ordinal": it.ordinal,
        "cost_category": it.cost_category,
        "target_line_id": it.target_line_id,
        "suggestion_type": it.suggestion_type,
        "field_changes_json": it.field_changes_json or {},
        "confidence": it.confidence,
        "reason_code": it.reason_code,
        "explanation": it.explanation,
        "source_mode": it.source_mode,
        "disposition": it.disposition,
        "before_snapshot_json": it.before_snapshot_json,
    }


def batch_to_dict(b: QuotationCostingSuggestionBatch) -> dict[str, Any]:
    return {
        "id": b.id,
        "tenant_id": b.tenant_id,
        "quotation_id": b.quotation_id,
        "action_type": b.action_type,
        "status": b.status,
        "meta_json": b.meta_json,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
        "expires_at": b.expires_at.isoformat() if b.expires_at else None,
    }
