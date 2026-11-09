import { useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

/** Subtle banner when tenant feature flag demo_mode_enabled is on. */
export function DemoModeBanner() {
  const { me, refetch, hasPermission } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const demoOn = me?.feature_flags?.demo_mode_enabled === true;
  if (!demoOn || !me) return null;

  const isAdmin = (me.role_name || "").toLowerCase() === "admin" || hasPermission("settings.access");

  const onReset = async () => {
    if (!window.confirm("Reset demo data? This re-runs the Phase 1 demo seed for this tenant.")) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const r = await api.resetPhase1Demo();
      setMsg(r.narrative || "Demo reset complete.");
      await refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div>
        <span className="font-medium">Demo Mode</span>
        <span className="opacity-80"> — Data resets daily</span>
        {msg ? <div className="mt-1 text-xs opacity-90">{msg}</div> : null}
      </div>
      {isAdmin ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onReset()}
          className="rounded border border-amber-400/60 bg-white/80 px-2.5 py-1 text-xs font-medium text-amber-950 hover:bg-white disabled:opacity-50 dark:bg-amber-900/50 dark:text-amber-50"
        >
          {busy ? "Resetting…" : "Reset Demo"}
        </button>
      ) : null}
    </div>
  );
}
