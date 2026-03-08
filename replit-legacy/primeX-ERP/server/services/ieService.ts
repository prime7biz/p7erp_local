import { db } from "../db";
import { sql } from "drizzle-orm";

export async function listIEOperations(tenantId: number, filters?: { category?: string; machine_type?: string; active?: boolean }) {
  let query = sql`SELECT * FROM ie_operations_library WHERE tenant_id = ${tenantId}`;
  if (filters?.category) query = sql`${query} AND category = ${filters.category}`;
  if (filters?.machine_type) query = sql`${query} AND machine_type = ${filters.machine_type}`;
  if (filters?.active !== undefined) query = sql`${query} AND active = ${filters.active}`;
  query = sql`${query} ORDER BY op_code`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createIEOperation(tenantId: number, data: {
  op_code: string;
  op_name: string;
  default_smv: number;
  machine_type?: string;
  category?: string;
}) {
  const existing = await db.execute(
    sql`SELECT id FROM ie_operations_library WHERE tenant_id = ${tenantId} AND op_code = ${data.op_code}`
  );
  if (existing.rows.length) throw new Error("Operation code already exists for this tenant");

  const result = await db.execute(
    sql`INSERT INTO ie_operations_library (tenant_id, op_code, op_name, default_smv, machine_type, category, active, created_at)
        VALUES (${tenantId}, ${data.op_code}, ${data.op_name}, ${data.default_smv}, ${data.machine_type ?? null}, ${data.category ?? null}, true, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateIEOperation(tenantId: number, id: number, data: {
  op_code?: string;
  op_name?: string;
  default_smv?: number;
  machine_type?: string;
  category?: string;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM ie_operations_library WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("IE operation not found");

  if (data.op_code) {
    const dup = await db.execute(
      sql`SELECT id FROM ie_operations_library WHERE tenant_id = ${tenantId} AND op_code = ${data.op_code} AND id != ${id}`
    );
    if (dup.rows.length) throw new Error("Operation code already exists for this tenant");
  }

  const result = await db.execute(
    sql`UPDATE ie_operations_library SET
        op_code = COALESCE(${data.op_code ?? null}, op_code),
        op_name = COALESCE(${data.op_name ?? null}, op_name),
        default_smv = COALESCE(${data.default_smv ?? null}, default_smv),
        machine_type = COALESCE(${data.machine_type ?? null}, machine_type),
        category = COALESCE(${data.category ?? null}, category)
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function toggleIEOperation(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM ie_operations_library WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("IE operation not found");

  const result = await db.execute(
    sql`UPDATE ie_operations_library SET active = NOT active
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listLineConfigs(tenantId: number) {
  const result = await db.execute(
    sql`SELECT lc.*, sl.line_code, sl.floor
        FROM ie_line_configs lc
        LEFT JOIN sewing_lines sl ON sl.id = lc.line_id AND sl.tenant_id = lc.tenant_id
        WHERE lc.tenant_id = ${tenantId}
        ORDER BY sl.line_code`
  );
  return result.rows;
}

export async function getLineConfig(tenantId: number, lineId: number) {
  const result = await db.execute(
    sql`SELECT lc.*, sl.line_code, sl.floor
        FROM ie_line_configs lc
        LEFT JOIN sewing_lines sl ON sl.id = lc.line_id AND sl.tenant_id = lc.tenant_id
        WHERE lc.tenant_id = ${tenantId} AND lc.line_id = ${lineId}`
  );
  return result.rows[0] || null;
}

export async function upsertLineConfig(tenantId: number, lineId: number, data: {
  default_shift_minutes: number;
  default_efficiency_pct: number;
  standard_manpower: number;
  active?: boolean;
}) {
  const existing = await db.execute(
    sql`SELECT id FROM ie_line_configs WHERE tenant_id = ${tenantId} AND line_id = ${lineId}`
  );

  if (existing.rows.length) {
    const result = await db.execute(
      sql`UPDATE ie_line_configs SET
          default_shift_minutes = ${data.default_shift_minutes},
          default_efficiency_pct = ${data.default_efficiency_pct},
          standard_manpower = ${data.standard_manpower},
          active = ${data.active ?? true},
          updated_at = NOW()
          WHERE tenant_id = ${tenantId} AND line_id = ${lineId}
          RETURNING *`
    );
    return result.rows[0];
  } else {
    const result = await db.execute(
      sql`INSERT INTO ie_line_configs (tenant_id, line_id, default_shift_minutes, default_efficiency_pct, standard_manpower, active, created_at, updated_at)
          VALUES (${tenantId}, ${lineId}, ${data.default_shift_minutes}, ${data.default_efficiency_pct}, ${data.standard_manpower}, ${data.active ?? true}, NOW(), NOW())
          RETURNING *`
    );
    return result.rows[0];
  }
}

export async function calculateEfficiency(tenantId: number, lineId: number, date: string) {
  const lineLoadResult = await db.execute(
    sql`SELECT ll.ob_id, ll.id as line_load_id
        FROM line_loads ll
        WHERE ll.tenant_id = ${tenantId} AND ll.line_id = ${lineId} AND ll.status = 'ACTIVE'
        ORDER BY ll.created_at DESC LIMIT 1`
  );
  if (!lineLoadResult.rows.length) throw new Error("No active line load found for this line");
  const lineLoad = lineLoadResult.rows[0] as any;

  const smvResult = await db.execute(
    sql`SELECT COALESCE(AVG(smv), 0)::numeric as avg_smv, COALESCE(SUM(smv), 0)::numeric as total_smv
        FROM operation_bulletin_ops WHERE ob_id = ${lineLoad.ob_id} AND tenant_id = ${tenantId}`
  );
  const avgSMV = parseFloat(smvResult.rows[0]?.avg_smv as string) || 0;

  const prodResult = await db.execute(
    sql`SELECT COALESCE(SUM(good_qty), 0)::int as total_good,
        COALESCE(MAX(operators_present), 0)::int as operators
        FROM hourly_production_entries
        WHERE tenant_id = ${tenantId} AND line_id = ${lineId} AND entry_date = ${date}`
  );
  const totalGood = (prodResult.rows[0] as any)?.total_good ?? 0;
  const operators = (prodResult.rows[0] as any)?.operators ?? 0;

  const configResult = await db.execute(
    sql`SELECT default_shift_minutes FROM ie_line_configs WHERE tenant_id = ${tenantId} AND line_id = ${lineId}`
  );
  const shiftMinutes = parseFloat((configResult.rows[0] as any)?.default_shift_minutes as string) || 480;

  const shiftResult = await db.execute(
    sql`SELECT COALESCE(s.break_minutes, 0)::int as break_minutes
        FROM line_loads ll
        JOIN shifts s ON s.id = ll.shift_id AND s.tenant_id = ll.tenant_id
        WHERE ll.id = ${lineLoad.line_load_id} AND ll.tenant_id = ${tenantId}`
  );
  const breakMinutes = (shiftResult.rows[0] as any)?.break_minutes ?? 0;
  const netMinutes = shiftMinutes - breakMinutes;

  let efficiency = 0;
  if (operators > 0 && netMinutes > 0 && avgSMV > 0) {
    efficiency = (totalGood * avgSMV) / (operators * netMinutes) * 100;
    efficiency = Math.round(efficiency * 100) / 100;
  }

  const targetOutput = operators > 0 && avgSMV > 0 ? Math.floor((operators * netMinutes) / avgSMV) : 0;

  return {
    efficiency,
    actualOutput: totalGood,
    targetOutput,
    smv: avgSMV,
    operators,
  };
}

export async function calculateTarget(tenantId: number, lineId: number) {
  const configResult = await db.execute(
    sql`SELECT * FROM ie_line_configs WHERE tenant_id = ${tenantId} AND line_id = ${lineId}`
  );
  if (!configResult.rows.length) throw new Error("Line config not found");
  const config = configResult.rows[0] as any;

  const lineLoadResult = await db.execute(
    sql`SELECT ll.ob_id
        FROM line_loads ll
        WHERE ll.tenant_id = ${tenantId} AND ll.line_id = ${lineId} AND ll.status = 'ACTIVE'
        ORDER BY ll.created_at DESC LIMIT 1`
  );
  if (!lineLoadResult.rows.length) throw new Error("No active line load found for this line");
  const lineLoad = lineLoadResult.rows[0] as any;

  const smvResult = await db.execute(
    sql`SELECT COALESCE(SUM(smv), 0)::numeric as total_smv
        FROM operation_bulletin_ops WHERE ob_id = ${lineLoad.ob_id} AND tenant_id = ${tenantId}`
  );
  const totalSMV = parseFloat(smvResult.rows[0]?.total_smv as string) || 0;
  if (totalSMV === 0) throw new Error("No operations found in operation bulletin");

  const operators = config.standard_manpower || 0;
  const efficiencyPct = parseFloat(config.default_efficiency_pct) || 0;
  const netMinutesPerHour = 60;

  const targetPerHour = (operators * (efficiencyPct / 100) * netMinutesPerHour) / totalSMV;

  return {
    targetPerHour: Math.round(targetPerHour * 100) / 100,
    operators,
    efficiencyPct,
    totalSMV,
  };
}
