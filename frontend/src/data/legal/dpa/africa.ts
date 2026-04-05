import type { LegalSectionData } from "../types";

export const dpaAfricaExtraSections: LegalSectionData[] = [
  {
    id: "za-popia",
    title: "Africa Addendum — POPIA-Style Principles",
    blocks: [
      {
        kind: "p",
        text: "Where processing is subject to South Africa's Protection of Personal Information Act (POPIA) or similar African data protection laws, the parties agree that Prime7 processes personal information on instructions from Customer and implements reasonable technical and organizational measures appropriate to the risks.",
      },
      {
        kind: "ul",
        items: [
          "Purpose limitation and minimization: Processing is limited to providing and securing the Services unless otherwise instructed or required by law.",
          "Operator obligations: Prime7 will not engage another operator without Customer's general or specific authorization as set out in the subprocessors section.",
          "Cross-border flows: Transfers will use lawful mechanisms where required by applicable African law.",
        ],
      },
    ],
  },
];
