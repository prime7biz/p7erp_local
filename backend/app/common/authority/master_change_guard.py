"""Block direct ledger/group mutations while ``user_authority_classes_v1`` is ON.

Callers submit an authority change request instead (``/api/v1/authority/change-requests``).
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.common.tenant_feature_keys import is_user_authority_classes_v1_enabled
from app.models import Tenant

AUTHORITY_CHANGE_REQUIRED = "AUTHORITY_CHANGE_REQUIRED"


def assert_master_direct_mutate_allowed(tenant: Tenant) -> None:
    if is_user_authority_classes_v1_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{AUTHORITY_CHANGE_REQUIRED}: account groups and ledger accounts need a Class 3→2→1 "
                "change request while fixed-class authority is on. Submit from Approvals / Chart of Accounts."
            ),
        )
