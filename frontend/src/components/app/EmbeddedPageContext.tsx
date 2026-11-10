import type { ReactNode } from "react";
import { EmbeddedPageContext } from "./embeddedPage";

export function EmbeddedPageProvider({ children }: { children: ReactNode }) {
  return <EmbeddedPageContext.Provider value>{children}</EmbeddedPageContext.Provider>;
}
