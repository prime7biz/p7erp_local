"""Merch Critical Alert engine: seed definitions, run rules, upsert instances, scan log."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AlertDefinition,
    AlertInstance,
    AlertRelatedEntity,
    AlertScanLog,
    Tenant,
)
from app.modules.merch.alert_rules import DEFAULT_DEFINITIONS, RULE_REGISTRY, TRADE_RULE_KEYS


ACTIVE_STATUSES = ("new", "acknowledged", "in_progress", "waiting_on_buyer", "waiting_on_supplier", "snoozed", "escalated")


async def resolve_stale_production_cm_alerts_for_period(
    db: AsyncSession,
    tenant_id: int,
    period_date: date,
    active_natural_keys: set[str],
) -> int:
    """Resolve CM overrun alerts for this day when those keys are no longer over budget."""
    pd = period_date.isoformat()
    like_pat = f"%:period:{pd}:style:%"
    r = await db.execute(
        select(AlertInstance).where(
            AlertInstance.tenant_id == tenant_id,
            AlertInstance.alert_type == "production_cm_overrun",
            AlertInstance.natural_key.like(like_pat),
        )
    )
    resolved = 0
    now = datetime.now(timezone.utc)
    for inst in r.scalars().all():
        if inst.natural_key in active_natural_keys:
            continue
        if inst.status not in ACTIVE_STATUSES:
            continue
        inst.status = "resolved"
        inst.resolved_at = now
        inst.updated_at = now
        resolved += 1
    await db.flush()
    return resolved


async def ensure_definitions_for_tenant(db: AsyncSession, tenant_id: int) -> None:
    """Ensure all default alert_definition rows exist for the tenant. Idempotent."""
    existing = await db.execute(
        select(AlertDefinition.rule_key).where(AlertDefinition.tenant_id == tenant_id)
    )
    have = {r[0] for r in existing.all()}
    for defn in DEFAULT_DEFINITIONS:
        if defn["rule_key"] in have:
            continue
        row = AlertDefinition(
            tenant_id=tenant_id,
            rule_key=defn["rule_key"],
            name=defn["name"],
            severity_default=defn["severity_default"],
            entity_type=defn["entity_type"],
            is_system=True,
            is_enabled=True,
        )
        db.add(row)
        have.add(defn["rule_key"])
    await db.flush()


async def run_rule(
    db: AsyncSession,
    tenant_id: int,
    rule_key: str,
    definition_id: int,
    config: dict[str, Any] | None,
) -> tuple[int, int]:
    """Run one rule, upsert alert_instances. Returns (created_count, updated_count)."""
    fn = RULE_REGISTRY.get(rule_key)
    if not fn:
        return 0, 0
    raw_list = await fn(db, tenant_id, config)
    created = updated = 0
    for payload in raw_list:
        natural_key = payload["natural_key"]
        # Keep a single alert row per tenant+natural_key to make dedupe deterministic.
        existing = await db.execute(
            select(AlertInstance).where(
                AlertInstance.tenant_id == tenant_id,
                AlertInstance.natural_key == natural_key,
            )
        )
        inst = existing.scalar_one_or_none()
        if inst:
            inst.title = payload["title"]
            inst.description = payload.get("description")
            inst.severity = payload.get("severity", "medium")
            inst.reason_text = payload.get("reason_text")
            inst.recommended_action = payload.get("recommended_action")
            inst.evidence_json = payload.get("evidence_json")
            if inst.status not in ACTIVE_STATUSES:
                inst.status = "new"
                inst.resolved_at = None
                inst.resolved_by_id = None
            inst.updated_at = datetime.now(timezone.utc)
            await db.flush()
            updated += 1
        else:
            inst = None
            created_new = False
            try:
                async with db.begin_nested():
                    inst = AlertInstance(
                        tenant_id=tenant_id,
                        definition_id=definition_id,
                        natural_key=natural_key,
                        title=payload["title"],
                        description=payload.get("description"),
                        severity=payload.get("severity", "medium"),
                        status="new",
                        alert_type=rule_key,
                        source="system",
                        reason_text=payload.get("reason_text"),
                        recommended_action=payload.get("recommended_action"),
                        evidence_json=payload.get("evidence_json"),
                    )
                    db.add(inst)
                    await db.flush()
                    created_new = True
            except IntegrityError:
                existing_retry = await db.execute(
                    select(AlertInstance).where(
                        AlertInstance.tenant_id == tenant_id,
                        AlertInstance.natural_key == natural_key,
                    )
                )
                inst = existing_retry.scalar_one()
                inst.title = payload["title"]
                inst.description = payload.get("description")
                inst.severity = payload.get("severity", "medium")
                inst.reason_text = payload.get("reason_text")
                inst.recommended_action = payload.get("recommended_action")
                inst.evidence_json = payload.get("evidence_json")
                if inst.status not in ACTIVE_STATUSES:
                    inst.status = "new"
                    inst.resolved_at = None
                    inst.resolved_by_id = None
                inst.updated_at = datetime.now(timezone.utc)
                await db.flush()
                updated += 1
            if not created_new or inst is None:
                continue
            # Link primary entity
            entity_type = payload.get("entity_type", "order")
            entity_id = payload.get("entity_id")
            if entity_id is not None:
                rel = AlertRelatedEntity(
                    tenant_id=tenant_id,
                    alert_id=inst.id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    role="primary",
                )
                db.add(rel)
            order_id = payload.get("order_id")
            if order_id is not None and entity_type != "order":
                rel_order = AlertRelatedEntity(
                    tenant_id=tenant_id,
                    alert_id=inst.id,
                    entity_type="order",
                    entity_id=order_id,
                    role="related",
                )
                db.add(rel_order)
            await db.flush()
            created += 1
    return created, updated


async def run_scan(
    db: AsyncSession,
    tenant_id: int,
    trigger: str = "scheduled",
) -> dict[str, Any]:
    """Ensure definitions, run all enabled rules, log scan. Returns summary."""
    await ensure_definitions_for_tenant(db, tenant_id)
    defs_result = await db.execute(
        select(AlertDefinition).where(
            AlertDefinition.tenant_id == tenant_id,
            AlertDefinition.is_enabled == True,
        )
    )
    definitions = list(defs_result.scalars().all())
    total_created = total_updated = 0
    for defn in definitions:
        if defn.rule_key not in RULE_REGISTRY:
            continue
        log_row = AlertScanLog(
            tenant_id=tenant_id,
            rule_key=defn.rule_key,
            trigger=trigger,
            status="running",
        )
        db.add(log_row)
        await db.flush()
        try:
            config = defn.config_json if isinstance(defn.config_json, dict) else None
            created, updated = await run_rule(db, tenant_id, defn.rule_key, defn.id, config)
            total_created += created
            total_updated += updated
            log_row.status = "completed"
            log_row.finished_at = datetime.now(timezone.utc)
            log_row.instances_created = created
            log_row.instances_updated = updated
        except Exception as e:
            log_row.status = "failed"
            log_row.finished_at = datetime.now(timezone.utc)
            log_row.error_message = str(e)[:2000]
            # Continue remaining rules; scan log row records the failure
        await db.flush()
    return {
        "instances_created": total_created,
        "instances_updated": total_updated,
        "rules_run": len(definitions),
    }


async def run_scan_trade_rules_only(
    db: AsyncSession,
    tenant_id: int,
    trigger: str = "scheduled_daily",
) -> dict[str, Any]:
    """Run only trade alert rules (for optional daily trade-only scan). Returns summary."""
    await ensure_definitions_for_tenant(db, tenant_id)
    defs_result = await db.execute(
        select(AlertDefinition).where(
            AlertDefinition.tenant_id == tenant_id,
            AlertDefinition.is_enabled == True,
            AlertDefinition.rule_key.in_(TRADE_RULE_KEYS),
        )
    )
    definitions = list(defs_result.scalars().all())
    total_created = total_updated = 0
    for defn in definitions:
        if defn.rule_key not in RULE_REGISTRY:
            continue
        log_row = AlertScanLog(
            tenant_id=tenant_id,
            rule_key=defn.rule_key,
            trigger=trigger,
            status="running",
        )
        db.add(log_row)
        await db.flush()
        try:
            config = defn.config_json if isinstance(defn.config_json, dict) else None
            created, updated = await run_rule(db, tenant_id, defn.rule_key, defn.id, config)
            total_created += created
            total_updated += updated
            log_row.status = "completed"
            log_row.finished_at = datetime.now(timezone.utc)
            log_row.instances_created = created
            log_row.instances_updated = updated
        except Exception as e:
            log_row.status = "failed"
            log_row.finished_at = datetime.now(timezone.utc)
            log_row.error_message = str(e)[:2000]
            # Continue remaining rules; scan log row records the failure
        await db.flush()
    return {
        "instances_created": total_created,
        "instances_updated": total_updated,
        "rules_run": len(definitions),
    }


async def get_tenant_ids(db: AsyncSession) -> list[int]:
    """Return all tenant IDs for background scan."""
    result = await db.execute(select(Tenant.id))
    return [r[0] for r in result.all()]
