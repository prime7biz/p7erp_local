#!/usr/bin/env python3
"""Read-only report: historical vouchers touched by the accounting-correctness bugs.

Runs inside a READ ONLY transaction and never changes data. It only lists what an accountant
should review; any correction must be a reviewed, manual journal (never an automatic rewrite).

Checks:
  unbalanced_posted         POSTED vouchers whose base debits and credits differ by more than 0.01
  fx_posted_on_amount       POSTED foreign-currency vouchers whose ledger balances were moved by the
                            transaction amount instead of the base amount (posted before the fix)
  account_balance_drift     accounts whose cached balance differs from opening + posted lines
  note_multi_reduction      credit/debit notes with more than one live note bill, or with bills /
                            allocations while the note is not POSTED
  tds_double_debit          payments whose auto TDS created a separate Dr Vendor / Cr TDS journal
  payroll_unapplied         payroll / statutory remittance vouchers posted before the fix (their
                            ledger balances were never moved)
  receipt_over_allocation   vouchers that settled more party bills than their own amount

Usage::

    docker compose exec backend python scripts/report_accounting_correctness.py
    docker compose exec backend python scripts/report_accounting_correctness.py --tenant-id 12 --limit 50
    docker compose exec backend python scripts/report_accounting_correctness.py --json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from decimal import Decimal
from pathlib import Path

from sqlalchemy import text

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # noqa: E402

# Same rule as posting_core.line_base_amount_sql()
BASE = "(CASE WHEN vl.base_amount <> 0 OR vl.amount = 0 THEN vl.base_amount ELSE vl.amount * vl.exchange_rate END)"
# Same rule as advanced_voucher_service.voucher_in_books_clause()
IN_BOOKS = """(
    v.books_applied
    OR (
        upper(coalesce(v.voucher_type, '')) NOT IN ('STOCK_TRANSFER', 'MEMORANDUM')
        AND NOT v.is_memorandum
        AND ((upper(coalesce(v.voucher_type, '')) <> 'OPTIONAL' AND NOT v.is_optional) OR v.include_in_books)
        AND NOT v.is_post_dated
    )
)"""
NO_BASIS_MARKER = "coalesce(v.posted_snapshot_json, '') NOT LIKE '%\"balance_basis\"%'"

CHECKS: dict[str, str] = {
    "unbalanced_posted": f"""
        SELECT v.tenant_id, v.id AS voucher_id, v.voucher_number, v.voucher_date,
               sum(CASE WHEN vl.entry_type = 'DEBIT' THEN {BASE} ELSE 0 END) AS base_debit,
               sum(CASE WHEN vl.entry_type <> 'DEBIT' THEN {BASE} ELSE 0 END) AS base_credit
        FROM vouchers v JOIN voucher_lines vl ON vl.voucher_id = v.id
        WHERE v.status = 'POSTED' {{tenant}}
        GROUP BY v.tenant_id, v.id, v.voucher_number, v.voucher_date
        HAVING abs(sum(CASE WHEN vl.entry_type = 'DEBIT' THEN {BASE} ELSE -{BASE} END)) > 0.01
        ORDER BY v.tenant_id, v.voucher_date, v.id
    """,
    "fx_posted_on_amount": f"""
        SELECT v.tenant_id, v.id AS voucher_id, v.voucher_number, v.voucher_date, v.currency,
               sum(abs({BASE} - vl.amount)) AS total_line_difference
        FROM vouchers v JOIN voucher_lines vl ON vl.voucher_id = v.id
        WHERE v.status = 'POSTED' AND {IN_BOOKS} AND {NO_BASIS_MARKER} {{tenant}}
        GROUP BY v.tenant_id, v.id, v.voucher_number, v.voucher_date, v.currency
        HAVING sum(abs({BASE} - vl.amount)) > 0.01
        ORDER BY v.tenant_id, v.voucher_date, v.id
    """,
    "account_balance_drift": f"""
        WITH mv AS (
            SELECT vl.account_id,
                   sum(CASE WHEN vl.entry_type = 'DEBIT' THEN {BASE} ELSE 0 END) AS dr,
                   sum(CASE WHEN vl.entry_type <> 'DEBIT' THEN {BASE} ELSE 0 END) AS cr
            FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id
            WHERE v.status = 'POSTED' AND {IN_BOOKS}
            GROUP BY vl.account_id
        )
        SELECT a.tenant_id, a.id AS account_id, a.account_number, a.name, a.balance AS cached_balance,
               a.opening_balance + CASE WHEN a.normal_balance = 'debit'
                   THEN coalesce(mv.dr, 0) - coalesce(mv.cr, 0)
                   ELSE coalesce(mv.cr, 0) - coalesce(mv.dr, 0) END AS balance_from_lines
        FROM chart_of_accounts a LEFT JOIN mv ON mv.account_id = a.id
        WHERE abs(a.balance - (a.opening_balance + CASE WHEN a.normal_balance = 'debit'
                   THEN coalesce(mv.dr, 0) - coalesce(mv.cr, 0)
                   ELSE coalesce(mv.cr, 0) - coalesce(mv.dr, 0) END)) > 0.01 {{tenant_a}}
        ORDER BY a.tenant_id, a.id
    """,
    "note_multi_reduction": """
        SELECT v.tenant_id, v.id AS voucher_id, v.voucher_number, v.voucher_type, v.status,
               (SELECT count(*) FROM party_ledger_bills b
                 WHERE b.voucher_id = v.id AND b.status <> 'CANCELLED') AS live_bills,
               (SELECT count(*) FROM party_ledger_bill_allocations al WHERE al.voucher_id = v.id) AS allocations
        FROM vouchers v
        WHERE upper(v.voucher_type) IN ('CREDIT_NOTE', 'DEBIT_NOTE') {tenant}
          AND (
            (SELECT count(*) FROM party_ledger_bills b WHERE b.voucher_id = v.id AND b.status <> 'CANCELLED') > 1
            OR (v.status <> 'POSTED' AND (
                EXISTS (SELECT 1 FROM party_ledger_bills b WHERE b.voucher_id = v.id AND b.status <> 'CANCELLED')
                OR EXISTS (SELECT 1 FROM party_ledger_bill_allocations al WHERE al.voucher_id = v.id)))
          )
        ORDER BY v.tenant_id, v.id
    """,
    "tds_double_debit": """
        SELECT d.tenant_id, d.id AS deduction_id, d.voucher_id AS payment_voucher_id,
               d.tds_liability_voucher_id AS tds_journal_id, j.voucher_number AS tds_journal_number,
               j.status AS tds_journal_status, d.tds_amount
        FROM tds_deductions d JOIN vouchers j ON j.id = d.tds_liability_voucher_id
        WHERE d.voucher_id IS NOT NULL AND d.tds_liability_voucher_id <> d.voucher_id
          AND j.status = 'POSTED' {tenant_d}
        ORDER BY d.tenant_id, d.id
    """,
    "payroll_unapplied": f"""
        SELECT v.tenant_id, v.id AS voucher_id, v.voucher_number, v.voucher_date, v.source_module
        FROM vouchers v
        WHERE v.status = 'POSTED' AND v.source_module IN ('PAYROLL', 'PAYROLL_STATUTORY')
          AND {NO_BASIS_MARKER} {{tenant}}
        ORDER BY v.tenant_id, v.voucher_date, v.id
    """,
    "receipt_over_allocation": """
        WITH alloc AS (
            SELECT voucher_id, sum(allocated_amount) AS allocated
            FROM party_ledger_bill_allocations GROUP BY voucher_id
        ), cap AS (
            SELECT voucher_id, sum(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS debit_total
            FROM voucher_lines GROUP BY voucher_id
        )
        SELECT v.tenant_id, v.id AS voucher_id, v.voucher_number, v.voucher_type, v.status,
               alloc.allocated, coalesce(cap.debit_total, 0) AS voucher_amount
        FROM vouchers v JOIN alloc ON alloc.voucher_id = v.id LEFT JOIN cap ON cap.voucher_id = v.id
        WHERE alloc.allocated > coalesce(cap.debit_total, 0) + 0.01 {tenant}
        ORDER BY v.tenant_id, v.id
    """,
}


def _jsonable(value):
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


async def _run(tenant_id: int | None, limit: int) -> dict:
    params = {"tenant_id": tenant_id, "limit": limit}
    filters = {
        "tenant": "AND v.tenant_id = :tenant_id" if tenant_id else "",
        "tenant_a": "AND a.tenant_id = :tenant_id" if tenant_id else "",
        "tenant_d": "AND d.tenant_id = :tenant_id" if tenant_id else "",
    }
    report: dict = {"tenant_id": tenant_id, "checks": {}}
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET TRANSACTION READ ONLY"))
        for name, sql in CHECKS.items():
            query = sql.format(**filters)
            try:
                total = int((await db.execute(text(f"SELECT count(*) FROM ({query}) q"), params)).scalar() or 0)
                rows = (await db.execute(text(f"{query} LIMIT :limit"), params)).mappings().all()
                report["checks"][name] = {
                    "count": total,
                    "rows": [{k: _jsonable(v) for k, v in r.items()} for r in rows],
                }
            except Exception as exc:  # report and continue; never stop the whole scan
                await db.rollback()
                await db.execute(text("SET TRANSACTION READ ONLY"))
                report["checks"][name] = {"error": str(exc).splitlines()[0]}
        await db.rollback()
    return report


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--tenant-id", type=int, default=None)
    p.add_argument("--limit", type=int, default=100, help="rows shown per check (count is always total)")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()
    report = asyncio.run(_run(args.tenant_id, args.limit))
    if args.json:
        print(json.dumps(report, indent=2))
        return
    for name, result in report["checks"].items():
        if "error" in result:
            print(f"{name}: ERROR {result['error']}")
            continue
        print(f"{name}: {result['count']}")
        for row in result["rows"]:
            print("   " + ", ".join(f"{k}={v}" for k, v in row.items()))


if __name__ == "__main__":
    main()
