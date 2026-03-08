from pydantic import BaseModel, EmailStr, model_validator


class LoginRequest(BaseModel):
    """Reference-style: company_code + username + password. Also supports tenant_id + email."""
    company_code: str | None = None  # Resolve tenant by company_code (case-insensitive)
    tenant_id: int | None = None
    username: str | None = None
    email: str | None = None  # plain str so 422 is avoided when only company_code + username + password sent
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
            raise ValueError("Provide username or email")
        return self


class RegisterRequest(BaseModel):
    tenant_id: int
    email: EmailStr
    username: str
    password: str
    first_name: str | None = None
    last_name: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_id: int | None = None  # So frontend can set X-Tenant-Id without calling /me


class UserResponse(BaseModel):
    id: int
    tenant_id: int
    email: str
    username: str
    first_name: str | None
    last_name: str | None
    is_active: bool

    model_config = {"from_attributes": True}
