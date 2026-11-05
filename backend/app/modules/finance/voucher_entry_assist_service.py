"""Voucher entry assistant: read-only hints shown beside the voucher form.

Everything is computed from the tenant's own posted vouchers; nothing is written.
- fiscal year of the chosen date vs. today's fiscal year
- ledger insight per selected account (balance now and after this voucher, usual amount)
- accounts usually paired with the selected ones, and narrations used before
- warnings: header/inactive ledger, unusual amount, cash/bank going negative, possible duplicate

`suggest_narration` asks the tenant LLM (OpenRouter / Gemini, with tenant budgets) for a one-line
narration and falls back to a plain template when AI is off or fails.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.orm_numeric import decimal_to_money_response
from app.database import safe_async_session_rollback
from app.models import AccountGroup, ChartOfAccount, Tenant, Voucher, VoucherLine
from app.modules.finance.fiscal_year import fiscal_year_info, fy_start_month
from app.modules.finance.voucher_controls import (
    _is_cash_or_bank,
    compute_duplicate_risk_hash,
    find_conflicting_posted_vouchers,
)

logger = logging.getLogger(__name__)

HISTORY_DAYS = 365
HISTORY_VOUCHER_LIMIT = 300
UNUSUAL_MULTIPLIER = Decimal("3")
MIN_HISTORY_FOR_UNUSUAL = 3
SUGGESTION_LIMIT = 6
NARRATION_LIMIT = 5
NARRATION_MAX_CHARS = 240


@dataclass
class DraftLine:
    account_id: int
    entry_type: str  # DEBIT | CREDIT
    amount: Decimal
    notes: str | None = None


def to_decimal(value: Any) -> Decimal:
    try:
        d = Decimal(str(value if value not in (None, "") else "0"))
    except (InvalidOperation, ValueError):
        return Decimal("0")
    return d if d.is_finite() else Decimal("0")


def _money(value: Any) -> str:
    return decimal_to_money_response(value)


def _warning(level: str, message: str) -> dict[str, str]:
    return {"level": level, "message": message}


async def _history_voucher_ids(
    db: AsyncSession, tenant_id: int, voucher_type: str, account_ids: list[int], since: date
) -> list[int]:
    """Latest posted vouchers of this type that touch any selected account (or all of this type)."""

    def query(with_type: bool):
        q = select(Voucher.id).where(
            Voucher.tenant_id == tenant_id,
            Voucher.status == "POSTED",
            Voucher.voucher_date >= since,
        )
        if with_type:
            q = q.where(func.upper(Voucher.voucher_type) == voucher_type)
        if account_ids:
            touches = (
                select(VoucherLine.id)
                .where(VoucherLine.voucher_id == Voucher.id, VoucherLine.account_id.in_(account_ids))
                .exists()
            )
            q = q.where(touches)
        return q.order_by(Voucher.id.desc()).limit(HISTORY_VOUCHER_LIMIT)

    ids = list((await db.execute(query(True))).scalars().all())
    if not ids and account_ids:
        ids = list((await db.execute(query(False))).scalars().all())
    return ids


async def _suggested_accounts(
    db: AsyncSession, tenant_id: int, voucher_ids: list[int], exclude_ids: list[int]
) -> list[dict[str, Any]]:
    if not voucher_ids:
        return []
    uses = func.count(VoucherLine.id)
    q = (
        select(
            VoucherLine.account_id,
            VoucherLine.entry_type,
            uses.label("uses"),
            ChartOfAccount.account_number,
            ChartOfAccount.name,
        )
        .join(ChartOfAccount, ChartOfAccount.id == VoucherLine.account_id)
        .where(
            VoucherLine.voucher_id.in_(voucher_ids),
            ChartOfAccount.tenant_id == tenant_id,
            ChartOfAccount.is_active.is_(True),
        )
        .group_by(VoucherLine.account_id, VoucherLine.entry_type, ChartOfAccount.account_number, ChartOfAccount.name)
        .order_by(uses.desc(), VoucherLine.account_id)
        .limit(SUGGESTION_LIMIT)
    )
    if exclude_ids:
        q = q.where(VoucherLine.account_id.not_in(exclude_ids))
    return [
        {
            "account_id": r.account_id,
            "account_number": r.account_number,
            "name": r.name,
            "side": r.entry_type,
            "times_used": int(r.uses),
        }
        for r in (await db.execute(q)).all()
    ]


async def _recent_narrations(db: AsyncSession, voucher_ids: list[int]) -> list[str]:
    if not voucher_ids:
        return []
    latest = func.max(Voucher.id)
    q = (
        select(Voucher.description, latest.label("latest"))
        .where(Voucher.id.in_(voucher_ids), Voucher.description.is_not(None), func.length(func.trim(Voucher.description)) > 0)
        .group_by(Voucher.description)
        .order_by(latest.desc())
        .limit(NARRATION_LIMIT)
    )
    return [r.description.strip() for r in (await db.execute(q)).all()]


async def _account_insights(
    db: AsyncSession, tenant_id: int, lines: list[DraftLine], since: date
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    account_ids = sorted({ln.account_id for ln in lines})
    if not account_ids:
        return [], []
    rows = (
        await db.execute(
            select(ChartOfAccount, AccountGroup)
            .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
            .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_(account_ids))
        )
    ).all()
    stats_rows = (
        await db.execute(
            select(
                VoucherLine.account_id,
                func.count(VoucherLine.id),
                func.avg(VoucherLine.amount),
                func.max(Voucher.voucher_date),
            )
            .join(Voucher, Voucher.id == VoucherLine.voucher_id)
            .where(
                Voucher.tenant_id == tenant_id,
                Voucher.status == "POSTED",
                Voucher.voucher_date >= since,
                VoucherLine.account_id.in_(account_ids),
            )
            .group_by(VoucherLine.account_id)
        )
    ).all()
    stats = {r[0]: (int(r[1] or 0), to_decimal(r[2]), r[3]) for r in stats_rows}

    insights: list[dict[str, Any]] = []
    warnings: list[dict[str, str]] = []
    for account, group in rows:
        acct_lines = [ln for ln in lines if ln.account_id == account.id]
        debit = sum((ln.amount for ln in acct_lines if ln.entry_type == "DEBIT"), Decimal("0"))
        credit = sum((ln.amount for ln in acct_lines if ln.entry_type == "CREDIT"), Decimal("0"))
        balance = to_decimal(account.balance)
        debit_normal = (account.normal_balance or "debit") == "debit"
        projected = balance + (debit - credit if debit_normal else credit - debit)
        count, avg_amount, last_used = stats.get(account.id, (0, Decimal("0"), None))
        biggest = max((ln.amount for ln in acct_lines), default=Decimal("0"))
        unusual = count >= MIN_HISTORY_FOR_UNUSUAL and avg_amount > 0 and biggest > avg_amount * UNUSUAL_MULTIPLIER
        label = f"{account.account_number} {account.name}"

        if getattr(account, "account_type", "posting") == "header":
            warnings.append(_warning("danger", f"{label} is a header (group) account — pick a posting ledger under it."))
        if not account.is_active:
            warnings.append(_warning("warning", f"{label} is inactive."))
        if unusual:
            warnings.append(
                _warning(
                    "warning",
                    f"{label}: {_money(biggest)} is more than 3× the usual amount ({_money(avg_amount)}). Please double-check.",
                )
            )
        if debit_normal and _is_cash_or_bank(account, group) and projected < 0 and projected < balance:
            warnings.append(_warning("warning", f"{label} would go negative after this voucher (projected {_money(projected)})."))

        insights.append(
            {
                "account_id": account.id,
                "account_number": account.account_number,
                "name": account.name,
                "group_name": group.name,
                "nature": group.nature,
                "normal_balance": account.normal_balance,
                "is_cash_or_bank": _is_cash_or_bank(account, group),
                "enable_bill_wise": bool(account.enable_bill_wise),
                "balance": _money(balance),
                "projected_balance": _money(projected),
                "times_used_last_year": count,
                "average_amount": _money(avg_amount) if count else None,
                "last_used_date": last_used.isoformat() if last_used else None,
                "unusual_amount": unusual,
            }
        )
    return insights, warnings


async def _duplicate_check(
    db: AsyncSession,
    tenant_id: int,
    *,
    voucher_date: date,
    reference: str | None,
    lines: list[DraftLine],
    exclude_voucher_id: int | None,
) -> list[dict[str, Any]]:
    debit = sum((ln.amount for ln in lines if ln.entry_type == "DEBIT"), Decimal("0"))
    credit = sum((ln.amount for ln in lines if ln.entry_type == "CREDIT"), Decimal("0"))
    if len(lines) < 2 or debit <= 0 or abs(debit - credit) >= Decimal("0.001"):
        return []
    h = compute_duplicate_risk_hash(
        tenant_id=tenant_id,
        voucher_date=voucher_date,
        reference=reference,
        line_account_ids=[ln.account_id for ln in lines],
        debit_total=float(debit),
        credit_total=float(credit),
    )
    ids = await find_conflicting_posted_vouchers(
        db, tenant_id=tenant_id, duplicate_risk_hash=h, exclude_voucher_id=exclude_voucher_id
    )
    if not ids:
        return []
    rows = (await db.execute(select(Voucher.id, Voucher.voucher_number).where(Voucher.id.in_(ids)))).all()
    return [{"id": r.id, "voucher_number": r.voucher_number} for r in rows]


async def build_entry_assist(
    db: AsyncSession,
    tenant: Tenant,
    *,
    voucher_type: str,
    voucher_date: date,
    reference: str | None,
    lines: list[DraftLine],
    exclude_voucher_id: int | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    today = today or date.today()
    start_month = fy_start_month(tenant.feature_flags)
    fy = fiscal_year_info(voucher_date, start_month)
    current_fy = fiscal_year_info(today, start_month)
    vtype = (voucher_type or "JOURNAL").strip().upper()
    lines = [ln for ln in lines if ln.account_id > 0]
    account_ids = sorted({ln.account_id for ln in lines})
    since = today - timedelta(days=HISTORY_DAYS)

    warnings: list[dict[str, str]] = []
    if voucher_date > today:
        warnings.append(_warning("warning", f"Voucher date {voucher_date.isoformat()} is in the future."))
    if fy["fiscal_year"] != current_fy["fiscal_year"]:
        warnings.append(
            _warning(
                "info",
                f"This date is in financial year {fy['label']}; the current financial year is {current_fy['label']}.",
            )
        )

    accounts, account_warnings = await _account_insights(db, tenant.id, lines, since)
    warnings.extend(account_warnings)

    history_ids = await _history_voucher_ids(db, tenant.id, vtype, account_ids, since)
    suggested = await _suggested_accounts(db, tenant.id, history_ids, account_ids)
    narrations = await _recent_narrations(db, history_ids)

    similar = await _duplicate_check(
        db,
        tenant.id,
        voucher_date=voucher_date,
        reference=reference,
        lines=lines,
        exclude_voucher_id=exclude_voucher_id,
    )
    if similar:
        nums = ", ".join(s["voucher_number"] for s in similar)
        warnings.append(
            _warning("danger", f"Possible duplicate: same date, reference, accounts and amount as posted voucher {nums}.")
        )

    return {
        "fiscal_year": fy,
        "current_fiscal_year": current_fy,
        "accounts": accounts,
        "suggested_accounts": suggested,
        "recent_narrations": narrations,
        "similar_posted_vouchers": similar,
        "warnings": warnings,
        "history_voucher_count": len(history_ids),
    }


def _join_names(names: list[str]) -> str:
    names = [n for n in dict.fromkeys(names) if n]
    if not names:
        return "the selected ledger"
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def template_narration(voucher_type: str, debit_names: list[str], credit_names: list[str], total: Decimal, reference: str | None) -> str:
    amount = f"{total:,.2f}"
    dr, cr = _join_names(debit_names), _join_names(credit_names)
    vt = (voucher_type or "").upper()
    if vt == "PAYMENT":
        text = f"Being payment of {amount} to {dr} from {cr}"
    elif vt == "RECEIPT":
        text = f"Being receipt of {amount} from {cr} into {dr}"
    elif vt == "CONTRA":
        text = f"Being transfer of {amount} from {cr} to {dr}"
    elif vt in {"SALES", "SALE"}:
        text = f"Being sales of {amount} to {dr}"
    elif vt in {"PURCHASE", "PURCHASES"}:
        text = f"Being purchase of {amount} from {cr}"
    else:
        text = f"Being {dr} debited and {cr} credited for {amount}"
    if reference and reference.strip():
        text += f" (ref. {reference.strip()})"
    return text + "."


def _clean_ai_narration(text: str | None) -> str | None:
    if not text:
        return None
    line = next((ln.strip() for ln in text.strip().splitlines() if ln.strip()), "")
    line = line.strip().strip('"').strip("'").strip("`").strip()
    for prefix in ("Narration:", "narration:"):
        if line.startswith(prefix):
            line = line[len(prefix):].strip()
    if len(line) < 6:
        return None
    return line[:NARRATION_MAX_CHARS]


async def suggest_narration(
    db: AsyncSession,
    tenant: Tenant,
    user_id: int | None,
    *,
    voucher_type: str,
    voucher_date: date,
    reference: str | None,
    lines: list[DraftLine],
) -> dict[str, str]:
    lines = [ln for ln in lines if ln.account_id > 0]
    names: dict[int, str] = {}
    if lines:
        rows = (
            await db.execute(
                select(ChartOfAccount.id, ChartOfAccount.name).where(
                    ChartOfAccount.tenant_id == tenant.id,
                    ChartOfAccount.id.in_(sorted({ln.account_id for ln in lines})),
                )
            )
        ).all()
        names = {r.id: r.name for r in rows}
    debit_names = [names.get(ln.account_id, "") for ln in lines if ln.entry_type == "DEBIT"]
    credit_names = [names.get(ln.account_id, "") for ln in lines if ln.entry_type == "CREDIT"]
    total = sum((ln.amount for ln in lines if ln.entry_type == "DEBIT"), Decimal("0"))
    fallback = template_narration(voucher_type, debit_names, credit_names, total, reference)

    history_ids = await _history_voucher_ids(
        db, tenant.id, (voucher_type or "").upper(), sorted(names), date.today() - timedelta(days=HISTORY_DAYS)
    )
    examples = await _recent_narrations(db, history_ids)

    line_text = "\n".join(
        f"- {ln.entry_type.title()} {names.get(ln.account_id, 'ledger')} {ln.amount:,.2f}"
        + (f" (note: {ln.notes.strip()[:80]})" if ln.notes and ln.notes.strip() else "")
        for ln in lines[:20]
    )
    prompt = (
        "You write narrations for accounting vouchers in a Bangladesh garment-industry ERP (Tally style).\n"
        f"Voucher type: {voucher_type}\nDate: {voucher_date.isoformat()}\n"
        f"Reference: {(reference or '').strip() or 'none'}\nLines:\n{line_text or '- (no lines yet)'}\n"
        + (
            "Narrations this company used for similar vouchers:\n" + "\n".join(f"- {e}" for e in examples) + "\n"
            if examples
            else ""
        )
        + "Write ONE narration in plain English, under 25 words, starting with 'Being'. "
        "Match the company's style if examples exist. Do not invent party names, invoice numbers or facts. "
        "Return only the narration text."
    )

    try:
        from app.common.gemini_client import generate_text_for_tenant

        ai_text = await generate_text_for_tenant(db, tenant.id, user_id, "voucher_narration", prompt)
    except Exception:
        logger.exception("voucher_narration_ai_failed tenant=%s", tenant.id)
        await safe_async_session_rollback(db)
        ai_text = None
    cleaned = _clean_ai_narration(ai_text)
    if cleaned:
        return {"narration": cleaned, "source": "ai"}
    return {"narration": fallback, "source": "template"}
