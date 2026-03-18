interface ReportComingSoonPageProps {
  title: string;
  description?: string;
}

const DEFAULT_DESCRIPTION = "This report is under development.";

export function ReportComingSoonPage({ title, description }: ReportComingSoonPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="text-sm text-text-muted">
          {description ?? DEFAULT_DESCRIPTION}
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface-raised p-8 text-center">
        <p className="text-text-secondary">{description ?? DEFAULT_DESCRIPTION}</p>
        <p className="mt-2 text-sm text-text-muted">Coming soon.</p>
      </div>
    </div>
  );
}
