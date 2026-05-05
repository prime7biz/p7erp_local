import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { clearExtAuth, externalAcceptInvite, setExtAuth } from "@/api/externalClient";
import { PasswordFieldInput } from "@/components/auth/PasswordFieldInput";
import { Button } from "@/components/ui/button";
import { erpControlFocusClass } from "@/components/app/listPageLayout";

export function CustomerAcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => (params.get("token") || "").trim(), [params]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => {
      navigate("/portal/customer", { replace: true });
    }, 1800);
    return () => window.clearTimeout(t);
  }, [success, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Invitation token is missing. Please use the invite link from your email.");
      return;
    }
    if (!fullName.trim() || !password) {
      setError("Full name and password are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    clearExtAuth();
    setLoading(true);
    try {
      const res = await externalAcceptInvite({
        token,
        full_name: fullName.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      setExtAuth(res.access_token, res.refresh_token, res.tenant_id, res.principal_type);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invitation acceptance failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-8 shadow-sm">
        <img src="/images/logo.svg" alt="Prime7 ERP" className="mx-auto h-10 w-auto mb-6" />
        <h1 className="text-xl font-semibold text-text-primary text-center">Customer portal invitation</h1>
        <p className="text-sm text-text-muted text-center mt-1 mb-6">Set your password to activate access.</p>
        {success ? (
          <div className="rounded-lg border border-status-success/25 bg-status-success-subtle px-4 py-4 text-sm text-text-primary">
            <p className="font-medium">Account activated</p>
            <p className="mt-2 text-text-muted">Opening your portal…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-text-muted">Full name</label>
              <input
                className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted">Phone (optional)</label>
              <input
                className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </div>
            <div>
              <label htmlFor="portal-customer-invite-pw" className="text-xs font-medium text-text-muted">
                Password
              </label>
              <PasswordFieldInput
                id="portal-customer-invite-pw"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                minLength={8}
                showLock={false}
                wrapperClassName="mt-1"
                inputClassName={`w-full rounded-lg border border-border py-2 text-sm ${erpControlFocusClass}`}
              />
            </div>
            <div>
              <label htmlFor="portal-customer-invite-pw2" className="text-xs font-medium text-text-muted">
                Confirm password
              </label>
              <PasswordFieldInput
                id="portal-customer-invite-pw2"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                minLength={8}
                showLock={false}
                wrapperClassName="mt-1"
                inputClassName={`w-full rounded-lg border border-border py-2 text-sm ${erpControlFocusClass}`}
              />
            </div>
            {error ? <p className="text-sm text-status-danger-foreground">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Activating…" : "Activate account"}
            </Button>
          </form>
        )}
        {!success ? (
          <p className="mt-6 text-center text-xs text-text-muted">
            <Link to="/portal/customer/login" className="text-brand-primary hover:underline">
              Go to customer login
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
