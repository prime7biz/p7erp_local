import { useState } from "react";
import { adminTotpDisable, adminTotpEnable, adminTotpSetup, type AdminTotpSetupResponse } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useToast } from "@/context/ToastContext";

/** Own two-factor authentication (TOTP authenticator app) for the signed-in platform admin. */
export function TwoFactorPage() {
  const { me, refetch, logout } = useAdminAuth();
  const { showToast } = useToast();
  const [setup, setSetup] = useState<AdminTotpSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const enabled = me?.totp_enabled === true;

  async function startSetup() {
    setBusy(true);
    try {
      setSetup(await adminTotpSetup());
      setCode("");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setBusy(true);
    try {
      const res = await adminTotpEnable(code.trim());
      setSetup(null);
      setCode("");
      showToast("Two-factor authentication is on", "success");
      if (res.relogin_required) {
        logout();
        return;
      }
      await refetch();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await adminTotpDisable(password, code.trim());
      setPassword("");
      setCode("");
      showToast("Two-factor authentication is off", "success");
      await refetch();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Two-factor authentication"
        description="Protect your admin account with a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy)."
      />
      {me?.mfa_enrolment_required && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Two-factor authentication is required for platform admins. Set it up to continue.
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <p className="mb-4">
          Status:{" "}
          <span className={enabled ? "font-semibold text-emerald-700" : "font-semibold text-slate-600"}>
            {enabled ? "On" : "Off"}
          </span>
        </p>

        {!enabled && !setup && (
          <button
            type="button"
            disabled={busy}
            onClick={startSetup}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            Set up authenticator app
          </button>
        )}

        {!enabled && setup && (
          <div className="space-y-3">
            <p>1. In your authenticator app, add an account using this setup key (or open the link on your phone):</p>
            <code className="block break-all rounded bg-slate-100 px-2 py-1.5 font-mono text-xs">{setup.secret}</code>
            <a href={setup.otpauth_uri} className="text-xs text-indigo-600 underline">
              Open in authenticator app
            </a>
            <div>
              <label className="block text-xs text-slate-500">2. Enter the 6-digit code it shows</label>
              <input
                inputMode="numeric"
                maxLength={6}
                className={input}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoComplete="one-time-code"
              />
            </div>
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={confirmSetup}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              Turn on
            </button>
          </div>
        )}

        {enabled && (
          <div className="space-y-3">
            <p className="text-slate-600">To turn it off, confirm your password and a current code.</p>
            <div>
              <label className="block text-xs text-slate-500">Current password</label>
              <input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Authenticator code</label>
              <input
                inputMode="numeric"
                maxLength={6}
                className={input}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoComplete="one-time-code"
              />
            </div>
            <button
              type="button"
              disabled={busy || !password || code.length !== 6}
              onClick={disable}
              className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 disabled:opacity-50"
            >
              Turn off
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
