"""Private HR file storage for identity-sensitive files (employee photos, CVs, scanned documents).

Files live under MEDIA_ROOT/{tenant_id}/hr_secure/{kind}/ — outside ``ALLOWED_MODULES``, so the generic
``/files`` router can never serve them. Every file is:
- checked by its real signature (magic bytes), not the browser's MIME type;
- for images: decoded and re-encoded with Pillow, which drops EXIF/GPS metadata and any trailing payload;
- scanned by ClamAV when ``HR_CLAMAV_HOST`` is set (fail closed if the scanner is unreachable);
- encrypted at rest with Fernet (key ``HR_FILE_ENCRYPTION_KEY``, or a key derived from ``JWT_SECRET``).

Only HR endpoints that check the employee's tenant and the caller's permission read them back.
"""

from __future__ import annotations

import base64
import hashlib
import io
import logging
import socket
import struct
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.common.storage import get_media_root
from app.config import get_settings

logger = logging.getLogger(__name__)

KINDS = {
    "photo": {"max": 2 * 1024 * 1024, "types": {"jpeg", "png"}},
    "document": {"max": 10 * 1024 * 1024, "types": {"jpeg", "png", "pdf", "docx", "doc"}},
}
EXT = {"jpeg": ".jpg", "png": ".png", "pdf": ".pdf", "docx": ".docx", "doc": ".doc"}
MIME = {
    "jpeg": "image/jpeg",
    "png": "image/png",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
}
MAGIC_HEADER = b"P7E1"


def sniff_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"PK\x03\x04") and b"word/" in data[:4000]:
        return "docx"
    if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "doc"
    return None


def _fernet():
    from cryptography.fernet import Fernet

    s = get_settings()
    raw = (getattr(s, "hr_file_encryption_key", "") or "").strip()
    if raw:
        return Fernet(raw.encode())
    digest = hashlib.sha256(b"p7-hr-secure-files-v1:" + s.jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _reencode_image(data: bytes, kind: str) -> bytes:
    from PIL import Image, ImageOps

    try:
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            img = ImageOps.exif_transpose(img)
            if max(img.size) > 1600:
                img.thumbnail((1600, 1600))
            out = io.BytesIO()
            if kind == "png":
                img.save(out, format="PNG", optimize=True)
            else:
                img.convert("RGB").save(out, format="JPEG", quality=88)
            return out.getvalue()
    except Exception as exc:  # corrupt / disguised image
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image could not be read") from exc


def _clamav_scan(data: bytes) -> None:
    host = (getattr(get_settings(), "hr_clamav_host", "") or "").strip()
    if not host:
        return
    name, _, port = host.partition(":")
    try:
        with socket.create_connection((name, int(port or 3310)), timeout=15) as sock:
            sock.sendall(b"zINSTREAM\0")
            for i in range(0, len(data), 65536):
                chunk = data[i : i + 65536]
                sock.sendall(struct.pack("!L", len(chunk)) + chunk)
            sock.sendall(struct.pack("!L", 0))
            reply = sock.recv(4096).decode(errors="replace")
    except OSError as exc:
        logger.warning("hr_secure_files_scan_unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="File scanner unavailable; try again later") from exc
    if "FOUND" in reply:
        logger.warning("hr_secure_files_infected: %s", reply.strip())
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File rejected by the virus scanner")


def _dir(tenant_id: int, kind: str) -> Path:
    return get_media_root() / str(tenant_id) / "hr_secure" / kind


async def save(file: UploadFile, tenant_id: int, kind: str) -> tuple[str, str, int]:
    """Validate, clean, scan, encrypt and store. Returns (stored_name, detected_type, size)."""
    spec = KINDS[kind]
    data = await file.read(spec["max"] + 1)
    if len(data) > spec["max"]:
        raise HTTPException(status_code=400, detail=f"File too large (max {spec['max'] // (1024 * 1024)} MB)")
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    detected = sniff_type(data)
    if detected not in spec["types"]:
        raise HTTPException(status_code=400, detail="Unsupported file type (allowed: " + ", ".join(sorted(spec["types"])) + ")")
    if detected in ("jpeg", "png"):
        data = _reencode_image(data, detected)
    _clamav_scan(data)
    stored = f"{uuid4().hex}{EXT[detected]}.enc"
    folder = _dir(tenant_id, kind)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / stored).write_bytes(MAGIC_HEADER + _fernet().encrypt(data))
    return stored, detected, len(data)


def _resolve(tenant_id: int, kind: str, stored: str) -> Path | None:
    name = Path(stored or "").name
    if not name or name != stored or not name.endswith(".enc"):
        return None
    root = get_media_root().resolve()
    target = (_dir(tenant_id, kind) / name).resolve()
    try:
        target.relative_to(root / str(tenant_id))
    except ValueError:
        return None
    return target if target.is_file() else None


def read(tenant_id: int, kind: str, stored: str) -> tuple[bytes, str]:
    path = _resolve(tenant_id, kind, stored)
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    blob = path.read_bytes()
    if not blob.startswith(MAGIC_HEADER):
        raise HTTPException(status_code=404, detail="File not found")
    data = _fernet().decrypt(blob[len(MAGIC_HEADER) :])
    return data, MIME.get(sniff_type(data) or "", "application/octet-stream")


def delete(tenant_id: int, kind: str, stored: str | None) -> bool:
    path = _resolve(tenant_id, kind, stored or "")
    if path is None:
        return False
    try:
        path.unlink()
    except OSError:
        return False
    return True
