/**
 * Structured legal document content for Terms, Privacy, DPA, and AI disclaimers.
 * Version and lastUpdated support future change logs and audit trails.
 */

export type LegalContentBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "h3"; text: string }
  | { kind: "callout"; title?: string; items: string[] };

export type LegalSectionData = {
  id: string;
  title: string;
  blocks: LegalContentBlock[];
};

export type LegalDocument = {
  /** Stable identifier for analytics / future PDF export */
  id: string;
  version: string;
  /** ISO 8601 date (YYYY-MM-DD) */
  lastUpdated: string;
  title: string;
  intro?: string;
  sections: LegalSectionData[];
};

/** Trust Center hub content */
export type TrustPillar = {
  id: string;
  title: string;
  description: string;
};

export type TrustFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type TrustCenterContent = {
  id: string;
  version: string;
  lastUpdated: string;
  heroTitle: string;
  heroSubtitle: string;
  pillars: TrustPillar[];
  quickFacts: string[];
  operationalBullets: string[];
  faqs: TrustFaqItem[];
};
