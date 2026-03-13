import type {
  QuotationManufacturingLine,
  QuotationMaterialLine,
  QuotationOtherCostLine,
} from "@/api/client";
import { resolveOtherCostAmount, toSafeNumber } from "./quotationNumeric";

export interface QuotationTotals {
  matTotal: number;
  mfgTotal: number;
  otherTotal: number;
  total: number;
}

export function calculateQuotationTotals(
  materials: QuotationMaterialLine[],
  manufacturing: QuotationManufacturingLine[],
  otherCosts: QuotationOtherCostLine[]
): QuotationTotals {
  const matTotal = materials.reduce((acc, row) => acc + toSafeNumber(row.total_amount), 0);
  const mfgTotal = manufacturing.reduce((acc, row) => acc + toSafeNumber(row.total_order_cost), 0);
  const otherTotal = otherCosts.reduce((acc, row) => acc + resolveOtherCostAmount(row), 0);
  return {
    matTotal,
    mfgTotal,
    otherTotal,
    total: matTotal + mfgTotal + otherTotal,
  };
}
