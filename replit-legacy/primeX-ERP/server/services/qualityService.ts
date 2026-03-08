import { db } from "../db";
import { sql } from "drizzle-orm";

function getAQL(totalQty: number): { sample_size: number; allowed_defects: number } {
  if (totalQty <= 150) return { sample_size: 20, allowed_defects: 1 };
  if (totalQty <= 500) return { sample_size: 50, allowed_defects: 3 };
  if (totalQty <= 1200) return { sample_size: 80, allowed_defects: 5 };
  if (totalQty <= 3200) return { sample_size: 125, allowed_defects: 7 };
  return { sample_size: 200, allowed_defects: 10 };
}

export async function listDefects(tenantId: number, filters?: { process?: string; category?: string; active?: boolean }) {
  let query = sql`SELECT * FROM defect_master WHERE tenant_id = ${tenantId}`;
  if (filters?.process) query = sql`${query} AND process = ${filters.process}`;
  if (filters?.category) query = sql`${query} AND category = ${filters.category}`;
  if (filters?.active !== undefined) query = sql`${query} AND active = ${filters.active}`;
  query = sql`${query} ORDER BY defect_code`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createDefect(tenantId: number, data: {
  defect_code: string;
  defect_name: string;
  process?: string;
  category?: string;
  severity?: string;
}) {
  const result = await db.execute(
    sql`INSERT INTO defect_master (tenant_id, defect_code, defect_name, process, category, severity, active, created_at)
        VALUES (${tenantId}, ${data.defect_code}, ${data.defect_name}, ${data.process ?? null}, ${data.category ?? null}, ${data.severity ?? 'MEDIUM'}, true, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateDefect(tenantId: number, id: number, data: {
  defect_code?: string;
  defect_name?: string;
  process?: string;
  category?: string;
  severity?: string;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM defect_master WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Defect not found");

  const result = await db.execute(
    sql`UPDATE defect_master SET
        defect_code = COALESCE(${data.defect_code ?? null}, defect_code),
        defect_name = COALESCE(${data.defect_name ?? null}, defect_name),
        process = COALESCE(${data.process ?? null}, process),
        category = COALESCE(${data.category ?? null}, category),
        severity = COALESCE(${data.severity ?? null}, severity)
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function toggleDefect(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM defect_master WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Defect not found");

  const result = await db.execute(
    sql`UPDATE defect_master SET active = NOT active
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function createInspection(tenantId: number, data: {
  type: string;
  department?: string;
  production_plan_id?: number;
  line_id?: number;
  bundle_id?: string;
  carton_id?: number;
  packing_list_id?: number;
  shipment_id?: number;
  inspected_qty: number;
  result: string;
  inspector_user_id: number;
  remarks?: string;
  metadata?: any;
  defects?: Array<{ defect_id: number; count: number }>;
}) {
  const defectQty = (data.defects ?? []).reduce((sum, d) => sum + d.count, 0);

  const inspectionResult = await db.execute(
    sql`INSERT INTO qc_inspections (tenant_id, type, department, production_plan_id, line_id, bundle_id, carton_id, packing_list_id, shipment_id, inspected_qty, defect_qty, result, inspector_user_id, remarks, metadata, created_at)
        VALUES (${tenantId}, ${data.type}, ${data.department ?? null}, ${data.production_plan_id ?? null}, ${data.line_id ?? null}, ${data.bundle_id ?? null}, ${data.carton_id ?? null}, ${data.packing_list_id ?? null}, ${data.shipment_id ?? null}, ${data.inspected_qty}, ${defectQty}, ${data.result}, ${data.inspector_user_id}, ${data.remarks ?? null}, ${data.metadata ? JSON.stringify(data.metadata) : null}, NOW())
        RETURNING *`
  );
  const inspection = inspectionResult.rows[0];

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

export async function listInspections(tenantId: number, filters?: { type?: string; department?: string; date?: string; result?: string }) {
  let query = sql`SELECT * FROM qc_inspections WHERE tenant_id = ${tenantId}`;
  if (filters?.type) query = sql`${query} AND type = ${filters.type}`;
  if (filters?.department) query = sql`${query} AND department = ${filters.department}`;
  if (filters?.date) query = sql`${query} AND created_at::date = ${filters.date}`;
  if (filters?.result) query = sql`${query} AND result = ${filters.result}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function getInspection(tenantId: number, id: number) {
  const inspectionResult = await db.execute(
    sql`SELECT * FROM qc_inspections WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!inspectionResult.rows.length) throw new Error("Inspection not found");

  const defectsResult = await db.execute(
    sql`SELECT qid.*, dm.defect_code, dm.defect_name, dm.process, dm.category, dm.severity
        FROM qc_inspection_defects qid
        LEFT JOIN defect_master dm ON dm.id = qid.defect_id AND dm.tenant_id = qid.tenant_id
        WHERE qid.inspection_id = ${id} AND qid.tenant_id = ${tenantId}
        ORDER BY qid.id`
  );

  return { inspection: inspectionResult.rows[0], defects: defectsResult.rows };
}

export async function createFinalLot(tenantId: number, data: {
  related_type?: string;
  related_id?: number;
  lot_no: string;
  total_qty: number;
  carton_count?: number;
  created_by: number;
}) {
  const aql = getAQL(data.total_qty);

  const result = await db.execute(
    sql`INSERT INTO qc_final_lots (tenant_id, related_type, related_id, lot_no, total_qty, carton_count, sample_size, allowed_defects, found_defects, status, created_by, created_at, updated_at)
        VALUES (${tenantId}, ${data.related_type ?? null}, ${data.related_id ?? null}, ${data.lot_no}, ${data.total_qty}, ${data.carton_count ?? null}, ${aql.sample_size}, ${aql.allowed_defects}, 0, 'PLANNED', ${data.created_by}, NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateFinalLotResults(tenantId: number, id: number, foundDefects: number) {
  const existing = await db.execute(
    sql`SELECT * FROM qc_final_lots WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Final lot not found");

  const allowedDefects = existing.rows[0].allowed_defects as number;
  const status = foundDefects <= allowedDefects ? 'PASS' : 'FAIL';

  const result = await db.execute(
    sql`UPDATE qc_final_lots SET found_defects = ${foundDefects}, status = ${status}, updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listFinalLots(tenantId: number, filters?: { status?: string; related_type?: string }) {
  let query = sql`SELECT * FROM qc_final_lots WHERE tenant_id = ${tenantId}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  if (filters?.related_type) query = sql`${query} AND related_type = ${filters.related_type}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function getFinalLot(tenantId: number, id: number) {
  const lotResult = await db.execute(
    sql`SELECT * FROM qc_final_lots WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!lotResult.rows.length) throw new Error("Final lot not found");

  const inspectionsResult = await db.execute(
    sql`SELECT * FROM qc_inspections
        WHERE tenant_id = ${tenantId} AND type = 'FINAL'
        AND (carton_id IS NOT NULL OR packing_list_id IS NOT NULL OR shipment_id IS NOT NULL)
        ORDER BY created_at DESC`
  );

  return { lot: lotResult.rows[0], inspections: inspectionsResult.rows };
}

export async function listCorrectiveActions(tenantId: number, filters?: { status?: string; inspection_id?: number; final_lot_id?: number }) {
  let query = sql`SELECT * FROM qc_corrective_actions WHERE tenant_id = ${tenantId}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  if (filters?.inspection_id) query = sql`${query} AND inspection_id = ${filters.inspection_id}`;
  if (filters?.final_lot_id) query = sql`${query} AND final_lot_id = ${filters.final_lot_id}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createCorrectiveAction(tenantId: number, data: {
  inspection_id?: number;
  final_lot_id?: number;
  action_type: string;
  owner_user_id?: number;
  due_date?: string;
  notes?: string;
}) {
  const result = await db.execute(
    sql`INSERT INTO qc_corrective_actions (tenant_id, inspection_id, final_lot_id, action_type, owner_user_id, due_date, status, notes, created_at, updated_at)
        VALUES (${tenantId}, ${data.inspection_id ?? null}, ${data.final_lot_id ?? null}, ${data.action_type}, ${data.owner_user_id ?? null}, ${data.due_date ?? null}, 'OPEN', ${data.notes ?? null}, NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateCorrectiveAction(tenantId: number, id: number, data: {
  status?: string;
  notes?: string;
  action_type?: string;
  owner_user_id?: number;
  due_date?: string;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM qc_corrective_actions WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Corrective action not found");

  const result = await db.execute(
    sql`UPDATE qc_corrective_actions SET
        status = COALESCE(${data.status ?? null}, status),
        notes = COALESCE(${data.notes ?? null}, notes),
        action_type = COALESCE(${data.action_type ?? null}, action_type),
        owner_user_id = COALESCE(${data.owner_user_id ?? null}, owner_user_id),
        due_date = COALESCE(${data.due_date ?? null}, due_date),
        updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function getQCDashboard(tenantId: number) {
  const today = new Date().toISOString().split("T")[0];

  const [inspectionsToday, passRate, avgDHU, openCAs] = await Promise.all([
    db.execute(
      sql`SELECT COUNT(*)::int as count FROM qc_inspections WHERE tenant_id = ${tenantId} AND created_at::date = ${today}`
    ),
    db.execute(
      sql`SELECT
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE result = 'PASS')::int as passed
          FROM qc_inspections WHERE tenant_id = ${tenantId} AND created_at::date = ${today}`
    ),
    db.execute(
      sql`SELECT
            COALESCE(AVG(CASE WHEN inspected_qty > 0 THEN (defect_qty::numeric / inspected_qty) * 100 ELSE 0 END), 0) as dhu
          FROM qc_inspections WHERE tenant_id = ${tenantId} AND created_at::date = ${today}`
    ),
    db.execute(
      sql`SELECT COUNT(*)::int as count FROM qc_corrective_actions WHERE tenant_id = ${tenantId} AND status = 'OPEN'`
    ),
  ]);

  const total = (passRate.rows[0]?.total as number) || 0;
  const passed = (passRate.rows[0]?.passed as number) || 0;

  return {
    inspectionsToday: inspectionsToday.rows[0]?.count ?? 0,
    passRate: total > 0 ? Math.round((passed / total) * 10000) / 100 : 0,
    averageDHU: Math.round((Number(avgDHU.rows[0]?.dhu) || 0) * 100) / 100,
    openCorrectiveActions: openCAs.rows[0]?.count ?? 0,
  };
}
