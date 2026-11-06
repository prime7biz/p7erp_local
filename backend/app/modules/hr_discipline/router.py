"""Employee cases: notices, memos, warnings, show-cause, unauthorized absence and disciplinary cases.

GET  /hr/cases                          hr.discipline.manage
GET  /hr/cases/absence-candidates       hr.discipline.manage  (>10 days with no attendance or approved leave)
POST /hr/cases                          hr.discipline.manage  (DRAFT)
POST /hr/cases/{id}/issue               hr.discipline.manage
POST /hr/cases/{id}/events              hr.discipline.manage  (append-only: delivery, response, rejoined, hearing...)
POST /hr/cases/{id}/defence-notice      hr.discipline.manage  (absence: 7-day defence opportunity)
POST /hr/cases/{id}/decide              manager/admin
GET  /hr/cases/{id}                     hr.discipline.manage  (case + events + s.27(3A) timeline)
GET  /hr/cases/{id}/notice.pdf          hr.discipline.manage

Unauthorized absence follows s.27(3A): absent more than 10 days -> 10-day explain-and-rejoin notice ->
if the worker neither explains nor rejoins (or explains but does not rejoin) a further 7 days to defend ->
only then a manager may record DEEMED_RESIGNATION (effective from the first day of absence). A memo or
warning never changes employment status.
"""

from __future__ import annotations

import io
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.codegen import next_tenant_code_entity_key
from app.common.permissions import PERMISSION_HR_DISCIPLINE_MANAGE, assert_hr_manager_or_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry
from app.models.hr_leave import LeaveRequest
from app.models.hr_lifecycle import CASE_TYPES, HrEmployeeCase, HrEmployeeCaseEvent, HrSeparation
from app.modules.audit.service import log_action
from app.modules.hr_localization import bd_calculations as calc
from app.modules.hr_localization.rules_router import require_manager_admin
from app.modules.hr_localization.rules_service import effective_rules

router = APIRouter(prefix="/hr/cases", tags=["hr-cases"])

USER_EVENTS = ("DELIVERY_ATTEMPT", "DELIVERED", "RESPONSE", "REJOINED", "HEARING", "EXTENSION")
DECISIONS = {
    "ABSENCE": ("DEEMED_RESIGNATION", "EXPLANATION_ACCEPTED", "REJOINED"),
    "DISCIPLINARY": ("NO_ACTION", "WARNING", "PENALTY", "DISMISSAL", "REMOVAL"),
    "SHOW_CAUSE": ("NO_ACTION", "EXPLANATION_ACCEPTED", "WARNING", "REFER_TO_DISCIPLINARY"),
    "WARNING": ("ACKNOWLEDGED",),
    "MEMO": ("ACKNOWLEDGED",),
    "NOTICE": ("ACKNOWLEDGED",),
}


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _guard(db: AsyncSession, user: User, tenant: Tenant) -> None:
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_DISCIPLINE_MANAGE)


def _iso(v: Any) -> Any:
    return v.isoformat() if isinstance(v, (date, datetime)) else v


CASE_FIELDS = (
    "id", "case_no", "employee_id", "case_type", "subject", "body", "body_bn", "allegation", "first_absent_date",
    "issue_date", "reply_due_date", "defence_notice_date", "defence_due_date", "hearing_date", "status", "decision",
    "decision_note", "issued_by", "decided_by", "decided_at", "created_at",
)


def _case_out(c: HrEmployeeCase) -> dict:
    return {f: _iso(getattr(c, f)) for f in CASE_FIELDS}


def _event_out(e: HrEmployeeCaseEvent) -> dict:
    return {
        "id": e.id, "event_type": e.event_type, "event_date": e.event_date.isoformat(), "note": e.note,
        "evidence_ref": e.evidence_ref, "actor_user_id": e.actor_user_id, "created_at": e.created_at.isoformat(),
    }


async def _locked_case(db: AsyncSession, tenant_id: int, case_id: int) -> HrEmployeeCase:
    row = (
        await db.execute(
            select(HrEmployeeCase).where(HrEmployeeCase.id == case_id, HrEmployeeCase.tenant_id == tenant_id)
            .with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return row


async def _events(db: AsyncSession, case: HrEmployeeCase) -> list[HrEmployeeCaseEvent]:
    return list(
        (
            await db.execute(
                select(HrEmployeeCaseEvent)
                .where(HrEmployeeCaseEvent.tenant_id == case.tenant_id, HrEmployeeCaseEvent.case_id == case.id)
                .order_by(HrEmployeeCaseEvent.event_date, HrEmployeeCaseEvent.id)
            )
        ).scalars().all()
    )


def _add_event(db, case: HrEmployeeCase, event_type: str, day: date, user_id: int, note: str | None = None, evidence: str | None = None):
    db.add(
        HrEmployeeCaseEvent(
            tenant_id=case.tenant_id, case_id=case.id, event_type=event_type, event_date=day, note=note,
            evidence_ref=evidence, actor_user_id=user_id,
        )
    )


async def _worked_or_leave_between(db: AsyncSession, tenant_id: int, employee_id: int, start: date, end: date) -> bool:
    worked = (
        await db.execute(
            select(func.count(AttendanceEntry.id)).where(
                AttendanceEntry.tenant_id == tenant_id, AttendanceEntry.employee_id == employee_id,
                AttendanceEntry.attendance_date >= start, AttendanceEntry.attendance_date <= end,
                AttendanceEntry.in_time.is_not(None),
            )
        )
    ).scalar_one()
    leave = (
        await db.execute(
            select(func.count(LeaveRequest.id)).where(
                LeaveRequest.tenant_id == tenant_id, LeaveRequest.employee_id == employee_id,
                LeaveRequest.status == "APPROVED", LeaveRequest.from_date <= end, LeaveRequest.to_date >= start,
            )
        )
    ).scalar_one()
    return bool(worked or leave)


class CaseCreate(BaseModel):
    employee_id: int
    case_type: str = Field(..., pattern="^(NOTICE|SHOW_CAUSE|WARNING|MEMO|ABSENCE|DISCIPLINARY)$")
    subject: str = Field(..., min_length=3, max_length=255)
    body: str = Field(..., min_length=3, max_length=20000)
    body_bn: str | None = Field(None, max_length=20000)
    allegation: str | None = Field(None, max_length=5000)
    first_absent_date: date | None = None


class IssueBody(BaseModel):
    issue_date: date
    reply_days: int | None = Field(None, ge=1, le=60)


class EventBody(BaseModel):
    event_type: str
    event_date: date
    note: str | None = Field(None, max_length=5000)
    evidence_ref: str | None = Field(None, max_length=255)


class DefenceBody(BaseModel):
    issue_date: date


class DecideBody(BaseModel):
    decision: str
    decision_date: date
    note: str | None = Field(None, max_length=5000)


@router.get("")
async def list_cases(
    employee_id: int | None = None,
    case_type: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    stmt = select(HrEmployeeCase).where(HrEmployeeCase.tenant_id == tenant.id)
    if employee_id is not None:
        stmt = stmt.where(HrEmployeeCase.employee_id == employee_id)
    if case_type:
        stmt = stmt.where(HrEmployeeCase.case_type == case_type.upper())
    if status_filter:
        stmt = stmt.where(HrEmployeeCase.status == status_filter.upper())
    rows = (await db.execute(stmt.order_by(HrEmployeeCase.id.desc()).limit(500))).scalars().all()
    return [_case_out(r) for r in rows]


@router.get("/absence-candidates")
async def absence_candidates(
    as_of: date | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Active employees whose last attended day is more than 10 days ago (no approved leave since)."""
    await _guard(db, user, tenant)
    day = as_of or today_local(tenant)
    eff = await effective_rules(db, tenant.id, day)
    trigger = int(calc.rule(eff.rules, "absence_trigger_days"))
    last_seen = (
        select(AttendanceEntry.employee_id, func.max(AttendanceEntry.attendance_date).label("last_day"))
        .where(AttendanceEntry.tenant_id == tenant.id, AttendanceEntry.in_time.is_not(None), AttendanceEntry.attendance_date <= day)
        .group_by(AttendanceEntry.employee_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(Employee, last_seen.c.last_day)
            .join(last_seen, last_seen.c.employee_id == Employee.id)
            .where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True), last_seen.c.last_day < day - timedelta(days=trigger))
            .limit(500)
        )
    ).all()
    open_cases = set(
        (
            await db.execute(
                select(HrEmployeeCase.employee_id).where(
                    HrEmployeeCase.tenant_id == tenant.id, HrEmployeeCase.case_type == "ABSENCE",
                    HrEmployeeCase.status.not_in(("CLOSED", "CANCELLED", "DECIDED")),
                )
            )
        ).scalars()
    )
    out = []
    for emp, last_day in rows:
        first_absent = last_day + timedelta(days=1)
        if emp.id in open_cases or await _worked_or_leave_between(db, tenant.id, emp.id, first_absent, day):
            continue
        out.append({
            "employee_id": emp.id, "employee_code": emp.employee_code,
            "name": " ".join(p for p in (emp.first_name, emp.last_name) if p),
            "last_present": last_day.isoformat(), "first_absent_date": first_absent.isoformat(),
            "days_absent": (day - first_absent).days + 1,
        })
    return out


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_case(
    body: CaseCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    emp = await db.get(Employee, body.employee_id)
    if emp is None or emp.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Employee not found")
    if body.case_type == "ABSENCE" and body.first_absent_date is None:
        raise HTTPException(status_code=400, detail="An absence case needs the first day of absence")
    case_no = await next_tenant_code_entity_key(db, tenant_id=tenant.id, entity_key="hr_employee_case", prefix="CASE-", width=6)
    case = HrEmployeeCase(
        tenant_id=tenant.id, case_no=case_no, employee_id=emp.id, case_type=body.case_type, subject=body.subject.strip(),
        body=body.body.strip(), body_bn=(body.body_bn or "").strip() or None, allegation=(body.allegation or "").strip() or None,
        first_absent_date=body.first_absent_date, status="DRAFT", created_by=user.id,
    )
    db.add(case)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_CASE_CREATED", resource=f"hr.case:{case.id}", details=f"{case.case_type} {case_no}")
    await db.commit()
    await db.refresh(case)
    return _case_out(case)


@router.get("/{case_id}")
async def get_case(
    case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    case = await db.get(HrEmployeeCase, case_id)
    if case is None or case.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Case not found")
    timeline = None
    if case.case_type == "ABSENCE" and case.issue_date and case.first_absent_date:
        eff = await effective_rules(db, tenant.id, case.issue_date)
        timeline = {k: _iso(v) for k, v in calc.absence_timeline(case.first_absent_date, case.issue_date, case.defence_notice_date, eff.rules).items()}
    return {**_case_out(case), "events": [_event_out(e) for e in await _events(db, case)], "timeline": timeline}


@router.post("/{case_id}/issue")
async def issue_case(
    case_id: int,
    body: IssueBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    case = await _locked_case(db, tenant.id, case_id)
    if case.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Case is {case.status}")
    eff = await effective_rules(db, tenant.id, body.issue_date)
    if case.case_type == "ABSENCE":
        tl = calc.absence_timeline(case.first_absent_date, body.issue_date, rules=eff.rules)
        if not tl["explain_notice_valid"]:
            raise HTTPException(
                status_code=400,
                detail=f"s.27(3A): the explain-and-rejoin notice can be issued only after more than "
                f"{calc.rule(eff.rules, 'absence_trigger_days')} days of absence (from {tl['earliest_explain_notice']})",
            )
        if await _worked_or_leave_between(db, tenant.id, case.employee_id, case.first_absent_date, body.issue_date - timedelta(days=1)):
            raise HTTPException(status_code=409, detail="The employee attended or had approved leave during the absence period")
        case.reply_due_date = tl["explain_deadline"]
    else:
        case.reply_due_date = body.issue_date + timedelta(days=body.reply_days) if body.reply_days else None
    case.issue_date, case.status, case.issued_by = body.issue_date, "ISSUED", user.id
    _add_event(db, case, "ISSUED", body.issue_date, user.id, note=f"Reply due {case.reply_due_date}" if case.reply_due_date else None)
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_CASE_ISSUED", resource=f"hr.case:{case.id}", details=str(body.issue_date))
    await db.commit()
    await db.refresh(case)
    return _case_out(case)


@router.post("/{case_id}/events", status_code=status.HTTP_201_CREATED)
async def add_case_event(
    case_id: int,
    body: EventBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    event_type = body.event_type.strip().upper()
    if event_type not in USER_EVENTS:
        raise HTTPException(status_code=400, detail=f"event_type must be one of {', '.join(USER_EVENTS)}")
    case = await _locked_case(db, tenant.id, case_id)
    if case.status in ("DRAFT", "DECIDED", "CLOSED", "CANCELLED"):
        raise HTTPException(status_code=409, detail=f"Case is {case.status}")
    if case.issue_date and body.event_date < case.issue_date:
        raise HTTPException(status_code=400, detail="Event date is before the notice was issued")
    _add_event(db, case, event_type, body.event_date, user.id, (body.note or "").strip() or None, (body.evidence_ref or "").strip() or None)
    if event_type == "RESPONSE" and case.status == "ISSUED":
        case.status = "RESPONDED"
    if event_type == "HEARING":
        case.hearing_date, case.status = body.event_date, "HEARING"
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_CASE_EVENT_ADDED", resource=f"hr.case:{case.id}", details=event_type)
    await db.commit()
    await db.refresh(case)
    return _case_out(case)


@router.post("/{case_id}/defence-notice")
async def issue_defence_notice(
    case_id: int,
    body: DefenceBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """s.27(3A): when the worker has not rejoined within the explain period — whether or not an
    explanation was received — give a further 7 days to defend."""
    await _guard(db, user, tenant)
    case = await _locked_case(db, tenant.id, case_id)
    if case.case_type != "ABSENCE":
        raise HTTPException(status_code=400, detail="Only an absence case has a defence notice")
    if case.status not in ("ISSUED", "RESPONDED"):
        raise HTTPException(status_code=409, detail=f"Case is {case.status}")
    events = await _events(db, case)
    if any(e.event_type == "REJOINED" for e in events):
        raise HTTPException(status_code=409, detail="The employee rejoined; close the case instead")
    if body.issue_date < case.reply_due_date:
        raise HTTPException(status_code=400, detail=f"The 10-day explain-and-rejoin period ends on {case.reply_due_date}")
    eff = await effective_rules(db, tenant.id, body.issue_date)
    case.defence_notice_date = body.issue_date
    case.defence_due_date = body.issue_date + timedelta(days=int(calc.rule(eff.rules, "absence_defence_days")))
    case.status = "DEFENCE_NOTICE"
    _add_event(db, case, "DEFENCE_NOTICE_ISSUED", body.issue_date, user.id, note=f"Defence due {case.defence_due_date}")
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_CASE_DEFENCE_NOTICE", resource=f"hr.case:{case.id}", details=str(body.issue_date))
    await db.commit()
    await db.refresh(case)
    return _case_out(case)


@router.post("/{case_id}/decide")
async def decide_case(
    case_id: int,
    body: DecideBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    case = await _locked_case(db, tenant.id, case_id)
    decision = body.decision.strip().upper()
    if decision not in DECISIONS[case.case_type]:
        raise HTTPException(status_code=400, detail=f"Decision for a {case.case_type} case must be one of {', '.join(DECISIONS[case.case_type])}")
    if case.status in ("DRAFT", "DECIDED", "CLOSED", "CANCELLED"):
        raise HTTPException(status_code=409, detail=f"Case is {case.status}")
    events = await _events(db, case)
    separation_type = None
    if decision == "DEEMED_RESIGNATION":
        if case.status != "DEFENCE_NOTICE" or case.defence_due_date is None:
            raise HTTPException(status_code=409, detail="s.27(3A): issue the 7-day defence notice first")
        if body.decision_date < case.defence_due_date:
            raise HTTPException(status_code=400, detail=f"The 7-day defence period ends on {case.defence_due_date}")
        late = [e for e in events if e.event_type in ("REJOINED", "RESPONSE") and e.event_date >= case.defence_notice_date]
        if late:
            raise HTTPException(status_code=409, detail="The employee rejoined or defended after the defence notice; decide on that defence instead")
        separation_type = "DEEMED_RESIGNATION"
    if decision in ("DISMISSAL", "REMOVAL"):
        if not any(e.event_type == "HEARING" for e in events):
            raise HTTPException(status_code=409, detail="Record the hearing (s.24 procedure) before a dismissal / removal decision")
        separation_type = "DISMISSAL"
    if separation_type:
        open_sep = (
            await db.execute(
                select(HrSeparation.id).where(
                    HrSeparation.tenant_id == tenant.id, HrSeparation.employee_id == case.employee_id,
                    HrSeparation.status.in_(("DRAFT", "APPROVED")),
                )
            )
        ).first()
        if open_sep:
            raise HTTPException(status_code=409, detail=f"Employee already has an open separation #{open_sep[0]}")
        if separation_type == "DEEMED_RESIGNATION":
            last_working, effective = case.first_absent_date - timedelta(days=1), case.first_absent_date
        else:
            last_working = effective = body.decision_date
        db.add(
            HrSeparation(
                tenant_id=tenant.id, employee_id=case.employee_id, separation_type=separation_type,
                request_date=body.decision_date, last_working_date=last_working, effective_date=effective,
                absence_case_id=case.id, reason=f"Case {case.case_no}: {decision}", status="DRAFT", created_by=user.id,
                misconduct_no_compensation=False,
            )
        )
    case.status = "DECIDED"
    case.decision, case.decision_note, case.decided_by, case.decided_at = decision, (body.note or "").strip() or None, user.id, datetime.utcnow()
    _add_event(db, case, "DECISION", body.decision_date, user.id, note=decision)
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_CASE_DECIDED", resource=f"hr.case:{case.id}", details=decision)
    await db.commit()
    await db.refresh(case)
    return _case_out(case)


@router.get("/{case_id}/notice.pdf")
async def notice_pdf(
    case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    await _guard(db, user, tenant)
    case = await db.get(HrEmployeeCase, case_id)
    if case is None or case.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Case not found")
    emp = await db.get(Employee, case.employee_id)
    st = getSampleStyleSheet()
    buf = io.BytesIO()
    kind = {"ABSENCE": "Notice under section 27(3A), Bangladesh Labour Act 2006", "SHOW_CAUSE": "Show-cause notice"}.get(case.case_type, case.case_type.title())
    story = [
        Paragraph(f"<b>{getattr(tenant, 'name', None) or 'Company'}</b>", st["Heading3"]),
        Paragraph(f"{kind} — Ref {case.case_no}", st["Heading4"]),
        Paragraph(f"Date: {case.issue_date or '(draft)'}", st["Normal"]),
        Paragraph(f"To: {emp.first_name} {emp.last_name or ''} ({emp.employee_code})", st["Normal"]),
        Spacer(1, 8),
        Paragraph(f"<b>Subject:</b> {case.subject}", st["Normal"]),
        Spacer(1, 6),
    ]
    for para in case.body.split("\n"):
        story.append(Paragraph(para or "&nbsp;", st["Normal"]))
    if case.reply_due_date:
        story += [Spacer(1, 6), Paragraph(f"<b>Reply / rejoin by:</b> {case.reply_due_date}", st["Normal"])]
    if case.defence_due_date:
        story.append(Paragraph(f"<b>Defence by:</b> {case.defence_due_date}", st["Normal"]))
    if case.body_bn:
        story += [Spacer(1, 10), Paragraph("Bangla text: print the Bangla version from the case screen (browser print).", st["Italic"])]
    story += [Spacer(1, 30), Paragraph("Authorised signatory", st["Normal"])]
    SimpleDocTemplate(buf, pagesize=A4).build(story)
    return Response(buf.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{case.case_no}.pdf"'})


__all__ = ["router", "CASE_TYPES"]
