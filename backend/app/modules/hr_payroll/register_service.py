"""Frozen payroll documents: department-wise salary sheets, top sheet, wage register and private slips.

A snapshot is taken only from a FINALIZED / APPROVED / POSTED run. Every printed document is drawn
from the snapshot (never from live rows), so later edits cannot change an issued sheet or slip.
Totals are reconciled to the run before the snapshot is stored.
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant
from app.models.hr import Department, Designation, Employee
from app.models.hr_lifecycle import HrPayrollDocumentSnapshot
from app.models.hr_payroll import (
    PayrollCalculationSnapshot,
    PayrollPeriod,
    PayrollRun,
    PayrollRunLine,
    PayrollStructure,
)

SNAPSHOT_RUN_STATUSES = ("FINALIZED", "APPROVED", "POSTED")
UNASSIGNED = "Unassigned"
ZERO = Decimal("0")


def _d(value: Any) -> Decimal:
    try:
        return Decimal(str(value if value is not None else "0"))
    except Exception:
        return ZERO


def _s(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01")))


async def build_snapshot(db: AsyncSession, tenant: Tenant, run: PayrollRun) -> dict[str, Any]:
    period = await db.get(PayrollPeriod, run.period_id)
    lines = (
        await db.execute(
            select(PayrollRunLine).where(PayrollRunLine.tenant_id == tenant.id, PayrollRunLine.run_id == run.id)
        )
    ).scalars().all()
    emp_ids = [ln.employee_id for ln in lines]
    employees = {
        e.id: e for e in (await db.execute(select(Employee).where(Employee.tenant_id == tenant.id, Employee.id.in_(emp_ids or [0])))).scalars()
    }
    depts = {d.id: d.name for d in (await db.execute(select(Department).where(Department.tenant_id == tenant.id))).scalars()}
    desigs = {d.id: d.title for d in (await db.execute(select(Designation).where(Designation.tenant_id == tenant.id))).scalars()}
    structures = {s.id: s.code for s in (await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id))).scalars()}
    latest_ids = (
        select(func.max(PayrollCalculationSnapshot.id))
        .where(
            PayrollCalculationSnapshot.tenant_id == tenant.id,
            PayrollCalculationSnapshot.payroll_run_line_id.in_([ln.id for ln in lines] or [0]),
        )
        .group_by(PayrollCalculationSnapshot.payroll_run_line_id)
    )
    calc = {
        s.payroll_run_line_id: s
        for s in (await db.execute(select(PayrollCalculationSnapshot).where(PayrollCalculationSnapshot.id.in_(latest_ids)))).scalars()
    }

    order: list[dict[str, str]] = []
    seen: set[str] = set()
    out_lines: list[dict[str, Any]] = []
    for ln in sorted(lines, key=lambda x: (employees[x.employee_id].employee_code if x.employee_id in employees else "")):
        emp = employees.get(ln.employee_id)
        snap = calc.get(ln.id)
        trace = (snap.trace_json or {}) if snap else {}
        comps: dict[str, str] = {}
        if ln.calculation_source == "AUTO" and trace.get("components"):
            for comp in trace["components"]:
                code = str(comp.get("code") or "")
                if not code:
                    continue
                if code not in seen:
                    seen.add(code)
                    order.append({"code": code, "type": str(comp.get("component_type") or "EARNING")})
                comps[code] = _s(_d(comps.get(code)) + _d(comp.get("amount")))
        out_lines.append(
            {
                "run_line_id": ln.id,
                "employee_id": ln.employee_id,
                "employee_code": emp.employee_code if emp else str(ln.employee_id),
                "name": " ".join(p for p in ((emp.first_name, emp.last_name) if emp else ()) if p),
                "department_id": emp.department_id if emp else None,
                "department": depts.get(emp.department_id, UNASSIGNED) if emp and emp.department_id else UNASSIGNED,
                "designation": desigs.get(emp.designation_id, "") if emp and emp.designation_id else "",
                "grade": structures.get(ln.structure_id, "") if ln.structure_id else "",
                "days_present": _s(_d(snap.attendance_days if snap else 0)),
                "absent_days": _s(_d(snap.absent_days if snap else 0)),
                "paid_leave_days": _s(_d(snap.leave_days_paid if snap else 0)),
                "unpaid_leave_days": _s(_d(snap.leave_days_unpaid if snap else 0)),
                "ot_hours": _s(_d(snap.ot_hours if snap else 0)),
                "ot_amount": _s(_d(ln.overtime_amount)),
                "basic": _s(_d(snap.base_salary_applied if snap else 0)),
                "components": comps,
                "source": ln.calculation_source,
                "gross": _s(_d(ln.gross_pay)),
                "deductions": _s(_d(ln.deductions)),
                "net": _s(_d(ln.net_pay)),
            }
        )
    totals = {
        "employees": len(out_lines),
        "gross": _s(sum((_d(x["gross"]) for x in out_lines), ZERO)),
        "deductions": _s(sum((_d(x["deductions"]) for x in out_lines), ZERO)),
        "net": _s(sum((_d(x["net"]) for x in out_lines), ZERO)),
        "ot_amount": _s(sum((_d(x["ot_amount"]) for x in out_lines), ZERO)),
    }
    reconciled = (
        _d(totals["gross"]) == _d(run.gross_total).quantize(Decimal("0.01"))
        and _d(totals["net"]) == _d(run.net_total).quantize(Decimal("0.01"))
        and _d(totals["deductions"]) == _d(run.deduction_total).quantize(Decimal("0.01"))
    )
    return {
        "company": getattr(tenant, "name", None) or "Company",
        "run": {
            "id": run.id,
            "run_code": run.run_code,
            "status": run.status,
            "period_code": period.period_code if period else "",
            "start_date": period.start_date.isoformat() if period else None,
            "end_date": period.end_date.isoformat() if period else None,
            "payment_date": period.payment_date.isoformat() if period else None,
            "run_gross": _s(_d(run.gross_total)),
            "run_deductions": _s(_d(run.deduction_total)),
            "run_net": _s(_d(run.net_total)),
        },
        "component_order": order,
        "lines": out_lines,
        "totals": totals,
        "reconciled": reconciled,
    }


def snapshot_hash(data: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


async def active_snapshot(db: AsyncSession, tenant_id: int, run_id: int) -> HrPayrollDocumentSnapshot | None:
    return (
        await db.execute(
            select(HrPayrollDocumentSnapshot).where(
                HrPayrollDocumentSnapshot.tenant_id == tenant_id,
                HrPayrollDocumentSnapshot.payroll_run_id == run_id,
                HrPayrollDocumentSnapshot.status == "ACTIVE",
            )
        )
    ).scalar_one_or_none()


async def freeze_run(db: AsyncSession, tenant: Tenant, run: PayrollRun, user_id: int | None) -> tuple[HrPayrollDocumentSnapshot, bool]:
    """Return the run's active snapshot, creating it when missing. ``run`` must be locked by the caller.

    Second value is True when a new snapshot was written (caller audits and commits).
    """
    if run.status not in SNAPSHOT_RUN_STATUSES:
        raise HTTPException(status_code=409, detail=f"Only a {' / '.join(SNAPSHOT_RUN_STATUSES)} run can be frozen (run is {run.status})")
    existing = await active_snapshot(db, tenant.id, run.id)
    if existing is not None:
        return existing, False
    data = await build_snapshot(db, tenant, run)
    if not data["reconciled"]:
        raise HTTPException(status_code=409, detail="Run lines do not add up to the run totals; finalize the run again")
    snap = HrPayrollDocumentSnapshot(
        tenant_id=tenant.id, payroll_run_id=run.id, status="ACTIVE", snapshot_json=data,
        content_sha256=snapshot_hash(data), generated_by=user_id,
    )
    db.add(snap)
    await db.flush()
    return snap, True


async def invalidate_snapshots(db: AsyncSession, tenant_id: int, run_id: int, reason: str) -> None:
    await db.execute(
        update(HrPayrollDocumentSnapshot)
        .where(
            HrPayrollDocumentSnapshot.tenant_id == tenant_id,
            HrPayrollDocumentSnapshot.payroll_run_id == run_id,
            HrPayrollDocumentSnapshot.status == "ACTIVE",
        )
        .values(status="INVALIDATED", invalidated_at=datetime.utcnow(), invalidated_reason=reason[:255])
    )


# --- Department sheets + top sheet ---------------------------------------------------------------

SUM_FIELDS = ("days_present", "absent_days", "paid_leave_days", "unpaid_leave_days", "ot_hours", "ot_amount", "gross", "deductions", "net")


def department_sheets(data: dict[str, Any], department_id: int | None = None) -> dict[str, Any]:
    """Group lines by department; ``top_sheet`` has one row per department plus a grand total."""
    earning_codes = [c["code"] for c in data["component_order"] if c["type"] != "DEDUCTION"]
    deduction_codes = [c["code"] for c in data["component_order"] if c["type"] == "DEDUCTION"]
    groups: dict[str, list[dict[str, Any]]] = {}
    for ln in data["lines"]:
        if department_id is not None and ln["department_id"] != department_id:
            continue
        groups.setdefault(ln["department"], []).append(ln)

    def _sum(rows: list[dict[str, Any]]) -> dict[str, Any]:
        out: dict[str, Any] = {"employees": len(rows)}
        for f in SUM_FIELDS:
            out[f] = _s(sum((_d(r[f]) for r in rows), ZERO))
        out["components"] = {c: _s(sum((_d(r["components"].get(c)) for r in rows), ZERO)) for c in earning_codes + deduction_codes}
        return out

    names = sorted(groups, key=lambda n: (n == UNASSIGNED, n))
    sections = [{"department": n, "lines": groups[n], "subtotal": _sum(groups[n])} for n in names]
    all_rows = [r for n in names for r in groups[n]]
    return {
        "earning_codes": earning_codes,
        "deduction_codes": deduction_codes,
        "sections": sections,
        "top_sheet": {"rows": [{"department": s["department"], **s["subtotal"]} for s in sections], "grand_total": _sum(all_rows)},
    }


# --- PDF rendering -------------------------------------------------------------------------------


def _pdf_doc(buf: io.BytesIO, title: str):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate

    return SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=8 * mm, rightMargin=8 * mm, topMargin=10 * mm, bottomMargin=10 * mm, title=title)


def _table(rows: list[list[str]], *, bold_last: bool = False):
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle

    t = Table(rows, repeatRows=1)
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", 6.5),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 6.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    if bold_last:
        style.append(("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 6.5))
    t.setStyle(TableStyle(style))
    return t


def _heading(data: dict[str, Any], title: str):
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph

    st = getSampleStyleSheet()
    r = data["run"]
    return [
        Paragraph(f"<b>{data['company']}</b>", st["Heading3"]),
        Paragraph(f"{title} — {r['period_code']} ({r['start_date']} to {r['end_date']}), run {r['run_code']}, payment {r['payment_date']}", st["Normal"]),
    ]


def _short(code: str) -> str:
    return code.replace("BD-", "")[:10]


def salary_sheet_pdf(data: dict[str, Any], department_id: int | None = None) -> bytes:
    from reportlab.platypus import PageBreak, Spacer

    sheets = department_sheets(data, department_id)
    earn, ded = sheets["earning_codes"], sheets["deduction_codes"]
    buf = io.BytesIO()
    story: list[Any] = []
    story += _heading(data, "TOP SHEET — salary / wages summary by department")
    head = ["Department", "Emp", "Present", "Absent", "Leave", "OT hrs", "OT amt", *[_short(c) for c in earn], "Gross", "Deduct", "Net"]
    rows = [head]
    for r in sheets["top_sheet"]["rows"] + [{"department": "GRAND TOTAL", **sheets["top_sheet"]["grand_total"]}]:
        leave = _s(_d(r["paid_leave_days"]) + _d(r["unpaid_leave_days"]))
        rows.append([r["department"], str(r["employees"]), r["days_present"], r["absent_days"], leave, r["ot_hours"], r["ot_amount"],
                     *[r["components"].get(c, "0.00") for c in earn], r["gross"], r["deductions"], r["net"]])
    story += [Spacer(1, 6), _table(rows, bold_last=True)]
    if not data.get("reconciled"):
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph

        story.append(Paragraph("<b>WARNING: snapshot totals do not match the payroll run totals.</b>", getSampleStyleSheet()["Normal"]))
    for section in sheets["sections"]:
        story.append(PageBreak())
        story += _heading(data, f"SALARY / WAGE SHEET — {section['department']}")
        head = ["Emp No", "Name", "Designation", "Grade", "Present", "Absent", "Leave", "OT hrs", "Basic",
                *[_short(c) for c in earn if c != "BD-BASIC"], "OT amt", "Gross", *[_short(c) for c in ded], "Deduct", "Net", "Signature"]
        rows = [head]
        for ln in section["lines"]:
            leave = _s(_d(ln["paid_leave_days"]) + _d(ln["unpaid_leave_days"]))
            rows.append([ln["employee_code"], ln["name"][:22], ln["designation"][:18], _short(ln["grade"]), ln["days_present"],
                         ln["absent_days"], leave, ln["ot_hours"], ln["components"].get("BD-BASIC", ln["basic"]),
                         *[ln["components"].get(c, "0.00") for c in earn if c != "BD-BASIC"], ln["ot_amount"], ln["gross"],
                         *[ln["components"].get(c, "0.00") for c in ded], ln["deductions"], ln["net"], ""])
        sub = section["subtotal"]
        rows.append(["SUBTOTAL", f"{sub['employees']} employees", "", "", sub["days_present"], sub["absent_days"],
                     _s(_d(sub["paid_leave_days"]) + _d(sub["unpaid_leave_days"])), sub["ot_hours"],
                     sub["components"].get("BD-BASIC", ""), *[sub["components"].get(c, "0.00") for c in earn if c != "BD-BASIC"],
                     sub["ot_amount"], sub["gross"], *[sub["components"].get(c, "0.00") for c in ded], sub["deductions"], sub["net"], ""])
        story += [Spacer(1, 6), _table(rows, bold_last=True)]
    _pdf_doc(buf, "Salary sheet").build(story)
    return buf.getvalue()


def wage_register_pdf(data: dict[str, Any]) -> bytes:
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, Spacer

    buf = io.BytesIO()
    st = getSampleStyleSheet()
    story: list[Any] = _heading(data, "WAGE REGISTER (restricted — HR / payment staff only)")
    story.append(Paragraph(
        "Prime7 layout aligned to Labour Rules 2015 Form-38. Verify the column layout against the official form "
        "before inspection. Cash payments: revenue-stamp signature in the last column.", st["Italic"]))
    rows = [["#", "Emp No", "Name", "Designation", "Grade", "Days", "Basic", "Gross", "OT", "Deduct", "Net payable", "Signature / stamp"]]
    for i, ln in enumerate(data["lines"], 1):
        rows.append([str(i), ln["employee_code"], ln["name"][:24], ln["designation"][:20], _short(ln["grade"]), ln["days_present"],
                     ln["components"].get("BD-BASIC", ln["basic"]), ln["gross"], ln["ot_amount"], ln["deductions"], ln["net"], ""])
    t = data["totals"]
    rows.append(["", "TOTAL", f"{t['employees']} employees", "", "", "", "", t["gross"], t["ot_amount"], t["deductions"], t["net"], ""])
    story += [Spacer(1, 6), _table(rows, bold_last=True)]
    _pdf_doc(buf, "Wage register").build(story)
    return buf.getvalue()


def payslip_pdf(data: dict[str, Any], line: dict[str, Any]) -> bytes:
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = io.BytesIO()
    st = getSampleStyleSheet()
    r = data["run"]
    story: list[Any] = [
        Paragraph(f"<b>{data['company']}</b> — Wage slip", st["Heading4"]),
        Paragraph(f"{r['period_code']} ({r['start_date']} to {r['end_date']}) · payment {r['payment_date']}", st["Normal"]),
        Paragraph(f"{line['employee_code']} · {line['name']} · {line['designation']} · {line['department']}", st["Normal"]),
        Spacer(1, 6),
    ]
    rows = [["Item", "Amount"], ["Days present", line["days_present"]], ["Absent days", line["absent_days"]],
            ["Leave (paid / unpaid)", f"{line['paid_leave_days']} / {line['unpaid_leave_days']}"], ["OT hours", line["ot_hours"]]]
    for code, amount in line["components"].items():
        rows.append([code.replace("BD-", ""), amount])
    rows += [["Gross", line["gross"]], ["Deductions", line["deductions"]], ["NET PAYABLE", line["net"]]]
    story.append(_table(rows, bold_last=True))
    SimpleDocTemplate(buf, pagesize=A5).build(story)
    return buf.getvalue()


def payslips_zip(data: dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for ln in data["lines"]:
            zf.writestr(f"wage-slip-{data['run']['period_code']}-{ln['employee_code']}.pdf", payslip_pdf(data, ln))
    return buf.getvalue()
