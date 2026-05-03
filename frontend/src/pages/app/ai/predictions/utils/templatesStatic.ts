export interface ForecastTemplateInfo {
  forecast_code: string;
  forecast_name: string;
  source_modules: string[];
  required_permission_keys: string[];
  example_prompt: string;
  default_horizon_days: number;
}

export const STATIC_FORECAST_TEMPLATES: ForecastTemplateInfo[] = [
  {
    forecast_code: "cash_flow_projection",
    forecast_name: "Cash Flow Projection",
    source_modules: ["finance"],
    required_permission_keys: ["ai.tools.finance.read"],
    example_prompt: "Generate cash flow projection",
    default_horizon_days: 90,
  },
  {
    forecast_code: "inventory_shortage_forecast",
    forecast_name: "Inventory Shortage Forecast",
    source_modules: ["inventory"],
    required_permission_keys: ["ai.tools.inventory.read"],
    example_prompt: "Generate inventory shortage forecast",
    default_horizon_days: 30,
  },
  {
    forecast_code: "production_output_forecast",
    forecast_name: "Production Output Forecast",
    source_modules: ["manufacturing"],
    required_permission_keys: ["ai.tools.production.read"],
    example_prompt: "Generate production output forecast",
    default_horizon_days: 90,
  },
  {
    forecast_code: "shipment_delay_risk_projection",
    forecast_name: "Shipment Delay Risk Projection",
    source_modules: ["orders"],
    required_permission_keys: ["ai.tools.orders.read"],
    example_prompt: "Generate shipment delay risk projection",
    default_horizon_days: 30,
  },
  {
    forecast_code: "receivable_risk_outlook",
    forecast_name: "Receivable Risk Outlook",
    source_modules: ["finance"],
    required_permission_keys: ["ai.tools.finance.read"],
    example_prompt: "Generate receivable risk outlook",
    default_horizon_days: 30,
  },
  {
    forecast_code: "capacity_shortfall_projection",
    forecast_name: "Capacity Shortfall Projection",
    source_modules: ["manufacturing"],
    required_permission_keys: ["ai.tools.production.read"],
    example_prompt: "Generate capacity shortfall projection",
    default_horizon_days: 30,
  },
];
