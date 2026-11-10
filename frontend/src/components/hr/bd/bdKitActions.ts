import type { HrRowAction } from "@/components/hr/kit/rowActions";

export interface KitAction {
  label: string;
  onClick: () => void;
  /** Visible button (max two per row). Ignored for `danger` actions, which always stay in the menu. */
  primary?: boolean;
  /** Green approve-style button when visible. */
  positive?: boolean;
  danger?: boolean;
  hidden?: boolean;
  disabled?: boolean;
}

export function toRowActions(items: KitAction[]): HrRowAction[] {
  return items
    .filter((a) => !a.hidden)
    .map((a) => ({
      key: a.label,
      label: a.label,
      onClick: a.onClick,
      primary: Boolean(a.primary) && !a.danger,
      tone: a.positive ? "positive" : "neutral",
      danger: a.danger,
      disabled: a.disabled,
    }));
}
