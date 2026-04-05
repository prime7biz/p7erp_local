import type { LegalDocument } from "@/data/legal/types";
import { formatLegalDate } from "@/data/legal/formatLegalDate";
import { LegalSection } from "./LegalSection";
import { LegalBlocks } from "./LegalBlocks";

type Props = {
  doc: LegalDocument;
  /** Optional subtitle under the title (e.g. active DPA region) */
  subtitle?: string;
};

export function LegalDocumentBody({ doc, subtitle }: Props) {
  return (
    <>
      <header className="mb-8 pb-6 border-b border-border print:border-gray-300 print-avoid-break">
        <h1 className="text-3xl sm:text-4xl font-bold text-text-primary">{doc.title}</h1>
        {subtitle ? <p className="text-sm text-text-secondary mt-2">{subtitle}</p> : null}
        <p className="text-text-muted mt-3 text-sm">
          Document ID: <span className="font-mono">{doc.id}</span> · Version {doc.version} · Last updated:{" "}
          {formatLegalDate(doc.lastUpdated)}
        </p>
      </header>
      {doc.intro ? <p className="text-text-secondary leading-relaxed mb-10 print-avoid-break">{doc.intro}</p> : null}
      <div className="space-y-10">
        {doc.sections.map((section) => (
          <LegalSection key={section.id} id={section.id} title={section.title}>
            <LegalBlocks blocks={section.blocks} />
          </LegalSection>
        ))}
      </div>
    </>
  );
}
