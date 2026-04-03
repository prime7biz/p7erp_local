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
  lineFxToQuotation,
  resolveOtherCostAmount,
  toSafeNumber,
} from "./quotationNumeric";

interface BuildPayloadInput {
  quotation: QuotationDetailResponse;
  materials: QuotationMaterialLine[];
  manufacturing: QuotationManufacturingLine[];
  otherCosts: QuotationOtherCostLine[];
  sizeRatios: QuotationSizeRatioLine[];
}

/** BDT per 1 unit of document currency × line amount in document currency → local_amount on each line. */
function enrichLinesWithLocalAmounts(
  quotation: QuotationDetailResponse,
  materials: QuotationMaterialLine[],
  manufacturing: QuotationManufacturingLine[],
  otherCosts: QuotationOtherCostLine[],
): {
  materials: QuotationMaterialLine[];
  manufacturing: QuotationManufacturingLine[];
  otherCosts: QuotationOtherCostLine[];
} {
  const q = quotation.currency ?? "USD";
  const bdtPerQuot = Math.max(0, toSafeNumber(quotation.exchange_rate ?? "1") || 1);

  const materialsOut = materials.map((row) => ({
    ...row,
    local_amount: (toSafeNumber(row.total_amount) * bdtPerQuot).toFixed(2),
  }));

  const manufacturingOut = manufacturing.map((row) => {
    const inQuot = toSafeNumber(row.total_order_cost) * lineFxToQuotation(row, q);
    return {
      ...row,
      local_amount: (inQuot * bdtPerQuot).toFixed(2),
    };
  });

  const otherCostsOut = otherCosts.map((row) => {
    const raw = resolveOtherCostAmount(row);
    const inQuot =
      row.cost_type === "percentage" ? raw : raw * lineFxToQuotation(row, q);
    return {
      ...row,
      local_amount: (inQuot * bdtPerQuot).toFixed(2),
    };
  });

  return {
    materials: materialsOut,
    manufacturing: manufacturingOut,
    otherCosts: otherCostsOut,
  };
}

export function buildQuotationFullUpdatePayload({
  quotation,
  materials,
  manufacturing,
  otherCosts,
  sizeRatios,
}: BuildPayloadInput): QuotationFullUpdate {
  const { materials: mats, manufacturing: mfg, otherCosts: oc } = enrichLinesWithLocalAmounts(
    quotation,
    materials,
    manufacturing,
    otherCosts,
  );
  return {
    style_ref: quotation.style_ref,
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
    materials: mats.filter(isPersistableMaterialRow),
    manufacturing: mfg.filter(isPersistableManufacturingRow),
    other_costs: oc.filter(isPersistableOtherCostRow),
    size_ratios: sizeRatios.filter(isPersistableSizeRatioRow),
  };
}
