import { Link } from "react-router-dom";
import { privacyDocument } from "@/data/legal/privacy";
import { LegalDocumentBody } from "@/components/legal/LegalDocumentBody";
import { LegalCrossLinks } from "@/components/legal/LegalCrossLinks";

export function PrivacyPage() {
  return (
    <>
      <LegalDocumentBody doc={privacyDocument} />
      <div className="mt-10 pt-6 border-t border-border text-sm text-text-secondary no-print">
        <p>
          Questions? Contact us at{" "}
          <a href="mailto:privacy@prime7erp.com" className="text-brand-primary hover:underline">
            privacy@prime7erp.com
          </a>{" "}
          or visit our{" "}
          <Link to="/contact" className="text-brand-primary hover:underline">
            Contact
          </Link>{" "}
          page.
        </p>
      </div>
      <LegalCrossLinks excludePaths={["/legal/privacy"]} />
    </>
  );
}
