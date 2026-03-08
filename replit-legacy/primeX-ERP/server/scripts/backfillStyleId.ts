import { sql } from 'drizzle-orm';

export async function runBackfillStyleId(db: any) {
  let quotationsBackfilled = 0;
  let ordersBackfilled = 0;
  let inquiriesBackfilled = 0;
  let stylesCreated = 0;
  let deliveriesCreated = 0;

  console.log('[backfill] Starting styleId backfill...');

  // a) Backfill quotations.styleId
  try {
    const nullStyleQuotations = await db.execute(sql`
      SELECT id, tenant_id, customer_id, style_name
      FROM quotations
      WHERE style_id IS NULL AND style_name IS NOT NULL
    `);
    const quotationRows = nullStyleQuotations.rows || nullStyleQuotations;
    console.log(`[backfill] Found ${quotationRows.length} quotations with NULL styleId`);

    for (const q of quotationRows) {
      try {
        const existing = await db.execute(sql`
          SELECT id FROM styles
          WHERE tenant_id = ${q.tenant_id} AND style_no = ${q.style_name}
          LIMIT 1
        `);
        const existingRows = existing.rows || existing;

        let styleId: number;
        if (existingRows.length > 0) {
          styleId = existingRows[0].id;
        } else {
          const inserted = await db.execute(sql`
            INSERT INTO styles (tenant_id, buyer_id, style_no, status, is_active)
            VALUES (${q.tenant_id}, ${q.customer_id}, ${q.style_name}, 'ACTIVE', true)
            RETURNING id
          `);
          const insertedRows = inserted.rows || inserted;
          styleId = insertedRows[0].id;
          stylesCreated++;
          console.log(`[backfill] Created style '${q.style_name}' for tenant ${q.tenant_id}`);
        }

        await db.execute(sql`
          UPDATE quotations SET style_id = ${styleId} WHERE id = ${q.id}
        `);
        quotationsBackfilled++;
      } catch (err: any) {
        console.error(`[backfill] Error processing quotation ${q.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[backfill] Error fetching quotations:', err.message);
  }

  // b) Backfill orders.styleId
  try {
    const nullStyleOrders = await db.execute(sql`
      SELECT id, tenant_id, customer_id, style_name
      FROM orders
      WHERE style_id IS NULL AND style_name IS NOT NULL
    `);
    const orderRows = nullStyleOrders.rows || nullStyleOrders;
    console.log(`[backfill] Found ${orderRows.length} orders with NULL styleId`);

    for (const o of orderRows) {
      try {
        const existing = await db.execute(sql`
          SELECT id FROM styles
          WHERE tenant_id = ${o.tenant_id} AND style_no = ${o.style_name}
          LIMIT 1
        `);
        const existingRows = existing.rows || existing;

        let styleId: number;
        if (existingRows.length > 0) {
          styleId = existingRows[0].id;
        } else {
          const inserted = await db.execute(sql`
            INSERT INTO styles (tenant_id, buyer_id, style_no, status, is_active)
            VALUES (${o.tenant_id}, ${o.customer_id}, ${o.style_name}, 'ACTIVE', true)
            RETURNING id
          `);
          const insertedRows = inserted.rows || inserted;
          styleId = insertedRows[0].id;
          stylesCreated++;
          console.log(`[backfill] Created style '${o.style_name}' for tenant ${o.tenant_id}`);
        }

        await db.execute(sql`
          UPDATE orders SET style_id = ${styleId} WHERE id = ${o.id}
        `);
        ordersBackfilled++;
      } catch (err: any) {
        console.error(`[backfill] Error processing order ${o.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[backfill] Error fetching orders:', err.message);
  }

  // c) Backfill inquiries.styleId
  try {
    const nullStyleInquiries = await db.execute(sql`
      SELECT id, tenant_id, customer_id, style_name
      FROM inquiries
      WHERE style_id IS NULL AND style_name IS NOT NULL
    `);
    const inquiryRows = nullStyleInquiries.rows || nullStyleInquiries;
    console.log(`[backfill] Found ${inquiryRows.length} inquiries with NULL styleId`);

    for (const i of inquiryRows) {
      try {
        const existing = await db.execute(sql`
          SELECT id FROM styles
          WHERE tenant_id = ${i.tenant_id} AND style_no = ${i.style_name}
          LIMIT 1
        `);
        const existingRows = existing.rows || existing;

        let styleId: number;
        if (existingRows.length > 0) {
          styleId = existingRows[0].id;
        } else {
          const inserted = await db.execute(sql`
            INSERT INTO styles (tenant_id, buyer_id, style_no, status, is_active)
            VALUES (${i.tenant_id}, ${i.customer_id}, ${i.style_name}, 'ACTIVE', true)
            RETURNING id
          `);
          const insertedRows = inserted.rows || inserted;
          styleId = insertedRows[0].id;
          stylesCreated++;
          console.log(`[backfill] Created style '${i.style_name}' for tenant ${i.tenant_id}`);
        }

        await db.execute(sql`
          UPDATE inquiries SET style_id = ${styleId} WHERE id = ${i.id}
        `);
        inquiriesBackfilled++;
      } catch (err: any) {
        console.error(`[backfill] Error processing inquiry ${i.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[backfill] Error fetching inquiries:', err.message);
  }

  // d) Auto-create order_deliveries for existing orders
  try {
    const ordersWithoutDeliveries = await db.execute(sql`
      SELECT o.id, o.tenant_id, o.delivery_date
      FROM orders o
      WHERE NOT EXISTS (
        SELECT 1 FROM order_deliveries od
        WHERE od.order_id = o.id AND od.tenant_id = o.tenant_id
      )
    `);
    const deliveryRows = ordersWithoutDeliveries.rows || ordersWithoutDeliveries;
    console.log(`[backfill] Found ${deliveryRows.length} orders without delivery records`);

    for (const o of deliveryRows) {
      try {
        await db.execute(sql`
          INSERT INTO order_deliveries (tenant_id, order_id, delivery_no, ex_factory_date, ship_date, status)
          VALUES (${o.tenant_id}, ${o.id}, 1, ${o.delivery_date}, ${o.delivery_date}, 'PLANNED')
        `);
        deliveriesCreated++;
      } catch (err: any) {
        console.error(`[backfill] Error creating delivery for order ${o.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[backfill] Error fetching orders for deliveries:', err.message);
  }

  const summary = {
    quotationsBackfilled,
    ordersBackfilled,
    inquiriesBackfilled,
    stylesCreated,
    deliveriesCreated,
  };

  console.log('[backfill] Backfill complete:', summary);
  return summary;
}
