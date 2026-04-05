"""Unit tests for external access helpers (no DB required)."""

from app.external_access.constants import (
    SCOPE_FINANCIAL_SUMMARY,
    SCOPE_FULL_FINANCIER_PORTAL,
    SCOPE_ORDERS_AND_PIPELINE,
    SCOPE_TENANT_SUMMARY,
    parse_external_subject,
)
from app.external_access.permissions import financier_scope_satisfies


def test_parse_external_subject_valid() -> None:
    assert parse_external_subject("ext:42") == 42


def test_parse_external_subject_rejects_internal_numeric_sub() -> None:
    assert parse_external_subject("42") is None


def test_parse_external_subject_rejects_garbage() -> None:
    assert parse_external_subject(None) is None
    assert parse_external_subject("ext:abc") is None


def test_financier_scope_hierarchy() -> None:
    assert financier_scope_satisfies(SCOPE_TENANT_SUMMARY, SCOPE_TENANT_SUMMARY)
    assert financier_scope_satisfies(SCOPE_TENANT_SUMMARY, SCOPE_FULL_FINANCIER_PORTAL)
    assert financier_scope_satisfies(SCOPE_ORDERS_AND_PIPELINE, SCOPE_ORDERS_AND_PIPELINE)
    assert financier_scope_satisfies(SCOPE_FINANCIAL_SUMMARY, SCOPE_FULL_FINANCIER_PORTAL)
    assert not financier_scope_satisfies(SCOPE_FULL_FINANCIER_PORTAL, SCOPE_TENANT_SUMMARY)
    assert not financier_scope_satisfies(SCOPE_ORDERS_AND_PIPELINE, SCOPE_TENANT_SUMMARY)
