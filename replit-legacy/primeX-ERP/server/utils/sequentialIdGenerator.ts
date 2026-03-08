import { db } from "../db";
import { 
  customers, 
  inquiries, 
  quotations, 
  orders, 
  itemCategories, 
  itemSubcategories, 
  items,
  vendors,
  warehouses,
  vouchers,
  currencies,
  journals,
  employees
} from "@shared/schema";
import { exportDocuments } from "@shared/schema/commercial";
import { count, eq, desc, sql, max } from "drizzle-orm";

/**
 * A utility class providing standardized sequential ID generation
 * for all entity types in the system.
 */
export class SequentialIdGenerator {
  /**
   * Generates a sequential customer ID in format CUST-XXXXX
   */
  static async generateCustomerId(tenantId: number): Promise<string> {
    try {
      // Get the latest customer to find the highest ID
      const [result] = await db
        .select({ count: count() })
        .from(customers)
        .where(eq(customers.tenantId, tenantId));
      
      const nextId = (result?.count || 0) + 1;
      return `CUST-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating customer ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `CUST-${timestamp}`;
    }
  }

  /**
   * Generates a sequential inquiry ID in format INQ-XXXXX
   */
  static async generateInquiryId(tenantId: number): Promise<string> {
    try {
      const [result] = await db
        .select({ maxId: max(inquiries.inquiryId) })
        .from(inquiries)
        .where(eq(inquiries.tenantId, tenantId));
      
      let nextNum = 1;
      if (result?.maxId) {
        const match = result.maxId.match(/INQ-(\d+)/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      return `INQ-${nextNum.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating inquiry ID:", error);
      const timestamp = Date.now().toString().slice(-5);
      return `INQ-${timestamp}`;
    }
  }

  /**
   * Generates a sequential quotation ID in format QUO-XXXXX
   */
  static async generateQuotationId(tenantId: number): Promise<string> {
    try {
      const [result] = await db
        .select({ maxId: max(quotations.quotationId) })
        .from(quotations)
        .where(eq(quotations.tenantId, tenantId));
      
      let nextNum = 1;
      if (result?.maxId) {
        const match = result.maxId.match(/QUO-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      return `QUO-${nextNum.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating quotation ID:", error);
      const timestamp = Date.now().toString().slice(-5);
      return `QUO-${timestamp}`;
    }
  }

  /**
   * Generates a sequential order ID in format ORD-XXXXX
   */
  static async generateOrderId(tenantId: number): Promise<string> {
    try {
      // Get the latest order to find the highest ID
      const [result] = await db
        .select({ count: count() })
        .from(orders)
        .where(eq(orders.tenantId, tenantId));
      
      const nextId = (result?.count || 0) + 1;
      return `ORD-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating order ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `ORD-${timestamp}`;
    }
  }

  /**
   * Generates a sequential item category ID in format CAT-XXXXX
   */
  static async generateCategoryId(tenantId: number): Promise<string> {
    try {
      // Get the latest category to find the highest ID
      const [result] = await db
        .select({ count: count() })
        .from(itemCategories)
        .where(eq(itemCategories.tenantId, tenantId));
      
      const nextId = (result?.count || 0) + 1;
      return `CAT-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating category ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `CAT-${timestamp}`;
    }
  }

  /**
   * Generates a sequential item subcategory ID in format SUB-XXXXX
   */
  static async generateSubcategoryId(tenantId: number): Promise<string> {
    try {
      // Get the latest subcategory to find the highest ID
      const [result] = await db
        .select({ count: count() })
        .from(itemSubcategories)
        .where(eq(itemSubcategories.tenantId, tenantId));
      
      const nextId = (result?.count || 0) + 1;
      return `SUB-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating subcategory ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `SUB-${timestamp}`;
    }
  }

  /**
   * Generates a sequential item ID in format ITEM-XXXXX or a custom prefix
   */
  static async generateItemId(tenantId: number, prefix: string = "ITEM"): Promise<string> {
    try {
      // Get the latest item to find the highest ID
      const [result] = await db
        .select({ count: count() })
        .from(items)
        .where(eq(items.tenantId, tenantId));
      
      const nextId = (result?.count || 0) + 1;
      return `${prefix}-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating item ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `${prefix}-${timestamp}`;
    }
  }
  
  /**
   * Generates a sequential vendor ID in format VEND-XXXXX
   */
  static async generateVendorId(tenantId: number): Promise<string> {
    try {
      // Get the latest vendor to find the highest ID
      const [result] = await db
        .select({ count: count() })
        .from(vendors)
        .where(eq(vendors.tenantId, tenantId));
      
      const nextId = (result?.count || 0) + 1;
      return `VEND-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating vendor ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `VEND-${timestamp}`;
    }
  }
  
  /**
   * Generates a sequential warehouse ID in format WH-XXXXX
   */
  static async generateWarehouseId(tenantId: number): Promise<string> {
    try {
      // Get the latest warehouse to find the highest ID
      const [result] = await db
        .select({ count: count() })
        .from(warehouses)
        .where(eq(warehouses.tenantId, tenantId));
      
      const nextId = (result?.count || 0) + 1;
      return `WH-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating warehouse ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `WH-${timestamp}`;
    }
  }
  
  /**
   * Generates a sequential document ID in format DOC-XXXXX
   * @param tenantId The tenant ID to filter by
   * @param documentType Optional document type prefix (e.g., 'INV' for invoice)
   */
  static async generateDocumentId(tenantId: number, documentType?: string): Promise<string> {
    try {
      // Get the count of existing documents for this tenant
      const [result] = await db
        .select({ count: count() })
        .from(exportDocuments)
        .where(eq(exportDocuments.tenantId, tenantId));
      
      const nextId = (result?.count || 0) + 1;
      
      // Use document type as prefix if provided, otherwise use DOC
      const prefix = documentType ? 
        documentType.substring(0, 3).toUpperCase() : 
        "DOC";
        
      return `${prefix}-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating document ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      const prefix = documentType ? 
        documentType.substring(0, 3).toUpperCase() : 
        "DOC";
      return `${prefix}-${timestamp}`;
    }
  }
  
  /**
   * Generates a sequential voucher ID in format VEXP-XXXXX (for expenses)
   * @param tenantId The tenant ID to filter by
   * @param voucherType The type of voucher (e.g., 'EXPENSE', 'RECEIPT', 'PAYMENT')
   */
  static async generateVoucherId(tenantId: number, voucherType: string): Promise<string> {
    try {
      // Get the count of existing vouchers for this tenant
      const [result] = await db
        .select({ count: count() })
        .from(vouchers)
        .where(eq(vouchers.tenantId, tenantId));
      
      const nextId = (result?.count || 0) + 1;
      
      // Use voucher type to determine prefix
      let prefix = "VCH";
      if (voucherType) {
        // Create prefix based on voucher type
        if (voucherType.toUpperCase().includes("EXPENSE")) prefix = "VEXP";
        else if (voucherType.toUpperCase().includes("RECEIPT")) prefix = "VREC";
        else if (voucherType.toUpperCase().includes("PAYMENT")) prefix = "VPAY";
        else if (voucherType.toUpperCase().includes("JOURNAL")) prefix = "VJNL";
        else if (voucherType.toUpperCase().includes("CONTRA")) prefix = "VCON";
        else prefix = "V" + voucherType.substring(0, 3).toUpperCase();
      }
        
      return `${prefix}-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating voucher ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `VCH-${timestamp}`;
    }
  }
  
  /**
   * Generates a sequential journal entry ID in format JNL-XXXXX
   * @param tenantId The tenant ID to filter by
   */
  static async generateJournalEntryId(tenantId: number): Promise<string> {
    try {
      // Count all journal entries for this tenant
      const result = await db
        .select({ count: count() })
        .from(journals)
        .where(eq(journals.tenantId, tenantId));
      
      const recordCount = Number(result[0]?.count || 0);
      const nextId = recordCount + 1;
      return `JNL-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating journal entry ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `JNL-${timestamp}`;
    }
  }
  
  /**
   * Generates a sequential currency ID in format CUR-XXXXX
   * @param tenantId The tenant ID to filter by
   */
  static async generateCurrencyId(tenantId: number): Promise<string> {
    try {
      // Get the count of existing currencies for this tenant
      const result = await db
        .select({ count: count() })
        .from(currencies)
        .where(eq(currencies.tenantId, tenantId));
      
      const recordCount = Number(result[0]?.count || 0);
      const nextId = recordCount + 1;
      return `CUR-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating currency ID:", error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `CUR-${timestamp}`;
    }
  }
  
  /**
   * Generates a sequential employee ID in format EMP-XXXXX
   * @param tenantId The tenant ID to filter by
   */
  static async generateEmployeeId(tenantId: number): Promise<string> {
    try {
      const result = await db
        .select({ count: count() })
        .from(employees)
        .where(eq(employees.tenantId, tenantId));
      
      const recordCount = Number(result[0]?.count || 0);
      const nextId = recordCount + 1;
      return `EMP-${nextId.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error("Error generating employee ID:", error);
      const timestamp = Date.now().toString().slice(-5);
      return `EMP-${timestamp}`;
    }
  }

  /**
   * Generates a custom sequential ID for any entity type
   * @param tableName The schema table to count existing records from
   * @param prefix The prefix to use for the ID (e.g., "VENDOR", "INVOICE")
   * @param tenantId The tenant ID to filter by
   * @param padLength The number of digits to pad the sequential number to (default: 5)
   */
  static async generateCustomId(
    tableName: string,
    prefix: string,
    tenantId: number,
    padLength: number = 5
  ): Promise<string> {
    try {
      // For tables like "employees" that might not be directly available,
      // we'll use a raw SQL count query which is more flexible
      const query = `SELECT COUNT(*) as count FROM ${tableName} WHERE tenant_id = $1`;
      const result = await db.execute(query, [tenantId]);
      
      // Extract count from result (works with both raw queries and drizzle)
      const count = result.rows && result.rows[0] ? Number(result.rows[0].count) : 0;
      const nextId = count + 1;
      
      return `${prefix}-${nextId.toString().padStart(padLength, '0')}`;
    } catch (error) {
      console.error(`Error generating ${prefix} ID:`, error);
      // Fallback to a timestamp-based ID if there's an error
      const timestamp = Date.now().toString().slice(-5);
      return `${prefix}-${timestamp}`;
    }
  }
}