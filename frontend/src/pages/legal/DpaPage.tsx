import { useState } from "react";
import { DPA_META, DPA_REGION_TABS, type DpaRegionId, getDpaSectionsForRegion } from "@/data/legal/dpa";
import { formatLegalDate } from "@/data/legal/formatLegalDate";
import { LegalSection } from "@/components/legal/LegalSection";
import { LegalBlocks } from "@/components/legal/LegalBlocks";
import { LegalCrossLinks } from "@/components/legal/LegalCrossLinks";

export function DpaPage() {
  const [region, setRegion] = useState<DpaRegionId>("global");
  const sections = getDpaSectionsForRegion(region);
  const tabLabel = DPA_REGION_TABS.find((t) => t.id === region)?.label ?? region;

  return (
    <>
      <header className="mb-6 pb-6 border-b border-border print:border-gray-300 print-avoid-break">
        <h1 className="text-3xl sm:text-4xl font-bold text-text-primary">{DPA_META.title}</h1>
        <p className="text-text-muted mt-3 text-sm">
          Base version {DPA_META.version} · Last updated: {formatLegalDate(DPA_META.lastUpdated)}
        </p>
        <p className="text-text-secondary text-sm mt-3 leading-relaxed">
          Select a region to append the applicable addendum to the global base clauses. The full text shown below is
          always: <strong className="text-text-primary">base DPA + regional addendum</strong> (except &quot;Global
          (base)&quot;, which shows only the base).
        </p>
      </header>

      <div className="no-print mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Region</p>
        <div className="flex flex-wrap gap-2">
          {DPA_REGION_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setRegion(t.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                region === t.id
                  ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                  : "border-border bg-surface-subtle text-text-secondary hover:bg-surface-raised"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-text-secondary mb-8 print-only">Active region: {tabLabel}</p>

      <div className="space-y-10">
        {sections.map((section) => (
          <LegalSection key={`${region}-${section.id}`} id={section.id} title={section.title}>
            <LegalBlocks blocks={section.blocks} />
          </LegalSection>
        ))}
      </div>

      <LegalCrossLinks excludePaths={["/legal/dpa"]} />
    </>
  );
}
