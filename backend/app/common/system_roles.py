"""Canonical tenant role names seeded per tenant and used in authorization checks.

Role `name` values are lowercase stable identifiers; `display_name` is user-facing.
"""

from __future__ import annotations

# (name, display_name) — must stay in sync with migration seed SQL
SYSTEM_ROLE_SEEDS: list[tuple[str, str]] = [
    ("admin", "Admin"),
    ("owner", "Owner"),
    ("manager", "Manager"),
    ("merchandiser", "Merchandiser"),
    ("planner", "Planner"),
    ("supervisor", "Supervisor"),
    ("operator", "Operator"),
    ("finance", "Finance"),
    ("user", "User"),
]

SYSTEM_ROLE_NAMES: frozenset[str] = frozenset(n for n, _ in SYSTEM_ROLE_SEEDS)

# Sets used across routers (align with existing hard-coded checks)
ADMIN_ROLES: frozenset[str] = frozenset({"admin", "owner", "super_admin", "superadmin"})
APPROVAL_ROLES: frozenset[str] = frozenset({"admin", "owner", "manager"})
PLANNING_ROLES: frozenset[str] = frozenset({"admin", "owner", "manager", "planner"})
SHOPFLOOR_ROLES: frozenset[str] = frozenset(
    {"operator", "supervisor", "manager", "admin", "owner", "super_admin", "superadmin"}
)
FINANCE_ROLES: frozenset[str] = frozenset({"admin", "owner", "manager", "finance"})
AI_ALLOWED_ROLES: frozenset[str] = frozenset(
    {"admin", "manager", "owner", "super_admin", "superadmin", "analyst", "operator", "supervisor"}
)
