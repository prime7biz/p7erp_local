import { db } from "../db";
import { sql } from "drizzle-orm";

export async function listMarkerPlans(tenantId: number, filters?: { status?: string; style_id?: number }) {
  let query = sql`SELECT * FROM marker_plans WHERE tenant_id = ${tenantId}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  if (filters?.style_id) query = sql`${query} AND style_id = ${filters.style_id}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function getMarkerPlan(tenantId: number, id: number) {
  const planResult = await db.execute(
    sql`SELECT * FROM marker_plans WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!planResult.rows.length) throw new Error("Marker plan not found");

  const layPlansResult = await db.execute(
    sql`SELECT * FROM lay_plans WHERE marker_plan_id = ${id} AND tenant_id = ${tenantId} ORDER BY lay_no`
  );

  return { markerPlan: planResult.rows[0], layPlans: layPlansResult.rows };
}

export async function createMarkerPlan(tenantId: number, data: {
  style_id?: number;
  sales_order_id?: number;
  production_plan_id?: number;
  marker_ref: string;
  width?: number;
  gsm?: number;
  efficiency_pct?: number;
  size_ratio?: Record<string, any>;
  planned_pcs?: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO marker_plans (tenant_id, style_id, sales_order_id, production_plan_id, marker_ref, width, gsm, efficiency_pct, size_ratio, planned_pcs, status, created_at, updated_at)
        VALUES (${tenantId}, ${data.style_id ?? null}, ${data.sales_order_id ?? null}, ${data.production_plan_id ?? null}, ${data.marker_ref}, ${data.width ?? null}, ${data.gsm ?? null}, ${data.efficiency_pct ?? null}, ${data.size_ratio ? JSON.stringify(data.size_ratio) : null}::jsonb, ${data.planned_pcs ?? null}, 'DRAFT', NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function approveMarkerPlan(tenantId: number, id: number, userId: number) {
  const existing = await db.execute(
    sql`SELECT * FROM marker_plans WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Marker plan not found");
  if (existing.rows[0].status !== "DRAFT") throw new Error("Only DRAFT marker plans can be approved");

  const result = await db.execute(
    sql`UPDATE marker_plans SET status = 'APPROVED', approved_by = ${userId}, approved_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listLayPlans(tenantId: number, markerPlanId: number) {
  const result = await db.execute(
    sql`SELECT * FROM lay_plans WHERE marker_plan_id = ${markerPlanId} AND tenant_id = ${tenantId} ORDER BY lay_no`
  );
  return result.rows;
}

export async function createLayPlan(tenantId: number, data: {
  marker_plan_id: number;
  lay_no: string;
  plies?: number;
  planned_pcs?: number;
  fabric_roll_refs?: any[];
}) {
  const result = await db.execute(
    sql`INSERT INTO lay_plans (tenant_id, marker_plan_id, lay_no, plies, planned_pcs, actual_pcs, fabric_roll_refs, status, created_at, updated_at)
        VALUES (${tenantId}, ${data.marker_plan_id}, ${data.lay_no}, ${data.plies ?? null}, ${data.planned_pcs ?? null}, ${null}, ${data.fabric_roll_refs ? JSON.stringify(data.fabric_roll_refs) : null}::jsonb, 'DRAFT', NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function completeLayPlan(tenantId: number, id: number, actualPcs: number) {
  const existing = await db.execute(
    sql`SELECT * FROM lay_plans WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Lay plan not found");
  if (existing.rows[0].status !== "DRAFT") throw new Error("Only DRAFT lay plans can be completed");

  const result = await db.execute(
    sql`UPDATE lay_plans SET status = 'COMPLETED', actual_pcs = ${actualPcs}, updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listCuttingTickets(tenantId: number, layPlanId: number) {
  const result = await db.execute(
    sql`SELECT * FROM cutting_tickets WHERE lay_plan_id = ${layPlanId} AND tenant_id = ${tenantId} ORDER BY ticket_no`
  );
  return result.rows;
}

export async function createCuttingTicket(tenantId: number, data: {
  lay_plan_id: number;
  ticket_no: string;
  size: string;
  color: string;
  planned_qty: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO cutting_tickets (tenant_id, lay_plan_id, ticket_no, size, color, planned_qty, cut_qty, rejects_qty, status, created_at, updated_at)
        VALUES (${tenantId}, ${data.lay_plan_id}, ${data.ticket_no}, ${data.size}, ${data.color}, ${data.planned_qty}, ${0}, ${0}, 'OPEN', NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function closeCuttingTicket(tenantId: number, id: number, cutQty: number, rejectsQty: number) {
  const existing = await db.execute(
    sql`SELECT * FROM cutting_tickets WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Cutting ticket not found");
  if (existing.rows[0].status !== "OPEN") throw new Error("Only OPEN tickets can be closed");

  const result = await db.execute(
    sql`UPDATE cutting_tickets SET status = 'CLOSED', cut_qty = ${cutQty}, rejects_qty = ${rejectsQty}, updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listBundles(tenantId: number, filters?: { cutting_order_id?: number; stage?: string; line_id?: number }) {
  let query = sql`SELECT * FROM bundles WHERE tenant_id = ${tenantId}`;
  if (filters?.cutting_order_id) query = sql`${query} AND cutting_order_id = ${filters.cutting_order_id}`;
  if (filters?.stage) query = sql`${query} AND stage = ${filters.stage}`;
  if (filters?.line_id) query = sql`${query} AND line_id = ${filters.line_id}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function generateBundles(tenantId: number, ticketId: number, bundleSize: number) {
  const ticketResult = await db.execute(
    sql`SELECT * FROM cutting_tickets WHERE id = ${ticketId} AND tenant_id = ${tenantId}`
  );
  if (!ticketResult.rows.length) throw new Error("Cutting ticket not found");
  const ticket = ticketResult.rows[0] as any;

  if (!ticket.cut_qty || ticket.cut_qty <= 0) throw new Error("Ticket has no cut quantity to generate bundles from");

  const totalBundles = Math.ceil(ticket.cut_qty / bundleSize);
  const now = Date.now();
  const createdBundles: any[] = [];

  for (let seq = 1; seq <= totalBundles; seq++) {
    const isLast = seq === totalBundles;
    const remainder = ticket.cut_qty % bundleSize;
    const qty = isLast && remainder > 0 ? remainder : bundleSize;
    const bundleNo = `B-${ticketId}-${seq}`;
    const bundleUid = `UID-${tenantId}-${ticketId}-${seq}-${now}`;

    const result = await db.execute(
      sql`INSERT INTO bundles (tenant_id, cutting_order_id, bundle_no, bundle_uid, ticket_id, size, color, qty, good_qty, reject_qty, rework_qty, stage, created_at, updated_at)
          VALUES (${tenantId}, ${null}, ${bundleNo}, ${bundleUid}, ${ticketId}, ${ticket.size}, ${ticket.color}, ${qty}, ${0}, ${0}, ${0}, 'CUT', NOW(), NOW())
          RETURNING *`
    );
    createdBundles.push(result.rows[0]);
  }

  return createdBundles;
}

export async function listBundleIssues(tenantId: number, filters?: { production_plan_id?: number; status?: string; to_line_id?: number }) {
  let query = sql`SELECT * FROM bundle_issues WHERE tenant_id = ${tenantId}`;
  if (filters?.production_plan_id) query = sql`${query} AND production_plan_id = ${filters.production_plan_id}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  if (filters?.to_line_id) query = sql`${query} AND to_line_id = ${filters.to_line_id}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createBundleIssue(tenantId: number, data: {
  production_plan_id?: number;
  issue_no: string;
  from_dept: string;
  to_line_id: number;
  issue_date_time?: string;
}) {
  const result = await db.execute(
    sql`INSERT INTO bundle_issues (tenant_id, production_plan_id, issue_no, from_dept, to_line_id, issue_date_time, status, created_at)
        VALUES (${tenantId}, ${data.production_plan_id ?? null}, ${data.issue_no}, ${data.from_dept}, ${data.to_line_id}, ${data.issue_date_time ?? new Date().toISOString()}, 'DRAFT', NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function postBundleIssue(tenantId: number, id: number, userId: number, requestId: string) {
  const existingByRequest = await db.execute(
    sql`SELECT * FROM bundle_issues WHERE request_id = ${requestId} AND tenant_id = ${tenantId} AND status = 'POSTED'`
  );
  if (existingByRequest.rows.length) return existingByRequest.rows[0];

  const issueResult = await db.execute(
    sql`SELECT * FROM bundle_issues WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!issueResult.rows.length) throw new Error("Bundle issue not found");
  const issue = issueResult.rows[0] as any;
  if (issue.status !== "DRAFT") throw new Error("Only DRAFT issues can be posted");

  const linesResult = await db.execute(
    sql`SELECT bil.*, b.qty as bundle_qty
        FROM bundle_issue_lines bil
        JOIN bundles b ON b.id = bil.bundle_id AND b.tenant_id = bil.tenant_id
        WHERE bil.bundle_issue_id = ${id} AND bil.tenant_id = ${tenantId}`
  );

  if (!linesResult.rows.length) throw new Error("Bundle issue has no lines");

  for (const line of linesResult.rows as any[]) {
    const totalIssuedResult = await db.execute(
      sql`SELECT COALESCE(SUM(qty_issued), 0)::int as total_issued
          FROM bundle_issue_lines
          WHERE bundle_id = ${line.bundle_id} AND tenant_id = ${tenantId}`
    );
    const totalIssued = totalIssuedResult.rows[0]?.total_issued ?? 0;
    if (totalIssued > line.bundle_qty) {
      throw new Error(`Total qty_issued (${totalIssued}) exceeds bundle qty (${line.bundle_qty}) for bundle ${line.bundle_id}`);
    }
  }

  const result = await db.execute(
    sql`UPDATE bundle_issues SET status = 'POSTED', request_id = ${requestId}, posted_by = ${userId}, posted_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );

  const bundleIds = [...new Set((linesResult.rows as any[]).map(l => l.bundle_id))];
  for (const bundleId of bundleIds) {
    await db.execute(
      sql`UPDATE bundles SET stage = 'ISSUED', line_id = ${issue.to_line_id}, issued_at = NOW(), issued_by = ${userId}, updated_at = NOW()
          WHERE id = ${bundleId} AND tenant_id = ${tenantId}`
    );
  }

  return result.rows[0];
}

export async function addBundleIssueLine(tenantId: number, issueId: number, bundleId: number, qtyIssued: number) {
  const bundleResult = await db.execute(
    sql`SELECT * FROM bundles WHERE id = ${bundleId} AND tenant_id = ${tenantId}`
  );
  if (!bundleResult.rows.length) throw new Error("Bundle not found");
  const bundle = bundleResult.rows[0] as any;

  if (qtyIssued > bundle.qty) {
    throw new Error(`qty_issued (${qtyIssued}) exceeds bundle qty (${bundle.qty})`);
  }

  const result = await db.execute(
    sql`INSERT INTO bundle_issue_lines (tenant_id, bundle_issue_id, bundle_id, qty_issued)
        VALUES (${tenantId}, ${issueId}, ${bundleId}, ${qtyIssued})
        RETURNING *`
  );
  return result.rows[0];
}

export async function getCuttingDashboard(tenantId: number) {
  const today = new Date().toISOString().split("T")[0];

  const [markers, bundlesCutToday, issuedToday] = await Promise.all([
    db.execute(
      sql`SELECT COUNT(*)::int as count FROM marker_plans WHERE tenant_id = ${tenantId}`
    ),
    db.execute(
      sql`SELECT COUNT(*)::int as count FROM bundles WHERE tenant_id = ${tenantId} AND stage = 'CUT' AND created_at::date = ${today}::date`
    ),
    db.execute(
      sql`SELECT COUNT(*)::int as count FROM bundles WHERE tenant_id = ${tenantId} AND stage = 'ISSUED' AND issued_at::date = ${today}::date`
    ),
  ]);

  return {
    totalMarkers: markers.rows[0]?.count ?? 0,
    bundlesCutToday: bundlesCutToday.rows[0]?.count ?? 0,
    bundlesIssuedToday: issuedToday.rows[0]?.count ?? 0,
  };
}
