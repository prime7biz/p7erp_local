import { Suspense, lazy, useMemo, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmbeddedPageProvider } from "@/components/app/EmbeddedPageContext";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { hubHref } from "./hubNavigation";
import { hubTabLabel, pickActiveHubTab, visibleHubTabs } from "./hubVisibility";
import type { Hub, HubAccessCheck, HubFeatureFlags, HubTab } from "./types";

const lazyTabs = new Map<string, LazyExoticComponent<ComponentType>>();

function lazyTab(hubId: string, tab: HubTab): LazyExoticComponent<ComponentType> {
  const key = `${hubId}:${tab.id}`;
  let component = lazyTabs.get(key);
  if (!component) {
    component = lazy(tab.load);
    lazyTabs.set(key, component);
  }
  return component;
}

function TabSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-1/3 animate-pulse rounded bg-surface-subtle" />
      <div className="h-32 animate-pulse rounded-xl bg-surface-subtle" />
      <div className="h-32 animate-pulse rounded-xl bg-surface-subtle" />
    </div>
  );
}

export interface ModuleHubPageProps {
  hub: Hub;
  featureFlags: HubFeatureFlags;
  canAccess?: HubAccessCheck;
  /** Small links shown in the header (quick actions). Receives the open tab id. */
  headerActions?: (activeTabId: string | undefined) => ReactNode;
  /** Shown instead of a tab when no tab is visible. Default: a short "nothing to show" note. */
  renderEmpty?: () => ReactNode;
}

/**
 * One hub: a single page header, a tab bar kept in the URL (`?tab=`) and the open tab's page.
 * Tabs are the existing pages, loaded only when opened; they hide their own title (embedded).
 */
export function ModuleHubPage(props: ModuleHubPageProps) {
  // Every hub route renders this component in the same outlet; the key gives each hub fresh state.
  return <ModuleHub key={props.hub.id} {...props} />;
}

function ModuleHub({ hub, featureFlags, canAccess, headerActions, renderEmpty }: ModuleHubPageProps) {
  const [params] = useSearchParams();
  const tabs = useMemo(() => visibleHubTabs(hub, featureFlags, canAccess), [hub, featureFlags, canAccess]);
  // An unknown, switched-off or not-permitted tab opens the first allowed tab.
  const active = pickActiveHubTab(hub, params.get("tab"), featureFlags, canAccess);
  const ActivePage = active ? lazyTab(hub.id, active) : null;
  const Icon = hub.icon;
  const actions = headerActions?.(active?.id);

  return (
    <div className={listPageRootClass}>
      <header className="rounded-xl border border-border bg-surface-raised px-4 pt-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">{hub.label}</h1>
            <p className="mt-0.5 text-sm text-text-muted">{hub.description}</p>
          </div>
          {actions ? <div className="no-print flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        </div>
        {tabs.length > 1 ? (
          <nav aria-label={`${hub.label} sections`} className="no-print -mx-4 mt-3 overflow-x-auto px-4">
            <ul className="flex min-w-max gap-1">
              {tabs.map((tab) => {
                const selected = tab.id === active?.id;
                return (
                  <li key={tab.id}>
                    <Link
                      to={hubHref(hub, tab.id)}
                      aria-current={selected ? "page" : undefined}
                      className={`inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                        selected
                          ? "border-brand-primary font-semibold text-brand-primary"
                          : "border-transparent text-text-secondary hover:border-border-strong hover:text-text-primary"
                      }`}
                    >
                      {hubTabLabel(tab, featureFlags)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : (
          <div className="h-4" />
        )}
      </header>

      <section aria-label={active ? hubTabLabel(active, featureFlags) : hub.label} className="min-w-0">
        {ActivePage ? (
          <EmbeddedPageProvider>
            <Suspense fallback={<TabSkeleton />}>
              <ActivePage key={active?.id} />
            </Suspense>
          </EmbeddedPageProvider>
        ) : renderEmpty ? (
          renderEmpty()
        ) : (
          <div className="rounded-xl border border-border bg-surface-raised p-10 text-center text-sm text-text-muted">
            Nothing to show here for your company yet.
          </div>
        )}
      </section>
    </div>
  );
}
