import type { LegalSectionData } from "../types";

export const dpaBangladeshExtraSections: LegalSectionData[] = [
  {
    id: "bd-addendum",
    title: "Bangladesh Addendum",
    blocks: [
      {
        kind: "p",
        text: "This addendum addresses processing connected to Bangladesh operations. Customer acknowledges that ERP data may include commercially sensitive and, where applicable, regulated banking or financial information. Customer remains solely responsible for compliance with Bangladesh Bank circulars, NBR requirements, labor law record-keeping, and sector-specific obligations applicable to its business.",
      },
      {
        kind: "ul",
        items: [
          "Prime7 implements security measures designed to protect confidentiality and integrity of Customer Data, including tenant isolation as described in our Privacy Policy.",
          "Cross-border transfers may occur where subprocessors or disaster recovery sites are located outside Bangladesh; Customer should assess whether internal approvals or filings are required for its sector.",
          "Law enforcement requests will be handled in accordance with applicable law and, where permitted, Customer will be notified.",
        ],
      },
    ],
  },
];
