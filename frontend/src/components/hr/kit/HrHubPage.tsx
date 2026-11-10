import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type LazyExoticComponent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import { EmbeddedPageProvider } from "@/components/app/EmbeddedPageContext";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { useAuth } from "@/context/AuthContext";
import { getHrHub, hrHubHref, visibleHrTabs, type HrHubId, type HrHubTab } from "./hrHubs";

const lazyTabs = new Map<string, LazyExoticComponent<ComponentType>>();

function lazyTab(hubId: string, tab: HrHubTab): LazyExoticComponent<ComponentType> {
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

type EssLink = "checking" | "linked" | "not_linked";

/** Self-service tabs only work when the login is linked to an employee record. */
function useEssLink(enabled: boolean): EssLink {
  const [state, setState] = useState<EssLink>(enabled ? "checking" : "linked");
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api
      .getHrEssMyProfile()
      .then(() => {
        if (!cancelled) setState("linked");
      })
      .catch((err: unknown) => {
        // Other errors (network, 500) fall through to the tabs, which show their own message.
        if (!cancelled) setState(err instanceof ApiError && err.status === 404 ? "not_linked" : "linked");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}

function EssNotLinked() {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
      <p className="text-base font-semibold text-text-primary">Your login is not linked to an employee record</p>
      <p className="mt-2">
        My HR shows your own profile, attendance, leave and payslips. Ask HR to open{" "}
        <Link to="/app/hr/employees" className="font-medium text-brand-primary hover:underline">
          HR → Employees
        </Link>
        , edit your employee record and choose your user in the <strong>User</strong> field.
      </p>
    </div>
  );
}

/**
 * One HR hub: page header, a tab bar kept in the URL (`?tab=`) and the active tab's page.
 * Tabs are the existing pages, loaded only when opened; they hide their own title (embedded).
 */
export function HrHubPage({ hubId }: { hubId: HrHubId }) {
  // Every hub route renders this component in the same outlet; the key gives each hub fresh state.
  return <HrHub key={hubId} hubId={hubId} />;
}

function HrHub({ hubId }: { hubId: HrHubId }) {
  const hub = getHrHub(hubId);
  const { me } = useAuth();
  const featureFlags = me?.feature_flags;
  const [params] = useSearchParams();
  const tabs = useMemo(() => visibleHrTabs(hub, featureFlags), [hub, featureFlags]);
  const requested = params.get("tab");
  // An unknown or switched-off tab (old link, disabled feature) opens the first allowed tab.
  const active = tabs.find((t) => t.id === requested) ?? tabs[0];
  const essLink = useEssLink(hub.audience === "self");
  const Icon = hub.icon;
  const ActivePage = active ? lazyTab(hub.id, active) : null;

  return (
    <div className={listPageRootClass}>
      <header className="rounded-xl border border-border bg-surface-raised px-4 pt-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">{hub.label}</h1>
            <p className="mt-0.5 text-sm text-text-muted">{hub.description}</p>
          </div>
        </div>
        {tabs.length > 1 && essLink !== "not_linked" ? (
          <nav aria-label={`${hub.label} sections`} className="no-print -mx-4 mt-3 overflow-x-auto px-4">
            <ul className="flex min-w-max gap-1">
              {tabs.map((tab) => {
                const selected = tab.id === active?.id;
                return (
                  <li key={tab.id}>
                    <Link
                      to={hrHubHref(hub, tab.id)}
                      aria-current={selected ? "page" : undefined}
                      className={`inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                        selected
                          ? "border-brand-primary font-semibold text-brand-primary"
                          : "border-transparent text-text-secondary hover:border-border-strong hover:text-text-primary"
                      }`}
                    >
                      {tab.label}
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

      <section aria-label={active?.label ?? hub.label} className="min-w-0">
        {essLink === "checking" ? (
          <TabSkeleton />
        ) : essLink === "not_linked" ? (
          <EssNotLinked />
        ) : ActivePage ? (
          <EmbeddedPageProvider>
            <Suspense fallback={<TabSkeleton />}>
              <ActivePage key={active?.id} />
            </Suspense>
          </EmbeddedPageProvider>
        ) : (
          <div className="rounded-xl border border-border bg-surface-raised p-10 text-center text-sm text-text-muted">
            Nothing to show here for your company yet.
          </div>
        )}
      </section>
    </div>
  );
}
