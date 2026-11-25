import { describe, expect, it } from "vitest";
import {
  CostingCalcError,
  computeQuotation,
  fmt4,
  marginForTarget,
  q4,
  safeComputeQuotation,
  type CmInput,
  type QuotationInput,
} from "./quotationCostingEngine";

/**
 * The same cases the backend calculator test uses (backend/tests/fixtures/quotation_costing_parity.json).
 * `import.meta.glob` finds nothing when the backend folder is not present (e.g. a frontend-only checkout).
 */
const fixtureFiles = import.meta.glob("../../../../../../backend/tests/fixtures/quotation_costing_parity.json", {
  eager: true,
  import: "default",
}) as Record<string, { cases: ParityCase[] }>;
const fixture = Object.values(fixtureFiles)[0];

interface ParityCase {
  name: string;
  input: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  expected: Record<string, string>;
}

function numOrNull(v: unknown): number | null {
  return v == null || v === "" ? null : Number(v);
}

function toInput(raw: ParityCase["input"]): QuotationInput {
  const comm = raw.commission ?? {};
  return {
    materials: (raw.materials ?? []).map((m: Record<string, string>) => ({
      consumptionPerDozen: Number(m.cons),
      unitPrice: Number(m.price),
      wastagePct: numOrNull(m.wastage),
      fx: m.fx ? Number(m.fx) : 1,
    })),
    manufacturing: (raw.manufacturing ?? []).map(
      (c: Record<string, string | number>): CmInput => ({
        mode: c.mode as CmInput["mode"],
        fx: c.fx ? Number(c.fx) : 1,
        smv: numOrNull(c.smv),
        efficiencyPct: numOrNull(c.eff),
        cpm: numOrNull(c.cpm),
        cpmBasis: (c.cpm_basis as CmInput["cpmBasis"]) ?? null,
        machinesRequired: Number(c.machines ?? 0),
        productionPerHour: numOrNull(c.pph),
        workingHoursPerDay: numOrNull(c.hours),
        costPerMachine: numOrNull(c.cost_machine),
        directCmBasis: (c.direct_basis as CmInput["directCmBasis"]) ?? null,
        storedCostPerDozen: numOrNull(c.direct_dozen),
        storedCmPerPiece: numOrNull(c.direct_piece),
      }),
    ),
    otherCosts: (raw.other_costs ?? []).map((o: Record<string, string>) => ({
      costType: o.type as "fixed" | "percentage",
      value: Number(o.value),
      basedOn: o.based_on ?? "subtotal",
      costBasis: (o.basis as "PER_DOZEN" | "PER_PIECE" | "PER_ORDER" | undefined) ?? null,
      fx: o.fx ? Number(o.fx) : 1,
    })),
    projectedQty: Number(raw.qty ?? 0),
    profitPct: Number(raw.profit_pct ?? 0),
    marginMethod: raw.margin_method ?? "MARKUP_ON_COST",
    commission: { mode: comm.mode, type: comm.type, value: Number(comm.value ?? 0) },
    manualPricePerPiece: raw.manual_pc ? Number(raw.manual_pc) : null,
  };
}

describe("quotation costing engine: backend parity", () => {
  it("finds the shared fixture", () => {
    // Fails loudly in the monorepo; a frontend-only checkout has no backend folder and skips this guard.
    if (fixture === undefined) return;
    expect(fixture.cases.length).toBeGreaterThanOrEqual(12);
  });

  for (const c of fixture?.cases ?? []) {
    it(`matches the backend for ${c.name}`, () => {
      const r = computeQuotation(toInput(c.input));
      expect(fmt4(r.materialPerDozen)).toBe(c.expected.material_per_dozen);
      expect(fmt4(r.manufacturingPerDozen)).toBe(c.expected.manufacturing_per_dozen);
      expect(fmt4(r.otherPerDozen)).toBe(c.expected.other_per_dozen);
      expect(fmt4(r.totalCostPerDozen)).toBe(c.expected.total_cost_per_dozen);
      expect(fmt4(r.pricePerDozen)).toBe(c.expected.price_per_dozen);
      expect(fmt4(r.pricePerPiece)).toBe(c.expected.price_per_piece);
    });
  }
});

describe("q4", () => {
  it("rounds half up and ignores float noise", () => {
    expect(q4(1.00005)).toBe(1.0001);
    expect(q4(0.1 + 0.2)).toBe(0.3);
    expect(q4(2.675)).toBe(2.675);
    expect(q4(-1.00005)).toBe(-1.0001);
  });
});

const base: QuotationInput = {
  materials: [{ consumptionPerDozen: 2.5, unitPrice: 4 }],
  manufacturing: [],
  otherCosts: [],
  projectedQty: 0,
  profitPct: 10,
};

describe("quotation costing engine: rules", () => {
  it("works with quantity 0 (everything is per dozen)", () => {
    const r = computeQuotation(base);
    expect(fmt4(r.pricePerDozen)).toBe("11.0000");
    expect(fmt4(r.pricePerPiece)).toBe("0.9167");
  });

  it("needs CPM basis for SMV mode", () => {
    const res = safeComputeQuotation({
      ...base,
      manufacturing: [{ mode: "SMV_CPM", smv: 10, cpm: 0.05 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CM_CPM_BASIS_REQUIRED");
  });

  it("rejects efficiency 0 for available-minute CPM", () => {
    expect(() =>
      computeQuotation({
        ...base,
        manufacturing: [{ mode: "SMV_CPM", smv: 10, cpm: 0.05, cpmBasis: "AVAILABLE_MIN", efficiencyPct: 0 }],
      }),
    ).toThrow(CostingCalcError);
  });

  it("never multiplies line output by machines", () => {
    const r = computeQuotation({
      ...base,
      manufacturing: [
        { mode: "LINE_OUTPUT", machinesRequired: 20, costPerMachine: 25, productionPerHour: 60, workingHoursPerDay: 8 },
      ],
    });
    // 20 x 25 = 500 per day / (60 x 8 = 480 pcs) = 1.0417 per piece
    expect(fmt4(r.manufacturing[0]!.cmPerPiece)).toBe("1.0417");
  });

  it("needs a quantity for an included fixed commission only", () => {
    const included = safeComputeQuotation({
      ...base,
      commission: { mode: "INCLUDE", type: "FIXED", value: 500 },
    });
    expect(included.ok).toBe(false);
    const excluded = safeComputeQuotation({
      ...base,
      commission: { mode: "EXCLUDE", type: "FIXED", value: 500 },
    });
    expect(excluded.ok).toBe(true);
  });

  it("manual price per piece wins", () => {
    const r = computeQuotation({ ...base, manualPricePerPiece: 1.5 });
    expect(r.priceIsManual).toBe(true);
    expect(fmt4(r.pricePerPiece)).toBe("1.5000");
    expect(fmt4(r.pricePerDozen)).toBe("18.0000");
  });

  it("rejects margin-on-FOB when margin + commission reach 99%", () => {
    const res = safeComputeQuotation({
      ...base,
      profitPct: 95,
      marginMethod: "MARGIN_ON_FOB",
      commission: { mode: "INCLUDE", type: "PERCENTAGE", value: 5 },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("MARGIN_ON_FOB_DENOMINATOR");
  });
});

describe("marginForTarget (Match Buyer Target)", () => {
  const cost = 20; // per dozen

  it("markup: target 2.2 per piece on cost 20/dozen is 32% markup", () => {
    const r = marginForTarget({ targetPerPiece: 2.2, costPerDozen: cost, marginMethod: "MARKUP_ON_COST", projectedQty: 0 });
    expect(r.marginPct).toBeCloseTo(32, 3);
    expect(r.isLoss).toBe(false);
  });

  it("FOB: margin is a share of the price", () => {
    const r = marginForTarget({ targetPerPiece: 2.5, costPerDozen: cost, marginMethod: "MARGIN_ON_FOB", projectedQty: 0 });
    expect(r.marginPct).toBeCloseTo(33.3333, 3);
  });

  it("refuses targets whose margin the server would reject", () => {
    // FOB: a target more than 100x the cost leaves a margin of 99%+ that fails the denominator rule.
    expect(() =>
      marginForTarget({ targetPerPiece: 500, costPerDozen: cost, marginMethod: "MARGIN_ON_FOB", projectedQty: 0 }),
    ).toThrow(/100 times/);
    // Markup: an included fixed commission bigger than the whole target gives a markup below -100%.
    expect(() =>
      marginForTarget({
        targetPerPiece: 0.5,
        costPerDozen: cost,
        marginMethod: "MARKUP_ON_COST",
        commission: { mode: "INCLUDE", type: "FIXED", value: 1000 },
        projectedQty: 1200,
      }),
    ).toThrow(/fixed commission/);
  });

  it("a target below cost gives a negative margin and a loss", () => {
    const r = marginForTarget({ targetPerPiece: 1.5, costPerDozen: cost, marginMethod: "MARKUP_ON_COST", projectedQty: 0 });
    expect(r.marginPct).toBeLessThan(0);
    expect(r.isLoss).toBe(true);
    expect(r.profitPerDozen).toBeCloseTo(-2, 3);
  });

  it("round trip: pricing at the found margin gives the target", () => {
    const comm = { mode: "INCLUDE", type: "PERCENTAGE", value: 5 } as const;
    for (const method of ["MARKUP_ON_COST", "MARGIN_ON_FOB"] as const) {
      const m = marginForTarget({ targetPerPiece: 2.4, costPerDozen: cost, marginMethod: method, commission: comm, projectedQty: 0 });
      const r = computeQuotation({
        materials: [{ consumptionPerDozen: 1, unitPrice: cost }],
        manufacturing: [],
        otherCosts: [],
        projectedQty: 0,
        profitPct: m.marginPct,
        marginMethod: method,
        commission: comm,
      });
      expect(r.pricePerPiece).toBeCloseTo(2.4, 3);
    }
  });

  it("round trip with an included fixed commission", () => {
    const comm = { mode: "INCLUDE", type: "FIXED", value: 600 } as const;
    for (const method of ["MARKUP_ON_COST", "MARGIN_ON_FOB"] as const) {
      const m = marginForTarget({ targetPerPiece: 2.6, costPerDozen: cost, marginMethod: method, commission: comm, projectedQty: 1200 });
      const r = computeQuotation({
        materials: [{ consumptionPerDozen: 1, unitPrice: cost }],
        manufacturing: [],
        otherCosts: [],
        projectedQty: 1200,
        profitPct: m.marginPct,
        marginMethod: method,
        commission: comm,
      });
      expect(r.pricePerPiece).toBeCloseTo(2.6, 3);
    }
  });
});
