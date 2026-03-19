"""
API verification for workflow transition guardrails (invalid jumps must fail).

Run inside backend container:
  python scripts/verify_merch_workflow_transitions_api.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.common.workflow import INQUIRY_TRANSITIONS, ORDER_TRANSITIONS, QUOTATION_TRANSITIONS

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


def _request(method: str, path: str, headers: dict[str, str] | None = None, body: dict | None = None) -> tuple[int, str, dict | list | None]:
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


def _pick_invalid_target(current: str, transitions: dict[str, set[str]]) -> str | None:
    current = (current or "").upper()
    all_states = set(transitions.keys())
    allowed = set(transitions.get(current, set()))
    candidates = sorted(x for x in all_states if x != current and x not in allowed)
    return candidates[0] if candidates else None


def _pass(test_id: str, ok: bool, note: str) -> CaseResult:
    return CaseResult(test_id, "Pass" if ok else "Fail", note)


def _skip(test_id: str, note: str) -> CaseResult:
    return CaseResult(test_id, "Skip", note)


async def main() -> None:
    results: list[CaseResult] = []

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
        print("Merch workflow transition guard verification")
        print(f"- MWT-001: Fail | Login failed: status={st}, body={tx[:300]}")
        return

    token = js["access_token"]
    tenant_id = js["tenant_id"]
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)}
    results.append(_pass("MWT-001", True, "Login succeeded"))

    st, _, inquiries = _request("GET", "/api/v1/inquiries", headers=headers)
    if st == 200 and isinstance(inquiries, list) and inquiries:
        row = inquiries[0] if isinstance(inquiries[0], dict) else {}
        inquiry_id = row.get("id")
        current = str(row.get("status") or "").upper()
        target = _pick_invalid_target(current, INQUIRY_TRANSITIONS)
        if inquiry_id and target:
            st_u, tx_u, _ = _request("PATCH", f"/api/v1/inquiries/{inquiry_id}/status", headers=headers, body={"status": target})
            blocked = st_u == 400 and "Invalid inquiry workflow transition" in tx_u
            results.append(_pass("MWT-002", blocked, f"inquiry_id={inquiry_id}, {current}->{target}, status={st_u}"))
        else:
            results.append(_skip("MWT-002", "Could not determine inquiry invalid target"))
    else:
        results.append(_skip("MWT-002", "No inquiry found"))

    st, _, quotations = _request("GET", "/api/v1/quotations", headers=headers)
    if st == 200 and isinstance(quotations, list) and quotations:
        row = quotations[0] if isinstance(quotations[0], dict) else {}
        quotation_id = row.get("id")
        current = str(row.get("status") or "").upper()
        target = _pick_invalid_target(current, QUOTATION_TRANSITIONS)
        if quotation_id and target:
            st_u, tx_u, _ = _request("PATCH", f"/api/v1/quotations/{quotation_id}", headers=headers, body={"status": target})
            blocked = st_u == 400 and "Invalid quotation workflow transition" in tx_u
            results.append(_pass("MWT-003", blocked, f"quotation_id={quotation_id}, {current}->{target}, status={st_u}"))
        else:
            results.append(_skip("MWT-003", "Could not determine quotation invalid target"))
    else:
        results.append(_skip("MWT-003", "No quotation found"))

    st, _, orders = _request("GET", "/api/v1/orders", headers=headers)
    if st == 200 and isinstance(orders, list) and orders:
        row = orders[0] if isinstance(orders[0], dict) else {}
        order_id = row.get("id")
        current = str(row.get("status") or "").upper()
        target = _pick_invalid_target(current, ORDER_TRANSITIONS)
        if order_id and target:
            st_u, tx_u, _ = _request("PATCH", f"/api/v1/orders/{order_id}/status", headers=headers, body={"status": target})
            blocked = st_u == 400 and "Invalid order workflow transition" in tx_u
            results.append(_pass("MWT-004", blocked, f"order_id={order_id}, {current}->{target}, status={st_u}"))
        else:
            results.append(_skip("MWT-004", "Could not determine order invalid target"))
    else:
        results.append(_skip("MWT-004", "No order found"))

    print("Merch workflow transition guard verification")
    print(f"Base URL: {BASE_URL}")
    print(f"Tenant: {TENANT_CODE} (tenant_id={tenant_id})")
    for row in results:
        print(f"- {row.test_id}: {row.status} | {row.note}")


if __name__ == "__main__":
    asyncio.run(main())
