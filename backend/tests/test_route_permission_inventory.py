"""Route inventory: every tenant API route must carry a module permission dependency.

The dependency is a no-op while a tenant's RBAC mode is "off", logs in "shadow" and blocks in
"enforce" (see app.common.permissions.require_internal_permission). Routes that are shared by all
signed-in users or are not tenant-module screens are listed in ALLOWED_WITHOUT_MODULE_KEY.

Run:
    docker compose exec backend pytest tests/test_route_permission_inventory.py -q
"""

from __future__ import annotations

from fastapi.routing import APIRoute

from app.main import app

API = "/api/v1"

# Cross-cutting or non-module routes (own auth model or available to every signed-in user).
ALLOWED_WITHOUT_MODULE_KEY = (
    f"{API}/admin",  # platform admin JWT
    f"{API}/auth",
    f"{API}/tenants",
    f"{API}/files",  # per-module checks inside the handler
    f"{API}/me",
    f"{API}/marketing",
    f"{API}/public",
    f"{API}/saved-views",
    f"{API}/search",
    f"{API}/global-search",
    f"{API}/notifications",
    f"{API}/onboarding",
    f"{API}/dashboard",  # shared home screen; sensitive widgets have their own keys
    f"{API}/announcements",
    f"{API}/support",
    f"{API}/billing",
    f"{API}/settings",  # router-level settings.access; a few child routers are mounted inside it
    f"{API}/production",  # sub-routers each carry production.access
    f"{API}/manufacturing",
    f"{API}/hr/attendance/device-push",  # attendance devices sign in with their own X-Device-Key
)


def _permission_keys(route: APIRoute) -> set[str]:
    found: set[str] = set()
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        keys = getattr(dep.call, "permission_keys", None)
        if keys:
            found.update(keys)
        stack.extend(dep.dependencies)
    return found


def test_every_module_route_has_a_permission_dependency():
    missing: list[str] = []
    checked = 0
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith(API):
            continue
        if route.path.startswith(ALLOWED_WITHOUT_MODULE_KEY):
            continue
        checked += 1
        if not _permission_keys(route):
            missing.append(f"{sorted(route.methods)} {route.path}")
    assert checked > 300, checked
    assert not missing, "Routes without a module permission dependency:\n" + "\n".join(sorted(missing)[:80])


def test_newly_gated_routers_use_expected_keys():
    expected = {
        f"{API}/inventory/stock-groups": "inventory.access",
        f"{API}/finance/party-ledgers": "finance.access",
        f"{API}/finance/statements": "finance.access",
        f"{API}/finance/statements/commentary": "finance.access",
        f"{API}/finance/control-tower": "finance.access",
        f"{API}/finance/profitability/orders": "finance.access",
        f"{API}/finance/budget-analytics": "finance.access",
        f"{API}/finance/expense-analysis": "finance.access",
        f"{API}/finance/expense-controls": "finance.access",
        f"{API}/finance/stock-groups": "inventory.access",
        f"{API}/control-tower": "merch.access",
        f"{API}/data-migration": "settings.access",
        f"{API}/hr/onboarding": "hr.access",
        f"{API}/hr/compensation": "hr.access",
        f"{API}/hr/employee-access": "hr.access",
        f"{API}/hr/generated-documents": "hr.access",
        f"{API}/mfg-intelligence": "production.planning.read",
        f"{API}/mfg-intelligence/predictive": "production.planning.read",
        f"{API}/mfg-intelligence/recommendations": "production.planning.read",
        f"{API}/mfg-intelligence/forward-plan": "production.planning.read",
        f"{API}/mfg-intelligence/forward-plan/finance-constrained": "finance.access",
        f"{API}/mfg-intelligence/scheduler/convert": "production.planning.write",
    }
    seen: dict[str, set[str]] = {}
    for route in app.routes:
        if isinstance(route, APIRoute):
            for prefix in expected:
                if route.path.startswith(prefix):
                    seen.setdefault(prefix, set()).update(_permission_keys(route))
    for prefix, key in expected.items():
        assert key in seen.get(prefix, set()), prefix
