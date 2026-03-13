interface AppComingSoonPageProps {
  title: string;
  description?: string;
}

const DEFAULT_DESCRIPTION = "This feature is under development.";

export function AppComingSoonPage({ title, description }: AppComingSoonPageProps) {
  const text = description ?? DEFAULT_DESCRIPTION;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{text}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-slate-600">{text}</p>
        <p className="mt-2 text-sm text-slate-500">Coming soon.</p>
      </div>
    </div>
  );
}
