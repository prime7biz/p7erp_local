import { db } from "../db";

// Get KPI history by code for trend analysis
export async function getKPIHistory(tenantId: number, kpiCode: string) {
  try {
    const result = await db.query(
      `SELECT * FROM kpi_history
       WHERE tenant_id = $1 AND kpi_code = $2
       ORDER BY period_date DESC`,
      [tenantId, kpiCode]
    );
    return result.rows;
  } catch (error) {
    console.error(`Error getting KPI history for ${kpiCode}:`, error);
    throw new Error(`Failed to get KPI history for ${kpiCode}`);
  }
}

// Get fabric test results for a specific order
export async function getFabricTestsByOrderId(orderId: number, tenantId: number) {
  try {
    const result = await db.query(
      `SELECT * FROM fabric_tests
       WHERE tenant_id = $1 AND order_id = $2
       ORDER BY test_date DESC`,
      [tenantId, orderId]
    );
    return result.rows;
  } catch (error) {
    console.error(`Error getting fabric tests for order ${orderId}:`, error);
    throw new Error(`Failed to get fabric tests for order ${orderId}`);
  }
}

// Get production sample history for a specific order
export async function getProductionSamplesByOrderId(orderId: number, tenantId: number) {
  try {
    const result = await db.query(
      `SELECT * FROM production_samples
       WHERE tenant_id = $1 AND order_id = $2
       ORDER BY sample_date DESC`,
      [tenantId, orderId]
    );
    return result.rows;
  } catch (error) {
    console.error(`Error getting production samples for order ${orderId}:`, error);
    throw new Error(`Failed to get production samples for order ${orderId}`);
  }
}

// Get technical specifications for a specific style
export async function getTechSpecsByStyleId(styleId: number, tenantId: number) {
  try {
    const result = await db.query(
      `SELECT * FROM garment_tech_specs
       WHERE tenant_id = $1 AND style_id = $2
       ORDER BY spec_version DESC`,
      [tenantId, styleId]
    );
    return result.rows;
  } catch (error) {
    console.error(`Error getting technical specs for style ${styleId}:`, error);
    throw new Error(`Failed to get technical specs for style ${styleId}`);
  }
}