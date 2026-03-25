import { useEffect, useState } from "react";
import { getPlatformSettings, putPlatformSettings } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/context/ToastContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { useAdminAuth } from "@/context/AdminAuthContext";

export function PlatformSettingsPage() {
  const { showToast } = useToast();
  const { can } = useAdminAuth();
  const canWrite = can("config.settings_write");
  const [kill, setKill] = useState(false);
  const [maint, setMaint] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlatformSettings()
      .then((s) => {
        setKill(s.gemini_kill_switch);
        setMaint(s.maintenance_mode);
      })
      .catch((e: unknown) => showToast(e instanceof Error ? e.message : "Failed", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  async function save() {
    try {
      await putPlatformSettings({ gemini_kill_switch: kill, maintenance_mode: maint });
      showToast("Settings saved", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Platform settings"
        description="Global switches affecting all tenants (super admin only)."
      />
      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <label className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-slate-800">Gemini kill switch</div>
            <p className="text-xs text-slate-500">When on, server should block Gemini calls.</p>
          </div>
          <input
            type="checkbox"
            checked={kill}
            onChange={(e) => setKill(e.target.checked)}
            disabled={!canWrite}
            className="h-5 w-5"
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-slate-800">Maintenance mode</div>
            <p className="text-xs text-slate-500">Signal for the main app to show maintenance (requires app support).</p>
          </div>
          <input
            type="checkbox"
            checked={maint}
            onChange={(e) => setMaint(e.target.checked)}
            disabled={!canWrite}
            className="h-5 w-5"
          />
        </label>
        {canWrite ? (
          <button type="button" onClick={save} className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white">
            Save changes
          </button>
        ) : (
          <p className="text-xs text-slate-500">View only — super admin required to change global switches.</p>
        )}
      </div>
    </div>
  );
}
