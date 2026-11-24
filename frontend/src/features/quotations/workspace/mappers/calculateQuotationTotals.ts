import type {
  QuotationManufacturingLine,
  QuotationMaterialLine,
  QuotationOtherCostLine,
} from "@/api/client";
import {
  isPersistableManufacturingRow,
  isPersistableMaterialRow,
  isPersistableOtherCostRow,
  lineFxToQuotation,
  resolveOtherCostAmount,
  toSafeNumber,
} from "./quotationNumeric";

export interface QuotationTotals {
  matTotal: number;
  mfgTotal: number;
  otherTotal: number;
  total: number;
}

export function calculateQuotationTotals(
  materials: QuotationMaterialLine[],
  manufacturing: QuotationManufacturingLine[],
  otherCosts: QuotationOtherCostLine[],
  quotationCurrency = "USD",
): QuotationTotals {
  const q = (quotationCurrency || "USD").trim().toUpperCase();
  const matTotal = materials
    .filter(isPersistableMaterialRow)
    .reduce((acc, row) => acc + toSafeNumber(row.total_amount), 0);
  const mfgTotal = manufacturing
    .filter(isPersistableManufacturingRow)
    .reduce((acc, row) => acc + toSafeNumber(row.total_order_cost) * lineFxToQuotation(row, q), 0);
  const otherTotal = otherCosts
    .filter(isPersistableOtherCostRow)
    .reduce((acc, row) => {
      const raw = resolveOtherCostAmount(row);
      if (row.cost_type === "percentage") {
        return acc + raw;
      }
      return acc + raw * lineFxToQuotation(row, q);
    }, 0);
  return {
    matTotal,
    mfgTotal,
    otherTotal,
    total: matTotal + mfgTotal + otherTotal,
  };
}
