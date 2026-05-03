import { Link } from "react-router-dom";

export function PredictionsCrossLinks() {
  return (
    <div className="rounded-xl border border-border border-dashed bg-surface-subtle/50 p-4 text-[11px] text-text-secondary">
      <span className="font-semibold text-text-primary">More tools: </span>
      <Link className="text-brand-primary hover:underline" to="/app/ai/assistant">
        Assistant
      </Link>
      {" · "}
      <Link className="text-brand-primary hover:underline" to="/app/ai/automation">
        Automation
      </Link>
      {" · "}
      <Link className="text-brand-primary hover:underline" to="/app/ai/weekly-reports">
        Weekly reports
      </Link>
      {" · "}
      <Link className="text-brand-primary hover:underline" to="/app/finance/cash-forecast">
        Finance cash forecast
      </Link>
    </div>
  );
}
