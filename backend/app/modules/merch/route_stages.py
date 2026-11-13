"""Route stage fields on follow-up (TNA) templates and order actions (migration 299, Phase 2 R4).

Allowlists match the CHECK constraints of migration 299. All fields are optional; a template without them behaves
exactly as before. The TNA generators copy `ACTION_ROUTE_FIELDS` from the template onto each generated action.

- stage_kind: INTERNAL (own floor), EXTERNAL_PROCESS (wash / print / embroidery outside), SUBCONTRACT (CMT sewing)
- stage_position: PRE_SEWING, SEWING, POST_SEWING
- gate_class: MANDATORY (blocks the next step) or INFORMATIONAL
- lead_time_days: calendar days the stage takes (0-365); external / subcontract stages are lead-time only
"""
from __future__ import annotations

import re
from typing import Any

SOURCING_MODES = ("IN_HOUSE", "IMPORTED", "LOCAL", "SUBCONTRACT", "BUYER_SUPPLIED")
GATE_CLASSES = ("MANDATORY", "INFORMATIONAL")
STAGE_KINDS = ("INTERNAL", "EXTERNAL_PROCESS", "SUBCONTRACT")
STAGE_POSITIONS = ("PRE_SEWING", "SEWING", "POST_SEWING")
EXTERNAL_STAGE_KINDS = ("EXTERNAL_PROCESS", "SUBCONTRACT")
MAX_LEAD_TIME_DAYS = 365
MAX_LAG_DAYS = 365
MAX_PREDECESSORS = 20

TEMPLATE_ROUTE_FIELDS = (
    "product_type",
    "sourcing_mode",
    "route_code",
    "gate_class",
    "predecessor_codes",
    "lag_days",
    "stage_kind",
    "stage_position",
    "lead_time_days",
)
ACTION_ROUTE_FIELDS = ("route_code", "stage_kind", "stage_position", "gate_class", "lead_time_days")

_ROUTE_CODE = re.compile(r"^[A-Z0-9][A-Z0-9_\-]{0,31}$")


def choice(value: str | None, allowed: tuple[str, ...], label: str) -> str | None:
    """Upper-case + strip; empty -> None; anything outside `allowed` -> ValueError (pydantic turns it into 422)."""
    if value is None:
        return None
    s = str(value).strip().upper()
    if not s:
        return None
    if s not in allowed:
        raise ValueError(f"Invalid {label}. Allowed: {', '.join(allowed)}")
    return s


def route_code(value: str | None) -> str | None:
    if value is None:
        return None
    s = str(value).strip().upper()
    if not s:
        return None
    if not _ROUTE_CODE.match(s):
        raise ValueError("route_code: 1-32 characters, letters, digits, '-' or '_'")
    return s


def predecessor_codes(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    out: list[str] = []
    for code in value:
        s = str(code or "").strip()
        if not s:
            continue
        if len(s) > 64:
            raise ValueError("predecessor_codes: each code at most 64 characters")
        if s not in out:
            out.append(s)
    if len(out) > MAX_PREDECESSORS:
        raise ValueError(f"predecessor_codes: at most {MAX_PREDECESSORS} codes")
    return out or None


def action_route_values(template: Any) -> dict[str, Any]:
    """Route fields copied from a template onto a generated order follow-up action (None when not set)."""
    return {name: getattr(template, name, None) for name in ACTION_ROUTE_FIELDS}
