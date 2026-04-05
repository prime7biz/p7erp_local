import { useState, type FormEvent, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { AlertCircle, ArrowLeft, CheckCircle, Lock } from "lucide-react";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromUrl = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!tokenFromUrl.trim()) {
      setError("Missing reset token. Open the link from your email, or request a new reset from the login page.");
    }
  }, [tokenFromUrl]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!tokenFromUrl.trim()) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({ token: tokenFromUrl, new_password: password });
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 bg-gradient-to-b from-surface-subtle to-surface-raised">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="text-center">
          <img src="/images/logo.png" alt="Prime7 ERP" className="h-10 w-auto mx-auto mb-3" />
          <h1 className="text-xl font-bold text-text-primary">Set a new password</h1>
          <p className="text-sm text-text-secondary mt-1">Choose a strong password for your account</p>
        </div>

        {done ? (
          <div className="rounded-lg border border-status-success/25 bg-status-success-subtle px-4 py-4 text-sm text-text-primary flex gap-3">
            <CheckCircle className="h-5 w-5 shrink-0 text-status-success" />
            <div>
              <p className="font-medium">Password updated</p>
              <p className="mt-1 text-text-secondary">Redirecting to sign in…</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="np" className="text-text-secondary text-sm font-medium">
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                <input
                  id="np"
                  type="password"
                  className="w-full pl-10 pr-4 py-3 h-11 rounded-md border border-border bg-surface-raised focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="npc" className="text-text-secondary text-sm font-medium">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                <input
                  id="npc"
                  type="password"
                  className="w-full pl-10 pr-4 py-3 h-11 rounded-md border border-border bg-surface-raised focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !tokenFromUrl.trim()}
              className="w-full h-11 rounded-md bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground font-medium disabled:opacity-60"
            >
              {loading ? "Saving…" : "Update password"}
            </button>
          </form>
        )}

        <Link
          to="/login"
          className="text-sm text-text-muted hover:text-brand-primary inline-flex items-center gap-1.5 justify-center w-full"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
