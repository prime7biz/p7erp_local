"""Phase B: effective-dated Bangladesh rule sets, Gazette wage schedule rates and read-only previews."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant
from app.models.hr_bd import HrBdRuleSet, HrBdWageScheduleRate
from app.modules.hr_localization import bd_rmg_catalog as cat

OFFICIAL_CODE = "BD-RMG"


def rule_set_out(row: HrBdRuleSet) -> dict[str, Any]:
    return {
        "id": row.id,
        "code": row.code,
        "catalog_version": row.catalog_version,
        "effective_from": row.effective_from.isoformat(),
        "effective_to": row.effective_to.isoformat() if row.effective_to else None,
        "status": row.status,
        "source_manifest_sha256": row.source_manifest_sha256,
        "source_refs": row.source_refs,
        "rules_json": row.rules_json,
        "approved_by": row.approved_by,
        "approved_at": row.approved_at.isoformat() if row.approved_at else None,
        "created_at": row.created_at.isoformat(),
    }


def rate_out(row: HrBdWageScheduleRate) -> dict[str, Any]:
    return {
        "id": row.id,
        "rule_set_id": row.rule_set_id,
        "rate_code": row.rate_code,
        "schedule_class": row.schedule_class,
        "employment_stage": row.employment_stage,
        "grade_code": row.grade_code,
        "designation_scope": row.designation_scope,
        "basic": str(row.basic),
        "house_rent": str(row.house_rent),
        "medical": str(row.medical),
        "transport": str(row.transport),
        "food": str(row.food),
        "other_allowance": str(row.other_allowance),
        "gross": str(row.gross),
        "annual_increment_pct": str(row.annual_increment_pct),
        "apprentice_months": row.apprentice_months,
        "effective_from": row.effective_from.isoformat(),
        "effective_to": row.effective_to.isoformat() if row.effective_to else None,
        "source_page": row.source_page,
    }


async def lock_tenant(db: AsyncSession, tenant_id: int) -> Tenant:
    return (
        await db.execute(
            select(Tenant).where(Tenant.id == tenant_id).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one()


async def rule_set_or_404(db: AsyncSession, tenant_id: int, rule_set_id: int, *, lock: bool = False) -> HrBdRuleSet:
    stmt = select(HrBdRuleSet).where(HrBdRuleSet.id == rule_set_id, HrBdRuleSet.tenant_id == tenant_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Rule set not found")
    return row


async def seed_official_rule_set(db: AsyncSession, tenant_id: int, *, user_id: int | None) -> tuple[HrBdRuleSet, bool]:
    """Create the DRAFT official rule set + its 10 Gazette rows once (tenant must already be locked)."""
    existing = (
        await db.execute(
            select(HrBdRuleSet).where(
                HrBdRuleSet.tenant_id == tenant_id,
                HrBdRuleSet.code == OFFICIAL_CODE,
                HrBdRuleSet.catalog_version == cat.CATALOG_VERSION,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False
    rs = HrBdRuleSet(
        tenant_id=tenant_id,
        code=OFFICIAL_CODE,
        catalog_version=cat.CATALOG_VERSION,
        effective_from=cat.WAGE_EFFECTIVE_FROM,
        status="DRAFT",
        source_manifest_sha256=cat.WAGE_GAZETTE["pdf_sha256"],
        source_refs={"wage_gazette": cat.WAGE_GAZETTE, "labour_act": cat.LABOUR_ACT, "privacy_act": cat.PRIVACY_ACT},
        rules_json=cat.default_rules_json(),
        created_by=user_id,
    )
    db.add(rs)
    await db.flush()
    for r in cat.WAGE_RATES:
        db.add(
            HrBdWageScheduleRate(
                tenant_id=tenant_id,
                rule_set_id=rs.id,
                rate_code=r.rate_code,
                schedule_class=r.schedule_class,
                employment_stage=r.employment_stage,
                grade_code=r.grade_code,
                designation_scope=list(r.designations),
                basic=r.basic,
                house_rent=r.house_rent,
                medical=r.medical,
                transport=r.transport,
                food=r.food,
                other_allowance=Decimal("0"),
                gross=r.gross,
                annual_increment_pct=cat.ANNUAL_INCREMENT_PCT_OF_BASIC,
                apprentice_months=r.apprentice_months,
                effective_from=cat.WAGE_EFFECTIVE_FROM,
                source_page=r.source_page,
            )
        )
    await db.flush()
    return rs, True


def validate_rules_update(current: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    """Return merged rules. Statutory values may only move in the worker-favourable direction;
    configurable defaults must stay within their bounds; unknown keys are refused."""
    statutory = cat.legal_rules_dict()
    config = {d.key: d for d in cat.CONFIG_DEFAULTS}
    merged = dict(current)
    errors: list[str] = []
    for key, value in updates.items():
        if key in config:
            d = config[key]
            if isinstance(d.value, bool):
                if not isinstance(value, bool):
                    errors.append(f"{key} must be true or false")
                    continue
            elif isinstance(value, bool) or not isinstance(value, (int, float)) or not d.minimum <= value <= d.maximum:
                errors.append(f"{key} must be between {d.minimum} and {d.maximum}")
                continue
            merged[key] = value
        elif key in statutory:
            direction = cat.MORE_FAVOURABLE_DIRECTION.get(key)
            base = statutory[key]
            if direction is None:
                if value != (list(base) if isinstance(base, tuple) else base):
                    errors.append(f"{key} is fixed by law ({base})")
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                errors.append(f"{key} must be a number")
                continue
            if (direction == "up" and value < base) or (direction == "down" and value > base):
                errors.append(f"{key} cannot be less favourable than the statutory {base}")
                continue
            merged[key] = value
        else:
            errors.append(f"Unknown rule {key}")
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    return merged


async def assert_no_overlap(db: AsyncSession, rs: HrBdRuleSet) -> None:
    """No other APPROVED rule set with the same code may overlap this one's dates (tenant is locked)."""
    end = rs.effective_to or date.max
    clash = (
        await db.execute(
            select(HrBdRuleSet.id).where(
                HrBdRuleSet.tenant_id == rs.tenant_id,
                HrBdRuleSet.code == rs.code,
                HrBdRuleSet.status == "APPROVED",
                HrBdRuleSet.id != rs.id,
                HrBdRuleSet.effective_from <= end,
                or_(HrBdRuleSet.effective_to.is_(None), HrBdRuleSet.effective_to >= rs.effective_from),
            )
        )
    ).first()
    if clash:
        raise HTTPException(
            status_code=409, detail=f"Approved rule set #{clash[0]} already covers these dates; retire it or end it first"
        )


@dataclass
class EffectiveRules:
    rule_set: HrBdRuleSet | None
    rules: dict[str, Any]
    source: str
    warnings: list[str]


async def effective_rules(db: AsyncSession, tenant_id: int, as_of: date) -> EffectiveRules:
    rs = (
        await db.execute(
            select(HrBdRuleSet)
            .where(
                HrBdRuleSet.tenant_id == tenant_id,
                HrBdRuleSet.status == "APPROVED",
                HrBdRuleSet.effective_from <= as_of,
                or_(HrBdRuleSet.effective_to.is_(None), HrBdRuleSet.effective_to >= as_of),
            )
            .order_by(HrBdRuleSet.effective_from.desc(), HrBdRuleSet.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if rs is None:
        return EffectiveRules(
            None,
            cat.default_rules_json(),
            f"catalog {cat.CATALOG_VERSION}",
            ["No approved Bangladesh rule set covers this date; showing the official catalog defaults"],
        )
    return EffectiveRules(rs, dict(rs.rules_json or {}), f"rule set #{rs.id} {rs.code} {rs.catalog_version}", [])


async def effective_rates(db: AsyncSession, tenant_id: int, rule_set_id: int | None, as_of: date) -> list[HrBdWageScheduleRate]:
    if rule_set_id is None:
        return []
    return list(
        (
            await db.execute(
                select(HrBdWageScheduleRate)
                .where(
                    HrBdWageScheduleRate.tenant_id == tenant_id,
                    HrBdWageScheduleRate.rule_set_id == rule_set_id,
                    HrBdWageScheduleRate.effective_from <= as_of,
                    or_(HrBdWageScheduleRate.effective_to.is_(None), HrBdWageScheduleRate.effective_to >= as_of),
                )
                .order_by(HrBdWageScheduleRate.rate_code)
            )
        )
        .scalars()
        .all()
    )


def approve(rs: HrBdRuleSet, user_id: int | None) -> None:
    rs.status = "APPROVED"
    rs.approved_by = user_id
    rs.approved_at = datetime.utcnow()
