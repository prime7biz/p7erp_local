"""Manufacturing Intelligence planning settings (stored in `tenant_production_settings.mfg_planning_config`).

* `stage_probability`: confidence % a planner may use by default for INQUIRY and QUOTATION tentative demand.
  There is NO built-in default: when it is not set the planner must enter a confidence (owner decision).
* `tentative_default_expiry_days` (1-180, default 30): how long a tentative booking holds capacity.
* `receipt_buffer_days` (0-60, default 0): days added to every open purchase-order ETA.

Phase 3 money / timing keys (cost at completion + cash requirement; doc 14 section 12 #19, 13 Q2 / Q3 / Q6):
* `export_document_days` (0-60, default 7): shipment / invoice date to document presentation.
* `export_usance_days` (0-365, default 90; 0 = at sight): presentation to export realisation.
* `btb_usance_days` (0-365, default 120): estimated BTB LC maturity when no maturity date is stored.
* `cpm_override` (Decimal > 0 or null): finance-approved cost per minute; wins over the computed CPM.

Phase 5 keys (forward plan / scheduler; doc 16 D14, D19, 15.18):
* `frozen_horizon_days` (14-60, default 14): firm zone the scheduler never touches (can only widen).
* `changeover_loss_pct` (0-100, default 50): share of the first day's practical minutes lost on a style change.

`read_planning_settings` never writes (GET must not insert a row). `update_planning_settings` creates the settings
row when it is missing, without committing (the router commits).
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TenantProductionSettings

STAGES = ("INQUIRY", "QUOTATION")
DEFAULT_EXPIRY_DAYS = 30
MAX_EXPIRY_DAYS = 180
MAX_RECEIPT_BUFFER_DAYS = 60
HUNDRED = Decimal("100")

# Phase 3 keys: name -> (minimum, maximum, default)
PHASE3_DAY_KEYS: dict[str, tuple[int, int, int]] = {
    "export_document_days": (0, 60, 7),
    "export_usance_days": (0, 365, 90),
    "btb_usance_days": (0, 365, 120),
}
CPM_OVERRIDE_KEY = "cpm_override"
PHASE3_KEYS: tuple[str, ...] = (*PHASE3_DAY_KEYS, CPM_OVERRIDE_KEY)
MAX_CPM_OVERRIDE = Decimal("1000000")
CPM_Q = Decimal("0.0001")

# Phase 5 keys: name -> (minimum, maximum, default)
PHASE5_KEYS: dict[str, tuple[int, int, int]] = {
    "frozen_horizon_days": (14, 60, 14),
    "changeover_loss_pct": (0, 100, 50),
}


def parse_cpm_override(value: Any) -> Decimal | None:
    """None clears it; otherwise a finite Decimal > 0 (4 decimals). Raises 422 for anything else."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise HTTPException(status_code=422, detail="cpm_override must be a number greater than 0")
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=422, detail="cpm_override must be a number greater than 0") from None
    if not d.is_finite() or d <= 0 or d > MAX_CPM_OVERRIDE:
        raise HTTPException(status_code=422, detail=f"cpm_override must be greater than 0 and at most {MAX_CPM_OVERRIDE}")
    d = d.quantize(CPM_Q)
    if d <= 0:
        raise HTTPException(status_code=422, detail="cpm_override must be a number greater than 0")
    return d


async def _row(db: AsyncSession, tenant_id: int) -> TenantProductionSettings | None:
    return (
        await db.execute(select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant_id))
    ).scalar_one_or_none()


def _parse_probability(value: Any, stage: str) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=422, detail=f"stage_probability.{stage} must be a number") from None
    if not d.is_finite() or d < 0 or d > HUNDRED:
        raise HTTPException(status_code=422, detail=f"stage_probability.{stage} must be between 0 and 100")
    return d.quantize(Decimal("0.01"))


def _clean_config(raw: Any) -> dict[str, Any]:
    """Defaults merged with what is stored (stored junk is ignored, never raises)."""
    cfg = raw if isinstance(raw, dict) else {}
    stage_in = cfg.get("stage_probability") if isinstance(cfg.get("stage_probability"), dict) else {}
    stage: dict[str, str | None] = {}
    for s in STAGES:
        try:
            p = _parse_probability(stage_in.get(s), s)
        except HTTPException:
            p = None
        stage[s] = format(p, "f") if p is not None else None
    expiry = cfg.get("tentative_default_expiry_days")
    if not isinstance(expiry, int) or isinstance(expiry, bool) or not 1 <= expiry <= MAX_EXPIRY_DAYS:
        expiry = DEFAULT_EXPIRY_DAYS
    buffer = cfg.get("receipt_buffer_days")
    if not isinstance(buffer, int) or isinstance(buffer, bool) or not 0 <= buffer <= MAX_RECEIPT_BUFFER_DAYS:
        buffer = 0
    out: dict[str, Any] = {"stage_probability": stage, "tentative_default_expiry_days": expiry, "receipt_buffer_days": buffer}
    for key, (low, high, default) in (*PHASE3_DAY_KEYS.items(), *PHASE5_KEYS.items()):
        v = cfg.get(key)
        out[key] = v if isinstance(v, int) and not isinstance(v, bool) and low <= v <= high else default
    try:
        cpm = parse_cpm_override(cfg.get(CPM_OVERRIDE_KEY))
    except HTTPException:
        cpm = None
    out[CPM_OVERRIDE_KEY] = format(cpm, "f") if cpm is not None else None
    return out


async def read_planning_settings(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    """Settings or defaults. Never inserts."""
    row = await _row(db, tenant_id)
    raw = row.mfg_planning_config if row is not None else None
    out = _clean_config(raw)
    out["is_default"] = not isinstance(raw, dict) or not raw
    return out


async def update_planning_settings(
    db: AsyncSession,
    tenant_id: int,
    *,
    stage_probability: dict[str, Any] | None = None,
    tentative_default_expiry_days: int | None = None,
    receipt_buffer_days: int | None = None,
    phase3: dict[str, Any] | None = None,
    phase5: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """`phase3` / `phase5`: only the keys being changed (`cpm_override: None` clears the override)."""
    if tentative_default_expiry_days is not None and not 1 <= tentative_default_expiry_days <= MAX_EXPIRY_DAYS:
        raise HTTPException(status_code=422, detail=f"tentative_default_expiry_days must be 1-{MAX_EXPIRY_DAYS}")
    if receipt_buffer_days is not None and not 0 <= receipt_buffer_days <= MAX_RECEIPT_BUFFER_DAYS:
        raise HTTPException(status_code=422, detail=f"receipt_buffer_days must be 0-{MAX_RECEIPT_BUFFER_DAYS}")
    phase3_clean: dict[str, Any] = {}
    for key, value in (phase3 or {}).items():
        if key == CPM_OVERRIDE_KEY:
            cpm = parse_cpm_override(value)
            phase3_clean[key] = format(cpm, "f") if cpm is not None else None
        elif key in PHASE3_DAY_KEYS:
            low, high, _default = PHASE3_DAY_KEYS[key]
            if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
                raise HTTPException(status_code=422, detail=f"{key} must be {low}-{high}")
            phase3_clean[key] = value
        else:
            raise HTTPException(status_code=422, detail=f"Unknown setting '{key}'")
    for key, value in (phase5 or {}).items():
        if key not in PHASE5_KEYS:
            raise HTTPException(status_code=422, detail=f"Unknown setting '{key}'")
        low, high, _default = PHASE5_KEYS[key]
        if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
            raise HTTPException(status_code=422, detail=f"{key} must be {low}-{high}")
        phase3_clean[key] = value
    row = await _row(db, tenant_id)
    if row is None:
        # Same weekend the calendar readers assume when no settings row exists, so saving a planning setting
        # never changes capacity or delivery dates.
        row = TenantProductionSettings(
            tenant_id=tenant_id,
            enabled_optional_units=[],
            weekend_days=["saturday", "sunday"],
            cm_alert_threshold_pct=10,
        )
        db.add(row)
    current = _clean_config(row.mfg_planning_config)
    if stage_probability is not None:
        for key in stage_probability:
            if key not in STAGES:
                raise HTTPException(status_code=422, detail=f"Unknown stage '{key}' (use INQUIRY or QUOTATION)")
        for s in STAGES:
            if s in stage_probability:
                p = _parse_probability(stage_probability[s], s)
                current["stage_probability"][s] = format(p, "f") if p is not None else None
    if tentative_default_expiry_days is not None:
        current["tentative_default_expiry_days"] = tentative_default_expiry_days
    if receipt_buffer_days is not None:
        current["receipt_buffer_days"] = receipt_buffer_days
    current.update(phase3_clean)
    row.mfg_planning_config = current  # new dict: JSON column change is detected
    await db.flush()
    out = _clean_config(row.mfg_planning_config)
    out["is_default"] = False
    return out


async def get_receipt_buffer_days(db: AsyncSession, tenant_id: int) -> int:
    """0 unless `mfg_integrated_planning_v1` is on: a stored buffer must not move ETAs after the flag is switched off."""
    from app.common.tenant_feature_keys import is_mfg_integrated_planning_v1_enabled
    from app.models import Tenant

    tenant = await db.get(Tenant, tenant_id)
    if tenant is None or not is_mfg_integrated_planning_v1_enabled(tenant.feature_flags):
        return 0
    row = await _row(db, tenant_id)
    return int(_clean_config(row.mfg_planning_config if row is not None else None)["receipt_buffer_days"])
