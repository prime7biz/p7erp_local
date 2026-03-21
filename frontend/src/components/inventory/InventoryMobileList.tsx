export function InventoryListViewToggle({
  value,
  onChange,
}: {
  value: "table" | "cards";
  onChange: (v: "table" | "cards") => void;
}) {
  return (
    <div
      className="flex w-full max-w-[220px] rounded-lg border border-border bg-surface-raised p-1 md:hidden"
      role="group"
      aria-label="List layout"
    >
      <button
        type="button"
        className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium touch-manipulation min-h-[44px] ${
          value === "table" ? "bg-brand-primary text-brand-primary-foreground" : "text-text-secondary"
        }`}
        onClick={() => onChange("table")}
      >
        Table
      </button>
      <button
        type="button"
        className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium touch-manipulation min-h-[44px] ${
          value === "cards" ? "bg-brand-primary text-brand-primary-foreground" : "text-text-secondary"
        }`}
        onClick={() => onChange("cards")}
      >
        Cards
      </button>
    </div>
  );
}

/** Wrapper for wide tables: horizontal scroll + touch-friendly panning on phones. */
export const inventoryScrollTableClass = "overflow-x-auto touch-pan-x [scrollbar-gutter:stable]";

/** Minimum ~44px tap height for primary fields on small screens (Apple HIG). */
export const touchFieldClass = "min-h-[44px] touch-manipulation sm:min-h-[38px]";
