"""Employee numbering and Bangladesh identity rules.

Numbering: ``tenants.feature_flags.hr_employee_number_format = {"prefix": "EMP-", "width": 7}``.
The numeric part comes from one atomic, ever-increasing tenant counter, so a number is never reused
(not after resignation, deactivation or a prefix change). The code is permanent after creation.

Identity (flag ``hr_bd_identity_required``, set by the Bangladesh setup): every employee needs a
Bangladesh mobile number and either an NID (10, 13 or 17 digits) or a birth registration number
(17 digits). Duplicate NID / birth registration numbers inside the company are refused.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.common.tenant_feature_keys import _flag_true
from app.models.hr import Employee

EMPLOYEE_NUMBER_FORMAT_KEY = "hr_employee_number_format"
HR_BD_IDENTITY_REQUIRED = "hr_bd_identity_required"
DEFAULT_PREFIX = "EMP-"
DEFAULT_WIDTH = 7
PREFIX_RE = re.compile(r"^[A-Za-z0-9-]{0,12}$")

_MOBILE_RE = re.compile(r"^01[3-9]\d{8}$")


def number_format(feature_flags: Any) -> tuple[str, int]:
    fmt = feature_flags.get(EMPLOYEE_NUMBER_FORMAT_KEY) if isinstance(feature_flags, dict) else None
    if not isinstance(fmt, dict):
        return DEFAULT_PREFIX, DEFAULT_WIDTH
    prefix = fmt.get("prefix")
    width = fmt.get("width")
    if not isinstance(prefix, str) or not PREFIX_RE.match(prefix):
        prefix = DEFAULT_PREFIX
    if not isinstance(width, int) or isinstance(width, bool) or not 3 <= width <= 10:
        width = DEFAULT_WIDTH
    return prefix, width


def validate_number_format(prefix: Any, width: Any) -> dict[str, Any]:
    if not isinstance(prefix, str) or not PREFIX_RE.match(prefix):
        raise HTTPException(status_code=400, detail="Prefix: up to 12 letters, digits or hyphens")
    if not isinstance(width, int) or isinstance(width, bool) or not 3 <= width <= 10:
        raise HTTPException(status_code=400, detail="Number width must be between 3 and 10 digits")
    return {"prefix": prefix, "width": width}


async def next_employee_code(db: AsyncSession, tenant_id: int, feature_flags: Any) -> str:
    """Next permanent employee number. Skips any number a legacy/imported row already holds."""
    prefix, width = number_format(feature_flags)
    for _ in range(50):
        code = await next_tenant_code(db, model=Employee, tenant_id=tenant_id, prefix=prefix, width=width)
        taken = (
            await db.execute(select(Employee.id).where(Employee.tenant_id == tenant_id, Employee.employee_code == code))
        ).first()
        if not taken:
            return code
    raise HTTPException(status_code=409, detail="Could not allocate a free employee number; contact support")


def preview_next_code(feature_flags: Any, last_value: int) -> str:
    prefix, width = number_format(feature_flags)
    return f"{prefix}{last_value + 1:0{width}d}"


def normalize_digits(value: str | None) -> str | None:
    if value is None:
        return None
    digits = re.sub(r"[\s-]", "", value.strip())
    return digits or None


def normalize_mobile(value: str | None) -> str | None:
    if value is None:
        return None
    digits = re.sub(r"[\s()-]", "", value.strip())
    if digits.startswith("+880"):
        digits = "0" + digits[4:]
    elif digits.startswith("880") and len(digits) == 13:
        digits = "0" + digits[3:]
    return digits or None


def validate_identity_values(*, national_id: str | None, birth_registration_no: str | None, phone: str | None) -> None:
    if national_id and (not national_id.isdigit() or len(national_id) not in (10, 13, 17)):
        raise HTTPException(status_code=400, detail="NID must be 10, 13 or 17 digits")
    if birth_registration_no and (not birth_registration_no.isdigit() or len(birth_registration_no) != 17):
        raise HTTPException(status_code=400, detail="Birth registration number must be 17 digits")
    if phone and not _MOBILE_RE.match(phone):
        raise HTTPException(status_code=400, detail="Mobile number must be a Bangladesh mobile like 01712345678")


def identity_required(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, HR_BD_IDENTITY_REQUIRED)


def assert_identity_complete(*, national_id: str | None, birth_registration_no: str | None, phone: str | None) -> None:
    missing = []
    if not (national_id or birth_registration_no):
        missing.append("NID or birth registration number")
    if not phone:
        missing.append("mobile number")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Required for every employee file: " + " and ".join(missing),
        )


async def assert_identity_unique(
    db: AsyncSession, tenant_id: int, *, national_id: str | None, birth_registration_no: str | None, exclude_id: int | None = None
) -> None:
    """Same company only; a match in another company is never revealed."""
    for column, value, label in (
        (Employee.national_id, national_id, "NID"),
        (Employee.birth_registration_no, birth_registration_no, "birth registration number"),
    ):
        if not value:
            continue
        stmt = select(Employee.employee_code).where(
            Employee.tenant_id == tenant_id,
            func.regexp_replace(column, r"[\s-]", "", "g") == value,
        )
        if exclude_id is not None:
            stmt = stmt.where(Employee.id != exclude_id)
        hit = (await db.execute(stmt.limit(1))).scalar_one_or_none()
        if hit:
            raise HTTPException(
                status_code=409,
                detail=f"An employee file with this {label} already exists ({hit}). Reactivate or merge it instead of creating a new number.",
            )
