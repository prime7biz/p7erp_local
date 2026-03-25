"""Centralized tenant-scoped file storage (local disk). No public static serving."""

from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.config import get_settings

# Allowed module subfolders under MEDIA_ROOT / {tenant_id} /
ALLOWED_MODULES = frozenset({"customer_logos", "style_pictures", "trade_docs", "hr_documents"})

# image modules: strict image MIME only
_IMAGE_MIME_TO_EXT: dict[str, str] = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}

# trade docs: common RMG / office formats
_TRADE_MIME_TO_EXT: dict[str, str] = {
    **_IMAGE_MIME_TO_EXT,
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

_MODULE_MAX_BYTES: dict[str, int] = {
    "customer_logos": 2 * 1024 * 1024,
    "style_pictures": 2 * 1024 * 1024,
    "trade_docs": 25 * 1024 * 1024,
    "hr_documents": 10 * 1024 * 1024,
}

_MODULE_MIME: dict[str, dict[str, str]] = {
    "customer_logos": _IMAGE_MIME_TO_EXT,
    "style_pictures": _IMAGE_MIME_TO_EXT,
    "trade_docs": _TRADE_MIME_TO_EXT,
    "hr_documents": _TRADE_MIME_TO_EXT,
}

_FILENAME_SAFE = re.compile(r"^[a-zA-Z0-9._-]+$")


def get_media_root() -> Path:
    """Resolved absolute path to backend media root (tenant dirs live under here)."""
    s = get_settings()
    if getattr(s, "media_root", None):
        return Path(s.media_root).expanduser().resolve()
    return Path(__file__).resolve().parents[2] / "media"


def _normalize_content_type(content_type: str | None) -> str:
    if not content_type:
        return ""
    return content_type.lower().split(";")[0].strip()


async def _read_upload_with_limit(file: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large (max {max_bytes // (1024 * 1024)} MB).",
            )
        chunks.append(chunk)
    return b"".join(chunks)


class FileStorageService:
    """Tenant-isolated uploads under MEDIA_ROOT / {tenant_id} / {module_name} /."""

    @staticmethod
    def _validate_module(module_name: str) -> str:
        m = module_name.strip()
        if m not in ALLOWED_MODULES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid storage module: {module_name!r}",
            )
        return m

    @staticmethod
    def _validate_filename(filename: str) -> str:
        name = Path(filename).name
        if not name or name != filename or ".." in filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")
        if not _FILENAME_SAFE.match(name):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename characters")
        return name

    @staticmethod
    async def save_file(file: UploadFile, tenant_id: int, module_name: str) -> tuple[str, str, str]:
        """
        Save upload under MEDIA_ROOT/{tenant_id}/{module}/.

        Returns:
            (safe_filename, api_relative_url, absolute_disk_path_str)
        """
        mod = FileStorageService._validate_module(module_name)
        max_bytes = _MODULE_MAX_BYTES[mod]
        mime_map = _MODULE_MIME[mod]

        ct = _normalize_content_type(file.content_type)
        ext = mime_map.get(ct)
        if not ext:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported file type for this upload.",
            )

        data = await _read_upload_with_limit(file, max_bytes)
        if not data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

        # Optional: PDF magic check when declared as PDF
        if ct == "application/pdf" and not data.startswith(b"%PDF"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid PDF file.")

        safe_name = f"{uuid4().hex}{ext}"
        root = get_media_root()
        dest_dir = root / str(tenant_id) / mod
        dest_dir.mkdir(parents=True, exist_ok=True)
        full_path = dest_dir / safe_name
        full_path.write_bytes(data)

        api_prefix = get_settings().api_v1_prefix.rstrip("/")
        api_url = f"{api_prefix}/files/{mod}/{safe_name}"
        return safe_name, api_url, str(full_path.resolve())

    @staticmethod
    def resolve_path(tenant_id: int, module_name: str, filename: str) -> Path | None:
        """Return absolute path if file exists and lies under MEDIA_ROOT; else None."""
        mod = FileStorageService._validate_module(module_name)
        name = FileStorageService._validate_filename(filename)

        root = get_media_root().resolve()
        target = (root / str(tenant_id) / mod / name).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            return None
        if not target.is_file():
            return None
        return target

    @staticmethod
    def delete_file(tenant_id: int, module_name: str, filename: str) -> bool:
        path = FileStorageService.resolve_path(tenant_id, module_name, filename)
        if path is None:
            return False
        try:
            path.unlink()
        except OSError:
            return False
        return True

    @staticmethod
    def delete_path_if_under_media(absolute_path: str) -> bool:
        """Delete a file given a legacy absolute path if it resolves under MEDIA_ROOT."""
        try:
            p = Path(absolute_path).resolve()
        except OSError:
            return False
        root = get_media_root().resolve()
        try:
            p.relative_to(root)
        except ValueError:
            return False
        if not p.is_file():
            return False
        try:
            p.unlink()
        except OSError:
            return False
        return True

    @staticmethod
    def resolve_trade_document_path(tenant_id: int, storage_path_str: str) -> Path | None:
        """
        Resolve on-disk path for trade docs: prefer tenant layout, then legacy flat paths under MEDIA_ROOT.
        """
        name = Path(storage_path_str).name
        p = FileStorageService.resolve_path(tenant_id, "trade_docs", name)
        if p is not None:
            return p
        try:
            legacy = Path(storage_path_str).resolve()
        except OSError:
            return None
        root = get_media_root().resolve()
        try:
            legacy.relative_to(root)
        except ValueError:
            return None
        if not legacy.is_file():
            return None
        return legacy

    @staticmethod
    def delete_trade_document_file(tenant_id: int, storage_path_str: str) -> bool:
        """Delete trade doc file (new tenant path or legacy path under MEDIA_ROOT)."""
        name = Path(storage_path_str).name
        if FileStorageService.delete_file(tenant_id, "trade_docs", name):
            return True
        return FileStorageService.delete_path_if_under_media(storage_path_str)
