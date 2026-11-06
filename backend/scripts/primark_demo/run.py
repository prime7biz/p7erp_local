"""Run the Primark full order-execution demo, stage by stage.

    docker compose exec backend python scripts/primark_demo/run.py              # all stages, saved
    docker compose exec backend python scripts/primark_demo/run.py --dry-run    # all stages, rolled back
    docker compose exec backend python scripts/primark_demo/run.py --until 3    # stages 1..3 only

Every stage is idempotent: records are found by their fixed PRM-* codes and only created when missing.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib
import sys
import traceback
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from primark_demo.common import demo_session, load_context  # noqa: E402

STAGES = [
    ("stage1_sales", "Sales: style, inquiry, quotation, order, PI, sales contract"),
    ("stage2_merch", "Merchandising: BOM, samples, TNA follow-up"),
    ("stage3_procurement", "Procurement & stores: POs, BTB LC, GRN, QC, transfer, material issue"),
    ("stage4_production", "Production & job work: cutting, print job work, sewing, QC, finished goods"),
    ("stage5_export", "Export: packing, delivery challan, gate pass, commercial invoice, shipment"),
    ("stage6_finance", "Accounting: purchase, job work, payment, sales and realisation vouchers"),
]


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="run everything, then roll back")
    parser.add_argument("--until", type=int, default=len(STAGES), help="last stage number to run")
    parser.add_argument("--only", type=int, help="run just this stage number")
    args = parser.parse_args()

    selected = [(i, *s) for i, s in enumerate(STAGES, start=1)
                if (args.only is None and i <= args.until) or i == args.only]

    async with demo_session(args.dry_run) as db:
        ctx = await load_context(db)
        print(f"Tenant {ctx.tenant.name} (id {ctx.tenant_id}), customer {ctx.customer.name} "
              f"({ctx.customer.customer_code}){'  [DRY RUN]' if args.dry_run else ''}")
        for number, module_name, title in selected:
            print(f"\nStage {number} – {title}")
            module = importlib.import_module(f"primark_demo.{module_name}")
            try:
                await module.run(db, ctx)
                await db.commit()
            except Exception:
                traceback.print_exc()
                await db.rollback()
                print(f"Stage {number} FAILED – later stages skipped.")
                return 1
    print("\nDone." + (" (dry run – nothing was saved)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
