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

Optional ``--link-employee-code EMP-0000001`` links the user to that employee (for the My HR screens).
The employee must not be linked to another login; any earlier link of this user is removed first.
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
from app.models import Employee, Role, Tenant, User

USERNAME = "tutorial.guide"


async def _link_employee(db, tenant_id: int, user: User, employee_code: str) -> bool:
    employee = (
        await db.execute(
            select(Employee).where(Employee.tenant_id == tenant_id, Employee.employee_code == employee_code)
        )
    ).scalar_one_or_none()
    if employee is None:
        print(f"No employee {employee_code} in this tenant; nothing linked.")
        return False
    if employee.user_id is not None and employee.user_id != user.id:
        print(f"Employee {employee_code} is already linked to another login; nothing linked.")
        return False
    previous = (
        await db.execute(
            select(Employee).where(Employee.tenant_id == tenant_id, Employee.user_id == user.id, Employee.id != employee.id)
        )
    ).scalars().all()
    for row in previous:
        row.user_id = None
    await db.flush()
    employee.user_id = user.id
    print(f"Linked '{USERNAME}' to employee {employee_code}.")
    return True


async def main(company_code: str, password: str, link_employee_code: str | None = None) -> None:
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
        if link_employee_code:
            await db.flush()
            await _link_employee(db, tenant.id, user, link_employee_code.strip())
        await db.commit()
        print(f"{action} user '{USERNAME}' in tenant {tenant.company_code} (role: {admin_role.display_name}).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--company-code", default="LAKH806201")
    parser.add_argument("--link-employee-code", default=None, help="Link the user to this employee (My HR screens)")
    args = parser.parse_args()

    if get_settings().app_env.lower() == "production":
        print("Refusing to run: APP_ENV is production. This script is for local tutorial capture only.")
        sys.exit(1)
    pw = os.getenv("TUTORIAL_CAPTURE_PASSWORD", "")
    if len(pw) < 8:
        print("Set TUTORIAL_CAPTURE_PASSWORD (at least 8 characters).")
        sys.exit(1)
    asyncio.run(main(args.company_code, pw, args.link_employee_code))
