"""Mask salary / identity fields on HR class request payloads for viewers without keys."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

SALARY_KEYS = frozenset(
    {
        "base_salary",
        "salary",
        "gross",
        "component_overrides",
        "compensation",
        "structure_id",
        "bd_wage_rate_id",
        "pay_benefits",
        "tax_profile",
        "benefits",
        "profile",
        "amount",
        "new_base_salary",
        "proposed_salary",
    }
)
IDENTITY_KEYS = frozenset(
    {
        "national_id",
        "nid",
        "passport_no",
        "bank_account_no",
        "bank_name",
        "bank_branch",
        "routing_number",
        "tin",
        "date_of_birth",
        "dob",
    }
)
MASK = "***"


def mask_mapping(data: Any, *, can_view_pay: bool, can_view_identity: bool) -> Any:
    if isinstance(data, list):
        return [mask_mapping(x, can_view_pay=can_view_pay, can_view_identity=can_view_identity) for x in data]
    if not isinstance(data, dict):
        return data
    out: dict[str, Any] = {}
    for key, value in data.items():
        lk = str(key).lower()
        if not can_view_pay and (lk in SALARY_KEYS or lk.endswith("_salary") or "salary" in lk):
            out[key] = MASK if not isinstance(value, (dict, list)) else mask_mapping(
                value, can_view_pay=False, can_view_identity=can_view_identity
            )
            continue
        if not can_view_identity and lk in IDENTITY_KEYS:
            out[key] = MASK
            continue
        out[key] = mask_mapping(value, can_view_pay=can_view_pay, can_view_identity=can_view_identity)
    return out


def mask_request_dict(
    row: dict[str, Any],
    *,
    can_view_pay: bool,
    can_view_identity: bool,
) -> dict[str, Any]:
    data = deepcopy(row)
    for field in ("payload", "before"):
        if field in data and isinstance(data[field], (dict, list)):
            data[field] = mask_mapping(
                data[field], can_view_pay=can_view_pay, can_view_identity=can_view_identity
            )
    return data
