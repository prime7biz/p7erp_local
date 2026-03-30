"""Feature flag for quotation costing intelligence Phase 1 (read-only, deterministic)."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

QUOTATION_AI_COSTING_PHASE1_FLAG_KEY = "quotation_ai_costing_phase1_enabled"
QUOTATION_AI_COSTING_PHASE2_FLAG_KEY = "quotation_ai_costing_phase2_enabled"
QUOTATION_AI_COST_BENCHMARK_FLAG_KEY = "quotation_ai_cost_benchmark_enabled"


def is_quotation_costing_phase1_enabled(*, tenant: Any | None) -> bool:
    """Global env kill-switch; optional per-tenant disable via feature_flags.

    - If ``QUOTATION_AI_COSTING_PHASE1_ENABLED`` is false: off for all tenants.
    - If global is true: tenant ``feature_flags['quotation_ai_costing_phase1_enabled'] == False`` disables for that tenant.
    - Missing tenant flag: enabled (same as true).
    """
    from app.config import get_settings

    if not get_settings().quotation_ai_costing_phase1_enabled:
        return False
    raw = getattr(tenant, "feature_flags", None) if tenant is not None else None
    if isinstance(raw, dict) and QUOTATION_AI_COSTING_PHASE1_FLAG_KEY in raw:
        return bool(raw[QUOTATION_AI_COSTING_PHASE1_FLAG_KEY])
    return True


def require_quotation_costing_phase1(*, tenant: Any) -> None:
    if not is_quotation_costing_phase1_enabled(tenant=tenant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "QUOTATION_COSTING_PHASE1_DISABLED",
                "message": "Quotation costing intelligence Phase 1 is disabled for this tenant or globally.",
            },
        )


def is_quotation_costing_phase2_enabled(*, tenant: Any | None) -> bool:
    """Phase 2 requires Phase 1 global flag on AND Phase 2 global + tenant flags."""
    from app.config import get_settings

    if not get_settings().quotation_ai_costing_phase1_enabled:
        return False
    if not get_settings().quotation_ai_costing_phase2_enabled:
        return False
    raw = getattr(tenant, "feature_flags", None) if tenant is not None else None
    if isinstance(raw, dict) and QUOTATION_AI_COSTING_PHASE2_FLAG_KEY in raw:
        return bool(raw[QUOTATION_AI_COSTING_PHASE2_FLAG_KEY])
    return True


def require_quotation_costing_phase2(*, tenant: Any) -> None:
    if not is_quotation_costing_phase2_enabled(tenant=tenant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "QUOTATION_COSTING_PHASE2_DISABLED",
                "message": "Quotation costing suggestions Phase 2 is disabled for this tenant or globally.",
            },
        )


def is_quotation_cost_benchmark_enabled(*, tenant: Any | None) -> bool:
    from app.config import get_settings

    if not get_settings().quotation_ai_cost_benchmark_enabled:
        return False
    raw = getattr(tenant, "feature_flags", None) if tenant is not None else None
    if isinstance(raw, dict) and QUOTATION_AI_COST_BENCHMARK_FLAG_KEY in raw:
        return bool(raw[QUOTATION_AI_COST_BENCHMARK_FLAG_KEY])
    return True


def require_quotation_cost_benchmark(*, tenant: Any) -> None:
    if not is_quotation_cost_benchmark_enabled(tenant=tenant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "QUOTATION_COST_BENCHMARK_DISABLED",
                "message": "Quotation cost benchmarking is disabled for this tenant or globally.",
            },
        )
