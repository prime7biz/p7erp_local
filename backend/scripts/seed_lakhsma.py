"""
One-off seed: tenant "Lakhsma Innerwear Limited" and super-admin user shahriyar (password Lakhsma123).
Run from backend dir: python scripts/seed_lakhsma.py
Requires DATABASE_URL or default postgres in .env.
After running, open /login and sign in with the printed company code, username, and password;
you will be redirected to /app Dashboard.
"""
import asyncio
import sys
from pathlib import Path

# Ensure backend app is importable when run as script
backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import Tenant, Role, User
from app.models.tenant import TenantType
from app.common.auth import hash_password


COMPANY_CODE = "LAKHSMA4821"
TENANT_NAME = "Lakhsma Innerwear Limited"
USERNAME = "shahriyar"
EMAIL = "shahriyar@lakhsma.com"
PASSWORD = "Lakhsma123"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # 1. Skip if tenant already exists (idempotent)
        existing = await db.execute(
            select(Tenant).where(Tenant.company_code == COMPANY_CODE)
        )
        if existing.scalar_one_or_none() is not None:
            print(f"Tenant with company_code {COMPANY_CODE} already exists. Skipping seed.")
            return

        # 2. Create tenant
        tenant = Tenant(
            name=TENANT_NAME,
            domain=None,
            tenant_type=TenantType.both,
            company_code=COMPANY_CODE,
        )
        db.add(tenant)
        await db.flush()

        # 3. Create Admin and User roles (same as tenant router)
        admin_role = Role(
            tenant_id=tenant.id,
            name="admin",
            display_name="Admin",
            permissions={},
        )
        db.add(admin_role)
        await db.flush()
        user_role = Role(
            tenant_id=tenant.id,
            name="user",
            display_name="User",
            permissions={},
        )
        db.add(user_role)
        await db.flush()

        # 4. Create super-admin user
        user = User(
            tenant_id=tenant.id,
            role_id=admin_role.id,
            username=USERNAME,
            email=EMAIL,
            password_hash=hash_password(PASSWORD),
            first_name="Shahriyar",
            last_name=None,
        )
        db.add(user)
        await db.flush()

        await db.commit()
        print(f"Created tenant id={tenant.id}, company_code={tenant.company_code}")
        print(f"Created user id={user.id}, username={user.username} (Admin role)")
        print("")
        print("Login with:")
        print(f"  Company Code: {COMPANY_CODE}")
        print(f"  Username:     {USERNAME}")
        print(f"  Password:     {PASSWORD}")
        print("")
        print("Then open /login and you will be redirected to /app Dashboard.")


if __name__ == "__main__":
    asyncio.run(main())
