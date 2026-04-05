import type { LegalSectionData } from "../types";

export const dpaUsaExtraSections: LegalSectionData[] = [
  {
    id: "usa-ccpa",
    title: "United States Addendum — Consumer Privacy Style Rights",
    blocks: [
      {
        kind: "p",
        text: "Where U.S. state privacy laws apply to personal information processed as part of the Services, the parties agree that Prime7 processes such information as a service provider / processor on behalf of Customer and not for sale. Prime7 will not sell or share personal information (as those terms are defined under applicable state law) and will not retain, use, or disclose personal information outside the business purpose of providing the Services except as permitted by law.",
      },
      {
        kind: "ul",
        items: [
          "No sale of personal information: Prime7 does not sell Customer personal information received in its capacity as service provider.",
          "Assistance: Prime7 will assist Customer with verifiable consumer requests where contractually and technically reasonable.",
          "Subprocessors: Customer authorizes use of subprocessors consistent with the base DPA, with equivalent restrictions where required.",
        ],
      },
    ],
  },
];
