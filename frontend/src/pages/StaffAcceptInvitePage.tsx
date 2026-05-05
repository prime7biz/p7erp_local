import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, setAuth } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { PasswordFieldInput } from "@/components/auth/PasswordFieldInput";
import { AlertCircle, ArrowLeft } from "lucide-react";

export function StaffAcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => (searchParams.get("token") || "").trim(), [searchParams]);
  const navigate = useNavigate();
  const { refetch } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Missing invitation token. Open the link from your email.");
      return;
    }
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
      const res = await api.acceptStaffInvite({
        token,
        password,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      });
      const tid = res.tenant_id ?? 0;
      setAuth(res.access_token, tid);
      await refetch();
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invitation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
        <img src="/images/auth-bg-login.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-surface-inverse/85 via-surface-inverse/70 to-brand-primary/30" />
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-16 w-full">
          <img src="/images/logo-white.svg" alt="Prime7 ERP" className="h-24 w-auto mb-6" />
          <h1 className="text-2xl xl:text-3xl font-bold text-text-inverse">Accept staff invitation</h1>
          <p className="text-text-inverse/80 mt-3 max-w-sm">Set your password to activate your Prime7 ERP account.</p>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center px-6 py-10 bg-gradient-to-b from-surface-subtle to-surface-raised">
        <div className="w-full max-w-md mx-auto space-y-6">
          <div className="text-center lg:text-left">
            <img src="/images/logo.png" alt="Prime7 ERP" className="h-10 w-auto mx-auto lg:mx-0 mb-3" />
            <h2 className="text-xl font-bold text-text-primary">Create your password</h2>
            <p className="text-sm text-text-secondary mt-1">You can adjust your name if needed</p>
          </div>

          {!token ? (
            <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
              This page needs a valid invite link. Ask your administrator to resend the invitation.
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="fn" className="text-text-secondary text-sm font-medium">
                  First name
                </label>
                <input
                  id="fn"
                  type="text"
                  className="w-full px-4 py-3 h-11 rounded-md border border-border bg-surface-raised focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ln" className="text-text-secondary text-sm font-medium">
                  Last name
                </label>
                <input
                  id="ln"
                  type="text"
                  className="w-full px-4 py-3 h-11 rounded-md border border-border bg-surface-raised focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pw" className="text-text-secondary text-sm font-medium">
                Password
              </label>
              <PasswordFieldInput
                id="pw"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                required
                minLength={8}
                inputClassName="w-full py-3 h-11 rounded-md border border-border bg-surface-raised focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pw2" className="text-text-secondary text-sm font-medium">
                Confirm password
              </label>
              <PasswordFieldInput
                id="pw2"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                required
                minLength={8}
                inputClassName="w-full py-3 h-11 rounded-md border border-border bg-surface-raised focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !token}
              className="w-full h-11 rounded-md bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground font-medium disabled:opacity-60"
            >
              {loading ? "Activating…" : "Activate account"}
            </button>
          </form>

          <Link
            to="/login"
            className="text-sm text-text-muted hover:text-brand-primary inline-flex items-center gap-1.5 justify-center w-full"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
