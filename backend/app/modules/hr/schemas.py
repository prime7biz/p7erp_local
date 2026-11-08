from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

SalaryPaymentMethod = Literal["bank", "bkash", "cash"]
MAX_FACILITIES = 20
MAX_FACILITY_LENGTH = 64


def clean_facilities(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    out: list[str] = []
    for item in value:
        name = (item or "").strip()
        if not name:
            continue
        if len(name) > MAX_FACILITY_LENGTH:
            raise ValueError(f"Each facility must be {MAX_FACILITY_LENGTH} characters or fewer")
        if name not in out:
            out.append(name)
    if len(out) > MAX_FACILITIES:
        raise ValueError(f"At most {MAX_FACILITIES} facilities")
    return out


class EmployeeOnboardingFields(BaseModel):
    """Migration 288 fields shared by create and update (all optional)."""

    father_name: str | None = Field(None, max_length=128)
    mother_name: str | None = Field(None, max_length=128)
    spouse_name: str | None = Field(None, max_length=128)
    religion: str | None = Field(None, max_length=64)
    nationality: str | None = Field(None, max_length=64)
    present_address_line: str | None = Field(None, max_length=255)
    present_city: str | None = Field(None, max_length=128)
    present_district: str | None = Field(None, max_length=128)
    present_postal_code: str | None = Field(None, max_length=16)
    present_country: str | None = Field(None, max_length=128)
    permanent_address_line: str | None = Field(None, max_length=255)
    permanent_city: str | None = Field(None, max_length=128)
    permanent_district: str | None = Field(None, max_length=128)
    permanent_postal_code: str | None = Field(None, max_length=16)
    permanent_country: str | None = Field(None, max_length=128)
    emergency_contact_relation: str | None = Field(None, max_length=64)
    mobile_is_bkash: bool | None = None
    salary_payment_method: SalaryPaymentMethod | None = None
    bank_account_name: str | None = Field(None, max_length=128)
    bank_account_number: str | None = Field(None, max_length=64)
    bank_name: str | None = Field(None, max_length=128)
    bank_branch: str | None = Field(None, max_length=128)
    bank_routing_no: str | None = Field(None, max_length=32)
    probation_months: int | None = Field(None, ge=0, le=24)
    facilities: list[str] | None = Field(None, max_length=MAX_FACILITIES)

    @field_validator("facilities")
    @classmethod
    def _facilities(cls, value: list[str] | None) -> list[str] | None:
        return clean_facilities(value)


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
    # Printed as the job description; snapshots of it are kept forever, so it is bounded.
    description: str | None = Field(None, max_length=10000)
    is_active: bool = True


class DesignationUpdate(BaseModel):
    department_id: int | None = None
    code: str | None = Field(None, min_length=1, max_length=32)
    title: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = Field(None, max_length=10000)
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


class EmployeeCreate(EmployeeOnboardingFields):
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
    attendance_device_pin: str | None = Field(None, max_length=32)
    birth_registration_no: str | None = Field(None, max_length=32)


class EmployeeUpdate(EmployeeOnboardingFields):
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
    attendance_device_pin: str | None = Field(None, max_length=32)
    birth_registration_no: str | None = Field(None, max_length=32)


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
    attendance_device_pin: str | None = None
    birth_registration_no: str | None = None
    has_photo: bool = False
    father_name: str | None = None
    mother_name: str | None = None
    spouse_name: str | None = None
    religion: str | None = None
    nationality: str | None = None
    present_address_line: str | None = None
    present_city: str | None = None
    present_district: str | None = None
    present_postal_code: str | None = None
    present_country: str | None = None
    permanent_address_line: str | None = None
    permanent_city: str | None = None
    permanent_district: str | None = None
    permanent_postal_code: str | None = None
    permanent_country: str | None = None
    emergency_contact_relation: str | None = None
    mobile_is_bkash: bool | None = None
    salary_payment_method: str | None = None
    bank_account_name: str | None = None
    bank_account_number: str | None = None
    bank_name: str | None = None
    bank_branch: str | None = None
    bank_routing_no: str | None = None
    probation_months: int | None = None
    facilities: list[str] | None = None
    # Detail endpoint only, and only for callers with hr.payroll.manage.
    pay_snapshot: "EmployeePaySnapshot | None" = None
    # Names of fields hidden from this caller (masked to null).
    masked_fields: list[str] = Field(default_factory=list)


class EmployeePaySnapshot(BaseModel):
    as_of: date
    basic: str
    gross: str
    structure_id: int | None = None
    structure_code: str | None = None
    structure_assignment_id: int | None = None
    structure_effective_from: date | None = None
    structure_effective_to: date | None = None
    wage_rate_id: int | None = None
    wage_rate_code: str | None = None
    wage_grade_basic: str | None = None
    wage_grade_gross: str | None = None
    wage_assignment_id: int | None = None
    wage_effective_from: date | None = None


class EmployeeCompensationReplace(BaseModel):
    structure_id: int
    bd_wage_rate_id: int | None = None
    base_salary: str | None = Field(None, max_length=32, description="Decimal string; defaults to the grade minimum basic")
    effective_from: date


EmployeeResponse.model_rebuild()
