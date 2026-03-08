/**
 * Sequential ID Migration Script
 * 
 * This script migrates existing records in the database to use the standardized 
 * sequential ID format implemented in the SequentialIdGenerator utility.
 * 
 * It updates various entity types with the proper prefix (e.g., CUST-00001, ORD-00001)
 * while maintaining referential integrity across the system.
 */

import { db } from "../db";
import { sql, eq, and } from "drizzle-orm";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";

// Import necessary tables from schema
import {
  customers,
  commercialInquiries as inquiries,
  commercialQuotations as quotations,
  commercialOrders as orders, 
  vendors,
  items,
  itemCategories,
  itemSubcategories,
  warehouses,
  vouchers,
  journals,
  currencies
} from "../../shared/schema";

async function executeQuery<T>(queryFn: () => Promise<T>): Promise<T> {
  try {
    return await queryFn();
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

async function migrateCustomerIds(tenantId: number) {
  console.log(`Migrating customer IDs for tenant ${tenantId}...`);
  
  try {
    // Get all customers for this tenant that don't already have sequential IDs
    const customerResult = await executeQuery(() => 
      db.execute(sql`
        SELECT id, tenant_id, customer_id
        FROM customers 
        WHERE tenant_id = ${tenantId} 
        AND (customer_id IS NULL OR customer_id NOT LIKE 'CUST-%')
      `)
    );
    
    const customerList = customerResult.rows || [];
    let count = 0;
    
    // Get the highest existing sequential ID number
    const maxIdResult = await executeQuery(() => 
      db.execute(sql`
        SELECT MAX(SUBSTRING(customer_id, 6)::integer) as max_id
        FROM customers
        WHERE tenant_id = ${tenantId}
        AND customer_id LIKE 'CUST-%'
      `)
    );
    
    let startIndex = 0;
    if (maxIdResult.rows && maxIdResult.rows[0] && maxIdResult.rows[0].max_id) {
      startIndex = parseInt(maxIdResult.rows[0].max_id);
    }
    
    // Process each customer using traditional for loop
    for (let i = 0; i < customerList.length; i++) {
      const customer = customerList[i];
      // Generate a new sequential ID with the next number in sequence
      const sequentialId = `CUST-${(startIndex + i + 1).toString().padStart(5, '0')}`;
      
      try {
        // Update the customer record using raw SQL
        await executeQuery(() => 
          db.execute(sql`
            UPDATE customers 
            SET customer_id = ${sequentialId} 
            WHERE id = ${customer.id} AND tenant_id = ${tenantId}
          `)
        );
        
        count++;
      } catch (err) {
        console.error(`Error updating customer ID for customer ${customer.id}:`, err);
      }
    }
    
    console.log(`Successfully migrated ${count} customer IDs`);
  } catch (error) {
    console.error("Error migrating customer IDs:", error);
  }
}

async function migrateInquiryIds(tenantId: number) {
  console.log(`Migrating inquiry IDs for tenant ${tenantId}...`);
  
  try {
    // Get all inquiries for this tenant that don't already have sequential IDs
    const inquiryResult = await executeQuery(() => 
      db.execute(sql`
        SELECT id, tenant_id, inquiry_id
        FROM inquiries 
        WHERE tenant_id = ${tenantId}
        AND (inquiry_id IS NULL OR inquiry_id NOT LIKE 'INQ-%')
      `)
    );
    
    const inquiryList = inquiryResult.rows || [];
    let count = 0;
    
    // Get the highest existing sequential ID number
    const maxIdResult = await executeQuery(() => 
      db.execute(sql`
        SELECT MAX(SUBSTRING(inquiry_id, 5)::integer) as max_id
        FROM inquiries
        WHERE tenant_id = ${tenantId}
        AND inquiry_id LIKE 'INQ-%'
      `)
    );
    
    let startIndex = 0;
    if (maxIdResult.rows && maxIdResult.rows[0] && maxIdResult.rows[0].max_id) {
      startIndex = parseInt(maxIdResult.rows[0].max_id);
    }
    
    // Process each inquiry using traditional for loop
    for (let i = 0; i < inquiryList.length; i++) {
      const inquiry = inquiryList[i];
      // Generate a new sequential ID with the next number in sequence
      const sequentialId = `INQ-${(startIndex + i + 1).toString().padStart(5, '0')}`;
      
      try {
        // Update the inquiry record using raw SQL
        await executeQuery(() => 
          db.execute(sql`
            UPDATE inquiries 
            SET inquiry_id = ${sequentialId} 
            WHERE id = ${inquiry.id} AND tenant_id = ${tenantId}
          `)
        );
        
        count++;
      } catch (err) {
        console.error(`Error updating inquiry ID for inquiry ${inquiry.id}:`, err);
      }
    }
    
    console.log(`Successfully migrated ${count} inquiry IDs`);
  } catch (error) {
    console.error("Error migrating inquiry IDs:", error);
  }
}

async function migrateQuotationIds(tenantId: number) {
  console.log(`Migrating quotation IDs for tenant ${tenantId}...`);
  
  try {
    // Get all quotations for this tenant that don't already have sequential IDs
    const quotationResult = await executeQuery(() => 
      db.execute(sql`
        SELECT id, tenant_id, quotation_id
        FROM quotations 
        WHERE tenant_id = ${tenantId}
        AND (quotation_id IS NULL OR quotation_id NOT LIKE 'QUO-%')
      `)
    );
    
    const quotationList = quotationResult.rows || [];
    let count = 0;
    
    // Get the highest existing sequential ID number
    const maxIdResult = await executeQuery(() => 
      db.execute(sql`
        SELECT MAX(SUBSTRING(quotation_id, 5)::integer) as max_id
        FROM quotations
        WHERE tenant_id = ${tenantId}
        AND quotation_id LIKE 'QUO-%'
      `)
    );
    
    let startIndex = 0;
    if (maxIdResult.rows && maxIdResult.rows[0] && maxIdResult.rows[0].max_id) {
      startIndex = parseInt(maxIdResult.rows[0].max_id);
    }
    
    // Process each quotation using traditional for loop
    for (let i = 0; i < quotationList.length; i++) {
      const quotation = quotationList[i];
      // Generate a new sequential ID with the next number in sequence
      const sequentialId = `QUO-${(startIndex + i + 1).toString().padStart(5, '0')}`;
      
      try {
        // Update the quotation record using raw SQL
        await executeQuery(() => 
          db.execute(sql`
            UPDATE quotations 
            SET quotation_id = ${sequentialId} 
            WHERE id = ${quotation.id} AND tenant_id = ${tenantId}
          `)
        );
        
        count++;
      } catch (err) {
        console.error(`Error updating quotation ID for quotation ${quotation.id}:`, err);
      }
    }
    
    console.log(`Successfully migrated ${count} quotation IDs`);
  } catch (error) {
    console.error("Error migrating quotation IDs:", error);
  }
}

async function migrateOrderIds(tenantId: number) {
  console.log(`Migrating order IDs for tenant ${tenantId}...`);
  
  try {
    // Get all orders for this tenant that don't already have sequential IDs
    const orderResult = await executeQuery(() => 
      db.execute(sql`
        SELECT id, tenant_id, order_id
        FROM orders 
        WHERE tenant_id = ${tenantId}
        AND (order_id IS NULL OR order_id NOT LIKE 'ORD-%')
      `)
    );
    
    const orderList = orderResult.rows || [];
    let count = 0;
    
    // Get the highest existing sequential ID number
    const maxIdResult = await executeQuery(() => 
      db.execute(sql`
        SELECT MAX(SUBSTRING(order_id, 5)::integer) as max_id
        FROM orders
        WHERE tenant_id = ${tenantId}
        AND order_id LIKE 'ORD-%'
      `)
    );
    
    let startIndex = 0;
    if (maxIdResult.rows && maxIdResult.rows[0] && maxIdResult.rows[0].max_id) {
      startIndex = parseInt(maxIdResult.rows[0].max_id);
    }
    
    // Process each order using traditional for loop
    for (let i = 0; i < orderList.length; i++) {
      const order = orderList[i];
      // Generate a new sequential ID with the next number in sequence
      const sequentialId = `ORD-${(startIndex + i + 1).toString().padStart(5, '0')}`;
      
      try {
        // Update the order record using raw SQL
        await executeQuery(() => 
          db.execute(sql`
            UPDATE orders 
            SET order_id = ${sequentialId} 
            WHERE id = ${order.id} AND tenant_id = ${tenantId}
          `)
        );
        
        count++;
      } catch (err) {
        console.error(`Error updating order ID for order ${order.id}:`, err);
      }
    }
    
    console.log(`Successfully migrated ${count} order IDs`);
  } catch (error) {
    console.error("Error migrating order IDs:", error);
  }
}

async function migrateVendorIds(tenantId: number) {
  console.log(`Migrating vendor IDs for tenant ${tenantId}...`);
  
  try {
    // Get all vendors for this tenant
    const vendorList = await executeQuery(() => 
      db.select().from(vendors).where(eq(vendors.tenantId, tenantId))
    );
    
    let count = 0;
    
    // Process each vendor
    for (const [index, vendor] of vendorList.entries()) {
      // Generate a new sequential ID
      const sequentialId = `VEND-${(index + 1).toString().padStart(5, '0')}`;
      
      // Update the vendor record
      await executeQuery(() => 
        db.update(vendors)
          .set({ vendorId: sequentialId })
          .where(
            and(
              eq(vendors.id, vendor.id),
              eq(vendors.tenantId, tenantId)
            )
          )
      );
      
      count++;
    }
    
    console.log(`Successfully migrated ${count} vendor IDs`);
  } catch (error) {
    console.error("Error migrating vendor IDs:", error);
  }
}

async function migrateItemCategoryIds(tenantId: number) {
  console.log(`Migrating item category IDs for tenant ${tenantId}...`);
  
  try {
    // Get all item categories for this tenant that don't already have sequential IDs
    const categoryResult = await executeQuery(() => 
      db.execute(sql`
        SELECT id, tenant_id, category_id, name
        FROM item_categories 
        WHERE tenant_id = ${tenantId}
        AND (category_id IS NULL OR category_id NOT LIKE 'CAT-%')
      `)
    );
    
    const categoryList = categoryResult.rows || [];
    if (categoryList.length === 0) {
      console.log(`No item categories found needing migration for tenant ${tenantId}`);
      return 0;
    }
    
    // Get the highest existing sequential ID number
    const maxIdResult = await executeQuery(() => 
      db.execute(sql`
        SELECT MAX(SUBSTRING(category_id, 5)::integer) as max_id
        FROM item_categories
        WHERE tenant_id = ${tenantId}
        AND category_id LIKE 'CAT-%'
      `)
    );
    
    let startIndex = 0;
    if (maxIdResult.rows && maxIdResult.rows[0] && maxIdResult.rows[0].max_id) {
      startIndex = parseInt(maxIdResult.rows[0].max_id);
    }
    
    console.log(`Found ${categoryList.length} item categories to migrate, starting from index ${startIndex}`);
    
    let count = 0;
    
    // Update each item category
    for (let i = 0; i < categoryList.length; i++) {
      const category = categoryList[i];
      // Generate a new sequential ID with the next number in sequence
      const sequentialId = `CAT-${(startIndex + i + 1).toString().padStart(5, '0')}`;
      
      try {
        // Check if this ID already exists to avoid duplicate key violations
        const existingCheck = await executeQuery(() => 
          db.execute(sql`
            SELECT COUNT(*) as count 
            FROM item_categories 
            WHERE tenant_id = ${tenantId} AND category_id = ${sequentialId}
          `)
        );
        
        if (existingCheck.rows[0].count > 0) {
          console.log(`Skipping ID ${sequentialId} as it already exists`);
          continue;
        }
        
        // Update the category record using raw SQL for consistency
        await executeQuery(() => 
          db.execute(sql`
            UPDATE item_categories 
            SET category_id = ${sequentialId} 
            WHERE id = ${category.id} AND tenant_id = ${tenantId}
          `)
        );
        
        count++;
      } catch (err) {
        console.error(`Error updating category ID for category ${category.name || category.id}:`, err);
      }
    }
    
    console.log(`Successfully migrated ${count} item category IDs`);
    return count;
  } catch (err) {
    console.error(`Error migrating item category IDs:`, err);
    return 0; // Continue with other migrations instead of throwing
  }
}

async function migrateItemSubcategoryIds(tenantId: number) {
  console.log(`Migrating item subcategory IDs for tenant ${tenantId}...`);
  
  try {
    // Get all item subcategories for this tenant
    const subcategoryList = await executeQuery(() => 
      db.select().from(itemSubcategories).where(eq(itemSubcategories.tenantId, tenantId))
    );
    
    let count = 0;
    
    // Process each subcategory
    for (const [index, subcategory] of subcategoryList.entries()) {
      // Generate a new sequential ID
      const sequentialId = `SUB-${(index + 1).toString().padStart(5, '0')}`;
      
      // Update the subcategory record
      await executeQuery(() => 
        db.update(itemSubcategories)
          .set({ subcategoryId: sequentialId })
          .where(
            and(
              eq(itemSubcategories.id, subcategory.id),
              eq(itemSubcategories.tenantId, tenantId)
            )
          )
      );
      
      count++;
    }
    
    console.log(`Successfully migrated ${count} item subcategory IDs`);
  } catch (error) {
    console.error("Error migrating item subcategory IDs:", error);
  }
}

async function migrateItemIds(tenantId: number) {
  console.log(`Migrating item IDs for tenant ${tenantId}...`);
  
  try {
    // Get all items for this tenant that don't already have sequential IDs
    const itemResult = await executeQuery(() => 
      db.execute(sql`
        SELECT id, tenant_id, item_code
        FROM items 
        WHERE tenant_id = ${tenantId}
        AND (item_code IS NULL OR item_code NOT LIKE 'ITEM-%')
      `)
    );
    
    const itemList = itemResult.rows || [];
    if (itemList.length === 0) {
      console.log(`No items found needing migration for tenant ${tenantId}`);
      return 0;
    }
    
    // Get the highest existing sequential ID number
    const maxIdResult = await executeQuery(() => 
      db.execute(sql`
        SELECT MAX(SUBSTRING(item_code, 6)::integer) as max_id
        FROM items
        WHERE tenant_id = ${tenantId}
        AND item_code LIKE 'ITEM-%'
      `)
    );
    
    let startIndex = 0;
    if (maxIdResult.rows && maxIdResult.rows[0] && maxIdResult.rows[0].max_id) {
      startIndex = parseInt(maxIdResult.rows[0].max_id);
    }
    
    console.log(`Found ${itemList.length} items to migrate, starting from index ${startIndex}`);
    
    let count = 0;
    
    // Process each item using traditional for loop
    for (let i = 0; i < itemList.length; i++) {
      const item = itemList[i];
      // Generate a new sequential ID with the next number in sequence
      const sequentialId = `ITEM-${(startIndex + i + 1).toString().padStart(5, '0')}`;
      
      try {
        // Check if this ID already exists to avoid duplicate key violations
        const existingCheck = await executeQuery(() => 
          db.execute(sql`
            SELECT COUNT(*) as count 
            FROM items 
            WHERE tenant_id = ${tenantId} AND item_code = ${sequentialId}
          `)
        );
        
        if (existingCheck.rows[0].count > 0) {
          console.log(`Skipping ID ${sequentialId} as it already exists`);
          continue;
        }
        
        // Update the item record using raw SQL - using item_code instead of item_id
        await executeQuery(() => 
          db.execute(sql`
            UPDATE items 
            SET item_code = ${sequentialId} 
            WHERE id = ${item.id} AND tenant_id = ${tenantId}
          `)
        );
        
        count++;
      } catch (err) {
        console.error(`Error updating item ID for item ${item.id}:`, err);
      }
    }
    
    console.log(`Successfully migrated ${count} item IDs`);
    return count;
  } catch (err) {
    console.error(`Error migrating item IDs:`, err);
    return 0; // Continue with other migrations instead of throwing
  }
}

async function migrateWarehouseIds(tenantId: number) {
  console.log(`Migrating warehouse IDs for tenant ${tenantId}...`);
  
  try {
    // Get all warehouses for this tenant that don't already have sequential IDs
    const warehouseResult = await executeQuery(() => 
      db.execute(sql`
        SELECT id, tenant_id, warehouse_id 
        FROM warehouses 
        WHERE tenant_id = ${tenantId}
        AND (warehouse_id IS NULL OR warehouse_id NOT LIKE 'WH-%')
      `)
    );
    
    const warehouseList = warehouseResult.rows || [];
    if (warehouseList.length === 0) {
      console.log(`No warehouses found needing migration for tenant ${tenantId}`);
      return 0;
    }
    
    // Get the highest existing sequential ID number
    const maxIdResult = await executeQuery(() => 
      db.execute(sql`
        SELECT MAX(SUBSTRING(warehouse_id, 4)::integer) as max_id
        FROM warehouses
        WHERE tenant_id = ${tenantId}
        AND warehouse_id LIKE 'WH-%'
      `)
    );
    
    let startIndex = 0;
    if (maxIdResult.rows && maxIdResult.rows[0] && maxIdResult.rows[0].max_id) {
      startIndex = parseInt(maxIdResult.rows[0].max_id);
    }
    
    console.log(`Found ${warehouseList.length} warehouses to migrate, starting from index ${startIndex}`);
    
    let count = 0;
    
    // Process each warehouse using traditional for loop
    for (let i = 0; i < warehouseList.length; i++) {
      const warehouse = warehouseList[i];
      // Generate a new sequential ID with the next number in sequence
      const sequentialId = `WH-${(startIndex + i + 1).toString().padStart(5, '0')}`;
      
      try {
        // Check if this ID already exists to avoid duplicate key violations
        const existingCheck = await executeQuery(() => 
          db.execute(sql`
            SELECT COUNT(*) as count 
            FROM warehouses 
            WHERE tenant_id = ${tenantId} AND warehouse_id = ${sequentialId}
          `)
        );
        
        if (existingCheck.rows[0].count > 0) {
          console.log(`Skipping ID ${sequentialId} as it already exists`);
          continue;
        }
        
        // Update the warehouse record using raw SQL
        await executeQuery(() => 
          db.execute(sql`
            UPDATE warehouses 
            SET warehouse_id = ${sequentialId} 
            WHERE id = ${warehouse.id} AND tenant_id = ${tenantId}
          `)
        );
        
        count++;
      } catch (err) {
        console.error(`Error updating warehouse ID for warehouse ${warehouse.id}:`, err);
      }
    }
    
    console.log(`Successfully migrated ${count} warehouse IDs`);
    return count;
  } catch (err) {
    console.error(`Error migrating warehouse IDs:`, err);
    return 0; // Continue with other migrations instead of throwing
  }
}

async function migrateVoucherIds(tenantId: number) {
  console.log(`Migrating voucher IDs for tenant ${tenantId}...`);
  
  try {
    // Get all vouchers for this tenant that don't already have sequential IDs
    const voucherResult = await executeQuery(() => 
      db.execute(sql`
        SELECT id, tenant_id, voucher_type_id, voucher_number
        FROM vouchers 
        WHERE tenant_id = ${tenantId}
        AND (voucher_number IS NULL OR voucher_number NOT LIKE 'V%-%')
      `)
    );
    
    const voucherList = voucherResult.rows || [];
    if (voucherList.length === 0) {
      console.log(`No vouchers found needing migration for tenant ${tenantId}`);
      return 0;
    }
    
    // Group vouchers by type to handle prefixes properly
    const vouchersByType = {};
    
    for (let i = 0; i < voucherList.length; i++) {
      const voucher = voucherList[i];
      const voucherTypeId = voucher.voucher_type_id || voucher.voucherTypeId || 0;
      
      if (!vouchersByType[voucherTypeId]) {
        vouchersByType[voucherTypeId] = [];
      }
      
      vouchersByType[voucherTypeId].push(voucher);
    }
    
    let totalCount = 0;
    
    // Process each voucher type separately to maintain proper sequence per type
    for (const typeId in vouchersByType) {
      const typeVouchers = vouchersByType[typeId];
      // Determine voucher type prefix
      let prefix = "VCHR";
      
      if (typeId === "1") prefix = "VEXP"; // Expense 
      else if (typeId === "2") prefix = "VREC"; // Receipt
      else if (typeId === "3") prefix = "VPAY"; // Payment
      else if (typeId === "4") prefix = "VJNL"; // Journal
      else if (typeId === "5") prefix = "VCON"; // Contra
      else prefix = `V${typeId || "CHR"}`;
      
      // Get the highest existing sequential ID number for this type
      const maxIdResult = await executeQuery(() => 
        db.execute(sql`
          SELECT MAX(SUBSTRING(voucher_number, ${prefix.length + 2})::integer) as max_id
          FROM vouchers
          WHERE tenant_id = ${tenantId}
          AND voucher_number LIKE ${prefix + '-%'}
        `)
      );
      
      let startIndex = 0;
      if (maxIdResult.rows && maxIdResult.rows[0] && maxIdResult.rows[0].max_id) {
        startIndex = parseInt(maxIdResult.rows[0].max_id);
      }
      
      console.log(`Found ${typeVouchers.length} ${prefix} vouchers to migrate, starting from index ${startIndex}`);
      
      let typeCount = 0;
      
      // Process each voucher of this type
      for (let i = 0; i < typeVouchers.length; i++) {
        const voucher = typeVouchers[i];
        // Generate a new sequential ID
        const sequentialId = `${prefix}-${(startIndex + i + 1).toString().padStart(5, '0')}`;
        
        try {
          // Check if this ID already exists to avoid duplicate key violations
          const existingCheck = await executeQuery(() => 
            db.execute(sql`
              SELECT COUNT(*) as count 
              FROM vouchers 
              WHERE tenant_id = ${tenantId} AND voucher_number = ${sequentialId}
            `)
          );
          
          if (existingCheck.rows[0].count > 0) {
            console.log(`Skipping ID ${sequentialId} as it already exists`);
            continue;
          }
          
          // Update the voucher record using raw SQL
          await executeQuery(() => 
            db.execute(sql`
              UPDATE vouchers 
              SET voucher_number = ${sequentialId} 
              WHERE id = ${voucher.id} AND tenant_id = ${tenantId}
            `)
          );
          
          typeCount++;
        } catch (err) {
          console.error(`Error updating voucher ID for voucher ${voucher.id}:`, err);
        }
      }
      
      totalCount += typeCount;
      console.log(`Successfully migrated ${typeCount} ${prefix} vouchers`);
    }
    
    console.log(`Successfully migrated a total of ${totalCount} voucher IDs`);
    return totalCount;
  } catch (err) {
    console.error(`Error migrating voucher IDs:`, err);
    return 0; // Continue with other migrations instead of throwing
  }
}

async function migrateJournalIds(tenantId: number) {
  console.log(`Migrating journal IDs for tenant ${tenantId}...`);
  
  try {
    // Get all journals for this tenant - use simple SQL query to avoid schema mismatch issues
    const journalResult = await executeQuery(() => 
      db.execute(sql`SELECT id, tenant_id FROM journals WHERE tenant_id = ${tenantId}`)
    );
    
    const journalList = journalResult.rows || [];
    let count = 0;
    
    // Process each journal
    for (let i = 0; i < journalList.length; i++) {
      const journal = journalList[i];
      // Generate a new sequential ID
      const sequentialId = `JNL-${(i + 1).toString().padStart(5, '0')}`;
      
      // Update the journal record - use simple SQL to avoid schema issues
      await executeQuery(() => 
        db.execute(sql`
          UPDATE journals 
          SET journal_number = ${sequentialId} 
          WHERE id = ${journal.id} AND tenant_id = ${tenantId}
        `)
      );
      
      count++;
    }
    
    console.log(`Successfully migrated ${count} journal IDs`);
  } catch (error) {
    console.error("Error migrating journal IDs:", error);
  }
}

async function migrateCurrencyIds(tenantId: number) {
  console.log(`Migrating currency IDs for tenant ${tenantId}...`);
  
  try {
    // Get all currencies for this tenant - use raw SQL to avoid schema mismatches
    const currencyResult = await executeQuery(() => 
      db.execute(sql`
        SELECT id, tenant_id, code, name 
        FROM currencies 
        WHERE tenant_id = ${tenantId}
      `)
    );
    
    const currencyList = currencyResult.rows || [];
    let count = 0;
    
    // Process each currency
    for (let i = 0; i < currencyList.length; i++) {
      const currency = currencyList[i];
      // Generate a new sequential ID
      const sequentialId = `CUR-${(i + 1).toString().padStart(5, '0')}`;
      
      // Update the currency record
      // Instead of changing code (which might break functionality), 
      // we'll append the sequential ID to the name
      const updatedName = `${currency.name} (${sequentialId})`;
      
      await executeQuery(() => 
        db.execute(sql`
          UPDATE currencies 
          SET name = ${updatedName}
          WHERE id = ${currency.id} AND tenant_id = ${tenantId}
        `)
      );
      
      count++;
    }
    
    console.log(`Successfully migrated ${count} currency IDs`);
  } catch (error) {
    console.error("Error migrating currency IDs:", error);
  }
}

// Employee migration removed as employees table is not yet in the schema

/**
 * Main migration function that orchestrates the update of all entity IDs
 */
export async function migrateAllSequentialIds() {
  try {
    console.log("Starting sequential ID migration...");
    
    // Get all tenant IDs
    const tenantResults = await executeQuery(() => 
      db.select({ id: sql`id` }).from(sql`tenants`)
    );
    
    const tenantIds = tenantResults.map(result => result.id as number);
    
    // For each tenant, update all entity types
    for (const tenantId of tenantIds) {
      console.log(`\nProcessing tenant ID: ${tenantId}`);
      
      // Migrate each entity type
      await migrateCustomerIds(tenantId);
      await migrateInquiryIds(tenantId);
      await migrateQuotationIds(tenantId);
      await migrateOrderIds(tenantId);
      
      // Check if vendors table exists before attempting migration
      try {
        await executeQuery(() => 
          db.execute(sql`SELECT 1 FROM vendors LIMIT 1`)
        );
        // If no error, table exists, proceed with migration
        await migrateVendorIds(tenantId);
      } catch (error) {
        console.log("Vendors table does not exist, skipping vendor ID migration");
      }
      
      await migrateItemCategoryIds(tenantId);
      await migrateItemSubcategoryIds(tenantId);
      await migrateItemIds(tenantId);
      await migrateWarehouseIds(tenantId);
      await migrateVoucherIds(tenantId);
      await migrateJournalIds(tenantId);
      await migrateCurrencyIds(tenantId);
    }
    
    console.log("\nSequential ID migration completed successfully!");
  } catch (error) {
    console.error("Error during sequential ID migration:", error);
  } finally {
    // Ensure database connection is closed
    console.log("Migration script finished, exiting process...");
    process.exit(0);
  }
}

// Execute the migration
migrateAllSequentialIds().catch(error => {
  console.error("Migration failed:", error);
  process.exit(1);
});