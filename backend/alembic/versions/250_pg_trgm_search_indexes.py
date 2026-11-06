"""Trigram (pg_trgm) GIN indexes for "contains" searches in the Ctrl+K global search.

`column ILIKE '%text%'` cannot use a normal B-tree index, so every keystroke scanned all of a
tenant's rows. A GIN index with `gin_trgm_ops` lets PostgreSQL find matches directly.
The indexed columns are exactly the ones searched in `app/modules/global_search/router.py`
(plain columns with ILIKE, so no lower(...) expression is needed).

Needs the pg_trgm extension. It is a "trusted" extension (PostgreSQL 13+), so the database
owner can create it without superuser; if the app's DB user is neither owner nor superuser,
run `CREATE EXTENSION IF NOT EXISTS pg_trgm;` once as an admin before upgrading.

Kept in its own revision so it can be rolled back separately: `alembic downgrade 249`.
Downgrade drops the indexes but leaves the pg_trgm extension installed (harmless, and other
objects may depend on it).

Revision ID: 250
Revises: 249
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "250"
down_revision: Union[str, None] = "249"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, column) searched by global search -> index name ix_<table>_<column>_trgm
SEARCH_COLUMNS: list[tuple[str, str]] = [
    ("customers", "name"),
    ("customers", "customer_code"),
    ("orders", "order_code"),
    ("orders", "style_ref"),
    ("purchase_orders", "po_code"),
    ("purchase_orders", "supplier_name"),
    ("vouchers", "voucher_number"),
    ("items", "name"),
    ("items", "item_code"),
    ("vendors", "name"),
    ("vendors", "vendor_code"),
    ("hr_employees", "first_name"),
    ("hr_employees", "last_name"),
    ("hr_employees", "employee_code"),
]

INDEXES: list[tuple[str, str]] = [
    (f"ix_{table}_{column}_trgm", f"{table} USING gin ({column} gin_trgm_ops)") for table, column in SEARCH_COLUMNS
]


def _create_index_concurrently(name: str, target: str) -> None:
    # A failed CONCURRENTLY build leaves an INVALID index behind; IF NOT EXISTS would then skip it.
    is_invalid = op.get_bind().execute(
        sa.text("SELECT NOT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:name)"),
        {"name": name},
    ).scalar()
    if is_invalid:
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
    op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {target}")


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    with op.get_context().autocommit_block():
        for name, target in INDEXES:
            _create_index_concurrently(name, target)


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for name, _target in reversed(INDEXES):
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
