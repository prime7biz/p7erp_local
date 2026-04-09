from pydantic import BaseModel, EmailStr, Field, model_validator


class LoginRequest(BaseModel):
    """company_code + email (preferred) or username + password. Optional login_as: staff | admin."""
    company_code: str | None = None  # Resolve tenant by company_code (case-insensitive)
    tenant_id: int | None = None
    username: str | None = None
    email: str | None = None  # plain str so 422 is avoided when only company_code + username + password sent
    login_as: str | None = None  # staff | admin (customer/financier use /api/external/auth/login)
    password: str

    @model_validator(mode="before")
    @classmethod
    def normalize_optional_strings(cls, data: object) -> object:
        """Normalize empty strings to None for optional fields so validation accepts login with only company_code + username + password."""
        if not isinstance(data, dict):
            return data
        out = {k: (None if (v is None or v == "") else v) for k, v in data.items()}
        return out

    @model_validator(mode="after")
    def require_tenant_and_identity(self):
        if not (self.company_code and self.company_code.strip()) and self.tenant_id is None:
            raise ValueError("Provide company_code or tenant_id")
        if not (self.username and self.username.strip()) and not (self.email and self.email.strip()):
            raise ValueError("Provide email or username")
        return self


class ResolveTenantRequest(BaseModel):
    company_code: str = Field(min_length=1, max_length=32)


class ResolveTenantResponse(BaseModel):
    tenant_id: int
    tenant_name: str
    company_code: str | None
    logo_url: str | None = None
    available_roles: list[str]


class RegisterRequest(BaseModel):
    tenant_id: int
    email: EmailStr
    username: str | None = None
    password: str
    first_name: str | None = None
    last_name: str | None = None
    bootstrap_key: str | None = None  # optional; first user: X-Bootstrap-Key / this must match env or tenant bootstrap hash (Finding #4)
    accepted_legal_terms: bool = False
    legal_acceptance_version: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    company_code: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_id: int | None = None  # So frontend can set X-Tenant-Id without calling /me


class UserResponse(BaseModel):
    id: int
    tenant_id: int
    email: str
    username: str | None
    first_name: str | None
    last_name: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10)
    new_password: str = Field(min_length=8, max_length=128)
