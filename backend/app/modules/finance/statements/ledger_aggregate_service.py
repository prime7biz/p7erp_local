"""ONE aggregate query per statement: every ledger's opening and period movement (PLAN 2C).

Rules (same as the classic reports, plus the reversal note below):
- tenant filter on both the voucher and the line;
- only POSTED vouchers that are in the books (`voucher_in_books_clause()`), base currency
  (`line_base_amount_sql()`), so foreign-currency lines use their base amount;
- a REVERSED voucher still counts when its reversal voucher exists: POST /vouchers/{id}/reverse keeps the
  original's book impact and posts the opposite voucher, so both are needed for the net to be zero (and to
  equal chart_of_accounts.balance). DRAFT / CANCELLED vouchers never count;
- opening = chart_of_accounts.opening_balance (stored in the account's normal direction) + all movement
  before `from_date`;
- a ledger's class = its group's effective class, then the ledger-level cash / bank rule
  (`classification_service.resolve_ledger_class`).

Signs: every "net" in this package is debit minus credit (debit positive).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.advanced_voucher_service import (
    voucher_counts_in_books_status_clause,
    voucher_in_books_clause,
)
from app.modules.finance.posting_core import line_base_amount_sql
from app.modules.finance.statements.classification_service import (
    GroupInfo,
    ledger_is_bank_sql,
    ledger_is_cash_sql,
    load_group_classification,
    resolve_ledger_class,
)
from app.modules.finance.statements.constants import (
    CLASS_TO_PRIMARY,
    PL_NATURES,
    PRIMARY_UNCLASSIFIED,
    PROFIT_LOSS_CLASSES,
)

ZERO = Decimal("0")
Q4 = Decimal("0.0001")


@dataclass
class LedgerCalc:
    account_id: int
    account_number: str
    name: str
    group_id: int
    group: GroupInfo | None
    effective_class: str | None
    primary: str
    is_pl: bool  # income-statement account (class, or group nature when Unclassified)
    opening_net: Decimal  # as shown in a Trial Balance that starts at from_date
    period_debit: Decimal
    period_credit: Decimal
    pre_fy_net: Decimal  # P&L accounts only: stored opening + movement before the fiscal year (goes to P&L b/f)

    @property
    def closing_net(self) -> Decimal:
        return self.opening_net + self.period_debit - self.period_credit

    @property
    def is_empty(self) -> bool:
        return self.opening_net == ZERO and self.period_debit == ZERO and self.period_credit == ZERO


def _q(value: Decimal | None) -> Decimal:
    return Decimal(value or 0).quantize(Q4)


def _in_statement_status():
    return voucher_counts_in_books_status_clause()


async def build_ledger_calcs(
    db: AsyncSession,
    tenant_id: int,
    *,
    from_date: date,
    to_date: date,
    fy_start: date,
) -> tuple[list[LedgerCalc], dict[int, GroupInfo]]:
    """Return one LedgerCalc per ledger plus the tenant's classified groups. 3 SQL statements in total."""
    groups = await load_group_classification(db, tenant_id)  # 2 statements

    amount = line_base_amount_sql()
    is_debit = func.upper(VoucherLine.entry_type) == "DEBIT"
    signed = case((is_debit, amount), else_=-amount)
    lines = (
        select(
            VoucherLine.account_id.label("account_id"),
            func.coalesce(func.sum(case((Voucher.voucher_date < fy_start, signed), else_=0)), 0).label("pre_fy"),
            func.coalesce(
                func.sum(
                    case(
                        (and_(Voucher.voucher_date >= fy_start, Voucher.voucher_date < from_date), signed),
                        else_=0,
                    )
                ),
                0,
            ).label("mid"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            and_(Voucher.voucher_date >= from_date, Voucher.voucher_date <= to_date, is_debit),
                            amount,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("pdr"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            and_(Voucher.voucher_date >= from_date, Voucher.voucher_date <= to_date, ~is_debit),
                            amount,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("pcr"),
        )
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            VoucherLine.tenant_id == tenant_id,
            Voucher.tenant_id == tenant_id,
            _in_statement_status(),
            voucher_in_books_clause(),
            Voucher.voucher_date <= to_date,
        )
        .group_by(VoucherLine.account_id)
        .subquery()
    )
    opening_signed = case(
        (func.lower(ChartOfAccount.normal_balance) == "debit", ChartOfAccount.opening_balance),
        else_=-ChartOfAccount.opening_balance,
    )
    stmt = (
        select(
            ChartOfAccount.id,
            ChartOfAccount.account_number,
            ChartOfAccount.name,
            ChartOfAccount.group_id,
            opening_signed.label("opening"),
            func.coalesce(lines.c.pre_fy, 0),
            func.coalesce(lines.c.mid, 0),
            func.coalesce(lines.c.pdr, 0),
            func.coalesce(lines.c.pcr, 0),
            ledger_is_bank_sql(tenant_id),
            ledger_is_cash_sql(tenant_id),
        )
        .outerjoin(lines, lines.c.account_id == ChartOfAccount.id)
        .where(ChartOfAccount.tenant_id == tenant_id)
        .order_by(ChartOfAccount.account_number, ChartOfAccount.id)
    )

    calcs: list[LedgerCalc] = []
    rows = (await db.execute(stmt)).all()
    for account_id, number, name, group_id, opening, pre_fy, mid, pdr, pcr, is_bank, is_cash in rows:
        group = groups.get(group_id)
        eff = resolve_ledger_class(
            group.effective_class if group else None, is_bank=bool(is_bank), is_cash=bool(is_cash)
        )
        if eff is not None:
            is_pl = eff in PROFIT_LOSS_CLASSES
            primary = CLASS_TO_PRIMARY[eff]
        else:
            is_pl = bool(group) and group.nature.lower() in PL_NATURES
            primary = PRIMARY_UNCLASSIFIED
        opening, pre_fy, mid = _q(opening), _q(pre_fy), _q(mid)
        if is_pl:
            # Earlier fiscal years are closed into the synthetic P&L line, so only this year's part stays.
            opening_net, pre_fy_net = mid, opening + pre_fy
        else:
            opening_net, pre_fy_net = opening + pre_fy + mid, ZERO
        calcs.append(
            LedgerCalc(
                account_id=account_id,
                account_number=number,
                name=name,
                group_id=group_id,
                group=group,
                effective_class=eff,
                primary=primary,
                is_pl=is_pl,
                opening_net=opening_net,
                period_debit=_q(pdr),
                period_credit=_q(pcr),
                pre_fy_net=pre_fy_net,
            )
        )
    return calcs, groups
