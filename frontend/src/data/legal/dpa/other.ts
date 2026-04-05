import type { LegalSectionData } from "../types";

export const dpaOtherExtraSections: LegalSectionData[] = [
  {
    id: "other-fallback",
    title: "Other Regions — General Fallback",
    blocks: [
      {
        kind: "p",
        text: "If Customer's primary operations are not covered by a specific regional addendum above, the base DPA applies together with this general clause. Customer is responsible for identifying and complying with all local data protection, sectoral, employment, and export control laws applicable to its use of the Services.",
      },
      {
        kind: "ul",
        items: [
          "Prime7 will implement security and subprocessors practices described in our documentation and base DPA.",
          "Upon request, the parties may execute a supplemental schedule addressing a particular country's requirements.",
        ],
      },
    ],
  },
];
