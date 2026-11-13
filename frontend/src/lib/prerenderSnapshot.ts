/**
 * Public marketing pages ship with their HTML already inside #root (written at build time by
 * scripts/inject-static-route-html.ts, wrapped in <div data-prerendered>). Visitors and crawlers see
 * that page at once. React does not hydrate it: the app renders into a hidden container next to it,
 * and when the routed page has rendered, the pre-rendered copy is removed and the app is shown
 * (one swap, no "Loading…" flash, no second parse of the page HTML).
 *
 * App, portal and auth pages have an empty #root, so React renders into #root exactly as before.
 */
export const PRERENDERED_ATTRIBUTE = "data-prerendered";
/**
 * Optional mode (build with PRERENDER_HYDRATE=true): the HTML inside #root is the full app tree and
 * React hydrates it in place (hydrateRoot) instead of swapping it, so the hero is never re-painted.
 */
export const HYDRATE_ATTRIBUTE = "data-hydrate";

let pendingSnapshot: Element | null = null;
let hiddenAppContainer: HTMLElement | null = null;
let startedFromHtml = false;

/** True when #root holds a full pre-rendered app tree that React should hydrate. */
export function shouldHydrate(root: HTMLElement): boolean {
  const yes = root.hasAttribute(HYDRATE_ATTRIBUTE) && root.firstElementChild !== null;
  if (yes) startedFromHtml = true;
  return yes;
}

/** Route chunk ids the build wrote for hydration (<script type="application/json" id="p7-route-chunks">). */
export function readRouteChunkIds(doc: Document = document): string[] {
  try {
    const ids: unknown = JSON.parse(doc.getElementById("p7-route-chunks")?.textContent || "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** True when this page load began from pre-rendered HTML (either mode); read once on first render. */
export function startedFromPrerenderedHtml(): boolean {
  return startedFromHtml || pendingSnapshot !== null;
}

function findSnapshot(root: HTMLElement | null): Element | null {
  const wrapper = root?.firstElementChild;
  if (!wrapper || !wrapper.hasAttribute(PRERENDERED_ATTRIBUTE) || !wrapper.innerHTML.trim()) return null;
  return wrapper;
}

/** Returns the element React should render into: #root itself, or a hidden container when the page was pre-rendered. */
export function prepareAppContainer(root: HTMLElement): HTMLElement {
  const snapshot = findSnapshot(root);
  if (!snapshot) return root;
  const container = document.createElement("div");
  container.style.display = "none";
  root.appendChild(container);
  pendingSnapshot = snapshot;
  hiddenAppContainer = container;
  return container;
}

/** True until the app has replaced the pre-rendered page. */
export function isPrerenderedPagePending(): boolean {
  return pendingSnapshot !== null;
}

/** Shows the app and removes the pre-rendered copy (call before the browser paints the new page). */
export function revealApp(): void {
  if (hiddenAppContainer) hiddenAppContainer.style.display = "contents";
  pendingSnapshot?.remove();
  pendingSnapshot = null;
  hiddenAppContainer = null;
}
