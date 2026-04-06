import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { externalRequestPasswordReset } from "@/api/externalClient";
import { Button } from "@/components/ui/button";
import { erpControlFocusClass } from "@/components/app/listPageLayout";

export function FinancierForgotPasswordPage() {
  const [companyCode, setCompanyCode] = useState(() => (localStorage.getItem("lastCompanyCode") || "").toUpperCase());
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const code = companyCode.trim().toUpperCase();
    const em = email.trim();
    if (!code || !em) {
      setError("Company code and email are required.");
      return;
    }
    setLoading(true);
    try {
      await externalRequestPasswordReset({
        company_code: code,
        email: em,
        principal_type: "financier",
      });
      localStorage.setItem("lastCompanyCode", code);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-8 shadow-sm">
        <img src="/images/logo.svg" alt="Prime7 ERP" className="mx-auto h-10 w-auto mb-6" />
        <h1 className="text-xl font-semibold text-text-primary text-center">Forgot password</h1>
        <p className="text-sm text-text-muted text-center mt-1 mb-6">
          Enter your company code and email. If an account exists, we will send a reset link.
        </p>
        {done ? (
          <div className="rounded-lg border border-status-success/25 bg-status-success-subtle px-4 py-4 text-sm text-text-primary">
            <p className="font-medium">Check your inbox</p>
            <p className="mt-2 text-text-muted">
              If an account exists for this email, password reset instructions have been sent. The link expires in 24 hours.
            </p>
            <Link to="/portal/financier/login" className="mt-4 inline-block text-brand-primary text-sm font-medium hover:underline">
              Back to financier login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-text-muted">Company code</label>
              <input
                className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-mono uppercase ${erpControlFocusClass}`}
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                autoComplete="organization"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted">Email</label>
              <input
                type="email"
                className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            {error ? <p className="text-sm text-status-danger-foreground">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-xs text-text-muted">
          <Link to="/portal/financier/login" className="text-brand-primary hover:underline">
            Back to financier login
          </Link>
        </p>
      </div>
    </div>
  );
}
