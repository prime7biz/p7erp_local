"""Alert rules for Manufacturing Intelligence Phase 4 findings (plan 15 sections 8, D20, 17.3, 17.4, 17.5).

The 15-minute alert scan calls one rule per finding kind (`mfg_delivery_risk` ... `mfg_quality_spike`). A rule only
READS stored findings: OPEN, alert_eligible, of its kind (the daily job builds them). Flag off -> [].

17.3 content: kind, severity, order / line code, affected dates, days, reason codes and a link to the
Predictions tab. Never vendor, PO, item, efficiency %, lateness or probability values.
17.4 episodes: natural key `mfg_<kind>:<finding id>`. A finding whose alert a user already closed (status not
active) is skipped, unless the finding's severity is now higher than the alert's (escalation re-opens it).
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import (
    is_manufacturing_intelligence_v1_enabled,
    is_mfg_predictive_intelligence_v1_enabled,
)
from app.models import AlertInstance, Order, SewingLine, Tenant
from app.models.mfg_predictive import FINDING_OPEN, MfgPredictiveFinding
from app.modules.mfg_intelligence.bottleneck_service import KIND_LABEL, SEVERITY_RANK
from app.modules.mfg_planning.predictive_writer import ALERT_ACTIVE_STATUSES, natural_key_for, rule_key_for

MAX_PER_RULE = 20
LINE_KINDS = frozenset({"CAPACITY_OVERLOAD", "LINE_IDLE", "OUTPUT_DROP", "QUALITY_SPIKE"})


def predictions_href(finding_id: int) -> str:
    return f"/app/control-tower?tab=predictions&finding={finding_id}"


def alert_payload(finding: Any, order_code: str | None, line_code: str | None) -> dict[str, Any]:
    """Minimal alert content (17.3, pure)."""
    from app.modules.merch.alert_rules import _evidence_schema_v1

    payload = finding.payload if isinstance(finding.payload, dict) else {}
    rule_key = rule_key_for(finding.kind)
    subject = line_code if finding.kind in LINE_KINDS else order_code
    affected = [d for d in payload.get("affected_dates") or [] if isinstance(d, str)][:14]
    days = int(payload.get("days_affected") or 0)
    reasons = [str(c) for c in payload.get("reason_codes") or []][:10]
    href = predictions_href(finding.id)
    label = KIND_LABEL.get(finding.kind, finding.kind)
    when = f" from {affected[0]}" if affected else ""
    is_line = finding.kind in LINE_KINDS
    return {
        "natural_key": natural_key_for(finding),
        "title": f"{label}: {subject or ('line' if is_line else 'order')}"[:512],
        "description": f"{label} ({finding.severity}), {days} day(s) affected{when}. Open Predictions for the evidence.",
        "severity": finding.severity,
        "reason_text": ", ".join(reasons)[:512] or None,
        "recommended_action": "Review the recommendation in Manufacturing Intelligence > Predictions and record a decision.",
        "entity_type": "sewing_line" if is_line else "order",
        "entity_id": finding.line_id if is_line else finding.order_id,
        "order_id": finding.order_id,
        "evidence_json": _evidence_schema_v1(
            rule_key,
            facts={
                "kind": finding.kind,
                "severity": finding.severity,
                "order_code": order_code if not is_line else None,
                "line_code": line_code if is_line else None,
                "affected_dates": affected,
                "days_affected": days,
                "reason_codes": reasons,
                "href": href,
            },
        ),
    }


async def run_kind(db: AsyncSession, tenant_id: int, kind: str, config: dict[str, Any] | None) -> list[dict[str, Any]]:
    flags = (await db.execute(select(Tenant.feature_flags).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not (is_manufacturing_intelligence_v1_enabled(flags) and is_mfg_predictive_intelligence_v1_enabled(flags)):
        return []
    f = MfgPredictiveFinding
    rows = (
        await db.execute(
            select(f, Order.order_code, SewingLine.line_code)
            .outerjoin(Order, (Order.id == f.order_id) & (Order.tenant_id == tenant_id))
            .outerjoin(SewingLine, (SewingLine.id == f.line_id) & (SewingLine.tenant_id == tenant_id))
            .where(f.tenant_id == tenant_id, f.status == FINDING_OPEN, f.alert_eligible.is_(True), f.kind == kind)
            .order_by(f.priority.desc(), f.id)
            .limit(MAX_PER_RULE)
        )
    ).all()
    if not rows:
        return []
    keys = [natural_key_for(r[0]) for r in rows]
    instances = {
        nk: (status, severity)
        for nk, status, severity in (
            await db.execute(
                select(AlertInstance.natural_key, AlertInstance.status, AlertInstance.severity).where(
                    AlertInstance.tenant_id == tenant_id, AlertInstance.natural_key.in_(keys)
                )
            )
        ).all()
    }
    out: list[dict[str, Any]] = []
    for finding, order_code, line_code in rows:
        current = instances.get(natural_key_for(finding))
        if current is not None and current[0] not in ALERT_ACTIVE_STATUSES:
            if SEVERITY_RANK.get(finding.severity, 0) <= SEVERITY_RANK.get(current[1], 0):
                continue  # a person closed it and nothing got worse: keep it closed
        out.append(alert_payload(finding, order_code, line_code))
    return out
