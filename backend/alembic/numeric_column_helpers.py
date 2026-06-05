"""Reusable helpers for String -> Numeric Alembic migrations (go-live remediation)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

_PG_DECIMAL_LIKE = "^-?[0-9]+(\\.[0-9]*)?$"


def prec_tuple(prec_sql: str) -> tuple[int, int]:
    inner = prec_sql.replace("numeric(", "").replace(")", "")
    a, b = inner.split(",")
    return int(a.strip()), int(b.strip())


def scrub_string_decimal(
    table: str,
    col: str,
    *,
    default_lit: str | None = None,
    nullable: bool = False,
) -> None:
    """Normalize empty/invalid decimal strings before ALTER TYPE."""
    if nullable:
        op.execute(
            sa.text(
                f"UPDATE {table} SET {col} = NULL "
                f"WHERE {col} IS NOT NULL AND trim({col}::text) = ''"
            )
        )
        op.execute(
            sa.text(
                f"UPDATE {table} SET {col} = NULL "
                f"WHERE {col} IS NOT NULL AND trim({col}::text) !~ '{_PG_DECIMAL_LIKE}'"
            )
        )
    else:
        lit = default_lit or "0"
        op.execute(
            sa.text(
                f"UPDATE {table} SET {col} = '{lit}' "
                f"WHERE {col} IS NOT NULL AND trim({col}::text) = ''"
            )
        )
        op.execute(
            sa.text(
                f"UPDATE {table} SET {col} = '{lit}' "
                f"WHERE {col} IS NOT NULL AND trim({col}::text) !~ '{_PG_DECIMAL_LIKE}'"
            )
        )


def alter_string_to_numeric(
    table: str,
    col: str,
    *,
    prec_sql: str,
    existing_len: int = 32,
    nullable: bool = False,
    server_default_sql: str | None = None,
) -> None:
    op.execute(sa.text(f"ALTER TABLE {table} ALTER COLUMN {col} DROP DEFAULT"))
    op.alter_column(
        table,
        col,
        existing_type=sa.String(length=existing_len),
        type_=sa.Numeric(*prec_tuple(prec_sql)),
        existing_nullable=nullable,
        postgresql_using=f"NULLIF(trim({col}::text), '')::{prec_sql}",
    )
    if server_default_sql is not None:
        op.execute(sa.text(f"ALTER TABLE {table} ALTER COLUMN {col} SET DEFAULT {server_default_sql}"))


def alter_numeric_to_string(
    table: str,
    col: str,
    *,
    prec_sql: str,
    existing_len: int = 32,
    nullable: bool = False,
    fmt: str,
) -> None:
    op.execute(sa.text(f"ALTER TABLE {table} ALTER COLUMN {col} DROP DEFAULT"))
    op.alter_column(
        table,
        col,
        existing_type=sa.Numeric(*prec_tuple(prec_sql)),
        type_=sa.String(length=existing_len),
        existing_nullable=nullable,
        postgresql_using=(
            f"CASE WHEN {col} IS NULL THEN NULL "
            f"ELSE trim(to_char({col}, '{fmt}')) END"
        ),
    )
