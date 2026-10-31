import type { LucideIcon } from "lucide-react";
import type { MenuSection } from "@/app/sidebarConfig";

export type FlatNavRoute = {
  href: string;
  label: string;
  section: string;
  icon: LucideIcon;
};

/** Flatten entitled menu sections into searchable command-palette rows. */
export function flattenMenuRoutes(sections: MenuSection[]): FlatNavRoute[] {
  const rows: FlatNavRoute[] = [];
  const seen = new Set<string>();

  for (const mod of sections) {
    if (mod.directLink && !seen.has(mod.directLink)) {
      seen.add(mod.directLink);
      rows.push({
        href: mod.directLink,
        label: mod.section,
        section: mod.section,
        icon: mod.icon,
      });
    }
    if (mod.subsections?.length) {
      for (const sub of mod.subsections) {
        for (const item of sub.items) {
          if (seen.has(item.href)) continue;
          seen.add(item.href);
          rows.push({
            href: item.href,
            label: item.label,
            section: `${mod.section} · ${sub.label}`,
            icon: item.icon,
          });
        }
      }
    } else {
      for (const item of mod.items) {
        if (seen.has(item.href)) continue;
        seen.add(item.href);
        rows.push({
          href: item.href,
          label: item.label,
          section: mod.section,
          icon: item.icon,
        });
      }
    }
  }
  return rows;
}
