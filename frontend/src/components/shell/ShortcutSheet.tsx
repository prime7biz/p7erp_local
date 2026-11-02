import { useEffect } from "react";
import { X } from "lucide-react";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "K"], label: "Search pages and records (Cmd+K on Mac)" },
  { keys: ["/"], label: "Open search when not typing in a field" },
  { keys: ["?"], label: "Show this list of shortcuts" },
  { keys: ["↑", "↓"], label: "Move through search results" },
  { keys: ["Enter"], label: "Open the highlighted result" },
  { keys: ["Esc"], label: "Close search, menus and dialogs" },
];

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-inverse/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-sheet-title"
        className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcut-sheet-title" className="text-base font-semibold text-text-primary">
            Keyboard shortcuts
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-text-muted hover:bg-surface-subtle">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3 text-sm text-text-secondary">
              <span>{s.label}</span>
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="rounded border border-border bg-surface-subtle px-1.5 py-0.5 text-[11px] font-medium text-text-primary">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
