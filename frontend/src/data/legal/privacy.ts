import type { LegalDocument } from "./types";

/** Enterprise privacy policy aligned with multi-tenant ERP, AI features, and global operations. */
export const privacyDocument: LegalDocument = {
  id: "privacy-policy",
  version: "2.0.0",
  lastUpdated: "2026-04-04",
  title: "Privacy Policy",
  intro:
    'Prime7 ERP ("Prime7", "we", "us", or "our") respects your privacy. This Privacy Policy describes how we collect, use, disclose, store, and protect information when you use our websites, cloud ERP platform, APIs, and related services (collectively, the "Services"). Where Customer uploads personal data about its personnel or contacts, Customer is typically the controller and we act as a processor—see our Data Processing Agreement (DPA) for those processing terms.',
  sections: [
    {
      id: "scope",
      title: "1. Scope",
      blocks: [
        {
          kind: "p",
          text: "This Policy applies to visitors to our marketing sites, trial users, paying subscribers, and Authorized Users of tenant accounts. Capitalized terms used but not defined here have the meaning given in our Terms of Service.",
        },
      ],
    },
    {
      id: "collect",
      title: "2. Information We Collect",
      blocks: [
        {
          kind: "h3",
          text: "2.1 Information you provide",
        },
        {
          kind: "ul",
          items: [
            "Account and profile: name, email, phone, job title, company name, address, company code, credentials.",
            "Billing: billing contact, payment references, tax identifiers where required (card data is handled by payment processors where applicable).",
            "Support: messages, attachments, and diagnostic information you send us.",
          ],
        },
        {
          kind: "h3",
          text: "2.2 Customer Data (business and personal)",
        },
        {
          kind: "p",
          text: "As an ERP platform, we process data Customer enters or imports: financial records, inventory, production, HR/payroll-related fields where used, customer/supplier records, documents, and communications. Such data may include personal identifiers of Customer's employees, contractors, or business contacts.",
        },
        {
          kind: "h3",
          text: "2.3 Automatically collected data",
        },
        {
          kind: "ul",
          items: [
            "Technical data: IP address, device type, browser, approximate location derived from IP, timestamps.",
            "Usage and security logs: pages viewed, actions in the app, authentication events, error and audit logs.",
            "Cookies and similar technologies as described in Section 9.",
          ],
        },
      ],
    },
    {
      id: "use",
      title: "3. How We Use Information",
      blocks: [
        {
          kind: "ul",
          items: [
            "Provide, operate, maintain, and secure the Services.",
            "Authenticate users, enforce access controls, and prevent fraud or abuse.",
            "Process subscriptions, invoices, and customer support requests.",
            "Develop and improve features, including training and evaluation of models only as described in Section 4.",
            "Meet legal, regulatory, and contractual obligations.",
            "Send service, security, and administrative messages (marketing, where permitted, may use separate consent or soft opt-in rules as applicable).",
          ],
        },
      ],
    },
    {
      id: "ai",
      title: "4. AI Processing",
      blocks: [
        {
          kind: "p",
          text: "Certain features use artificial intelligence (including third-party model providers) to generate summaries, suggestions, forecasts, document extraction assistance, or similar outputs. Depending on configuration, prompts and contextual business data may be transmitted to subprocessors for inference.",
        },
        {
          kind: "callout",
          title: "Important",
          items: [
            "AI outputs are advisory; they are not guaranteed accurate or complete.",
            "We do not use AI to autonomously post financial transactions; posting requires explicit user actions through the Service.",
            "Where required by law or contract, we will support Customer instructions regarding restricted processing—contact us for enterprise controls.",
          ],
        },
      ],
    },
    {
      id: "security",
      title: "5. Security and Encryption",
      blocks: [
        {
          kind: "p",
          text: "We implement administrative, technical, and organizational measures appropriate to the risk, including:",
        },
        {
          kind: "ul",
          items: [
            "Encryption of data in transit using TLS across customer-facing interfaces where supported.",
            "Encryption at rest for primary databases and backups according to provider capabilities and key management practices.",
            "Role-based access control, least-privilege engineering access, logging and monitoring.",
            "Vulnerability management, patching, and incident response procedures.",
          ],
        },
        {
          kind: "p",
          text: "No method of transmission or storage is completely secure; we encourage strong passwords, MFA where available, and least-privilege user roles.",
        },
      ],
    },
    {
      id: "multitenant",
      title: "6. Multi-Tenant Isolation",
      blocks: [
        {
          kind: "p",
          text: "The Services use a multi-tenant architecture. Customer Data is logically segregated by tenant identifier and protected by application and database controls so that one customer cannot access another customer's environment. Our personnel access production systems only on a need-to-know basis and under policy.",
        },
      ],
    },
    {
      id: "sharing",
      title: "7. Disclosure, Subprocessors, and No Sale of Data",
      blocks: [
        {
          kind: "p",
          text: "We do not sell personal information as traditionally understood (no sale for monetary or other valuable consideration in exchange for personal data). We do not rent your business contact lists to data brokers.",
        },
        {
          kind: "p",
          text: "We share information with:",
        },
        {
          kind: "ul",
          items: [
            "Subprocessors that assist hosting, email delivery, observability, payment processing, customer support tooling, and AI inference—subject to contractual obligations.",
            "Professional advisers where bound by confidentiality.",
            "Authorities when required by law, regulation, legal process, or to protect rights, safety, and integrity of the Services.",
            "Corporate successors in a merger, acquisition, or asset sale, with notice where required.",
          ],
        },
      ],
    },
    {
      id: "transfers",
      title: "8. Cross-Border Data Transfers",
      blocks: [
        {
          kind: "p",
          text: "We may process and store information in Bangladesh and other countries where we or our subprocessors operate. Where personal data is transferred from regions requiring safeguards (for example, the EEA, UK, or Switzerland), we implement appropriate mechanisms such as Standard Contractual Clauses and supplementary measures as described in our DPA and regional addenda.",
        },
      ],
    },
    {
      id: "cookies",
      title: "9. Cookies and Similar Technologies",
      blocks: [
        {
          kind: "p",
          text: "We use cookies and local storage for session management, preferences, analytics, and security. You can control cookies through browser settings; disabling certain cookies may limit functionality.",
        },
      ],
    },
    {
      id: "retention",
      title: "10. Retention",
      blocks: [
        {
          kind: "p",
          text: "We retain information for as long as necessary to provide the Services, comply with law, resolve disputes, and enforce agreements. Backup copies may persist for a limited period consistent with rotation schedules. After account termination, Customer Data is deleted or returned per our Terms and DPA, subject to legal holds.",
        },
      ],
    },
    {
      id: "rights",
      title: "11. Your Rights",
      blocks: [
        {
          kind: "p",
          text: "Depending on your jurisdiction, you may have rights to access, correct, delete, port, restrict, or object to certain processing, and to withdraw consent where processing is consent-based. Employees whose data appears in a Customer's tenant should typically contact their employer administrator; individuals may also contact us and we will route requests appropriately.",
        },
      ],
    },
    {
      id: "compliance",
      title: "12. Legal Bases and Compliance",
      blocks: [
        {
          kind: "p",
          text: "Where GDPR or similar laws apply, we rely on appropriate bases such as contract performance, legitimate interests (balanced against your rights), legal obligation, and consent where required. We maintain records of processing activities as required and cooperate with supervisory authorities.",
        },
        {
          kind: "p",
          text: "This Policy is not an exhaustive statement of every law in every country; Customers operating in regulated sectors remain responsible for their own compliance programs.",
        },
      ],
    },
    {
      id: "children",
      title: "13. Children",
      blocks: [
        {
          kind: "p",
          text: "The Services are not directed to children under 16. We do not knowingly collect personal information from children for consumer purposes.",
        },
      ],
    },
    {
      id: "changes",
      title: "14. Changes to This Policy",
      blocks: [
        {
          kind: "p",
          text: "We may update this Policy from time to time. We will post the revised version with an updated date and, where changes are material, provide additional notice as appropriate.",
        },
      ],
    },
    {
      id: "contact",
      title: "15. Contact",
      blocks: [
        {
          kind: "p",
          text: "Privacy inquiries and requests: privacy@prime7erp.com. Postal address: Gulshan-2, Dhaka 1212, Bangladesh. Website: https://www.prime7erp.com",
        },
      ],
    },
  ],
};
