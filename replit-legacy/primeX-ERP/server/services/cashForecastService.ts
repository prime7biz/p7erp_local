import { db } from '../db';
import {
  cashForecastScenarios, cashForecastLines, btbLcs, orders,
  fxReceipts, exportCases, exportCaseOrders, shipments,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function createScenario(tenantId: number, userId: number, data: {
  name: string;
  description?: string;
}) {
  const [scenario] = await db.insert(cashForecastScenarios).values({
    tenantId,
    name: data.name,
    description: data.description || null,
    createdBy: userId,
  }).returning();
  return scenario;
}

export async function getScenarios(tenantId: number) {
  return db.select().from(cashForecastScenarios)
    .where(and(eq(cashForecastScenarios.tenantId, tenantId), eq(cashForecastScenarios.isActive, true)));
}

export async function generateForecast(tenantId: number, scenarioId: number, months: number = 6) {
  const [scenario] = await db.select().from(cashForecastScenarios)
    .where(and(eq(cashForecastScenarios.id, scenarioId), eq(cashForecastScenarios.tenantId, tenantId)));
  if (!scenario) throw new Error('Scenario not found');

  const multiplier = scenario.name === 'OPTIMISTIC' ? 1.1 :
    scenario.name === 'STRESS' ? 0.8 : 1.0;

  await db.delete(cashForecastLines)
    .where(and(eq(cashForecastLines.scenarioId, scenarioId), eq(cashForecastLines.tenantId, tenantId)));

  const now = new Date();
  const lines: any[] = [];

  for (let m = 0; m < months; m++) {
    const forecastDate = new Date(now.getFullYear(), now.getMonth() + m + 1, 0);
    const dateStr = forecastDate.toISOString().split('T')[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth() + m, 1).toISOString().split('T')[0];
    const monthEnd = dateStr;

    const btbMaturities = await db.select().from(btbLcs)
      .where(and(
        eq(btbLcs.tenantId, tenantId),
        sql`${btbLcs.maturityDate} >= ${monthStart}`,
        sql`${btbLcs.maturityDate} <= ${monthEnd}`,
        sql`${btbLcs.status} NOT IN ('PAID', 'SETTLED')`,
      ));

    const btbTotal = btbMaturities.reduce((sum, b) =>
      sum + parseFloat(b.maturityAmount || b.amount || '0'), 0) * multiplier;

    if (btbTotal > 0) {
      lines.push({
        tenantId,
        scenarioId,
        forecastDate: dateStr,
        category: 'BTB_PAYMENT',
        direction: 'OUTFLOW',
        amount: btbTotal.toFixed(2),
        currency: 'USD',
        bdtAmount: (btbTotal * 120).toFixed(2),
        confidence: m < 2 ? 'HIGH' : m < 4 ? 'MEDIUM' : 'LOW',
      });
    }

    const pendingOrders = await db.select().from(orders)
      .where(and(
        eq(orders.tenantId, tenantId),
        sql`${orders.deliveryDate} >= ${monthStart}`,
        sql`${orders.deliveryDate} <= ${monthEnd}`,
        sql`${orders.orderStatus} NOT IN ('shipped', 'delivered', 'canceled')`,
      ));

    const exportReceipt = pendingOrders.reduce((sum, o) =>
      sum + (parseFloat(o.priceConfirmed || '0') * o.totalQuantity), 0) * multiplier;

    if (exportReceipt > 0) {
      lines.push({
        tenantId,
        scenarioId,
        forecastDate: dateStr,
        category: 'EXPORT_RECEIPT',
        direction: 'INFLOW',
        amount: exportReceipt.toFixed(2),
        currency: 'USD',
        bdtAmount: (exportReceipt * 120).toFixed(2),
        confidence: m < 2 ? 'HIGH' : m < 4 ? 'MEDIUM' : 'LOW',
      });
    }

    const overheadEstimate = 500000 * multiplier;
    lines.push({
      tenantId,
      scenarioId,
      forecastDate: dateStr,
      category: 'OVERHEAD',
      direction: 'OUTFLOW',
      amount: overheadEstimate.toFixed(2),
      currency: 'BDT',
      bdtAmount: overheadEstimate.toFixed(2),
      confidence: 'MEDIUM',
    });

    const payrollEstimate = 1000000 * multiplier;
    lines.push({
      tenantId,
      scenarioId,
      forecastDate: dateStr,
      category: 'PAYROLL',
      direction: 'OUTFLOW',
      amount: payrollEstimate.toFixed(2),
      currency: 'BDT',
      bdtAmount: payrollEstimate.toFixed(2),
      confidence: 'HIGH',
    });
  }

  for (const line of lines) {
    await db.insert(cashForecastLines).values(line);
  }

  return { scenarioId, linesGenerated: lines.length, months };
}

export async function getForecastLines(tenantId: number, scenarioId: number) {
  return db.select().from(cashForecastLines)
    .where(and(eq(cashForecastLines.tenantId, tenantId), eq(cashForecastLines.scenarioId, scenarioId)))
    .orderBy(cashForecastLines.forecastDate);
}

export async function getForecastSummary(tenantId: number, scenarioId: number) {
  const lines = await getForecastLines(tenantId, scenarioId);

  const byMonth: Record<string, { inflows: number; outflows: number; net: number; details: Record<string, number> }> = {};

  for (const line of lines) {
    const month = line.forecastDate ? line.forecastDate.toString().substring(0, 7) : 'unknown';
    if (!byMonth[month]) byMonth[month] = { inflows: 0, outflows: 0, net: 0, details: {} };

    const amt = parseFloat(line.bdtAmount || line.amount || '0');
    const key = `${line.category}_${line.direction}`;
    byMonth[month].details[key] = (byMonth[month].details[key] || 0) + amt;

    if (line.direction === 'INFLOW') {
      byMonth[month].inflows += amt;
    } else {
      byMonth[month].outflows += amt;
    }
    byMonth[month].net = byMonth[month].inflows - byMonth[month].outflows;
  }

  const months = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  const totalInflows = months.reduce((sum, m) => sum + m.inflows, 0);
  const totalOutflows = months.reduce((sum, m) => sum + m.outflows, 0);

  return {
    months,
    totals: {
      inflows: totalInflows,
      outflows: totalOutflows,
      net: totalInflows - totalOutflows,
    },
  };
}
