import type { LegalDocument } from "../types";

/** Base Data Processing Agreement (processor terms)—regional addenda extend this document. */
export const dpaGlobalDocument: LegalDocument = {
  id: "dpa-global-base",
  version: "1.0.0",
  lastUpdated: "2026-04-04",
  title: "Data Processing Agreement (Base)",
  intro:
    'This Data Processing Agreement ("DPA") forms part of the agreement between the customer entity subscribing to Prime7 ERP ("Customer", "Controller" where it determines purposes and means of personal data processing) and Prime7 ERP ("Processor"). It applies where Prime7 processes personal data on behalf of Customer in delivering the Services. If Customer is not a controller for certain data, it warrants it is authorized to enter this DPA for the relevant processing.',
  sections: [
    {
      id: "roles",
      title: "1. Roles and Scope",
      blocks: [
        {
          kind: "p",
          text: "The parties acknowledge that for the processing described herein, Customer acts as controller (or processor on behalf of its own controller, as the case may be) and Prime7 acts as processor. Annex A (below) summarizes the subject matter, nature and purpose, duration, types of personal data, and categories of data subjects. Processing outside documented instructions requires prior written agreement unless required by law (in which case Prime7 will inform Customer unless prohibited).",
        },
      ],
    },
    {
      id: "instructions",
      title: "2. Processing Instructions",
      blocks: [
        {
          kind: "p",
          text: "Prime7 will process personal data only on documented instructions from Customer, including via the Services configuration and use, unless Union or Member State law to which Prime7 is subject requires otherwise.",
        },
      ],
    },
    {
      id: "confidentiality",
      title: "3. Confidentiality and Personnel",
      blocks: [
        {
          kind: "p",
          text: "Prime7 ensures that persons authorized to process personal data are bound by confidentiality obligations or are under an appropriate statutory obligation of confidentiality.",
        },
      ],
    },
    {
      id: "security",
      title: "4. Security Measures",
      blocks: [
        {
          kind: "p",
          text: "Prime7 implements appropriate technical and organizational measures to ensure a level of security appropriate to the risk, including, as applicable: pseudonymization and encryption; ensuring ongoing confidentiality, integrity, availability, and resilience; timely restoration; and regular testing and evaluation. Customer is responsible for configuring access roles, credentials, and optional security features within the Services.",
        },
      ],
    },
    {
      id: "subprocessors",
      title: "5. Subprocessors",
      blocks: [
        {
          kind: "p",
          text: "Customer generally authorizes Prime7 to engage subprocessors subject to materially equivalent data protection obligations. Prime7 will make available a current list of subprocessors and provide notice of changes as described in the Terms or support portal. Customer may object on reasonable data protection grounds; if no resolution is reached, Customer's exclusive remedy may be termination of affected Services.",
        },
      ],
    },
    {
      id: "breach",
      title: "6. Personal Data Breach",
      blocks: [
        {
          kind: "p",
          text: "Prime7 will notify Customer without undue delay after becoming aware of a personal data breach affecting Customer's personal data and will provide information reasonably available to assist Customer in meeting its obligations. Notification is not an admission of fault.",
        },
      ],
    },
    {
      id: "assistance",
      title: "7. Data Subject Rights and Assistance",
      blocks: [
        {
          kind: "p",
          text: "Taking into account the nature of processing, Prime7 will assist Customer by appropriate technical and organizational measures, insofar as possible, for fulfillment of requests to exercise rights under applicable data protection law. Requests received directly by Prime7 will be directed to Customer unless otherwise required by law.",
        },
      ],
    },
    {
      id: "audit",
      title: "8. Audit Rights",
      blocks: [
        {
          kind: "p",
          text: "Prime7 will make available information necessary to demonstrate compliance and allow for audits, including inspections, conducted by Customer or an auditor mandated by Customer, subject to reasonable notice, confidentiality, business continuity, and security constraints. Audits may be satisfied by third-party certifications and shared audit reports where appropriate.",
        },
      ],
    },
    {
      id: "transfer-delete",
      title: "9. Return and Deletion",
      blocks: [
        {
          kind: "p",
          text: "Upon termination of Services relating to processing, Prime7 will, at Customer's choice, delete or return personal data unless storage is required by law. Deletion from live systems may be followed by removal from backups on a scheduled rotation.",
        },
      ],
    },
    {
      id: "annex-a",
      title: "Annex A — Processing Details (Summary)",
      blocks: [
        {
          kind: "ul",
          items: [
            "Subject matter: provision of the Prime7 ERP cloud platform.",
            "Duration: for the Subscription Term and as needed for transition or legal retention.",
            "Nature and purpose: hosting, storage, retrieval, authentication, support, security monitoring, backups, and optional AI inference as configured.",
            "Categories of data: identifiers, contact details, employment-related fields, business contact data, usage logs, and content Customer chooses to store.",
            "Data subjects: Customer's personnel, contractors, and business contacts reflected in Customer Data.",
          ],
        },
      ],
    },
  ],
};
