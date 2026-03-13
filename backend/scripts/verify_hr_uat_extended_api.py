"""
Extended API-level verification for HR UAT non-critical flows.

Run inside backend container:
  python scripts/verify_hr_uat_extended_api.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

BASE_URL = os.getenv("UAT_API_BASE_URL", "http://localhost:8000")
TENANT_CODE = "LAKHSMA4821"
USERNAME = "shahriyar"
EMAIL = "shahriyar@lakhsma.com"
PASSWORD = "Lakhsma123"


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


def _is_pass(status_code: int) -> bool:
    return 200 <= status_code < 300


async def main() -> None:
    results: list[CaseResult] = []
    ts = datetime.now().strftime("%H%M%S")

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
    if not (_is_pass(st) and isinstance(js, dict) and js.get("access_token") and js.get("tenant_id")):
        print("Login failed; cannot continue extended verification.")
        print(f"status={st} body={tx}")
        return

    token = js["access_token"]
    tenant_id = js["tenant_id"]
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)}

    # Core masters lookup
    _, _, deps = _request("GET", "/api/v1/hr/departments", headers=headers)
    _, _, desigs = _request("GET", "/api/v1/hr/designations", headers=headers)
    _, _, emps = _request("GET", "/api/v1/hr/employees", headers=headers)
    deps = deps if isinstance(deps, list) else []
    desigs = desigs if isinstance(desigs, list) else []
    emps = emps if isinstance(emps, list) else []
    dep_id = deps[0]["id"] if deps else None
    desig_id = desigs[0]["id"] if desigs else None
    manager_emp_id = emps[0]["id"] if emps else None

    # HR-UAT-002 create department
    dept_code = f"UATD{ts}"
    st, _, dept = _request("POST", "/api/v1/hr/departments", headers=headers, body={"code": dept_code, "name": f"UAT Dept {ts}"})
    dept_ok = _is_pass(st) and isinstance(dept, dict) and dept.get("code") == dept_code
    results.append(CaseResult("HR-UAT-002", "Pass" if dept_ok else "Fail", f"status={st}"))
    new_dep_id = dept["id"] if isinstance(dept, dict) and dept.get("id") else dep_id

    # HR-UAT-003 edit department
    st, _, dept2 = _request("PATCH", f"/api/v1/hr/departments/{new_dep_id}", headers=headers, body={"name": f"UAT Dept Updated {ts}"})
    edit_ok = _is_pass(st) and isinstance(dept2, dict) and "Updated" in (dept2.get("name") or "")
    results.append(CaseResult("HR-UAT-003", "Pass" if edit_ok else "Fail", f"status={st}"))

    # HR-UAT-004 duplicate department
    st, tx, _ = _request("POST", "/api/v1/hr/departments", headers=headers, body={"code": dept_code, "name": f"Dup Dept {ts}"})
    dup_dep_ok = st == 400 and "already exists" in tx
    results.append(CaseResult("HR-UAT-004", "Pass" if dup_dep_ok else "Fail", f"status={st}"))

    # HR-UAT-005 create designation
    desig_code = f"UATG{ts}"
    st, _, desig = _request(
        "POST",
        "/api/v1/hr/designations",
        headers=headers,
        body={"department_id": new_dep_id, "code": desig_code, "title": f"UAT Designation {ts}"},
    )
    d_create_ok = _is_pass(st) and isinstance(desig, dict) and desig.get("department_id") == new_dep_id
    results.append(CaseResult("HR-UAT-005", "Pass" if d_create_ok else "Fail", f"status={st}"))
    new_desig_id = desig["id"] if isinstance(desig, dict) and desig.get("id") else desig_id

    # HR-UAT-006 edit designation
    st, _, desig2 = _request(
        "PATCH",
        f"/api/v1/hr/designations/{new_desig_id}",
        headers=headers,
        body={"title": f"UAT Designation Updated {ts}"},
    )
    d_edit_ok = _is_pass(st) and isinstance(desig2, dict) and "Updated" in (desig2.get("title") or "")
    results.append(CaseResult("HR-UAT-006", "Pass" if d_edit_ok else "Fail", f"status={st}"))

    # HR-UAT-007 duplicate designation
    st, tx, _ = _request(
        "POST",
        "/api/v1/hr/designations",
        headers=headers,
        body={"department_id": new_dep_id, "code": desig_code, "title": f"Dup Designation {ts}"},
    )
    dup_desig_ok = st == 400 and "already exists" in tx
    results.append(CaseResult("HR-UAT-007", "Pass" if dup_desig_ok else "Fail", f"status={st}"))

    # HR-UAT-008 employee create required
    emp_code = f"UATE{ts}"
    st, _, emp = _request(
        "POST",
        "/api/v1/hr/employees",
        headers=headers,
        body={"employee_code": emp_code, "first_name": "UAT", "department_id": new_dep_id, "designation_id": new_desig_id},
    )
    e_create_ok = _is_pass(st) and isinstance(emp, dict) and emp.get("employee_code") == emp_code
    results.append(CaseResult("HR-UAT-008", "Pass" if e_create_ok else "Fail", f"status={st}"))
    new_emp_id = emp["id"] if isinstance(emp, dict) and emp.get("id") else manager_emp_id

    # HR-UAT-009 optional fields
    st, _, emp2 = _request(
        "PATCH",
        f"/api/v1/hr/employees/{new_emp_id}",
        headers=headers,
        body={"last_name": "User", "email": f"uat.{ts}@p7.local", "phone": "+8801999999999", "joining_date": "2026-03-12"},
    )
    opt_ok = _is_pass(st) and isinstance(emp2, dict) and emp2.get("email", "").startswith("uat.")
    results.append(CaseResult("HR-UAT-009", "Pass" if opt_ok else "Fail", f"status={st}"))

    # HR-UAT-010 mapping
    map_ok = isinstance(emp2, dict) and emp2.get("department_id") == new_dep_id and emp2.get("designation_id") == new_desig_id
    results.append(CaseResult("HR-UAT-010", "Pass" if map_ok else "Fail", "department/designation mapping check"))

    # HR-UAT-011 search
    st, _, e_search = _request("GET", f"/api/v1/hr/employees?search={emp_code}", headers=headers)
    search_ok = _is_pass(st) and isinstance(e_search, list) and any((x.get("employee_code") == emp_code) for x in e_search)
    results.append(CaseResult("HR-UAT-011", "Pass" if search_ok else "Fail", f"status={st}"))

    # HR-UAT-014 + 012 deactivate/activate + active filter
    st_d, _, emp_d = _request("POST", f"/api/v1/hr/employees/{new_emp_id}/deactivate", headers=headers, body={})
    st_a1, _, list_active = _request("GET", "/api/v1/hr/employees?active_only=true", headers=headers)
    hidden_when_inactive = _is_pass(st_a1) and isinstance(list_active, list) and all(x.get("id") != new_emp_id for x in list_active)
    st_u, _, emp_u = _request("POST", f"/api/v1/hr/employees/{new_emp_id}/activate", headers=headers, body={})
    st_a2, _, list_active2 = _request("GET", f"/api/v1/hr/employees?search={emp_code}", headers=headers)
    shown_when_active = _is_pass(st_a2) and isinstance(list_active2, list) and any(x.get("id") == new_emp_id for x in list_active2)
    act_ok = _is_pass(st_d) and _is_pass(st_u) and isinstance(emp_d, dict) and isinstance(emp_u, dict) and (emp_d.get("is_active") is False) and (emp_u.get("is_active") is True)
    results.append(CaseResult("HR-UAT-014", "Pass" if act_ok else "Fail", f"deactivate={st_d}, activate={st_u}"))
    results.append(CaseResult("HR-UAT-012", "Pass" if (hidden_when_inactive and shown_when_active) else "Fail", "active filter behavior"))

    # HR-UAT-013 detail edit
    st_g, _, detail = _request("GET", f"/api/v1/hr/employees/{new_emp_id}", headers=headers)
    st_p, _, detail2 = _request("PATCH", f"/api/v1/hr/employees/{new_emp_id}", headers=headers, body={"city": "Dhaka UAT"})
    detail_ok = _is_pass(st_g) and _is_pass(st_p) and isinstance(detail2, dict) and detail2.get("city") == "Dhaka UAT"
    results.append(CaseResult("HR-UAT-013", "Pass" if detail_ok else "Fail", f"get={st_g}, patch={st_p}"))

    # HR-UAT-015 self manager check
    st, tx, _ = _request("PATCH", f"/api/v1/hr/employees/{new_emp_id}", headers=headers, body={"reporting_manager_id": new_emp_id})
    self_mgr_ok = st == 400 and "self" in tx.lower()
    results.append(CaseResult("HR-UAT-015", "Pass" if self_mgr_ok else "Fail", f"status={st}"))

    # HR-UAT-019 invalid FK
    st, tx, _ = _request(
        "POST",
        "/api/v1/hr/employees",
        headers=headers,
        body={"employee_code": f"UATBAD{ts}", "first_name": "Bad", "department_id": 999999999},
    )
    fk_ok = st in {400, 404}
    results.append(CaseResult("HR-UAT-019", "Pass" if fk_ok else "Fail", f"status={st}"))

    # HR-UAT-021 shift CRUD
    shift_code = f"UATS{ts}"
    st, _, sh = _request(
        "POST",
        "/api/v1/hr/attendance/shifts",
        headers=headers,
        body={"code": shift_code, "name": "UAT Shift", "start_time": "08:00:00", "end_time": "17:00:00"},
    )
    shift_id = sh.get("id") if isinstance(sh, dict) else None
    st2, _, sh2 = _request("PATCH", f"/api/v1/hr/attendance/shifts/{shift_id}", headers=headers, body={"name": "UAT Shift Updated"})
    st3, _, shl = _request("GET", "/api/v1/hr/attendance/shifts", headers=headers)
    shift_ok = _is_pass(st) and _is_pass(st2) and _is_pass(st3) and isinstance(shl, list) and any(x.get("code") == shift_code for x in shl)
    results.append(CaseResult("HR-UAT-021", "Pass" if shift_ok else "Fail", f"create={st}, edit={st2}, list={st3}"))

    # HR-UAT-024 leave type + policy
    leave_code = f"UL{ts}"[:24]
    st, _, lt = _request("POST", "/api/v1/hr/leave/types", headers=headers, body={"code": leave_code, "name": f"UAT Leave {ts}"})
    lt_id = lt.get("id") if isinstance(lt, dict) else None
    st2, _, pol = _request(
        "POST",
        "/api/v1/hr/leave/policies",
        headers=headers,
        body={"leave_type_id": lt_id, "employment_type": "FULL_TIME", "annual_quota_days": "12", "max_carry_forward_days": "5", "effective_from": "2026-01-01"},
    )
    leave_setup_ok = _is_pass(st) and _is_pass(st2)
    results.append(CaseResult("HR-UAT-024", "Pass" if leave_setup_ok else "Fail", f"type={st}, policy={st2}"))

    # HR-UAT-026 leave balance impact
    st0, _, bal0 = _request("GET", f"/api/v1/hr/leave/balances?employee_id={new_emp_id}&balance_year=2026", headers=headers)
    before_used = 0.0
    if _is_pass(st0) and isinstance(bal0, list):
        row = next((x for x in bal0 if int(x.get("leave_type_id", 0)) == int(lt_id)), None)
        if row:
            try:
                before_used = float(row.get("used_days", "0") or 0)
            except Exception:
                before_used = 0.0
    _request(
        "POST",
        "/api/v1/hr/leave/balances/upsert",
        headers=headers,
        body={"employee_id": new_emp_id, "leave_type_id": lt_id, "balance_year": 2026, "allocated_days": "12", "used_days": f"{before_used:.2f}", "pending_days": "0", "closing_balance_days": "12"},
    )
    st1, _, req = _request(
        "POST",
        "/api/v1/hr/leave/requests",
        headers=headers,
        body={"employee_id": new_emp_id, "leave_type_id": lt_id, "from_date": "2026-03-20", "to_date": "2026-03-20", "days_requested": "1", "reason": "UAT"},
    )
    req_id = req.get("id") if isinstance(req, dict) else None
    st2, _, _ = _request("POST", f"/api/v1/hr/leave/requests/{req_id}/submit", headers=headers, body={})
    st3, _, _ = _request("POST", f"/api/v1/hr/leave/requests/{req_id}/approve", headers=headers, body={"note": "ok"})
    st4, _, bal1 = _request("GET", f"/api/v1/hr/leave/balances?employee_id={new_emp_id}&balance_year=2026", headers=headers)
    after_used = before_used
    if _is_pass(st4) and isinstance(bal1, list):
        row = next((x for x in bal1 if int(x.get("leave_type_id", 0)) == int(lt_id)), None)
        if row:
            try:
                after_used = float(row.get("used_days", "0") or 0)
            except Exception:
                pass
    bal_ok = _is_pass(st1) and _is_pass(st2) and _is_pass(st3) and after_used > before_used
    results.append(CaseResult("HR-UAT-026", "Pass" if bal_ok else "Fail", f"before_used={before_used}, after_used={after_used}"))

    # HR-UAT-027 payroll setup structures
    comp_code = f"UC{ts}"[:24]
    st1, _, comp = _request(
        "POST",
        "/api/v1/hr/payroll/components",
        headers=headers,
        body={"code": comp_code, "name": f"UAT Component {ts}", "component_type": "EARNING", "calculation_type": "FIXED", "default_amount": "1000"},
    )
    comp_id = comp.get("id") if isinstance(comp, dict) else None
    str_code = f"US{ts}"[:24]
    st2, _, stc = _request("POST", "/api/v1/hr/payroll/structures", headers=headers, body={"code": str_code, "name": f"UAT Structure {ts}"})
    st_id = stc.get("id") if isinstance(stc, dict) else None
    st3, _, _ = _request(
        "POST",
        f"/api/v1/hr/payroll/structures/{st_id}/lines",
        headers=headers,
        body={"component_id": comp_id, "amount": "1000", "sort_order": 1},
    )
    payroll_setup_ok = _is_pass(st1) and _is_pass(st2) and _is_pass(st3)
    results.append(CaseResult("HR-UAT-027", "Pass" if payroll_setup_ok else "Fail", f"component={st1}, structure={st2}, line={st3}"))

    # HR-UAT-032 performance flow
    st1, _, cyc = _request(
        "POST",
        "/api/v1/hr/performance/cycles",
        headers=headers,
        body={"name": f"UAT Cycle {ts}", "start_date": "2026-01-01", "end_date": "2026-03-31"},
    )
    cyc_id = cyc.get("id") if isinstance(cyc, dict) else None
    st2, _, goal = _request(
        "POST",
        "/api/v1/hr/performance/goals",
        headers=headers,
        body={"cycle_id": cyc_id, "employee_id": new_emp_id, "title": f"UAT Goal {ts}", "weight": 25},
    )
    goal_id = goal.get("id") if isinstance(goal, dict) else None
    st3, _, _ = _request("POST", f"/api/v1/hr/performance/goals/{goal_id}/submit", headers=headers, body={"manager_comment": "ok"})
    st4, _, rv = _request(
        "POST",
        "/api/v1/hr/performance/reviews",
        headers=headers,
        body={"cycle_id": cyc_id, "employee_id": new_emp_id, "review_type": "manager", "manager_rating": 4.0, "final_rating": 4.0},
    )
    rv_id = rv.get("id") if isinstance(rv, dict) else None
    st5, _, _ = _request("POST", f"/api/v1/hr/performance/reviews/{rv_id}/submit", headers=headers, body={"final_rating": 4.2, "manager_comment": "good"})
    perf_ok = all(_is_pass(x) for x in [st1, st2, st3, st4, st5])
    results.append(CaseResult("HR-UAT-032", "Pass" if perf_ok else "Fail", f"statuses={st1}/{st2}/{st3}/{st4}/{st5}"))

    # HR-UAT-033 recruitment flow
    st1, _, rq = _request(
        "POST",
        "/api/v1/hr/recruitment/requisitions",
        headers=headers,
        body={"title": f"UAT Requisition {ts}", "department_id": new_dep_id, "vacancy_count": 1},
    )
    rq_id = rq.get("id") if isinstance(rq, dict) else None
    st2, _, cd = _request(
        "POST",
        "/api/v1/hr/recruitment/candidates",
        headers=headers,
        body={"requisition_id": rq_id, "full_name": f"Candidate {ts}", "email": f"cand.{ts}@p7.local"},
    )
    cd_id = cd.get("id") if isinstance(cd, dict) else None
    st3, _, iv = _request(
        "POST",
        "/api/v1/hr/recruitment/interviews",
        headers=headers,
        body={"candidate_id": cd_id, "requisition_id": rq_id, "scheduled_at": "2026-03-18T11:00:00", "mode": "onsite"},
    )
    iv_id = iv.get("id") if isinstance(iv, dict) else None
    st4, _, _ = _request(
        "POST",
        f"/api/v1/hr/recruitment/interviews/{iv_id}/status",
        headers=headers,
        body={"status": "completed", "feedback": "good", "rating": 4.0},
    )
    st5, _, off = _request(
        "POST",
        "/api/v1/hr/recruitment/offers",
        headers=headers,
        body={"candidate_id": cd_id, "requisition_id": rq_id, "offered_role": "Executive", "proposed_salary": 45000},
    )
    rec_ok = all(_is_pass(x) for x in [st1, st2, st3, st4, st5])
    results.append(CaseResult("HR-UAT-033", "Pass" if rec_ok else "Fail", f"statuses={st1}/{st2}/{st3}/{st4}/{st5}"))

    # HR-UAT-035 reports load
    st1, _, _ = _request("GET", "/api/v1/hr/reports/summary", headers=headers)
    st2, _, _ = _request("GET", "/api/v1/hr/reports/attendance", headers=headers)
    st3, _, _ = _request("GET", "/api/v1/hr/reports/leave", headers=headers)
    st4, _, _ = _request("GET", "/api/v1/hr/reports/payroll", headers=headers)
    reports_ok = all(_is_pass(x) for x in [st1, st2, st3, st4])
    results.append(CaseResult("HR-UAT-035", "Pass" if reports_ok else "Fail", f"statuses={st1}/{st2}/{st3}/{st4}"))

    print("HR extended API verification")
    print(f"Base URL: {BASE_URL}")
    for row in results:
        print(f"- {row.test_id}: {row.status} | {row.note}")


if __name__ == "__main__":
    asyncio.run(main())
