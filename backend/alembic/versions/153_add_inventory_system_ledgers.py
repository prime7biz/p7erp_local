"""Re-seed system COA: inventory STOCK_ADJUSTMENT_EXPENSE + COGS_EXPENSE (data only).

Revision ID: 153
Revises: 152
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy.orm import sessionmaker

revision: str = "153"
down_revision: Union[str, None] = "152"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Session = sessionmaker(bind=bind)
    session = Session()
    try:
        from app.modules.finance.system_coa_seeding_service import seed_all_tenants_system_coa_sync_session

        seed_all_tenants_system_coa_sync_session(session)
        session.commit()
    finally:
        session.close()


def downgrade() -> None:
    pass
