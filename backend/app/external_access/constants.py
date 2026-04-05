"""Constants and enums for external access."""

# Principal types
PRINCIPAL_CUSTOMER = "customer"
PRINCIPAL_FINANCIER = "financier"

# Role codes (seeded in external_roles)
ROLE_CUSTOMER_VIEWER = "customer_viewer"
ROLE_CUSTOMER_COLLABORATOR = "customer_collaborator"
ROLE_FINANCIER_VIEWER = "financier_viewer"
ROLE_FINANCIER_ANALYST = "financier_analyst"

# Financier access scopes (ordered least to most)
SCOPE_TENANT_SUMMARY = "tenant_summary"
SCOPE_ORDERS_AND_PIPELINE = "orders_and_pipeline"
SCOPE_FINANCIAL_SUMMARY = "financial_summary"
SCOPE_FULL_FINANCIER_PORTAL = "full_financier_portal"

SCOPE_RANK = {
    SCOPE_TENANT_SUMMARY: 1,
    SCOPE_ORDERS_AND_PIPELINE: 2,
    SCOPE_FINANCIAL_SUMMARY: 3,
    SCOPE_FULL_FINANCIER_PORTAL: 4,
}

# Tenant feature_flags keys (JSON on tenants.feature_flags)
FF_CUSTOMER_PORTAL_ENABLED = "customer_portal_enabled"
FF_FINANCIER_PORTAL_ENABLED = "financier_portal_enabled"
FF_CUSTOMER_NOTES_ENABLED = "customer_notes_enabled"
FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED = "financier_financial_summary_enabled"
FF_FINANCIER_PROJECTION_ENABLED = "financier_projection_enabled"
FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED = "external_portal_document_downloads_enabled"

# Note visibility
NOTE_VISIBILITY_EXTERNAL_ONLY = "external_only"
NOTE_VISIBILITY_INTERNAL_AND_EXTERNAL = "internal_and_external"
NOTE_VISIBILITY_INTERNAL_ONLY = "internal_only"

# JWT
JWT_CLAIM_TYPE = "typ"  # "external"
JWT_CLAIM_PRINCIPAL_TYPE = "pt"  # customer | financier
JWT_CLAIM_TENANT = "tid"
JWT_CLAIM_USE = "use"  # access | refresh
JWT_VALUE_EXTERNAL = "external"
JWT_USE_ACCESS = "access"
JWT_USE_REFRESH = "refresh"
JWT_USE_PASSWORD_RESET = "pwd_reset"

# Subject prefix — avoids collision with internal user integer `sub`
EXTERNAL_SUB_PREFIX = "ext:"


def external_subject(principal_id: int) -> str:
    return f"{EXTERNAL_SUB_PREFIX}{principal_id}"


def parse_external_subject(sub: str | None) -> int | None:
    if not sub or not isinstance(sub, str):
        return None
    if not sub.startswith(EXTERNAL_SUB_PREFIX):
        return None
    try:
        return int(sub[len(EXTERNAL_SUB_PREFIX) :])
    except ValueError:
        return None
