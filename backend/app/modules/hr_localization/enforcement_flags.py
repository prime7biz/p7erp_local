"""Strict Bangladesh enforcement flags (Phase C). Every flag is OFF unless explicitly ``true``.

None of these keys may be added to ``DEFAULT_ON_FEATURE_FLAGS``.
"""

from __future__ import annotations

from typing import Any

from app.common.tenant_feature_keys import _flag_true

HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED = "hr_bd_minimum_wage_enforcement_enabled"
HR_BD_LEAVE_ACCRUAL_ENFORCEMENT_ENABLED = "hr_bd_leave_accrual_enforcement_enabled"
HR_BD_MATERNITY_ENFORCEMENT_ENABLED = "hr_bd_maternity_enforcement_enabled"
HR_BD_FESTIVAL_COMPENSATION_ENABLED = "hr_bd_festival_compensation_enabled"
HR_BD_SERVICE_BENEFITS_ENABLED = "hr_bd_service_benefits_enabled"

ENFORCEMENT_FLAGS: tuple[str, ...] = (
    HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED,
    HR_BD_LEAVE_ACCRUAL_ENFORCEMENT_ENABLED,
    HR_BD_MATERNITY_ENFORCEMENT_ENABLED,
    HR_BD_FESTIVAL_COMPENSATION_ENABLED,
    HR_BD_SERVICE_BENEFITS_ENABLED,
)

ENFORCEMENT_FLAGS_BY_AREA: dict[str, str] = {
    "minimum_wage": HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED,
    "earned_leave": HR_BD_LEAVE_ACCRUAL_ENFORCEMENT_ENABLED,
    "maternity": HR_BD_MATERNITY_ENFORCEMENT_ENABLED,
    "festival_holidays": HR_BD_FESTIVAL_COMPENSATION_ENABLED,
    "service_benefits": HR_BD_SERVICE_BENEFITS_ENABLED,
}


def is_enforced(feature_flags: Any, key: str) -> bool:
    return _flag_true(feature_flags, key)


def is_area_enforced(feature_flags: Any, area: str) -> bool:
    key = ENFORCEMENT_FLAGS_BY_AREA.get(area)
    return bool(key) and _flag_true(feature_flags, key)


def enforcement_state(feature_flags: Any) -> dict[str, bool]:
    return {key: _flag_true(feature_flags, key) for key in ENFORCEMENT_FLAGS}
