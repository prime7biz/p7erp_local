"""Tenant factory profile presets (woven, knit, sweater, denim, buying_house, hybrid)."""

from __future__ import annotations

from typing import Any, TypedDict

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import KNITTING_ENABLED, normalize_feature_flags
from app.models import Tenant

FACTORY_PROFILE_WOVEN = "woven"
FACTORY_PROFILE_KNIT = "knit"
FACTORY_PROFILE_SWEATER = "sweater"
FACTORY_PROFILE_DENIM = "denim"
FACTORY_PROFILE_BUYING_HOUSE = "buying_house"
FACTORY_PROFILE_HYBRID = "hybrid"

FACTORY_PROFILE_VALUES: tuple[str, ...] = (
    FACTORY_PROFILE_WOVEN,
    FACTORY_PROFILE_KNIT,
    FACTORY_PROFILE_SWEATER,
    FACTORY_PROFILE_DENIM,
    FACTORY_PROFILE_BUYING_HOUSE,
    FACTORY_PROFILE_HYBRID,
)

TRADE_ENABLED = "trade_enabled"


class FactoryProfilePreset(TypedDict):
    key: str
    label: str
    description: str
    enabled_optional_units: list[str]
    feature_flags: dict[str, bool]


FACTORY_PROFILE_PRESETS: dict[str, FactoryProfilePreset] = {
    FACTORY_PROFILE_WOVEN: {
        "key": FACTORY_PROFILE_WOVEN,
        "label": "Woven",
        "description": "Cutting, sewing, and finishing workflows.",
        "enabled_optional_units": [],
        "feature_flags": {},
    },
    FACTORY_PROFILE_KNIT: {
        "key": FACTORY_PROFILE_KNIT,
        "label": "Knitwear",
        "description": "Knitting and dyeing with optional sewing support.",
        "enabled_optional_units": ["knitting", "dyeing"],
        "feature_flags": {KNITTING_ENABLED: True},
    },
    FACTORY_PROFILE_SWEATER: {
        "key": FACTORY_PROFILE_SWEATER,
        "label": "Sweater",
        "description": "Knitting-focused production (linking unit planned).",
        "enabled_optional_units": ["knitting"],
        "feature_flags": {KNITTING_ENABLED: True},
    },
    FACTORY_PROFILE_DENIM: {
        "key": FACTORY_PROFILE_DENIM,
        "label": "Denim",
        "description": "Cutting, sewing, washing, and finishing.",
        "enabled_optional_units": ["washing"],
        "feature_flags": {},
    },
    FACTORY_PROFILE_BUYING_HOUSE: {
        "key": FACTORY_PROFILE_BUYING_HOUSE,
        "label": "Buying house",
        "description": "Trade and commercial workflows without in-house production units.",
        "enabled_optional_units": [],
        "feature_flags": {TRADE_ENABLED: True},
    },
    FACTORY_PROFILE_HYBRID: {
        "key": FACTORY_PROFILE_HYBRID,
        "label": "Hybrid",
        "description": "Production plus trade and commercial workflows.",
        "enabled_optional_units": ["knitting", "dyeing", "washing"],
        "feature_flags": {KNITTING_ENABLED: True, TRADE_ENABLED: True},
    },
}


def normalize_factory_profile(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    if normalized not in FACTORY_PROFILE_PRESETS:
        raise ValueError(
            f"factory_profile must be one of {', '.join(FACTORY_PROFILE_VALUES)} (got '{value}')"
        )
    return normalized


def list_factory_profile_options() -> list[dict[str, Any]]:
    return [
        {
            "key": preset["key"],
            "label": preset["label"],
            "description": preset["description"],
            "enabled_optional_units": list(preset["enabled_optional_units"]),
            "feature_flags": dict(preset["feature_flags"]),
        }
        for preset in FACTORY_PROFILE_PRESETS.values()
    ]


def preset_for_profile(profile: str) -> FactoryProfilePreset:
    normalized = normalize_factory_profile(profile)
    if not normalized:
        raise ValueError("factory_profile is required")
    return FACTORY_PROFILE_PRESETS[normalized]


async def apply_factory_profile_to_tenant(
    db: AsyncSession,
    *,
    tenant: Tenant,
    profile: str,
) -> FactoryProfilePreset:
    preset = preset_for_profile(profile)
    flags = dict(tenant.feature_flags) if isinstance(tenant.feature_flags, dict) else {}
    for key, enabled in preset["feature_flags"].items():
        flags[key] = enabled
    tenant.feature_flags = normalize_feature_flags(flags)
    await db.flush()
    return preset
