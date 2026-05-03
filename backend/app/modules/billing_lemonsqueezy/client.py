"""HTTP client for Lemon Squeezy REST API v1 (JSON:API)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _checkout_payload(
    *,
    store_id: str,
    variant_id: str,
    email: str,
    tenant_id: int,
    user_id: int,
    redirect_url: str | None,
) -> dict[str, Any]:
    product_options: dict[str, Any] = {}
    if redirect_url:
        product_options["redirect_url"] = redirect_url

    attributes: dict[str, Any] = {
        "checkout_data": {
            "email": email,
            "custom": {
                "tenant_id": str(tenant_id),
                "user_id": str(user_id),
            },
        },
        "preview": False,
    }
    if product_options:
        attributes["product_options"] = product_options

    return {
        "data": {
            "type": "checkouts",
            "attributes": attributes,
            "relationships": {
                "store": {"data": {"type": "stores", "id": str(store_id)}},
                "variant": {"data": {"type": "variants", "id": str(variant_id)}},
            },
        }
    }


async def create_checkout(
    *,
    api_base_url: str,
    api_key: str,
    store_id: str,
    variant_id: str,
    email: str,
    tenant_id: int,
    user_id: int,
    redirect_url: str | None,
    timeout_seconds: float = 30.0,
) -> str:
    """POST /v1/checkouts and return `data.attributes.url` (hosted checkout URL)."""
    base = (api_base_url or "https://api.lemonsqueezy.com").rstrip("/")
    url = f"{base}/v1/checkouts"
    headers = {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Authorization": f"Bearer {api_key}",
    }
    body = _checkout_payload(
        store_id=store_id,
        variant_id=variant_id,
        email=email,
        tenant_id=tenant_id,
        user_id=user_id,
        redirect_url=redirect_url,
    )
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        try:
            resp = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as exc:
            logger.exception("Lemon Squeezy checkout request failed: %s", exc)
            raise

    if resp.status_code >= 400:
        logger.warning(
            "Lemon Squeezy checkout HTTP %s: %s",
            resp.status_code,
            resp.text[:2000],
        )
        resp.raise_for_status()

    data = resp.json()
    try:
        checkout_url = data["data"]["attributes"]["url"]
    except (KeyError, TypeError) as exc:
        logger.error("Unexpected Lemon Squeezy checkout response: %s", data)
        raise ValueError("Lemon Squeezy checkout response missing data.attributes.url") from exc
    if not checkout_url or not isinstance(checkout_url, str):
        raise ValueError("Invalid checkout URL in Lemon Squeezy response")
    return checkout_url
