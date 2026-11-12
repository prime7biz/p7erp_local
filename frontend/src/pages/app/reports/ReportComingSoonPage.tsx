import { AppPageHeader } from "@/components/app/AppPageHeader";

interface ReportComingSoonPageProps {
  title: string;
  description?: string;
}

const DEFAULT_DESCRIPTION = "This report is under development.";

export function ReportComingSoonPage({ title, description }: ReportComingSoonPageProps) {
  return (
    <div className="space-y-6">
      <AppPageHeader title={title} description={description ?? DEFAULT_DESCRIPTION} />
      <div className="rounded-xl border border-border bg-surface-raised p-8 text-center">
        <p className="text-text-secondary">{description ?? DEFAULT_DESCRIPTION}</p>
        <p className="mt-2 text-sm text-text-muted">Coming soon.</p>
      </div>
    </div>
  );
}
