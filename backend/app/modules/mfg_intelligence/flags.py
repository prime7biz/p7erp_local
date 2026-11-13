"""Strict tenant flags for Manufacturing Intelligence (all default OFF, only an explicit JSON true turns them on)."""
from __future__ import annotations

from fastapi import HTTPException, status

from app.common.tenant_feature_keys import (
    is_manufacturing_intelligence_v1_enabled,
    is_mfg_advanced_planning_v1_enabled,
    is_mfg_cost_intelligence_v1_enabled,
    is_mfg_financial_readiness_v1_enabled,
    is_mfg_integrated_planning_v1_enabled,
    is_mfg_material_allocation_v1_enabled,
    is_mfg_order_bom_readiness_v2_enabled,
    is_mfg_predictive_ai_text_v1_enabled,
    is_mfg_predictive_intelligence_v1_enabled,
    is_planning_math_v2_enabled,
)
from app.models import Tenant


def require_mfg_intelligence_enabled(tenant: Tenant) -> None:
    """Whole feature is hidden (404) unless `manufacturing_intelligence_v1` is exactly true."""
    if not is_manufacturing_intelligence_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def planning_math_v2_on(tenant: Tenant) -> bool:
    return is_planning_math_v2_enabled(tenant.feature_flags)


def order_bom_readiness_v2_on(tenant: Tenant) -> bool:
    return is_mfg_order_bom_readiness_v2_enabled(tenant.feature_flags)


def allocation_v1_on(tenant: Tenant) -> bool:
    """`mfg_material_allocation_v1` strictly true (Phase 2 material allocation / readiness v3)."""
    return is_mfg_material_allocation_v1_enabled(tenant.feature_flags)


def integrated_planning_on(tenant: Tenant) -> bool:
    """`mfg_integrated_planning_v1` strictly true (plan revisions, tentative demand, planning settings)."""
    return is_mfg_integrated_planning_v1_enabled(tenant.feature_flags)


def require_integrated_enabled(tenant: Tenant) -> None:
    """Plan revision / tentative demand API: 404 unless `manufacturing_intelligence_v1` AND `mfg_integrated_planning_v1`."""
    require_mfg_intelligence_enabled(tenant)
    if not integrated_planning_on(tenant):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def require_allocation_enabled(tenant: Tenant) -> None:
    """Allocation API: 404 unless both `manufacturing_intelligence_v1` and `mfg_material_allocation_v1` are true."""
    require_mfg_intelligence_enabled(tenant)
    if not allocation_v1_on(tenant):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def cost_intelligence_on(tenant: Tenant) -> bool:
    """`mfg_cost_intelligence_v1` strictly true (Phase 3 cost at completion)."""
    return is_mfg_cost_intelligence_v1_enabled(tenant.feature_flags)


def financial_readiness_on(tenant: Tenant) -> bool:
    """`mfg_financial_readiness_v1` strictly true (Phase 3 cash requirement)."""
    return is_mfg_financial_readiness_v1_enabled(tenant.feature_flags)


def phase3_any_on(tenant: Tenant) -> bool:
    return cost_intelligence_on(tenant) or financial_readiness_on(tenant)


def require_cost_intelligence_enabled(tenant: Tenant) -> None:
    """Cost at completion API: 404 unless `manufacturing_intelligence_v1` AND `mfg_cost_intelligence_v1`."""
    require_mfg_intelligence_enabled(tenant)
    if not cost_intelligence_on(tenant):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def require_financial_readiness_enabled(tenant: Tenant) -> None:
    """Cash requirement API: 404 unless `manufacturing_intelligence_v1` AND `mfg_financial_readiness_v1`."""
    require_mfg_intelligence_enabled(tenant)
    if not financial_readiness_on(tenant):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def predictive_on(tenant: Tenant) -> bool:
    """Phase 4 is on only when `manufacturing_intelligence_v1` AND `mfg_predictive_intelligence_v1` are strictly true."""
    flags = tenant.feature_flags
    return is_manufacturing_intelligence_v1_enabled(flags) and is_mfg_predictive_intelligence_v1_enabled(flags)


def predictive_ai_text_on(tenant: Tenant) -> bool:
    """LLM wording of Phase 4 results: needs `predictive_on` AND `mfg_predictive_ai_text_v1` strictly true."""
    return predictive_on(tenant) and is_mfg_predictive_ai_text_v1_enabled(tenant.feature_flags)


def require_predictive_enabled(tenant: Tenant) -> None:
    """Phase 4 predictive API: 404 unless `manufacturing_intelligence_v1` AND `mfg_predictive_intelligence_v1`."""
    require_mfg_intelligence_enabled(tenant)
    if not predictive_on(tenant):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def advanced_planning_on(tenant: Tenant) -> bool:
    """Phase 5 is on only when `manufacturing_intelligence_v1` AND `mfg_advanced_planning_v1` are strictly true."""
    flags = tenant.feature_flags
    return is_manufacturing_intelligence_v1_enabled(flags) and is_mfg_advanced_planning_v1_enabled(flags)


def require_advanced_planning_enabled(tenant: Tenant) -> None:
    """Phase 5 forward-plan API: 404 unless `manufacturing_intelligence_v1` AND `mfg_advanced_planning_v1`."""
    require_mfg_intelligence_enabled(tenant)
    if not advanced_planning_on(tenant):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def require_scheduler_enabled(tenant: Tenant) -> None:
    """Phase 5 scheduler API: advanced planning AND `mfg_integrated_planning_v1`, else 404."""
    require_advanced_planning_enabled(tenant)
    if not integrated_planning_on(tenant):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
