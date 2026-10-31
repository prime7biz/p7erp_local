import { Link } from "react-router-dom";
import { Clock3, Star } from "lucide-react";
import { prefetchSidebarRoute } from "@/app/prefetchRoutes";
import type { NavShortcut } from "@/components/shell/navShortcuts";
import { SidebarTooltip } from "@/components/shell/SidebarTooltip";

type SidebarShortcutsProps = {
  favorites: NavShortcut[];
  recents: NavShortcut[];
  isCollapsed: boolean;
};

/** Favorites + Recents — expanded list or collapsed icon-only strip. */
export function SidebarShortcuts({ favorites, recents, isCollapsed }: SidebarShortcutsProps) {
  if (favorites.length === 0 && recents.length === 0) return null;

  // Cap icons when collapsed so the strip stays short; storage still keeps full lists.
  const collapsedFavorites = favorites.slice(0, 4);
  const collapsedRecents = recents.slice(0, 3);

  if (isCollapsed) {
    return (
      <div className="mb-2 space-y-1 border-b border-border/70 pb-2">
        {collapsedFavorites.map((fav) => (
          <SidebarTooltip key={`fav-${fav.href}`} label={`Favorite: ${fav.label}`} enabled>
            <Link
              to={fav.href}
              onMouseEnter={() => prefetchSidebarRoute(fav.href)}
              aria-label={`Favorite: ${fav.label}`}
              className="flex h-8 w-full items-center justify-center rounded-md text-brand-primary hover:bg-surface-subtle"
            >
              <Star className="h-4 w-4 fill-current" />
            </Link>
          </SidebarTooltip>
        ))}
        {collapsedRecents.map((recent) => (
          <SidebarTooltip key={`recent-${recent.href}`} label={`Recent: ${recent.label}`} enabled>
            <Link
              to={recent.href}
              onMouseEnter={() => prefetchSidebarRoute(recent.href)}
              aria-label={`Recent: ${recent.label}`}
              className="flex h-8 w-full items-center justify-center rounded-md text-text-muted hover:bg-surface-subtle hover:text-text-primary"
            >
              <Clock3 className="h-4 w-4" />
            </Link>
          </SidebarTooltip>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-2 space-y-2 border-b border-border/70 pb-2">
      {favorites.length > 0 ? (
        <div>
          <p className="mb-1 flex items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            <Star className="h-3 w-3" /> Favorites
          </p>
          <div className="space-y-0.5">
            {favorites.map((fav) => (
              <Link
                key={`fav-${fav.href}`}
                to={fav.href}
                onMouseEnter={() => prefetchSidebarRoute(fav.href)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-secondary hover:bg-surface-base hover:text-text-primary"
              >
                <span className="truncate">{fav.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {recents.length > 0 ? (
        <div>
          <p className="mb-1 flex items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            <Clock3 className="h-3 w-3" /> Recents
          </p>
          <div className="space-y-0.5">
            {recents.map((recent) => (
              <Link
                key={`recent-${recent.href}`}
                to={recent.href}
                onMouseEnter={() => prefetchSidebarRoute(recent.href)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-secondary hover:bg-surface-base hover:text-text-primary"
              >
                <span className="truncate">{recent.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
