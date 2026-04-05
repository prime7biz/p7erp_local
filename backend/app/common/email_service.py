from __future__ import annotations

from urllib.parse import quote

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from app.config import get_settings


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
    message = MessageSchema(
        subject="Reset your Prime7 ERP password",
        recipients=[to_email],
        body=_build_forgot_password_html(
            recipient_name=recipient_name or "",
            reset_url=reset_url,
        ),
        subtype=MessageType.html,
    )
    fm = FastMail(get_mail_connection_config())
    await fm.send_message(message)


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
              Your account for <strong>{tenant_name}</strong> is ready. You can sign in with your username and password.
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
    message = MessageSchema(
        subject="Your Prime7 ERP account is ready",
        recipients=[to_email],
        body=_build_registration_confirmation_html(
            recipient_name=recipient_name or "",
            tenant_name=tenant_name.strip() or "your organization",
            company_code=company_code,
            login_url=login_url,
        ),
        subtype=MessageType.html,
    )
    fm = FastMail(get_mail_connection_config())
    await fm.send_message(message)


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
    portal_label = "Customer Portal" if principal_type == "customer" else "Financier Portal"
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
    accept_path = "/portal/customer/accept-invite" if principal_type == "customer" else "/portal/financier/accept-invite"
    accept_url = f"{frontend_url}{accept_path}?token={quote(invite_token, safe='')}"
    portal_label = "Customer Portal" if principal_type == "customer" else "Financier Portal"
    message = MessageSchema(
        subject=f"Prime7 ERP invitation: {portal_label}",
        recipients=[to_email],
        body=_build_external_invitation_html(
            recipient_name=recipient_name or "",
            tenant_name=tenant_name,
            company_code=company_code,
            principal_type=principal_type,
            accept_url=accept_url,
            expires_at_label=expires_at_label,
        ),
        subtype=MessageType.html,
    )
    fm = FastMail(get_mail_connection_config())
    await fm.send_message(message)
