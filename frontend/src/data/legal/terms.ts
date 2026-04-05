import type { LegalDocument } from "./types";

/**
 * Enterprise SaaS Terms of Service for Prime7 ERP (multi-tenant ERP + AI).
 * Governing law default: Bangladesh. Parties may execute a separate order form with different governing law.
 * This text is a template and does not constitute legal advice; counsel should review before production use.
 */
export const termsDocument: LegalDocument = {
  id: "terms-of-service",
  version: "2.0.0",
  lastUpdated: "2026-04-04",
  title: "Terms of Service",
  intro:
    'These Terms of Service ("Terms") govern access to and use of the Prime7 ERP cloud platform and related services (collectively, the "Service") offered by Prime7 ERP ("Prime7", "we", "us", or "our"). The Service is intended for business users. By creating an account, clicking an acceptance control, or using the Service, you agree to these Terms on behalf of yourself and, if applicable, the organization you represent ("Customer"). If you do not agree, do not use the Service.',
  sections: [
    {
      id: "definitions",
      title: "1. Definitions",
      blocks: [
        {
          kind: "ul",
          items: [
            '"Affiliate" means any entity that controls, is controlled by, or is under common control with a party.',
            '"Authorized Users" means individuals Customer permits to use the Service under Customer\'s subscription.',
            '"Customer Data" means data, content, files, and materials submitted to the Service by or on behalf of Customer, including personal data contained therein.',
            '"Documentation" means our then-current technical and user documentation for the Service.',
            '"Order Form" means an ordering document, online plan selection, or statement of work referencing these Terms.',
            '"Subscription Term" means the period for which Customer has paid to access the Service.',
            '"AI Features" means machine-learning or generative capabilities made available within the Service that produce suggestions, summaries, forecasts, or similar outputs.',
          ],
        },
      ],
    },
    {
      id: "acceptance",
      title: "2. Acceptance of Terms",
      blocks: [
        {
          kind: "p",
          text: "These Terms, together with any Order Form, acceptable use requirements, and policies referenced herein, form the agreement between Customer and Prime7. If there is a conflict, the Order Form prevails only for the subject matter it expressly addresses (e.g., fees, term).",
        },
        {
          kind: "p",
          text: "If Customer is an organization, the individual accepting represents that they have authority to bind that organization. Customer must be at least 18 years old (or the age of majority in their jurisdiction) and must not be barred from using the Service under applicable law.",
        },
      ],
    },
    {
      id: "description",
      title: "3. Description of Service",
      blocks: [
        {
          kind: "p",
          text: "Prime7 ERP is a multi-tenant software-as-a-service platform for manufacturing, buying-house, accounting, inventory, production, reporting, and related business operations. The Service may include integrations, APIs, mobile or web clients, and optional AI Features. We may update the Service to improve security, performance, interoperability, or to reflect legal or regulatory requirements.",
        },
        {
          kind: "p",
          text: "Unless expressly stated in writing, descriptions on our website or in marketing materials are illustrative and do not constitute a warranty of specific results or fitness for a particular purpose.",
        },
      ],
    },
    {
      id: "accounts",
      title: "4. User Accounts and Responsibilities",
      blocks: [
        {
          kind: "p",
          text: "Customer is responsible for: (a) accuracy of registration information; (b) maintaining the confidentiality of credentials, company codes, and API keys; (c) all activity under Customer's accounts; (d) ensuring Authorized Users comply with these Terms; and (e) promptly revoking access for personnel who should no longer use the Service.",
        },
        {
          kind: "p",
          text: "Customer must notify Prime7 without undue delay of any suspected compromise of accounts or unauthorized access. Prime7 may suspend access where necessary to protect the Service or other customers, subject to Section 15.",
        },
      ],
    },
    {
      id: "multi-tenant",
      title: "5. Multi-Tenant Data Isolation",
      blocks: [
        {
          kind: "p",
          text: "The Service is architected so that each Customer's tenant is logically segregated. Prime7 implements technical and organizational measures designed to prevent one tenant from accessing another tenant's Customer Data. Customer acknowledges that shared infrastructure is used efficiently across tenants and that isolation is enforced through software controls, access policies, and database design.",
        },
        {
          kind: "p",
          text: "Customer must not attempt to circumvent isolation, probe other tenants' data, or use the Service in a manner that could impair security or availability for others.",
        },
      ],
    },
    {
      id: "billing",
      title: "6. Subscription, Billing, and Payment",
      blocks: [
        {
          kind: "p",
          text: "Fees, billing cycle, currency, taxes, and payment method are as stated in the Order Form or checkout flow. Unless otherwise agreed, fees are non-refundable except where mandatory law requires otherwise. Late payment may result in interest or suspension after notice as permitted by law.",
        },
        {
          kind: "ul",
          items: [
            "Taxes are Customer's responsibility except taxes on Prime7's net income.",
            "Upgrades may take effect immediately; downgrades typically apply at the next renewal.",
            "We may change list prices prospectively with reasonable advance notice.",
          ],
        },
      ],
    },
    {
      id: "aup",
      title: "7. Acceptable Use Policy",
      blocks: [
        {
          kind: "p",
          text: "Customer shall not, and shall not permit Authorized Users to: (a) violate applicable law; (b) infringe intellectual property or privacy rights; (c) transmit malware or conduct attacks; (d) scrape, benchmark for competitive publication, or reverse engineer the Service except where statutory rights apply; (e) send unsolicited bulk communications through the Service; (f) mine cryptocurrency; or (g) use the Service to build a competing product using our proprietary materials.",
        },
        {
          kind: "p",
          text: "We may investigate violations and cooperate with law enforcement. Repeated or serious violations may result in suspension or termination.",
        },
      ],
    },
    {
      id: "data-ownership",
      title: "8. Data Ownership",
      blocks: [
        {
          kind: "p",
          text: "As between the parties, Customer retains all right, title, and interest in and to Customer Data. Prime7 does not acquire ownership of Customer Data. Customer grants Prime7 a limited license to host, process, transmit, display, and back up Customer Data solely to provide, secure, and improve the Service and as otherwise instructed by Customer or required by law.",
        },
        {
          kind: "p",
          text: "Customer represents that it has obtained all rights and consents necessary to submit Customer Data and to permit processing in accordance with these Terms and our Privacy Policy.",
        },
      ],
    },
    {
      id: "ai",
      title: "9. AI Features",
      blocks: [
        {
          kind: "p",
          text: "AI Features are provided for informational and advisory purposes only. Outputs may be incomplete, incorrect, or unsuitable for Customer's circumstances. Customer is solely responsible for reviewing and validating AI outputs before relying on them for business, financial, tax, legal, compliance, or safety decisions.",
        },
        {
          kind: "callout",
          title: "No autonomous financial posting",
          items: [
            "AI Features do not, by themselves, create, post, or finalize accounting entries, payments, inventory movements, or other transactional records unless an Authorized User explicitly confirms such an action through the Service's normal controls.",
            "Prime7 does not provide professional advice (legal, tax, accounting, or investment).",
          ],
        },
      ],
    },
    {
      id: "ip",
      title: "10. Intellectual Property",
      blocks: [
        {
          kind: "p",
          text: "Prime7 and its licensors own the Service, software, branding, Documentation, and aggregate statistical data derived from Service usage that does not identify Customer or individuals. Except for the limited rights expressly granted, no rights are transferred.",
        },
        {
          kind: "p",
          text: "Feedback Customer provides may be used by Prime7 without obligation or compensation.",
        },
      ],
    },
    {
      id: "confidentiality",
      title: "11. Confidentiality",
      blocks: [
        {
          kind: "p",
          text: 'Each party may receive non-public information of the other ("Confidential Information"). The receiving party will use reasonable care to protect Confidential Information and use it only for the purposes of these Terms. Exclusions include information that is public, independently developed, or rightfully received from a third party without duty of restriction.',
        },
      ],
    },
    {
      id: "sla",
      title: "12. Service Availability and SLA Disclaimer",
      blocks: [
        {
          kind: "p",
          text: 'Unless a separate written SLA is signed by authorized representatives of both parties, the Service is provided on an "as available" basis. Planned maintenance, emergency maintenance, force majeure events, third-party dependencies, and Customer-side issues may affect availability. Any uptime targets stated on the website are goals, not binding commitments, absent a signed SLA.',
        },
      ],
    },
    {
      id: "liability",
      title: "13. Limitation of Liability",
      blocks: [
        {
          kind: "p",
          text: 'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW: (A) THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT; AND (B) PRIME7 WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, GOODWILL, DATA, OR BUSINESS OPPORTUNITIES, EVEN IF ADVISED OF THE POSSIBILITY.',
        },
        {
          kind: "p",
          text: "PRIME7'S AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE AMOUNTS PAID BY CUSTOMER TO PRIME7 FOR THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE FIRST EVENT GIVING RISE TO LIABILITY (OR, IF NO FEES WERE PAID, ONE HUNDRED U.S. DOLLARS (USD $100)). MULTIPLE CLAIMS DO NOT ENLARGE THIS CAP.",
        },
        {
          kind: "p",
          text: "Some jurisdictions do not allow certain limitations; in such cases, liability is limited to the fullest extent permitted by law. Nothing in these Terms limits liability for death or personal injury caused by gross negligence or willful misconduct where such limitation is prohibited.",
        },
      ],
    },
    {
      id: "indemnity",
      title: "14. Indemnification",
      blocks: [
        {
          kind: "p",
          text: "Customer will defend, indemnify, and hold harmless Prime7 and its Affiliates, officers, directors, employees, and agents from third-party claims, damages, and costs (including reasonable attorneys' fees) arising from: (a) Customer Data or Customer's use of the Service in breach of these Terms or law; (b) a dispute between Customer and its users or counterparties; or (c) Customer's combination of the Service with non-Prime7 products.",
        },
      ],
    },
    {
      id: "termination",
      title: "15. Termination and Suspension",
      blocks: [
        {
          kind: "p",
          text: "Either party may terminate for material breach that remains uncured thirty (30) days after written notice (or immediately for payment breach where permitted). Prime7 may suspend access for legal compliance, security incidents, or risk of harm to the Service or third parties.",
        },
        {
          kind: "p",
          text: "Upon expiration or termination, Customer's right to access the Service ceases. Provisions intended to survive (including confidentiality, IP, liability limits, indemnity, and governing law) survive.",
        },
      ],
    },
    {
      id: "retention",
      title: "16. Data Retention and Deletion",
      blocks: [
        {
          kind: "p",
          text: "After termination, Prime7 will delete or return Customer Data in accordance with the Documentation and applicable law, subject to backup rotation and legal retention obligations. Customer is responsible for exporting data prior to termination where export features are available.",
        },
      ],
    },
    {
      id: "governing-law",
      title: "17. Governing Law and Disputes",
      blocks: [
        {
          kind: "p",
          text: "Unless the parties agree otherwise in a signed Order Form, these Terms are governed by the laws of Bangladesh, without regard to conflict-of-law principles, and the courts of Dhaka, Bangladesh shall have exclusive jurisdiction, subject to any non-waivable rights you may have as a consumer in your home jurisdiction.",
        },
        {
          kind: "p",
          text: "Customer agrees that the United Nations Convention on Contracts for the International Sale of Goods does not apply.",
        },
      ],
    },
    {
      id: "international",
      title: "18. International Use",
      blocks: [
        {
          kind: "p",
          text: "Customer is responsible for compliance with export control, sanctions, and local laws where the Service is accessed. Customer will not use the Service in embargoed jurisdictions or by prohibited persons. Data may be processed in countries where Prime7 or its subprocessors operate, as described in our Privacy Policy and DPA.",
        },
      ],
    },
    {
      id: "force-majeure",
      title: "19. Force Majeure",
      blocks: [
        {
          kind: "p",
          text: "Neither party is liable for delay or failure to perform due to events beyond reasonable control, including natural disasters, war, terrorism, labor disputes, utility failures, or failures of the public internet or third-party cloud providers, except for payment obligations.",
        },
      ],
    },
    {
      id: "changes",
      title: "20. Changes to Terms",
      blocks: [
        {
          kind: "p",
          text: 'We may modify these Terms by posting an updated version with a revised "Last updated" date and, where material, by email or in-product notice. Continued use after the effective date constitutes acceptance. If Customer objects to material changes, Customer may terminate the subscription in accordance with the Order Form. Version history may be retained for audit purposes.',
        },
      ],
    },
  ],
};
