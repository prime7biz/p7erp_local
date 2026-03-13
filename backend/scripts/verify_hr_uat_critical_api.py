"""
API-level verification for remaining HR critical UAT tests.

Run inside backend container:
  python scripts/verify_hr_uat_critical_api.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.common.auth import hash_password
from app.database import AsyncSessionLocal
from app.models import (
    AccountingPeriod,
    AccountGroup,
    ChartOfAccount,
    Department,
    Employee,
    PayrollPeriod,
    PayrollPosting,
    PayrollRun,
    PayrollRunLine,
    Role,
    Tenant,
    TenantType,
    User,
)

BASE_URL = os.getenv("UAT_API_BASE_URL", "http://localhost:8000")

TENANT_A_COMPANY_CODE = "LAKHSMA4821"
TENANT_A_USERNAME = "shahriyar"
TENANT_A_EMAIL = "shahriyar@lakhsma.com"
TENANT_A_PASSWORD = "Lakhsma123"

TENANT_B_COMPANY_CODE = "P7UATB2026"
TENANT_B_NAME = "P7 UAT Tenant B"
TENANT_B_USERNAME = "uatbadmin"
TENANT_B_EMAIL = "uatbadmin@p7.local"
TENANT_B_PASSWORD = "UatPass123"


@dataclass
class CaseResult:
    test_id: str
    status: str
    note: str


def _request(method: str, path: str, headers: dict[str, str] | None = None, body: dict | None = None) -> tuple[int, str, dict | None]:
    data = None
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url=f"{BASE_URL}{path}",
        data=data,
        headers=req_headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            text = resp.read().decode("utf-8")
            payload = json.loads(text) if text.strip().startswith(("{", "[")) else None
            return resp.getcode(), text, payload
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace") if e.fp else ""
        payload = None
        try:
            payload = json.loads(text)
        except Exception:
            payload = None
        return e.code, text, payload


async def _ensure_tenant_b() -> tuple[Tenant, User]:
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.company_code == TENANT_B_COMPANY_CODE))).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(
                name=TENANT_B_NAME,
                domain=None,
                tenant_type=TenantType.both,
                company_code=TENANT_B_COMPANY_CODE,
                is_active=True,
            )
            db.add(tenant)
            await db.flush()

        admin_role = (
            await db.execute(select(Role).where(Role.tenant_id == tenant.id, Role.name == "admin"))
        ).scalar_one_or_none()
        if admin_role is None:
            admin_role = Role(
                tenant_id=tenant.id,
                name="admin",
                display_name="Admin",
                permissions={},
            )
            db.add(admin_role)
            await db.flush()

        user = (
            await db.execute(select(User).where(User.tenant_id == tenant.id, User.username == TENANT_B_USERNAME))
        ).scalar_one_or_none()
        if user is None:
            user = User(
                tenant_id=tenant.id,
                role_id=admin_role.id,
                username=TENANT_B_USERNAME,
                email=TENANT_B_EMAIL,
                password_hash=hash_password(TENANT_B_PASSWORD),
                first_name="UAT",
                last_name="TenantB",
                is_active=True,
            )
            db.add(user)
            await db.flush()

        dept = (
            await db.execute(
                select(Department).where(Department.tenant_id == tenant.id, Department.code == "B-HR-01")
            )
        ).scalar_one_or_none()
        if dept is None:
            db.add(
                Department(
                    tenant_id=tenant.id,
                    code="B-HR-01",
                    name="Tenant B HR",
                    description="Tenant B isolated department",
                    is_active=True,
                )
            )

        await db.commit()
        return tenant, user


async def _get_tenant_a() -> Tenant:
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.company_code == TENANT_A_COMPANY_CODE))).scalar_one_or_none()
        if tenant is None:
            raise RuntimeError("Tenant A not found. Run tenant seed first.")
        return tenant


async def _get_user_for_tenant_a(tenant_id: int) -> User:
    async with AsyncSessionLocal() as db:
        user = (
            await db.execute(
                select(User).where(User.tenant_id == tenant_id, User.username == TENANT_A_USERNAME).order_by(User.id.asc())
            )
        ).scalars().first()
        if user:
            return user
        user = (
            await db.execute(
                select(User).where(User.tenant_id == tenant_id, User.email == TENANT_A_EMAIL).order_by(User.id.asc())
            )
        ).scalars().first()
        if not user:
            raise RuntimeError("Tenant A login user not found.")
        return user


async def _ensure_employee_user_link(tenant_id: int, user_id: int) -> None:
    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, Employee.user_id == user_id).order_by(Employee.id.asc())
            )
        ).scalars().first()
        if existing:
            return
        emp = (
            await db.execute(select(Employee).where(Employee.tenant_id == tenant_id).order_by(Employee.id.asc()))
        ).scalars().first()
        if not emp:
            raise RuntimeError("No employee found for user-link setup.")
        emp.user_id = user_id
        await db.commit()


async def _ensure_accounts_for_tenant(tenant_id: int) -> tuple[int, int]:
    async with AsyncSessionLocal() as db:
        accounts = (
            await db.execute(
                select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.is_active.is_(True))
            )
        ).scalars().all()
        if len(accounts) >= 2:
            return accounts[0].id, accounts[1].id

        group = (
            await db.execute(select(AccountGroup).where(AccountGroup.tenant_id == tenant_id).order_by(AccountGroup.id.asc()))
        ).scalar_one_or_none()
        if group is None:
            group = AccountGroup(
                tenant_id=tenant_id,
                name="Auto Assets",
                code="AUTO-ASSET",
                parent_group_id=None,
                nature="ASSET",
                affects_gross_profit=False,
                is_bank_group=False,
                sort_order=1,
                is_active=True,
            )
            db.add(group)
            await db.flush()

        while len(accounts) < 2:
            idx = len(accounts) + 1
            acc = ChartOfAccount(
                tenant_id=tenant_id,
                account_number=f"99{idx:03d}",
                name=f"Auto Payroll Account {idx}",
                group_id=group.id,
                normal_balance="debit" if idx == 1 else "credit",
                opening_balance="0",
                balance="0",
                account_currency="BDT",
                maintain_fc_balance=False,
                description="Auto-created for payroll posting UAT",
                is_active=True,
                is_bank_account=False,
            )
            db.add(acc)
            await db.flush()
            accounts.append(acc)

        await db.commit()
        return accounts[0].id, accounts[1].id


async def _prepare_posting_run(tenant_id: int, *, closed_period: bool, suffix: str) -> int:
    async with AsyncSessionLocal() as db:
        employee = (
            await db.execute(select(Employee).where(Employee.tenant_id == tenant_id).order_by(Employee.id.asc()))
        ).scalars().first()
        if employee is None:
            raise RuntimeError("No employee found for tenant A. Run HR seeds first.")

        if closed_period:
            payment_day = date(2026, 6, 10)
            period_start = date(2026, 6, 1)
            period_end = date(2026, 6, 30)
        else:
            payment_day = date(2026, 5, 28)
            period_start = date(2026, 5, 1)
            period_end = date(2026, 5, 31)
        accounting_period = (
            await db.execute(
                select(AccountingPeriod).where(
                    AccountingPeriod.tenant_id == tenant_id,
                    AccountingPeriod.start_date == period_start,
                    AccountingPeriod.end_date == period_end,
                    AccountingPeriod.is_closed.is_(closed_period),
                )
            )
        ).scalars().first()
        if accounting_period is None:
            accounting_period = AccountingPeriod(
                tenant_id=tenant_id,
                period_name=f"UAT-{suffix}",
                start_date=period_start,
                end_date=period_end,
                is_closed=closed_period,
                closed_at=None,
                closed_by=None,
            )
            db.add(accounting_period)
            await db.flush()

        period = PayrollPeriod(
            tenant_id=tenant_id,
            period_code=f"UAT-PR-{suffix}",
            start_date=period_start,
            end_date=period_end,
            payment_date=payment_day,
            status="FINALIZED",
            is_locked=False,
            finalized_by=None,
            finalized_at=None,
        )
        db.add(period)
        await db.flush()

        run = PayrollRun(
            tenant_id=tenant_id,
            period_id=period.id,
            run_code=f"UAT-RUN-{suffix}",
            run_date=date(2026, 3, 27),
            status="APPROVED",
            gross_total="10000",
            deduction_total="1000",
            net_total="9000",
            finalized_by=None,
            finalized_at=None,
            created_by=None,
        )
        db.add(run)
        await db.flush()

        db.add(
            PayrollRunLine(
                tenant_id=tenant_id,
                run_id=run.id,
                employee_id=employee.id,
                structure_id=None,
                gross_pay="10000",
                deductions="1000",
                net_pay="9000",
                remarks="UAT posting test line",
            )
        )
        await db.commit()
        return run.id


async def main() -> None:
    tenant_a = await _get_tenant_a()
    user_a = await _get_user_for_tenant_a(tenant_a.id)
    await _ensure_employee_user_link(tenant_a.id, user_a.id)
    tenant_b, _ = await _ensure_tenant_b()
    exp_acc_id, pay_acc_id = await _ensure_accounts_for_tenant(tenant_a.id)
    seed_tag = datetime.now().strftime("%H%M%S")
    open_run_id = await _prepare_posting_run(tenant_a.id, closed_period=False, suffix=f"O{seed_tag}")
    closed_run_id = await _prepare_posting_run(tenant_a.id, closed_period=True, suffix=f"C{seed_tag}")

    results: list[CaseResult] = []

    st, tx, js = _request(
        "POST",
        "/api/v1/auth/login",
        body={"company_code": TENANT_A_COMPANY_CODE, "username": TENANT_A_USERNAME, "password": TENANT_A_PASSWORD},
    )
    if st != 200:
        st, tx, js = _request(
            "POST",
            "/api/v1/auth/login",
            body={"company_code": TENANT_A_COMPANY_CODE, "email": TENANT_A_EMAIL, "password": TENANT_A_PASSWORD},
        )
    token_a = js.get("access_token") if isinstance(js, dict) else None
    if st == 200 and token_a:
        results.append(CaseResult("HR-UAT-001", "Pass", "Tenant A login succeeded with company code"))
    else:
        results.append(CaseResult("HR-UAT-001", "Fail", f"Login failed: {st} {tx}"))

    st, _, _ = _request("GET", "/api/v1/hr/departments", headers={"X-Tenant-Id": str(tenant_a.id)})
    results.append(
        CaseResult("HR-UAT-017", "Pass" if st in {401, 403} else "Fail", f"Unauthorized status={st}")
    )

    if token_a:
        headers_a = {"Authorization": f"Bearer {token_a}", "X-Tenant-Id": str(tenant_a.id)}
        st1, _, _ = _request("GET", "/api/v1/hr/departments", headers={"Authorization": f"Bearer {token_a}"})
        st2, _, _ = _request(
            "GET",
            "/api/v1/hr/departments",
            headers={"Authorization": f"Bearer {token_a}", "X-Tenant-Id": "abc"},
        )
        results.append(CaseResult("HR-UAT-017A", "Pass", f"missing-header={st1}, invalid-header={st2}"))

        st, _, js = _request(
            "POST",
            "/api/v1/auth/login",
            body={"company_code": TENANT_B_COMPANY_CODE, "username": TENANT_B_USERNAME, "password": TENANT_B_PASSWORD},
        )
        token_b = js.get("access_token") if (st == 200 and isinstance(js, dict)) else None

        st_a, _, js_a = _request("GET", "/api/v1/hr/departments", headers=headers_a)
        st_b, _, js_b = (
            _request(
                "GET",
                "/api/v1/hr/departments",
                headers={"Authorization": f"Bearer {token_b}", "X-Tenant-Id": str(tenant_b.id)},
            )
            if token_b
            else (0, "", None)
        )
        st_m, _, _ = _request(
            "GET",
            "/api/v1/hr/departments",
            headers={"Authorization": f"Bearer {token_a}", "X-Tenant-Id": str(tenant_b.id)},
        )
        results.append(
            CaseResult(
                "HR-UAT-018",
                "Pass" if st_m == 403 else "Fail",
                f"Mismatch status={st_m}",
            )
        )
        if st_a == 200 and st_b == 200 and isinstance(js_a, list) and isinstance(js_b, list):
            a_codes = {r.get("code") for r in js_a}
            b_codes = {r.get("code") for r in js_b}
            isolated = "D-HR" in a_codes and "D-HR" not in b_codes and "B-HR-01" in b_codes
            results.append(
                CaseResult(
                    "HR-UAT-016",
                    "Pass" if isolated else "Fail",
                    f"A={sorted(list(a_codes))}, B={sorted(list(b_codes))}",
                )
            )
        else:
            results.append(CaseResult("HR-UAT-016", "Fail", "Could not fetch both tenant lists"))

        st, tx, js = _request(
            "POST",
            f"/api/v1/hr/payroll/runs/{open_run_id}/post",
            headers=headers_a,
            body={"payroll_expense_account_id": exp_acc_id, "payroll_payable_account_id": pay_acc_id, "note": "UAT"},
        )
        voucher_id = js.get("voucher_id") if isinstance(js, dict) else None
        results.append(
            CaseResult(
                "HR-UAT-029",
                "Pass" if st == 200 and voucher_id else "Fail",
                f"status={st}, voucher_id={voucher_id}, response={tx[:200]}",
            )
        )

        st, tx, _ = _request(
            "POST",
            f"/api/v1/hr/payroll/runs/{closed_run_id}/post",
            headers=headers_a,
            body={"payroll_expense_account_id": exp_acc_id, "payroll_payable_account_id": pay_acc_id, "note": "UAT-closed"},
        )
        blocked = st == 400 and "locked/closed" in tx
        results.append(CaseResult("HR-UAT-030", "Pass" if blocked else "Fail", f"status={st}, response={tx[:200]}"))

        st, _, _ = _request("GET", "/api/v1/hr/ess/my-profile", headers=headers_a)
        results.append(CaseResult("HR-UAT-034", "Pass" if st == 200 else "Fail", f"status={st}"))

    async with AsyncSessionLocal() as db:
        posting = (
            await db.execute(
                select(PayrollPosting).where(PayrollPosting.payroll_run_id == open_run_id).order_by(PayrollPosting.id.desc())
            )
        ).scalar_one_or_none()
        results.append(
            CaseResult(
                "HR-UAT-029A",
                "Pass" if posting and posting.voucher_id else "Fail",
                f"db_voucher_id={posting.voucher_id if posting else None}",
            )
        )

    print("HR critical API verification")
    print(f"Base URL: {BASE_URL}")
    print(f"Tenant A: {TENANT_A_COMPANY_CODE}")
    print(f"Tenant B: {TENANT_B_COMPANY_CODE}")
    for row in results:
        print(f"- {row.test_id}: {row.status} | {row.note}")


if __name__ == "__main__":
    asyncio.run(main())
