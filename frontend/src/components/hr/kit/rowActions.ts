export type HrRowAction = {
  key: string;
  label: string;
  onClick?: () => void;
  href?: string;
  /** Show as a visible button (at most two per row; destructive actions always stay in the menu). */
  primary?: boolean;
  /** Approve-style green button when visible. */
  tone?: "positive" | "neutral";
  danger?: boolean;
  disabled?: boolean;
};

export const MAX_VISIBLE_ROW_ACTIONS = 2;

/** Split actions into the visible buttons and the "Actions" menu (HR hybrid pattern). */
export function splitRowActions(actions: HrRowAction[]): { visible: HrRowAction[]; menu: HrRowAction[] } {
  const visible: HrRowAction[] = [];
  const menu: HrRowAction[] = [];
  for (const a of actions) {
    if (a.primary && !a.danger && visible.length < MAX_VISIBLE_ROW_ACTIONS) visible.push(a);
    else menu.push(a);
  }
  return { visible, menu };
}
