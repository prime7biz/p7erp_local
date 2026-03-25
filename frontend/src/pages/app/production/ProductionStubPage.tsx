import { useParams } from "react-router-dom";

/** Placeholder for department-specific production UIs (hourly, knitting, dyeing, etc.). */
export function ProductionStubPage({ title }: { title: string }) {
  const params = useParams();
  const extra = params.dept ? ` (${params.dept})` : "";
  return (
    <div className="mx-auto max-w-3xl space-y-2 p-4">
      <h1 className="text-xl font-semibold text-text-primary">
        {title}
        {extra}
      </h1>
      <p className="text-sm text-text-secondary">
        Connected to the unified production API. Use Production setup and Line plan board for configuration; hourly and cost
        endpoints are available under <code className="rounded bg-surface-subtle px-1">/api/v1/production</code>.
      </p>
    </div>
  );
}
