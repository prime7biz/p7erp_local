"""Real client IP behind host Nginx -> frontend Nginx -> backend."""

from __future__ import annotations

import ipaddress

from starlette.requests import HTTPConnection


def is_public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified)


def client_ip_from_request(request: HTTPConnection | None) -> str:
    """Best-effort client IP; ``"unknown"`` when nothing usable is present.

    Clients can prepend arbitrary X-Forwarded-For entries, but each trusted proxy
    appends on the right. Walking from the right and taking the first public
    address skips our own (private/docker) hops and ignores spoofed left entries.
    """
    if request is None:
        return "unknown"
    peer = request.client.host if request.client and request.client.host else ""
    hops = [h.strip() for h in (request.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    chain = hops + ([real_ip] if real_ip else []) + ([peer] if peer else [])
    for candidate in reversed(chain):
        if is_public_ip(candidate):
            return candidate
    return peer or real_ip or "unknown"
