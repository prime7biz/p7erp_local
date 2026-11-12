"""Stock versus GL control (PLAN section 5 "Stock versus GL control", acceptance 2.10). SQL: 5 statements.

Historical FIFO stock at the as-of date (same per-line rule as `stock_valuation_totals`: FIFO value when there are
FIFO layers, otherwise on-hand x default cost) grouped by the stock group's effective `stock_nature`, against the
GL balance of the STOCK_IN_HAND ledgers. `difference = gl_total - fifo_total` is reported, never forced to zero.
Stock whose group has no nature (or no group) is shown as UNCLASSIFIED, never moved into RM / WIP / FG.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import Numeric
from sqlalchemy import cast

from app.models.costing import Item
from app.models.inventory import StockGroup
from app.models.tenant import Tenant
from app.modules.finance.fiscal_year import fiscal_year_bounds, fy_start_month
from app.modules.finance.statements.constants import MAX_GROUP_DEPTH, STOCK_IN_HAND, STOCK_NATURES
from app.modules.finance.statements.flow_common import ZERO, q4
from app.modules.finance.statements.flow_schemas import GlStockLedger, StockGlResponse, StockNatureValue
from app.modules.finance.statements.group_tree import company_from, fiscal_period
from app.modules.finance.statements.ledger_aggregate_service import build_ledger_calcs
from app.modules.finance.statements.schemas import Reconciliation, StatementWarning
from app.modules.inventory.stock_report_queries import _balance_subquery, fifo_subquery

UNCLASSIFIED_NATURE = "UNCLASSIFIED"


async def fifo_value_by_stock_group(
    db: AsyncSession, tenant_id: int, as_of_date: date
) -> dict[int | None, tuple[Decimal, int]]:
    """{stock_group_id or None: (FIFO value, line count)} as of the date. 1 statement."""
    bal = _balance_subquery(tenant_id, False, as_of_date)
    fifo = fifo_subquery(tenant_id, as_of_date)
    on_hand = func.round(cast(bal.c.on_hand, Numeric), 3)
    line_value = case(
        (and_(fifo.c.fifo_qty > Decimal("0.000000001"), fifo.c.fifo_value > 0), func.round(fifo.c.fifo_value, 2)),
        else_=func.round(on_hand * func.coalesce(Item.default_cost, 0), 2),
    )
    rows = (
        await db.execute(
            select(Item.stock_group_id, func.coalesce(func.sum(line_value), 0), func.count())
            .select_from(
                bal.join(Item, Item.id == bal.c.item_id).outerjoin(
                    fifo,
                    and_(fifo.c.item_id == bal.c.item_id, fifo.c.wh_key == func.coalesce(bal.c.warehouse_id, -1)),
                )
            )
            .where(Item.tenant_id == tenant_id)
            .group_by(Item.stock_group_id)
        )
    ).all()
    return {gid: (q4(value), int(count)) for gid, value, count in rows}


async def stock_group_natures(db: AsyncSession, tenant_id: int) -> dict[int, str | None]:
    """Effective stock nature per stock group (own value, else nearest ancestor; cycle-safe). 1 statement."""
    rows = (
        await db.execute(
            select(StockGroup.id, StockGroup.parent_id, StockGroup.stock_nature).where(StockGroup.tenant_id == tenant_id)
        )
    ).all()
    by_id = {r[0]: r for r in rows}
    out: dict[int, str | None] = {}
    for gid in by_id:
        seen, cur, nature = {gid}, gid, None
        while cur is not None and len(seen) <= MAX_GROUP_DEPTH:
            row = by_id.get(cur)
            if row is None:
                break
            if row[2]:
                nature = row[2]
                break
            cur = row[1]
            if cur in seen:
                break
            seen.add(cur)
        out[gid] = nature
    return out


async def build_stock_gl(db: AsyncSession, tenant: Tenant, *, as_of_date: date) -> StockGlResponse:
    by_group = await fifo_value_by_stock_group(db, tenant.id, as_of_date)
    natures = await stock_group_natures(db, tenant.id)

    totals: dict[str, tuple[Decimal, int]] = {n: (ZERO, 0) for n in (*STOCK_NATURES, UNCLASSIFIED_NATURE)}
    for gid, (value, count) in by_group.items():
        nature = natures.get(gid) if gid is not None else None
        key = nature if nature in totals else UNCLASSIFIED_NATURE
        prev_v, prev_c = totals[key]
        totals[key] = (prev_v + value, prev_c + count)

    fy_start, _ = fiscal_year_bounds(as_of_date, fy_start_month(tenant.feature_flags))
    calcs, _groups = await build_ledger_calcs(db, tenant.id, from_date=fy_start, to_date=as_of_date, fy_start=fy_start)
    gl_rows = [c for c in calcs if not c.is_pl and c.effective_class == STOCK_IN_HAND]
    gl_total = sum((c.closing_net for c in gl_rows), ZERO)
    fifo_total = sum((v for v, _c in totals.values()), ZERO)
    unclassified_value, unclassified_lines = totals[UNCLASSIFIED_NATURE]

    return StockGlResponse(
        report="stock_gl_reconciliation",
        company=company_from(tenant),
        period=fiscal_period(tenant, from_date=None, to_date=None, as_of_date=as_of_date),
        base_currency=tenant.base_currency or "BDT",
        by_nature=[StockNatureValue(nature=n, fifo_value=v, line_count=c) for n, (v, c) in totals.items()],
        fifo_total=fifo_total,
        gl_total=gl_total,
        difference=gl_total - fifo_total,
        unclassified_stock=unclassified_value,
        gl_ledgers=[
            GlStockLedger(account_id=c.account_id, name=c.name, group_id=c.group_id, balance=c.closing_net)
            for c in gl_rows
            if c.closing_net != ZERO
        ],
        warnings=(
            [StatementWarning(code="UNCLASSIFIED_STOCK", count=unclassified_lines, amount=abs(unclassified_value))]
            if unclassified_lines
            else []
        ),
        # A control report: the gap is information, not an error, so `balanced` just says whether it is zero.
        reconciliation=Reconciliation(balanced=(gl_total - fifo_total) == ZERO, difference=gl_total - fifo_total),
        data_as_of=datetime.utcnow(),
    )
