"""Stable keys and helpers for ``tenants.feature_flags`` JSON."""

from __future__ import annotations

from typing import Any, Literal

# When true, PO/GRN paths that tie to an order require Order.master_contract_id (409 if missing).
REQUIRE_MASTER_CONTRACT_FOR_RM = "require_master_contract_for_rm"

# When true, Knitting APIs and UI are enabled (optional production unit hub + finance hooks).
KNITTING_ENABLED = "knitting_enabled"

# RBAC rollout mode: "off" (no checks), "shadow" (log-only), "enforce" (deny on miss).
RBAC_ENFORCEMENT = "rbac_enforcement"
RBAC_MODE_OFF: Literal["off"] = "off"
RBAC_MODE_SHADOW: Literal["shadow"] = "shadow"
RBAC_MODE_ENFORCE: Literal["enforce"] = "enforce"
RBAC_MODES: tuple[str, str, str] = (RBAC_MODE_OFF, RBAC_MODE_SHADOW, RBAC_MODE_ENFORCE)

# Internal single-session policy toggle.
SINGLE_SESSION_ENFORCED = "single_session_enforced"


def get_tenant_rbac_mode(feature_flags: Any) -> Literal["off", "shadow", "enforce"]:
    """Return normalized RBAC mode from tenant feature flags (safe default: off)."""
    if not isinstance(feature_flags, dict):
        return RBAC_MODE_OFF
    raw = feature_flags.get(RBAC_ENFORCEMENT)
    if isinstance(raw, str):
        normalized = raw.strip().lower()
        if normalized in RBAC_MODES:
            return normalized  # type: ignore[return-value]
    return RBAC_MODE_OFF


def is_single_session_enforced(feature_flags: Any) -> bool:
    """Return True if tenant enabled single-session login enforcement."""
    if not isinstance(feature_flags, dict):
        return False
    return feature_flags.get(SINGLE_SESSION_ENFORCED) is True


# --- Write-time validation -------------------------------------------------
# Whitelist of feature_flag keys whose value is an enum string. Writes go
# through ``normalize_feature_flags`` so the canonical form (``strip().lower()``)
# is what actually lands in the JSON column. Readers like
# ``get_tenant_rbac_mode`` keep tolerating legacy non-canonical values for
# backward compatibility, but new writes must be canonical.
ENUM_FEATURE_FLAG_VALUES: dict[str, frozenset[str]] = {
    RBAC_ENFORCEMENT: frozenset(RBAC_MODES),
}


def normalize_feature_flag_value(key: str, value: Any) -> Any:
    """Validate + canonicalize a single feature_flag value at write-time.

    For known enum keys (currently ``rbac_enforcement``), a string value is
    trimmed and lowercased before being checked against the allowed set.
    Anything else is rejected with ``ValueError`` so the caller can surface
    a 400. Unknown keys (e.g. brand-new flags this validator hasn't been
    taught about yet) and ``None`` values pass through untouched, which keeps
    feature rollouts forward-compatible.
    """
    allowed = ENUM_FEATURE_FLAG_VALUES.get(key)
    if allowed is None or value is None:
        return value
    if not isinstance(value, str):
        raise ValueError(
            f"feature_flags['{key}'] must be one of {sorted(allowed)} "
            f"(got {type(value).__name__})"
        )
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise ValueError(
            f"feature_flags['{key}'] must be one of {sorted(allowed)} (got '{value}')"
        )
    return normalized


def normalize_feature_flags(payload: Any) -> dict[str, Any] | None:
    """Validate + canonicalize an entire feature_flags payload.

    Returns ``None`` when ``payload`` is ``None`` (caller didn't ask to
    change flags). Raises ``ValueError`` if the payload isn't a JSON object
    or any enum-keyed value is invalid.
    """
    if payload is None:
        return None
    if not isinstance(payload, dict):
        raise ValueError("feature_flags must be a JSON object")
    return {key: normalize_feature_flag_value(key, value) for key, value in payload.items()}
