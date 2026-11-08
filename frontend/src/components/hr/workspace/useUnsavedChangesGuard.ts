/**
 * Warn before leaving a page with unsaved changes. The app uses <BrowserRouter> (no data-router
 * blocker), so this covers the three ways out:
 * - closing / reloading the tab (beforeunload),
 * - clicking any in-app link, e.g. the sidebar (capture-phase click, runs before React Router),
 * - the browser Back button (a duplicate history entry absorbs the first Back press).
 */
import { useEffect, useRef } from "react";

export const LEAVE_MESSAGE = "Leave without saving? Your changes will be lost.";

type LinkLike = { href: string; target?: string; download?: boolean };
type ClickLike = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };

/** True when following this link would leave the current page inside the app. */
export function isGuardedNavigation(link: LinkLike, click: ClickLike, currentHref: string): boolean {
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (link.download || (link.target && link.target !== "_self")) return false;
  let next: URL;
  let current: URL;
  try {
    current = new URL(currentHref);
    next = new URL(link.href, current);
  } catch {
    return false;
  }
  if (next.origin !== current.origin) return false;
  return next.pathname !== current.pathname || next.search !== current.search;
}

export function useUnsavedChangesGuard(active: boolean, confirmLeave: (message: string) => boolean = (m) => window.confirm(m)) {
  const confirmRef = useRef(confirmLeave);
  const backEntryPushed = useRef(false);
  useEffect(() => {
    confirmRef.current = confirmLeave;
  }, [confirmLeave]);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const guarded = isGuardedNavigation(
        { href: anchor.getAttribute("href") ?? "", target: anchor.target, download: anchor.hasAttribute("download") },
        e,
        window.location.href,
      );
      if (guarded && !confirmRef.current(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // The duplicate entry keeps the URL the same when Back is pressed, so we can ask first.
    // Pushed once per page visit; it stays in place when the form becomes clean again.
    if (!backEntryPushed.current) {
      window.history.pushState(window.history.state, "", window.location.href);
      backEntryPushed.current = true;
    }
    const onPopState = () => {
      if (confirmRef.current(LEAVE_MESSAGE)) {
        window.removeEventListener("popstate", onPopState);
        window.history.back();
      } else {
        window.history.pushState(window.history.state, "", window.location.href);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [active]);
}
