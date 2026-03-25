"""Create the first platform admin user (run once). Usage: python -m scripts.seed_platform_admin USERNAME EMAIL PASSWORD"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.common.auth import hash_password
from app.database import AsyncSessionLocal
from app.models import PlatformAdmin


async def main() -> None:
    if len(sys.argv) < 4:
        print("Usage: python -m scripts.seed_platform_admin USERNAME EMAIL PASSWORD")
        sys.exit(1)
    username, email, password = sys.argv[1], sys.argv[2], sys.argv[3]
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(PlatformAdmin).where(PlatformAdmin.username == username))
        if r.scalar_one_or_none():
            print("Admin already exists:", username)
            return
        a = PlatformAdmin(
            username=username.strip(),
            email=email.strip(),
            password_hash=await hash_password(password),
            role="super_admin",
        )
        db.add(a)
        await db.commit()
        print("Created platform admin id=", a.id)


if __name__ == "__main__":
    asyncio.run(main())
