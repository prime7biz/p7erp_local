#!/usr/bin/env python3
"""Read-only data audit for Finance > Management Performance (docs/management-performance/01-data-audit.md).

Prints only counts per tenant (no names, ids of records, or amounts). Runs inside a READ ONLY transaction.

Usage::

    docker compose exec backend python scripts/mgmt_performance_data_audit.py
    docker compose exec backend python scripts/mgmt_performance_data_audit.py --tenant-id 3
    docker compose exec backend python scripts/mgmt_performance_data_audit.py --json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import text

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # noqa: E402

QUERIES: dict[str, str] = {
    "fg_stock_groups": "SELECT count(*) FROM stock_groups WHERE tenant_id = :t AND upper(coalesce(stock_nature, '')) = 'FINISHED_GOODS'",
    "fg_items": (
        "SELECT count(*) FROM items i JOIN stock_groups g ON g.id = i.stock_group_id AND g.tenant_id = i.tenant_id "
        "WHERE i.tenant_id = :t AND upper(coalesce(g.stock_nature, '')) = 'FINISHED_GOODS'"
    ),
    "fg_in_movements": (
        "SELECT count(*) FROM stock_movements m JOIN items i ON i.id = m.item_id AND i.tenant_id = m.tenant_id "
        "JOIN stock_groups g ON g.id = i.stock_group_id AND g.tenant_id = i.tenant_id "
        "WHERE m.tenant_id = :t AND m.movement_type = 'IN' AND upper(coalesce(g.stock_nature, '')) = 'FINISHED_GOODS'"
    ),
    "fg_in_movements_with_order": (
        "SELECT count(*) FROM stock_movements m JOIN items i ON i.id = m.item_id AND i.tenant_id = m.tenant_id "
        "JOIN stock_groups g ON g.id = i.stock_group_id AND g.tenant_id = i.tenant_id "
        "WHERE m.tenant_id = :t AND m.movement_type = 'IN' AND m.order_id IS NOT NULL "
        "AND upper(coalesce(g.stock_nature, '')) = 'FINISHED_GOODS'"
    ),
    "process_orders_linked_to_order": (
        "SELECT count(*) FROM process_orders WHERE tenant_id = :t "
        "AND coalesce(source_order_id, linked_order_id) IS NOT NULL"
    ),
    "process_orders_total": "SELECT count(*) FROM process_orders WHERE tenant_id = :t",
    "process_cost_lines": "SELECT count(*) FROM process_order_cost_lines WHERE tenant_id = :t",
    "po_lines_linked_to_order": (
        "SELECT count(*) FROM purchase_order_items l JOIN purchase_orders p ON p.id = l.purchase_order_id "
        "WHERE l.tenant_id = :t AND coalesce(l.source_order_id, p.source_order_id) IS NOT NULL"
    ),
    "po_lines_total": "SELECT count(*) FROM purchase_order_items WHERE tenant_id = :t",
    "budgets_final": "SELECT count(*) FROM budgets WHERE tenant_id = :t AND status = 'FINAL'",
    "budgets_draft": "SELECT count(*) FROM budgets WHERE tenant_id = :t AND status = 'DRAFT'",
    "budget_lines_with_cost_center": "SELECT count(*) FROM budget_lines WHERE tenant_id = :t AND cost_center_id IS NOT NULL",
    "budget_lines_total": "SELECT count(*) FROM budget_lines WHERE tenant_id = :t",
    "cost_centers_active": "SELECT count(*) FROM cost_centers WHERE tenant_id = :t AND is_active",
    "expense_accounts": (
        "SELECT count(*) FROM chart_of_accounts a LEFT JOIN account_groups g ON g.id = a.group_id "
        "WHERE a.tenant_id = :t AND lower(coalesce(g.nature, '')) = 'expense'"
    ),
    "expense_groups": "SELECT count(*) FROM account_groups WHERE tenant_id = :t AND lower(coalesce(nature, '')) = 'expense'",
    "expense_lines_last_90d_with_cost_center": (
        "SELECT count(*) FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id "
        "JOIN chart_of_accounts a ON a.id = l.account_id LEFT JOIN account_groups g ON g.id = a.group_id "
        "WHERE l.tenant_id = :t AND lower(coalesce(g.nature, '')) = 'expense' "
        "AND v.voucher_date >= current_date - 90 AND l.cost_center_id IS NOT NULL"
    ),
    "expense_lines_last_90d": (
        "SELECT count(*) FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id "
        "JOIN chart_of_accounts a ON a.id = l.account_id LEFT JOIN account_groups g ON g.id = a.group_id "
        "WHERE l.tenant_id = :t AND lower(coalesce(g.nature, '')) = 'expense' AND v.voucher_date >= current_date - 90"
    ),
    "active_employees": "SELECT count(*) FROM hr_employees WHERE tenant_id = :t AND is_active",
    "employees_with_structure": (
        "SELECT count(DISTINCT employee_id) FROM hr_payroll_employee_structure_assignments "
        "WHERE tenant_id = :t AND effective_from <= current_date AND (effective_to IS NULL OR effective_to >= current_date)"
    ),
    "attendance_entries_this_month": (
        "SELECT count(*) FROM hr_attendance_entries WHERE tenant_id = :t "
        "AND attendance_date >= date_trunc('month', current_date)::date"
    ),
    "payroll_runs_finalized": (
        "SELECT count(*) FROM hr_payroll_runs WHERE tenant_id = :t "
        "AND status IN ('FINALIZED', 'CHECKED', 'APPROVED', 'POSTED')"
    ),
}

KIND_BREAKDOWN = (
    "SELECT coalesce(m.reference_type, '(none)') AS ref, coalesce(m.movement_kind, '(none)') AS kind, count(*) "
    "FROM stock_movements m JOIN items i ON i.id = m.item_id AND i.tenant_id = m.tenant_id "
    "JOIN stock_groups g ON g.id = i.stock_group_id AND g.tenant_id = i.tenant_id "
    "WHERE m.tenant_id = :t AND m.movement_type = 'IN' AND upper(coalesce(g.stock_nature, '')) = 'FINISHED_GOODS' "
    "GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20"
)


async def _audit(tenant_ids: list[int] | None) -> list[dict]:
    out: list[dict] = []
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET TRANSACTION READ ONLY"))
        if tenant_ids is None:
            tenant_ids = [int(r[0]) for r in (await db.execute(text("SELECT id FROM tenants ORDER BY id"))).all()]
        for tid in tenant_ids:
            row: dict = {"tenant_id": tid}
            for key, sql in QUERIES.items():
                try:
                    row[key] = int((await db.execute(text(sql), {"t": tid})).scalar() or 0)
                except Exception as exc:  # noqa: BLE001 - a missing table / column is reported, not fatal
                    await db.rollback()
                    await db.execute(text("SET TRANSACTION READ ONLY"))
                    row[key] = f"skipped: {type(exc).__name__}"
            try:
                row["fg_in_by_reference_and_kind"] = [
                    {"reference_type": r[0], "movement_kind": r[1], "count": int(r[2])}
                    for r in (await db.execute(text(KIND_BREAKDOWN), {"t": tid})).all()
                ]
            except Exception as exc:  # noqa: BLE001
                await db.rollback()
                await db.execute(text("SET TRANSACTION READ ONLY"))
                row["fg_in_by_reference_and_kind"] = f"skipped: {type(exc).__name__}"
            out.append(row)
        await db.rollback()
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tenant-id", type=int, action="append", help="limit to one tenant (repeatable)")
    parser.add_argument("--json", action="store_true", help="print JSON")
    args = parser.parse_args()
    rows = asyncio.run(_audit(args.tenant_id))
    if args.json:
        print(json.dumps(rows, indent=2))
        return
    for row in rows:
        print(f"--- tenant {row['tenant_id']}")
        for key, value in row.items():
            if key in ("tenant_id", "fg_in_by_reference_and_kind"):
                continue
            print(f"  {key}: {value}")
        kinds = row.get("fg_in_by_reference_and_kind")
        if isinstance(kinds, list) and kinds:
            print("  finished-goods IN movements by reference / kind:")
            for k in kinds:
                print(f"    {k['reference_type']} / {k['movement_kind']}: {k['count']}")


if __name__ == "__main__":
    main()
