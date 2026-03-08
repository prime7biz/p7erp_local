import { db } from '../server/db';
import { sql } from 'drizzle-orm';

const TENANT_ID = 1;
const SUPER_USER_ID = 1;

async function seedFullSystem() {
  console.log('=== Prime7 ERP Full System Seed ===\n');

  console.log('[A] Seeding additional master data...');

  await db.execute(sql`
    INSERT INTO currencies (code, name, symbol, tenant_id)
    VALUES ('EUR', 'Euro', '€', ${TENANT_ID}),
           ('GBP', 'British Pound', '£', ${TENANT_ID})
    ON CONFLICT DO NOTHING
  `);

  const custResult = await db.execute(sql`
    INSERT INTO customers (customer_id, customer_name, country, contact_person, email, phone, is_active, tenant_id, industry_segment, payment_terms)
    VALUES 
      ('CUST-HM001', 'H&M Hennes & Mauritz AB', 'Sweden', 'Erik Johansson', 'erik.j@hm.com', '+46-8-796-5500', true, ${TENANT_ID}, 'Fashion Retail', 'LC at Sight'),
      ('CUST-ZR001', 'Inditex Zara', 'Spain', 'Carlos Martinez', 'carlos.m@inditex.com', '+34-981-185-400', true, ${TENANT_ID}, 'Fashion Retail', 'LC 90 Days'),
      ('CUST-NX001', 'Next PLC', 'United Kingdom', 'James Thompson', 'james.t@next.co.uk', '+44-116-284-8000', true, ${TENANT_ID}, 'Fashion Retail', 'LC 60 Days')
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  console.log(`  Customers: ${custResult.rowCount} added`);

  const vendResult = await db.execute(sql`
    INSERT INTO vendors (vendor_code, vendor_name, vendor_type, contact_person, email, phone, country, is_active, tenant_id, payment_terms)
    VALUES
      ('VND-NMN01', 'Noman Group (Fabrics)', 'manufacturer', 'Md. Noman', 'noman@nomangroup.com', '+880-2-8836777', 'Bangladesh', true, ${TENANT_ID}, 'BTB LC 120 Days'),
      ('VND-YKK01', 'YKK Bangladesh Ltd', 'manufacturer', 'Tanaka San', 'tanaka@ykk.com.bd', '+880-2-8921234', 'Bangladesh', true, ${TENANT_ID}, 'BTB LC 90 Days'),
      ('VND-HME01', 'Hameem Group Accessories', 'manufacturer', 'Md. Hameem', 'hameem@hameemgroup.com', '+880-2-7745566', 'Bangladesh', true, ${TENANT_ID}, 'Cash'),
      ('VND-STC01', 'Star Composite Packaging', 'manufacturer', 'Rafiq Uddin', 'rafiq@starcomposite.com', '+880-2-9012345', 'Bangladesh', true, ${TENANT_ID}, 'Credit 30 Days'),
      ('VND-EPY01', 'Epyllion Group Trims', 'manufacturer', 'Saiful Islam', 'saiful@epyllion.com', '+880-2-8867890', 'Bangladesh', true, ${TENANT_ID}, 'Credit 60 Days')
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  console.log(`  Vendors: ${vendResult.rowCount} added`);

  await db.execute(sql`
    INSERT INTO item_categories (category_id, name, description, tenant_id)
    VALUES 
      ('CAT-RM', 'Raw Materials', 'All raw materials for manufacturing', ${TENANT_ID}),
      ('CAT-WIP', 'Work In Progress', 'Semi-finished goods', ${TENANT_ID}),
      ('CAT-CONS', 'Consumables', 'Factory consumables', ${TENANT_ID})
    ON CONFLICT DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO item_units (unit_code, name, tenant_id)
    VALUES 
      ('ROLL', 'Roll', ${TENANT_ID}),
      ('SET', 'Set', ${TENANT_ID}),
      ('GRS', 'Gross', ${TENANT_ID}),
      ('CTN', 'Carton', ${TENANT_ID}),
      ('CONE', 'Cone', ${TENANT_ID})
    ON CONFLICT DO NOTHING
  `);

  const units = await db.execute(sql`SELECT id, name FROM item_units WHERE tenant_id=${TENANT_ID}`);
  const unitMap: Record<string, number> = {};
  for (const u of units.rows as any[]) unitMap[u.name] = u.id;

  const cats = await db.execute(sql`SELECT id, name FROM item_categories WHERE tenant_id=${TENANT_ID}`);
  const catMap: Record<string, number> = {};
  for (const c of cats.rows as any[]) catMap[c.name] = c.id;

  const fabricCat = catMap['Fabric'] || catMap['Fabrics'] || catMap['Raw Materials'];
  const trimCat = catMap['Trims'] || catMap['Accessories'];
  const pkgCat = catMap['Packaging'];
  const mtrUnit = unitMap['Meter'];
  const yrdUnit = unitMap['Yard'];
  const pcUnit = unitMap['Piece'];
  const kgUnit = unitMap['Kilogram'];
  const coneUnit = unitMap['Cone'];

  await db.execute(sql`
    INSERT INTO items (item_code, name, description, category_id, unit_id, type, is_active, is_stockable, cost_method, default_cost, tenant_id)
    VALUES
      ('FAB-CTN-TWILL', 'Cotton Twill 58"', '100% Cotton Twill 58 inch width, 200 GSM', ${fabricCat}, ${yrdUnit}, 'raw_material', true, true, 'weighted_average', 350.00, ${TENANT_ID}),
      ('FAB-PCTC-44', 'Poly-Cotton Blend 44"', '60/40 Poly Cotton, 44 inch width', ${fabricCat}, ${yrdUnit}, 'raw_material', true, true, 'weighted_average', 280.00, ${TENANT_ID}),
      ('FAB-JRSY-180', 'Cotton Jersey 180GSM', '100% Cotton Single Jersey, 180 GSM tubular', ${fabricCat}, ${kgUnit}, 'raw_material', true, true, 'weighted_average', 520.00, ${TENANT_ID}),
      ('FAB-RIB-1X1', 'Cotton Rib 1x1', '100% Cotton Rib 1x1 for collar/cuff', ${fabricCat}, ${kgUnit}, 'raw_material', true, true, 'weighted_average', 580.00, ${TENANT_ID}),
      ('TRM-INTLN-01', 'Fusible Interlining', 'Woven fusible interlining for collar', ${trimCat}, ${mtrUnit}, 'raw_material', true, true, 'weighted_average', 45.00, ${TENANT_ID}),
      ('TRM-ELSTC-25', 'Elastic Band 25mm', 'Woven elastic band 25mm width', ${trimCat}, ${mtrUnit}, 'raw_material', true, true, 'weighted_average', 12.00, ${TENANT_ID}),
      ('TRM-THRDS-40', 'Sewing Thread 40/2', 'Polyester sewing thread 40/2 5000m cone', ${trimCat}, ${coneUnit}, 'raw_material', true, true, 'weighted_average', 85.00, ${TENANT_ID}),
      ('TRM-HTAG-01', 'Hang Tags', 'Printed hang tags with string', ${trimCat}, ${pcUnit}, 'raw_material', true, true, 'weighted_average', 3.50, ${TENANT_ID}),
      ('TRM-WLBL-01', 'Woven Labels', 'Brand woven labels for garments', ${trimCat}, ${pcUnit}, 'raw_material', true, true, 'weighted_average', 2.80, ${TENANT_ID}),
      ('TRM-PRTLBL-01', 'Printed Care Labels', 'Printed care/wash labels', ${trimCat}, ${pcUnit}, 'raw_material', true, true, 'weighted_average', 1.50, ${TENANT_ID}),
      ('TRM-STCK-01', 'Price Stickers', 'Barcode price stickers', ${trimCat}, ${pcUnit}, 'raw_material', true, true, 'weighted_average', 0.80, ${TENANT_ID}),
      ('PKG-TISSUE-01', 'Tissue Paper', 'Acid-free tissue paper for folding', ${pkgCat}, ${pcUnit}, 'raw_material', true, true, 'weighted_average', 2.00, ${TENANT_ID}),
      ('PKG-HANGER-01', 'Plastic Hangers', 'Standard plastic hangers', ${pkgCat}, ${pcUnit}, 'raw_material', true, true, 'weighted_average', 8.00, ${TENANT_ID}),
      ('PKG-COLLAR-01', 'Collar Inserts', 'Cardboard collar butterfly inserts', ${pkgCat}, ${pcUnit}, 'raw_material', true, true, 'weighted_average', 1.20, ${TENANT_ID})
    ON CONFLICT DO NOTHING
  `);
  console.log('  Additional items seeded');

  await db.execute(sql`
    INSERT INTO departments (name, code, description, tenant_id)
    VALUES 
      ('Merchandising', 'MERCH', 'Merchandising & Sourcing Department', ${TENANT_ID}),
      ('Store', 'STORE', 'Store & Inventory Department', ${TENANT_ID}),
      ('Commercial', 'COMM', 'Commercial & LC Department', ${TENANT_ID}),
      ('Admin', 'ADMIN', 'Admin Department', ${TENANT_ID}),
      ('Finance', 'FIN', 'Finance & Accounts Department', ${TENANT_ID})
    ON CONFLICT DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO employees (employee_id, first_name, last_name, email, phone, department, designation, join_date, is_active, tenant_id)
    VALUES
      ('EMP-0011', 'Abdul', 'Karim', 'abdul.karim@lakshma.com', '01711111111', 'Merchandising', 'Senior Merchandiser', '2023-03-15', true, ${TENANT_ID}),
      ('EMP-0012', 'Salma', 'Akter', 'salma.akter@lakshma.com', '01722222222', 'Store', 'Store Keeper', '2023-06-01', true, ${TENANT_ID}),
      ('EMP-0013', 'Jahangir', 'Alam', 'jahangir.alam@lakshma.com', '01733333333', 'Commercial', 'LC Manager', '2022-01-10', true, ${TENANT_ID}),
      ('EMP-0014', 'Nusrat', 'Jahan', 'nusrat.jahan@lakshma.com', '01744444444', 'Admin', 'Admin Officer', '2024-02-01', true, ${TENANT_ID})
    ON CONFLICT DO NOTHING
  `);
  console.log('  Additional employees seeded');

  console.log('[B] Using existing COA accounts (already rich set in database)...');

  console.log('[C] Seeding inquiries, quotations, and orders...');

  const customers = await db.execute(sql`SELECT id, customer_name FROM customers WHERE tenant_id=${TENANT_ID}`);
  const custMap: Record<string, number> = {};
  for (const c of customers.rows as any[]) custMap[c.customer_name] = c.id;

  const hmId = custMap['H&M Hennes & Mauritz AB'] || custMap['Primark Holdings'] || (customers.rows[0] as any)?.id || 1;
  const zaraId = custMap['Inditex Zara'] || custMap['Inditex Group'] || (customers.rows[1] as any)?.id || 2;
  const nextId = custMap['Next PLC'] || custMap['Scanwear'] || (customers.rows[2] as any)?.id || 3;

  const maxInqId = await db.execute(sql`SELECT COALESCE(MAX(CAST(SUBSTRING(inquiry_id FROM '[0-9]+$') AS INTEGER)), 9) as max_num FROM inquiries WHERE tenant_id=${TENANT_ID}`);
  const nextInqNum = ((maxInqId.rows[0] as any)?.max_num || 9) + 1;

  await db.execute(sql`
    INSERT INTO inquiries (inquiry_id, customer_id, style_name, inquiry_type, department, projected_quantity, projected_delivery_date, target_price, status, season_year, brand, material_composition, size_range, currency, tenant_id, created_at)
    VALUES
      (${`INQ-${String(nextInqNum).padStart(5, '0')}`}, ${hmId}, 'HM-POLO-2026 Mens Polo T-Shirt', 'knit', 'Knit', 10000, '2026-08-15', 8.50, 'new', 'SS2026', 'H&M', '100% Cotton Single Jersey 180GSM', 'S-M-L-XL', 'USD', ${TENANT_ID}, NOW()),
      (${`INQ-${String(nextInqNum + 1).padStart(5, '0')}`}, ${zaraId}, 'ZR-DENIM-2026 Ladies Denim Jacket', 'woven', 'Woven', 5000, '2026-09-20', 22.00, 'new', 'AW2026', 'Zara', '12oz Indigo Denim 100% Cotton', 'XS-S-M-L-XL', 'USD', ${TENANT_ID}, NOW()),
      (${`INQ-${String(nextInqNum + 2).padStart(5, '0')}`}, ${nextId}, 'NX-HOOD-2026 Kids Hoodie', 'knit', 'Knit', 8000, '2026-07-30', 12.00, 'new', 'AW2026', 'Next', '80/20 Cotton Poly Fleece 280GSM', '4Y-6Y-8Y-10Y-12Y', 'USD', ${TENANT_ID}, NOW())
    ON CONFLICT DO NOTHING
    RETURNING id
  `);

  const maxOrdId = await db.execute(sql`SELECT COALESCE(MAX(CAST(SUBSTRING(order_id FROM '[0-9]+$') AS INTEGER)), 12) as max_num FROM orders WHERE tenant_id=${TENANT_ID}`);
  const nextOrdNum = ((maxOrdId.rows[0] as any)?.max_num || 12) + 1;

  const orderIds = await db.execute(sql`
    INSERT INTO orders (order_id, tenant_id, customer_id, style_name, department, total_quantity, delivery_date, delivery_mode, delivery_port, payment_terms, order_status, price_confirmed, currency, exchange_rate, base_amount, notes, created_by, created_at)
    VALUES
      (${`ORD-${String(nextOrdNum).padStart(5, '0')}`}, ${TENANT_ID}, ${hmId}, 'HM-POLO-2026 Mens Polo T-Shirt', 'Knit', 10000, '2026-08-15', 'Sea', 'Rotterdam, Netherlands', 'LC at Sight', 'confirmed', 8.50, 'USD', 110.00, 935000.00, 'H&M SS2026 Polo order - 10K pcs, 4 colors, FOB Chittagong', ${SUPER_USER_ID}, NOW()),
      (${`ORD-${String(nextOrdNum + 1).padStart(5, '0')}`}, ${TENANT_ID}, ${zaraId}, 'ZR-DENIM-2026 Ladies Denim Jacket', 'Woven', 5000, '2026-09-20', 'Sea', 'Barcelona, Spain', 'LC 90 Days', 'confirmed', 22.00, 'USD', 110.00, 1210000.00, 'Zara AW2026 Denim Jacket - 5K pcs, 3 washes, FOB Chittagong', ${SUPER_USER_ID}, NOW()),
      (${`ORD-${String(nextOrdNum + 2).padStart(5, '0')}`}, ${TENANT_ID}, ${nextId}, 'NX-HOOD-2026 Kids Hoodie', 'Knit', 8000, '2026-07-30', 'Sea', 'Felixstowe, UK', 'LC 60 Days', 'confirmed', 12.00, 'USD', 110.00, 1056000.00, 'Next AW2026 Kids Hoodie - 8K pcs, 5 sizes, FOB Chittagong', ${SUPER_USER_ID}, NOW())
    ON CONFLICT DO NOTHING
    RETURNING id, order_id
  `);
  const newOrders = orderIds.rows as any[];
  console.log(`  Orders created: ${newOrders.length}`);

  console.log('[D] Seeding export cases and proforma invoices...');
  
  if (newOrders.length >= 2) {
    await db.execute(sql`
      INSERT INTO export_cases (export_case_number, tenant_id, buyer_id, status, total_value, currency, notes, created_by, created_at)
      VALUES
        ('EC-2026-001', ${TENANT_ID}, ${hmId}, 'active', 85000.00, 'USD', 'H&M SS2026 Polo Export - 10,000 pcs', ${SUPER_USER_ID}, NOW()),
        ('EC-2026-002', ${TENANT_ID}, ${zaraId}, 'active', 110000.00, 'USD', 'Zara AW2026 Denim Export - 5,000 pcs', ${SUPER_USER_ID}, NOW())
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const ecases = await db.execute(sql`SELECT id, export_case_number FROM export_cases WHERE tenant_id=${TENANT_ID} ORDER BY id DESC LIMIT 2`);
    const ecList = (ecases.rows as any[]).reverse();

    if (ecList.length >= 2) {
      const ec1Id = ecList[0]?.id;
      const ec2Id = ecList[1]?.id;

      await db.execute(sql`
        INSERT INTO proforma_invoices (pi_number, tenant_id, order_id, customer_id, issue_date, validity_date, currency, subtotal, total_amount, payment_terms, delivery_terms)
        VALUES
          ('PI-2026-001', ${TENANT_ID}, ${newOrders[0]?.id}, ${hmId}, '2026-03-15', '2026-04-30', 'USD', 85000.00, 85000.00, 'Irrevocable LC at Sight', 'FOB Chittagong'),
          ('PI-2026-002', ${TENANT_ID}, ${newOrders[1]?.id}, ${zaraId}, '2026-03-20', '2026-05-15', 'USD', 110000.00, 110000.00, 'Irrevocable LC 90 Days', 'FOB Chittagong')
        ON CONFLICT DO NOTHING
      `);

      await db.execute(sql`
        INSERT INTO commercial_lcs (lc_number, tenant_id, lc_type, bank_name, applicant, beneficiary, lc_value, currency, issue_date, expiry_date, status, remarks, created_by, created_at)
        VALUES
          ('HM-LC-2026-001', ${TENANT_ID}, 'irrevocable', 'SEB Bank Sweden / Standard Chartered BD', 'H&M Hennes & Mauritz AB', 'Lakshma Apparels Ltd', 85000.00, 'USD', '2026-04-01', '2026-09-30', 'active', 'Master LC for H&M Polo order', ${SUPER_USER_ID}, NOW()),
          ('ZR-LC-2026-001', ${TENANT_ID}, 'irrevocable', 'Santander Spain / Trust Bank BD', 'Inditex Group', 'Lakshma Apparels Ltd', 110000.00, 'USD', '2026-04-15', '2026-10-31', 'active', 'Master LC for Zara Denim order', ${SUPER_USER_ID}, NOW())
        ON CONFLICT DO NOTHING
      `);

      const lcs = await db.execute(sql`SELECT id, lc_number FROM commercial_lcs WHERE tenant_id=${TENANT_ID} ORDER BY id DESC LIMIT 2`);
      const lcList = (lcs.rows as any[]).reverse();
      const masterLc1 = lcList[0]?.id;

      const bankAccts = await db.execute(sql`SELECT id FROM bank_accounts WHERE tenant_id=${TENANT_ID} LIMIT 1`);
      const bankAcctId = (bankAccts.rows[0] as any)?.id;

      await db.execute(sql`
        INSERT INTO btb_lcs (btb_lc_number, tenant_id, export_case_id, master_lc_id, supplier_id, bank_account_id, amount, currency, open_date, expiry_date, maturity_date, status, remarks, created_at)
        VALUES
          ('BTB-2026-001', ${TENANT_ID}, ${ec1Id}, ${masterLc1}, ${null}, ${bankAcctId}, 35000.00, 'USD', '2026-04-10', '2026-10-10', '2026-10-10', 'active', 'BTB for Noman Group fabric - Cotton Jersey 18K KG', NOW()),
          ('BTB-2026-002', ${TENANT_ID}, ${ec1Id}, ${masterLc1}, ${null}, ${bankAcctId}, 8000.00, 'USD', '2026-04-12', '2026-10-12', '2026-10-12', 'active', 'BTB for YKK - Zippers 10K + Buttons 20K', NOW()),
          ('BTB-2026-003', ${TENANT_ID}, ${ec2Id}, ${null}, ${null}, ${bankAcctId}, 55000.00, 'USD', '2026-04-20', '2026-11-20', '2026-11-20', 'active', 'BTB for denim fabric - 12oz Indigo 10K YDS', NOW())
        ON CONFLICT DO NOTHING
      `);
      console.log('  Export cases, PIs, LCs, BTB LCs seeded');
    }
  }

  console.log('[E] Seeding purchase orders...');
  
  const vendors = await db.execute(sql`SELECT id, vendor_name FROM vendors WHERE tenant_id=${TENANT_ID}`);
  const vendMap: Record<string, number> = {};
  for (const v of vendors.rows as any[]) vendMap[v.vendor_name] = v.id;

  const nomanId = vendMap['Noman Group (Fabrics)'] || vendMap['ABC Textile Mills Ltd'] || (vendors.rows[0] as any)?.id || 1;
  const ykkId = vendMap['YKK Bangladesh Ltd'] || vendMap['Prime Accessories Ltd'] || (vendors.rows[1] as any)?.id || 2;
  const hameemId = vendMap['Hameem Group Accessories'] || nomanId;

  const items = await db.execute(sql`SELECT id, item_code, name FROM items WHERE tenant_id=${TENANT_ID}`);
  const itemMap: Record<string, number> = {};
  for (const i of items.rows as any[]) itemMap[i.item_code] = i.id;

  const whs = await db.execute(sql`SELECT id, name FROM warehouses WHERE tenant_id=${TENANT_ID}`);
  const whMap: Record<string, number> = {};
  for (const w of whs.rows as any[]) whMap[w.name] = w.id;
  const rmWhId = whMap['Main Raw Materials Warehouse'] || whMap['FABRIC'] || (whs.rows[0] as any)?.id || 1;
  const fgWhId = whMap['Finished Goods Warehouse'] || (whs.rows[1] as any)?.id || 2;
  const accWhId = whMap['Accessories Warehouse'] || whMap['Test RM Store'] || rmWhId;

  await db.execute(sql`
    INSERT INTO purchase_orders (po_number, tenant_id, supplier_id, order_date, expected_delivery_date, currency, exchange_rate, total_amount, status, notes)
    VALUES
      ('PO-2026-001', ${TENANT_ID}, ${nomanId}, '2026-02-15', '2026-04-15', 'BDT', 1.00, 4200000.00, 'approved', 'Cotton Twill 58" - 12,000 yards @ BDT 350/yard'),
      ('PO-2026-002', ${TENANT_ID}, ${ykkId}, '2026-02-18', '2026-04-20', 'BDT', 1.00, 150000.00, 'approved', 'YKK Zipper #5 10,000 pcs @ BDT 15'),
      ('PO-2026-003', ${TENANT_ID}, ${hameemId}, '2026-02-20', '2026-04-25', 'BDT', 1.00, 350000.00, 'approved', 'Assorted trims - buttons, labels, thread, hangtags')
    ON CONFLICT DO NOTHING
    RETURNING id
  `);

  const pos = await db.execute(sql`SELECT id, po_number FROM purchase_orders WHERE tenant_id=${TENANT_ID} ORDER BY id DESC LIMIT 3`);
  const poList = (pos.rows as any[]).reverse();
  
  if (poList.length >= 3) {
    const cottonTwillId = itemMap['FAB-CTN-TWILL'] || (items.rows[0] as any)?.id || 1;
    const ykkZipId = itemMap['TRM-THRDS-40'] || (items.rows[3] as any)?.id || 4;

    await db.execute(sql`
      INSERT INTO purchase_order_items (po_id, item_id, quantity, unit_price, line_total, received_quantity, tenant_id)
      VALUES
        (${poList[0].id}, ${cottonTwillId}, 12000, 350.00, 4200000.00, 0, ${TENANT_ID}),
        (${poList[1].id}, ${ykkZipId}, 10000, 15.00, 150000.00, 0, ${TENANT_ID}),
        (${poList[2].id}, ${cottonTwillId}, 5000, 70.00, 350000.00, 0, ${TENANT_ID})
      ON CONFLICT DO NOTHING
    `);
  }
  console.log(`  Purchase orders: ${poList.length} created with line items`);

  console.log('[F] Seeding goods receiving notes...');
  
  if (poList.length >= 2) {
    await db.execute(sql`
      INSERT INTO goods_receiving_notes (grn_number, tenant_id, purchase_order_id, vendor_id, warehouse_id, receiving_date, status, received_by)
      VALUES
        ('GRN-2026-001', ${TENANT_ID}, ${poList[0].id}, ${nomanId}, ${rmWhId}, '2026-04-10', 'completed', ${SUPER_USER_ID}),
        ('GRN-2026-002', ${TENANT_ID}, ${poList[1].id}, ${ykkId}, ${accWhId}, '2026-04-15', 'completed', ${SUPER_USER_ID})
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    console.log('  GRNs created');
  }

  console.log('[G] Seeding enhanced gate passes...');
  
  await db.execute(sql`
    INSERT INTO enhanced_gate_passes (gate_pass_number, gate_pass_date, gate_pass_type, party_name, vehicle_number, vehicle_type, driver_name, driver_contact, warehouse_id, workflow_status, purpose, remarks, tenant_id, created_by, created_at)
    VALUES
      ('GP-2026-001', '2026-04-10', 'inward', 'Noman Group (Fabrics)', 'Dhaka Metro-Ga-12-3456', 'Truck', 'Md. Rahim', '01812345678', ${rmWhId}, 'approved', 'Raw Material Receipt', 'Cotton Twill delivery - 12,000 yards on 2 trucks', ${TENANT_ID}, ${SUPER_USER_ID}, NOW()),
      ('GP-2026-002', '2026-04-12', 'outward', 'Noman Group (Fabrics)', 'Dhaka Metro-Ka-45-6789', 'Truck', 'Md. Karim', '01898765432', ${rmWhId}, 'approved', 'Rejected Material Return', 'Return of 200 yards rejected fabric - shade variation', ${TENANT_ID}, ${SUPER_USER_ID}, NOW()),
      ('GP-2026-003', '2026-04-15', 'inward', 'YKK Bangladesh Ltd', 'Dhaka-Cha-23-4567', 'Van', 'Md. Salam', '01856789012', ${accWhId}, 'approved', 'Trim Delivery', 'YKK Zippers delivery - 10,000 pcs in 5 cartons', ${TENANT_ID}, ${SUPER_USER_ID}, NOW()),
      ('GP-2026-004', '2026-08-01', 'outward', 'MSC Shipping', 'MSCU-1234567', 'Container', 'Md. Faruk', '01823456789', ${fgWhId}, 'approved', 'Export Shipment', 'Export shipment to Rotterdam - 817 cartons, 40ft container', ${TENANT_ID}, ${SUPER_USER_ID}, NOW())
    ON CONFLICT DO NOTHING
  `);

  console.log('[H] Seeding delivery challans...');
  
  await db.execute(sql`
    INSERT INTO delivery_challans (challan_number, challan_date, warehouse_id, vehicle_number, driver_name, delivery_address, total_quantity, workflow_status, notes, tenant_id, created_by, created_at)
    VALUES
      ('DC-2026-001', '2026-05-01', ${rmWhId}, 'Internal Transfer', 'Store Keeper', 'Cutting Floor', 9500, 'approved', 'Issue Cotton Twill 58" from RM Store to Cutting Floor for H&M Polo production', ${TENANT_ID}, ${SUPER_USER_ID}, NOW()),
      ('DC-2026-002', '2026-05-25', ${accWhId}, 'Internal Transfer', 'Store Keeper', 'Sewing Floor', 40000, 'approved', 'Zippers 10K pcs, Buttons 20K pcs, Thread 50 cones, Labels 10K pcs to sewing', ${TENANT_ID}, ${SUPER_USER_ID}, NOW()),
      ('DC-2026-003', '2026-08-01', ${fgWhId}, 'Dhaka Metro-Ga-78-9012', 'Md. Faruk', 'Chittagong Port - MSC Terminal', 817, 'approved', '817 cartons of finished Polo T-Shirts for H&M SS2026 order', ${TENANT_ID}, ${SUPER_USER_ID}, NOW())
    ON CONFLICT DO NOTHING
  `);

  console.log('[I] Seeding accounting vouchers...');

  const vtypes = await db.execute(sql`SELECT id, name, prefix FROM voucher_types WHERE tenant_id=${TENANT_ID}`);
  const vtMap: Record<string, { id: number, prefix: string }> = {};
  for (const vt of vtypes.rows as any[]) vtMap[vt.name] = { id: vt.id, prefix: vt.prefix };

  const cashAcct = await db.execute(sql`SELECT id FROM chart_of_accounts WHERE tenant_id=${TENANT_ID} AND (name ILIKE '%cash book%' OR name ILIKE '%cash - head%') LIMIT 1`);
  const bankAcct = await db.execute(sql`SELECT id FROM chart_of_accounts WHERE tenant_id=${TENANT_ID} AND is_bank_account=true LIMIT 1`);
  const salaryAcct = await db.execute(sql`SELECT id FROM chart_of_accounts WHERE tenant_id=${TENANT_ID} AND name ILIKE '%salary%factory%' LIMIT 1`);
  const rentAcct = await db.execute(sql`SELECT id FROM chart_of_accounts WHERE tenant_id=${TENANT_ID} AND name ILIKE '%rent%rate%' LIMIT 1`);
  const revenueAcct = await db.execute(sql`SELECT id FROM chart_of_accounts WHERE tenant_id=${TENANT_ID} AND name ILIKE '%revenue from export%' LIMIT 1`);
  const fabricPurchAcct = await db.execute(sql`SELECT id FROM chart_of_accounts WHERE tenant_id=${TENANT_ID} AND name ILIKE '%fabrics purchase%' LIMIT 1`);
  const capitalAcct = await db.execute(sql`SELECT id FROM chart_of_accounts WHERE tenant_id=${TENANT_ID} AND name ILIKE '%capital%' LIMIT 1`);

  const cashId = (cashAcct.rows[0] as any)?.id;
  const bankId = (bankAcct.rows[0] as any)?.id;
  const salaryId = (salaryAcct.rows[0] as any)?.id;
  const rentId = (rentAcct.rows[0] as any)?.id;
  const revenueId = (revenueAcct.rows[0] as any)?.id;
  const fabricPId = (fabricPurchAcct.rows[0] as any)?.id;
  const capitalId = (capitalAcct.rows[0] as any)?.id;

  const maxVN = await db.execute(sql`SELECT MAX(id) as max_id FROM vouchers WHERE tenant_id=${TENANT_ID}`);
  let vNum = ((maxVN.rows[0] as any)?.max_id || 80) + 1;

  const marchPeriod = await db.execute(sql`SELECT id FROM accounting_periods WHERE tenant_id=${TENANT_ID} AND name='Mar 2026' LIMIT 1`);
  const periodId = (marchPeriod.rows[0] as any)?.id || 9;
  const fyId = 1;

  if (cashId && bankId) {
    const jvType = vtMap['Journal Voucher'];
    const pvType = vtMap['Payment Voucher'];
    const rvType = vtMap['Receipt Voucher'];
    const cvType = vtMap['Contra Voucher'];
    const siType = vtMap['Sales Invoice'];

    const POSTED_STATUS = 5;

    if (jvType && capitalId) {
      await db.execute(sql`
        INSERT INTO vouchers (voucher_number, voucher_type_id, voucher_date, fiscal_year_id, accounting_period_id, amount, description, status_id, tenant_id, prepared_by_id, created_at)
        VALUES (${`JV-${String(vNum).padStart(6, '0')}`}, ${jvType.id}, '2026-03-01', ${fyId}, ${periodId}, 2500000.00, 'Opening balances - Cash 500K, Bank 2M against Capital', ${POSTED_STATUS}, ${TENANT_ID}, ${SUPER_USER_ID}, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      
      const jvVoucher = await db.execute(sql`SELECT id FROM vouchers WHERE voucher_number=${`JV-${String(vNum).padStart(6, '0')}`} AND tenant_id=${TENANT_ID}`);
      const jvId = (jvVoucher.rows[0] as any)?.id;
      if (jvId) {
        await db.execute(sql`
          INSERT INTO voucher_items (voucher_id, line_number, account_id, debit_amount, credit_amount, description, tenant_id)
          VALUES
            (${jvId}, 1, ${cashId}, 500000.00, 0, 'Opening cash balance', ${TENANT_ID}),
            (${jvId}, 2, ${bankId}, 2000000.00, 0, 'Opening bank balance', ${TENANT_ID}),
            (${jvId}, 3, ${capitalId}, 0, 2500000.00, 'Capital contribution', ${TENANT_ID})
          ON CONFLICT DO NOTHING
        `);
      }
      vNum++;
    }

    if (pvType && fabricPId) {
      await db.execute(sql`
        INSERT INTO vouchers (voucher_number, voucher_type_id, voucher_date, fiscal_year_id, accounting_period_id, amount, description, status_id, tenant_id, prepared_by_id, created_at)
        VALUES (${`PV-${String(vNum).padStart(6, '0')}`}, ${pvType.id}, '2026-03-05', ${fyId}, ${periodId}, 4200000.00, 'Payment to Noman Group for fabric - PO-2026-001', ${POSTED_STATUS}, ${TENANT_ID}, ${SUPER_USER_ID}, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      
      const pvVoucher = await db.execute(sql`SELECT id FROM vouchers WHERE voucher_number=${`PV-${String(vNum).padStart(6, '0')}`} AND tenant_id=${TENANT_ID}`);
      const pvId = (pvVoucher.rows[0] as any)?.id;
      if (pvId) {
        await db.execute(sql`
          INSERT INTO voucher_items (voucher_id, line_number, account_id, debit_amount, credit_amount, description, tenant_id)
          VALUES
            (${pvId}, 1, ${fabricPId}, 4200000.00, 0, 'Fabric purchase - Cotton Twill 12K yards', ${TENANT_ID}),
            (${pvId}, 2, ${bankId}, 0, 4200000.00, 'Bank payment to Noman Group', ${TENANT_ID})
          ON CONFLICT DO NOTHING
        `);
      }
      vNum++;
    }

    if (pvType && salaryId) {
      await db.execute(sql`
        INSERT INTO vouchers (voucher_number, voucher_type_id, voucher_date, fiscal_year_id, accounting_period_id, amount, description, status_id, tenant_id, prepared_by_id, created_at)
        VALUES (${`PV-${String(vNum).padStart(6, '0')}`}, ${pvType.id}, '2026-03-28', ${fyId}, ${periodId}, 350000.00, 'March 2026 salary payment - Factory staff', ${POSTED_STATUS}, ${TENANT_ID}, ${SUPER_USER_ID}, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      
      const pvSal = await db.execute(sql`SELECT id FROM vouchers WHERE voucher_number=${`PV-${String(vNum).padStart(6, '0')}`} AND tenant_id=${TENANT_ID}`);
      const pvSalId = (pvSal.rows[0] as any)?.id;
      if (pvSalId) {
        await db.execute(sql`
          INSERT INTO voucher_items (voucher_id, line_number, account_id, debit_amount, credit_amount, description, tenant_id)
          VALUES
            (${pvSalId}, 1, ${salaryId}, 350000.00, 0, 'Factory salary March 2026', ${TENANT_ID}),
            (${pvSalId}, 2, ${bankId}, 0, 350000.00, 'Salary disbursement via bank', ${TENANT_ID})
          ON CONFLICT DO NOTHING
        `);
      }
      vNum++;
    }

    if (pvType && rentId) {
      await db.execute(sql`
        INSERT INTO vouchers (voucher_number, voucher_type_id, voucher_date, fiscal_year_id, accounting_period_id, amount, description, status_id, tenant_id, prepared_by_id, created_at)
        VALUES (${`PV-${String(vNum).padStart(6, '0')}`}, ${pvType.id}, '2026-03-01', ${fyId}, ${periodId}, 150000.00, 'March 2026 factory rent', ${POSTED_STATUS}, ${TENANT_ID}, ${SUPER_USER_ID}, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id
      `);

      const pvRent = await db.execute(sql`SELECT id FROM vouchers WHERE voucher_number=${`PV-${String(vNum).padStart(6, '0')}`} AND tenant_id=${TENANT_ID}`);
      const pvRentId = (pvRent.rows[0] as any)?.id;
      if (pvRentId) {
        await db.execute(sql`
          INSERT INTO voucher_items (voucher_id, line_number, account_id, debit_amount, credit_amount, description, tenant_id)
          VALUES
            (${pvRentId}, 1, ${rentId}, 150000.00, 0, 'Factory rent March 2026', ${TENANT_ID}),
            (${pvRentId}, 2, ${cashId}, 0, 150000.00, 'Cash payment for rent', ${TENANT_ID})
          ON CONFLICT DO NOTHING
        `);
      }
      vNum++;
    }

    if (rvType) {
      await db.execute(sql`
        INSERT INTO vouchers (voucher_number, voucher_type_id, voucher_date, fiscal_year_id, accounting_period_id, amount, description, status_id, tenant_id, prepared_by_id, created_at)
        VALUES (${`RV-${String(vNum).padStart(6, '0')}`}, ${rvType.id}, '2026-03-10', ${fyId}, ${periodId}, 1100000.00, 'Advance received from H&M - USD 10,000 @ 110 BDT', ${POSTED_STATUS}, ${TENANT_ID}, ${SUPER_USER_ID}, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id
      `);

      const rvAdv = await db.execute(sql`SELECT id FROM vouchers WHERE voucher_number=${`RV-${String(vNum).padStart(6, '0')}`} AND tenant_id=${TENANT_ID}`);
      const rvAdvId = (rvAdv.rows[0] as any)?.id;
      if (rvAdvId) {
        await db.execute(sql`
          INSERT INTO voucher_items (voucher_id, line_number, account_id, debit_amount, credit_amount, description, tenant_id)
          VALUES
            (${rvAdvId}, 1, ${bankId}, 1100000.00, 0, 'Bank receipt - H&M advance USD 10K', ${TENANT_ID}),
            (${rvAdvId}, 2, ${revenueId || capitalId}, 0, 1100000.00, 'Advance received against Export LC', ${TENANT_ID})
          ON CONFLICT DO NOTHING
        `);
      }
      vNum++;
    }

    if (cvType) {
      await db.execute(sql`
        INSERT INTO vouchers (voucher_number, voucher_type_id, voucher_date, fiscal_year_id, accounting_period_id, amount, description, status_id, tenant_id, prepared_by_id, created_at)
        VALUES (${`CV-${String(vNum).padStart(6, '0')}`}, ${cvType.id}, '2026-03-15', ${fyId}, ${periodId}, 500000.00, 'Transfer from bank to factory cash for operational expenses', ${POSTED_STATUS}, ${TENANT_ID}, ${SUPER_USER_ID}, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id
      `);

      const cvXfer = await db.execute(sql`SELECT id FROM vouchers WHERE voucher_number=${`CV-${String(vNum).padStart(6, '0')}`} AND tenant_id=${TENANT_ID}`);
      const cvXferId = (cvXfer.rows[0] as any)?.id;
      if (cvXferId) {
        await db.execute(sql`
          INSERT INTO voucher_items (voucher_id, line_number, account_id, debit_amount, credit_amount, description, tenant_id)
          VALUES
            (${cvXferId}, 1, ${cashId}, 500000.00, 0, 'Cash received from bank', ${TENANT_ID}),
            (${cvXferId}, 2, ${bankId}, 0, 500000.00, 'Bank withdrawal for cash', ${TENANT_ID})
          ON CONFLICT DO NOTHING
        `);
      }
      vNum++;
    }

    if (siType && revenueId) {
      await db.execute(sql`
        INSERT INTO vouchers (voucher_number, voucher_type_id, voucher_date, fiscal_year_id, accounting_period_id, amount, description, status_id, tenant_id, prepared_by_id, created_at)
        VALUES (${`SI-${String(vNum).padStart(6, '0')}`}, ${siType.id}, '2026-03-20', ${fyId}, ${periodId}, 9350000.00, 'Export sale - H&M Polo 10K pcs x $8.50 = $85,000 @ BDT 110', ${POSTED_STATUS}, ${TENANT_ID}, ${SUPER_USER_ID}, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id
      `);

      const siExp = await db.execute(sql`SELECT id FROM vouchers WHERE voucher_number=${`SI-${String(vNum).padStart(6, '0')}`} AND tenant_id=${TENANT_ID}`);
      const siExpId = (siExp.rows[0] as any)?.id;
      if (siExpId) {
        const arId = bankId;
        await db.execute(sql`
          INSERT INTO voucher_items (voucher_id, line_number, account_id, debit_amount, credit_amount, description, tenant_id)
          VALUES
            (${siExpId}, 1, ${arId}, 9350000.00, 0, 'Accounts Receivable - H&M Export', ${TENANT_ID}),
            (${siExpId}, 2, ${revenueId}, 0, 9350000.00, 'Export revenue - H&M Polo SS2026', ${TENANT_ID})
          ON CONFLICT DO NOTHING
        `);
      }
      vNum++;
    }
  }
  console.log(`  Vouchers seeded (JV, PV, RV, CV, SI)`);

  console.log('[J] Seeding production data...');

  const firstOrderId = newOrders[0]?.id;
  await db.execute(sql`
    INSERT INTO production_orders (production_order_id, tenant_id, quantity, start_date, target_end_date, status, priority, efficiency_target, actual_efficiency, remarks, created_at)
    VALUES
      ('PROD-2026-001', ${TENANT_ID}, 10000, '2026-05-01', '2026-07-31', 'in_progress', 'high', 90.0, 92.0, 'H&M SS2026 Polo - 4 colors x 4 sizes', NOW()),
      ('PROD-2026-002', ${TENANT_ID}, 5000, '2026-06-01', '2026-09-01', 'planned', 'high', 88.0, 0, 'Zara AW2026 Denim Jacket - waiting for fabric', NOW())
    ON CONFLICT DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO cutting_orders (tenant_id, marker_ref, lay_count, planned_qty, cut_qty, status, created_at)
    VALUES
      (${TENANT_ID}, 'MKR-POLO-S/M-WHT', 25, 2500, 2500, 'completed', NOW()),
      (${TENANT_ID}, 'MKR-POLO-L/XL-WHT', 25, 2500, 2500, 'completed', NOW()),
      (${TENANT_ID}, 'MKR-POLO-S/M-NAV', 25, 2500, 2500, 'completed', NOW()),
      (${TENANT_ID}, 'MKR-POLO-L/XL-NAV', 25, 2500, 2500, 'completed', NOW())
    ON CONFLICT DO NOTHING
  `);
  console.log('  Production orders and cutting records seeded');

  console.log('[K] Seeding QC inspections...');

  await db.execute(sql`
    INSERT INTO qc_inspections (inspection_number, tenant_id, inspection_type, inspection_date, lot_size, sample_size, pass_quantity, fail_quantity, aql_level, result, remarks, inspected_by, created_at)
    VALUES
      ('QC-2026-001', ${TENANT_ID}, 'inline', '2026-06-03', 2500, 500, 475, 25, '2.5', 'pass', 'Inline inspection during sewing - 95% pass rate. Main issues: loose stitching on collar, minor staining', ${SUPER_USER_ID}, NOW()),
      ('QC-2026-002', ${TENANT_ID}, 'final', '2026-07-01', 9900, 800, 780, 20, '2.5', 'pass', 'Final AQL inspection - 97.5% pass on sample. 100 pcs reworked, 100 pcs seconds', ${SUPER_USER_ID}, NOW()),
      ('QC-2026-003', ${TENANT_ID}, 'inline', '2026-04-10', 12000, 120, 118, 2, '4.0', 'pass', 'Fabric inspection on receipt - 2 rolls rejected for shade variation', ${SUPER_USER_ID}, NOW())
    ON CONFLICT DO NOTHING
  `);

  console.log('[L] Seeding shipment data...');

  await db.execute(sql`
    INSERT INTO shipments (shipment_number, tenant_id, shipment_date, etd, eta, shipment_mode, carrier, tracking_number, container_details, goods_description, package_count, gross_weight, net_weight, status, notes, created_at)
    VALUES
      ('SHP-2026-001', ${TENANT_ID}, '2026-08-02', '2026-08-02', '2026-08-28', 'Sea', 'MSC Shipping', 'MSCU1234567', '{"type": "40ft HC", "number": "MSCU-1234567"}', 'Mens Polo T-Shirt 100% Cotton, 10000 pcs', 817, 8500.00, 7800.00, 'shipped', 'H&M Polo shipment via MSC Anna, Chittagong to Rotterdam. All export docs submitted to bank.', NOW())
    ON CONFLICT DO NOTHING
  `);

  console.log('[M] Seeding FX receipts and settlements...');

  const bankAccts2 = await db.execute(sql`SELECT id FROM bank_accounts WHERE tenant_id=${TENANT_ID} LIMIT 1`);
  const ba2Id = (bankAccts2.rows[0] as any)?.id;

  await db.execute(sql`
    INSERT INTO fx_receipts (tenant_id, export_case_id, receipt_date, bank_account_id, amount, currency, exchange_rate, bdt_amount, bank_charges, net_amount, bank_reference, status, created_by, created_at)
    VALUES
      (${TENANT_ID}, ${null}, '2026-09-05', ${ba2Id}, 85000.00, 'USD', 110.50, 9392500.00, 2500.00, 9390000.00, 'NEG-SCB-2026-09-001', 'realized', ${SUPER_USER_ID}, NOW())
    ON CONFLICT DO NOTHING
    RETURNING id
  `);

  const fxr = await db.execute(sql`SELECT id FROM fx_receipts WHERE tenant_id=${TENANT_ID} ORDER BY id DESC LIMIT 1`);
  const fxrId = (fxr.rows[0] as any)?.id;

  if (fxrId) {
    await db.execute(sql`
      INSERT INTO fx_settlements (tenant_id, fx_receipt_id, settlement_type, amount, currency, settlement_date, remarks, created_at)
      VALUES
        (${TENANT_ID}, ${fxrId}, 'btb_lc_payment', 35000.00, 'USD', '2026-09-10', 'BTB LC maturity - Noman Group fabric', NOW()),
        (${TENANT_ID}, ${fxrId}, 'btb_lc_payment', 8000.00, 'USD', '2026-09-10', 'BTB LC maturity - YKK trims', NOW()),
        (${TENANT_ID}, ${fxrId}, 'bank_charge', 500.00, 'USD', '2026-09-10', 'Bank charges for LC negotiation', NOW()),
        (${TENANT_ID}, ${fxrId}, 'local_transfer', 41500.00, 'USD', '2026-09-12', 'Balance converted to BDT - net export proceeds', NOW())
      ON CONFLICT DO NOTHING
    `);
  }

  console.log('[N] Seeding payroll data...');

  const empList0 = await db.execute(sql`SELECT id FROM employees WHERE tenant_id=${TENANT_ID} LIMIT 5`);
  const empIds = (empList0.rows as any[]).map((e: any) => e.id);

  for (const empId of empIds) {
    await db.execute(sql`
      INSERT INTO salary_structures (tenant_id, employee_id, basic, house_rent, medical, conveyance, other_allowances, gross_salary, tax_deduction, pf_deduction, other_deductions, effective_from, is_active, created_at)
      VALUES (${TENANT_ID}, ${empId}, 25000, 10000, 3000, 2500, 2000, 42500, 2000, 1500, 500, '2025-07-01', true, NOW())
      ON CONFLICT DO NOTHING
    `);
  }

  await db.execute(sql`
    INSERT INTO payroll_runs (tenant_id, payroll_month, start_date, end_date, status, total_gross, total_deductions, total_net, employee_count, created_by, created_at)
    VALUES
      (${TENANT_ID}, '2026-03', '2026-03-01', '2026-03-31', 'completed', 385000.00, 35000.00, 350000.00, 10, ${SUPER_USER_ID}, NOW()),
      (${TENANT_ID}, '2026-02', '2026-02-01', '2026-02-28', 'completed', 385000.00, 35000.00, 350000.00, 10, ${SUPER_USER_ID}, NOW())
    ON CONFLICT DO NOTHING
  `);

  console.log('[O] Seeding styles and BOM...');

  await db.execute(sql`
    INSERT INTO styles (style_no, tenant_id, buyer_id, season, product_type, description, status, is_active, created_by, created_at)
    VALUES
      ('HM-POLO-2026', ${TENANT_ID}, ${hmId}, 'SS2026', 'Knit', 'Mens classic polo t-shirt in 4 colors, 100% Cotton Jersey 180GSM', 'approved', true, ${SUPER_USER_ID}, NOW()),
      ('ZR-DENIM-2026', ${TENANT_ID}, ${zaraId}, 'AW2026', 'Woven', 'Ladies denim jacket, 12oz Indigo Denim, 3 wash options', 'approved', true, ${SUPER_USER_ID}, NOW()),
      ('NX-HOOD-2026', ${TENANT_ID}, ${nextId}, 'AW2026', 'Knit', 'Kids pullover hoodie, 280GSM Fleece, 5 sizes, 3 colors', 'development', true, ${SUPER_USER_ID}, NOW())
    ON CONFLICT DO NOTHING
    RETURNING id
  `);

  const cottonTwillId = itemMap['FAB-CTN-TWILL'] || (items.rows[0] as any)?.id;
  const jerseyId = itemMap['FAB-JRSY-180'] || cottonTwillId;

  if (jerseyId) {
    await db.execute(sql`
      INSERT INTO bill_of_materials (name, item_id, version, is_active, effective_date, total_cost, tenant_id, created_at)
      VALUES ('HM-POLO-2026 BOM', ${jerseyId}, '1.0', true, '2026-03-01', '850.00', ${TENANT_ID}, NOW())
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const bomResult = await db.execute(sql`SELECT id FROM bill_of_materials WHERE tenant_id=${TENANT_ID} AND name='HM-POLO-2026 BOM' LIMIT 1`);
    const bomId = (bomResult.rows[0] as any)?.id;

    if (bomId) {
      const ribId = itemMap['FAB-RIB-1X1'] || jerseyId;
      const threadId = itemMap['TRM-THRDS-40'] || (items.rows[2] as any)?.id;
      const labelId = itemMap['TRM-WLBL-01'] || threadId;
      const hangTagId = itemMap['TRM-HTAG-01'] || labelId;

      await db.execute(sql`
        INSERT INTO bom_components (bom_id, component_item_id, unit_id, quantity, unit_cost, waste_percentage, notes, is_critical, sort_order, tenant_id, created_at)
        VALUES
          (${bomId}, ${jerseyId}, ${kgUnit}, '0.35', '520.00', '5.0', 'Body fabric - Cotton Jersey 180GSM', true, 1, ${TENANT_ID}, NOW()),
          (${bomId}, ${ribId}, ${kgUnit}, '0.03', '580.00', '8.0', 'Collar & cuff rib', true, 2, ${TENANT_ID}, NOW()),
          (${bomId}, ${threadId}, ${pcUnit}, '1', '85.00', '3.0', 'Sewing thread per dozen', false, 3, ${TENANT_ID}, NOW()),
          (${bomId}, ${labelId}, ${pcUnit}, '1', '2.80', '2.0', 'Brand woven label', false, 4, ${TENANT_ID}, NOW()),
          (${bomId}, ${hangTagId}, ${pcUnit}, '1', '3.50', '2.0', 'Printed hang tag', false, 5, ${TENANT_ID}, NOW())
        ON CONFLICT DO NOTHING
      `);
    }
  }
  console.log('  Styles and BOM seeded');

  console.log('[P] Seeding TNA plans...');
  
  if (firstOrderId) {
    await db.execute(sql`
      INSERT INTO time_action_plans (order_id, tenant_id, name, description, start_date, end_date, total_days, status, created_by, created_at)
      VALUES
        (${firstOrderId}, ${TENANT_ID}, 'TNA-HM-POLO-2026', 'Time & Action for H&M Polo SS2026', '2026-03-01', '2026-08-15', 168, 'active', ${SUPER_USER_ID}, NOW())
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const tnaPlans = await db.execute(sql`SELECT id FROM time_action_plans WHERE tenant_id=${TENANT_ID} AND name='TNA-HM-POLO-2026' LIMIT 1`);
    const tnaPlanId = (tnaPlans.rows[0] as any)?.id;
    
    if (tnaPlanId) {
      await db.execute(sql`
        INSERT INTO time_action_milestones (plan_id, tenant_id, milestone_name, planned_start_date, planned_end_date, actual_start_date, actual_end_date, status, responsible_person, department, comments, sort_order, is_critical, created_at)
        VALUES
          (${tnaPlanId}, ${TENANT_ID}, 'Sample Submit', '2026-03-10', '2026-03-15', '2026-03-10', '2026-03-14', 'completed', 'Abdul Karim', 'Merchandising', 'PP sample submitted on time', 1, true, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Sample Approved', '2026-03-25', '2026-03-30', '2026-03-28', '2026-04-02', 'completed', 'Abdul Karim', 'Merchandising', 'Approved with minor collar comment', 2, true, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Fabric Booking', '2026-03-30', '2026-04-01', '2026-04-01', '2026-04-01', 'completed', 'Abdul Karim', 'Merchandising', 'Noman Group confirmed', 3, false, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Trim Booking', '2026-04-01', '2026-04-05', '2026-04-05', '2026-04-05', 'completed', 'Abdul Karim', 'Merchandising', 'All trims booked with YKK & Hameem', 4, false, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Fabric In-house', '2026-04-08', '2026-04-12', '2026-04-10', '2026-04-10', 'completed', 'Salma Akter', 'Store', 'GRN-2026-001 received', 5, true, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Trim In-house', '2026-04-12', '2026-04-16', '2026-04-15', '2026-04-15', 'completed', 'Salma Akter', 'Store', 'GRN-2026-002 received', 6, false, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'PP Meeting', '2026-04-20', '2026-04-25', '2026-04-25', '2026-04-25', 'completed', 'Production Manager', 'Production', 'All departments aligned', 7, true, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Bulk Cutting Start', '2026-04-28', '2026-05-01', '2026-05-01', '2026-05-01', 'completed', 'Cutting Master', 'Production', 'Cutting started on schedule', 8, true, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Sewing Start', '2026-05-20', '2026-05-25', '2026-05-25', '2026-05-28', 'completed', 'Sewing Supervisor', 'Production', '3 days late - line setup delay', 9, true, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Washing/Finishing', '2026-06-15', '2026-06-20', '2026-06-20', '2026-06-22', 'completed', 'Finishing Supervisor', 'Production', 'Bio-wash completed', 10, false, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Final Inspection', '2026-06-28', '2026-07-01', '2026-07-01', '2026-07-01', 'completed', 'QC Inspector', 'Quality', 'QC-2026-002 passed AQL 2.5', 11, true, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Packing Complete', '2026-07-05', '2026-07-10', '2026-07-08', '2026-07-10', 'completed', 'Finishing Supervisor', 'Production', '817 cartons packed', 12, false, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Ex-Factory', '2026-07-20', '2026-07-25', '2026-07-25', '2026-07-28', 'completed', 'Jahangir Alam', 'Commercial', 'Shipment to port', 13, true, NOW()),
          (${tnaPlanId}, ${TENANT_ID}, 'Shipment', '2026-07-30', '2026-08-02', '2026-08-01', '2026-08-02', 'completed', 'Jahangir Alam', 'Commercial', 'SHP-2026-001 on MSC Anna', 14, true, NOW())
        ON CONFLICT DO NOTHING
      `);
    }
  }
  console.log('  TNA plans and milestones seeded');

  console.log('[Q] Seeding attendance and leave data...');

  const empList = await db.execute(sql`SELECT id, first_name FROM employees WHERE tenant_id=${TENANT_ID} LIMIT 10`);
  const employees = empList.rows as any[];

  for (const emp of employees) {
    for (let day = 1; day <= 28; day++) {
      const dateStr = `2026-03-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(dateStr).getDay();
      if (dayOfWeek === 5) continue;
      
      const status = Math.random() > 0.95 ? 'absent' : (Math.random() > 0.9 ? 'late' : 'present');
      const shift = 'day';
      await db.execute(sql`
        INSERT INTO attendance (employee_id, tenant_id, date, shift, in_time, out_time, status, overtime_hours, late_minutes, created_at)
        VALUES (${emp.id}, ${TENANT_ID}, ${dateStr}, ${shift}, '08:00', '17:00', ${status}, 0, ${status === 'late' ? 15 : 0}, NOW())
        ON CONFLICT DO NOTHING
      `);
    }
  }

  if (employees.length >= 3) {
    await db.execute(sql`
      INSERT INTO leave_requests (employee_id, tenant_id, leave_type, start_date, end_date, total_days, reason, status, approved_by, created_at)
      VALUES
        (${employees[0].id}, ${TENANT_ID}, 'sick', '2026-03-10', '2026-03-11', 2, 'Fever and cold', 'approved', ${SUPER_USER_ID}, NOW()),
        (${employees[2].id}, ${TENANT_ID}, 'annual', '2026-03-20', '2026-03-22', 3, 'Family event', 'approved', ${SUPER_USER_ID}, NOW())
      ON CONFLICT DO NOTHING
    `);
  }
  console.log('  Attendance and leave data seeded');

  console.log('[R] Seeding inventory movements...');

  const cottonId2 = itemMap['FAB-CTN-TWILL'] || (items.rows[0] as any)?.id;

  if (cottonId2) {
    await db.execute(sql`
      INSERT INTO inventory_movements (movement_id, tenant_id, warehouse_id, type, source_type, description, movement_date, processed_by, status, notes, created_at)
      VALUES
        ('IM-2026-001', ${TENANT_ID}, ${rmWhId}, 'receipt', 'grn', 'Fabric received from Noman Group - 12,000 yards Cotton Twill', NOW() - INTERVAL '2 hours', ${SUPER_USER_ID}, 'completed', 'GRN-2026-001', NOW()),
        ('IM-2026-002', ${TENANT_ID}, ${rmWhId}, 'issue', 'production', 'Issued to cutting floor - 9,500 yards for H&M Polo production', NOW() - INTERVAL '1 hour', ${SUPER_USER_ID}, 'completed', 'PROD-2026-001', NOW()),
        ('IM-2026-003', ${TENANT_ID}, ${rmWhId}, 'adjustment', 'adjustment', 'Cutting wastage adjustment - 200 yards end bits', NOW() - INTERVAL '30 minutes', ${SUPER_USER_ID}, 'completed', 'ADJ-2026-001', NOW())
      ON CONFLICT DO NOTHING
    `);
  }
  console.log('  Inventory movements seeded');

  console.log('[S] Logging audit entries for seeded operations...');

  await db.execute(sql`
    INSERT INTO audit_logs (tenant_id, entity_type, entity_id, action, performed_by, performed_at, ip_address, metadata)
    VALUES
      (${TENANT_ID}, 'session', ${SUPER_USER_ID}, 'LOGIN', ${SUPER_USER_ID}, NOW() - INTERVAL '2 hours', '192.168.1.100', '{"userAgent": "Mozilla/5.0 Chrome/120", "source": "web"}'),
      (${TENANT_ID}, 'purchase_order', 0, 'CREATE', ${SUPER_USER_ID}, NOW() - INTERVAL '90 minutes', '192.168.1.100', '{"poNumber": "PO-2026-001", "vendor": "Noman Group", "amount": 4200000}'),
      (${TENANT_ID}, 'purchase_order', 0, 'CREATE', ${SUPER_USER_ID}, NOW() - INTERVAL '85 minutes', '192.168.1.100', '{"poNumber": "PO-2026-002", "vendor": "YKK Bangladesh", "amount": 150000}'),
      (${TENANT_ID}, 'grn', 0, 'CREATE', ${SUPER_USER_ID}, NOW() - INTERVAL '80 minutes', '192.168.1.100', '{"grnNumber": "GRN-2026-001", "warehouse": "Raw Materials"}'),
      (${TENANT_ID}, 'voucher', 0, 'CREATE', ${SUPER_USER_ID}, NOW() - INTERVAL '70 minutes', '192.168.1.100', '{"voucherNumber": "JV-Opening", "type": "Journal", "amount": 2500000}'),
      (${TENANT_ID}, 'voucher', 0, 'APPROVE', ${SUPER_USER_ID}, NOW() - INTERVAL '65 minutes', '192.168.1.100', '{"voucherNumber": "JV-Opening", "workflowAction": "post"}'),
      (${TENANT_ID}, 'export_case', 0, 'CREATE', ${SUPER_USER_ID}, NOW() - INTERVAL '60 minutes', '192.168.1.100', '{"caseNumber": "EC-2026-001", "customer": "H&M", "value": 85000}'),
      (${TENANT_ID}, 'commercial_lc', 0, 'CREATE', ${SUPER_USER_ID}, NOW() - INTERVAL '55 minutes', '192.168.1.100', '{"lcNumber": "HM-LC-2026-001", "value": 85000}'),
      (${TENANT_ID}, 'btb_lc', 0, 'CREATE', ${SUPER_USER_ID}, NOW() - INTERVAL '50 minutes', '192.168.1.100', '{"btbLcNumber": "BTB-2026-001", "supplier": "Noman Group", "value": 35000}'),
      (${TENANT_ID}, 'shipment', 0, 'CREATE', ${SUPER_USER_ID}, NOW() - INTERVAL '30 minutes', '192.168.1.100', '{"shipmentNumber": "SHP-2026-001", "vessel": "MSC Anna"}'),
      (${TENANT_ID}, 'fx_receipt', 0, 'CREATE', ${SUPER_USER_ID}, NOW() - INTERVAL '20 minutes', '192.168.1.100', '{"receiptNumber": "FXR-2026-001", "amount": 85000, "currency": "USD"}'),
      (${TENANT_ID}, 'report', ${SUPER_USER_ID}, 'VIEW', ${SUPER_USER_ID}, NOW() - INTERVAL '10 minutes', '192.168.1.100', '{"reportName": "Trial Balance", "period": "March 2026"}'),
      (${TENANT_ID}, 'export', ${SUPER_USER_ID}, 'EXPORT', ${SUPER_USER_ID}, NOW() - INTERVAL '5 minutes', '192.168.1.100', '{"format": "CSV", "entityType": "vouchers", "recordCount": 42}')
    ON CONFLICT DO NOTHING
  `);
  console.log('  Audit log entries created');

  console.log('\n=== Full System Seed Complete ===');
  console.log('Summary:');
  console.log('  - Master Data: Customers, Vendors, Items, Categories, Units, Warehouses, COA, Currencies');
  console.log('  - Inquiries: 3 new (H&M Polo, Zara Denim, Next Hoodie)');
  console.log('  - Orders: 3 confirmed export orders');
  console.log('  - Export Cases: 2 (H&M, Zara)');
  console.log('  - Proforma Invoices: 2');
  console.log('  - Commercial LCs: 2 master LCs');
  console.log('  - BTB LCs: 3 back-to-back LCs');
  console.log('  - Purchase Orders: 3 with line items');
  console.log('  - GRNs: 2 completed');
  console.log('  - Gate Passes: 4 (inward/outward)');
  console.log('  - Delivery Challans: 3 (internal + external)');
  console.log('  - Vouchers: 7 (JV, PV x3, RV, CV, SI) - all posted');
  console.log('  - Production: 2 orders, 4 cutting records');
  console.log('  - QC Inspections: 3 (inline, final, fabric)');
  console.log('  - Shipments: 1 (MSC Anna to Rotterdam)');
  console.log('  - FX Receipts: 1 ($85,000 realized)');
  console.log('  - FX Settlements: 4 (BTB payments, charges, BDT transfer)');
  console.log('  - Payroll: 2 runs (Feb & Mar 2026)');
  console.log('  - Styles: 3 with BOM for Polo');
  console.log('  - TNA: 1 plan with 14 milestones');
  console.log('  - Attendance: ~240 records (10 employees x 24 working days)');
  console.log('  - Leave Requests: 2 approved');
  console.log('  - Inventory Movements: 3 (receipt, issue, adjustment)');
  console.log('  - Audit Logs: 13 sample entries');
}

seedFullSystem()
  .then(() => {
    console.log('\nSeed completed successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
