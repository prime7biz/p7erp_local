import type { VisibilityState } from "@tanstack/react-table";
import type { GridColumn } from "./types";

export type CardColumns<T> = {
  title: GridColumn<T>[];
  subtitle: GridColumn<T>[];
  status: GridColumn<T>[];
  detail: GridColumn<T>[];
  more: GridColumn<T>[];
  actions: GridColumn<T>[];
};

/**
 * Sorts columns into card slots by their `mobile` role. Title and actions always show (so every card
 * keeps its link and menu); the user's hidden columns stay hidden in the other slots.
 * Without any `title` column the first column is used, so a card always has a heading.
 */
export function splitCardColumns<T>(columns: GridColumn<T>[], visibility: VisibilityState): CardColumns<T> {
  const shown = (c: GridColumn<T>) => visibility[c.id] !== false;
  const out: CardColumns<T> = { title: [], subtitle: [], status: [], detail: [], more: [], actions: [] };
  for (const c of columns) {
    if (c.mobile === "hidden") continue;
    if (c.mobile === "title") out.title.push(c);
    else if (c.mobile === "actions") out.actions.push(c);
    else if (!shown(c)) continue;
    else if (c.mobile === "subtitle") out.subtitle.push(c);
    else if (c.mobile === "status") out.status.push(c);
    else if (c.mobile === "detail") out.detail.push(c);
    else out.more.push(c);
  }
  if (out.title.length === 0) {
    const first = out.more.shift() ?? out.detail.shift();
    if (first) out.title.push(first);
  }
  return out;
}
