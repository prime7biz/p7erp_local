import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FinancierConfidenceSummaryCard({ children }: { children: ReactNode }) {
  return (
    <Card className="rounded-2xl border-brand-primary/20 bg-brand-primary/5">
      <CardHeader>
        <CardTitle className="text-lg text-brand-primary">Confidence snapshot</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-text-primary">{children}</CardContent>
    </Card>
  );
}
