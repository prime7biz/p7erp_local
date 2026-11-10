import { createContext, useContext } from "react";

/**
 * True when a page is rendered inside a tabbed hub (e.g. HR → Leave → Approvals tab).
 * The hub already shows the page title, so embedded pages hide their own heading and breadcrumbs.
 */
export const EmbeddedPageContext = createContext(false);

export function useEmbeddedPage(): boolean {
  return useContext(EmbeddedPageContext);
}
