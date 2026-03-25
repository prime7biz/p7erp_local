"""JWT-protected file downloads; tenant isolation via current_user.tenant_id."""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.common.auth import get_current_user
from app.common.storage import FileStorageService
from app.models import User

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/{module_name}/{filename}")
async def download_tenant_file(
    module_name: str,
    filename: str,
    user: User = Depends(get_current_user),
):
    """
    Serve a file from MEDIA_ROOT/{tenant_id}/{module}/{filename}.
    Tenant is taken only from JWT — never from the URL path.
    """
    path = FileStorageService.resolve_path(user.tenant_id, module_name, filename)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    media_type, _ = mimetypes.guess_type(path.name)
    if not media_type:
        media_type = "application/octet-stream"

    is_inline = media_type.startswith("image/")

    headers = {
        "X-Content-Type-Options": "nosniff",
    }
    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type=media_type,
        content_disposition_type="inline" if is_inline else "attachment",
        headers=headers,
    )
