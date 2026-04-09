"""
Financier portal demo seed (CLI wrapper).

Implementation: ``app.seeds.financier_portal_demo``.

Prerequisites (same tenant / company code):
  - scripts/seed_lakhsma_interconnected_demo.py (or similar items/vendors)
  - scripts/seed_trade_import_export_workflow_demo.py --tenant-code <CODE>
  - scripts/seed_finance_demo.py  (optional)

Run inside Docker (from repo root):
  docker compose exec backend python scripts/seed_financier_portal_demo.py --company-code LAKH806201
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.seeds.financier_portal_demo import (  # noqa: E402
    DEFAULT_DEMO_EMAIL,
    DEFAULT_DEMO_PASSWORD,
    seed_financier_portal_demo,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed financier portal demo data for one tenant.")
    parser.add_argument(
        "--company-code",
        required=True,
        help="Tenant company_code (e.g. LAKH806201).",
    )
    parser.add_argument(
        "--email",
        default=DEFAULT_DEMO_EMAIL,
        help=f"Financier principal email (default: {DEFAULT_DEMO_EMAIL}).",
    )
    parser.add_argument(
        "--password",
        default=DEFAULT_DEMO_PASSWORD,
        help="Password when creating the principal (default: demo password).",
    )
    args = parser.parse_args()
    try:
        out = asyncio.run(
            seed_financier_portal_demo(
                args.company_code,
                demo_email=args.email,
                demo_password=args.password,
            )
        )
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        raise SystemExit(1) from e
    print("Financier portal demo seed finished.")
    for k, v in out.items():
        if k != "counts":
            print(f"  {k}: {v}")
    if "counts" in out:
        print("  counts:")
        for k, v in out["counts"].items():
            if v:
                print(f"    {k}: {v}")


if __name__ == "__main__":
    main()
