"""
Local-only: create (or reset) a dedicated "Tutorial Guide" user for capturing Help & Tutorials
screenshots and videos with `tools/tutorial-capture/`.

Why a separate user: the ERP allows one session per user, so capturing with your own account
would keep signing you out of your browser (and you signing in would break the capture).

The user gets the same role as the tenant's existing admin user, so every screen is visible.
Refuses to run when APP_ENV=production.

Usage:
  docker compose exec -e TUTORIAL_CAPTURE_PASSWORD=<password> backend \
      python scripts/seed_tutorial_capture_user.py --company-code LAKH806201
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.common.auth import hash_password
from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import Role, Tenant, User

USERNAME = "tutorial.guide"


async def main(company_code: str, password: str) -> None:
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.company_code == company_code))).scalar_one_or_none()
        if tenant is None:
            print(f"No tenant with company code {company_code}.")
            return

        admin_role = (
            await db.execute(select(Role).where(Role.tenant_id == tenant.id, Role.name == "admin"))
        ).scalar_one_or_none()
        if admin_role is None:
            print("Tenant has no 'admin' role; nothing created.")
            return

        user = (
            await db.execute(select(User).where(User.tenant_id == tenant.id, User.username == USERNAME))
        ).scalar_one_or_none()
        if user is None:
            user = User(
                tenant_id=tenant.id,
                role_id=admin_role.id,
                username=USERNAME,
                email=f"{USERNAME}@example.com",
                password_hash=await hash_password(password),
                first_name="Tutorial",
                last_name="Guide",
                designation="Help & Tutorials",
                is_active=True,
            )
            db.add(user)
            action = "Created"
        else:
            user.role_id = admin_role.id
            user.password_hash = await hash_password(password)
            user.is_active = True
            user.failed_login_count = 0
            user.locked_at = None
            action = "Reset"
        await db.commit()
        print(f"{action} user '{USERNAME}' in tenant {tenant.company_code} (role: {admin_role.display_name}).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--company-code", default="LAKH806201")
    args = parser.parse_args()

    if get_settings().app_env.lower() == "production":
        print("Refusing to run: APP_ENV is production. This script is for local tutorial capture only.")
        sys.exit(1)
    pw = os.getenv("TUTORIAL_CAPTURE_PASSWORD", "")
    if len(pw) < 8:
        print("Set TUTORIAL_CAPTURE_PASSWORD (at least 8 characters).")
        sys.exit(1)
    asyncio.run(main(args.company_code, pw))
