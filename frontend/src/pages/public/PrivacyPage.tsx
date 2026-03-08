import { Link } from "react-router-dom";

const lastUpdated = "March 8, 2026";

export function PrivacyPage() {
  return (
    <>
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-sm text-primary hover:underline mb-6 inline-block">← Back to Home</Link>
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
            <p className="text-gray-500">Last updated: {lastUpdated}</p>
          </div>

          <div className="prose prose-gray max-w-none space-y-8">
            <p className="text-gray-600 leading-relaxed">
              At P7 ERP (&quot;P7&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), we are committed to protecting the
              privacy and security of your personal and business information. This Privacy Policy
              explains how we collect, use, disclose, and safeguard your information when you use our
              cloud-based ERP platform and related services.
            </p>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Information We Collect</h2>
              <p className="text-gray-600 leading-relaxed mb-3">
                We collect information that you provide directly to us and information that is
                automatically collected when you use our platform:
              </p>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Personal Information</h3>
              <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4">
                <li>Name, email address, phone number, and job title</li>
                <li>Company name, address, and business registration details</li>
                <li>Login credentials and authentication information</li>
                <li>Payment and billing information</li>
              </ul>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Business Data</h3>
              <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4">
                <li>Financial records, accounting entries, and transaction data</li>
                <li>Inventory records, production data, and manufacturing information</li>
                <li>Customer and supplier information you enter into the system</li>
                <li>Orders, quotations, invoices, and commercial documents</li>
              </ul>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Automatically Collected Information</h3>
              <ul className="list-disc pl-6 text-gray-600 space-y-1">
                <li>IP address, browser type, device information, and operating system</li>
                <li>Usage patterns, feature interactions, and session duration</li>
                <li>Log data including access times and pages viewed</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">2. How We Use Information</h2>
              <p className="text-gray-600 leading-relaxed mb-3">
                We use the information we collect for the following purposes:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-1">
                <li>Providing, maintaining, and improving our ERP platform and services</li>
                <li>Processing transactions and managing your account</li>
                <li>Generating AI-powered insights, reports, and recommendations</li>
                <li>Sending service notifications, updates, and security alerts</li>
                <li>Providing customer support and responding to your inquiries</li>
                <li>Analyzing usage patterns to improve product features and user experience</li>
                <li>Complying with legal obligations and enforcing our terms of service</li>
                <li>Detecting, preventing, and addressing security incidents and fraud</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Data Storage</h2>
              <p className="text-gray-600 leading-relaxed">
                Your data is stored on secure, enterprise-grade cloud infrastructure. We employ
                encryption for data at rest and TLS for data in transit. Our infrastructure
                includes geographic redundancy, automated daily backups, and point-in-time recovery
                capabilities. Multi-tenant data isolation ensures that your data is completely
                separated from other organizations at the database level using row-level security
                policies.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Cookies</h2>
              <p className="text-gray-600 leading-relaxed">
                We use cookies and similar tracking technologies to maintain your session, remember
                your preferences, and analyze usage patterns. Essential cookies are required for the
                platform to function properly, including authentication tokens and session management.
                You can manage cookie preferences through your browser settings, though disabling
                essential cookies may affect platform functionality.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Third-Party Services</h2>
              <p className="text-gray-600 leading-relaxed">
                We may share information with trusted third-party service providers who assist us in
                operating our platform, processing payments, sending communications, and analyzing
                usage. These providers are contractually obligated to protect your information. We do
                not sell your personal or business data to third parties.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data Retention</h2>
              <p className="text-gray-600 leading-relaxed">
                We retain your personal information and business data for as long as your account is
                active or as needed to provide you services. Upon account termination, we will retain
                your data for a reasonable period to allow for data export, after which it will be
                securely deleted from our systems within 90 days unless longer retention is required by law.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Your Rights</h2>
              <p className="text-gray-600 leading-relaxed mb-3">
                You have the following rights regarding your personal and business data:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-1">
                <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
                <li><strong>Deletion:</strong> Request deletion of your personal data, subject to legal retention requirements</li>
                <li><strong>Export:</strong> Export all your business data in standard formats at any time</li>
                <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Contact Information</h2>
              <p className="text-gray-600 leading-relaxed">
                If you have questions about this Privacy Policy or wish to exercise your data rights,
                please contact us:
              </p>
              <div className="mt-4 bg-gray-50 rounded-lg p-6 border border-gray-200">
                <p className="text-gray-700 font-medium">P7 ERP</p>
                <p className="text-gray-600">Gulshan-2, Dhaka 1212, Bangladesh</p>
                <p className="text-gray-600">Email: <a href="mailto:privacy@p7erp.com" className="text-primary hover:underline">privacy@p7erp.com</a></p>
                <p className="text-gray-600">Or via our <Link to="/contact" className="text-primary hover:underline">Contact</Link> page.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
