#!/usr/bin/env python3
"""Read-only scan for rows whose foreign key points at another tenant's record.

Outputs only table/column names and aggregate counts (no ids, names or amounts). Runs inside a
READ ONLY transaction and never changes data. Relations whose table/column does not exist in the
connected database are reported as skipped.

Usage::

    docker compose exec backend python scripts/check_cross_tenant_links.py
    docker compose exec backend python scripts/check_cross_tenant_links.py --json
    docker compose exec backend python scripts/check_cross_tenant_links.py --per-tenant   # counts per child tenant_id

Non-zero counts need human triage (see docs/erp-modernization/private repair proposal) before any
cleanup or before adding composite tenant foreign keys. Do not delete or relink automatically.
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

# (child_table, fk_column, parent_table) — both tables carry tenant_id.
RELATIONS: list[tuple[str, str, str]] = [
    ("bom_items", "item_id", "items"),
    ("bom_items", "preferred_vendor_id", "vendors"),
    ("items", "preferred_vendor_id", "vendors"),
    ("marker_plans", "order_id", "orders"),
    ("marker_plans", "style_id", "garment_styles"),
    ("lay_plans", "marker_plan_id", "marker_plans"),
    ("lay_plans", "fabric_item_id", "items"),
    ("cut_tickets", "lay_plan_id", "lay_plans"),
    ("cutting_bundles", "order_id", "orders"),
    ("cutting_bundles", "style_id", "garment_styles"),
    ("cutting_bundles", "issued_to_line_id", "sewing_lines"),
    ("sewing_line_style_configs", "line_id", "sewing_lines"),
    ("sewing_line_style_configs", "order_id", "orders"),
    ("sewing_line_style_configs", "style_id", "garment_styles"),
    ("sewing_line_style_configs", "ob_id", "operation_bulletins"),
    ("sewing_line_style_configs", "shift_id", "production_shifts"),
    ("hourly_production_entries", "line_id", "sewing_lines"),
    ("hourly_production_entries", "machine_id", "department_machines"),
    ("hourly_production_entries", "order_id", "orders"),
    ("hourly_production_entries", "style_id", "garment_styles"),
    ("hourly_production_entries", "shift_id", "production_shifts"),
    ("hourly_production_entries", "line_style_config_id", "sewing_line_style_configs"),
    ("operation_bulletins", "style_id", "garment_styles"),
    ("line_balance_runs", "ob_id", "operation_bulletins"),
    ("line_balance_runs", "line_id", "sewing_lines"),
    ("dye_batches", "machine_id", "department_machines"),
    ("dye_batches", "recipe_id", "dye_recipes"),
    ("dye_batches", "fabric_item_id", "items"),
    ("dye_batches", "order_id", "orders"),
    ("production_cost_inputs", "line_id", "sewing_lines"),
    ("production_cost_inputs", "shift_id", "production_shifts"),
    ("wip_journals", "order_id", "orders"),
    ("wip_journals", "cost_center_id", "cost_centers"),
    ("production_qc_checks", "shift_id", "production_shifts"),
    ("knitting_work_orders", "machine_id", "department_machines"),
    ("knitting_work_orders", "warehouse_id", "warehouses"),
    ("knitting_work_orders", "output_warehouse_id", "warehouses"),
    ("knitting_work_orders", "delivery_challan_id", "delivery_challans"),
    ("knitting_work_orders", "gate_pass_id", "enhanced_gate_passes"),
    ("knitting_work_orders", "knitting_plan_id", "knitting_plans"),
    ("knitting_work_orders", "linked_order_id", "orders"),
    ("purchase_orders", "vendor_id", "vendors"),
    ("purchase_orders", "source_order_id", "orders"),
    ("purchase_orders", "source_bom_id", "boms"),
    ("purchase_orders", "btb_lc_id", "btb_lcs"),
    ("purchase_order_items", "item_id", "items"),
    ("purchase_order_items", "warehouse_id", "warehouses"),
    ("purchase_order_items", "source_order_id", "orders"),
    ("goods_receiving", "vendor_id", "vendors"),
    ("goods_receiving", "purchase_order_id", "purchase_orders"),
    ("stock_serials", "warehouse_id", "warehouses"),
    ("stock_serials", "dc_item_id", "delivery_challan_items"),
    ("stock_movements", "item_id", "items"),
    ("stock_movements", "warehouse_id", "warehouses"),
    ("inter_department_transfers", "job_work_vendor_id", "vendors"),
    ("inter_department_transfers", "linked_order_id", "orders"),
    ("inter_department_transfers", "source_batch_id", "stock_batches"),
    ("process_order_cost_lines", "vendor_id", "vendors"),
    ("enhanced_gate_passes", "challan_id", "delivery_challans"),
    ("wastage_transactions", "item_id", "items"),
    ("wastage_transactions", "reason_id", "wastage_reasons"),
    ("facilities", "linked_btb_lc_id", "btb_lcs"),
    ("facilities", "linked_master_contract_id", "master_contracts"),
    ("facilities", "linked_bank_account_id", "bank_accounts"),
    ("facilities", "gl_liability_account_id", "chart_of_accounts"),
    ("facilities", "gl_interest_expense_account_id", "chart_of_accounts"),
    ("facilities", "gl_interest_payable_account_id", "chart_of_accounts"),
    ("facilities", "gl_penalty_expense_account_id", "chart_of_accounts"),
    ("facilities", "repayment_source_account_id", "chart_of_accounts"),
    ("facility_utilizations", "linked_btb_lc_id", "btb_lcs"),
    ("facility_utilizations", "linked_purchase_order_id", "purchase_orders"),
    ("master_contracts", "cost_center_id", "cost_centers"),
    ("btb_lcs", "bank_account_id", "bank_accounts"),
    ("proforma_invoices", "shipper_bank_account_id", "bank_accounts"),
    ("voucher_lines", "account_id", "chart_of_accounts"),
    ("voucher_lines", "cost_center_id", "cost_centers"),
    ("voucher_classes", "default_ledger_id", "chart_of_accounts"),
    ("voucher_classes", "default_cost_center_id", "cost_centers"),
    ("recurring_voucher_templates", "voucher_class_id", "voucher_classes"),
    ("trade_documents", "shipment_id", "shipments"),
    ("bonded_warehouse_entries", "trade_case_id", "trade_cases"),
    ("bonded_warehouse_entries", "btb_lc_id", "btb_lcs"),
]


async def _columns(db) -> set[tuple[str, str]]:
    rows = await db.execute(
        text("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'")
    )
    return {(t, c) for t, c in rows.all()}


async def _scan(per_tenant: bool) -> dict:
    out: list[dict] = []
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET TRANSACTION READ ONLY"))
        cols = await _columns(db)
        for child, fk, parent in RELATIONS:
            needed = {(child, fk), (child, "tenant_id"), (parent, "id"), (parent, "tenant_id")}
            if not needed <= cols:
                out.append({"table": child, "column": fk, "parent": parent, "status": "skipped (not in schema)"})
                continue
            # Identifiers come from the constant list above, never from user input.
            join = f'FROM "{child}" c JOIN "{parent}" p ON p.id = c."{fk}" WHERE c.tenant_id <> p.tenant_id'
            n = int((await db.execute(text(f"SELECT count(*) {join}"))).scalar() or 0)
            row: dict = {"table": child, "column": fk, "parent": parent, "cross_tenant_rows": n}
            if per_tenant and n:
                by = await db.execute(text(f"SELECT c.tenant_id, count(*) {join} GROUP BY c.tenant_id ORDER BY 1"))
                row["by_child_tenant_id"] = {str(t): int(k) for t, k in by.all()}
            out.append(row)
        await db.rollback()
    flagged = [r for r in out if r.get("cross_tenant_rows")]
    return {
        "relations_checked": sum(1 for r in out if "cross_tenant_rows" in r),
        "relations_skipped": sum(1 for r in out if "status" in r),
        "relations_with_cross_tenant_rows": len(flagged),
        "total_cross_tenant_rows": sum(r["cross_tenant_rows"] for r in flagged),
        "results": out,
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--json", action="store_true")
    p.add_argument("--per-tenant", action="store_true")
    args = p.parse_args()
    report = asyncio.run(_scan(args.per_tenant))
    if args.json:
        print(json.dumps(report, indent=2))
        return
    print(
        f"checked={report['relations_checked']} skipped={report['relations_skipped']} "
        f"flagged_relations={report['relations_with_cross_tenant_rows']} "
        f"flagged_rows={report['total_cross_tenant_rows']}"
    )
    for r in report["results"]:
        if r.get("cross_tenant_rows") or "status" in r:
            print(f"  {r['table']}.{r['column']} -> {r['parent']}: {r.get('cross_tenant_rows', r.get('status'))}")


if __name__ == "__main__":
    main()
