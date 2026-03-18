"""
Quick API verification for backend hardening changes.

Run:
  python scripts/verify_backend_hardening_api.py
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass


BASE_URL = os.getenv("UAT_API_BASE_URL", "http://localhost:8000")
TENANT_CODE = os.getenv("UAT_TENANT_CODE", "LAKHSMA4821")
USERNAME = os.getenv("UAT_USERNAME", "shahriyar")
EMAIL = os.getenv("UAT_EMAIL", "shahriyar@lakhsma.com")
PASSWORD = os.getenv("UAT_PASSWORD", "Lakhsma123")


@dataclass
class CheckResult:
    check: str
    ok: bool
    note: str


def _request(method: str, path: str, headers: dict[str, str] | None = None, body: dict | None = None):
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(text) if text.strip().startswith(("{", "[")) else None
            return resp.status, parsed
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = None
        return exc.code, parsed


def _print(results: list[CheckResult]) -> None:
    print("Backend hardening API verification")
    print(f"Base URL: {BASE_URL}")
    for result in results:
        status = "Pass" if result.ok else "Fail"
        print(f"- {result.check}: {status} | {result.note}")


def main() -> None:
    results: list[CheckResult] = []

    st, js = _request(
        "POST",
        "/api/v1/auth/login",
        body={"company_code": TENANT_CODE, "username": USERNAME, "password": PASSWORD},
    )
    if st != 200:
        st, js = _request(
            "POST",
            "/api/v1/auth/login",
            body={"company_code": TENANT_CODE, "email": EMAIL, "password": PASSWORD},
        )
    if not (st == 200 and isinstance(js, dict) and js.get("access_token") and js.get("tenant_id")):
        _print([CheckResult("HARD-001 login", False, f"login failed status={st}")])
        return

    token = js["access_token"]
    tenant_id = js["tenant_id"]
    auth_headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)}

    results.append(CheckResult("HARD-001 login", True, "login succeeded"))

    # /tenants/me must not be public
    st_public, _ = _request("GET", "/api/v1/tenants/me", headers={"X-Tenant-Id": str(tenant_id)})
    results.append(
        CheckResult(
            "HARD-002 tenants_me_requires_auth",
            st_public in {401, 403},
            f"status={st_public}",
        )
    )

    # Inquiry/quotation lists should expose next_status_options contract
    st_inq, inq = _request("GET", "/api/v1/inquiries", headers=auth_headers)
    inq_ok = st_inq == 200 and isinstance(inq, list) and (not inq or isinstance(inq[0].get("next_status_options"), list))
    results.append(CheckResult("HARD-003 inquiry_next_status_options", inq_ok, f"status={st_inq}"))

    st_qt, qt = _request("GET", "/api/v1/quotations", headers=auth_headers)
    qt_ok = st_qt == 200 and isinstance(qt, list) and (not qt or isinstance(qt[0].get("next_status_options"), list))
    results.append(CheckResult("HARD-004 quotation_next_status_options", qt_ok, f"status={st_qt}"))

    _print(results)


if __name__ == "__main__":
    main()
