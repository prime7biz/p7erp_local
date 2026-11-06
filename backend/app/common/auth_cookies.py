"""HttpOnly refresh-token cookies (env AUTH_REFRESH_COOKIE_ENABLED, default off).

With the flag on, the long-lived refresh token lives in a cookie that page JavaScript cannot read,
so an XSS bug cannot copy it to another machine. Any request that relies on the cookie must also
send ``X-Requested-With: p7``: SameSite=Strict stops other sites from sending the cookie, and the
custom header forces a CORS preflight that only origins listed in CORS_ORIGINS can pass.
"""

from __future__ import annotations

from fastapi import HTTPException, Request, Response, status

from app.config import get_settings

EXTERNAL_REFRESH_COOKIE_NAME = "p7_ext_refresh"
# Browser-visible path of the portal auth routes; the cookie is sent to these URLs only.
EXTERNAL_REFRESH_COOKIE_PATH = "/api/external/auth"
CSRF_HEADER_NAME = "X-Requested-With"
CSRF_HEADER_VALUE = "p7"

_SAMESITE_VALUES = ("strict", "lax", "none")


def refresh_cookie_enabled() -> bool:
    return bool(get_settings().auth_refresh_cookie_enabled)


def _cookie_samesite() -> str:
    value = (get_settings().auth_cookie_samesite or "").strip().lower()
    return value if value in _SAMESITE_VALUES else "strict"


def _cookie_secure(samesite: str) -> bool:
    # Browsers drop SameSite=None cookies that are not Secure.
    return bool(get_settings().auth_cookie_secure) or samesite == "none"


def _cookie_domain() -> str | None:
    return (get_settings().auth_cookie_domain or "").strip() or None


def has_csrf_header(request: Request) -> bool:
    return (request.headers.get(CSRF_HEADER_NAME) or "").strip().lower() == CSRF_HEADER_VALUE


def require_csrf_header(request: Request) -> None:
    if not has_csrf_header(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing {CSRF_HEADER_NAME} header",
        )


def read_external_refresh_cookie(request: Request) -> str | None:
    return (request.cookies.get(EXTERNAL_REFRESH_COOKIE_NAME) or "").strip() or None


def set_external_refresh_cookie(response: Response, token: str) -> None:
    samesite = _cookie_samesite()
    response.set_cookie(
        key=EXTERNAL_REFRESH_COOKIE_NAME,
        value=token,
        max_age=int(get_settings().external_jwt_refresh_expire_days) * 86400,
        path=EXTERNAL_REFRESH_COOKIE_PATH,
        domain=_cookie_domain(),
        secure=_cookie_secure(samesite),
        httponly=True,
        samesite=samesite,
    )


def clear_external_refresh_cookie(response: Response) -> None:
    samesite = _cookie_samesite()
    response.delete_cookie(
        key=EXTERNAL_REFRESH_COOKIE_NAME,
        path=EXTERNAL_REFRESH_COOKIE_PATH,
        domain=_cookie_domain(),
        secure=_cookie_secure(samesite),
        httponly=True,
        samesite=samesite,
    )
