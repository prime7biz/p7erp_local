import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { externalAcceptInvite, setExtAuth } from "@/api/externalClient";
import { Button } from "@/components/ui/button";
import { erpControlFocusClass } from "@/components/app/listPageLayout";

export function FinancierAcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => (params.get("token") || "").trim(), [params]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

    setLoading(true);
    try {
      const res = await externalAcceptInvite({
        token,
        full_name: fullName.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      setExtAuth(res.access_token, res.refresh_token, res.tenant_id, res.principal_type);
      navigate("/portal/financier", { replace: true });
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
        <h1 className="text-xl font-semibold text-text-primary text-center">Financier portal invitation</h1>
        <p className="text-sm text-text-muted text-center mt-1 mb-6">Set your password to activate access.</p>
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
            <label className="text-xs font-medium text-text-muted">Password</label>
            <input
              type="password"
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Confirm password</label>
            <input
              type="password"
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error ? <p className="text-sm text-status-danger-foreground">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Activating…" : "Activate account"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-text-muted">
          <Link to="/portal/financier/login" className="text-brand-primary hover:underline">
            Go to financier login
          </Link>
        </p>
      </div>
    </div>
  );
}
