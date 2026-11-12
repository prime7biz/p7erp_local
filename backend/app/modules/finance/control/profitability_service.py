"""GL-actual profitability for orders, styles, export LC / master contracts and buyers (PLAN Phase 3, read-only).

Attribution (explicit links only, PLAN attribution design 1-8):
- Order actual  = POSTED, in-books, base-currency lines of vouchers whose `order_id` is that order. A reversal voucher
  does not copy `order_id` (POST /vouchers/{id}/reverse), so it inherits the order of the voucher it reverses; without
  that, a reversed order voucher would never net to zero in the order P&L.
- Contract actual = lines on the master contract's own `cost_center_id` that no order owns, plus the actual of the
  orders whose `master_contract_id` is that contract. A line with BOTH an order and the contract cost centre belongs to
  the order and is therefore counted once, through the order (open question 12). If that order is not under this contract
  the line is left out and disclosed as warning COST_CENTER_LINES_OWNED_BY_OTHER_ORDER.
- Style = its orders (`orders.style_id`). Buyer = the orders of that customer (`orders.customer_id`, open question 14); a
  contract cost-centre line has no customer link, so it is not part of a buyer's actual.
- Never `vouchers.reference == order_code`. Never allocated: P&L lines with no order and no contract cost centre are
  reported as `unattributed_actual` / `coverage.unlinked_lines` (tenant-wide, same period), and overhead is not shared out
  (open question 11).
- Revenue date = GL voucher date (open question 13).

Bucket mapping lives in `constants.py` (statement class, refined by cost nature). Revenue = credit - debit, every cost
bucket = debit - credit. gross_profit = revenue - material - cm - other; nett_profit = gross_profit - overhead -
finance_cost; margin_percent = nett_profit / revenue x 100 (null when revenue is 0).

Query budget per request (independent of orders / vouchers): groups 2, entity 1, grouped lines 1, unlinked pool 1,
budget 1, account names 1. The list endpoint uses 2 + 1 + 1 + ceil(orders / 5000) + 0.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.commercial import MasterContract
from app.models.customer import Customer
from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.models.merch import GarmentStyle, Order, Quotation
from app.models.tenant import Tenant
from app.modules.finance.advanced_voucher_service import (
    voucher_counts_in_books_status_clause,
    voucher_in_books_clause,
)
from app.modules.finance.control.constants import (
    CLASS_DEFAULT_BUCKET,
    COST_CLASSES,
    INCOME_TO_OTHER_CLASSES,
    NATURE_TO_BUCKET,
    REVENUE_CLASSES,
    SORT_FIELDS,
)
from app.modules.finance.control.schemas import (
    OrderProfitListResponse,
    OrderProfitRow,
    ProfitabilityResponse,
    ProfitActual,
    ProfitBudget,
    ProfitCoverage,
    ProfitDrill,
    ProfitEntity,
    ProfitPeriod,
    ProfitWarning,
)
from app.modules.finance.posting_core import line_base_amount_sql
from app.modules.finance.statements.classification_service import GroupInfo, load_group_classification
from app.modules.finance.statements.constants import PL_NATURES, PROFIT_LOSS_CLASSES

ZERO = Decimal("0")
Q4 = Decimal("0.0001")
_CHUNK = 5000


def _q(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Q4)


# ---- classification ---------------------------------------------------------------------------------------------
def is_profit_loss(group: GroupInfo | None) -> bool:
    """Income-statement account: statement class, or (Unclassified group) group nature income / expense."""
    if group is None:
        return False
    if group.effective_class is not None:
        return group.effective_class in PROFIT_LOSS_CLASSES
    return (group.nature or "").lower() in PL_NATURES


def bucket_of(group: GroupInfo | None, nature: str | None) -> tuple[str, bool] | None:
    """(bucket, unclassified) for a P&L line, or None when the account is not a P&L account."""
    if not is_profit_loss(group):
        return None
    cls = group.effective_class if group else None
    if cls in REVENUE_CLASSES:
        return "revenue", False
    if cls in INCOME_TO_OTHER_CLASSES:
        return "other", False
    if cls in COST_CLASSES:
        explicit = NATURE_TO_BUCKET.get((nature or "").strip().upper())
        return (explicit or CLASS_DEFAULT_BUCKET[cls]), False
    return "other", True  # Unclassified group: never guessed into a named bucket, flagged by a warning


@dataclass
class Agg:
    buckets: dict[str, Decimal] = field(
        default_factory=lambda: {k: ZERO for k in ("revenue", "material", "cm", "overhead", "finance_cost", "other")}
    )
    direct_lines: int = 0
    cost_center_lines: int = 0
    drill: dict[tuple[str, str, int], list] = field(default_factory=dict)  # (source, bucket, account) -> [amount, lines]
    unclassified_lines: int = 0
    unclassified_amount: Decimal = ZERO
    foreign_owner_lines: int = 0
    foreign_owner_amount: Decimal = ZERO

    def add(self, bucket: str, amount: Decimal, lines: int, *, source: str | None, account_id: int, unclassified: bool):
        self.buckets[bucket] += amount
        if source == "ORDER":
            self.direct_lines += lines
        elif source == "COST_CENTER":
            self.cost_center_lines += lines
        if source is not None:
            slot = self.drill.setdefault((source, bucket, account_id), [ZERO, 0])
            slot[0] += amount
            slot[1] += lines
        if unclassified:
            self.unclassified_lines += lines
            self.unclassified_amount += amount

    @property
    def gross_profit(self) -> Decimal:
        b = self.buckets
        return b["revenue"] - b["material"] - b["cm"] - b["other"]

    @property
    def nett_profit(self) -> Decimal:
        return self.gross_profit - self.buckets["overhead"] - self.buckets["finance_cost"]

    @property
    def margin_percent(self) -> Decimal | None:
        revenue = self.buckets["revenue"]
        if revenue == ZERO:
            return None
        return (self.nett_profit / revenue * Decimal("100")).quantize(Q4, rounding=ROUND_HALF_UP)


def _signed(bucket: str, entry: str, amount: Decimal) -> Decimal:
    """Revenue: credit - debit. Costs: debit - credit."""
    if bucket == "revenue":
        return amount if entry == "CREDIT" else -amount
    return amount if entry == "DEBIT" else -amount


# ---- the grouped line query ---------------------------------------------------------------------------------------
def _lines_select(tenant_id: int, from_date: date | None, to_date: date | None, order_scope, *, cc_scope_id: int | None):
    """One grouped query over POSTED, in-books, base-currency lines.

    Columns: in_order_scope, in_cc_scope, has_order, mc_cc (contract cost centre or NULL), account_id, group_id,
    nature, entry, eff_order, total, lines. `order_scope` is a select of order ids (tenant filtered).
    """
    original = aliased(Voucher)
    eff_order = func.coalesce(Voucher.order_id, original.order_id)
    contract_cc = select(MasterContract.cost_center_id).where(
        MasterContract.tenant_id == tenant_id, MasterContract.cost_center_id.is_not(None)
    )
    mc_cc = case((VoucherLine.cost_center_id.in_(contract_cc), VoucherLine.cost_center_id), else_=None)
    in_order = case((eff_order.in_(order_scope), 1), else_=0)
    in_cc = case((VoucherLine.cost_center_id == cc_scope_id, 1), else_=0) if cc_scope_id is not None else case((VoucherLine.id.is_(None), 1), else_=0)
    nature = func.coalesce(VoucherLine.cost_nature_override, ChartOfAccount.cost_nature)
    entry = func.upper(VoucherLine.entry_type)
    stmt = (
        select(
            in_order.label("in_order_scope"),
            in_cc.label("in_cc_scope"),
            eff_order.label("eff_order"),
            mc_cc.label("mc_cc"),
            ChartOfAccount.id.label("account_id"),
            ChartOfAccount.group_id.label("group_id"),
            nature.label("nature"),
            entry.label("entry"),
            func.coalesce(func.sum(line_base_amount_sql()), 0).label("total"),
            func.count().label("lines"),
        )
        .select_from(VoucherLine)
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .join(ChartOfAccount, and_(ChartOfAccount.id == VoucherLine.account_id, ChartOfAccount.tenant_id == tenant_id))
        .outerjoin(original, and_(original.id == Voucher.reverses_voucher_id, original.tenant_id == tenant_id))
        .where(
            VoucherLine.tenant_id == tenant_id,
            Voucher.tenant_id == tenant_id,
            voucher_counts_in_books_status_clause(),
            voucher_in_books_clause(),
        )
        .group_by(
            in_order, in_cc, eff_order, mc_cc, ChartOfAccount.id, ChartOfAccount.group_id, nature, entry
        )
    )
    if from_date is not None:
        stmt = stmt.where(Voucher.voucher_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Voucher.voucher_date <= to_date)
    return stmt, in_order, in_cc, eff_order, mc_cc


async def _unlinked_pool(
    db: AsyncSession, tenant_id: int, groups: dict[int, GroupInfo], from_date: date | None, to_date: date | None
) -> tuple[Decimal, int]:
    """(cost-positive net, line count) of P&L lines with no order and no contract cost centre. Never allocated."""
    original = aliased(Voucher)
    eff_order = func.coalesce(Voucher.order_id, original.order_id)
    contract_cc = select(MasterContract.cost_center_id).where(
        MasterContract.tenant_id == tenant_id, MasterContract.cost_center_id.is_not(None)
    )
    entry = func.upper(VoucherLine.entry_type)
    stmt = (
        select(ChartOfAccount.group_id, entry, func.coalesce(func.sum(line_base_amount_sql()), 0), func.count())
        .select_from(VoucherLine)
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .join(ChartOfAccount, and_(ChartOfAccount.id == VoucherLine.account_id, ChartOfAccount.tenant_id == tenant_id))
        .outerjoin(original, and_(original.id == Voucher.reverses_voucher_id, original.tenant_id == tenant_id))
        .where(
            VoucherLine.tenant_id == tenant_id,
            Voucher.tenant_id == tenant_id,
            voucher_counts_in_books_status_clause(),
            voucher_in_books_clause(),
            eff_order.is_(None),
            or_(VoucherLine.cost_center_id.is_(None), VoucherLine.cost_center_id.not_in(contract_cc)),
        )
        .group_by(ChartOfAccount.group_id, entry)
    )
    if from_date is not None:
        stmt = stmt.where(Voucher.voucher_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Voucher.voucher_date <= to_date)
    net, lines = ZERO, 0
    for group_id, side, total, count in (await db.execute(stmt)).all():
        if not is_profit_loss(groups.get(group_id)):
            continue
        amount = _q(total)
        net += amount if side == "DEBIT" else -amount
        lines += int(count)
    return net, lines


# ---- entities ------------------------------------------------------------------------------------------------------
@dataclass
class _Entity:
    kind: str
    id: int
    code: str | None
    name: str | None
    order_cond: list  # conditions on Order (tenant filter added by the caller)
    cc_scope_id: int | None = None
    notes: list[str] = field(default_factory=list)


async def _resolve(db: AsyncSession, tenant_id: int, kind: str, entity_id: int) -> _Entity:
    """Tenant-owned entity or LookupError (the router turns it into 404; another tenant's id looks missing)."""
    if kind == "order":
        row = (await db.execute(select(Order.id, Order.order_code).where(Order.tenant_id == tenant_id, Order.id == entity_id))).first()
        if row:
            return _Entity("order", row[0], row[1], None, [Order.id == entity_id])
    elif kind == "style":
        row = (
            await db.execute(
                select(GarmentStyle.id, GarmentStyle.style_code, GarmentStyle.name).where(
                    GarmentStyle.tenant_id == tenant_id, GarmentStyle.id == entity_id
                )
            )
        ).first()
        if row:
            return _Entity("style", row[0], row[1], row[2], [Order.style_id == entity_id])
    elif kind == "buyer":
        row = (
            await db.execute(
                select(Customer.id, Customer.customer_code, Customer.name).where(
                    Customer.tenant_id == tenant_id, Customer.id == entity_id
                )
            )
        ).first()
        if row:
            return _Entity(
                "buyer", row[0], row[1], row[2], [Order.customer_id == entity_id],
                notes=["Buyer profit covers the buyer's orders only; contract cost-centre lines have no customer link."],
            )
    elif kind == "master_contract":
        row = (
            await db.execute(
                select(MasterContract.id, MasterContract.reference, MasterContract.buyer_name, MasterContract.cost_center_id).where(
                    MasterContract.tenant_id == tenant_id, MasterContract.id == entity_id
                )
            )
        ).first()
        if row:
            entity = _Entity("master_contract", row[0], row[1], row[2], [Order.master_contract_id == entity_id], cc_scope_id=row[3])
            if row[3] is None:
                entity.notes.append("This contract has no cost centre; only the lines of its linked orders are included.")
            return entity
    raise LookupError(kind)


async def _budget_and_counts(db: AsyncSession, tenant: Tenant, order_cond: list) -> tuple[ProfitBudget, int, int]:
    """Quotation budget of the orders in scope (explicit Order.quotation_id only). 1 statement."""
    base = (tenant.base_currency or "BDT").upper()
    ccy = func.upper(func.coalesce(Quotation.currency, base))
    rate = case((ccy == base, 1), (func.coalesce(Quotation.exchange_rate, 0) > 0, Quotation.exchange_rate), else_=None)
    usable = Quotation.id.is_not(None) & rate.is_not(None)

    def total(column):
        return func.coalesce(func.sum(case((usable, func.coalesce(column, 0) * rate), else_=0)), 0)

    row = (
        await db.execute(
            select(
                func.count(Order.id),
                func.count(case((usable, Order.id))),
                total(Quotation.total_amount),
                total(Quotation.material_cost),
                total(Quotation.manufacturing_cost),
                total(Quotation.other_cost),
            )
            .select_from(Order)
            .outerjoin(Quotation, and_(Quotation.id == Order.quotation_id, Quotation.tenant_id == tenant.id))
            .where(Order.tenant_id == tenant.id, *order_cond)
        )
    ).one()
    orders, with_budget = int(row[0]), int(row[1])
    budget = ProfitBudget(revenue=_q(row[2]), material=_q(row[3]), cm=_q(row[4]), other=_q(row[5]))
    return budget, orders, orders - with_budget


async def build_entity_profit(
    db: AsyncSession,
    tenant: Tenant,
    *,
    kind: str,
    entity_id: int,
    from_date: date | None,
    to_date: date | None,
) -> ProfitabilityResponse:
    tid = tenant.id
    entity = await _resolve(db, tid, kind, entity_id)
    groups = await load_group_classification(db, tid)
    order_scope = select(Order.id).where(Order.tenant_id == tid, *entity.order_cond)
    stmt, in_order, in_cc, eff_order, mc_cc = _lines_select(tid, from_date, to_date, order_scope, cc_scope_id=entity.cc_scope_id)
    stmt = stmt.where(or_(in_order == 1, in_cc == 1)) if entity.cc_scope_id is not None else stmt.where(in_order == 1)

    agg = Agg()
    for scope_order, scope_cc, order_id, _mc, account_id, group_id, nature, entry, total, lines in (await db.execute(stmt)).all():
        placed = bucket_of(groups.get(group_id), nature)
        if placed is None:
            continue
        bucket, unclassified = placed
        amount = _signed(bucket, entry, _q(total))
        if scope_order:
            agg.add(bucket, amount, int(lines), source="ORDER", account_id=account_id, unclassified=unclassified)
        elif scope_cc and order_id is None:
            agg.add(bucket, amount, int(lines), source="COST_CENTER", account_id=account_id, unclassified=unclassified)
        elif scope_cc:  # contract cost centre, but another order owns the line: not duplicated here
            agg.foreign_owner_lines += int(lines)
            agg.foreign_owner_amount += amount

    unlinked_net, unlinked_lines = await _unlinked_pool(db, tid, groups, from_date, to_date)
    budget, orders_in_scope, orders_without_budget = await _budget_and_counts(db, tenant, entity.order_cond)

    drill: list[ProfitDrill] = []
    if agg.drill:
        account_ids = {key[2] for key in agg.drill}
        names = {
            r[0]: (r[1], r[2])
            for r in (
                await db.execute(
                    select(ChartOfAccount.id, ChartOfAccount.account_number, ChartOfAccount.name).where(
                        ChartOfAccount.tenant_id == tid, ChartOfAccount.id.in_(account_ids)
                    )
                )
            ).all()
        }
        for (source, bucket, account_id), (amount, lines) in sorted(agg.drill.items(), key=lambda kv: (kv[0][0], kv[0][1], names.get(kv[0][2], ("", ""))[0] or "", kv[0][2])):
            number, name = names.get(account_id, (None, None))
            drill.append(
                ProfitDrill(
                    source=source, bucket=bucket, account_id=account_id, account_number=number,
                    account_name=name, line_count=lines, amount=amount,
                )
            )

    warnings: list[ProfitWarning] = []
    if agg.unclassified_lines:
        warnings.append(ProfitWarning(code="UNCLASSIFIED_ACCOUNTS", count=agg.unclassified_lines, amount=agg.unclassified_amount))
    if agg.foreign_owner_lines:
        warnings.append(
            ProfitWarning(code="COST_CENTER_LINES_OWNED_BY_OTHER_ORDER", count=agg.foreign_owner_lines, amount=agg.foreign_owner_amount)
        )
    notes = [*entity.notes, "Shared overhead is not allocated; unlinked lines are shown in unattributed_actual."]
    if orders_without_budget:
        notes.append(f"{orders_without_budget} order(s) have no usable quotation budget.")

    b = agg.buckets
    return ProfitabilityResponse(
        entity=ProfitEntity(type=entity.kind, id=entity.id, code=entity.code, name=entity.name),  # type: ignore[arg-type]
        period=ProfitPeriod(from_date=from_date, to_date=to_date),
        base_currency=tenant.base_currency or "BDT",
        budget=budget,
        actual=ProfitActual(**{k: b[k] for k in b}),
        gross_profit=agg.gross_profit,
        nett_profit=agg.nett_profit,
        margin_percent=agg.margin_percent,
        unattributed_actual=unlinked_net,
        coverage=ProfitCoverage(
            direct_voucher_lines=agg.direct_lines,
            cost_center_lines=agg.cost_center_lines,
            unlinked_lines=unlinked_lines,
            orders_in_scope=orders_in_scope,
            orders_without_budget=orders_without_budget,
        ),
        warnings=warnings,
        notes=notes,
        drilldown=drill,
        data_as_of=datetime.utcnow(),
    )


# ---- order list (ONE grouped query for every order's margin) -----------------------------------------------------
def _parse_sort(sort: str) -> tuple[str, bool]:
    desc = sort.startswith("-")
    field_name = sort[1:] if desc else sort
    if field_name not in SORT_FIELDS:
        raise ValueError(sort)
    return field_name, desc


async def list_order_profit(
    db: AsyncSession,
    tenant: Tenant,
    *,
    from_date: date | None,
    to_date: date | None,
    limit: int,
    offset: int,
    sort: str,
) -> OrderProfitListResponse:
    sort_field, desc = _parse_sort(sort)
    tid = tenant.id
    groups = await load_group_classification(db, tid)
    order_scope = select(Order.id).where(Order.tenant_id == tid)
    stmt, in_order, _in_cc, _eff, _mc = _lines_select(tid, from_date, to_date, order_scope, cc_scope_id=None)
    stmt = stmt.where(in_order == 1)

    per_order: dict[int, Agg] = {}
    for _so, _sc, order_id, _mc_cc, account_id, group_id, nature, entry, total, lines in (await db.execute(stmt)).all():
        placed = bucket_of(groups.get(group_id), nature)
        if placed is None:
            continue
        bucket, unclassified = placed
        per_order.setdefault(order_id, Agg()).add(
            bucket, _signed(bucket, entry, _q(total)), int(lines), source=None, account_id=account_id, unclassified=unclassified
        )

    headers: dict[int, Any] = {}
    ids = list(per_order)
    for start in range(0, len(ids), _CHUNK):
        chunk = ids[start : start + _CHUNK]
        for o in (
            await db.execute(
                select(
                    Order.id, Order.order_code, Order.order_date, Order.status, Order.customer_id, Order.style_id,
                    Order.master_contract_id,
                ).where(Order.tenant_id == tid, Order.id.in_(chunk))
            )
        ).all():
            headers[o[0]] = o

    rows: list[OrderProfitRow] = []
    for order_id, agg in per_order.items():
        h = headers.get(order_id)
        if h is None:
            continue
        b = agg.buckets
        rows.append(
            OrderProfitRow(
                order_id=order_id, order_code=h[1], order_date=h[2], status=h[3], customer_id=h[4], style_id=h[5],
                master_contract_id=h[6], gross_profit=agg.gross_profit, nett_profit=agg.nett_profit,
                margin_percent=agg.margin_percent, **{k: b[k] for k in b},
            )
        )

    def sort_key(r: OrderProfitRow):
        value = getattr(r, sort_field)  # None (no margin / no date) sorts below every real value; ties break on id
        return (value is not None, value if value is not None else 0, r.order_id)

    rows.sort(key=sort_key, reverse=desc)
    unlinked_net, unlinked_lines = await _unlinked_pool(db, tid, groups, from_date, to_date)
    return OrderProfitListResponse(
        period=ProfitPeriod(from_date=from_date, to_date=to_date),
        base_currency=tenant.base_currency or "BDT",
        total=len(rows),
        limit=limit,
        offset=offset,
        sort=sort,
        unattributed_actual=unlinked_net,
        unlinked_lines=unlinked_lines,
        rows=rows[offset : offset + limit],
        data_as_of=datetime.utcnow(),
    )
