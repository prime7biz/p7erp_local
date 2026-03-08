import { db } from "../db";
import { sql } from "drizzle-orm";

export async function listProductionPlans(tenantId: number, filters?: { status?: string; date?: string }) {
  let query = sql`SELECT * FROM production_plans WHERE tenant_id = ${tenantId}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  if (filters?.date) query = sql`${query} AND plan_date = ${filters.date}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function getProductionPlan(tenantId: number, id: number) {
  const planResult = await db.execute(
    sql`SELECT * FROM production_plans WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!planResult.rows.length) throw new Error("Production plan not found");

  const assignmentsResult = await db.execute(
    sql`SELECT la.*, sl.line_code, sl.floor, s.name as shift_name
        FROM line_assignments la
        LEFT JOIN sewing_lines sl ON sl.id = la.line_id AND sl.tenant_id = la.tenant_id
        LEFT JOIN shifts s ON s.id = la.shift_id AND s.tenant_id = la.tenant_id
        WHERE la.production_plan_id = ${id} AND la.tenant_id = ${tenantId}
        ORDER BY la.created_at`
  );

  return { plan: planResult.rows[0], lineAssignments: assignmentsResult.rows };
}

export async function createProductionPlan(tenantId: number, data: {
  plan_date: string;
  related_type?: string;
  related_id?: number;
  style_id?: number;
  planned_qty: number;
  target_qty?: number;
  notes?: string;
  created_by: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO production_plans (tenant_id, plan_date, related_type, related_id, style_id, planned_qty, target_qty, status, notes, created_by, created_at, updated_at)
        VALUES (${tenantId}, ${data.plan_date}, ${data.related_type ?? null}, ${data.related_id ?? null}, ${data.style_id ?? null}, ${data.planned_qty}, ${data.target_qty ?? data.planned_qty}, 'DRAFT', ${data.notes ?? null}, ${data.created_by}, NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateProductionPlan(tenantId: number, id: number, data: {
  plan_date?: string;
  related_type?: string;
  related_id?: number;
  style_id?: number;
  planned_qty?: number;
  target_qty?: number;
  notes?: string;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM production_plans WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Production plan not found");
  if (existing.rows[0].status !== "DRAFT") throw new Error("Only DRAFT plans can be updated");

  const result = await db.execute(
    sql`UPDATE production_plans SET
        plan_date = COALESCE(${data.plan_date ?? null}, plan_date),
        related_type = COALESCE(${data.related_type ?? null}, related_type),
        related_id = COALESCE(${data.related_id ?? null}, related_id),
        style_id = COALESCE(${data.style_id ?? null}, style_id),
        planned_qty = COALESCE(${data.planned_qty ?? null}, planned_qty),
        target_qty = COALESCE(${data.target_qty ?? null}, target_qty),
        notes = COALESCE(${data.notes ?? null}, notes),
        updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function approveProductionPlan(tenantId: number, id: number, userId: number) {
  const existing = await db.execute(
    sql`SELECT * FROM production_plans WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Production plan not found");
  if (existing.rows[0].status !== "DRAFT") throw new Error("Only DRAFT plans can be approved");

  const result = await db.execute(
    sql`UPDATE production_plans SET status = 'APPROVED', approved_by = ${userId}, approved_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function activateProductionPlan(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM production_plans WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Production plan not found");
  if (existing.rows[0].status !== "APPROVED") throw new Error("Only APPROVED plans can be activated");

  const result = await db.execute(
    sql`UPDATE production_plans SET status = 'ACTIVE', updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function closeProductionPlan(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM production_plans WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Production plan not found");
  if (existing.rows[0].status !== "ACTIVE") throw new Error("Only ACTIVE plans can be closed");

  const result = await db.execute(
    sql`UPDATE production_plans SET status = 'CLOSED', updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listLineAssignments(tenantId: number, planId: number) {
  const result = await db.execute(
    sql`SELECT la.*, sl.line_code, sl.floor, s.name as shift_name
        FROM line_assignments la
        LEFT JOIN sewing_lines sl ON sl.id = la.line_id AND sl.tenant_id = la.tenant_id
        LEFT JOIN shifts s ON s.id = la.shift_id AND s.tenant_id = la.tenant_id
        WHERE la.production_plan_id = ${planId} AND la.tenant_id = ${tenantId}
        ORDER BY la.created_at`
  );
  return result.rows;
}

export async function createLineAssignment(tenantId: number, data: {
  production_plan_id: number;
  line_id: number;
  shift_id: number;
  target_qty: number;
  smv?: number;
  planned_efficiency_pct?: number;
  planned_manpower?: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO line_assignments (tenant_id, production_plan_id, line_id, shift_id, target_qty, smv, planned_efficiency_pct, planned_manpower, status, created_at, updated_at)
        VALUES (${tenantId}, ${data.production_plan_id}, ${data.line_id}, ${data.shift_id}, ${data.target_qty}, ${data.smv ?? null}, ${data.planned_efficiency_pct ?? null}, ${data.planned_manpower ?? null}, 'ACTIVE', NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateLineAssignment(tenantId: number, id: number, data: {
  line_id?: number;
  shift_id?: number;
  target_qty?: number;
  smv?: number;
  planned_efficiency_pct?: number;
  planned_manpower?: number;
  status?: string;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM line_assignments WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Line assignment not found");

  const result = await db.execute(
    sql`UPDATE line_assignments SET
        line_id = COALESCE(${data.line_id ?? null}, line_id),
        shift_id = COALESCE(${data.shift_id ?? null}, shift_id),
        target_qty = COALESCE(${data.target_qty ?? null}, target_qty),
        smv = COALESCE(${data.smv ?? null}, smv),
        planned_efficiency_pct = COALESCE(${data.planned_efficiency_pct ?? null}, planned_efficiency_pct),
        planned_manpower = COALESCE(${data.planned_manpower ?? null}, planned_manpower),
        status = COALESCE(${data.status ?? null}, status),
        updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function deleteLineAssignment(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM line_assignments WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Line assignment not found");

  await db.execute(
    sql`DELETE FROM line_assignments WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  return { success: true };
}

export async function listSewingLines(tenantId: number) {
  const result = await db.execute(
    sql`SELECT * FROM sewing_lines WHERE tenant_id = ${tenantId} ORDER BY line_code`
  );
  return result.rows;
}

export async function createSewingLine(tenantId: number, data: {
  line_code: string;
  floor?: string;
  capacity_operators?: number;
  default_shift_hours?: number;
  status?: string;
}) {
  const result = await db.execute(
    sql`INSERT INTO sewing_lines (tenant_id, line_code, floor, capacity_operators, default_shift_hours, status, created_at)
        VALUES (${tenantId}, ${data.line_code}, ${data.floor ?? null}, ${data.capacity_operators ?? null}, ${data.default_shift_hours ?? null}, ${data.status ?? 'ACTIVE'}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateSewingLine(tenantId: number, id: number, data: {
  line_code?: string;
  floor?: string;
  capacity_operators?: number;
  default_shift_hours?: number;
  status?: string;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM sewing_lines WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Sewing line not found");

  const result = await db.execute(
    sql`UPDATE sewing_lines SET
        line_code = COALESCE(${data.line_code ?? null}, line_code),
        floor = COALESCE(${data.floor ?? null}, floor),
        capacity_operators = COALESCE(${data.capacity_operators ?? null}, capacity_operators),
        default_shift_hours = COALESCE(${data.default_shift_hours ?? null}, default_shift_hours),
        status = COALESCE(${data.status ?? null}, status)
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listShifts(tenantId: number) {
  const result = await db.execute(
    sql`SELECT * FROM shifts WHERE tenant_id = ${tenantId} ORDER BY start_time`
  );
  return result.rows;
}

export async function createShift(tenantId: number, data: {
  name: string;
  start_time: string;
  end_time: string;
  break_minutes?: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO shifts (tenant_id, name, start_time, end_time, break_minutes, created_at)
        VALUES (${tenantId}, ${data.name}, ${data.start_time}, ${data.end_time}, ${data.break_minutes ?? 0}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function listHourlyEntries(tenantId: number, filters: {
  date?: string;
  line_id?: number;
  production_plan_id?: number;
  department?: string;
}) {
  let query = sql`SELECT hpe.*, sl.line_code, sl.floor
      FROM hourly_production_entries hpe
      LEFT JOIN sewing_lines sl ON sl.id = hpe.line_id AND sl.tenant_id = hpe.tenant_id
      WHERE hpe.tenant_id = ${tenantId}`;
  if (filters.date) query = sql`${query} AND hpe.entry_date = ${filters.date}`;
  if (filters.line_id) query = sql`${query} AND hpe.line_id = ${filters.line_id}`;
  if (filters.production_plan_id) query = sql`${query} AND hpe.production_plan_id = ${filters.production_plan_id}`;
  if (filters.department) query = sql`${query} AND hpe.department = ${filters.department}`;
  query = sql`${query} ORDER BY hpe.entry_date DESC, hpe.hour_slot`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createHourlyEntry(tenantId: number, data: {
  entry_date: string;
  hour_slot: number;
  department?: string;
  line_id: number;
  production_plan_id?: number;
  good_qty: number;
  reject_qty?: number;
  rework_qty?: number;
  operators_present?: number;
  remarks?: string;
  entered_by: number;
}) {
  const duplicate = await db.execute(
    sql`SELECT id FROM hourly_production_entries
        WHERE tenant_id = ${tenantId} AND entry_date = ${data.entry_date} AND hour_slot = ${data.hour_slot} AND line_id = ${data.line_id}`
  );
  if (duplicate.rows.length) throw new Error("Duplicate entry: an hourly entry already exists for this line, date, and hour slot");

  const result = await db.execute(
    sql`INSERT INTO hourly_production_entries (tenant_id, entry_date, hour_slot, department, line_id, production_plan_id, good_qty, reject_qty, rework_qty, operators_present, remarks, entered_by, created_at)
        VALUES (${tenantId}, ${data.entry_date}, ${data.hour_slot}, ${data.department ?? null}, ${data.line_id}, ${data.production_plan_id ?? null}, ${data.good_qty}, ${data.reject_qty ?? 0}, ${data.rework_qty ?? 0}, ${data.operators_present ?? null}, ${data.remarks ?? null}, ${data.entered_by}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function listWipMoves(tenantId: number, filters: {
  bundle_id?: string;
  production_plan_id?: number;
}) {
  let query = sql`SELECT * FROM wip_moves WHERE tenant_id = ${tenantId}`;
  if (filters.bundle_id) query = sql`${query} AND bundle_id = ${filters.bundle_id}`;
  if (filters.production_plan_id) query = sql`${query} AND production_plan_id = ${filters.production_plan_id}`;
  query = sql`${query} ORDER BY move_date_time DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createWipMove(tenantId: number, data: {
  bundle_id?: string;
  production_plan_id?: number;
  from_stage: string;
  to_stage: string;
  qty: number;
  move_date_time?: string;
  created_by: number;
}) {
  if (!data.qty || data.qty <= 0) throw new Error("Quantity must be greater than 0");

  const result = await db.execute(
    sql`INSERT INTO wip_moves (tenant_id, bundle_id, production_plan_id, from_stage, to_stage, qty, move_date_time, created_by, created_at)
        VALUES (${tenantId}, ${data.bundle_id ?? null}, ${data.production_plan_id ?? null}, ${data.from_stage}, ${data.to_stage}, ${data.qty}, ${data.move_date_time ?? new Date().toISOString()}, ${data.created_by}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function getDashboardKPIs(tenantId: number) {
  const today = new Date().toISOString().split("T")[0];

  const [activePlans, todayProduction, activeLines] = await Promise.all([
    db.execute(
      sql`SELECT COUNT(*)::int as count FROM production_plans WHERE tenant_id = ${tenantId} AND status = 'ACTIVE'`
    ),
    db.execute(
      sql`SELECT COALESCE(SUM(good_qty), 0)::int as total_good, COALESCE(SUM(reject_qty), 0)::int as total_reject
          FROM hourly_production_entries WHERE tenant_id = ${tenantId} AND entry_date = ${today}`
    ),
    db.execute(
      sql`SELECT COUNT(*)::int as count FROM sewing_lines WHERE tenant_id = ${tenantId} AND status = 'ACTIVE'`
    ),
  ]);

  return {
    activePlans: activePlans.rows[0]?.count ?? 0,
    totalGoodToday: todayProduction.rows[0]?.total_good ?? 0,
    totalRejectToday: todayProduction.rows[0]?.total_reject ?? 0,
    activeLines: activeLines.rows[0]?.count ?? 0,
  };
}
