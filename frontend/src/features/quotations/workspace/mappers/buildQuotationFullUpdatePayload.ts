import type {
  QuotationDetailResponse,
  QuotationFullUpdate,
  QuotationManufacturingLine,
  QuotationMaterialLine,
  QuotationOtherCostLine,
  QuotationSizeRatioLine,
} from "@/api/client";
import {
  isPersistableManufacturingRow,
  isPersistableMaterialRow,
  isPersistableOtherCostRow,
  isPersistableSizeRatioRow,
} from "./quotationNumeric";

interface BuildPayloadInput {
  quotation: QuotationDetailResponse;
  materials: QuotationMaterialLine[];
  manufacturing: QuotationManufacturingLine[];
  otherCosts: QuotationOtherCostLine[];
  sizeRatios: QuotationSizeRatioLine[];
}

export function buildQuotationFullUpdatePayload({
  quotation,
  materials,
  manufacturing,
  otherCosts,
  sizeRatios,
}: BuildPayloadInput): QuotationFullUpdate {
  return {
    style_id: quotation.style_id,
    department: quotation.department,
    customer_intermediary_id: quotation.customer_intermediary_id,
    shipping_term: quotation.shipping_term,
    commission_mode: quotation.commission_mode,
    commission_type: quotation.commission_type,
    commission_value: quotation.commission_value,
    projected_quantity: quotation.projected_quantity,
    projected_delivery_date: quotation.projected_delivery_date,
    quotation_date: quotation.quotation_date,
    target_price: quotation.target_price,
    target_price_currency: quotation.target_price_currency,
    exchange_rate: quotation.exchange_rate,
    profit_percentage: quotation.profit_percentage,
    quoted_price: quotation.quoted_price,
    currency: quotation.currency,
    status: quotation.status,
    valid_until: quotation.valid_until,
    size_ratio_enabled: quotation.size_ratio_enabled,
    pack_ratio: quotation.pack_ratio,
    pcs_per_carton: quotation.pcs_per_carton,
    notes: quotation.notes,
    materials: materials.filter(isPersistableMaterialRow),
    manufacturing: manufacturing.filter(isPersistableManufacturingRow),
    other_costs: otherCosts.filter(isPersistableOtherCostRow),
    size_ratios: sizeRatios.filter(isPersistableSizeRatioRow),
  };
}
