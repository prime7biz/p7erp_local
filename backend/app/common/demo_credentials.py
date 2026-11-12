"""Demo / seed passwords that are published in this (public) repository.

They are fine on a developer machine. Outside development a seed script must get its password from an
environment variable instead, so no live account is ever created with a password anyone can read on GitHub.
`scripts/check_demo_passwords.py` reports (counts only) whether any active account still uses one.
"""

from __future__ import annotations

import os

from app.config import get_settings

KNOWN_DEMO_PASSWORDS: frozenset[str] = frozenset(
    {
        "Lakhsma123",
        "Demo123!",
        "FinancierPortalDemo123",
        "UatPass123",
    }
)

DEV_ENVS = frozenset({"dev", "development", "local", "test", "testing"})


def is_development_env() -> bool:
    return (get_settings().app_env or "").strip().lower() in DEV_ENVS


def seed_password(env_var: str, default: str) -> str:
    """Password for a seed script: `env_var` if set, else the repo default (development only)."""
    value = (os.environ.get(env_var) or "").strip()
    if value:
        if value in KNOWN_DEMO_PASSWORDS and not is_development_env():
            raise RuntimeError(f"{env_var} is a published demo password; choose a private one.")
        return value
    if not is_development_env():
        raise RuntimeError(
            f"Refusing to use the published demo password outside development. Set {env_var} to a private password."
        )
    return default
