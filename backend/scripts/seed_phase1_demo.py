"""
Phase 1.5 full end-to-end demo seed (idempotent).

Run (Docker):
  docker compose exec backend python scripts/seed_phase1_demo.py --tenant=demo --reset

Options:
  --tenant / --company-code   Company code (default DEMO; alias: demo → DEMO)
  --reset                     Purge DEMO-* rows then reseed
  --force                     Allow non-DEMO company codes (tests only)
  --no-create-tenant          Fail if tenant missing
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # noqa: E402
from app.seeds.phase1_demo import print_seed_report, run_phase1_demo_seed  # noqa: E402


def _normalize_tenant(raw: str | None) -> str:
    code = (raw or "DEMO").strip()
    if code.lower() == "demo":
        return "DEMO"
    return code.upper()


async def _run(args: argparse.Namespace) -> None:
    company_code = _normalize_tenant(args.tenant or args.company_code)
    async with AsyncSessionLocal() as db:
        result = await run_phase1_demo_seed(
            db,
            company_code=company_code,
            reset=bool(args.reset),
            force=bool(args.force),
            create_tenant=not bool(args.no_create_tenant),
        )
    print_seed_report(result)


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 1.5 demo seed")
    parser.add_argument("--tenant", default=None, help="Tenant slug/company code (demo → DEMO)")
    parser.add_argument("--company-code", default=None, help="Alias for --tenant")
    parser.add_argument("--reset", action="store_true", help="Purge DEMO markers and reseed")
    parser.add_argument("--force", action="store_true", help="Allow non-DEMO tenants (tests)")
    parser.add_argument(
        "--no-create-tenant",
        action="store_true",
        help="Do not create tenant if missing",
    )
    args = parser.parse_args()
    if not args.tenant and not args.company_code:
        args.tenant = "demo"
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
