import { Link } from "react-router-dom";

const hrefByCode: Record<string, string> = {
  cash_flow_projection: "/app/finance/cash-forecast",
  receivable_risk_outlook: "/app/finance/cash-forecast",
  inventory_shortage_forecast: "/app/inventory/stock-summary",
  production_output_forecast: "/app/manufacturing/production-planning",
  capacity_shortfall_projection: "/app/manufacturing/production-planning",
  shipment_delay_risk_projection: "/app/commercial",
};

export function TemplateContextLink({ forecastCode }: { forecastCode: string }) {
  const href = hrefByCode[forecastCode];
  if (!href) return null;
  return (
    <Link to={href} className="text-[11px] text-brand-primary hover:underline">
      Related page
    </Link>
  );
}
