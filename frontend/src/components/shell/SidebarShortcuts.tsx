import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { prefetchSidebarRoute } from "@/app/prefetchRoutes";
import type { NavShortcut } from "@/components/shell/navShortcuts";
import { SidebarTooltip } from "@/components/shell/SidebarTooltip";

type SidebarShortcutsProps = {
  favorites: NavShortcut[];
  isCollapsed: boolean;
};

/** Favorites — expanded list (with an empty-state hint) or collapsed icon-only strip. */
export function SidebarShortcuts({ favorites, isCollapsed }: SidebarShortcutsProps) {
  // Cap icons when collapsed so the strip stays short; storage still keeps the full list.
  const collapsedFavorites = favorites.slice(0, 4);

  if (isCollapsed) {
    if (favorites.length === 0) return null;
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
      </div>
    );
  }

  return (
    <div className="mb-2 border-b border-border/70 pb-2">
      <p className="mb-1 flex items-center gap-1 rounded-md bg-brand-primary/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-primary">
        <Star className="h-3 w-3 fill-current" /> Favorites
      </p>
      {favorites.length === 0 ? (
        <p className="px-2 py-1 text-[11px] leading-snug text-text-muted">
          Star (&#9733;) pages in Ctrl+K search to pin them here.
        </p>
      ) : (
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
      )}
    </div>
  );
}
