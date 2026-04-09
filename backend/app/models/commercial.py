"""Commercial module: export cases, master contracts, proforma invoices, BTB LCs."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.merch import Order


class MasterContract(Base):
    """Master export contract/LC – links proforma invoices and BTB LCs.
    When opened, a cost center should be linked so all related payments (BTB LC,
    bank, cash) and COGS expenses use this cost center.
    """

    __tablename__ = "master_contracts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cost_center_id: Mapped[int | None] = mapped_column(
        ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    contract_type: Mapped[str] = mapped_column(
        String(24), nullable=False, default="EXPORT_LC", index=True
    )  # SALES_CONTRACT | EXPORT_LC
    reference: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    contract_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    buyer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    btb_utilized_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ExportCase(Base):
    __tablename__ = "export_cases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reference: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    case_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    trade_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("trade_cases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ProformaInvoice(Base):
    __tablename__ = "proforma_invoices"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    direction: Mapped[str] = mapped_column(
        String(16), nullable=False, default="EXPORT", index=True
    )  # EXPORT | IMPORT
    vendor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reference: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    # Commercial export fields (all nullable)
    buyer_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    buyer_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    buyer_bank_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    consignee_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    consignee_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    notify_party_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    notify_party_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    beneficiary_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    beneficiary_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms_of_shipping: Mapped[str | None] = mapped_column(String(64), nullable=True)
    terms_of_payment: Mapped[str | None] = mapped_column(String(64), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    shipping_country: Mapped[str | None] = mapped_column(String(128), nullable=True)
    destination_port_or_airport: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shipment_port: Mapped[str | None] = mapped_column(String(255), nullable=True)
    documents_to_provide: Mapped[list[Any] | dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )
    terms_and_conditions: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
    shipper_bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shipper_bank_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shipper_bank_account_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shipper_bank_account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shipper_bank_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shipper_bank_swift: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shipper_bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    verification_token: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    proforma_invoice_orders: Mapped[list["ProformaInvoiceOrder"]] = relationship(
        "ProformaInvoiceOrder",
        back_populates="proforma_invoice",
        order_by="ProformaInvoiceOrder.sort_order",
        cascade="all, delete-orphan",
    )


class ProformaInvoiceOrder(Base):
    __tablename__ = "proforma_invoice_orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    proforma_invoice_id: Mapped[int] = mapped_column(
        ForeignKey("proforma_invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    proforma_invoice: Mapped["ProformaInvoice"] = relationship(
        "ProformaInvoice", back_populates="proforma_invoice_orders"
    )
    order: Mapped["Order"] = relationship("Order")


class BtbLc(Base):
    __tablename__ = "btb_lcs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    proforma_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("proforma_invoices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_proforma_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("proforma_invoices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    purchase_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reference: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    lc_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    open_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    maturity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    maturity_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    exchange_rate_to_base: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    base_currency_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class BtbLcAccounting(Base):
    """Tracks accounting lifecycle for a BTB LC: LC open (liability + blocked facility),
    documents accepted (import bill liability), and realization on maturity.
    One row per BTB LC. Vouchers are linked here; voucher lines use master contract cost center.
    """

    __tablename__ = "btb_lc_accounting"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    btb_lc_id: Mapped[int] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # When BTB LC opened: LC liability + blocked credit facility posting
    lc_open_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # When documents accepted (per LC terms 90/120 etc.): import bill liability
    import_bill_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    maturity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # When import bill is paid at maturity
    realization_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="OPEN", index=True
    )  # OPEN | DOCUMENTS_ACCEPTED | REALIZED
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
