"""Fetch user-supplied URLs only when they point at the public internet.

Used by "AI enrich" features that read a customer/vendor website. Every hop
(including redirects) is resolved and checked, and the request is pinned to the
checked IP so a second DNS lookup cannot swap in an internal address.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass

import httpx

DEFAULT_TIMEOUT_SECONDS = 10.0
DEFAULT_MAX_BYTES = 1_000_000
DEFAULT_MAX_REDIRECTS = 3

_REDIRECT_STATUSES = {301, 302, 303, 307, 308}

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address


class UnsafeUrlError(ValueError):
    """The URL is not an allowed public http(s) address."""


@dataclass
class SafeFetchResponse:
    url: str
    status_code: int
    headers: httpx.Headers
    content: bytes
    truncated: bool

    @property
    def text(self) -> str:
        charset = None
        ct = self.headers.get("content-type") or ""
        for part in ct.split(";")[1:]:
            key, _, value = part.strip().partition("=")
            if key.lower() == "charset" and value:
                charset = value.strip("\"' ")
        try:
            return self.content.decode(charset or "utf-8", errors="replace")
        except LookupError:
            return self.content.decode("utf-8", errors="replace")


def is_public_ip(ip: IPAddress) -> bool:
    if isinstance(ip, ipaddress.IPv6Address):
        embedded = ip.ipv4_mapped or ip.sixtofour
        if embedded is not None:
            return is_public_ip(embedded)
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return False
    return ip.is_global


async def _getaddrinfo(host: str, port: int) -> list[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return [info[4][0] for info in infos]


async def _resolve_ips(host: str, port: int) -> list[IPAddress]:
    try:
        return [ipaddress.ip_address(host)]
    except ValueError:
        pass
    try:
        raw = await _getaddrinfo(host, port)
    except (OSError, UnicodeError) as exc:
        raise UnsafeUrlError("Host could not be resolved") from exc
    ips: list[IPAddress] = []
    for addr in raw:
        try:
            ips.append(ipaddress.ip_address(addr.split("%", 1)[0]))
        except ValueError as exc:
            raise UnsafeUrlError("Host resolved to an invalid address") from exc
    return ips


async def validate_public_url(url: str) -> tuple[httpx.URL, IPAddress]:
    """Return the parsed URL and one checked IP to connect to; raise UnsafeUrlError otherwise."""
    try:
        parsed = httpx.URL(url)
    except Exception as exc:
        raise UnsafeUrlError("Invalid URL") from exc
    if parsed.scheme not in ("http", "https"):
        raise UnsafeUrlError("Only http and https URLs are allowed")
    host = (parsed.host or "").strip().rstrip(".")
    if not host:
        raise UnsafeUrlError("URL has no host")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    ips = await _resolve_ips(host, port)
    if not ips:
        raise UnsafeUrlError("Host could not be resolved")
    if not all(is_public_ip(ip) for ip in ips):
        raise UnsafeUrlError("URL points to a private or reserved address")
    return parsed, ips[0]


def _make_client(timeout: float) -> httpx.AsyncClient:
    # trust_env=False: an environment proxy would do its own DNS lookup and bypass the IP checks.
    return httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False)


async def fetch_public_url(
    url: str,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = DEFAULT_MAX_BYTES,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
    headers: dict[str, str] | None = None,
) -> SafeFetchResponse:
    """GET a public URL with manual, re-validated redirects and a response size cap.

    Raises UnsafeUrlError for disallowed targets and httpx errors for network failures.
    """
    current = url
    async with _make_client(timeout) as client:
        for _hop in range(max_redirects + 1):
            target, ip = await validate_public_url(current)
            req_headers = dict(headers or {})
            req_headers["Host"] = target.netloc.decode("ascii")
            extensions = {}
            if target.scheme == "https":
                extensions["sni_hostname"] = target.host
            pinned = target.copy_with(host=str(ip))
            async with client.stream("GET", pinned, headers=req_headers, extensions=extensions) as resp:
                location = resp.headers.get("location")
                if resp.status_code in _REDIRECT_STATUSES and location:
                    current = str(target.join(location))
                    continue
                chunks: list[bytes] = []
                total = 0
                truncated = False
                async for chunk in resp.aiter_bytes():
                    room = max_bytes - total
                    if len(chunk) > room:
                        chunks.append(chunk[:room])
                        total = max_bytes
                        truncated = True
                        break
                    chunks.append(chunk)
                    total += len(chunk)
                return SafeFetchResponse(
                    url=str(target),
                    status_code=resp.status_code,
                    headers=resp.headers,
                    content=b"".join(chunks),
                    truncated=truncated,
                )
    raise UnsafeUrlError("Too many redirects")
