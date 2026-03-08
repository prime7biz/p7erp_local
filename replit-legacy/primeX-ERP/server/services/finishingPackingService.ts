import { db } from "../db";
import { sql } from "drizzle-orm";

export async function listFinishingBatches(tenantId: number, filters?: { status?: string; planId?: number }) {
  let query = sql`SELECT * FROM finishing_batches WHERE tenant_id = ${tenantId}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  if (filters?.planId) query = sql`${query} AND production_plan_id = ${filters.planId}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createFinishingBatch(tenantId: number, data: {
  production_plan_id?: number;
  sales_order_id?: number;
  style_id?: number;
  batch_no: string;
  created_by: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO finishing_batches (tenant_id, production_plan_id, sales_order_id, style_id, batch_no, status, created_by, created_at, updated_at)
        VALUES (${tenantId}, ${data.production_plan_id ?? null}, ${data.sales_order_id ?? null}, ${data.style_id ?? null}, ${data.batch_no}, 'DRAFT', ${data.created_by}, NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function activateFinishingBatch(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM finishing_batches WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Finishing batch not found");
  if (existing.rows[0].status !== "DRAFT") throw new Error("Only DRAFT batches can be activated");

  const result = await db.execute(
    sql`UPDATE finishing_batches SET status = 'ACTIVE', updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function completeFinishingBatch(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM finishing_batches WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Finishing batch not found");
  if (existing.rows[0].status !== "ACTIVE") throw new Error("Only ACTIVE batches can be completed");

  const result = await db.execute(
    sql`UPDATE finishing_batches SET status = 'COMPLETED', updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listFinishingEntries(tenantId: number, batchId: number) {
  const result = await db.execute(
    sql`SELECT * FROM finishing_entries WHERE tenant_id = ${tenantId} AND finishing_batch_id = ${batchId} ORDER BY entry_date DESC, hour_slot`
  );
  return result.rows;
}

export async function createFinishingEntry(tenantId: number, data: {
  finishing_batch_id: number;
  entry_date: string;
  hour_slot: number;
  shift_id?: number;
  good_qty: number;
  rework_qty?: number;
  reject_qty?: number;
  remarks?: string;
  entered_by: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO finishing_entries (tenant_id, finishing_batch_id, entry_date, hour_slot, shift_id, good_qty, rework_qty, reject_qty, remarks, entered_by, created_at)
        VALUES (${tenantId}, ${data.finishing_batch_id}, ${data.entry_date}, ${data.hour_slot}, ${data.shift_id ?? null}, ${data.good_qty}, ${data.rework_qty ?? 0}, ${data.reject_qty ?? 0}, ${data.remarks ?? null}, ${data.entered_by}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function listPackingBatches(tenantId: number, filters?: { status?: string; planId?: number }) {
  let query = sql`SELECT * FROM packing_batches WHERE tenant_id = ${tenantId}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  if (filters?.planId) query = sql`${query} AND production_plan_id = ${filters.planId}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createPackingBatch(tenantId: number, data: {
  production_plan_id?: number;
  sales_order_id?: number;
  style_id?: number;
  batch_no: string;
}) {
  const result = await db.execute(
    sql`INSERT INTO packing_batches (tenant_id, production_plan_id, sales_order_id, style_id, batch_no, status, created_at, updated_at)
        VALUES (${tenantId}, ${data.production_plan_id ?? null}, ${data.sales_order_id ?? null}, ${data.style_id ?? null}, ${data.batch_no}, 'DRAFT', NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function activatePackingBatch(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM packing_batches WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Packing batch not found");
  if (existing.rows[0].status !== "DRAFT") throw new Error("Only DRAFT batches can be activated");

  const result = await db.execute(
    sql`UPDATE packing_batches SET status = 'ACTIVE', updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function completePackingBatch(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM packing_batches WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Packing batch not found");
  if (existing.rows[0].status !== "ACTIVE") throw new Error("Only ACTIVE batches can be completed");

  const result = await db.execute(
    sql`UPDATE packing_batches SET status = 'COMPLETED', updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listPackUnits(tenantId: number, batchId: number) {
  const result = await db.execute(
    sql`SELECT * FROM pack_units WHERE tenant_id = ${tenantId} AND packing_batch_id = ${batchId} ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function addPackUnit(tenantId: number, data: {
  packing_batch_id: number;
  size: string;
  color: string;
  qty_packed: number;
  qty_rework?: number;
  qty_rejected?: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO pack_units (tenant_id, packing_batch_id, size, color, qty_packed, qty_rework, qty_rejected, created_at)
        VALUES (${tenantId}, ${data.packing_batch_id}, ${data.size}, ${data.color}, ${data.qty_packed}, ${data.qty_rework ?? 0}, ${data.qty_rejected ?? 0}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function listCartons(tenantId: number, filters?: { packing_batch_id?: number; status?: string }) {
  let query = sql`SELECT * FROM cartons WHERE tenant_id = ${tenantId}`;
  if (filters?.packing_batch_id) query = sql`${query} AND packing_batch_id = ${filters.packing_batch_id}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createCarton(tenantId: number, data: {
  packing_batch_id: number;
  carton_no: string;
  gross_weight?: number;
  net_weight?: number;
  cbm?: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO cartons (tenant_id, packing_batch_id, carton_no, gross_weight, net_weight, cbm, status, created_at, updated_at)
        VALUES (${tenantId}, ${data.packing_batch_id}, ${data.carton_no}, ${data.gross_weight ?? null}, ${data.net_weight ?? null}, ${data.cbm ?? null}, 'OPEN', NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function addCartonLine(tenantId: number, cartonId: number, data: {
  size: string;
  color: string;
  qty: number;
}) {
  const carton = await db.execute(
    sql`SELECT * FROM cartons WHERE id = ${cartonId} AND tenant_id = ${tenantId}`
  );
  if (!carton.rows.length) throw new Error("Carton not found");
  if (carton.rows[0].status === "SEALED") throw new Error("Cannot add lines to a sealed carton");

  const result = await db.execute(
    sql`INSERT INTO carton_lines (tenant_id, carton_id, size, color, qty, created_at)
        VALUES (${tenantId}, ${cartonId}, ${data.size}, ${data.color}, ${data.qty}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function listCartonLines(tenantId: number, cartonId: number) {
  const result = await db.execute(
    sql`SELECT * FROM carton_lines WHERE tenant_id = ${tenantId} AND carton_id = ${cartonId} ORDER BY created_at`
  );
  return result.rows;
}

export async function sealCarton(tenantId: number, id: number, userId: number) {
  const existing = await db.execute(
    sql`SELECT * FROM cartons WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Carton not found");
  if (existing.rows[0].status === "SEALED") throw new Error("Carton is already sealed");

  const result = await db.execute(
    sql`UPDATE cartons SET status = 'SEALED', sealed_by = ${userId}, sealed_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function reopenCarton(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM cartons WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Carton not found");

  const result = await db.execute(
    sql`UPDATE cartons SET status = 'OPEN', sealed_by = ${null}, sealed_at = ${null}, updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listPackingLists(tenantId: number, filters?: { status?: string; salesOrderId?: number; shipmentId?: number }) {
  let query = sql`SELECT * FROM packing_lists WHERE tenant_id = ${tenantId}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  if (filters?.salesOrderId) query = sql`${query} AND sales_order_id = ${filters.salesOrderId}`;
  if (filters?.shipmentId) query = sql`${query} AND shipment_id = ${filters.shipmentId}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createPackingList(tenantId: number, data: {
  shipment_id?: number;
  packing_list_no: string;
  sales_order_id?: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO packing_lists (tenant_id, shipment_id, packing_list_no, sales_order_id, total_cartons, total_qty, status, created_at, updated_at)
        VALUES (${tenantId}, ${data.shipment_id ?? null}, ${data.packing_list_no}, ${data.sales_order_id ?? null}, 0, 0, 'DRAFT', NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function addCartonToPackingList(tenantId: number, packingListId: number, cartonId: number) {
  const duplicate = await db.execute(
    sql`SELECT id FROM packing_list_cartons WHERE tenant_id = ${tenantId} AND packing_list_id = ${packingListId} AND carton_id = ${cartonId}`
  );
  if (duplicate.rows.length) throw new Error("Carton is already added to this packing list");

  const result = await db.execute(
    sql`INSERT INTO packing_list_cartons (tenant_id, packing_list_id, carton_id, created_at)
        VALUES (${tenantId}, ${packingListId}, ${cartonId}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function issuePackingList(tenantId: number, id: number, userId: number) {
  const existing = await db.execute(
    sql`SELECT * FROM packing_lists WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Packing list not found");
  if (existing.rows[0].status === "ISSUED") throw new Error("Packing list is already issued");

  const totals = await db.execute(
    sql`SELECT COUNT(DISTINCT plc.carton_id)::int as total_cartons, COALESCE(SUM(cl.qty), 0)::int as total_qty
        FROM packing_list_cartons plc
        LEFT JOIN carton_lines cl ON cl.carton_id = plc.carton_id AND cl.tenant_id = plc.tenant_id
        WHERE plc.packing_list_id = ${id} AND plc.tenant_id = ${tenantId}`
  );

  const totalCartons = totals.rows[0]?.total_cartons ?? 0;
  const totalQty = totals.rows[0]?.total_qty ?? 0;

  const result = await db.execute(
    sql`UPDATE packing_lists SET status = 'ISSUED', issued_by = ${userId}, issued_at = NOW(), total_cartons = ${totalCartons}, total_qty = ${totalQty}, updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function getFinishingPackingDashboard(tenantId: number) {
  const today = new Date().toISOString().split("T")[0];

  const [finishingOutput, packingOutput, cartonsSealed, packingListsIssued] = await Promise.all([
    db.execute(
      sql`SELECT COALESCE(SUM(good_qty), 0)::int as total_good, COALESCE(SUM(rework_qty), 0)::int as total_rework, COALESCE(SUM(reject_qty), 0)::int as total_reject
          FROM finishing_entries WHERE tenant_id = ${tenantId} AND entry_date = ${today}`
    ),
    db.execute(
      sql`SELECT COALESCE(SUM(qty_packed), 0)::int as total_packed, COALESCE(SUM(qty_rework), 0)::int as total_rework, COALESCE(SUM(qty_rejected), 0)::int as total_rejected
          FROM pack_units WHERE tenant_id = ${tenantId} AND created_at::date = ${today}`
    ),
    db.execute(
      sql`SELECT COUNT(*)::int as count FROM cartons WHERE tenant_id = ${tenantId} AND status = 'SEALED' AND sealed_at::date = ${today}`
    ),
    db.execute(
      sql`SELECT COUNT(*)::int as count FROM packing_lists WHERE tenant_id = ${tenantId} AND status = 'ISSUED' AND issued_at::date = ${today}`
    ),
  ]);

  return {
    finishingOutputToday: {
      good: finishingOutput.rows[0]?.total_good ?? 0,
      rework: finishingOutput.rows[0]?.total_rework ?? 0,
      reject: finishingOutput.rows[0]?.total_reject ?? 0,
    },
    packingOutputToday: {
      packed: packingOutput.rows[0]?.total_packed ?? 0,
      rework: packingOutput.rows[0]?.total_rework ?? 0,
      rejected: packingOutput.rows[0]?.total_rejected ?? 0,
    },
    cartonsSealedToday: cartonsSealed.rows[0]?.count ?? 0,
    packingListsIssuedToday: packingListsIssued.rows[0]?.count ?? 0,
  };
}
