import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { PWA_ENABLED, applyUpdate, useAppUpdate } from "@/lib/pwa/appUpdate";
import { isAnyFormDirty } from "@/lib/unsavedChanges";

/**
 * Thin strip at the top when a new release is ready. It never covers Save buttons and never
 * reloads by itself while a form has unsaved changes (see lib/pwa/appUpdate.ts).
 *
 * After the user moves to another page inside the app (link, menu, or navigate()), the waiting
 * release is loaded for that page. Links keep their own click handlers; the switch happens after.
 */
export function AppUpdateBanner() {
  const { available, formDirty } = useAppUpdate();
  const [hidden, setHidden] = useState(false);
  const { key } = useLocation();
  const lastKey = useRef(key);

  useEffect(() => {
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (PWA_ENABLED && available && !isAnyFormDirty()) applyUpdate();
  }, [key, available]);

  if (!PWA_ENABLED || !available || hidden) return null;
  return (
    <div
      role="status"
      className="no-print fixed inset-x-0 top-0 z-[130] flex flex-wrap items-center justify-center gap-2 bg-gray-900 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-sm text-white shadow-lg"
    >
      <span>
        {formDirty
          ? "A new version of Prime7 ERP is ready. Save your work first, then reload."
          : "A new version of Prime7 ERP is ready."}
      </span>
      <button
        type="button"
        onClick={() => applyUpdate()}
        disabled={formDirty}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-brand-primary px-3 font-semibold text-brand-primary-foreground disabled:opacity-50"
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        Reload now
      </button>
      <button type="button" onClick={() => setHidden(true)} className="min-h-[36px] rounded-md px-2 text-white/80 hover:text-white">
        Later
      </button>
    </div>
  );
}
