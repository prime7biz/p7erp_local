from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    address: str | None = None
    country: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    legal_entity_name: str | None = Field(None, max_length=255)
    trade_name: str | None = Field(None, max_length=255)
    tax_id_vat_number: str | None = Field(None, max_length=128)
    customer_type: str | None = Field(None, max_length=50)
    status: str | None = Field(None, max_length=32)
    primary_contact_name: str | None = Field(None, max_length=255)
    designation: str | None = Field(None, max_length=128)
    contact_email: str | None = Field(None, max_length=255)
    contact_phone: str | None = Field(None, max_length=64)
    phone_country_code: str | None = Field(None, max_length=16)
    subscribe_newsletter: bool = False
    company_logo_url: str | None = Field(None, max_length=512)
    billing_address_line1: str | None = Field(None, max_length=255)
    billing_city: str | None = Field(None, max_length=128)
    billing_postal_code: str | None = Field(None, max_length=32)
    billing_country: str | None = Field(None, max_length=64)
    shipping_address_line1: str | None = Field(None, max_length=255)
    shipping_city: str | None = Field(None, max_length=128)
    shipping_postal_code: str | None = Field(None, max_length=32)
    shipping_country: str | None = Field(None, max_length=64)
    same_as_billing: bool = True
    preferred_currency: str | None = Field(None, max_length=10)


class CustomerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    address: str | None = None
    country: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    legal_entity_name: str | None = Field(None, max_length=255)
    trade_name: str | None = Field(None, max_length=255)
    tax_id_vat_number: str | None = Field(None, max_length=128)
    customer_type: str | None = Field(None, max_length=50)
    status: str | None = Field(None, max_length=32)
    primary_contact_name: str | None = Field(None, max_length=255)
    designation: str | None = Field(None, max_length=128)
    contact_email: str | None = Field(None, max_length=255)
    contact_phone: str | None = Field(None, max_length=64)
    phone_country_code: str | None = Field(None, max_length=16)
    subscribe_newsletter: bool | None = None
    company_logo_url: str | None = Field(None, max_length=512)
    billing_address_line1: str | None = Field(None, max_length=255)
    billing_city: str | None = Field(None, max_length=128)
    billing_postal_code: str | None = Field(None, max_length=32)
    billing_country: str | None = Field(None, max_length=64)
    shipping_address_line1: str | None = Field(None, max_length=255)
    shipping_city: str | None = Field(None, max_length=128)
    shipping_postal_code: str | None = Field(None, max_length=32)
    shipping_country: str | None = Field(None, max_length=64)
    same_as_billing: bool | None = None
    preferred_currency: str | None = Field(None, max_length=10)


class CustomerResponse(BaseModel):
    id: int
    tenant_id: int
    customer_code: str
    name: str
    address: str | None
    country: str | None
    email: str | None
    phone: str | None
    website: str | None
    legal_entity_name: str | None
    trade_name: str | None
    tax_id_vat_number: str | None
    customer_type: str | None
    status: str
    primary_contact_name: str | None
    designation: str | None
    contact_email: str | None
    contact_phone: str | None
    phone_country_code: str | None
    subscribe_newsletter: bool
    company_logo_url: str | None
    billing_address_line1: str | None
    billing_city: str | None
    billing_postal_code: str | None
    billing_country: str | None
    shipping_address_line1: str | None
    shipping_city: str | None
    shipping_postal_code: str | None
    shipping_country: str | None
    same_as_billing: bool
    preferred_currency: str | None = None
    created_at: str
    updated_at: str
    # Optional list/AI enrichments (set by /customers/paginated when include_ai_fields=true)
    profile_completeness: int | None = None
    last_activity_at: str | None = None
    duplicate_risk_score: float | None = None
    days_since_activity: int | None = None

    class Config:
        from_attributes = True


class CustomerFacetsResponse(BaseModel):
    countries: list[str]
    customer_types: list[str]
    statuses: list[str]


class CustomerRelatedRecordItem(BaseModel):
    id: int
    code: str
    status: str
    updated_at: str


class CustomerRelatedResponse(BaseModel):
    orders: list[CustomerRelatedRecordItem]
    inquiries: list[CustomerRelatedRecordItem]
    quotations: list[CustomerRelatedRecordItem]


class CustomerHealthResponse(BaseModel):
    customer_id: int
    profile_completeness: int
    is_active: bool
    orders_count: int
    inquiries_count: int
    quotations_count: int
    outstanding_receivable_count: int
    last_activity_at: str | None = None
    duplicate_risk_score: float


class CustomerListPageResponse(BaseModel):
    items: list[CustomerResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    active_count: int
    inactive_count: int
    recent_count: int


class CustomerLogoUploadResponse(BaseModel):
    logo_url: str
    filename: str
    size_bytes: int
