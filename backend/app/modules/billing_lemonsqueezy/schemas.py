from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class LemonSqueezyCheckoutRequest(BaseModel):
    variant_id: str = Field(..., min_length=1, description="Lemon Squeezy variant id from the dashboard")
    email: EmailStr | None = Field(None, description="Customer email; defaults to the logged-in user")


class LemonSqueezyCheckoutResponse(BaseModel):
    checkout_url: str
