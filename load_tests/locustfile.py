"""
P7 ERP Load Test — Locust test file.

Simulates concurrent ERP users: login, browse lists, create entries.

Run via Docker:
    docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up

Then open http://localhost:8089 in your browser.

Credentials: set LOADTEST_COMPANY_CODE, LOADTEST_USERNAME, LOADTEST_PASSWORD
in your `.env` file (or use defaults below). Optional: LOADTEST_USERS_JSON
for multiple rotating users, e.g.
[{"username":"admin","password":"secret"},{"username":"user2","password":"x"}]
"""

from __future__ import annotations

import json
import os
import random
from datetime import date, timedelta

from locust import HttpUser, task, between


def _company_code() -> str:
    return os.environ.get("LOADTEST_COMPANY_CODE", "DEMO").strip() or "DEMO"


def _test_users() -> list[dict[str, str]]:
    raw = os.environ.get("LOADTEST_USERS_JSON", "").strip()
    if raw:
        users = json.loads(raw)
        if not isinstance(users, list) or not users:
            raise ValueError("LOADTEST_USERS_JSON must be a non-empty JSON array")
        return users
    return [
        {
            "username": os.environ.get("LOADTEST_USERNAME", "admin").strip()
            or "admin",
            "password": os.environ.get("LOADTEST_PASSWORD", "admin123"),
        }
    ]


TEST_USERS = _test_users()
COMPANY_CODE = _company_code()


class ERPUser(HttpUser):
    """Simulates a logged-in ERP user browsing and creating records."""

    wait_time = between(1, 3)

    def on_start(self):
        """Log in and store auth headers for all subsequent requests."""
        creds = random.choice(TEST_USERS)
        response = self.client.post(
            "/api/v1/auth/login",
            json={
                "company_code": COMPANY_CODE,
                "username": creds["username"],
                "password": creds["password"],
            },
            name="/api/v1/auth/login",
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data["access_token"]
            self.tenant_id = str(data.get("tenant_id", ""))
            self.auth_headers = {
                "Authorization": f"Bearer {self.token}",
                "X-Tenant-Id": self.tenant_id,
            }
        else:
            self.token = None
            self.tenant_id = ""
            self.auth_headers = {}

    def _ok(self) -> bool:
        """Skip authenticated API calls if login failed."""
        return bool(self.auth_headers)

    def _get(self, path, **kwargs):
        if not self._ok():
            return
        return self.client.get(path, headers=self.auth_headers, **kwargs)

    def _post(self, path, json_body, **kwargs):
        if not self._ok():
            return
        return self.client.post(
            path, json=json_body, headers=self.auth_headers, **kwargs
        )

    @task(5)
    def list_orders(self):
        self._get("/api/v1/orders", name="/api/v1/orders")

    @task(3)
    def list_employees(self):
        self._get("/api/v1/hr/employees", name="/api/v1/hr/employees")

    @task(3)
    def list_inventory_items(self):
        self._get("/api/v1/inventory/items", name="/api/v1/inventory/items")

    @task(3)
    def list_vouchers(self):
        self._get("/api/v1/finance/vouchers", name="/api/v1/finance/vouchers")

    @task(2)
    def list_attendance_entries(self):
        self._get(
            "/api/v1/hr/attendance/entries",
            name="/api/v1/hr/attendance/entries",
        )

    @task(2)
    def list_departments(self):
        self._get("/api/v1/hr/departments", name="/api/v1/hr/departments")

    @task(2)
    def list_customers(self):
        self._get("/api/v1/customers", name="/api/v1/customers")

    @task(2)
    def list_inquiries(self):
        self._get("/api/v1/inquiries", name="/api/v1/inquiries")

    @task(2)
    def stock_summary(self):
        self._get(
            "/api/v1/inventory/stock-summary",
            name="/api/v1/inventory/stock-summary",
        )

    @task(1)
    def get_me(self):
        self._get("/api/v1/auth/me", name="/api/v1/auth/me")

    @task(1)
    def chart_of_accounts(self):
        self._get(
            "/api/v1/finance/chart-of-accounts",
            name="/api/v1/finance/chart-of-accounts",
        )

    @task(1)
    def list_warehouses(self):
        self._get(
            "/api/v1/inventory/warehouses",
            name="/api/v1/inventory/warehouses",
        )

    @task(1)
    def create_attendance_entry(self):
        """POST matches AttendanceEntryCreate in hr_attendance/schemas.py."""
        if not self._ok():
            return
        emp_id = int(os.environ.get("LOADTEST_EMPLOYEE_ID", "1"))
        # Random past date reduces duplicate (employee_id + date) collisions under load.
        att_date = date.today() - timedelta(days=random.randint(0, 400))
        with self.client.post(
            "/api/v1/hr/attendance/entries",
            json={
                "employee_id": emp_id,
                "attendance_date": att_date.isoformat(),
                "in_time": "09:00:00",
                "out_time": "18:00:00",
                "status": "PRESENT",
            },
            headers=self.auth_headers,
            catch_response=True,
            name="/api/v1/hr/attendance/entries [POST]",
        ) as response:
            if response.status_code == 201:
                response.success()
            elif response.status_code == 400 and "already exists" in (response.text or ""):
                response.success()
            elif response.status_code == 404:
                response.failure(
                    "Employee not found — set LOADTEST_EMPLOYEE_ID to a valid employee id "
                    "for your tenant (see GET /api/v1/hr/employees)."
                )
            elif response.status_code >= 400:
                response.failure(f"HTTP {response.status_code}: {response.text[:200]}")
            else:
                response.success()

    @task(1)
    def health_check(self):
        self.client.get("/health", name="/health")
