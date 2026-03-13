import { useParams } from "react-router-dom";
import { QuotationWorkspacePage } from "@/features/quotations/workspace/QuotationWorkspacePage";

export function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <QuotationWorkspacePage id={id} />;
}

