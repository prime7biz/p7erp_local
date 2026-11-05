"""Outbound URL safety checks used by customer/vendor website enrichment (no real network).

Run:
    docker compose exec backend pytest tests/test_safe_http.py -q
"""

from __future__ import annotations

import ipaddress

import httpx
import pytest

from app.common import safe_http
from app.common.safe_http import UnsafeUrlError, fetch_public_url, is_public_ip, validate_public_url

PUBLIC_IP = "93.184.216.34"

FAKE_DNS = {
    "public.example": [PUBLIC_IP],
    "internal.example": ["10.0.0.5"],
    "mixed.example": [PUBLIC_IP, "127.0.0.1"],
}


@pytest.fixture(autouse=True)
def fake_dns(monkeypatch):
    async def _fake_getaddrinfo(host: str, port: int) -> list[str]:
        if host in FAKE_DNS:
            return FAKE_DNS[host]
        if host == "localhost":
            return ["127.0.0.1", "::1"]
        raise OSError("not found")

    monkeypatch.setattr(safe_http, "_getaddrinfo", _fake_getaddrinfo)


@pytest.mark.parametrize(
    "value",
    ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fe80::1",
     "::ffff:127.0.0.1", "::ffff:10.0.0.1", "224.0.0.1", "100.64.0.1"],
)
def test_non_public_ips_rejected(value):
    assert is_public_ip(ipaddress.ip_address(value)) is False


def test_public_ip_allowed():
    assert is_public_ip(ipaddress.ip_address(PUBLIC_IP)) is True
    assert is_public_ip(ipaddress.ip_address("2606:4700:4700::1111")) is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://10.0.0.8:8000/admin",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://localhost:8000/",
        "http://internal.example/",
        "http://mixed.example/",
        "ftp://public.example/file",
        "file:///etc/passwd",
        "http://unresolvable.example/",
    ],
)
async def test_validate_rejects_unsafe_urls(url):
    with pytest.raises(UnsafeUrlError):
        await validate_public_url(url)


@pytest.mark.asyncio
async def test_validate_allows_public_literal_and_hostname():
    parsed, ip = await validate_public_url(f"https://{PUBLIC_IP}/about")
    assert str(ip) == PUBLIC_IP
    parsed, ip = await validate_public_url("https://public.example/about")
    assert parsed.host == "public.example"
    assert str(ip) == PUBLIC_IP


def _use_mock_transport(monkeypatch, handler):
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        safe_http,
        "_make_client",
        lambda timeout: httpx.AsyncClient(transport=transport, follow_redirects=False, trust_env=False),
    )


@pytest.mark.asyncio
async def test_fetch_pins_ip_and_keeps_host_header(monkeypatch):
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, headers={"content-type": "text/html"}, content=b"<p>Hello</p>")

    _use_mock_transport(monkeypatch, handler)
    resp = await fetch_public_url("https://public.example/about")
    assert resp.status_code == 200
    assert "Hello" in resp.text
    assert seen[0].url.host == PUBLIC_IP
    assert seen[0].headers["host"] == "public.example"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "location",
    ["http://internal.example/secret", "http://169.254.169.254/latest/meta-data/", "http://[::1]:8000/"],
)
async def test_redirect_to_private_address_rejected(monkeypatch, location):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": location})

    _use_mock_transport(monkeypatch, handler)
    with pytest.raises(UnsafeUrlError):
        await fetch_public_url("https://public.example/start")


@pytest.mark.asyncio
async def test_too_many_redirects_rejected(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "/again"})

    _use_mock_transport(monkeypatch, handler)
    with pytest.raises(UnsafeUrlError):
        await fetch_public_url("https://public.example/start", max_redirects=2)


@pytest.mark.asyncio
async def test_response_size_is_capped(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/plain"}, content=b"x" * 5000)

    _use_mock_transport(monkeypatch, handler)
    resp = await fetch_public_url("https://public.example/big", max_bytes=1000)
    assert len(resp.content) == 1000
    assert resp.truncated is True


@pytest.mark.asyncio
async def test_customer_enrich_fetch_returns_friendly_warning_for_private_url():
    from app.modules.customers.customer_ai_service import _fetch_website_text as customer_fetch
    from app.modules.inventory.vendor_ai_service import _fetch_website_text as vendor_fetch

    for fetch in (customer_fetch, vendor_fetch):
        text, warnings = await fetch("http://169.254.169.254/latest/meta-data/")
        assert text == ""
        assert warnings and "not allowed" in warnings[0]
