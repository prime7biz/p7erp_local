import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

type Action = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean };

type ActionsMenuProps = {
  rowId: string | number;
  openId: string | number | null;
  onOpenChange: (id: string | number | null) => void;
  actions: Action[];
};

export function ActionsMenu({ rowId, openId, onOpenChange, actions }: ActionsMenuProps) {
  const open = openId === rowId;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, onOpenChange]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => onOpenChange(open ? null : rowId)}
        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
      >
        Actions <ChevronDown className="inline h-3 w-3 ml-0.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={a.disabled}
              onClick={() => {
                onOpenChange(null);
                a.onClick();
              }}
              className={cn(
                "block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50",
                a.danger && "text-red-600 hover:bg-red-50",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
