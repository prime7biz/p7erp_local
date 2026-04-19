"""items.default_cost + currency_exchange_rates.exchange_rate -> Numeric (Phase 3C).

Revision ID: 170
Revises: 169
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "170"
down_revision: Union[str, None] = "169"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PG_DECIMAL_LIKE = "^-?[0-9]+(\\.[0-9]*)?$"


def _scrub_nn(table: str, col: str, default_lit: str) -> None:
    op.execute(
        sa.text(
            f"UPDATE {table} SET {col} = '{default_lit}' "
            f"WHERE {col} IS NOT NULL AND trim({col}::text) = ''"
        )
    )
    op.execute(
        sa.text(
            f"UPDATE {table} SET {col} = '{default_lit}' "
            f"WHERE {col} IS NOT NULL AND trim({col}::text) !~ '{_PG_DECIMAL_LIKE}'"
        )
    )


def _prec_tuple(prec_sql: str) -> tuple[int, int]:
    inner = prec_sql.replace("numeric(", "").replace(")", "")
    a, b = inner.split(",")
    return int(a.strip()), int(b.strip())


def _alter_nn(
    table: str,
    col: str,
    *,
    prec_sql: str,
    existing_len: int,
    server_default_sql: str | None,
) -> None:
    op.execute(sa.text(f"ALTER TABLE {table} ALTER COLUMN {col} DROP DEFAULT"))
    op.alter_column(
        table,
        col,
        existing_type=sa.String(length=existing_len),
        type_=sa.Numeric(*_prec_tuple(prec_sql)),
        existing_nullable=False,
        postgresql_using=f"NULLIF(trim({col}::text), '')::{prec_sql}",
    )
    if server_default_sql is not None:
        op.execute(sa.text(f"ALTER TABLE {table} ALTER COLUMN {col} SET DEFAULT {server_default_sql}"))


def upgrade() -> None:
    _scrub_nn("items", "default_cost", "0")
    _alter_nn(
        "items",
        "default_cost",
        prec_sql="numeric(18,4)",
        existing_len=32,
        server_default_sql="0",
    )

    _scrub_nn("currency_exchange_rates", "exchange_rate", "1")
    _alter_nn(
        "currency_exchange_rates",
        "exchange_rate",
        prec_sql="numeric(18,6)",
        existing_len=24,
        server_default_sql=None,
    )


def downgrade() -> None:
    def _back(table: str, col: str, *, prec: str, strlen: int, null_lit: str) -> None:
        op.execute(sa.text(f"ALTER TABLE {table} ALTER COLUMN {col} DROP DEFAULT"))
        if prec == "18,4":
            fmt = "FM999999999999999999.9999"
        elif prec == "18,6":
            fmt = "FM999999999999999999.999999"
        else:
            fmt = "FM9999999999.9999"
        op.alter_column(
            table,
            col,
            existing_type=sa.Numeric(*[int(x) for x in prec.split(",")]),
            type_=sa.String(length=strlen),
            existing_nullable=False,
            postgresql_using=(
                f"CASE WHEN {col} IS NULL THEN '{null_lit}' "
                f"ELSE trim(to_char({col}, '{fmt}')) END"
            ),
        )

    _back("currency_exchange_rates", "exchange_rate", prec="18,6", strlen=24, null_lit="1")
    _back("items", "default_cost", prec="18,4", strlen=32, null_lit="0")
    op.execute(sa.text("ALTER TABLE items ALTER COLUMN default_cost SET DEFAULT '0'"))
