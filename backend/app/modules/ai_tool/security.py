from __future__ import annotations

from hashlib import sha256

from app.config import get_settings


def normalize_confirmation_token(token: str) -> str:
    return token.strip().upper()


def confirmation_token_hash(token: str) -> str:
    settings = get_settings()
    normalized = normalize_confirmation_token(token)
    material = f"{settings.ai_confirmation_token_pepper}:{normalized}"
    return sha256(material.encode("utf-8")).hexdigest()


def confirmation_token_last4(token: str) -> str:
    normalized = normalize_confirmation_token(token)
    return normalized[-4:] if len(normalized) >= 4 else normalized
