"""Local only: switch on the new finance screens for one demo tenant.

Sets the strict flags finance_hubs_v2, finance_statements_v2, finance_control_tower_v2, finance_budget_analytics_v2
and finance_ai_insights_v2 to true on that tenant's feature_flags (every other key is kept) and prints them.
Refuses to run unless APP_ENV is a development environment (`app.common.demo_credentials.is_development_env`).

Usage (inside Docker):
  docker compose exec -T backend python scripts/finance_enable_demo.py --company-code LAKH806201
Rollback: set the same keys to false in Settings -> Configuration (or remove them).
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.common import demo_credentials  # noqa: E402
from app.common.rls import bind_session_bypass, bind_session_tenant  # noqa: E402
from app.common.tenant_feature_keys import (  # noqa: E402
    FINANCE_AI_INSIGHTS_V2,
    FINANCE_BUDGET_ANALYTICS_V2,
    FINANCE_CONTROL_TOWER_V2,
    FINANCE_HUBS_V2,
    FINANCE_STATEMENTS_V2,
)
from app.database import AsyncSessionLocal  # noqa: E402
from app.models import Tenant  # noqa: E402

FINANCE_DEMO_FLAGS: tuple[str, ...] = (
    FINANCE_HUBS_V2,
    FINANCE_STATEMENTS_V2,
    FINANCE_CONTROL_TOWER_V2,
    FINANCE_BUDGET_ANALYTICS_V2,
    FINANCE_AI_INSIGHTS_V2,
)


def refuse_outside_development() -> str | None:
    """A refusal message outside development, else None."""
    if demo_credentials.is_development_env():
        return None
    return "Refusing to run: APP_ENV is not a development environment. This script is for the local demo only."


def merged_flags(existing: dict | None) -> dict:
    return {**(existing if isinstance(existing, dict) else {}), **{key: True for key in FINANCE_DEMO_FLAGS}}


async def enable_finance_demo(db, company_code: str) -> dict | None:
    """Set the flags on the tenant (caller commits). None when the company code is unknown."""
    await bind_session_bypass(db)
    tenant = (await db.execute(select(Tenant).where(Tenant.company_code == company_code))).scalar_one_or_none()
    if tenant is None:
        return None
    await bind_session_tenant(db, tenant.id)
    tenant.feature_flags = merged_flags(tenant.feature_flags)
    await db.flush()
    return {key: tenant.feature_flags.get(key) for key in FINANCE_DEMO_FLAGS}


async def main(company_code: str) -> int:
    refusal = refuse_outside_development()
    if refusal:
        print(refusal)
        return 1
    async with AsyncSessionLocal() as db:
        flags = await enable_finance_demo(db, company_code)
        if flags is None:
            print(f"No tenant with company code {company_code}.")
            return 2
        await db.commit()
    print(f"Finance flags for {company_code}:")
    for key, value in flags.items():
        print(f"  {key} = {str(value).lower()}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--company-code", required=True)
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.company_code.strip())))
