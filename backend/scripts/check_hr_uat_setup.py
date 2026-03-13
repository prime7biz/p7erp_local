"""
Quick setup checks for HR UAT.

Run:
  python scripts/check_hr_uat_setup.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import func, select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import Tenant, User


async def main() -> None:
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.company_code == "LAKHSMA4821"))).scalars().first()
        if not tenant:
            print("tenant_found=False")
            print("tenant_user_count=0")
            return
        user_count = (
            await db.execute(select(func.count()).select_from(User).where(User.tenant_id == tenant.id))
        ).scalar() or 0
        print("tenant_found=True")
        print(f"tenant_user_count={int(user_count)}")


if __name__ == "__main__":
    asyncio.run(main())
