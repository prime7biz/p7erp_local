"""Bundle × operation scans from the shop-floor scan station (flag `shop_floor_scan_enabled`, default off).

`client_key` is generated on the device for every scan so an offline queue can be re-sent
safely: the same key is accepted once. A bundle is counted at most once per operation.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BundleOperationScan(Base):
    __tablename__ = "bundle_operation_scans"
    __table_args__ = (
        UniqueConstraint("tenant_id", "client_key", name="uq_bundle_scan_client_key"),
        UniqueConstraint("bundle_id", "ob_op_id", name="uq_bundle_scan_bundle_op"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_key: Mapped[str] = mapped_column(String(64), nullable=False)
    bundle_id: Mapped[int] = mapped_column(ForeignKey("cutting_bundles.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    ob_op_id: Mapped[int] = mapped_column(ForeignKey("operation_bulletin_ops.id", ondelete="CASCADE"), nullable=False, index=True)
    operation_name: Mapped[str] = mapped_column(String(255), nullable=False)
    smv: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=Decimal("0"))
    pieces: Mapped[int] = mapped_column(Integer, nullable=False)
    sewing_line_id: Mapped[int | None] = mapped_column(ForeignKey("sewing_lines.id", ondelete="SET NULL"), nullable=True, index=True)
    operator_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Time on the device when scanned (may be earlier than server time for offline scans).
    scanned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
