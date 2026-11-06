"""Tenant export archives must not contain password hashes, tokens or API keys."""

from __future__ import annotations

import json
import tarfile
from types import SimpleNamespace

import pytest

from app.modules.admin import backup_service
from app.modules.admin.backup_service import is_secret_export_column, strip_secret_columns


@pytest.mark.parametrize(
    "name",
    [
        "password",
        "password_hash",
        "password_reset_token_hash",
        "totp_secret",
        "api_key",
        "PASSWORD_HASH",
        "refresh_token",
        "invite_token",
        "webhook_secret",
        "openai_api_key",
        "selector_hash",
    ],
)
def test_secret_columns_are_detected(name):
    assert is_secret_export_column(name) is True


@pytest.mark.parametrize(
    "name",
    ["id", "tenant_id", "email", "username", "first_name", "password_reset_expires_at", "auth_session_version"],
)
def test_normal_columns_are_kept(name):
    assert is_secret_export_column(name) is False


def test_strip_secret_columns_keeps_other_values():
    row = {"id": 1, "email": "a@b.c", "password_hash": "$2b$12$x", "password_reset_token_hash": "abc"}
    assert strip_secret_columns(row) == {"id": 1, "email": "a@b.c"}


class _Result:
    def __init__(self, cols, rows):
        self._cols = cols
        self._rows = rows

    def keys(self):
        return self._cols

    def all(self):
        return self._rows


class _Nested:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class FakeSession:
    """Returns one users row with secrets; every other table is empty."""

    def __init__(self, job):
        self.job = job

    async def get(self, model, pk):
        return self.job

    async def flush(self):
        pass

    def begin_nested(self):
        return _Nested()

    async def execute(self, stmt, params=None):
        if '"users"' in str(stmt):
            cols = ["id", "tenant_id", "email", "password_hash", "password_reset_token_hash", "first_name"]
            return _Result(cols, [(1, 5, "owner@example.com", "$2b$12$hash", "tokhash", "Owner")])
        return _Result(["id", "tenant_id"], [])


async def test_tenant_export_archive_has_no_secret_columns(monkeypatch, tmp_path):
    monkeypatch.setattr(backup_service, "backup_root", lambda: tmp_path)
    job = SimpleNamespace(
        status=None,
        started_at=None,
        completed_at=None,
        expires_at=None,
        file_name=None,
        storage_path=None,
        size_bytes=None,
        checksum=None,
        error_message=None,
    )
    await backup_service.run_tenant_export_job(FakeSession(job), job_id=1, tenant_id=5)

    assert job.status == "completed", job.error_message
    with tarfile.open(tmp_path / job.storage_path, "r:gz") as tar:
        member = tar.extractfile("export/users.json")
        users = json.loads(member.read().decode("utf-8"))
        names = tar.getnames()

    assert users == [{"id": 1, "tenant_id": 5, "email": "owner@example.com", "first_name": "Owner"}]
    assert "export/meta.json" in names
    assert "export/customers.json" in names
