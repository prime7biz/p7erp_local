"""AI extract uploads are read in chunks and stop with 413 once over the size limit.

Run (worktree mounted over /app):
docker compose run --rm --no-deps backend pytest -q tests/test_ai_extract_upload_limit.py
"""

from __future__ import annotations

from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile

from app.modules.ai_extract import router as extract_router


class _CountingFile(BytesIO):
    def __init__(self, data: bytes) -> None:
        super().__init__(data)
        self.bytes_read = 0

    def read(self, size: int = -1) -> bytes:
        chunk = super().read(size)
        self.bytes_read += len(chunk)
        return chunk


@pytest.mark.asyncio
async def test_upload_within_limit_is_returned_whole(monkeypatch):
    monkeypatch.setattr(extract_router, "MAX_BYTES", 10)
    monkeypatch.setattr(extract_router, "_READ_CHUNK_BYTES", 3)
    upload = UploadFile(file=BytesIO(b"%PDF-12345"), filename="a.pdf")
    assert await extract_router._read_upload_limited(upload) == b"%PDF-12345"


@pytest.mark.asyncio
async def test_upload_over_limit_stops_reading_with_413(monkeypatch):
    monkeypatch.setattr(extract_router, "MAX_BYTES", 10)
    monkeypatch.setattr(extract_router, "_READ_CHUNK_BYTES", 4)
    raw = _CountingFile(b"x" * 100)
    upload = UploadFile(file=raw, filename="big.pdf")

    with pytest.raises(HTTPException) as exc:
        await extract_router._read_upload_limited(upload)
    assert exc.value.status_code == 413
    assert raw.bytes_read <= 12


@pytest.mark.asyncio
async def test_upload_with_declared_size_over_limit_is_rejected_before_reading(monkeypatch):
    monkeypatch.setattr(extract_router, "MAX_BYTES", 10)
    raw = _CountingFile(b"x" * 100)
    upload = UploadFile(file=raw, filename="big.pdf", size=100)

    with pytest.raises(HTTPException) as exc:
        await extract_router._read_upload_limited(upload)
    assert exc.value.status_code == 413
    assert raw.bytes_read == 0
