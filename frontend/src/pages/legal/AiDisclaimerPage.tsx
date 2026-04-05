import { aiDisclaimerDocument } from "@/data/legal/aiDisclaimer";
import { LegalDocumentBody } from "@/components/legal/LegalDocumentBody";
import { LegalCrossLinks } from "@/components/legal/LegalCrossLinks";

export function AiDisclaimerPage() {
  return (
    <>
      <LegalDocumentBody doc={aiDisclaimerDocument} />
      <LegalCrossLinks excludePaths={["/legal/ai-disclaimer"]} />
    </>
  );
}
