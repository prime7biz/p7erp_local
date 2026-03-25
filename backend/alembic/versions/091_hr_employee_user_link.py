"""Add optional user link to HR employees.

Revision ID: 091
Revises: 090
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "091"
down_revision: Union[str, None] = "090"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent: column may already exist from a partial run or manual DDL.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'hr_employees'
                  AND column_name = 'user_id'
            ) THEN
                ALTER TABLE hr_employees ADD COLUMN user_id INTEGER;
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_hr_employees_user_id'
            ) THEN
                ALTER TABLE hr_employees
                ADD CONSTRAINT fk_hr_employees_user_id
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employees_user_id "
        "ON hr_employees (user_id)"
    )


def downgrade() -> None:
    op.drop_index("uq_hr_employees_user_id", table_name="hr_employees")
    op.drop_constraint("fk_hr_employees_user_id", "hr_employees", type_="foreignkey")
    op.drop_column("hr_employees", "user_id")
