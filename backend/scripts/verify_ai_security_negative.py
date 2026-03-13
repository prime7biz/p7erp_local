"""
Negative-path verification for AI Tool security controls.

Requires an already running backend API and auth tokens.

Env vars:
  P7_API_BASE=http://localhost:8000
  P7_TENANT_A=<tenant id for token A>
  P7_TOKEN_A=<bearer token for user in tenant A>
  P7_TENANT_B=<optional other tenant id>
  P7_TOKEN_B=<optional token in tenant B>
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def _request(path: str, *, method: str = "GET", tenant_id: str | None = None, token: str | None = None, body: dict | None = None):
    base = os.getenv("P7_API_BASE", "http://localhost:8000").rstrip("/")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(f"{base}{path}", method=method, data=data)
    req.add_header("Content-Type", "application/json")
    if tenant_id:
        req.add_header("X-Tenant-Id", tenant_id)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:  # noqa: S310
            payload = res.read().decode("utf-8")
            return res.getcode(), payload
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        return exc.code, payload


def _print_result(test_id: str, passed: bool, note: str) -> None:
    print(f"- {test_id}: {'PASS' if passed else 'FAIL'} | {note}")


def main() -> None:
    tenant_a = os.getenv("P7_TENANT_A")
    token_a = os.getenv("P7_TOKEN_A")
    tenant_b = os.getenv("P7_TENANT_B")
    token_b = os.getenv("P7_TOKEN_B")

    print("AI security negative verification")
    if not tenant_a or not token_a:
        print("Missing P7_TENANT_A or P7_TOKEN_A; cannot execute API checks.")
        return

    # 1) Missing auth should fail.
    status, _ = _request("/api/v1/ai-tool/sessions", tenant_id=tenant_a, token=None)
    _print_result("AI-NEG-001", status in {401, 403}, f"missing auth status={status}")

    # 2) Missing tenant header should fail.
    status, _ = _request("/api/v1/ai-tool/sessions", tenant_id=None, token=token_a)
    _print_result("AI-NEG-002", status in {400, 401, 403}, f"missing tenant header status={status}")

    # 3) Cross-tenant misuse should fail when alternate tenant provided.
    if tenant_b:
        status, _ = _request("/api/v1/ai-tool/sessions", tenant_id=tenant_b, token=token_a)
        _print_result("AI-NEG-003", status in {403, 404}, f"cross-tenant header mismatch status={status}")
    else:
        print("- AI-NEG-003: SKIP | P7_TENANT_B not provided")

    # 4) Invalid confirmation token must fail.
    status, payload = _request(
        "/api/v1/ai-tool/actions/propose",
        method="POST",
        tenant_id=tenant_a,
        token=token_a,
        body={"prompt": "Create follow-up reminder for order 123"},
    )
    if status in {200, 201}:
        try:
            created = json.loads(payload)
            run_id = int(created.get("id"))
            status_confirm, _ = _request(
                f"/api/v1/ai-tool/actions/{run_id}/confirm",
                method="POST",
                tenant_id=tenant_a,
                token=token_a,
                body={"confirmation_token": "INVALIDTOKEN"},
            )
            _print_result("AI-NEG-004", status_confirm in {400, 403}, f"invalid token status={status_confirm}")
        except Exception as exc:
            _print_result("AI-NEG-004", False, f"could not parse propose response: {exc}")
    else:
        _print_result("AI-NEG-004", False, f"precondition failed; could not create action proposal status={status}")

    # 5) Token from different user should fail (if token B provided).
    if token_b and tenant_b:
        status, payload = _request(
            "/api/v1/ai-tool/actions/propose",
            method="POST",
            tenant_id=tenant_a,
            token=token_a,
            body={"prompt": "Draft message for order delay"},
        )
        if status in {200, 201}:
            try:
                created = json.loads(payload)
                run_id = int(created.get("id"))
                token = str(created.get("confirmation_token") or "")
                if token:
                    status_confirm, _ = _request(
                        f"/api/v1/ai-tool/actions/{run_id}/confirm",
                        method="POST",
                        tenant_id=tenant_a,
                        token=token_b,
                        body={"confirmation_token": token},
                    )
                    _print_result("AI-NEG-005", status_confirm in {401, 403, 404}, f"other-user confirm status={status_confirm}")
                else:
                    print("- AI-NEG-005: SKIP | no one-time confirmation token returned")
            except Exception as exc:
                _print_result("AI-NEG-005", False, f"could not parse action proposal: {exc}")
        else:
            _print_result("AI-NEG-005", False, f"precondition failed; could not create action proposal status={status}")
    else:
        print("- AI-NEG-005: SKIP | P7_TOKEN_B/P7_TENANT_B not provided")


if __name__ == "__main__":
    main()
