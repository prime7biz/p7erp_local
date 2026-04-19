"""Pydantic schemas for Commercial module."""

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


# ----- Master contracts -----
class MasterContractCreate(BaseModel):
    contract_type: str | None = Field(default="EXPORT_LC", max_length=24)
    reference: str = Field(..., max_length=64)
    status: str | None = Field(default="DRAFT", max_length=32)
    lc_number: str | None = Field(None, max_length=64)
    advising_bank: str | None = Field(None, max_length=255)
    advised_at: datetime | None = None
    contract_date: date | None = None
    amount: float | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=10)
    buyer_name: str | None = Field(None, max_length=255)
    bank_name: str | None = Field(None, max_length=255)
    expiry_date: date | None = None
    cost_center_id: int | None = Field(
        None,
        description="Cost center for payments and COGS under this contract; optional, can be created when contract is opened.",
    )
    order_id: int | None = Field(
        None,
        description="When set, links this master contract to the sales order (orders.master_contract_id).",
    )


class MasterContractUpdate(BaseModel):
    contract_type: str | None = Field(default=None, max_length=24)
    reference: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, max_length=32)
    lc_number: str | None = Field(default=None, max_length=64)
    advising_bank: str | None = Field(default=None, max_length=255)
    advised_at: datetime | None = None
    contract_date: date | None = None
    amount: float | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=10)
    buyer_name: str | None = Field(None, max_length=255)
    bank_name: str | None = Field(None, max_length=255)
    expiry_date: date | None = None
    cost_center_id: int | None = None
    order_id: int | None = Field(
        None,
        description="Link/unlink sales order (sets orders.master_contract_id to this contract when set).",
    )


class MasterContractResponse(BaseModel):
    id: int
    tenant_id: int
    contract_type: str
    reference: str
    status: str
    lc_number: str | None = None
    advising_bank: str | None = None
    advised_at: str | None = None
    contract_date: str | None
    amount: float | None
    btb_utilized_amount: float | None = None
    currency: str | None
    buyer_name: str | None
    bank_name: str | None
    expiry_date: str | None
    cost_center_id: int | None = None
    btb_utilization_pct: float | None = None
    btb_warning_band: str | None = None
    linked_order_id: int | None = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# ----- Export cases -----
class ExportCaseCreate(BaseModel):
    reference: str = Field(..., max_length=64)
    status: str | None = Field(default="DRAFT", max_length=32)
    case_date: date | None = None
    amount: float | None = Field(None, ge=0)
    trade_case_id: int | None = None
    order_id: int | None = None


class ExportCaseUpdate(BaseModel):
    reference: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, max_length=32)
    case_date: date | None = None
    amount: float | None = Field(None, ge=0)
    trade_case_id: int | None = None
    order_id: int | None = None


class ExportCaseResponse(BaseModel):
    id: int
    tenant_id: int
    reference: str
    status: str
    case_date: str | None
    amount: float | None
    trade_case_id: int | None = None
    order_id: int | None = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# ----- Proforma invoices -----
class ProformaInvoiceCreate(BaseModel):
    order_ids: list[int] = Field(default_factory=list, description="Order links (required for EXPORT)")
    direction: str | None = Field(default="EXPORT", max_length=16)
    vendor_id: int | None = None
    master_contract_id: int | None = None
    reference: str = Field(..., max_length=64)
    status: str | None = Field(default="DRAFT", max_length=32)
    invoice_date: date | None = None
    amount: float | None = Field(None, ge=0)
    buyer_name: str | None = None
    buyer_address: str | None = None
    buyer_bank_details: str | None = None
    consignee_name: str | None = None
    consignee_address: str | None = None
    notify_party_name: str | None = None
    notify_party_address: str | None = None
    beneficiary_name: str | None = None
    beneficiary_address: str | None = None
    terms_of_shipping: str | None = Field(None, max_length=64)
    terms_of_payment: str | None = Field(None, max_length=64)
    currency: str | None = Field(None, max_length=10)
    shipping_country: str | None = Field(None, max_length=128)
    destination_port_or_airport: str | None = Field(None, max_length=255)
    shipment_port: str | None = Field(None, max_length=255)
    documents_to_provide: list[Any] | dict[str, Any] | None = None
    terms_and_conditions: list[Any] | None = None
    shipper_bank_name: str | None = Field(None, max_length=255)
    shipper_bank_branch: str | None = Field(None, max_length=255)
    shipper_bank_account_number: str | None = Field(None, max_length=255)
    shipper_bank_account_name: str | None = Field(None, max_length=255)
    shipper_bank_address: str | None = Field(None, max_length=255)
    shipper_bank_swift: str | None = Field(None, max_length=255)
    shipper_bank_account_id: int | None = None
    purchase_order_id: int | None = None


class ProformaInvoiceUpdate(BaseModel):
    order_ids: list[int] | None = Field(None, min_length=1)
    direction: str | None = Field(None, max_length=16)
    vendor_id: int | None = None
    master_contract_id: int | None = None
    reference: str | None = Field(None, max_length=64)
    status: str | None = Field(None, max_length=32)
    invoice_date: date | None = None
    amount: float | None = Field(None, ge=0)
    buyer_name: str | None = None
    buyer_address: str | None = None
    buyer_bank_details: str | None = None
    consignee_name: str | None = None
    consignee_address: str | None = None
    notify_party_name: str | None = None
    notify_party_address: str | None = None
    beneficiary_name: str | None = None
    beneficiary_address: str | None = None
    terms_of_shipping: str | None = Field(None, max_length=64)
    terms_of_payment: str | None = Field(None, max_length=64)
    currency: str | None = Field(None, max_length=10)
    shipping_country: str | None = Field(None, max_length=128)
    destination_port_or_airport: str | None = Field(None, max_length=255)
    shipment_port: str | None = Field(None, max_length=255)
    documents_to_provide: list[Any] | dict[str, Any] | None = None
    terms_and_conditions: list[Any] | None = None
    shipper_bank_name: str | None = Field(None, max_length=255)
    shipper_bank_branch: str | None = Field(None, max_length=255)
    shipper_bank_account_number: str | None = Field(None, max_length=255)
    shipper_bank_account_name: str | None = Field(None, max_length=255)
    shipper_bank_address: str | None = Field(None, max_length=255)
    shipper_bank_swift: str | None = Field(None, max_length=255)
    shipper_bank_account_id: int | None = None
    purchase_order_id: int | None = None


class ProformaInvoiceResponse(BaseModel):
    id: int
    tenant_id: int
    reference: str
    status: str
    direction: str
    vendor_id: int | None = None
    invoice_date: str | None
    amount: float | None
    order_ids: list[int] = Field(default_factory=list)
    master_contract_id: int | None = None
    purchase_order_id: int | None = None
    buyer_name: str | None = None
    buyer_address: str | None = None
    buyer_bank_details: str | None = None
    consignee_name: str | None = None
    consignee_address: str | None = None
    notify_party_name: str | None = None
    notify_party_address: str | None = None
    beneficiary_name: str | None = None
    beneficiary_address: str | None = None
    terms_of_shipping: str | None = None
    terms_of_payment: str | None = None
    currency: str | None = None
    shipping_country: str | None = None
    destination_port_or_airport: str | None = None
    shipment_port: str | None = None
    documents_to_provide: list[Any] | dict[str, Any] | None = None
    terms_and_conditions: list[Any] | None = None
    shipper_bank_name: str | None = None
    shipper_bank_branch: str | None = None
    shipper_bank_account_number: str | None = None
    shipper_bank_account_name: str | None = None
    shipper_bank_address: str | None = None
    shipper_bank_swift: str | None = None
    shipper_bank_account_id: int | None = None
    verification_token: str | None = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class IssuedExportProformaOrderIdsResponse(BaseModel):
    order_ids: list[int]


# For-print: full PI + orders (order_code, quantity, delivery_date, customer_id) + customers (id, name, address) + tenant (company_name, logo) + shipper_bank resolved
class ProformaInvoiceOrderForPrint(BaseModel):
    order_code: str
    quantity: int | None
    delivery_date: str | None
    customer_id: int


class CustomerForPrint(BaseModel):
    id: int
    name: str
    address: str | None


class ShipperBankForPrint(BaseModel):
    bank_name: str
    branch_name: str | None
    account_number: str
    account_name: str | None
    swift_code: str | None
    address: str | None


class ProformaInvoiceForPrint(BaseModel):
    """Full proforma invoice with orders, customers, tenant and resolved shipper bank for printing."""

    id: int
    tenant_id: int
    reference: str
    status: str
    invoice_date: str | None
    amount: float | None
    buyer_name: str | None = None
    buyer_address: str | None = None
    buyer_bank_details: str | None = None
    consignee_name: str | None = None
    consignee_address: str | None = None
    notify_party_name: str | None = None
    notify_party_address: str | None = None
    beneficiary_name: str | None = None
    beneficiary_address: str | None = None
    terms_of_shipping: str | None = None
    terms_of_payment: str | None = None
    currency: str | None = None
    shipping_country: str | None = None
    destination_port_or_airport: str | None = None
    shipment_port: str | None = None
    documents_to_provide: list[Any] | dict[str, Any] | None = None
    terms_and_conditions: list[Any] | None = None
    shipper_bank_name: str | None = None
    shipper_bank_branch: str | None = None
    shipper_bank_account_number: str | None = None
    shipper_bank_account_name: str | None = None
    shipper_bank_address: str | None = None
    shipper_bank_swift: str | None = None
    orders: list[ProformaInvoiceOrderForPrint] = Field(default_factory=list)
    customers: list[CustomerForPrint] = Field(default_factory=list)
    company_name: str = ""
    logo: str | None = None
    shipper_bank: ShipperBankForPrint | None = None
    verification_token: str | None = None


class ProformaVerifyResponse(BaseModel):
    """Public verification response (no auth)."""

    valid: bool = True
    issued_by: str
    reference: str
    invoice_date: str | None
    amount: float | None


# ----- BTB LCs -----
class BtbLcCreate(BaseModel):
    reference: str = Field(..., max_length=64)
    status: str | None = Field(default="DRAFT", max_length=32)
    lc_date: date | None = None
    amount: float | None = Field(None, ge=0)
    master_contract_id: int | None = None
    proforma_invoice_id: int | None = None
    vendor_proforma_invoice_id: int | None = None
    purchase_order_id: int | None = None
    vendor_id: int | None = None
    bank_account_id: int | None = None
    currency: str | None = Field(None, max_length=10)
    exchange_rate_to_base: float | None = Field(None, ge=0)
    base_currency_amount: float | None = Field(None, ge=0)
    open_date: date | None = None
    expiry_date: date | None = None
    maturity_date: date | None = None
    maturity_amount: float | None = Field(None, ge=0)


class BtbLcUpdate(BaseModel):
    reference: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, max_length=32)
    lc_date: date | None = None
    amount: float | None = Field(None, ge=0)
    master_contract_id: int | None = None
    proforma_invoice_id: int | None = None
    vendor_proforma_invoice_id: int | None = None
    purchase_order_id: int | None = None
    vendor_id: int | None = None
    bank_account_id: int | None = None
    currency: str | None = Field(None, max_length=10)
    exchange_rate_to_base: float | None = Field(None, ge=0)
    base_currency_amount: float | None = Field(None, ge=0)
    open_date: date | None = None
    expiry_date: date | None = None
    maturity_date: date | None = None
    maturity_amount: float | None = Field(None, ge=0)


class BtbLcResponse(BaseModel):
    id: int
    tenant_id: int
    reference: str
    status: str
    lc_date: str | None
    amount: float | None
    master_contract_id: int | None = None
    proforma_invoice_id: int | None = None
    vendor_proforma_invoice_id: int | None = None
    purchase_order_id: int | None = None
    vendor_id: int | None = None
    bank_account_id: int | None = None
    currency: str | None = None
    exchange_rate_to_base: float | None = None
    base_currency_amount: float | None = None
    open_date: str | None = None
    expiry_date: str | None = None
    maturity_date: str | None = None
    maturity_amount: float | None = None
    master_cost_center_id: int | None = None
    accounting_status: str | None = None
    lc_open_voucher_id: int | None = None
    import_bill_voucher_id: int | None = None
    realization_voucher_id: int | None = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class BtbLcAccountingResponse(BaseModel):
    id: int
    tenant_id: int
    btb_lc_id: int
    lc_open_voucher_id: int | None = None
    import_bill_voucher_id: int | None = None
    maturity_date: str | None = None
    realization_voucher_id: int | None = None
    status: str
    created_at: str
    updated_at: str


class BtbLcRecordOpeningBody(BaseModel):
    upcoming_lc_liability_account_id: int | None = Field(
        default=None,
        description="Debit account for upcoming import LC liability. Omit to use system ledger BTB_NON_ACCEPTED_LC_LIABILITY.",
    )
    blocked_credit_facility_account_id: int | None = Field(
        default=None,
        description="Credit account for blocked bank LC credit facility. Omit to use system ledger BTB_CREDIT_LINE_UTILIZATION_CONTROL.",
    )
    voucher_date: date | None = None
    amount: float | None = Field(
        default=None,
        ge=0,
        description="Defaults to BTB LC amount when omitted.",
    )
    description: str | None = Field(default=None, max_length=512)
    reference: str | None = Field(default=None, max_length=128)


class BtbLcRecordDocumentsAcceptanceBody(BaseModel):
    lc_liability_account_id: int | None = Field(
        default=None,
        description="Debit that clears opening LC liability. Omit to use system ledger BTB_NON_ACCEPTED_LC_LIABILITY.",
    )
    import_bill_liability_account_id: int | None = Field(
        default=None,
        description="Credit for maturity/import bill liability. Omit to use system ledger BTB_ACCEPTED_LC_LIABILITY.",
    )
    maturity_date: date | None = None
    voucher_date: date | None = None
    amount: float | None = Field(
        default=None,
        ge=0,
        description="Defaults to BTB LC maturity_amount, or BTB LC amount if maturity_amount missing.",
    )
    description: str | None = Field(default=None, max_length=512)
    reference: str | None = Field(default=None, max_length=128)


class BtbLcRecordRealizationBody(BaseModel):
    import_bill_liability_account_id: int | None = Field(
        default=None,
        description="Debit for import bill liability settlement. Omit to use system ledger BTB_ACCEPTED_LC_LIABILITY.",
    )
    payment_account_id: int | None = Field(
        default=None,
        description="Credit GL for settlement. Omit only if BTB LC has bank_account_id with gl_account_id configured.",
    )
    voucher_date: date | None = None
    amount: float | None = Field(
        default=None,
        ge=0,
        description="Defaults to BTB LC maturity_amount, or BTB LC amount if maturity_amount missing.",
    )
    description: str | None = Field(default=None, max_length=512)
    reference: str | None = Field(default=None, max_length=128)
