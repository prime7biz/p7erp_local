"""
Comprehensive financier portal demo for Lakhsma (CLI wrapper).

Core logic: ``app.seeds.financier_full_demo``.

Prerequisite (same company code):
  docker compose exec backend python scripts/seed_lakhsma_interconnected_demo.py

Run:
  docker compose exec backend python scripts/seed_financier_full_demo.py --company-code LAKH806201
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.seeds.financier_full_demo import seed_financier_full_demo  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed full financier portal demo data (Lakhsma + facilities).")
    parser.add_argument(
        "--company-code",
        default="LAKH806201",
        help="Tenant company_code (default: LAKH806201).",
    )
    args = parser.parse_args()
    try:
        out = asyncio.run(seed_financier_full_demo(args.company_code))
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        raise SystemExit(1) from e
    print("Financier full demo seed finished.")
    if out.get("warning"):
        print(f"  WARNING: {out['warning']}")
    for k, v in out.items():
        if k not in ("counts", "base_seed", "warning"):
            print(f"  {k}: {v}")
    if "base_seed" in out and isinstance(out["base_seed"], dict):
        print("  base_seed (financier_portal_demo):")
        for k, v in out["base_seed"].items():
            if k != "counts":
                print(f"    {k}: {v}")
    if "counts" in out:
        print("  counts:")
        for k, v in out["counts"].items():
            if v or k == "financier_access_party_aligned":
                print(f"    {k}: {v}")


if __name__ == "__main__":
    main()
