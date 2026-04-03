"""Regression checks for commit detection on raw SQL text statements."""

import pytest
from sqlalchemy import text

from app.database import _p7_statement_needs_commit


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO demo_table (id) VALUES (1)",
        """
        -- leading comment
        WITH incoming AS (SELECT 1 AS id)
        INSERT INTO demo_table (id)
        SELECT id FROM incoming
        """,
        """
        WITH first_cte AS (SELECT 1 AS id), second_cte(id) AS (SELECT id FROM first_cte)
        UPDATE demo_table
        SET id = second_cte.id
        FROM second_cte
        """,
        """
        WITH RECURSIVE nums AS (
            SELECT 1 AS id
            UNION ALL
            SELECT id + 1 FROM nums WHERE id < 2
        )
        DELETE FROM demo_table
        WHERE id IN (SELECT id FROM nums)
        """,
    ],
)
def test_text_write_statements_need_commit(sql: str) -> None:
    assert _p7_statement_needs_commit(text(sql)) is True


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT 1",
        """
        WITH seeded AS (SELECT 'INSERT' AS action_name)
        SELECT action_name FROM seeded
        """,
        """
        /* leading block comment */
        WITH one_row AS (SELECT 1 AS id), two_row AS (SELECT id + 1 FROM one_row)
        SELECT id FROM two_row
        """,
    ],
)
def test_text_read_statements_do_not_need_commit(sql: str) -> None:
    assert _p7_statement_needs_commit(text(sql)) is False
