interface ReportComingSoonPageProps {
  title: string;
  description?: string;
}

const DEFAULT_DESCRIPTION = "This report is under development.";

export function ReportComingSoonPage({ title, description }: ReportComingSoonPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">
          {description ?? DEFAULT_DESCRIPTION}
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-slate-600">{description ?? DEFAULT_DESCRIPTION}</p>
        <p className="mt-2 text-sm text-slate-500">Coming soon.</p>
      </div>
    </div>
  );
}
