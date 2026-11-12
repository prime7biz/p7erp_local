"""Published demo passwords may only be used by seed scripts in development.

Run:
    docker compose exec backend pytest tests/test_demo_credentials_guard.py -q
"""

from __future__ import annotations

import pytest

from app.common import demo_credentials
from app.common.demo_credentials import KNOWN_DEMO_PASSWORDS, seed_password


@pytest.fixture
def env(monkeypatch):
    def _set(app_env: str):
        monkeypatch.setattr(demo_credentials, "is_development_env", lambda: app_env in demo_credentials.DEV_ENVS)

    return _set


def test_development_uses_repo_default(env, monkeypatch):
    env("development")
    monkeypatch.delenv("SEED_X_PASSWORD", raising=False)
    assert seed_password("SEED_X_PASSWORD", "Demo123!") == "Demo123!"


def test_production_refuses_repo_default(env, monkeypatch):
    env("production")
    monkeypatch.delenv("SEED_X_PASSWORD", raising=False)
    with pytest.raises(RuntimeError, match="SEED_X_PASSWORD"):
        seed_password("SEED_X_PASSWORD", "Demo123!")


def test_production_refuses_published_password_from_env(env, monkeypatch):
    env("production")
    monkeypatch.setenv("SEED_X_PASSWORD", "Lakhsma123")
    with pytest.raises(RuntimeError, match="published"):
        seed_password("SEED_X_PASSWORD", "Demo123!")


def test_production_accepts_private_password(env, monkeypatch):
    env("production")
    monkeypatch.setenv("SEED_X_PASSWORD", "a-private-Passw0rd-only-on-the-server")
    assert seed_password("SEED_X_PASSWORD", "Demo123!") == "a-private-Passw0rd-only-on-the-server"


def test_every_committed_seed_default_is_in_the_known_list():
    from app.seeds.financier_portal_demo import DEFAULT_DEMO_PASSWORD
    from app.seeds.phase1_demo import DEMO_LOGIN_PASSWORD

    assert {DEFAULT_DEMO_PASSWORD, DEMO_LOGIN_PASSWORD, "Lakhsma123"} <= KNOWN_DEMO_PASSWORDS
