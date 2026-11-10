"""HR document extraction results: honest success flag, document-specific warnings, provider failure logs.

Run: docker compose exec backend pytest tests/test_ai_extract_hr_results.py -q
"""

from __future__ import annotations

import logging

import httpx
import pytest

from app.modules.ai_extract import service
from app.modules.ai_extract.normalizers import normalize_date
from app.modules.ai_extract.providers import gemini_provider
from app.modules.ai_extract.providers.base import BaseExtractionProvider


class _Provider(BaseExtractionProvider):
    def __init__(self, raw: dict):
        self.raw = raw

    async def _raw(self, *_a, **_kw):
        return dict(self.raw)

    extract_customer_fields = extract_inquiry_fields = extract_vendor_fields = extract_order_fields = _raw
    extract_lc_fields = extract_shipping_doc_fields = extract_hr_cv_fields = _raw
    extract_hr_national_id_fields = extract_hr_medical_fields = extract_hr_birth_certificate_fields = _raw


EXTRACTORS = (
    service.extract_hr_cv_form,
    service.extract_hr_national_id_form,
    service.extract_hr_medical_form,
    service.extract_hr_birth_certificate_form,
)


@pytest.mark.asyncio
@pytest.mark.parametrize("extract", EXTRACTORS)
async def test_nothing_read_is_reported_as_failure_with_the_reason(monkeypatch, extract):
    unavailable = gemini_provider._hr_unavailable("document")
    monkeypatch.setattr(service, "_get_provider", lambda: _Provider(unavailable))
    out = await extract(None, 1, b"x", "image/png")
    assert out.success is False
    assert out.fields == {}
    assert "could not read this document" in out.warnings[0]


@pytest.mark.asyncio
async def test_values_read_are_success_and_birth_certificate_checks_its_own_number(monkeypatch):
    monkeypatch.setattr(
        service, "_get_provider", lambda: _Provider({"name": "Rahima Akter", "date_of_birth": "05 Mar 1998", "_warnings": []})
    )
    birth = await service.extract_hr_birth_certificate_form(None, 1, b"x", "image/png")
    assert birth.success is True
    assert birth.fields["first_name"].value == "Rahima" and birth.fields["date_of_birth"].value == "1998-03-05"
    codes = [a["code"] for a in birth.alerts]
    assert "MISSING_BIRTH_REG" in codes and "MISSING_NID" not in codes
    assert "Birth registration number not found." in birth.warnings

    monkeypatch.setattr(
        service, "_get_provider",
        lambda: _Provider({"name": "Rahima Akter", "birth_registration_number": "19982612345678901"}),
    )
    ok = await service.extract_hr_birth_certificate_form(None, 1, b"x", "image/png")
    assert not [a for a in ok.alerts if a["code"].startswith("MISSING_")]

    nid = await service.extract_hr_national_id_form(None, 1, b"x", "image/png")
    assert [a["code"] for a in nid.alerts] == ["MISSING_NID"]


def test_normalize_date_reads_common_id_card_formats():
    assert normalize_date("05 Mar 1998") == "1998-03-05"
    assert normalize_date("5 March 1998") == "1998-03-05"
    assert normalize_date("05.03.1998") == "1998-03-05"
    assert normalize_date("05-03-1998") == "1998-03-05"
    assert normalize_date("1998-03-05") == "1998-03-05"
    assert normalize_date("05/03/1998") == "1998-03-05"  # day first, unchanged behaviour
    assert normalize_date("not a date") is None


def test_provider_failure_is_logged_without_document_or_credentials(monkeypatch, caplog):
    class _Settings:
        openrouter_enabled = True
        openrouter_api_key = "sk-secret-key-value"
        openrouter_model = "test/model"
        openrouter_base_url = "https://openrouter.example/api/v1"
        openrouter_site_url = ""
        frontend_url = ""
        openrouter_app_name = "P7 ERP"
        ai_timeout_heavy_seconds = 1

    class _FailingClient:
        def __init__(self, *a, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, *a, **kw):
            raise httpx.ConnectError("[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed")

    monkeypatch.setattr(gemini_provider, "get_settings", lambda: _Settings())
    monkeypatch.setattr(gemini_provider.httpx, "Client", _FailingClient)
    with caplog.at_level(logging.WARNING, logger=gemini_provider.__name__):
        out = gemini_provider._openrouter_multimodal_sync("PROMPT-TEXT", b"DOCUMENT-BYTES", "image/png")
    assert out is None
    text = caplog.text
    assert "ai_extract_provider_failed provider=openrouter error=ConnectError" in text
    assert "CERTIFICATE_VERIFY_FAILED" in text
    for secret in ("sk-secret-key-value", "PROMPT-TEXT", "DOCUMENT-BYTES", "RE9DVU1FTlQt"):
        assert secret not in text


def test_failure_log_never_contains_urls_or_line_breaks(caplog):
    url = "https://user:pa55word@openrouter.example/api/v1/chat/completions?token=abc"
    request = httpx.Request("POST", url)
    status_error = httpx.HTTPStatusError("boom " + url, request=request, response=httpx.Response(401, request=request))
    with caplog.at_level(logging.WARNING, logger=gemini_provider.__name__):
        gemini_provider._log_provider_failure("openrouter", status_error)
        gemini_provider._log_provider_failure("ollama", httpx.ConnectError(f"failed {url}\r\nForged: line"))
    text = caplog.text
    assert "status=401" in text and "detail=failed <url> Forged: line" in text
    for leaked in ("pa55word", "token=abc", "openrouter.example", "\r"):
        assert leaked not in text
