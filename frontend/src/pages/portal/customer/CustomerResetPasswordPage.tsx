import { useState, type FormEvent, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { externalResetPassword } from "@/api/externalClient";
import { Button } from "@/components/ui/button";
import { erpControlFocusClass } from "@/components/app/listPageLayout";

export function CustomerResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromUrl = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!tokenFromUrl.trim()) {
      setError("Missing reset token. Open the link from your email, or request a new reset.");
    }
  }, [tokenFromUrl]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!tokenFromUrl.trim()) return;
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
      await externalResetPassword({ token: tokenFromUrl.trim(), new_password: password });
      setDone(true);
      setTimeout(() => navigate("/portal/customer/login", { replace: true }), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-8 shadow-sm">
        <img src="/images/logo.svg" alt="Prime7 ERP" className="mx-auto h-10 w-auto mb-6" />
        <h1 className="text-xl font-semibold text-text-primary text-center">Set a new password</h1>
        <p className="text-sm text-text-muted text-center mt-1 mb-6">Customer portal</p>
        {done ? (
          <div className="rounded-lg border border-status-success/25 bg-status-success-subtle px-4 py-4 text-sm text-text-primary">
            <p className="font-medium">Password updated</p>
            <p className="mt-2 text-text-muted">Redirecting to sign in…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-text-muted">New password</label>
              <input
                type="password"
                className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
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
                minLength={8}
                required
              />
            </div>
            {error ? <p className="text-sm text-status-danger-foreground">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading || !tokenFromUrl.trim()}>
              {loading ? "Saving…" : "Update password"}
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-xs text-text-muted">
          <Link to="/portal/customer/login" className="text-brand-primary hover:underline">
            Back to customer login
          </Link>
        </p>
      </div>
    </div>
  );
}
