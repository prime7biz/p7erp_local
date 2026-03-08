import { db } from '../db';
import { orders, btbLcs, fxReceipts, exportCases, styles, customers } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

async function getAIClient() {
  try {
    const { default: OpenAI } = await import('openai');
    return new OpenAI();
  } catch {
    return null;
  }
}

async function callAI(prompt: string): Promise<string> {
  const client = await getAIClient();
  if (!client) return 'AI service not available. Please check your OpenAI configuration.';
  
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a financial analyst for a garment manufacturing ERP system. Provide concise, actionable insights based on the data provided. Format your response with clear sections and bullet points.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });
    return response.choices[0]?.message?.content || 'No analysis available.';
  } catch (error: any) {
    return `AI analysis error: ${error.message}`;
  }
}

export async function predictCashFlow(tenantId: number) {
  const recentFx = await db.select().from(fxReceipts)
    .where(eq(fxReceipts.tenantId, tenantId))
    .orderBy(desc(fxReceipts.receiptDate))
    .limit(20);

  const pendingBtb = await db.select().from(btbLcs)
    .where(and(eq(btbLcs.tenantId, tenantId), sql`${btbLcs.status} NOT IN ('PAID', 'SETTLED')`));

  const activeOrders = await db.select().from(orders)
    .where(and(eq(orders.tenantId, tenantId), sql`${orders.orderStatus} NOT IN ('delivered', 'canceled')`));

  const prompt = `Analyze cash flow for a garment manufacturer:

Recent FX Receipts (last 20):
${recentFx.map(r => `- ${r.receiptDate}: ${r.currency} ${r.amount} (Rate: ${r.exchangeRate})`).join('\n') || 'No recent receipts'}

Pending BTB LC Payments:
${pendingBtb.map(b => `- ${b.btbLcNumber}: ${b.currency} ${b.amount}, Maturity: ${b.maturityDate || 'TBD'}`).join('\n') || 'None pending'}

Active Orders: ${activeOrders.length} orders worth ${activeOrders.reduce((s, o) => s + parseFloat(o.priceConfirmed || '0') * o.totalQuantity, 0).toFixed(2)}

Predict: 1) Next 3 months cash position 2) Key risks 3) Recommended actions`;

  const analysis = await callAI(prompt);
  return { type: 'CASH_FLOW', analysis, generatedAt: new Date().toISOString(), dataPoints: { fxReceipts: recentFx.length, pendingBtb: pendingBtb.length, activeOrders: activeOrders.length } };
}

export async function predictDemand(tenantId: number, styleId?: number) {
  const orderHistory = await db.select().from(orders)
    .where(eq(orders.tenantId, tenantId))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  const prompt = `Analyze demand patterns for a garment manufacturer:

Recent Orders (last 50):
${orderHistory.map(o => `- ${o.orderId}: ${o.styleName}, Qty: ${o.totalQuantity}, Price: ${o.currency} ${o.priceConfirmed}, Date: ${o.createdAt?.toISOString?.() || 'N/A'}`).join('\n')}

${styleId ? `Focus on style ID: ${styleId}` : 'Analyze overall demand trends'}

Predict: 1) Demand trends 2) Peak seasons 3) Style categories growing/declining 4) Recommended production planning`;

  const analysis = await callAI(prompt);
  return { type: 'DEMAND', styleId, analysis, generatedAt: new Date().toISOString() };
}

export async function suggestCostOptimization(tenantId: number, exportCaseId?: number) {
  const recentOrders = await db.select().from(orders)
    .where(eq(orders.tenantId, tenantId))
    .orderBy(desc(orders.createdAt))
    .limit(20);

  const btbs = await db.select().from(btbLcs)
    .where(eq(btbLcs.tenantId, tenantId))
    .limit(20);

  const prompt = `Analyze cost structure for a garment manufacturer:

Recent Orders:
${recentOrders.map(o => `- ${o.styleName}: Qty ${o.totalQuantity}, Unit Price ${o.currency} ${o.priceConfirmed}`).join('\n')}

BTB LCs (material procurement):
${btbs.map(b => `- ${b.btbLcNumber}: ${b.currency} ${b.amount}`).join('\n') || 'None'}

Suggest: 1) Cost optimization opportunities 2) Supplier consolidation potential 3) Material waste reduction 4) Production efficiency improvements`;

  const analysis = await callAI(prompt);
  return { type: 'COST_OPTIMIZATION', exportCaseId, analysis, generatedAt: new Date().toISOString() };
}

export async function analyzeProfitabilityTrend(tenantId: number) {
  const allOrders = await db.select().from(orders)
    .where(eq(orders.tenantId, tenantId))
    .orderBy(desc(orders.createdAt))
    .limit(100);

  const prompt = `Analyze profitability trends for a garment manufacturer:

Order History (recent 100):
${allOrders.slice(0, 30).map(o => `- ${o.orderId}: ${o.styleName}, Qty ${o.totalQuantity}, Price ${o.currency} ${o.priceConfirmed}, Status: ${o.orderStatus}`).join('\n')}

Total orders: ${allOrders.length}

Analyze: 1) Margin trends over time 2) Most/least profitable style categories 3) Buyer profitability comparison 4) Pricing recommendations`;

  const analysis = await callAI(prompt);
  return { type: 'PROFITABILITY_TREND', analysis, generatedAt: new Date().toISOString() };
}

export async function predictBtbMaturityRisk(tenantId: number) {
  const pendingBtb = await db.select().from(btbLcs)
    .where(and(eq(btbLcs.tenantId, tenantId), sql`${btbLcs.status} NOT IN ('PAID', 'SETTLED')`));

  const recentFx = await db.select().from(fxReceipts)
    .where(eq(fxReceipts.tenantId, tenantId))
    .orderBy(desc(fxReceipts.receiptDate))
    .limit(10);

  const prompt = `Assess BTB LC maturity risk for a garment manufacturer:

Pending BTB LCs:
${pendingBtb.map(b => `- ${b.btbLcNumber}: ${b.currency} ${b.amount}, Maturity: ${b.maturityDate || 'TBD'}, Status: ${b.status}`).join('\n') || 'None'}

Recent FX Receipts:
${recentFx.map(r => `- ${r.receiptDate}: ${r.currency} ${r.amount}`).join('\n') || 'None'}

Assess: 1) BTB LCs at risk of default 2) FX receipt coverage ratio 3) Liquidity risk timeline 4) Recommended mitigations`;

  const analysis = await callAI(prompt);
  return { type: 'BTB_RISK', analysis, generatedAt: new Date().toISOString(), pendingCount: pendingBtb.length };
}
