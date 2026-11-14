"""Direct-edit guard for the Tier 1 / Tier 2 employee change approval (tenant flag ``hr_employee_change_approval``).

While the flag is on, every route that amends an existing employee refuses with 409 and the screen sends a
change request instead (``app.modules.hr_change_requests``). Creating a new employee is not affected.
"""

from __future__ import annotations

from fastapi import HTTPException

from app.common.tenant_feature_keys import is_hr_employee_change_approval_enabled
from app.models import Tenant

CHANGE_APPROVAL_REQUIRED = "CHANGE_APPROVAL_REQUIRED"


def assert_direct_edit_allowed(tenant: Tenant) -> None:
    if is_hr_employee_change_approval_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=409,
            detail=(
                f"{CHANGE_APPROVAL_REQUIRED}: changes to an existing employee need Tier 1 and Tier 2 approval. "
                "Submit them for approval from the employee page."
            ),
        )
