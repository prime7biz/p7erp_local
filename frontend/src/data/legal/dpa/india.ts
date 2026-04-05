import type { LegalSectionData } from "../types";

export const dpaIndiaExtraSections: LegalSectionData[] = [
  {
    id: "in-dpdp",
    title: "India Addendum — Digital Personal Data Protection Alignment",
    blocks: [
      {
        kind: "p",
        text: "This addendum reflects commonly expected obligations under India's Digital Personal Data Protection Act, 2023 and rules thereunder, as updated from time to time. It is a high-level alignment and does not replace legal advice for Customer's specific sector.",
      },
      {
        kind: "ul",
        items: [
          "Processing: Prime7 processes personal data on behalf of Customer for the purpose of providing the Services, consistent with Customer's lawful basis and notices to data principals.",
          "Security safeguards: Prime7 implements reasonable security safeguards as described in the base DPA and documentation.",
          "Cross-border transfers: Where applicable law permits transfer mechanisms, Prime7 will rely on permitted routes and contractual terms; Customer is responsible for lawful cross-border transfers it initiates outside the Service configuration.",
          "Breach notification: Prime7 will notify Customer in line with the base DPA; Customer remains responsible for regulatory reporting to the Data Protection Board or other authorities as required.",
        ],
      },
    ],
  },
];
