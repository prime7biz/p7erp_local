"""The RBAC readiness report must agree with the route-permission inventory test.

Run:
    docker compose exec backend pytest tests/test_rbac_access_report.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI

from app.common.permissions import require_any_internal_permission, require_internal_permission
from app.main import app

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import rbac_access_report  # noqa: E402

from tests.test_route_permission_inventory import ALLOWED_WITHOUT_MODULE_KEY  # noqa: E402


def _prefixes(lines: list[str]) -> set[str]:
    return {line.split(" (")[0] for line in lines}


def test_gated_routes_are_not_reported_as_ungated():
    router = APIRouter(prefix="/api/v1/demo")

    @router.get("/single", dependencies=[Depends(require_internal_permission("demo.access"))])
    async def single():
        return {}

    @router.get("/any", dependencies=[Depends(require_any_internal_permission("demo.a", "demo.b"))])
    async def any_key():
        return {}

    open_router = APIRouter(prefix="/api/v1/open")

    @open_router.get("/x")
    async def open_route():
        return {}

    demo = FastAPI()
    demo.include_router(router)
    demo.include_router(open_router)

    assert rbac_access_report.ungated_route_prefixes(demo.routes) == ["/api/v1/open (1 routes)"]


def test_report_matches_route_inventory_allowlist():
    """Every prefix the report calls ungated must be one the inventory test allows without a module key."""
    from fastapi.routing import APIRoute

    ungated_paths = [
        r.path
        for r in app.routes
        if isinstance(r, APIRoute) and r.path.startswith("/api/v1/") and not rbac_access_report.route_permission_keys(r)
    ]
    # One-way check: every ungated route must sit under an allow-listed prefix (no module may go ungated).
    unexpected = sorted(p for p in ungated_paths if not p.startswith(ALLOWED_WITHOUT_MODULE_KEY))
    assert not unexpected, f"Routes without a module permission that are not allow-listed: {unexpected[:20]}"
    ungated = _prefixes(rbac_access_report.ungated_route_prefixes(app.routes))
    assert "/api/v1/finance" not in ungated
    assert "/api/v1/inventory" not in ungated
