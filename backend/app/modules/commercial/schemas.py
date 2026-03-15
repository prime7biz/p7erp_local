"""Pydantic schemas for Commercial module."""

from datetime import date
from typing import Any

from pydantic import BaseModel, Field


# ----- Master contracts -----
class MasterContractCreate(BaseModel):
    contract_type: str | None = Field(default="EXPORT_LC", max_length=24)
    reference: str = Field(..., max_length=64)
    status: str | None = Field(default="DRAFT", max_length=32)
    contract_date: date | None = None
    amount: float | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=10)
    buyer_name: str | None = Field(None, max_length=255)
    bank_name: str | None = Field(None, max_length=255)
    expiry_date: date | None = None


class MasterContractUpdate(BaseModel):
    contract_type: str | None = Field(default=None, max_length=24)
    reference: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, max_length=32)
    contract_date: date | None = None
    amount: float | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=10)
    buyer_name: str | None = Field(None, max_length=255)
    bank_name: str | None = Field(None, max_length=255)
    expiry_date: date | None = None


class MasterContractResponse(BaseModel):
    id: int
    tenant_id: int
    contract_type: str
    reference: str
    status: str
    contract_date: str | None
    amount: float | None
    btb_utilized_amount: float | None = None
    currency: str | None
    buyer_name: str | None
    bank_name: str | None
    expiry_date: str | None
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


class ExportCaseResponse(BaseModel):
    id: int
    tenant_id: int
    reference: str
    status: str
    case_date: str | None
    amount: float | None
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
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
