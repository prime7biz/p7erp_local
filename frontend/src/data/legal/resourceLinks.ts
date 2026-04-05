/**
 * Canonical public URLs for legal and trust surfaces (footer, Trust Center, cross-links).
 */
export type LegalResourceDef = {
  to: string;
  label: string;
  description: string;
};

export const LEGAL_DOC_LINKS: LegalResourceDef[] = [
  {
    to: "/legal/privacy",
    label: "Privacy Policy",
    description: "How we collect, use, and protect data.",
  },
  {
    to: "/legal/terms",
    label: "Terms of Service",
    description: "Rules for using Prime7 ERP.",
  },
  {
    to: "/legal/dpa",
    label: "Data Processing Agreement",
    description: "Processor terms and regional addenda.",
  },
  {
    to: "/legal/ai-disclaimer",
    label: "AI Usage Disclaimer",
    description: "Advisory-only AI; no autonomous posting.",
  },
];

export const TRUST_SURFACE_LINKS: LegalResourceDef[] = [
  {
    to: "/trust-center",
    label: "Trust Center",
    description: "Security, privacy, and reliability overview.",
  },
  {
    to: "/legal/security-compliance",
    label: "Security & Compliance",
    description: "Controls, practices, and compliance positioning.",
  },
  {
    to: "/legal/sla",
    label: "Service Level Agreement",
    description: "Availability and support response targets.",
  },
];

export const ALL_TRUST_LEGAL_LINKS: LegalResourceDef[] = [...LEGAL_DOC_LINKS, ...TRUST_SURFACE_LINKS];
