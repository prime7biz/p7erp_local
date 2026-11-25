import type {
  QuotationDetailResponse,
  QuotationFullUpdate,
  QuotationManufacturingLine,
  QuotationMaterialLine,
  QuotationOtherCostLine,
  QuotationSizeRatioLine,
} from "@/api/client";
import { stripRowKey } from "./rowKeys";
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
  /** Dozen-first only: the buyer price per piece when the user typed one (null = server calculates it). */
  manualPricePerPiece?: number | null;
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

function withSerialNos<T extends { serial_no?: number | null; _rowKey?: string }>(rows: T[]): Array<Omit<T, "_rowKey">> {
  return rows.map((row, i) => ({ ...stripRowKey(row), serial_no: i + 1 }));
}

export function buildQuotationFullUpdatePayload({
  quotation,
  materials,
  manufacturing,
  otherCosts,
  sizeRatios,
  manualPricePerPiece = null,
}: BuildPayloadInput): QuotationFullUpdate {
  const { materials: mats, manufacturing: mfg, otherCosts: oc } = enrichLinesWithLocalAmounts(
    quotation,
    materials,
    manufacturing,
    otherCosts,
  );
  const dozenFirst = quotation.costing_basis === "PER_DOZEN";
  return {
    ...(dozenFirst
      ? {
          costing_basis: "PER_DOZEN" as const,
          margin_method: quotation.margin_method ?? "MARKUP_ON_COST",
          fixed_commission_basis: "PER_ORDER" as const,
          quoted_price_per_piece: manualPricePerPiece != null ? manualPricePerPiece.toFixed(4) : null,
        }
      : {}),
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
    materials: withSerialNos(mats.filter(isPersistableMaterialRow)),
    manufacturing: withSerialNos(mfg.filter(isPersistableManufacturingRow)),
    other_costs: withSerialNos(oc.filter(isPersistableOtherCostRow)),
    size_ratios: withSerialNos(sizeRatios.filter(isPersistableSizeRatioRow)),
  };
}
