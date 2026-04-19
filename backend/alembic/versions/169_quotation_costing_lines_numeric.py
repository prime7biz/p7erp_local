"""Quotation costing line tables: string qty/money -> Numeric (Phase 3C / 3B continuation).

Revision ID: 169
Revises: 168
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "169"
down_revision: Union[str, None] = "168"
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


def _alter_nn(
    table: str,
    col: str,
    *,
    prec_sql: str,
    existing_len: int = 32,
    server_default_sql: str = "0",
) -> None:
    # PG cannot cast varchar server_default to numeric during TYPE change — drop first, restore after.
    op.execute(sa.text(f"ALTER TABLE {table} ALTER COLUMN {col} DROP DEFAULT"))
    op.alter_column(
        table,
        col,
        existing_type=sa.String(length=existing_len),
        type_=sa.Numeric(*_prec_tuple(prec_sql)),
        existing_nullable=False,
        postgresql_using=f"NULLIF(trim({col}::text), '')::{prec_sql}",
    )
    op.execute(sa.text(f"ALTER TABLE {table} ALTER COLUMN {col} SET DEFAULT {server_default_sql}"))


def _prec_tuple(prec_sql: str) -> tuple[int, int]:
    # "numeric(18,4)" -> (18, 4)
    inner = prec_sql.replace("numeric(", "").replace(")", "")
    a, b = inner.split(",")
    return int(a.strip()), int(b.strip())


def upgrade() -> None:
    # ----- quotation_materials -----
    for col, prec, dflt, sd in (
        ("consumption_per_dozen", "numeric(18,6)", "0", "0"),
        ("unit_price", "numeric(18,4)", "0", "0"),
        ("amount_per_dozen", "numeric(18,4)", "0", "0"),
        ("total_amount", "numeric(18,4)", "0", "0"),
        ("exchange_rate", "numeric(18,6)", "1", "1"),
        ("base_amount", "numeric(18,4)", "0", "0"),
        ("local_amount", "numeric(18,4)", "0", "0"),
    ):
        _scrub_nn("quotation_materials", col, dflt)
        _alter_nn("quotation_materials", col, prec_sql=prec, server_default_sql=sd)

    # ----- quotation_manufacturing -----
    for col, prec, dflt, sd in (
        ("production_per_hour", "numeric(18,6)", "0", "0"),
        ("production_per_day", "numeric(18,6)", "0", "0"),
        ("cost_per_machine", "numeric(18,4)", "0", "0"),
        ("total_line_cost", "numeric(18,4)", "0", "0"),
        ("cost_per_dozen", "numeric(18,4)", "0", "0"),
        ("cm_per_piece", "numeric(18,4)", "0", "0"),
        ("total_order_cost", "numeric(18,4)", "0", "0"),
        ("exchange_rate", "numeric(18,6)", "1", "1"),
        ("base_amount", "numeric(18,4)", "0", "0"),
        ("local_amount", "numeric(18,4)", "0", "0"),
    ):
        _scrub_nn("quotation_manufacturing", col, dflt)
        _alter_nn("quotation_manufacturing", col, prec_sql=prec, server_default_sql=sd)

    # ----- quotation_other_costs -----
    for col, prec, dflt, sd in (
        ("percentage", "numeric(10,4)", "0", "0"),
        ("total_amount", "numeric(18,4)", "0", "0"),
        ("value", "numeric(18,4)", "0", "0"),
        ("calculated_amount", "numeric(18,4)", "0", "0"),
        ("exchange_rate", "numeric(18,6)", "1", "1"),
        ("base_amount", "numeric(18,4)", "0", "0"),
        ("local_amount", "numeric(18,4)", "0", "0"),
    ):
        _scrub_nn("quotation_other_costs", col, dflt)
        _alter_nn("quotation_other_costs", col, prec_sql=prec, server_default_sql=sd)

    # ----- quotation_size_ratios -----
    _scrub_nn("quotation_size_ratios", "ratio_percentage", "0")
    _alter_nn("quotation_size_ratios", "ratio_percentage", prec_sql="numeric(10,4)", server_default_sql="0")
    _scrub_nn("quotation_size_ratios", "fabric_factor", "1")
    _alter_nn("quotation_size_ratios", "fabric_factor", prec_sql="numeric(18,4)", server_default_sql="1")

    # ----- quotation_cost_summary -----
    _scrub_nn("quotation_cost_summary", "total_cost", "0")
    _alter_nn("quotation_cost_summary", "total_cost", prec_sql="numeric(18,4)", server_default_sql="0")
    _scrub_nn("quotation_cost_summary", "percentage_of_total", "0")
    _alter_nn(
        "quotation_cost_summary",
        "percentage_of_total",
        prec_sql="numeric(10,4)",
        server_default_sql="0",
    )


def downgrade() -> None:
    def _back(table: str, col: str, *, prec: str, strlen: int = 32) -> None:
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
                f"CASE WHEN {col} IS NULL THEN '0' "
                f"ELSE trim(to_char({col}, '{fmt}')) END"
            ),
        )

    _back("quotation_cost_summary", "percentage_of_total", prec="10,4")
    _back("quotation_cost_summary", "total_cost", prec="18,4")
    _back("quotation_size_ratios", "fabric_factor", prec="18,4")
    _back("quotation_size_ratios", "ratio_percentage", prec="10,4")

    for col in (
        "local_amount",
        "base_amount",
        "exchange_rate",
        "calculated_amount",
        "value",
        "total_amount",
        "percentage",
    ):
        if col == "exchange_rate":
            prec = "18,6"
        elif col == "percentage":
            prec = "10,4"
        else:
            prec = "18,4"
        _back("quotation_other_costs", col, prec=prec)

    for col in (
        "local_amount",
        "base_amount",
        "exchange_rate",
        "total_order_cost",
        "cm_per_piece",
        "cost_per_dozen",
        "total_line_cost",
        "cost_per_machine",
        "production_per_day",
        "production_per_hour",
    ):
        prec = "18,6" if col in ("exchange_rate", "production_per_hour", "production_per_day") else "18,4"
        _back("quotation_manufacturing", col, prec=prec)

    for col in (
        "local_amount",
        "base_amount",
        "exchange_rate",
        "total_amount",
        "amount_per_dozen",
        "unit_price",
        "consumption_per_dozen",
    ):
        prec = "18,6" if col in ("exchange_rate", "consumption_per_dozen") else "18,4"
        _back("quotation_materials", col, prec=prec)
