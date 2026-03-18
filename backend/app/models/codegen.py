from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TenantCodeCounter(Base):
    __tablename__ = "tenant_code_counters"
    __table_args__ = (
        UniqueConstraint("tenant_id", "entity_key", name="uq_tenant_code_counter_tenant_entity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_key: Mapped[str] = mapped_column(String(128), nullable=False)
    last_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
