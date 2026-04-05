import { termsDocument } from "@/data/legal/terms";
import { LegalDocumentBody } from "@/components/legal/LegalDocumentBody";
import { LegalCrossLinks } from "@/components/legal/LegalCrossLinks";

export function TermsPage() {
  return (
    <>
      <LegalDocumentBody doc={termsDocument} />
      <LegalCrossLinks excludePaths={["/legal/terms"]} />
    </>
  );
}
