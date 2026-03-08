import { db } from "../db";
import { sql } from "drizzle-orm";

export async function listOperationBulletins(tenantId: number, filters?: { style_id?: number; status?: string }) {
  let query = sql`SELECT * FROM operation_bulletins WHERE tenant_id = ${tenantId}`;
  if (filters?.style_id) query = sql`${query} AND style_id = ${filters.style_id}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function getOperationBulletin(tenantId: number, id: number) {
  const obResult = await db.execute(
    sql`SELECT * FROM operation_bulletins WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!obResult.rows.length) throw new Error("Operation bulletin not found");

  const opsResult = await db.execute(
    sql`SELECT * FROM operation_bulletin_ops WHERE ob_id = ${id} AND tenant_id = ${tenantId} ORDER BY sequence_no, op_no`
  );

  return { ob: obResult.rows[0], operations: opsResult.rows };
}

export async function createOperationBulletin(tenantId: number, data: {
  style_id?: number;
  ob_version?: string;
  revision_of_ob_id?: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO operation_bulletins (tenant_id, style_id, ob_version, status, total_smv, revision_of_ob_id, created_at, updated_at)
        VALUES (${tenantId}, ${data.style_id ?? null}, ${data.ob_version ?? null}, 'DRAFT', ${0}, ${data.revision_of_ob_id ?? null}, NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function addOBOperation(tenantId: number, obId: number, data: {
  op_no: string;
  op_name: string;
  smv: number;
  machine_type?: string;
  sequence_no?: number;
  qc_points?: Record<string, any>;
}) {
  const obResult = await db.execute(
    sql`SELECT * FROM operation_bulletins WHERE id = ${obId} AND tenant_id = ${tenantId}`
  );
  if (!obResult.rows.length) throw new Error("Operation bulletin not found");
  if ((obResult.rows[0] as any).status !== "DRAFT") throw new Error("Only DRAFT OBs can have operations added");

  const result = await db.execute(
    sql`INSERT INTO operation_bulletin_ops (tenant_id, ob_id, op_no, op_name, smv, machine_type, sequence_no, qc_points, created_at)
        VALUES (${tenantId}, ${obId}, ${data.op_no}, ${data.op_name}, ${data.smv}, ${data.machine_type ?? null}, ${data.sequence_no ?? null}, ${data.qc_points ? JSON.stringify(data.qc_points) : null}::jsonb, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function removeOBOperation(tenantId: number, opId: number) {
  const opResult = await db.execute(
    sql`SELECT obo.*, ob.status as ob_status FROM operation_bulletin_ops obo
        JOIN operation_bulletins ob ON ob.id = obo.ob_id AND ob.tenant_id = obo.tenant_id
        WHERE obo.id = ${opId} AND obo.tenant_id = ${tenantId}`
  );
  if (!opResult.rows.length) throw new Error("Operation not found");
  if ((opResult.rows[0] as any).ob_status !== "DRAFT") throw new Error("Only operations from DRAFT OBs can be removed");

  await db.execute(
    sql`DELETE FROM operation_bulletin_ops WHERE id = ${opId} AND tenant_id = ${tenantId}`
  );
  return { success: true };
}

export async function approveOB(tenantId: number, id: number, userId: number) {
  const obResult = await db.execute(
    sql`SELECT * FROM operation_bulletins WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!obResult.rows.length) throw new Error("Operation bulletin not found");
  if ((obResult.rows[0] as any).status !== "DRAFT") throw new Error("Only DRAFT OBs can be approved");

  const smvResult = await db.execute(
    sql`SELECT COALESCE(SUM(smv), 0)::numeric as total_smv FROM operation_bulletin_ops WHERE ob_id = ${id} AND tenant_id = ${tenantId}`
  );
  const totalSmv = parseFloat(smvResult.rows[0]?.total_smv as string) || 0;

  const result = await db.execute(
    sql`UPDATE operation_bulletins SET status = 'APPROVED', total_smv = ${totalSmv}, approved_by = ${userId}, approved_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listLineLoads(tenantId: number, filters?: { line_id?: number; production_plan_id?: number; status?: string }) {
  let query = sql`SELECT ll.*, sl.line_code, sl.floor
      FROM line_loads ll
      LEFT JOIN sewing_lines sl ON sl.id = ll.line_id AND sl.tenant_id = ll.tenant_id
      WHERE ll.tenant_id = ${tenantId}`;
  if (filters?.line_id) query = sql`${query} AND ll.line_id = ${filters.line_id}`;
  if (filters?.production_plan_id) query = sql`${query} AND ll.production_plan_id = ${filters.production_plan_id}`;
  if (filters?.status) query = sql`${query} AND ll.status = ${filters.status}`;
  query = sql`${query} ORDER BY ll.created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createLineLoad(tenantId: number, data: {
  line_id: number;
  shift_id: number;
  production_plan_id?: number;
  sales_order_id?: number;
  style_id?: number;
  ob_id?: number;
  planned_start_date: string;
  planned_end_date: string;
  target_per_hour?: number;
  target_per_day?: number;
  planned_efficiency_pct?: number;
  planned_manpower?: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO line_loads (tenant_id, line_id, shift_id, production_plan_id, sales_order_id, style_id, ob_id, planned_start_date, planned_end_date, target_per_hour, target_per_day, planned_efficiency_pct, planned_manpower, status, created_at, updated_at)
        VALUES (${tenantId}, ${data.line_id}, ${data.shift_id}, ${data.production_plan_id ?? null}, ${data.sales_order_id ?? null}, ${data.style_id ?? null}, ${data.ob_id ?? null}, ${data.planned_start_date}, ${data.planned_end_date}, ${data.target_per_hour ?? null}, ${data.target_per_day ?? null}, ${data.planned_efficiency_pct ?? null}, ${data.planned_manpower ?? null}, 'ACTIVE', NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateLineLoad(tenantId: number, id: number, data: {
  line_id?: number;
  shift_id?: number;
  production_plan_id?: number;
  sales_order_id?: number;
  style_id?: number;
  ob_id?: number;
  planned_start_date?: string;
  planned_end_date?: string;
  target_per_hour?: number;
  target_per_day?: number;
  planned_efficiency_pct?: number;
  planned_manpower?: number;
  status?: string;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM line_loads WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Line load not found");

  const result = await db.execute(
    sql`UPDATE line_loads SET
        line_id = COALESCE(${data.line_id ?? null}, line_id),
        shift_id = COALESCE(${data.shift_id ?? null}, shift_id),
        production_plan_id = COALESCE(${data.production_plan_id ?? null}, production_plan_id),
        sales_order_id = COALESCE(${data.sales_order_id ?? null}, sales_order_id),
        style_id = COALESCE(${data.style_id ?? null}, style_id),
        ob_id = COALESCE(${data.ob_id ?? null}, ob_id),
        planned_start_date = COALESCE(${data.planned_start_date ?? null}, planned_start_date),
        planned_end_date = COALESCE(${data.planned_end_date ?? null}, planned_end_date),
        target_per_hour = COALESCE(${data.target_per_hour ?? null}, target_per_hour),
        target_per_day = COALESCE(${data.target_per_day ?? null}, target_per_day),
        planned_efficiency_pct = COALESCE(${data.planned_efficiency_pct ?? null}, planned_efficiency_pct),
        planned_manpower = COALESCE(${data.planned_manpower ?? null}, planned_manpower),
        status = COALESCE(${data.status ?? null}, status),
        updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listBundleProgress(tenantId: number, lineLoadId: number) {
  const result = await db.execute(
    sql`SELECT sbp.*, b.bundle_no, b.size, b.color, b.qty as bundle_qty
        FROM sewing_bundle_progress sbp
        LEFT JOIN bundles b ON b.id = sbp.bundle_id AND b.tenant_id = sbp.tenant_id
        WHERE sbp.line_load_id = ${lineLoadId} AND sbp.tenant_id = ${tenantId}
        ORDER BY sbp.created_at DESC`
  );
  return result.rows;
}

export async function updateBundleProgress(tenantId: number, bundleId: number, lineLoadId: number, data: {
  status: string;
  good_qty: number;
  rework_qty?: number;
  reject_qty?: number;
  updated_by: number;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM sewing_bundle_progress WHERE bundle_id = ${bundleId} AND line_load_id = ${lineLoadId} AND tenant_id = ${tenantId}`
  );

  if (existing.rows.length) {
    const result = await db.execute(
      sql`UPDATE sewing_bundle_progress SET
          status = ${data.status},
          good_qty = ${data.good_qty},
          rework_qty = ${data.rework_qty ?? 0},
          reject_qty = ${data.reject_qty ?? 0},
          updated_by = ${data.updated_by},
          last_updated_at = NOW()
          WHERE bundle_id = ${bundleId} AND line_load_id = ${lineLoadId} AND tenant_id = ${tenantId}
          RETURNING *`
    );
    return result.rows[0];
  } else {
    const result = await db.execute(
      sql`INSERT INTO sewing_bundle_progress (tenant_id, bundle_id, line_load_id, status, good_qty, rework_qty, reject_qty, updated_by, last_updated_at, created_at)
          VALUES (${tenantId}, ${bundleId}, ${lineLoadId}, ${data.status}, ${data.good_qty}, ${data.rework_qty ?? 0}, ${data.reject_qty ?? 0}, ${data.updated_by}, NOW(), NOW())
          RETURNING *`
    );
    return result.rows[0];
  }
}

export async function createInlineInspection(tenantId: number, data: {
  production_plan_id?: number;
  line_id: number;
  bundle_id?: number;
  inspected_qty: number;
  defect_qty: number;
  result?: string;
  inspector_user_id: number;
  remarks?: string;
  metadata?: Record<string, any>;
  defects?: Array<{ defect_id: number; count: number }>;
}) {
  const inspResult = await db.execute(
    sql`INSERT INTO qc_inspections (tenant_id, type, department, production_plan_id, line_id, bundle_id, inspected_qty, defect_qty, result, inspector_user_id, remarks, metadata, created_at, updated_at)
        VALUES (${tenantId}, 'INLINE', 'SEWING', ${data.production_plan_id ?? null}, ${data.line_id}, ${data.bundle_id ?? null}, ${data.inspected_qty}, ${data.defect_qty}, ${data.result ?? null}, ${data.inspector_user_id}, ${data.remarks ?? null}, ${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb, NOW(), NOW())
        RETURNING *`
  );
  const inspection = inspResult.rows[0] as any;

  if (data.defects && data.defects.length > 0) {
    for (const defect of data.defects) {
      await db.execute(
        sql`INSERT INTO qc_inspection_defects (tenant_id, inspection_id, defect_id, count, created_at)
            VALUES (${tenantId}, ${inspection.id}, ${defect.defect_id}, ${defect.count}, NOW())`
      );
    }
  }

  return inspection;
}

export async function listInlineInspections(tenantId: number, filters?: { line_id?: number; date?: string }) {
  let query = sql`SELECT qi.*, u.username as inspector_name
      FROM qc_inspections qi
      LEFT JOIN users u ON u.id = qi.inspector_user_id
      WHERE qi.tenant_id = ${tenantId} AND qi.type = 'INLINE'`;
  if (filters?.line_id) query = sql`${query} AND qi.line_id = ${filters.line_id}`;
  if (filters?.date) query = sql`${query} AND qi.created_at::date = ${filters.date}::date`;
  query = sql`${query} ORDER BY qi.created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function calculateDHU(tenantId: number, lineId: number, date: string) {
  const result = await db.execute(
    sql`SELECT
        COALESCE(SUM(inspected_qty), 0)::int as total_inspected,
        COALESCE(SUM(defect_qty), 0)::int as total_defects
        FROM qc_inspections
        WHERE tenant_id = ${tenantId} AND type = 'INLINE' AND line_id = ${lineId} AND created_at::date = ${date}::date`
  );
  const row = result.rows[0] as any;
  const totalInspected = row?.total_inspected ?? 0;
  const totalDefects = row?.total_defects ?? 0;
  const dhu = totalInspected > 0 ? (totalDefects / totalInspected) * 100 : 0;

  return {
    line_id: lineId,
    date,
    total_inspected: totalInspected,
    total_defects: totalDefects,
    dhu: Math.round(dhu * 100) / 100,
  };
}

export async function getSewingDashboard(tenantId: number) {
  const today = new Date().toISOString().split("T")[0];

  const [activeLoads, sewingOutput, dhuAvg] = await Promise.all([
    db.execute(
      sql`SELECT COUNT(*)::int as count FROM line_loads WHERE tenant_id = ${tenantId} AND status = 'ACTIVE'`
    ),
    db.execute(
      sql`SELECT COALESCE(SUM(good_qty), 0)::int as total_good, COALESCE(SUM(reject_qty), 0)::int as total_reject, COALESCE(SUM(rework_qty), 0)::int as total_rework
          FROM sewing_bundle_progress WHERE tenant_id = ${tenantId} AND last_updated_at::date = ${today}::date`
    ),
    db.execute(
      sql`SELECT
          COALESCE(SUM(inspected_qty), 0)::int as total_inspected,
          COALESCE(SUM(defect_qty), 0)::int as total_defects
          FROM qc_inspections
          WHERE tenant_id = ${tenantId} AND type = 'INLINE' AND created_at::date = ${today}::date`
    ),
  ]);

  const totalInspected = (dhuAvg.rows[0] as any)?.total_inspected ?? 0;
  const totalDefects = (dhuAvg.rows[0] as any)?.total_defects ?? 0;
  const dhu = totalInspected > 0 ? Math.round(((totalDefects / totalInspected) * 100) * 100) / 100 : 0;

  return {
    activeLineLoads: (activeLoads.rows[0] as any)?.count ?? 0,
    totalGoodToday: (sewingOutput.rows[0] as any)?.total_good ?? 0,
    totalRejectToday: (sewingOutput.rows[0] as any)?.total_reject ?? 0,
    totalReworkToday: (sewingOutput.rows[0] as any)?.total_rework ?? 0,
    dhuToday: dhu,
  };
}
