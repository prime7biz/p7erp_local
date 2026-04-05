import type { LegalSectionData } from "../types";

export const dpaEuExtraSections: LegalSectionData[] = [
  {
    id: "eu-gdpr",
    title: "EU Addendum — GDPR",
    blocks: [
      {
        kind: "p",
        text: "This addendum supplements the DPA for processing of personal data subject to Regulation (EU) 2016/679 (GDPR) and, where applicable, the UK GDPR and Swiss FADP as implemented.",
      },
      {
        kind: "ul",
        items: [
          "Lawful transfers: Where personal data is transferred to countries not recognized as adequate, Prime7 will implement Standard Contractual Clauses (SCCs) approved by the European Commission (module two: controller to processor, or module three as applicable) together with supplementary measures where required by case law or regulatory guidance.",
          "Data subject rights: Customer remains responsible for responding to requests; Prime7 will assist as set out in Section 7 of the base DPA.",
          "Records: Prime7 maintains records of processing activities as required under GDPR Article 30(2) for its role as processor.",
          "DPIA support: Upon request, Prime7 will provide information reasonably necessary to support Customer data protection impact assessments and prior consultations with supervisory authorities, where applicable.",
        ],
      },
    ],
  },
  {
    id: "eu-scc",
    title: "Standard Contractual Clauses",
    blocks: [
      {
        kind: "p",
        text: "The SCCs are incorporated by reference and completed as follows: (a) the modules selected match the actual roles; (b) the optional docking clause may be used for additional parties; (c) governing law for the clauses is that specified in the SCCs; (d) the competent supervisory authority follows from the SCCs; (e) technical and organizational measures are as described in the Security section and documentation.",
      },
    ],
  },
];
