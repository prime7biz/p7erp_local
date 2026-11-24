/**
 * Types for the read-only quotation wiring endpoints (backend `quotations/wiring_service.py`).
 * Money and quantities are decimal STRINGS. Blocks the caller may not see are omitted (see `omitted`).
 */

export interface WiringBomLine {
  item_id: number | null;
  category: string | null;
  item_code: string | null;
  description: string | null;
  uom: string | null;
  base_consumption: string | null;
  wastage_pct: string | null;
}

export interface WiringStyleBom {
  bom_id: number;
  bom_code: string | null;
  status: string | null;
  version_no: number | null;
  lines: WiringBomLine[];
}

export interface WiringSizeScale {
  id: number;
  scale_name: string | null;
  sizes: string[];
}

export interface WiringStylePlanning {
  standard_smv: string | null;
  standard_smv_source: string | null;
  standard_smv_confidence: string | null;
  route_stages: Array<{
    route_code: string | null;
    name: string | null;
    stage_kind: string | null;
    lead_time_days: number | null;
    sequence_no: number | null;
  }>;
}

export interface WiringFactoryCpm {
  value: string | null;
  source: string | null;
  period_start: string | null;
  period_end: string | null;
  reason_codes: string[];
}

export interface WiringExchangeRate {
  from_currency: string;
  to_currency: string;
  exchange_rate: string | null;
  effective_date: string;
  source: string | null;
}

export interface WiringTentativeBooking {
  id: number;
  line_id: number | null;
  status: string;
  start_date: string;
  planned_end_date: string | null;
  planned_qty: string | null;
  confidence_pct: string | null;
  expires_at: string;
}

export interface WiringItemPriceHint {
  item_id: number;
  item_code: string | null;
  name: string | null;
  uom: string | null;
  last_po: {
    po_id: number;
    po_code: string | null;
    unit_price: string | null;
    currency: string | null;
    order_date: string | null;
  } | null;
  comparable: boolean;
  comparable_reason: string | null;
  default_cost: string | null;
  avg_cost: string | null;
}

interface WiringCommon {
  style?: {
    id: number;
    style_code: string | null;
    name: string | null;
    buyer_customer_id: number | null;
    season: string | null;
    department: string | null;
    product_type: string | null;
  };
  style_bom?: WiringStyleBom;
  style_size_scales?: WiringSizeScale[];
  style_planning?: WiringStylePlanning;
  factory_cpm?: WiringFactoryCpm;
  exchange_rates?: WiringExchangeRate[];
  /** Block name -> reason (FLAG_OFF:..., NO_PERMISSION:..., UNAVAILABLE). */
  omitted: Record<string, string>;
}

export interface QuotationPrefillContext extends WiringCommon {
  currency: string | null;
  customer?: { id: number; name: string | null; preferred_currency: string | null };
}

export interface QuotationWiringContext extends WiringCommon {
  quotation: {
    id: number;
    quotation_code: string;
    version_no: number;
    status: string;
    style_id: number | null;
    customer_id: number | null;
    currency: string | null;
  };
  tentative_bookings?: WiringTentativeBooking[];
  material_price_hints?: WiringItemPriceHint[];
}

export interface QuotationItemPriceHintsResponse {
  items: WiringItemPriceHint[];
  omitted: Record<string, string>;
}
