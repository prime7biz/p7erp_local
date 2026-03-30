"""Deterministic, read-only costing intelligence for quotations (Phase 1 — no LLM, no writes).

All outputs are derived from governed header fields and persisted line rows only.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from app.modules.quotations.quotation_commercial_money import (
    normalize_currency_code,
    validate_header_fx_rules,
)
from app.modules.quotations import quotation_costing_intelligence_config as cc

AnomalySeverity = Literal["none", "low", "medium", "high"]
MarginPressure = Literal["low", "medium", "high"]
SignalScope = Literal["header_only", "full_costing"]
ConfidenceBasis = Literal["partial", "full"]
SourceMode = Literal["deterministic_only"]


def _parse_money(val: str | None) -> Decimal | None:
    if val is None:
        return None
    t = str(val).strip().replace(",", "")
    if not t:
        return None
    try:
        return Decimal(t)
    except (InvalidOperation, ValueError):
        return None


def _line_money(d: dict[str, Any], key: str) -> Decimal | None:
    return _parse_money(d.get(key))


def _material_meaningful(row: dict[str, Any]) -> bool:
    if row.get("category_id") or row.get("item_id"):
        return True
    desc = (row.get("description") or "").strip()
    if desc:
        return True
    amt = _line_money(row, "total_amount") or _line_money(row, "amount_per_dozen")
    return amt is not None and amt != 0


def _mfg_meaningful(row: dict[str, Any]) -> bool:
    if (row.get("style_part") or "").strip():
        return True
    for k in ("total_line_cost", "total_order_cost", "cost_per_dozen"):
        v = _line_money(row, k)
        if v is not None and v != 0:
            return True
    return False


def _other_meaningful(row: dict[str, Any]) -> bool:
    if (row.get("cost_head") or "").strip():
        return True
    for k in ("calculated_amount", "total_amount"):
        v = _line_money(row, k)
        if v is not None and v != 0:
            return True
    return False


def _sum_line_currency_codes(lines: list[dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for row in lines:
        c = normalize_currency_code(str(row.get("currency") or ""))
        if c:
            out.add(c)
    return out


def _rollup_sum(lines: list[dict[str, Any]], key: str) -> Decimal:
    total = Decimal("0")
    for row in lines:
        v = _line_money(row, key)
        if v is not None:
            total += v
    return total


def _intel_item(*, internal_code: str, severity: str, message: str) -> dict[str, str]:
    rc = cc.INTERNAL_CODE_TO_REASON_CODE.get(internal_code, internal_code.lower())
    return {
        "internal_code": internal_code,
        "reason_code": rc,
        "code": rc,
        "severity": severity,
        "message": message,
    }


def _derive_confidence_basis(
    *,
    signal_scope: SignalScope,
    costing_confidence_score: int,
) -> ConfidenceBasis:
    if signal_scope == "header_only":
        return "partial"
    if costing_confidence_score >= cc.CONFIDENCE_FULL_BASIS_MIN_SCORE:
        return "full"
    return "partial"


def build_costing_intelligence_bundle(
    q: Any,
    *,
    material_lines: list[dict[str, Any]],
    manufacturing_lines: list[dict[str, Any]],
    other_cost_lines: list[dict[str, Any]],
    size_ratio_lines: list[dict[str, Any]],
    signal_scope: SignalScope = "full_costing",
) -> dict[str, Any]:
    """Single source of truth for Phase 1 costing intelligence (structured, bounded)."""
    source_mode: SourceMode = "deterministic_only"
    doc_ccy = normalize_currency_code(getattr(q, "currency", None) or "") or ""
    target_ccy = normalize_currency_code(getattr(q, "target_price_currency", None) or "") or ""
    fx_issues = validate_header_fx_rules(
        document_currency=doc_ccy or None,
        target_price_currency=target_ccy or None,
        exchange_rate=getattr(q, "exchange_rate", None),
    )
    fx_sensitivity = bool(fx_issues) or (bool(doc_ccy) and bool(target_ccy) and doc_ccy != target_ccy)

    mat_meaning = [r for r in material_lines if _material_meaningful(r)]
    mfg_meaning = [r for r in manufacturing_lines if _mfg_meaningful(r)]
    oth_meaning = [r for r in other_cost_lines if _other_meaningful(r)]

    completeness_items: list[dict[str, str]] = []
    if not mat_meaning:
        completeness_items.append(
            _intel_item(
                internal_code="NO_MATERIAL_LINES",
                severity="warning",
                message="No material lines with quantities or amounts — fabric/cost breakdown may be incomplete.",
            )
        )
    if not mfg_meaning:
        completeness_items.append(
            _intel_item(
                internal_code="NO_MANUFACTURING_LINES",
                severity="warning",
                message="No manufacturing / CM lines captured — check sewing and conversion costs.",
            )
        )
    if not oth_meaning:
        completeness_items.append(
            _intel_item(
                internal_code="NO_OTHER_COST_LINES",
                severity="info",
                message="No other commercial costs (trims, wash, logistics, overhead) on the sheet.",
            )
        )

    pq = getattr(q, "projected_quantity", None)
    if pq is None or int(pq) <= 0:
        completeness_items.append(
            _intel_item(
                internal_code="MISSING_PROJECTED_QUANTITY",
                severity="warning",
                message="Projected quantity is missing or zero — per-piece and roll-up costing may be unreliable.",
            )
        )

    if not getattr(q, "style_id", None) and not (getattr(q, "style_ref", None) or "").strip():
        completeness_items.append(
            _intel_item(
                internal_code="MISSING_STYLE_CONTEXT",
                severity="info",
                message="Style reference is empty — harder to validate costing against a master style.",
            )
        )

    if not getattr(q, "inquiry_id", None):
        completeness_items.append(
            _intel_item(
                internal_code="NO_LINKED_INQUIRY",
                severity="info",
                message="No linked inquiry — commercial context may be thinner than inquiry-driven quotes.",
            )
        )

    sr_enabled = bool(getattr(q, "size_ratio_enabled", False))
    if sr_enabled and not size_ratio_lines:
        completeness_items.append(
            _intel_item(
                internal_code="SIZE_RATIO_ENABLED_EMPTY",
                severity="warning",
                message="Size ratio is enabled but no size rows exist.",
            )
        )
    elif size_ratio_lines:
        total_ratio = Decimal("0")
        for row in size_ratio_lines:
            total_ratio += _parse_money(row.get("ratio_percentage")) or Decimal("0")
        if total_ratio > 0 and (
            total_ratio < cc.SIZE_RATIO_SUM_LOW or total_ratio > cc.SIZE_RATIO_SUM_HIGH
        ):
            completeness_items.append(
                _intel_item(
                    internal_code="SIZE_RATIO_SUM_DRIFT",
                    severity="info",
                    message=f"Size ratio percentages sum to {total_ratio} — expected near 100 for even spread checks.",
                )
            )

    header_tc = _parse_money(getattr(q, "total_cost", None))
    if header_tc is None or header_tc <= 0:
        completeness_items.append(
            _intel_item(
                internal_code="HEADER_TOTAL_COST_MISSING",
                severity="warning",
                message="Header total cost is missing or zero — run save / roll-up or complete lines.",
            )
        )

    anomaly_items: list[dict[str, str]] = []
    for i, row in enumerate(material_lines):
        for k in ("total_amount", "amount_per_dozen"):
            v = _line_money(row, k)
            if v is not None and v < 0:
                anomaly_items.append(
                    _intel_item(
                        internal_code="NEGATIVE_MATERIAL_AMOUNT",
                        severity="high",
                        message=f"Material row {i + 1}: negative {k} ({v}).",
                    )
                )
    for i, row in enumerate(manufacturing_lines):
        for k in ("total_line_cost", "total_order_cost", "cost_per_dozen"):
            v = _line_money(row, k)
            if v is not None and v < 0:
                anomaly_items.append(
                    _intel_item(
                        internal_code="NEGATIVE_MFG_AMOUNT",
                        severity="high",
                        message=f"Manufacturing row {i + 1}: negative {k} ({v}).",
                    )
                )
    for i, row in enumerate(other_cost_lines):
        for k in ("calculated_amount", "total_amount"):
            v = _line_money(row, k)
            if v is not None and v < 0:
                anomaly_items.append(
                    _intel_item(
                        internal_code="NEGATIVE_OTHER_COST",
                        severity="high",
                        message=f"Other cost row {i + 1}: negative {k} ({v}).",
                    )
                )

    sum_mat = _rollup_sum(mat_meaning, "total_amount")
    header_mc = _parse_money(getattr(q, "material_cost", None))
    if header_mc is not None and header_mc > 0 and sum_mat > 0:
        diff = abs(header_mc - sum_mat)
        tol = max(cc.HEADER_LINE_DRIFT_MIN_ABS, header_mc * cc.HEADER_LINE_DRIFT_RELATIVE)
        if diff > tol:
            anomaly_items.append(
                _intel_item(
                    internal_code="HEADER_MATERIAL_ROLLUP_MISMATCH",
                    severity="medium",
                    message=(
                        f"Header material_cost ({header_mc}) differs from sum of material line totals ({sum_mat}) "
                        "beyond configured tolerance — confirm roll-up or manual header edits."
                    ),
                )
            )

    sum_mfg = _rollup_sum(mfg_meaning, "total_order_cost")
    if sum_mfg == 0:
        sum_mfg = _rollup_sum(mfg_meaning, "total_line_cost")
    header_mfgc = _parse_money(getattr(q, "manufacturing_cost", None))
    if header_mfgc is not None and header_mfgc > 0 and sum_mfg > 0:
        diff = abs(header_mfgc - sum_mfg)
        tol = max(cc.HEADER_LINE_DRIFT_MIN_ABS, header_mfgc * cc.HEADER_LINE_DRIFT_RELATIVE)
        if diff > tol:
            anomaly_items.append(
                _intel_item(
                    internal_code="HEADER_MFG_ROLLUP_MISMATCH",
                    severity="medium",
                    message=(
                        f"Header manufacturing_cost ({header_mfgc}) differs from summed manufacturing lines ({sum_mfg})."
                    ),
                )
            )

    quoted = _parse_money(getattr(q, "quoted_price", None)) or _parse_money(getattr(q, "total_amount", None))
    total_cost = header_tc
    margin_pct: Decimal | None = None
    margin_pressure: MarginPressure = "low"
    margin_bullets: list[str] = []
    if quoted is not None and quoted > 0 and total_cost is not None and total_cost >= 0:
        margin_pct = (quoted - total_cost) / quoted * Decimal("100")
        if margin_pct < cc.MARGIN_PRESSURE_HIGH_BELOW_PCT:
            margin_pressure = "high"
            margin_bullets.append(f"Factory margin is very tight (~{margin_pct:.1f}% vs quoted).")
        elif margin_pct < cc.MARGIN_PRESSURE_MEDIUM_BELOW_PCT:
            margin_pressure = "medium"
            margin_bullets.append(f"Moderate margin headroom (~{margin_pct:.1f}%).")
        else:
            margin_bullets.append(f"Margin headroom ~{margin_pct:.1f}% (quoted vs factory total_cost).")
    else:
        margin_bullets.append("Cannot compute margin reliably — quoted price or total_cost is missing.")

    line_ccys = _sum_line_currency_codes(material_lines + manufacturing_lines + other_cost_lines)
    if doc_ccy and line_ccys and line_ccys != {doc_ccy}:
        fx_sensitivity = True
        anomaly_items.append(
            _intel_item(
                internal_code="MIXED_LINE_CURRENCIES",
                severity="medium",
                message=f"Line currencies {sorted(line_ccys)} differ from document currency {doc_ccy} — review FX handling.",
            )
        )

    prereq_total = cc.COMPLETENESS_PREREQ_TOTAL
    prereq_ok = 0
    if mat_meaning:
        prereq_ok += 1
    if mfg_meaning:
        prereq_ok += 1
    if oth_meaning:
        prereq_ok += 1
    if pq and int(pq) > 0:
        prereq_ok += 1
    if header_tc and header_tc > 0:
        prereq_ok += 1
    if getattr(q, "style_id", None) or (getattr(q, "style_ref", None) or "").strip():
        prereq_ok += 1
    cost_completeness_score = int(round(100 * prereq_ok / prereq_total))

    high_anom = sum(1 for a in anomaly_items if a.get("severity") == "high")
    med_anom = sum(1 for a in anomaly_items if a.get("severity") == "medium")
    conf_penalty = min(
        cc.CONFIDENCE_PENALTY_CAP,
        high_anom * cc.CONFIDENCE_PENALTY_PER_HIGH_ANOMALY
        + med_anom * cc.CONFIDENCE_PENALTY_PER_MEDIUM_ANOMALY
        + len(completeness_items) * cc.CONFIDENCE_PENALTY_PER_COMPLETENESS_ITEM,
    )
    costing_confidence_score = max(0, 100 - conf_penalty)

    if high_anom:
        anomaly_severity: AnomalySeverity = "high"
    elif med_anom >= cc.ANOMALY_MEDIUM_COUNT_FOR_HIGH_SEVERITY:
        anomaly_severity = "high"
    elif med_anom == 1:
        anomaly_severity = "medium"
    elif anomaly_items:
        anomaly_severity = "low"
    else:
        anomaly_severity = "none"

    missing_prerequisite_count = sum(1 for c in completeness_items if c.get("severity") == "warning")

    urgent = (
        anomaly_severity == "high"
        or margin_pressure == "high"
        or costing_confidence_score < cc.URGENT_COSTING_CONFIDENCE_BELOW
    )

    costing_flags: list[str] = []
    if fx_sensitivity:
        costing_flags.append("fx_sensitivity")
    if anomaly_severity in ("medium", "high"):
        costing_flags.append("costing_anomaly")
    if margin_pressure in ("medium", "high"):
        costing_flags.append("margin_pressure")
    if urgent:
        costing_flags.append("urgent_review")

    fx_bullets: list[str] = []
    if fx_issues:
        fx_bullets.extend(fx_issues)
    elif doc_ccy and target_ccy and doc_ccy != target_ccy:
        er = getattr(q, "exchange_rate", None)
        fx_bullets.append(f"Document {doc_ccy} vs buyer target {target_ccy}; header rate: {er or 'not set'}.")
    else:
        fx_bullets.append("No header FX conflict detected for target vs document currency.")

    reason_codes_set: set[str] = set()
    for it in completeness_items + anomaly_items:
        rc = it.get("reason_code")
        if rc:
            reason_codes_set.add(str(rc))
    if fx_issues:
        reason_codes_set.add("missing_fx_assumption")
    if margin_pressure == "high":
        reason_codes_set.add("low_margin_buffer")
    if urgent:
        reason_codes_set.add("urgent_costing_review")
    reason_codes = sorted(reason_codes_set)

    confidence_basis = _derive_confidence_basis(
        signal_scope=signal_scope,
        costing_confidence_score=costing_confidence_score,
    )
    limited_confidence = confidence_basis == "partial"

    return {
        "advisory_notice": (
            "Advisory only — rules-based read-out. Does not change costing data. "
            "Limited confidence when lines or quantities are incomplete."
        ),
        "signal_scope": signal_scope,
        "confidence_basis": confidence_basis,
        "source_mode": source_mode,
        "limited_confidence": limited_confidence,
        "reason_codes": reason_codes,
        "cost_completeness_score": cost_completeness_score,
        "costing_confidence_score": costing_confidence_score,
        "anomaly_severity": anomaly_severity,
        "margin_pressure": margin_pressure,
        "fx_sensitivity": fx_sensitivity,
        "missing_prerequisite_count": missing_prerequisite_count,
        "urgent_costing_review": urgent,
        "costing_flags": costing_flags[:16],
        "completeness_items": completeness_items[:24],
        "anomaly_items": anomaly_items[:24],
        "margin_context": {
            "quoted": str(quoted) if quoted is not None else None,
            "total_cost": str(total_cost) if total_cost is not None else None,
            "margin_percent": str(margin_pct.quantize(Decimal("0.01"))) if margin_pct is not None else None,
            "bullets": margin_bullets[:8],
        },
        "fx_context": {
            "document_currency": doc_ccy or None,
            "target_price_currency": target_ccy or None,
            "exchange_rate": getattr(q, "exchange_rate", None),
            "issues": fx_issues[:8],
            "bullets": fx_bullets[:8],
        },
        "line_counts": {
            "materials": len(material_lines),
            "manufacturing": len(manufacturing_lines),
            "other_costs": len(other_cost_lines),
            "size_ratios": len(size_ratio_lines),
        },
    }


def derive_next_actions(bundle: dict[str, Any]) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []
    rcs = {c.get("reason_code") for c in bundle.get("completeness_items", []) if isinstance(c, dict)}
    if "missing_material_rows" in rcs:
        actions.append(
            {
                "title": "Add material / fabric breakdown",
                "description": "Capture fabric and trim lines so factory material roll-up is traceable.",
                "category": "sourcing",
            }
        )
    if "missing_manufacturing_rows" in rcs:
        actions.append(
            {
                "title": "Add manufacturing / CM lines",
                "description": "Record CM or sewing costs for merchandising sign-off.",
                "category": "production",
            }
        )
    if "header_total_cost_missing" in rcs:
        actions.append(
            {
                "title": "Refresh costing roll-up",
                "description": "Save the quotation or complete lines so header total_cost is populated.",
                "category": "costing",
            }
        )
    if bundle.get("fx_sensitivity"):
        actions.append(
            {
                "title": "Validate FX assumptions",
                "description": "Confirm header exchange rate and line-level currencies with finance.",
                "category": "commercial",
            }
        )
    if bundle.get("margin_pressure") == "high":
        actions.append(
            {
                "title": "Commercial review before send",
                "description": "Margin vs factory cost is thin — align with buyer target and approvers.",
                "category": "management",
            }
        )
    if any(a.get("severity") == "high" for a in bundle.get("anomaly_items", [])):
        actions.append(
            {
                "title": "Resolve costing anomalies",
                "description": "Fix negative amounts or roll-up mismatches flagged in the anomaly scan.",
                "category": "costing",
            }
        )
    if not actions:
        actions.append(
            {
                "title": "Proceed to quote review",
                "description": "No blocking costing gaps detected by rules — still verify manually before approval.",
                "category": "workflow",
            }
        )
    return actions[:12]


def derive_costing_summary_lines(bundle: dict[str, Any]) -> list[str]:
    lines = [
        f"Cost completeness (rules): {bundle.get('cost_completeness_score', 0)}%",
        f"Costing confidence: {bundle.get('costing_confidence_score', 0)}%",
        f"Anomaly severity: {bundle.get('anomaly_severity', 'none')}",
        f"Margin pressure: {bundle.get('margin_pressure', 'low')}",
    ]
    if bundle.get("fx_sensitivity"):
        lines.append("FX sensitivity: yes — review rates and currency mix.")
    else:
        lines.append("FX sensitivity: no major header conflict flagged.")
    lc = bundle.get("line_counts") or {}
    lines.append(
        f"Lines: {lc.get('materials', 0)} materials, {lc.get('manufacturing', 0)} mfg, "
        f"{lc.get('other_costs', 0)} other, {lc.get('size_ratios', 0)} size ratios."
    )
    return lines
