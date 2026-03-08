from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    address: str | None = None
    country: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    address: str | None = None
    country: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None


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
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
