import { db } from "../db";
import { sql } from "drizzle-orm";

export async function listOperators(tenantId: number, filters?: { grade?: string; status?: string; default_line_id?: number }) {
  let query = sql`SELECT fo.*, sl.line_code as default_line_code
      FROM factory_operators fo
      LEFT JOIN sewing_lines sl ON sl.id = fo.default_line_id AND sl.tenant_id = fo.tenant_id
      WHERE fo.tenant_id = ${tenantId}`;
  if (filters?.grade) query = sql`${query} AND fo.grade = ${filters.grade}`;
  if (filters?.status) query = sql`${query} AND fo.status = ${filters.status}`;
  if (filters?.default_line_id) query = sql`${query} AND fo.default_line_id = ${filters.default_line_id}`;
  query = sql`${query} ORDER BY fo.emp_id`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createOperator(tenantId: number, data: {
  emp_id: string;
  name: string;
  grade?: string;
  status?: string;
  default_line_id?: number;
}) {
  const existing = await db.execute(
    sql`SELECT id FROM factory_operators WHERE tenant_id = ${tenantId} AND emp_id = ${data.emp_id}`
  );
  if (existing.rows.length) throw new Error("Employee ID already exists for this tenant");

  const result = await db.execute(
    sql`INSERT INTO factory_operators (tenant_id, emp_id, name, grade, status, default_line_id, created_at, updated_at)
        VALUES (${tenantId}, ${data.emp_id}, ${data.name}, ${data.grade ?? null}, ${data.status ?? 'ACTIVE'}, ${data.default_line_id ?? null}, NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateOperator(tenantId: number, id: number, data: {
  emp_id?: string;
  name?: string;
  grade?: string;
  status?: string;
  default_line_id?: number;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM factory_operators WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Operator not found");

  if (data.emp_id) {
    const dup = await db.execute(
      sql`SELECT id FROM factory_operators WHERE tenant_id = ${tenantId} AND emp_id = ${data.emp_id} AND id != ${id}`
    );
    if (dup.rows.length) throw new Error("Employee ID already exists for this tenant");
  }

  const result = await db.execute(
    sql`UPDATE factory_operators SET
        emp_id = COALESCE(${data.emp_id ?? null}, emp_id),
        name = COALESCE(${data.name ?? null}, name),
        grade = COALESCE(${data.grade ?? null}, grade),
        status = COALESCE(${data.status ?? null}, status),
        default_line_id = COALESCE(${data.default_line_id ?? null}, default_line_id),
        updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listOperatorSkills(tenantId: number, operatorId: number) {
  const result = await db.execute(
    sql`SELECT os.*, fo.name as operator_name, fo.emp_id
        FROM operator_skills os
        LEFT JOIN factory_operators fo ON fo.id = os.operator_id AND fo.tenant_id = os.tenant_id
        WHERE os.tenant_id = ${tenantId} AND os.operator_id = ${operatorId}
        ORDER BY os.op_code`
  );
  return result.rows;
}

export async function addSkill(tenantId: number, operatorId: number, data: {
  op_code: string;
  machine_type?: string;
  skill_level: number;
  speed_factor?: number;
  last_assessed_at?: string;
}) {
  if (data.skill_level < 1 || data.skill_level > 5) throw new Error("Skill level must be between 1 and 5");

  const existing = await db.execute(
    sql`SELECT id FROM operator_skills WHERE tenant_id = ${tenantId} AND operator_id = ${operatorId} AND op_code = ${data.op_code}`
  );
  if (existing.rows.length) throw new Error("Skill already exists for this operator and operation");

  const result = await db.execute(
    sql`INSERT INTO operator_skills (tenant_id, operator_id, op_code, machine_type, skill_level, speed_factor, last_assessed_at, created_at)
        VALUES (${tenantId}, ${operatorId}, ${data.op_code}, ${data.machine_type ?? null}, ${data.skill_level}, ${data.speed_factor ?? 1.0}, ${data.last_assessed_at ?? null}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateSkill(tenantId: number, skillId: number, data: {
  skill_level?: number;
  speed_factor?: number;
  machine_type?: string;
  last_assessed_at?: string;
}) {
  if (data.skill_level !== undefined && (data.skill_level < 1 || data.skill_level > 5)) {
    throw new Error("Skill level must be between 1 and 5");
  }

  const existing = await db.execute(
    sql`SELECT * FROM operator_skills WHERE id = ${skillId} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Skill not found");

  const result = await db.execute(
    sql`UPDATE operator_skills SET
        skill_level = COALESCE(${data.skill_level ?? null}, skill_level),
        speed_factor = COALESCE(${data.speed_factor ?? null}, speed_factor),
        machine_type = COALESCE(${data.machine_type ?? null}, machine_type),
        last_assessed_at = COALESCE(${data.last_assessed_at ?? null}, last_assessed_at)
        WHERE id = ${skillId} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listLineOperatorAssignments(tenantId: number, lineLoadId: number) {
  const result = await db.execute(
    sql`SELECT loa.*, fo.name as operator_name, fo.emp_id, fo.grade
        FROM line_operator_assignments loa
        LEFT JOIN factory_operators fo ON fo.id = loa.operator_id AND fo.tenant_id = loa.tenant_id
        WHERE loa.tenant_id = ${tenantId} AND loa.line_load_id = ${lineLoadId} AND loa.removed_at IS NULL
        ORDER BY loa.assigned_at`
  );
  return result.rows;
}

export async function assignOperatorToLine(tenantId: number, lineLoadId: number, operatorId: number, opCode: string) {
  const llResult = await db.execute(
    sql`SELECT id FROM line_loads WHERE id = ${lineLoadId} AND tenant_id = ${tenantId}`
  );
  if (!llResult.rows.length) throw new Error("Line load not found");

  const opResult = await db.execute(
    sql`SELECT id FROM factory_operators WHERE id = ${operatorId} AND tenant_id = ${tenantId}`
  );
  if (!opResult.rows.length) throw new Error("Operator not found");

  const existing = await db.execute(
    sql`SELECT id FROM line_operator_assignments
        WHERE tenant_id = ${tenantId} AND line_load_id = ${lineLoadId} AND operator_id = ${operatorId} AND assigned_op_code = ${opCode} AND removed_at IS NULL`
  );
  if (existing.rows.length) throw new Error("Operator already assigned to this operation on this line load");

  const result = await db.execute(
    sql`INSERT INTO line_operator_assignments (tenant_id, line_load_id, operator_id, assigned_op_code, assigned_at)
        VALUES (${tenantId}, ${lineLoadId}, ${operatorId}, ${opCode}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function removeOperatorFromLine(tenantId: number, assignmentId: number) {
  const existing = await db.execute(
    sql`SELECT * FROM line_operator_assignments WHERE id = ${assignmentId} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Assignment not found");
  if ((existing.rows[0] as any).removed_at) throw new Error("Assignment already removed");

  const result = await db.execute(
    sql`UPDATE line_operator_assignments SET removed_at = NOW()
        WHERE id = ${assignmentId} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function runLineBalance(tenantId: number, lineLoadId: number, userId: number) {
  const llResult = await db.execute(
    sql`SELECT * FROM line_loads WHERE id = ${lineLoadId} AND tenant_id = ${tenantId}`
  );
  if (!llResult.rows.length) throw new Error("Line load not found");
  const lineLoad = llResult.rows[0] as any;

  if (!lineLoad.ob_id) throw new Error("Line load has no operation bulletin assigned");

  const opsResult = await db.execute(
    sql`SELECT * FROM operation_bulletin_ops WHERE ob_id = ${lineLoad.ob_id} AND tenant_id = ${tenantId} ORDER BY sequence_no, op_no`
  );
  if (!opsResult.rows.length) throw new Error("No operations found in operation bulletin");
  const ops = opsResult.rows as any[];

  const assignmentsResult = await db.execute(
    sql`SELECT assigned_op_code, COUNT(*)::int as operator_count
        FROM line_operator_assignments
        WHERE tenant_id = ${tenantId} AND line_load_id = ${lineLoadId} AND removed_at IS NULL
        GROUP BY assigned_op_code`
  );
  const assignmentMap: Record<string, number> = {};
  for (const row of assignmentsResult.rows as any[]) {
    assignmentMap[row.assigned_op_code] = row.operator_count;
  }

  const totalOperatorsResult = await db.execute(
    sql`SELECT COUNT(DISTINCT operator_id)::int as count
        FROM line_operator_assignments
        WHERE tenant_id = ${tenantId} AND line_load_id = ${lineLoadId} AND removed_at IS NULL`
  );
  const operatorsCount = (totalOperatorsResult.rows[0] as any)?.count ?? 0;

  let totalSMV = 0;
  const opAnalysis: Array<{
    op_no: string;
    op_name: string;
    smv: number;
    assigned_count: number;
    cycle_time: number;
  }> = [];

  for (const op of ops) {
    const smv = parseFloat(op.smv) || 0;
    totalSMV += smv;
    const assignedCount = assignmentMap[op.op_no] || 1;
    const cycleTime = smv / assignedCount;
    opAnalysis.push({
      op_no: op.op_no,
      op_name: op.op_name,
      smv,
      assigned_count: assignedCount,
      cycle_time: Math.round(cycleTime * 10000) / 10000,
    });
  }

  const bottleneckCycleTime = Math.max(...opAnalysis.map(o => o.cycle_time));
  const bottleneckOps = opAnalysis.filter(o => o.cycle_time === bottleneckCycleTime);
  const predictedTargetPerHour = bottleneckCycleTime > 0 ? Math.round((60 / bottleneckCycleTime) * 100) / 100 : 0;

  const avgCycleTime = opAnalysis.reduce((sum, o) => sum + o.cycle_time, 0) / opAnalysis.length;
  const recommendations: Array<{ op_no: string; op_name: string; action: string; reason: string }> = [];

  for (const op of opAnalysis) {
    if (op.cycle_time > avgCycleTime * 1.2) {
      recommendations.push({
        op_no: op.op_no,
        op_name: op.op_name,
        action: "ADD_OPERATOR",
        reason: `Cycle time ${op.cycle_time.toFixed(4)} exceeds average ${avgCycleTime.toFixed(4)} by more than 20%`,
      });
    }
  }

  const runResult = await db.execute(
    sql`INSERT INTO line_balance_runs (tenant_id, line_load_id, run_date, total_smv, operators_count, predicted_target_per_hour, bottleneck_ops, recommendation, created_by, created_at)
        VALUES (${tenantId}, ${lineLoadId}, NOW()::date, ${totalSMV}, ${operatorsCount}, ${predictedTargetPerHour}, ${JSON.stringify(bottleneckOps)}::jsonb, ${JSON.stringify(recommendations)}::jsonb, ${userId}, NOW())
        RETURNING *`
  );

  return {
    run: runResult.rows[0],
    opAnalysis,
    bottleneckOps,
    predictedTargetPerHour,
    recommendations,
    totalSMV,
    operatorsCount,
  };
}

export async function listBalanceRuns(tenantId: number, lineLoadId: number) {
  const result = await db.execute(
    sql`SELECT lbr.*, u.username as created_by_name
        FROM line_balance_runs lbr
        LEFT JOIN users u ON u.id = lbr.created_by
        WHERE lbr.tenant_id = ${tenantId} AND lbr.line_load_id = ${lineLoadId}
        ORDER BY lbr.created_at DESC`
  );
  return result.rows;
}

export async function getSkillMatrix(tenantId: number, lineId?: number) {
  let operatorQuery = sql`SELECT fo.id, fo.emp_id, fo.name, fo.grade, fo.default_line_id
      FROM factory_operators fo
      WHERE fo.tenant_id = ${tenantId} AND fo.status = 'ACTIVE'`;
  if (lineId) operatorQuery = sql`${operatorQuery} AND fo.default_line_id = ${lineId}`;
  operatorQuery = sql`${operatorQuery} ORDER BY fo.emp_id`;

  const operatorsResult = await db.execute(operatorQuery);
  const operators = operatorsResult.rows as any[];

  if (!operators.length) return { operators: [], operations: [], matrix: [] };

  const operatorIds = operators.map(o => o.id);

  const skillsResult = await db.execute(
    sql`SELECT * FROM operator_skills WHERE tenant_id = ${tenantId} AND operator_id = ANY(${operatorIds})`
  );
  const skills = skillsResult.rows as any[];

  const opCodes = [...new Set(skills.map(s => s.op_code))].sort();

  const matrix = operators.map(op => {
    const opSkills = skills.filter(s => s.operator_id === op.id);
    const skillMap: Record<string, { skill_level: number; speed_factor: number }> = {};
    for (const s of opSkills) {
      skillMap[s.op_code] = { skill_level: s.skill_level, speed_factor: parseFloat(s.speed_factor) || 1.0 };
    }
    return {
      operator_id: op.id,
      emp_id: op.emp_id,
      name: op.name,
      grade: op.grade,
      skills: skillMap,
    };
  });

  return {
    operators: operators.map(o => ({ id: o.id, emp_id: o.emp_id, name: o.name, grade: o.grade })),
    operations: opCodes,
    matrix,
  };
}
