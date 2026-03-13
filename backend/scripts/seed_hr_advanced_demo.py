"""
Advanced HR seed (idempotent) for P7 ERP.

Run inside backend container:
  python scripts/seed_hr_advanced_demo.py
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date, datetime, time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import (
    AttendanceEntry,
    AttendanceHoliday,
    AttendanceRegularizationRequest,
    AttendanceRoster,
    AttendanceShift,
    Candidate,
    Department,
    Employee,
    EmployeeTicket,
    EssPreference,
    Interview,
    JobRequisition,
    LeaveBalance,
    LeavePolicy,
    LeaveRequest,
    LeaveType,
    Offer,
    PayrollApproval,
    PayrollComponent,
    PayrollPayslip,
    PayrollPeriod,
    PayrollPosting,
    PayrollRun,
    PayrollRunLine,
    PayrollStructure,
    PayrollStructureLine,
    PerformanceCycle,
    PerformanceGoal,
    PerformanceReview,
    Tenant,
    User,
)

LAKHSMA_CODE = "LAKHSMA4821"


async def _get_tenant(db: AsyncSession) -> Tenant:
    tenant = (await db.execute(select(Tenant).where(Tenant.company_code == LAKHSMA_CODE))).scalar_one_or_none()
    if tenant:
        return tenant
    tenant = (await db.execute(select(Tenant).order_by(Tenant.id.asc()))).scalar_one_or_none()
    if not tenant:
        raise RuntimeError("No tenant found")
    return tenant


async def _get_user(db: AsyncSession, tenant_id: int) -> User:
    user = (
        await db.execute(select(User).where(User.tenant_id == tenant_id).order_by(User.id.asc()))
    ).scalar_one_or_none()
    if not user:
        raise RuntimeError("No user found in tenant")
    return user


async def _get_employees(db: AsyncSession, tenant_id: int) -> list[Employee]:
    rows = (
        await db.execute(
            select(Employee).where(Employee.tenant_id == tenant_id).order_by(Employee.id.asc())
        )
    ).scalars().all()
    if not rows:
        raise RuntimeError("No employees found. Run scripts/seed_hr_demo.py first.")
    return rows


async def main() -> None:
    async with AsyncSessionLocal() as db:
        tenant = await _get_tenant(db)
        user = await _get_user(db, tenant.id)
        employees = await _get_employees(db, tenant.id)
        emp_a = employees[0]
        emp_b = employees[min(1, len(employees) - 1)]

        # Attendance
        shift = (
            await db.execute(
                select(AttendanceShift).where(
                    AttendanceShift.tenant_id == tenant.id,
                    AttendanceShift.code == "GEN-09",
                )
            )
        ).scalar_one_or_none()
        if not shift:
            shift = AttendanceShift(
                tenant_id=tenant.id,
                code="GEN-09",
                name="General Shift",
                start_time=time(9, 0),
                end_time=time(18, 0),
                grace_in_minutes=10,
                break_minutes=60,
                is_night_shift=False,
                is_active=True,
            )
            db.add(shift)
            await db.flush()

        roster = (
            await db.execute(
                select(AttendanceRoster).where(
                    AttendanceRoster.tenant_id == tenant.id,
                    AttendanceRoster.employee_id == emp_a.id,
                    AttendanceRoster.roster_date == date(2026, 3, 12),
                )
            )
        ).scalar_one_or_none()
        if not roster:
            db.add(
                AttendanceRoster(
                    tenant_id=tenant.id,
                    employee_id=emp_a.id,
                    roster_date=date(2026, 3, 12),
                    shift_id=shift.id,
                    is_week_off=False,
                    note="Seed roster",
                    created_by=user.id,
                )
            )

        holiday = (
            await db.execute(
                select(AttendanceHoliday).where(
                    AttendanceHoliday.tenant_id == tenant.id,
                    AttendanceHoliday.holiday_date == date(2026, 3, 26),
                )
            )
        ).scalar_one_or_none()
        if not holiday:
            db.add(
                AttendanceHoliday(
                    tenant_id=tenant.id,
                    holiday_date=date(2026, 3, 26),
                    name="Independence Day",
                    is_optional=False,
                    note="Seed holiday",
                )
            )

        entry = (
            await db.execute(
                select(AttendanceEntry).where(
                    AttendanceEntry.tenant_id == tenant.id,
                    AttendanceEntry.employee_id == emp_a.id,
                    AttendanceEntry.attendance_date == date(2026, 3, 12),
                )
            )
        ).scalar_one_or_none()
        if not entry:
            entry = AttendanceEntry(
                tenant_id=tenant.id,
                employee_id=emp_a.id,
                attendance_date=date(2026, 3, 12),
                in_time=time(9, 8),
                out_time=time(18, 10),
                status="LATE",
                source="MANUAL",
                late_minutes=8,
                early_out_minutes=0,
                overtime_minutes=10,
                remarks="Seed attendance",
                created_by=user.id,
            )
            db.add(entry)
            await db.flush()

        reg = (
            await db.execute(
                select(AttendanceRegularizationRequest).where(
                    AttendanceRegularizationRequest.tenant_id == tenant.id,
                    AttendanceRegularizationRequest.attendance_entry_id == entry.id,
                )
            )
        ).scalar_one_or_none()
        if not reg:
            db.add(
                AttendanceRegularizationRequest(
                    tenant_id=tenant.id,
                    attendance_entry_id=entry.id,
                    requested_in_time=time(9, 0),
                    requested_out_time=time(18, 15),
                    reason="Traffic delay",
                    status="APPROVED",
                    requested_by=user.id,
                    approved_by=user.id,
                    decision_note="Approved in seed",
                    decided_at=datetime.now(),
                )
            )

        # Leave
        leave_type = (
            await db.execute(
                select(LeaveType).where(
                    LeaveType.tenant_id == tenant.id,
                    LeaveType.code == "CL",
                )
            )
        ).scalar_one_or_none()
        if not leave_type:
            leave_type = LeaveType(
                tenant_id=tenant.id,
                code="CL",
                name="Casual Leave",
                is_paid=True,
                requires_approval=True,
                is_active=True,
            )
            db.add(leave_type)
            await db.flush()

        policy = (
            await db.execute(
                select(LeavePolicy).where(
                    LeavePolicy.tenant_id == tenant.id,
                    LeavePolicy.leave_type_id == leave_type.id,
                    LeavePolicy.effective_from == date(2026, 1, 1),
                )
            )
        ).scalar_one_or_none()
        if not policy:
            db.add(
                LeavePolicy(
                    tenant_id=tenant.id,
                    leave_type_id=leave_type.id,
                    employment_type="FULL_TIME",
                    annual_quota_days="12",
                    max_carry_forward_days="5",
                    effective_from=date(2026, 1, 1),
                    effective_to=None,
                    is_active=True,
                )
            )

        balance = (
            await db.execute(
                select(LeaveBalance).where(
                    LeaveBalance.tenant_id == tenant.id,
                    LeaveBalance.employee_id == emp_a.id,
                    LeaveBalance.leave_type_id == leave_type.id,
                    LeaveBalance.balance_year == 2026,
                )
            )
        ).scalar_one_or_none()
        if not balance:
            db.add(
                LeaveBalance(
                    tenant_id=tenant.id,
                    employee_id=emp_a.id,
                    leave_type_id=leave_type.id,
                    balance_year=2026,
                    allocated_days="12",
                    used_days="2",
                    pending_days="1",
                    closing_balance_days="9",
                )
            )

        leave_req = (
            await db.execute(
                select(LeaveRequest).where(
                    LeaveRequest.tenant_id == tenant.id,
                    LeaveRequest.employee_id == emp_a.id,
                    LeaveRequest.from_date == date(2026, 3, 18),
                )
            )
        ).scalar_one_or_none()
        if not leave_req:
            db.add(
                LeaveRequest(
                    tenant_id=tenant.id,
                    employee_id=emp_a.id,
                    leave_type_id=leave_type.id,
                    from_date=date(2026, 3, 18),
                    to_date=date(2026, 3, 18),
                    days_requested="1",
                    reason="Family event",
                    status="APPROVED",
                    requested_by=user.id,
                    approved_by=user.id,
                    approved_at=datetime.now(),
                    approval_note="Approved in seed",
                )
            )

        # Payroll
        comp_basic = (
            await db.execute(
                select(PayrollComponent).where(
                    PayrollComponent.tenant_id == tenant.id,
                    PayrollComponent.code == "BASIC",
                )
            )
        ).scalar_one_or_none()
        if not comp_basic:
            comp_basic = PayrollComponent(
                tenant_id=tenant.id,
                code="BASIC",
                name="Basic Salary",
                component_type="EARNING",
                calculation_type="FIXED",
                default_amount="30000",
                is_active=True,
            )
            db.add(comp_basic)
            await db.flush()

        comp_tax = (
            await db.execute(
                select(PayrollComponent).where(
                    PayrollComponent.tenant_id == tenant.id,
                    PayrollComponent.code == "TAX",
                )
            )
        ).scalar_one_or_none()
        if not comp_tax:
            comp_tax = PayrollComponent(
                tenant_id=tenant.id,
                code="TAX",
                name="Income Tax",
                component_type="DEDUCTION",
                calculation_type="FIXED",
                default_amount="2000",
                is_active=True,
            )
            db.add(comp_tax)
            await db.flush()

        structure = (
            await db.execute(
                select(PayrollStructure).where(
                    PayrollStructure.tenant_id == tenant.id,
                    PayrollStructure.code == "STD-GEN",
                )
            )
        ).scalar_one_or_none()
        if not structure:
            structure = PayrollStructure(
                tenant_id=tenant.id,
                code="STD-GEN",
                name="Standard General",
                description="Seed structure",
                is_active=True,
            )
            db.add(structure)
            await db.flush()

        for comp, amount in [(comp_basic, "30000"), (comp_tax, "2000")]:
            line = (
                await db.execute(
                    select(PayrollStructureLine).where(
                        PayrollStructureLine.tenant_id == tenant.id,
                        PayrollStructureLine.structure_id == structure.id,
                        PayrollStructureLine.component_id == comp.id,
                    )
                )
            ).scalar_one_or_none()
            if not line:
                db.add(
                    PayrollStructureLine(
                        tenant_id=tenant.id,
                        structure_id=structure.id,
                        component_id=comp.id,
                        amount=amount,
                        formula=None,
                        sort_order=1 if comp.code == "BASIC" else 2,
                    )
                )

        period = (
            await db.execute(
                select(PayrollPeriod).where(
                    PayrollPeriod.tenant_id == tenant.id,
                    PayrollPeriod.period_code == "PR-2026-03",
                )
            )
        ).scalar_one_or_none()
        if not period:
            period = PayrollPeriod(
                tenant_id=tenant.id,
                period_code="PR-2026-03",
                start_date=date(2026, 3, 1),
                end_date=date(2026, 3, 31),
                payment_date=date(2026, 3, 28),
                status="FINALIZED",
                is_locked=False,
                finalized_by=user.id,
                finalized_at=datetime.now(),
            )
            db.add(period)
            await db.flush()

        run = (
            await db.execute(
                select(PayrollRun).where(
                    PayrollRun.tenant_id == tenant.id,
                    PayrollRun.run_code == "RUN-2026-03-A",
                )
            )
        ).scalar_one_or_none()
        if not run:
            run = PayrollRun(
                tenant_id=tenant.id,
                period_id=period.id,
                run_code="RUN-2026-03-A",
                run_date=date(2026, 3, 25),
                status="POSTED",
                gross_total="60000",
                deduction_total="4000",
                net_total="56000",
                finalized_by=user.id,
                finalized_at=datetime.now(),
                created_by=user.id,
            )
            db.add(run)
            await db.flush()

        for idx, emp in enumerate([emp_a, emp_b], start=1):
            run_line = (
                await db.execute(
                    select(PayrollRunLine).where(
                        PayrollRunLine.tenant_id == tenant.id,
                        PayrollRunLine.run_id == run.id,
                        PayrollRunLine.employee_id == emp.id,
                    )
                )
            ).scalar_one_or_none()
            if not run_line:
                run_line = PayrollRunLine(
                    tenant_id=tenant.id,
                    run_id=run.id,
                    employee_id=emp.id,
                    structure_id=structure.id,
                    gross_pay="30000",
                    deductions="2000",
                    net_pay="28000",
                    remarks="Seed payroll line",
                )
                db.add(run_line)
                await db.flush()
            slip = (
                await db.execute(
                    select(PayrollPayslip).where(
                        PayrollPayslip.tenant_id == tenant.id,
                        PayrollPayslip.payroll_run_line_id == run_line.id,
                    )
                )
            ).scalar_one_or_none()
            if not slip:
                db.add(
                    PayrollPayslip(
                        tenant_id=tenant.id,
                        payroll_run_line_id=run_line.id,
                        slip_number=f"PS-{run.id:04d}-{idx:03d}",
                        generated_by=user.id,
                        file_path=None,
                    )
                )

        approval = (
            await db.execute(
                select(PayrollApproval).where(
                    PayrollApproval.tenant_id == tenant.id,
                    PayrollApproval.payroll_run_id == run.id,
                )
            )
        ).scalar_one_or_none()
        if not approval:
            db.add(
                PayrollApproval(
                    tenant_id=tenant.id,
                    payroll_run_id=run.id,
                    action="APPROVED",
                    action_by=user.id,
                    note="Seed approval",
                )
            )

        posting = (
            await db.execute(
                select(PayrollPosting).where(
                    PayrollPosting.tenant_id == tenant.id,
                    PayrollPosting.payroll_run_id == run.id,
                )
            )
        ).scalar_one_or_none()
        if not posting:
            db.add(
                PayrollPosting(
                    tenant_id=tenant.id,
                    payroll_run_id=run.id,
                    voucher_id=None,
                    status="POSTED",
                    posted_by=user.id,
                    note="Seed posting",
                )
            )

        # Performance
        cycle = (
            await db.execute(
                select(PerformanceCycle).where(
                    PerformanceCycle.tenant_id == tenant.id,
                    PerformanceCycle.name == "Q1 2026",
                    PerformanceCycle.start_date == date(2026, 1, 1),
                )
            )
        ).scalar_one_or_none()
        if not cycle:
            cycle = PerformanceCycle(
                tenant_id=tenant.id,
                name="Q1 2026",
                description="Seed cycle",
                start_date=date(2026, 1, 1),
                end_date=date(2026, 3, 31),
                status="active",
                created_by_user_id=user.id,
            )
            db.add(cycle)
            await db.flush()

        goal = (
            await db.execute(
                select(PerformanceGoal).where(
                    PerformanceGoal.tenant_id == tenant.id,
                    PerformanceGoal.cycle_id == cycle.id,
                    PerformanceGoal.employee_id == emp_a.id,
                    PerformanceGoal.title == "Improve on-time delivery",
                )
            )
        ).scalar_one_or_none()
        if not goal:
            db.add(
                PerformanceGoal(
                    tenant_id=tenant.id,
                    cycle_id=cycle.id,
                    employee_id=emp_a.id,
                    title="Improve on-time delivery",
                    description="Increase team delivery discipline",
                    weight=30,
                    target_value="95%",
                    status="submitted",
                    manager_comment="Good progress",
                    submitted_at=datetime.now(),
                    created_by_user_id=user.id,
                )
            )

        review = (
            await db.execute(
                select(PerformanceReview).where(
                    PerformanceReview.tenant_id == tenant.id,
                    PerformanceReview.cycle_id == cycle.id,
                    PerformanceReview.employee_id == emp_a.id,
                    PerformanceReview.review_type == "manager",
                )
            )
        ).scalar_one_or_none()
        if not review:
            db.add(
                PerformanceReview(
                    tenant_id=tenant.id,
                    cycle_id=cycle.id,
                    employee_id=emp_a.id,
                    reviewer_employee_id=emp_b.id,
                    reviewer_user_id=user.id,
                    review_type="manager",
                    self_rating=3.8,
                    manager_rating=4.1,
                    final_rating=4.0,
                    employee_comment="Worked on consistency",
                    manager_comment="Strong quarter",
                    status="submitted",
                    submitted_at=datetime.now(),
                )
            )

        # Recruitment
        req = (
            await db.execute(
                select(JobRequisition).where(
                    JobRequisition.tenant_id == tenant.id,
                    JobRequisition.title == "Senior Merchandiser",
                )
            )
        ).scalar_one_or_none()
        if not req:
            dept_id = (
                await db.execute(
                    select(Department.id).where(Department.tenant_id == tenant.id).order_by(Department.id.asc())
                )
            ).scalar()
            req = JobRequisition(
                tenant_id=tenant.id,
                title="Senior Merchandiser",
                department_id=dept_id,
                requested_by_employee_id=emp_a.id,
                hiring_manager_employee_id=emp_b.id,
                vacancy_count=1,
                employment_type="FULL_TIME",
                location="Dhaka",
                budget_min=45000,
                budget_max=70000,
                description="Seed requisition",
                status="open",
                opened_at=date(2026, 3, 1),
            )
            db.add(req)
            await db.flush()

        candidate = (
            await db.execute(
                select(Candidate).where(
                    Candidate.tenant_id == tenant.id,
                    Candidate.email == "candidate.hr.seed@p7.local",
                )
            )
        ).scalar_one_or_none()
        if not candidate:
            candidate = Candidate(
                tenant_id=tenant.id,
                requisition_id=req.id,
                full_name="Nafisa Karim",
                email="candidate.hr.seed@p7.local",
                phone="+8801700999999",
                source="referral",
                current_company="ABC Apparels",
                current_designation="Merchandiser",
                expected_salary=60000,
                resume_url=None,
                stage="interview",
                status="active",
                assigned_recruiter_user_id=user.id,
                notes="Seed candidate",
            )
            db.add(candidate)
            await db.flush()

        interview = (
            await db.execute(
                select(Interview).where(
                    Interview.tenant_id == tenant.id,
                    Interview.candidate_id == candidate.id,
                )
            )
        ).scalar_one_or_none()
        if not interview:
            db.add(
                Interview(
                    tenant_id=tenant.id,
                    candidate_id=candidate.id,
                    requisition_id=req.id,
                    interviewer_employee_id=emp_b.id,
                    interviewer_user_id=user.id,
                    scheduled_at=datetime(2026, 3, 15, 11, 0, 0),
                    mode="onsite",
                    location="HQ",
                    feedback="Strong communication and planning skills",
                    rating=4.2,
                    status="completed",
                )
            )

        offer = (
            await db.execute(
                select(Offer).where(
                    Offer.tenant_id == tenant.id,
                    Offer.candidate_id == candidate.id,
                )
            )
        ).scalar_one_or_none()
        if not offer:
            db.add(
                Offer(
                    tenant_id=tenant.id,
                    candidate_id=candidate.id,
                    requisition_id=req.id,
                    offered_role="Senior Merchandiser",
                    proposed_salary=62000,
                    currency="BDT",
                    joining_date=date(2026, 4, 1),
                    notes="Seed offer",
                    status="sent",
                    sent_at=datetime.now(),
                )
            )

        # ESS
        pref = (
            await db.execute(
                select(EssPreference).where(
                    EssPreference.tenant_id == tenant.id,
                    EssPreference.employee_id == emp_a.id,
                )
            )
        ).scalar_one_or_none()
        if not pref:
            db.add(
                EssPreference(
                    tenant_id=tenant.id,
                    employee_id=emp_a.id,
                    preferred_language="en",
                    time_zone="Asia/Dhaka",
                    date_format="DD-MM-YYYY",
                    email_notifications=True,
                    push_notifications=False,
                )
            )

        ticket = (
            await db.execute(
                select(EmployeeTicket).where(
                    EmployeeTicket.tenant_id == tenant.id,
                    EmployeeTicket.employee_id == emp_a.id,
                    EmployeeTicket.subject == "Need payslip copy",
                )
            )
        ).scalar_one_or_none()
        if not ticket:
            db.add(
                EmployeeTicket(
                    tenant_id=tenant.id,
                    employee_id=emp_a.id,
                    category="payroll",
                    subject="Need payslip copy",
                    description="Requesting a downloadable signed payslip copy",
                    priority="medium",
                    status="open",
                    assigned_to_employee_id=emp_b.id,
                )
            )

        await db.commit()

        print("Advanced HR seed complete.")
        print(f"Tenant: {tenant.name} ({tenant.company_code or tenant.id})")
        print("Seeded domains:")
        print("- attendance")
        print("- leave")
        print("- payroll")
        print("- performance")
        print("- recruitment")
        print("- ess")


if __name__ == "__main__":
    asyncio.run(main())

