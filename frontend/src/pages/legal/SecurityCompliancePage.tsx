import { securityComplianceDocument } from "@/data/legal/securityCompliance";
import { LegalDocumentBody } from "@/components/legal/LegalDocumentBody";
import { LegalCrossLinks } from "@/components/legal/LegalCrossLinks";

export function SecurityCompliancePage() {
  return (
    <>
      <LegalDocumentBody doc={securityComplianceDocument} />
      <LegalCrossLinks excludePaths={["/legal/security-compliance"]} />
    </>
  );
}
