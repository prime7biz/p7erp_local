import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type SavedView, type SavedViewConfig } from "@/api/client";
import { useConfirm } from "@/components/app/useConfirm";
import { logApiError } from "@/utils/logApiError";

type Props = {
  tableKey: string;
  /** Snapshot of the grid's current state to save. */
  getCurrentConfig: () => SavedViewConfig;
  applyConfig: (config: SavedViewConfig) => void;
};

/** "Views" menu: apply, save-as, update and delete named list setups (own + shared in tenant). */
export function SavedViewsMenu({ tableKey, getCurrentConfig, applyConfig }: Props) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftShared, setDraftShared] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      setViews(await api.listSavedViews(tableKey));
    } catch (e) {
      logApiError("SavedViewsMenu.load", e);
    }
  }, [tableKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = views.find((v) => v.id === activeId) ?? null;

  const saveNew = async () => {
    if (!draftName.trim()) return;
    try {
      const created = await api.createSavedView({
        table_key: tableKey,
        name: draftName.trim(),
        config: getCurrentConfig(),
        is_shared: draftShared,
      });
      setActiveId(created.id);
      setDraftName("");
      setDraftShared(false);
      await load();
      toast.success(`Saved view “${created.name}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save view");
    }
  };

  const updateActive = async () => {
    if (!active?.is_mine) return;
    try {
      await api.updateSavedView(active.id, { config: getCurrentConfig() });
      await load();
      toast.success(`Updated “${active.name}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update view");
    }
  };

  const remove = async (v: SavedView) => {
    if (!(await confirm({ title: `Delete view “${v.name}”?`, danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.deleteSavedView(v.id);
      if (activeId === v.id) setActiveId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete view");
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
      >
        <Bookmark className="h-3.5 w-3.5" aria-hidden />
        {active ? `View: ${active.name}` : "Views"}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          <ul role="listbox" aria-label="Saved views" className="max-h-64 overflow-auto">
            {views.length === 0 ? (
              <li className="px-2 py-2 text-xs text-text-muted">No saved views yet.</li>
            ) : (
              views.map((v) => (
                <li key={v.id} role="option" aria-selected={v.id === activeId} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      applyConfig(v.config);
                      setActiveId(v.id);
                      setOpen(false);
                    }}
                    className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                  >
                    <Check className={`h-3.5 w-3.5 ${v.id === activeId ? "opacity-100" : "opacity-0"}`} aria-hidden />
                    <span className="truncate">{v.name}</span>
                    {v.is_shared ? <span className="ml-auto text-[10px] text-text-muted">shared</span> : null}
                  </button>
                  {v.is_mine ? (
                    <button
                      type="button"
                      onClick={() => void remove(v)}
                      aria-label={`Delete view ${v.name}`}
                      className="rounded-md p-1 text-text-muted opacity-0 hover:bg-status-danger-subtle hover:text-status-danger group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
          <div className="mt-1 border-t border-border pt-1">
            <form
              className="space-y-1.5 px-2 py-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void saveNew();
              }}
            >
              <label className="block text-[11px] font-semibold text-text-muted" htmlFor={`sv-name-${tableKey}`}>
                Save current filters &amp; columns as
              </label>
              <div className="flex gap-1">
                <input
                  id={`sv-name-${tableKey}`}
                  value={draftName}
                  maxLength={120}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. Active buyers in Bangladesh"
                  className="min-w-0 flex-1 rounded-md border border-border-strong px-2 py-1 text-xs text-text-primary focus:border-brand-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!draftName.trim()}
                  className="rounded-md bg-brand-primary px-2 py-1 text-xs font-semibold text-brand-primary-foreground disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                <input type="checkbox" checked={draftShared} onChange={(e) => setDraftShared(e.target.checked)} />
                Share with everyone in my company
              </label>
            </form>
            {active?.is_mine ? (
              <button
                type="button"
                onClick={() => void updateActive()}
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
              >
                Update “{active.name}” with current setup
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
