from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import quote

from app.config import get_settings

if TYPE_CHECKING:
    from fastapi_mail import ConnectionConfig

POSTMARK_HEADERS = {"X-PM-Message-Stream": "outbound"}


def _require_email_settings() -> None:
    settings = get_settings()
    required_values = {
        "SMTP_HOST": settings.smtp_host,
        "SMTP_USER": settings.smtp_user,
        "SMTP_PASSWORD": settings.smtp_password,
        "EMAILS_FROM_EMAIL": settings.emails_from_email,
        "EMAILS_FROM_NAME": settings.emails_from_name,
    }
    missing = [name for name, value in required_values.items() if not str(value or "").strip()]
    if missing:
        raise RuntimeError(f"Email settings are not configured: {', '.join(missing)}")


def get_mail_connection_config() -> ConnectionConfig:
    from fastapi_mail import ConnectionConfig

    settings = get_settings()
    _require_email_settings()
    return ConnectionConfig(
        MAIL_USERNAME=settings.smtp_user,
        MAIL_PASSWORD=settings.smtp_password,
        MAIL_FROM=settings.emails_from_email,
        MAIL_FROM_NAME=settings.emails_from_name,
        MAIL_PORT=settings.smtp_port,
        MAIL_SERVER=settings.smtp_host,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )


async def _send_html_email(*, to_email: str, subject: str, body: str) -> None:
    from fastapi_mail import FastMail, MessageSchema, MessageType

    message = MessageSchema(
        subject=subject,
        recipients=[to_email],
        body=body,
        subtype=MessageType.html,
        headers=POSTMARK_HEADERS,
    )
    fm = FastMail(get_mail_connection_config())
    await fm.send_message(message)


def _build_forgot_password_html(*, recipient_name: str, reset_url: str) -> str:
    safe_name = recipient_name.strip() or "there"
    return f"""
    <html>
      <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#111827;">
        <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
            <h2 style="margin:0 0 16px;font-size:24px;color:#111827;">Reset your Prime7 ERP password</h2>
            <p style="margin:0 0 16px;line-height:1.6;">Hello {safe_name},</p>
            <p style="margin:0 0 16px;line-height:1.6;">
              We received a request to reset your password. Use the button below to choose a new password.
            </p>
            <p style="margin:24px 0;">
              <a
                href="{reset_url}"
                style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;"
              >
                Reset Password
              </a>
            </p>
            <p style="margin:0 0 16px;line-height:1.6;">
              If the button does not work, copy and paste this link into your browser:
            </p>
            <p style="margin:0 0 16px;line-height:1.6;word-break:break-all;">
              <a href="{reset_url}" style="color:#2563eb;">{reset_url}</a>
            </p>
            <p style="margin:0;line-height:1.6;color:#6b7280;">
              If you did not request this, you can safely ignore this email.
            </p>
          </div>
        </div>
      </body>
    </html>
    """.strip()


async def send_forgot_password_email(
    *,
    to_email: str,
    reset_token: str,
    recipient_name: str | None = None,
) -> None:
    settings = get_settings()
    frontend_url = settings.frontend_url.rstrip("/") or "https://prime7erp.com"
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"
    await _send_html_email(
        to_email=to_email,
        subject="Reset your Prime7 ERP password",
        body=_build_forgot_password_html(
            recipient_name=recipient_name or "",
            reset_url=reset_url,
        ),
    )


def _build_registration_confirmation_html(
    *,
    recipient_name: str,
    tenant_name: str,
    company_code: str | None,
    login_url: str,
) -> str:
    safe_name = recipient_name.strip() or "there"
    cc = (company_code or "").strip()
    cc_line = (
        f'<p style="margin:0 0 16px;line-height:1.6;"><strong>Company code:</strong> {cc}</p>'
        if cc
        else ""
    )
    return f"""
    <html>
      <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#111827;">
        <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
            <h2 style="margin:0 0 16px;font-size:24px;color:#111827;">Welcome to Prime7 ERP</h2>
            <p style="margin:0 0 16px;line-height:1.6;">Hello {safe_name},</p>
            <p style="margin:0 0 16px;line-height:1.6;">
              Your account for <strong>{tenant_name}</strong> is ready. Sign in with your <strong>company code</strong> and the <strong>email address</strong> you registered.
            </p>
            <p style="margin:0 0 16px;line-height:1.6;color:#374151;">
              Use the unified sign-in page, choose <strong>Staff</strong> or <strong>Tenant Admin</strong> as appropriate, then enter your email and password.
            </p>
            {cc_line}
            <p style="margin:24px 0;">
              <a
                href="{login_url}"
                style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;"
              >
                Sign in
              </a>
            </p>
            <p style="margin:0;line-height:1.6;color:#6b7280;">
              If you did not create this account, contact your administrator.
            </p>
          </div>
        </div>
      </body>
    </html>
    """.strip()


async def send_registration_confirmation_email(
    *,
    to_email: str,
    recipient_name: str | None,
    tenant_name: str,
    company_code: str | None,
) -> None:
    settings = get_settings()
    frontend_url = settings.frontend_url.rstrip("/") or "https://prime7erp.com"
    login_url = f"{frontend_url}/login"
    await _send_html_email(
        to_email=to_email,
        subject="Your Prime7 ERP account is ready",
        body=_build_registration_confirmation_html(
            recipient_name=recipient_name or "",
            tenant_name=tenant_name.strip() or "your organization",
            company_code=company_code,
            login_url=login_url,
        ),
    )


_PORTAL_LABELS = {"customer": "Customer Portal", "financier": "Financier Portal", "supplier": "Supplier Portal"}


def _portal_segment(principal_type: str) -> str:
    """URL segment under /portal/ for a principal type (unknown types fall back to customer)."""
    return principal_type if principal_type in _PORTAL_LABELS else "customer"


def _portal_label(principal_type: str) -> str:
    return _PORTAL_LABELS[_portal_segment(principal_type)]


def _build_external_invitation_html(
    *,
    recipient_name: str,
    tenant_name: str,
    company_code: str | None,
    principal_type: str,
    accept_url: str,
    expires_at_label: str,
) -> str:
    safe_name = recipient_name.strip() or "there"
    safe_tenant = tenant_name.strip() or "your organization"
    safe_company_code = (company_code or "").strip()
    portal_label = _portal_label(principal_type)
    cc_line = (
        f'<p style="margin:0 0 16px;line-height:1.6;"><strong>Company code:</strong> {safe_company_code}</p>'
        if safe_company_code
        else ""
    )
    return f"""
    <html>
      <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#111827;">
        <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
            <h2 style="margin:0 0 16px;font-size:24px;color:#111827;">You are invited to Prime7 ERP {portal_label}</h2>
            <p style="margin:0 0 16px;line-height:1.6;">Hello {safe_name},</p>
            <p style="margin:0 0 16px;line-height:1.6;">
              You have been invited to access <strong>{safe_tenant}</strong> via the {portal_label}.
              Click the button below to create your password and activate your account.
            </p>
            {cc_line}
            <p style="margin:0 0 16px;line-height:1.6;"><strong>Invitation expires:</strong> {expires_at_label} (UTC)</p>
            <p style="margin:24px 0;">
              <a
                href="{accept_url}"
                style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;"
              >
                Accept Invitation
              </a>
            </p>
            <p style="margin:0 0 16px;line-height:1.6;">
              If the button does not work, copy and paste this link into your browser:
            </p>
            <p style="margin:0 0 16px;line-height:1.6;word-break:break-all;">
              <a href="{accept_url}" style="color:#2563eb;">{accept_url}</a>
            </p>
            <p style="margin:0;line-height:1.6;color:#6b7280;">
              If you were not expecting this invitation, you can ignore this email.
            </p>
          </div>
        </div>
      </body>
    </html>
    """.strip()


async def send_external_invitation_email(
    *,
    to_email: str,
    recipient_name: str | None,
    tenant_name: str,
    company_code: str | None,
    principal_type: str,
    invite_token: str,
    expires_at_label: str,
) -> None:
    settings = get_settings()
    frontend_url = settings.frontend_url.rstrip("/") or "https://prime7erp.com"
    accept_url = f"{frontend_url}/portal/{_portal_segment(principal_type)}/accept-invite?token={quote(invite_token, safe='')}"
    portal_label = _portal_label(principal_type)
    await _send_html_email(
        to_email=to_email,
        subject=f"Prime7 ERP invitation: {portal_label}",
        body=_build_external_invitation_html(
            recipient_name=recipient_name or "",
            tenant_name=tenant_name,
            company_code=company_code,
            principal_type=principal_type,
            accept_url=accept_url,
            expires_at_label=expires_at_label,
        ),
    )


def _build_external_password_reset_html(
    *,
    recipient_name: str,
    tenant_name: str,
    company_code: str | None,
    principal_type: str,
    reset_url: str,
) -> str:
    safe_name = recipient_name.strip() or "there"
    safe_tenant = tenant_name.strip() or "your organization"
    safe_company_code = (company_code or "").strip()
    portal_label = _portal_label(principal_type)
    cc_line = (
        f'<p style="margin:0 0 16px;line-height:1.6;"><strong>Company code:</strong> {safe_company_code}</p>'
        if safe_company_code
        else ""
    )
    return f"""
    <html>
      <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#111827;">
        <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
            <h2 style="margin:0 0 16px;font-size:24px;color:#111827;">Reset your {portal_label} password</h2>
            <p style="margin:0 0 16px;line-height:1.6;">Hello {safe_name},</p>
            <p style="margin:0 0 16px;line-height:1.6;">
              We received a request to reset your password for <strong>{safe_tenant}</strong> on Prime7 ERP {portal_label}.
              Use the button below to choose a new password. This link expires in 24 hours.
            </p>
            {cc_line}
            <p style="margin:24px 0;">
              <a
                href="{reset_url}"
                style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;"
              >
                Reset password
              </a>
            </p>
            <p style="margin:0 0 16px;line-height:1.6;">
              If the button does not work, copy and paste this link into your browser:
            </p>
            <p style="margin:0 0 16px;line-height:1.6;word-break:break-all;">
              <a href="{reset_url}" style="color:#2563eb;">{reset_url}</a>
            </p>
            <p style="margin:0;line-height:1.6;color:#6b7280;">
              If you did not request this, you can safely ignore this email.
            </p>
          </div>
        </div>
      </body>
    </html>
    """.strip()


async def send_external_password_reset_email(
    *,
    to_email: str,
    recipient_name: str | None,
    tenant_name: str,
    company_code: str | None,
    principal_type: str,
    reset_token: str,
) -> None:
    settings = get_settings()
    frontend_url = settings.frontend_url.rstrip("/") or "https://prime7erp.com"
    reset_url = f"{frontend_url}/portal/{_portal_segment(principal_type)}/reset-password?token={quote(reset_token, safe='')}"
    portal_label = _portal_label(principal_type)
    await _send_html_email(
        to_email=to_email,
        subject=f"Reset your Prime7 ERP {portal_label} password",
        body=_build_external_password_reset_html(
            recipient_name=recipient_name or "",
            tenant_name=tenant_name,
            company_code=company_code,
            principal_type=principal_type,
            reset_url=reset_url,
        ),
    )


def _build_staff_invitation_html(
    *,
    recipient_name: str,
    tenant_name: str,
    company_code: str | None,
    role_display_name: str,
    accept_url: str,
    expires_at_label: str,
) -> str:
    safe_name = recipient_name.strip() or "there"
    cc = (company_code or "").strip()
    cc_line = (
        f'<p style="margin:0 0 16px;line-height:1.6;"><strong>Company code:</strong> {cc}</p>'
        if cc
        else ""
    )
    return f"""
    <html>
      <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#111827;">
        <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
            <h2 style="margin:0 0 16px;font-size:24px;color:#111827;">You are invited to Prime7 ERP</h2>
            <p style="margin:0 0 16px;line-height:1.6;">Hello {safe_name},</p>
            <p style="margin:0 0 16px;line-height:1.6;">
              You have been invited to join <strong>{tenant_name.strip() or "your organization"}</strong> as <strong>{role_display_name}</strong>.
              Click the button below to set your password and activate your account.
            </p>
            {cc_line}
            <p style="margin:0 0 16px;line-height:1.6;"><strong>Invitation expires:</strong> {expires_at_label} (UTC)</p>
            <p style="margin:24px 0;">
              <a
                href="{accept_url}"
                style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;"
              >
                Accept invitation
              </a>
            </p>
            <p style="margin:0 0 16px;line-height:1.6;">
              If the button does not work, copy and paste this link into your browser:
            </p>
            <p style="margin:0 0 16px;line-height:1.6;word-break:break-all;">
              <a href="{accept_url}" style="color:#2563eb;">{accept_url}</a>
            </p>
            <p style="margin:0;line-height:1.6;color:#6b7280;">
              If you were not expecting this invitation, you can ignore this email.
            </p>
          </div>
        </div>
      </body>
    </html>
    """.strip()


async def send_staff_invitation_email(
    *,
    to_email: str,
    recipient_name: str | None,
    tenant_name: str,
    company_code: str | None,
    role_display_name: str,
    invite_token: str,
    expires_at_label: str,
) -> None:
    settings = get_settings()
    frontend_url = settings.frontend_url.rstrip("/") or "https://prime7erp.com"
    accept_url = f"{frontend_url}/accept-invite?token={quote(invite_token, safe='')}&type=staff"
    await _send_html_email(
        to_email=to_email,
        subject=f"Prime7 ERP invitation: join {tenant_name.strip() or 'your organization'}",
        body=_build_staff_invitation_html(
            recipient_name=recipient_name or "",
            tenant_name=tenant_name,
            company_code=company_code,
            role_display_name=role_display_name,
            accept_url=accept_url,
            expires_at_label=expires_at_label,
        ),
    )


def _build_staff_welcome_html(
    *,
    recipient_name: str,
    tenant_name: str,
    company_code: str | None,
    login_url: str,
) -> str:
    safe_name = recipient_name.strip() or "there"
    cc = (company_code or "").strip()
    cc_line = (
        f'<p style="margin:0 0 16px;line-height:1.6;"><strong>Company code:</strong> {cc}</p>'
        if cc
        else ""
    )
    return f"""
    <html>
      <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#111827;">
        <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
            <h2 style="margin:0 0 16px;font-size:24px;color:#111827;">Welcome to Prime7 ERP</h2>
            <p style="margin:0 0 16px;line-height:1.6;">Hello {safe_name},</p>
            <p style="margin:0 0 16px;line-height:1.6;">
              Your staff account for <strong>{tenant_name.strip() or "your organization"}</strong> is active.
              Sign in with your company code and email address.
            </p>
            {cc_line}
            <p style="margin:24px 0;">
              <a
                href="{login_url}"
                style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;"
              >
                Sign in
              </a>
            </p>
            <p style="margin:0;line-height:1.6;color:#6b7280;">
              If you did not create this account, contact your administrator.
            </p>
          </div>
        </div>
      </body>
    </html>
    """.strip()


async def send_staff_welcome_email(
    *,
    to_email: str,
    recipient_name: str | None,
    tenant_name: str,
    company_code: str | None,
) -> None:
    settings = get_settings()
    frontend_url = settings.frontend_url.rstrip("/") or "https://prime7erp.com"
    login_url = f"{frontend_url}/login"
    await _send_html_email(
        to_email=to_email,
        subject="Your Prime7 ERP staff account is ready",
        body=_build_staff_welcome_html(
            recipient_name=recipient_name or "",
            tenant_name=tenant_name,
            company_code=company_code,
            login_url=login_url,
        ),
    )


def _build_password_changed_html(*, recipient_name: str) -> str:
    safe_name = recipient_name.strip() or "there"
    return f"""
    <html>
      <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#111827;">
        <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
            <h2 style="margin:0 0 16px;font-size:24px;color:#111827;">Your password was changed</h2>
            <p style="margin:0 0 16px;line-height:1.6;">Hello {safe_name},</p>
            <p style="margin:0 0 16px;line-height:1.6;">
              The password for your Prime7 ERP account was just changed. If you did not make this change, contact your administrator immediately.
            </p>
            <p style="margin:0;line-height:1.6;color:#6b7280;">
              This is an automated security notification.
            </p>
          </div>
        </div>
      </body>
    </html>
    """.strip()


async def send_new_lead_notification_email(*, to_email: str, lead: dict[str, str | None]) -> None:
    """Notify sales that a visitor submitted the Book a demo / Contact form."""
    from html import escape

    rows = "".join(
        f"<tr><td style='padding:4px 12px 4px 0;color:#6b7280;'>{escape(k)}</td>"
        f"<td style='padding:4px 0;'>{escape(v or '—')}</td></tr>"
        for k, v in lead.items()
    )
    await _send_html_email(
        to_email=to_email,
        subject=f"New Prime7 ERP lead: {lead.get('company') or lead.get('name') or 'website'}",
        body=f"<html><body style='font-family:Arial,sans-serif;'><h2>New website lead</h2><table>{rows}</table></body></html>",
    )


async def send_password_changed_notification_email(
    *,
    to_email: str,
    recipient_name: str | None,
) -> None:
    await _send_html_email(
        to_email=to_email,
        subject="Prime7 ERP: password changed",
        body=_build_password_changed_html(recipient_name=recipient_name or ""),
    )
