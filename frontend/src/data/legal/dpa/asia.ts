import type { LegalSectionData } from "../types";

export const dpaAsiaExtraSections: LegalSectionData[] = [
  {
    id: "asia-crossborder",
    title: "Asia-Pacific Addendum — Cross-Border Compliance",
    blocks: [
      {
        kind: "p",
        text: "This addendum addresses Customers operating or processing personal data across Asia-Pacific jurisdictions (for example Singapore PDPA, Japan APPI considerations, or other local laws). Specific requirements vary; Customer remains responsible for lawful collection, notice, consent, and localization obligations that apply to its business.",
      },
      {
        kind: "ul",
        items: [
          "Prime7 will support reasonable contractual terms for cross-border processing and subprocessors as reflected in the base DPA.",
          "Where a jurisdiction requires registration, filing, or a local representative, Customer is responsible unless separately agreed in an enterprise order form.",
          "Government access requests will be handled per applicable law and our policies, with transparency to Customer where not prohibited.",
        ],
      },
    ],
  },
];
