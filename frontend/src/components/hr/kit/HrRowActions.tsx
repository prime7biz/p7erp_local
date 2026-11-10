import { useState } from "react";
import { Link } from "react-router-dom";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { splitRowActions, type HrRowAction } from "./rowActions";

const buttonBase =
  "inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 lg:py-1";

function visibleClass(a: HrRowAction): string {
  return a.tone === "positive"
    ? `${buttonBase} bg-status-success text-white hover:opacity-90`
    : `${buttonBase} border border-border-strong text-text-secondary hover:bg-surface-subtle`;
}

/**
 * Row actions: the 1–2 most used actions as visible buttons, everything else
 * (including Delete) in one "Actions" dropdown.
 */
export function HrRowActions({ rowId, actions }: { rowId: string | number; actions: HrRowAction[] }) {
  const [openId, setOpenId] = useState<string | number | null>(null);
  const { visible, menu } = splitRowActions(actions);
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {visible.map((a) =>
        a.href ? (
          <Link key={a.key} to={a.href} className={visibleClass(a)}>
            {a.label}
          </Link>
        ) : (
          <button key={a.key} type="button" disabled={a.disabled} onClick={a.onClick} className={visibleClass(a)}>
            {a.label}
          </button>
        ),
      )}
      {menu.length > 0 ? (
        <RowActionsMenu
          rowId={rowId}
          openId={openId}
          onOpenChange={setOpenId}
          menuPortal
          items={menu.map<RowActionItem>((a) => ({
            key: a.key,
            label: a.label,
            onClick: a.onClick,
            href: a.href,
            danger: a.danger,
            disabled: a.disabled,
          }))}
        />
      ) : null}
    </div>
  );
}
