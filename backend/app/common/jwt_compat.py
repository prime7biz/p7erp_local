"""JWT encode/decode backed by PyJWT, exposing the small python-jose surface the app used.

python-jose is unmaintained and has open CVEs; call sites import ``jwt`` / ``JWTError``
from here so the library choice lives in one place.
"""

from __future__ import annotations

from typing import Any

import jwt as _pyjwt

JWTError = _pyjwt.PyJWTError


class _JwtFacade:
    @staticmethod
    def encode(claims: dict[str, Any], key: str, algorithm: str = "HS256") -> str:
        return _pyjwt.encode(claims, key, algorithm=algorithm)

    @staticmethod
    def decode(
        token: str,
        key: str,
        algorithms: list[str] | str | None = None,
        options: dict[str, Any] | None = None,
        audience: str | list[str] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        algs = [algorithms] if isinstance(algorithms, str) else (algorithms or ["HS256"])
        return _pyjwt.decode(token, key, algorithms=algs, options=options or {}, audience=audience, **kwargs)


jwt = _JwtFacade()
