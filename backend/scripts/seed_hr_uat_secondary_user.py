"""
Ensure a second user exists in tenant LAKHSMA4821 for UAT role/security checks.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.common.auth import hash_password
from app.database import AsyncSessionLocal
from app.models import Role, Tenant, User


async def main() -> None:
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.company_code == "LAKHSMA4821"))).scalars().first()
        if not tenant:
            raise RuntimeError("Tenant LAKHSMA4821 not found")

        existing = (
            await db.execute(
                select(User).where(User.tenant_id == tenant.id, User.username == "hrmanager")
            )
        ).scalars().first()
        if existing:
            print("Secondary user already exists.")
            return

        role = (
            await db.execute(
                select(Role).where(Role.tenant_id == tenant.id, Role.name.in_(["manager", "admin", "user"]))
            )
        ).scalars().first()
        if not role:
            raise RuntimeError("No role found to assign new user")

        user = User(
            tenant_id=tenant.id,
            role_id=role.id,
            username="hrmanager",
            email="hrmanager@lakhsma.com",
            password_hash=hash_password("Lakhsma123"),
            first_name="HR",
            last_name="Manager",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        print("Created secondary user: hrmanager / Lakhsma123")


if __name__ == "__main__":
    asyncio.run(main())
