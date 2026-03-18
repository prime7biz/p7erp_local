"""
API-level smoke verification for merchandising workflow rollout.

Run inside backend container:
  python scripts/verify_merch_workflow_api.py
"""

from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime

BASE_URL = os.getenv("UAT_API_BASE_URL", "http://localhost:8000")
TENANT_CODE = os.getenv("UAT_TENANT_CODE", "LAKHSMA4821")
USERNAME = os.getenv("UAT_USERNAME", "shahriyar")
EMAIL = os.getenv("UAT_EMAIL", "shahriyar@lakhsma.com")
PASSWORD = os.getenv("UAT_PASSWORD", "Lakhsma123")


@dataclass
class CaseResult:
    test_id: str
    status: str
    note: str


def _request(
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: dict | None = None,
) -> tuple[int, str, dict | list | None]:
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=payload, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            parsed = json.loads(text) if text.strip().startswith(("{", "[")) else None
            return resp.getcode(), text, parsed
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace") if e.fp else ""
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = None
        return e.code, text, parsed


def _case(test_id: str, ok: bool, note: str) -> CaseResult:
    return CaseResult(test_id, "Pass" if ok else "Fail", note)


def _skip(test_id: str, note: str) -> CaseResult:
    return CaseResult(test_id, "Skip", note)


async def main() -> None:
    results: list[CaseResult] = []
    run_tag = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    st, tx, js = _request(
        "POST",
        "/api/v1/auth/login",
        body={"company_code": TENANT_CODE, "username": USERNAME, "password": PASSWORD},
    )
    if st != 200:
        st, tx, js = _request(
            "POST",
            "/api/v1/auth/login",
            body={"company_code": TENANT_CODE, "email": EMAIL, "password": PASSWORD},
        )
    if not (st == 200 and isinstance(js, dict) and js.get("access_token") and js.get("tenant_id")):
        print("Merch workflow API verification")
        print(f"Base URL: {BASE_URL}")
        print(f"Run at: {run_tag}")
        print(f"- MWF-001: Fail | Login failed: status={st}, body={tx[:300]}")
        return

    token = js["access_token"]
    tenant_id = js["tenant_id"]
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)}
    results.append(_case("MWF-001", True, "Login succeeded"))

    st, _, bad_tenant = _request("GET", "/api/v1/inquiries", headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": "abc"})
    mismatch_blocked = st in {400, 401, 403, 422}
    note = f"invalid-tenant-header-status={st}"
    if isinstance(bad_tenant, dict) and bad_tenant.get("detail"):
        note = f"{note}, detail={str(bad_tenant.get('detail'))[:120]}"
    results.append(_case("MWF-002", mismatch_blocked, note))

    st, _, inquiries = _request("GET", "/api/v1/inquiries", headers=headers)
    inquiries_ok = st == 200 and isinstance(inquiries, list)
    results.append(_case("MWF-003", inquiries_ok, f"status={st}, count={len(inquiries) if isinstance(inquiries, list) else 'n/a'}"))
    if inquiries_ok and inquiries:
        one = inquiries[0] if isinstance(inquiries[0], dict) else {}
        nso = one.get("next_status_options")
        results.append(_case("MWF-004", isinstance(nso, list), f"inquiry_id={one.get('id')}, next_status_options_type={type(nso).__name__}"))
    else:
        results.append(_skip("MWF-004", "No inquiry rows found"))

    st, _, quotations = _request("GET", "/api/v1/quotations", headers=headers)
    quotations_ok = st == 200 and isinstance(quotations, list)
    results.append(_case("MWF-005", quotations_ok, f"status={st}, count={len(quotations) if isinstance(quotations, list) else 'n/a'}"))
    if quotations_ok and quotations:
        one = quotations[0] if isinstance(quotations[0], dict) else {}
        nso = one.get("next_status_options")
        results.append(_case("MWF-006", isinstance(nso, list), f"quotation_id={one.get('id')}, next_status_options_type={type(nso).__name__}"))
    else:
        results.append(_skip("MWF-006", "No quotation rows found"))

    st, _, orders = _request("GET", "/api/v1/orders", headers=headers)
    orders_ok = st == 200 and isinstance(orders, list)
    results.append(_case("MWF-007", orders_ok, f"status={st}, count={len(orders) if isinstance(orders, list) else 'n/a'}"))
    if orders_ok and orders and isinstance(orders[0], dict) and orders[0].get("id"):
        order_id = orders[0]["id"]
        st_pc, _, promise = _request("GET", f"/api/v1/orders/{order_id}/promise-check", headers=headers)
        promise_ok = st_pc == 200 and isinstance(promise, dict) and ("atp_ok" in promise) and ("ctp_ok" in promise)
        results.append(_case("MWF-008", promise_ok, f"order_id={order_id}, status={st_pc}"))
    else:
        results.append(_skip("MWF-008", "No order rows found for promise-check"))

    st, _, tna_summary = _request("GET", "/api/v1/tna-unified/summary", headers=headers)
    summary_ok = st == 200 and isinstance(tna_summary, dict) and "total_count" in tna_summary
    results.append(_case("MWF-009", summary_ok, f"status={st}"))

    st, _, tna_actions = _request("GET", "/api/v1/tna-unified/actions?limit=10", headers=headers)
    actions_ok = st == 200 and isinstance(tna_actions, list)
    results.append(_case("MWF-010", actions_ok, f"status={st}, count={len(tna_actions) if isinstance(tna_actions, list) else 'n/a'}"))

    st, _, boms = _request("GET", "/api/v1/merch/boms", headers=headers)
    boms_ok = st == 200 and isinstance(boms, list)
    results.append(_case("MWF-011", boms_ok, f"status={st}, count={len(boms) if isinstance(boms, list) else 'n/a'}"))

    st, _, alerts = _request(
        "GET",
        "/api/v1/merch/alerts?sort=-priority_score&sla_bucket=at_risk&min_priority_score=0&page=1&page_size=20",
        headers=headers,
    )
    alerts_ok = st == 200 and isinstance(alerts, dict) and isinstance(alerts.get("items"), list)
    results.append(_case("MWF-012", alerts_ok, f"status={st}, total={alerts.get('total') if isinstance(alerts, dict) else 'n/a'}"))

    if alerts_ok:
        items = alerts.get("items", [])
        filtered_ok = all(
            isinstance(x, dict)
            and isinstance(x.get("priority_score"), int)
            and x.get("priority_score", -1) >= 0
            and x.get("sla_bucket") == "at_risk"
            for x in items
        )
        sorted_ok = all(items[i].get("priority_score", -1) >= items[i + 1].get("priority_score", -1) for i in range(len(items) - 1))
        results.append(_case("MWF-013", filtered_ok and sorted_ok, f"items_checked={len(items)}"))

        if items and isinstance(items[0], dict) and items[0].get("id"):
            alert_id = items[0]["id"]
            st_d, _, detail = _request("GET", f"/api/v1/merch/alerts/{alert_id}", headers=headers)
            detail_ok = (
                st_d == 200
                and isinstance(detail, dict)
                and isinstance(detail.get("priority_score"), int)
                and detail.get("sla_bucket") in {"at_risk", "breach", "met"}
            )
            results.append(_case("MWF-014", detail_ok, f"alert_id={alert_id}, status={st_d}"))
        else:
            results.append(_skip("MWF-014", "No alert rows returned for detail check"))
    else:
        results.append(_skip("MWF-013", "Alert list response unavailable"))
        results.append(_skip("MWF-014", "Alert list response unavailable"))

    print("Merch workflow API verification")
    print(f"Base URL: {BASE_URL}")
    print(f"Tenant: {TENANT_CODE} (tenant_id={tenant_id})")
    print(f"Run at: {run_tag}")
    for row in results:
        print(f"- {row.test_id}: {row.status} | {row.note}")


if __name__ == "__main__":
    asyncio.run(main())
