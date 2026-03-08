import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";

const lastUpdated = "February 1, 2026";

export default function TermsPage() {
  return (
    <PublicLayout>
      <SEOHead
        title="Terms of Service - Prime7 ERP"
        description="Prime7 ERP terms of service. Read our terms governing the use of the Prime7 cloud ERP platform for garment manufacturers."
        canonical="https://prime7erp.com/terms"
        keywords="Prime7 ERP terms of service, ERP agreement, SaaS terms"
        breadcrumbs={[{name: "Home", url: "https://prime7erp.com/"}, {name: "Terms of Service", url: "https://prime7erp.com/terms"}]}
      />

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Terms of Service</h1>
            <p className="text-gray-500">Last updated: {lastUpdated}</p>
          </div>

          <div className="prose prose-gray max-w-none space-y-8">
            <p className="text-gray-600 leading-relaxed">
              These Terms of Service ("Terms") govern your access to and use of the Prime7 ERP cloud
              platform and related services ("Service") provided by Prime7 Business Solutions
              ("Prime7", "we", "our", or "us"). By creating an account or using the Service, you
              agree to be bound by these Terms.
            </p>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-600 leading-relaxed">
                By accessing or using Prime7 ERP, you acknowledge that you have read, understood, and
                agree to be bound by these Terms. If you are using the Service on behalf of an
                organization, you represent and warrant that you have the authority to bind that
                organization to these Terms. If you do not agree with any part of these Terms, you
                must not use the Service.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Account Terms</h2>
              <p className="text-gray-600 leading-relaxed mb-3">
                To use Prime7 ERP, you must create an account and provide accurate, complete
                information. You are responsible for:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-1">
                <li>Maintaining the confidentiality of your login credentials</li>
                <li>All activities that occur under your account</li>
                <li>Ensuring that all users within your organization comply with these Terms</li>
                <li>Promptly notifying us of any unauthorized access to your account</li>
                <li>Providing accurate company information for multi-tenant setup</li>
              </ul>
              <p className="text-gray-600 leading-relaxed mt-3">
                You must be at least 18 years old to create an account. Each organization must
                designate at least one account administrator who will be the primary point of contact.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Service Description</h2>
              <p className="text-gray-600 leading-relaxed">
                Prime7 ERP is a cloud-based enterprise resource planning platform designed for garment
                manufacturers and buying houses. The Service includes modules for accounting,
                inventory management, production tracking, merchandising, order management, quality
                control, and AI-powered analytics. We reserve the right to modify, enhance, or
                discontinue features of the Service with reasonable notice. Core functionality and
                data access will be maintained throughout your subscription period.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Fees & Payment</h2>
              <p className="text-gray-600 leading-relaxed mb-3">
                Subscription fees are based on the plan you select and are billed in Bangladeshi Taka
                (BDT) unless otherwise agreed. Payment terms include:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-1">
                <li>Fees are billed monthly or annually in advance, depending on your selected plan</li>
                <li>All fees are exclusive of applicable taxes, which will be added to your invoice</li>
                <li>Late payments may result in service suspension after a 15-day grace period</li>
                <li>Upgrades take effect immediately; downgrades take effect at the next billing cycle</li>
                <li>Refunds are available within the first 30 days for annual plans if you are not satisfied</li>
                <li>We reserve the right to adjust pricing with 60 days advance notice</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Ownership</h2>
              <p className="text-gray-600 leading-relaxed">
                You retain full ownership of all data you enter into Prime7 ERP, including but not
                limited to financial records, inventory data, production information, customer details,
                and business documents. We do not claim any ownership rights over your data. You may
                export your data at any time in standard formats (CSV, JSON, PDF). Upon termination of
                your subscription, your data will be available for export for a period of 90 days,
                after which it will be securely deleted.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Intellectual Property</h2>
              <p className="text-gray-600 leading-relaxed">
                The Prime7 ERP platform, including its software, design, branding, documentation, and
                all associated intellectual property, is and remains the exclusive property of Prime7
                Business Solutions. Your subscription grants you a limited, non-exclusive,
                non-transferable license to use the Service during the subscription period. You may not
                reverse engineer, decompile, disassemble, or otherwise attempt to derive the source
                code of the Service. Any feedback, suggestions, or improvements you provide may be
                incorporated into the Service without obligation.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Termination</h2>
              <p className="text-gray-600 leading-relaxed mb-3">
                Either party may terminate the subscription:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-1">
                <li>You may cancel your subscription at any time through your account settings</li>
                <li>Monthly subscriptions terminate at the end of the current billing period</li>
                <li>We may suspend or terminate your account for violation of these Terms</li>
                <li>We may terminate for non-payment after the 15-day grace period</li>
                <li>Upon termination, you will have 90 days to export your data</li>
              </ul>
              <p className="text-gray-600 leading-relaxed mt-3">
                Termination does not relieve you of any obligation to pay fees incurred prior to
                termination.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Limitation of Liability</h2>
              <p className="text-gray-600 leading-relaxed">
                To the maximum extent permitted by applicable law, Prime7 Business Solutions shall not
                be liable for any indirect, incidental, special, consequential, or punitive damages,
                including but not limited to loss of profits, data, business opportunities, or
                goodwill, arising out of or related to your use of the Service. Our total aggregate
                liability for any claims arising from your use of the Service shall not exceed the
                total fees paid by you during the twelve (12) months immediately preceding the event
                giving rise to the claim. This limitation applies regardless of the legal theory upon
                which the claim is based.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Governing Law</h2>
              <p className="text-gray-600 leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the
                People's Republic of Bangladesh, without regard to its conflict of law provisions. Any
                disputes arising out of or in connection with these Terms shall be subject to the
                exclusive jurisdiction of the courts located in Dhaka, Bangladesh. Both parties agree
                to attempt to resolve any disputes through good-faith negotiation before pursuing
                formal legal proceedings.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Changes to Terms</h2>
              <p className="text-gray-600 leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify you of material
                changes by email or through a prominent notice on the platform at least 30 days before
                the changes take effect. Your continued use of the Service after the effective date of
                the revised Terms constitutes your acceptance of the changes. If you do not agree with
                the revised Terms, you must stop using the Service and cancel your subscription.
              </p>
            </div>

            <div className="mt-8 bg-gray-50 rounded-lg p-6 border border-gray-200">
              <p className="text-gray-700 font-medium">Questions about these Terms?</p>
              <p className="text-gray-600 mt-1">Contact us at legal@prime7erp.com or write to:</p>
              <p className="text-gray-600 mt-2">
                Prime7 Business Solutions<br />
                Gulshan-2, Dhaka 1212, Bangladesh<br />
                Phone: +880 1892-787220
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
