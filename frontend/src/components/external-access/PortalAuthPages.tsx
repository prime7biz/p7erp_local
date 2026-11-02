import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { clearExtAuth, externalAcceptInvite, externalResetPassword, setExtAuth } from "@/api/externalClient";
import { PasswordFieldInput } from "@/components/auth/PasswordFieldInput";
import { Button } from "@/components/ui/button";
import { erpControlFocusClass } from "@/components/app/listPageLayout";
import { EXT_PORTAL_LABEL, portalHomePath } from "@/lib/externalAccess";
import type { ExternalPrincipalType } from "@/types/externalAccess";

const inputClass = `mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`;
const pwClass = `w-full rounded-lg border border-border py-2 text-sm ${erpControlFocusClass}`;

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-8 shadow-sm">
        <img src="/images/logo.svg" alt="Prime7 ERP" className="mx-auto mb-6 h-10 w-auto" />
        <h1 className="text-center text-xl font-semibold text-text-primary">{title}</h1>
        <p className="mb-6 mt-1 text-center text-sm text-text-muted">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function validate(password: string, confirm: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

/** Accept an emailed invitation for any external portal and sign straight in. */
export function PortalAcceptInvitePage({ portal }: { portal: ExternalPrincipalType }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => (params.get("token") || "").trim(), [params]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => navigate(portalHomePath(portal), { replace: true }), 1500);
    return () => window.clearTimeout(t);
  }, [success, navigate, portal]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) return setError("Invitation token is missing. Please use the invite link from your email.");
    if (!fullName.trim()) return setError("Full name is required.");
    const bad = validate(password, confirm);
    if (bad) return setError(bad);
    clearExtAuth();
    setLoading(true);
    try {
      const res = await externalAcceptInvite({ token, full_name: fullName.trim(), password, phone: phone.trim() || undefined });
      if (res.principal_type !== portal) throw new Error("This invitation is for a different portal.");
      setExtAuth(res.access_token, res.refresh_token, res.tenant_id, res.principal_type);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invitation acceptance failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title={`${EXT_PORTAL_LABEL[portal]} invitation`} subtitle="Set your password to activate access.">
      {success ? (
        <div className="rounded-lg border border-status-success/25 bg-status-success-subtle px-4 py-4 text-sm text-text-primary" role="status">
          <p className="font-medium">Account activated</p>
          <p className="mt-2 text-text-muted">Opening your portal…</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="inv-name" className="text-xs font-medium text-text-muted">Full name</label>
            <input id="inv-name" className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="inv-phone" className="text-xs font-medium text-text-muted">Phone (optional)</label>
            <input id="inv-phone" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </div>
          <div>
            <label htmlFor="inv-pw" className="text-xs font-medium text-text-muted">Password</label>
            <PasswordFieldInput id="inv-pw" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} showLock={false} wrapperClassName="mt-1" inputClassName={pwClass} />
          </div>
          <div>
            <label htmlFor="inv-pw2" className="text-xs font-medium text-text-muted">Confirm password</label>
            <PasswordFieldInput id="inv-pw2" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} showLock={false} wrapperClassName="mt-1" inputClassName={pwClass} />
          </div>
          {error ? <p className="text-sm text-status-danger-foreground" role="alert">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Activating…" : "Activate account"}</Button>
        </form>
      )}
      {!success ? (
        <p className="mt-6 text-center text-xs text-text-muted">
          <Link to={`/login?role=${portal}`} className="text-brand-primary hover:underline">Go to sign in</Link>
        </p>
      ) : null}
    </Card>
  );
}

/** Choose a new password from an emailed reset link for any external portal. */
export function PortalResetPasswordPage({ portal }: { portal: ExternalPrincipalType }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = (params.get("token") || "").trim();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(token ? "" : "Missing reset token. Open the link from your email, or request a new reset.");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const bad = validate(password, confirm);
    if (bad) return setError(bad);
    setError("");
    setLoading(true);
    try {
      await externalResetPassword({ token, new_password: password });
      setDone(true);
      window.setTimeout(() => navigate(`/login?role=${portal}`, { replace: true }), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Set a new password" subtitle={EXT_PORTAL_LABEL[portal]}>
      {done ? (
        <div className="rounded-lg border border-status-success/25 bg-status-success-subtle px-4 py-4 text-sm text-text-primary" role="status">
          <p className="font-medium">Password updated</p>
          <p className="mt-2 text-text-muted">Redirecting to sign in…</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="rp-pw" className="text-xs font-medium text-text-muted">New password</label>
            <PasswordFieldInput id="rp-pw" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} required showLock={false} wrapperClassName="mt-1" inputClassName={pwClass} />
          </div>
          <div>
            <label htmlFor="rp-pw2" className="text-xs font-medium text-text-muted">Confirm password</label>
            <PasswordFieldInput id="rp-pw2" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} required showLock={false} wrapperClassName="mt-1" inputClassName={pwClass} />
          </div>
          {error ? <p className="text-sm text-status-danger-foreground" role="alert">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading || !token}>{loading ? "Saving…" : "Update password"}</Button>
        </form>
      )}
    </Card>
  );
}
