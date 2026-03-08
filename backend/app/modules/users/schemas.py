from pydantic import BaseModel


class UserResponse(BaseModel):
    id: int
    tenant_id: int
    role_id: int
    email: str
    username: str
    first_name: str | None
    last_name: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class RoleResponse(BaseModel):
    id: int
    tenant_id: int | None
    name: str
    display_name: str

    model_config = {"from_attributes": True}


class UserWithRoleResponse(UserResponse):
    role_name: str
