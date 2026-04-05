import { slaDocument } from "@/data/legal/sla";
import { LegalDocumentBody } from "@/components/legal/LegalDocumentBody";
import { LegalCrossLinks } from "@/components/legal/LegalCrossLinks";

export function SlaPage() {
  return (
    <>
      <LegalDocumentBody doc={slaDocument} />
      <LegalCrossLinks excludePaths={["/legal/sla"]} />
    </>
  );
}
