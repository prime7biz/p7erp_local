"""JWT-protected file downloads; tenant isolation via current_user.tenant_id."""

from __future__ import annotations

import mimetypes

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.permissions import (
    HR_SETUP_BYPASS_ROLES,
    PERMISSION_HR_DOCUMENTS_VIEW,
    internal_permission_granted,
    require_internal_permission,
)
from app.common.signatories import SIGNATURE_MODULE
from app.common.storage import FileStorageService
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/files", tags=["files"])

# Module-level access (same keys as the routers that own these files; enforced per tenant RBAC mode).
_MODULE_ACCESS_KEY = {
    "customer_logos": "merch.access",
    "style_pictures": "merch.access",
    "trade_docs": "trade.access",
}
# HR documents are always restricted: manager-type role or an explicit grant of one of these keys.
_HR_DOCUMENT_KEYS = (PERMISSION_HR_DOCUMENTS_VIEW, "hr.access")


async def _assert_can_download(
    request: Request, db: AsyncSession, user: User, module_name: str, filename: str
) -> None:
    mod = module_name.strip()
    if mod == SIGNATURE_MODULE:
        if filename == (user.signature_image_name or ""):
            return
        role = await get_user_role_scoped_to_tenant(db, user, user.tenant_id)
        if (role.name if role else "").strip().lower() in HR_SETUP_BYPASS_ROLES:
            return
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if mod == "hr_documents":
        role = await get_user_role_scoped_to_tenant(db, user, user.tenant_id)
        if (role.name if role else "").strip().lower() in HR_SETUP_BYPASS_ROLES:
            return
        if any(internal_permission_granted(role=role, permission_key=k) for k in _HR_DOCUMENT_KEYS):
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requires HR document access")
    key = _MODULE_ACCESS_KEY.get(mod)
    if key:
        await require_internal_permission(key)(request=request, user=user, db=db)


@router.get("/{module_name}/{filename}")
async def download_tenant_file(
    module_name: str,
    filename: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Serve a file from MEDIA_ROOT/{tenant_id}/{module}/{filename}.
    Tenant is taken only from JWT — never from the URL path.
    """
    path = FileStorageService.resolve_path(user.tenant_id, module_name, filename)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await _assert_can_download(request, db, user, module_name, filename)

    media_type, _ = mimetypes.guess_type(path.name)
    if not media_type:
        media_type = "application/octet-stream"

    is_inline = media_type.startswith("image/")

    headers = {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    }
    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type=media_type,
        content_disposition_type="inline" if is_inline else "attachment",
        headers=headers,
    )
