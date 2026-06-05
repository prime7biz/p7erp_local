"""Pydantic field serializers for Numeric ORM columns -> API money strings."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from pydantic import field_serializer

from app.common.orm_numeric import decimal_to_money_response, decimal_to_pct_response, decimal_to_rate_response


def serialize_money_value(value: Any) -> str:
    return decimal_to_money_response(value)


def serialize_rate_value(value: Any) -> str:
    return decimal_to_rate_response(value)


def serialize_pct_value(value: Any) -> str:
    return decimal_to_pct_response(value)


class MoneyFieldSerializerMixin:
    """Mixin: declare MONEY_FIELDS on subclass to auto-serialize Decimal columns."""

    MONEY_FIELDS: tuple[str, ...] = ()
    RATE_FIELDS: tuple[str, ...] = ()
    PCT_FIELDS: tuple[str, ...] = ()

    @field_serializer(*MONEY_FIELDS, check_fields=False)
    def _serialize_money_fields(self, value: Any, _info: Any) -> str:
        return serialize_money_value(value)

    @field_serializer(*RATE_FIELDS, check_fields=False)
    def _serialize_rate_fields(self, value: Any, _info: Any) -> str:
        return serialize_rate_value(value)

    @field_serializer(*PCT_FIELDS, check_fields=False)
    def _serialize_pct_fields(self, value: Any, _info: Any) -> str:
        return serialize_pct_value(value)
