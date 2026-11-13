import { lazy, type ComponentType } from "react";

/**
 * Lazily loaded public page that can also be loaded ahead of time.
 *
 * Hydration mode (PRERENDER_HYDRATE=true, see src/lib/prerenderSnapshot.ts): the build records which
 * route ids a page rendered; the browser preloads exactly those chunks before hydrateRoot, so the page
 * renders in one pass instead of suspending while React is hydrating. Otherwise this behaves like React.lazy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

const loaders = new Map<string, () => Promise<AnyComponent>>();
const loaded = new Map<string, AnyComponent>();
const rendered = new Set<string>();

export function lazyRoute<P extends object>(id: string, load: () => Promise<ComponentType<P>>): ComponentType<P> {
  const loadAndKeep = () =>
    load().then((component) => {
      loaded.set(id, component);
      return component;
    });
  loaders.set(id, loadAndKeep);
  const Lazy = lazy(() => loadAndKeep().then((component) => ({ default: component }))) as unknown as ComponentType<P>;

  function LazyRoute(props: P) {
    rendered.add(id);
    const Component = loaded.get(id) as ComponentType<P> | undefined;
    return Component ? <Component {...props} /> : <Lazy {...props} />;
  }
  LazyRoute.displayName = `LazyRoute(${id})`;
  return LazyRoute;
}

/** Build time: forget the ids recorded for the previous page. */
export function resetRenderedRouteIds(): void {
  rendered.clear();
}

/** Build time: ids of the lazy routes the last rendered page used. */
export function renderedRouteIds(): string[] {
  return [...rendered].sort();
}

/** Browser: load these routes before hydrating. Unknown ids are ignored; failures are left to React.lazy. */
export async function preloadRoutes(ids: readonly string[]): Promise<void> {
  await Promise.all(ids.map((id) => loaders.get(id)?.().catch(() => undefined)));
}
