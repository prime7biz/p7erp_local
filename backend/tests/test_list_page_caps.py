"""Tenant list endpoints cap `limit` at MAX_PAGE_SIZE unless a named exception says why (RC-18).

Run:
    docker compose exec backend pytest tests/test_list_page_caps.py -q
"""

from __future__ import annotations

from fastapi.routing import APIRoute

from app.common.pagination import HR_LIST_MAX_LIMIT, HR_REPORT_SUB_MAX, MAX_PAGE_SIZE
from app.main import app

# path -> (allowed max, reason). Keep this list short; prefer pagination or a streaming export.
EXCEPTIONS: dict[str, tuple[int, str]] = {
    "/api/v1/reports/customer-performance": (10000, "documented report cap (Finding #3, reports/router.py)"),
    "/api/v1/hr/localization/bd-rmg/rules/preview/minimum-wage": (2000, "whole-workforce compliance preview"),
}
# Named heavy-list caps from app.common.pagination (Finding #3) used by HR and other heavy lists.
NAMED_CAPS = {HR_LIST_MAX_LIMIT, HR_REPORT_SUB_MAX}


def _limit_max(route: APIRoute) -> int | None:
    for param in route.dependant.query_params:
        if param.name != "limit":
            continue
        for meta in getattr(param.field_info, "metadata", []) or []:
            le = getattr(meta, "le", None)
            if le is not None:
                return int(le)
    return None


def test_tenant_list_limits_are_capped():
    too_big = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith("/api/v1/"):
            continue
        if route.path.startswith("/api/v1/admin"):
            continue  # platform admin, not tenant data
        cap = _limit_max(route)
        if cap is None or cap <= MAX_PAGE_SIZE:
            continue
        if cap in NAMED_CAPS:
            continue  # documented heavy-list caps from app.common.pagination
        allowed = EXCEPTIONS.get(route.path)
        if allowed and cap <= allowed[0]:
            continue
        too_big.append(f"{sorted(route.methods)} {route.path} le={cap}")
    assert not too_big, "List limits above MAX_PAGE_SIZE without a named exception:\n" + "\n".join(sorted(too_big))


def test_previously_oversized_lists_now_capped():
    paths = {
        "/api/v1/currency/exchange-rates",
        "/api/v1/manufacturing/quality/checks",
        "/api/v1/manufacturing/tna/plans",
        "/api/v1/users",
        "/api/v1/roles",
        "/api/v1/tna-unified/actions",
    }
    seen = {r.path: _limit_max(r) for r in app.routes if isinstance(r, APIRoute) and r.path in paths and "GET" in r.methods}
    assert set(seen) == paths
    assert all(cap is not None and cap <= MAX_PAGE_SIZE for cap in seen.values()), seen
