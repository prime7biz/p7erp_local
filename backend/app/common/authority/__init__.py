"""Fixed-class user authority (Super Admin + Class 1-4).

Behaviour is inert while ``user_authority_classes_v1`` is OFF. Per-user module grants are
authoritative; shared Role.permissions are never rewritten for one user's modules.
"""

from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
    AUTHORITY_CLASSES,
    AUTHORITY_MODULE_CODES,
    AUTHORITY_SUPER,
    CLASS1_APPROVAL_APPROVED,
    CLASS1_APPROVAL_PENDING,
    CLASS1_APPROVAL_REJECTED,
    CLASS1_APPROVAL_STATUSES,
    ERP_AUTHORITY_MODULE_CODES,
)
from app.common.authority.module_access import (
    assert_module_grant_for_permissions,
    module_code_for_permission,
)
from app.common.authority.policy import (
    assert_super_admin_protected,
    bump_auth_session_version,
    effective_authority_payload,
    is_authority_classes_enabled_for_tenant,
    is_class1_for_module,
    can_view_pnl_balance_sheet,
    assert_pnl_balance_sheet_allowed,
    is_manager_equivalent_for_module,
    elevated_role_or_manager_equivalent,
    is_tenant_admin_equivalent,
    load_user_module_codes,
    preflight_authority_activation,
)

__all__ = [
    "AUTHORITY_SUPER",
    "AUTHORITY_CLASS_1",
    "AUTHORITY_CLASS_2",
    "AUTHORITY_CLASS_3",
    "AUTHORITY_CLASS_4",
    "AUTHORITY_CLASSES",
    "AUTHORITY_MODULE_CODES",
    "ERP_AUTHORITY_MODULE_CODES",
    "CLASS1_APPROVAL_PENDING",
    "CLASS1_APPROVAL_APPROVED",
    "CLASS1_APPROVAL_REJECTED",
    "CLASS1_APPROVAL_STATUSES",
    "assert_super_admin_protected",
    "bump_auth_session_version",
    "effective_authority_payload",
    "is_authority_classes_enabled_for_tenant",
    "is_class1_for_module",
    "can_view_pnl_balance_sheet",
    "assert_pnl_balance_sheet_allowed",
    "is_manager_equivalent_for_module",
    "elevated_role_or_manager_equivalent",
    "is_tenant_admin_equivalent",
    "load_user_module_codes",
    "preflight_authority_activation",
    "assert_module_grant_for_permissions",
    "module_code_for_permission",
]
