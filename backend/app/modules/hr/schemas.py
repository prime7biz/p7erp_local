from datetime import date

from pydantic import BaseModel, Field


class DepartmentCreate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    is_active: bool = True


class DepartmentUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=32)
    name: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = None
    is_active: bool | None = None


class DepartmentResponse(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    description: str | None
    is_active: bool
    created_at: str
    updated_at: str


class DesignationCreate(BaseModel):
    department_id: int | None = None
    code: str | None = Field(None, min_length=1, max_length=32)
    title: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    is_active: bool = True


class DesignationUpdate(BaseModel):
    department_id: int | None = None
    code: str | None = Field(None, min_length=1, max_length=32)
    title: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = None
    is_active: bool | None = None


class DesignationResponse(BaseModel):
    id: int
    tenant_id: int
    department_id: int | None
    code: str
    title: str
    description: str | None
    is_active: bool
    created_at: str
    updated_at: str


class SectionCreate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    section_type: str = Field(default="SECTION", max_length=24)
    parent_section_id: int | None = None
    department_id: int | None = None
    head_employee_id: int | None = None
    is_active: bool = True


class SectionUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=32)
    name: str | None = Field(None, min_length=1, max_length=128)
    section_type: str | None = Field(None, max_length=24)
    parent_section_id: int | None = None
    department_id: int | None = None
    head_employee_id: int | None = None
    is_active: bool | None = None


class SectionResponse(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    section_type: str
    parent_section_id: int | None
    department_id: int | None
    head_employee_id: int | None
    is_active: bool
    created_at: str
    updated_at: str


class EmployeeDocumentCreate(BaseModel):
    document_type: str = Field(..., min_length=1, max_length=64)
    document_number: str | None = Field(None, max_length=128)
    issue_date: date | None = None
    expiry_date: date | None = None
    file_path: str | None = Field(None, max_length=255)
    notes: str | None = None


class EmployeeDocumentResponse(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    document_type: str
    document_number: str | None
    issue_date: date | None
    expiry_date: date | None
    file_path: str | None
    notes: str | None
    created_by: int | None
    created_at: str


class EmployeeStatusHistoryCreate(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)
    effective_date: date
    remarks: str | None = None


class EmployeeStatusHistoryResponse(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    status: str
    effective_date: date
    remarks: str | None
    changed_by: int | None
    created_at: str


class EmployeeCreate(BaseModel):
    employee_code: str | None = Field(None, min_length=1, max_length=32)
    first_name: str = Field(..., min_length=1, max_length=128)
    last_name: str | None = Field(None, max_length=128)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=32)
    joining_date: date | None = None
    date_of_birth: date | None = None
    gender: str | None = Field(None, max_length=32)
    marital_status: str | None = Field(None, max_length=32)
    blood_group: str | None = Field(None, max_length=16)
    emergency_contact_name: str | None = Field(None, max_length=128)
    emergency_contact_phone: str | None = Field(None, max_length=32)
    address_line: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=128)
    country: str | None = Field(None, max_length=128)
    national_id: str | None = Field(None, max_length=64)
    employment_type: str | None = Field(None, max_length=32)
    confirmation_date: date | None = None
    exit_date: date | None = None
    department_id: int | None = None
    designation_id: int | None = None
    section_id: int | None = None
    employee_category: str | None = Field(None, max_length=24)
    reporting_manager_id: int | None = None
    user_id: int | None = None
    is_active: bool = True


class EmployeeUpdate(BaseModel):
    employee_code: str | None = Field(None, min_length=1, max_length=32)
    first_name: str | None = Field(None, min_length=1, max_length=128)
    last_name: str | None = Field(None, max_length=128)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=32)
    joining_date: date | None = None
    date_of_birth: date | None = None
    gender: str | None = Field(None, max_length=32)
    marital_status: str | None = Field(None, max_length=32)
    blood_group: str | None = Field(None, max_length=16)
    emergency_contact_name: str | None = Field(None, max_length=128)
    emergency_contact_phone: str | None = Field(None, max_length=32)
    address_line: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=128)
    country: str | None = Field(None, max_length=128)
    national_id: str | None = Field(None, max_length=64)
    employment_type: str | None = Field(None, max_length=32)
    confirmation_date: date | None = None
    exit_date: date | None = None
    department_id: int | None = None
    designation_id: int | None = None
    section_id: int | None = None
    employee_category: str | None = Field(None, max_length=24)
    reporting_manager_id: int | None = None
    user_id: int | None = None
    is_active: bool | None = None


class EmployeeResponse(BaseModel):
    id: int
    tenant_id: int
    employee_code: str
    first_name: str
    last_name: str | None
    email: str | None
    phone: str | None
    joining_date: date | None
    date_of_birth: date | None
    gender: str | None
    marital_status: str | None
    blood_group: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    address_line: str | None
    city: str | None
    country: str | None
    national_id: str | None
    employment_type: str | None
    confirmation_date: date | None
    exit_date: date | None
    department_id: int | None
    designation_id: int | None
    section_id: int | None
    employee_category: str | None
    reporting_manager_id: int | None
    user_id: int | None
    is_active: bool
    created_at: str
    updated_at: str
