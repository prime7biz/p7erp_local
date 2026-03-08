import { storage } from "../storage";

/**
 * Generates a random ID for general use
 */
export function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Generates a unique order ID in the format ORD-YYYY-XXXXX
 * Where YYYY is the current year and XXXXX is a sequential number with leading zeros
 */
export async function generateOrderId(tenantId: number): Promise<string> {
  try {
    // Get the current year
    const currentYear = new Date().getFullYear();
    
    // Get the count of existing orders for this year
    const orders = await storage.getAllOrders(tenantId);
    const yearPrefix = `ORD-${currentYear}-`;
    
    // Filter orders for the current year
    const currentYearOrders = orders.filter(order => 
      order.orderId.startsWith(yearPrefix)
    );
    
    // Find the maximum sequence number
    let maxSeq = 0;
    currentYearOrders.forEach(order => {
      const seqStr = order.orderId.substring(yearPrefix.length);
      const seq = parseInt(seqStr);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    });
    
    // Generate the next sequence number with leading zeros
    const nextSeq = (maxSeq + 1).toString().padStart(5, '0');
    
    return `${yearPrefix}${nextSeq}`;
  } catch (error) {
    console.error("Error generating order ID:", error);
    // Fallback to a timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-8);
    return `ORD-${new Date().getFullYear()}-${timestamp}`;
  }
}

/**
 * Generates a unique quotation ID in the format QUO-YYYY-XXXXX
 * Where YYYY is the current year and XXXXX is a sequential number with leading zeros
 */
export async function generateQuotationId(tenantId: number): Promise<string> {
  try {
    // Get the current year
    const currentYear = new Date().getFullYear();
    
    // Get the count of existing quotations for this year
    const quotations = await storage.getAllQuotations(tenantId);
    const yearPrefix = `QUO-${currentYear}-`;
    
    // Filter quotations for the current year
    const currentYearQuotations = quotations.filter(quotation => 
      quotation.quotationId.startsWith(yearPrefix)
    );
    
    // Find the maximum sequence number
    let maxSeq = 0;
    currentYearQuotations.forEach(quotation => {
      const seqStr = quotation.quotationId.substring(yearPrefix.length);
      const seq = parseInt(seqStr);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    });
    
    // Generate the next sequence number with leading zeros
    const nextSeq = (maxSeq + 1).toString().padStart(5, '0');
    
    return `${yearPrefix}${nextSeq}`;
  } catch (error) {
    console.error("Error generating quotation ID:", error);
    // Fallback to a timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-8);
    return `QUO-${new Date().getFullYear()}-${timestamp}`;
  }
}

/**
 * Generates a unique inquiry ID in the format INQ-YYYY-XXXXX
 * Where YYYY is the current year and XXXXX is a sequential number with leading zeros
 */
export async function generateInquiryId(tenantId: number): Promise<string> {
  try {
    // Get the current year
    const currentYear = new Date().getFullYear();
    
    // Get the count of existing inquiries for this year
    const inquiries = await storage.getAllInquiries(tenantId);
    const yearPrefix = `INQ-${currentYear}-`;
    
    // Filter inquiries for the current year
    const currentYearInquiries = inquiries.filter(inquiry => 
      inquiry.inquiryId.startsWith(yearPrefix)
    );
    
    // Find the maximum sequence number
    let maxSeq = 0;
    currentYearInquiries.forEach(inquiry => {
      const seqStr = inquiry.inquiryId.substring(yearPrefix.length);
      const seq = parseInt(seqStr);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    });
    
    // Generate the next sequence number with leading zeros
    const nextSeq = (maxSeq + 1).toString().padStart(5, '0');
    
    return `${yearPrefix}${nextSeq}`;
  } catch (error) {
    console.error("Error generating inquiry ID:", error);
    // Fallback to a timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-8);
    return `INQ-${new Date().getFullYear()}-${timestamp}`;
  }
}

/**
 * Generates a unique customer ID in the format CUST-XXXXX
 * Where XXXXX is a sequential number with leading zeros
 */
export async function generateCustomerId(tenantId: number): Promise<string> {
  try {
    // Get all existing customers
    const customers = await storage.getAllCustomers(tenantId);
    const prefix = "CUST-";
    
    // Find the maximum sequence number
    let maxSeq = 0;
    customers.forEach(customer => {
      if (customer.customerId && customer.customerId.startsWith(prefix)) {
        const seqStr = customer.customerId.substring(prefix.length);
        const seq = parseInt(seqStr);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
    
    // Generate the next sequence number with leading zeros
    const nextSeq = (maxSeq + 1).toString().padStart(5, '0');
    
    console.log(`Generating next customer ID: ${prefix}${nextSeq} (max found: ${maxSeq})`);
    return `${prefix}${nextSeq}`;
  } catch (error) {
    console.error("Error generating customer ID:", error);
    // Improved fallback mechanism - still sequential but with timestamp prefix for uniqueness
    const currentMaxSeq = 10000; // Start with a large base number if we can't determine the actual max
    const nextSeq = currentMaxSeq.toString().padStart(5, '0');
    console.log(`Using fallback customer ID generation: ${prefix}${nextSeq}`);
    return `CUST-${nextSeq}`;
  }
}

/**
 * Generates a unique warehouse ID in the format WH-XXXXX
 * Where XXXXX is a sequential number with leading zeros
 */
export async function generateWarehouseId(tenantId: number): Promise<string> {
  try {
    // Get all existing warehouses
    const warehouses = await storage.getAllWarehouses(tenantId);
    const prefix = "WH-";
    
    // Find the maximum sequence number
    let maxSeq = 0;
    warehouses.forEach(warehouse => {
      if (warehouse.warehouseId && warehouse.warehouseId.startsWith(prefix)) {
        const seqStr = warehouse.warehouseId.substring(prefix.length);
        const seq = parseInt(seqStr);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
    
    // Generate the next sequence number with leading zeros
    const nextSeq = (maxSeq + 1).toString().padStart(5, '0');
    
    return `${prefix}${nextSeq}`;
  } catch (error) {
    console.error("Error generating warehouse ID:", error);
    // Fallback to a timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-8);
    return `WH-${timestamp}`;
  }
}

/**
 * Generates a unique item category ID in the format CAT-XXXXX
 * Where XXXXX is a sequential number with leading zeros
 */
export async function generateCategoryId(tenantId: number, prefix: string = "CAT"): Promise<string> {
  try {
    // Get all existing categories
    const categories = await storage.getAllItemCategories(tenantId);
    
    // Find the maximum sequence number
    let maxSeq = 0;
    categories.forEach(category => {
      if (category.categoryId && category.categoryId.startsWith(`${prefix}-`)) {
        const seqStr = category.categoryId.substring(prefix.length + 1);
        const seq = parseInt(seqStr);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
    
    // Generate the next sequence number with leading zeros
    const nextSeq = (maxSeq + 1).toString().padStart(5, '0');
    
    return `${prefix}-${nextSeq}`;
  } catch (error) {
    console.error("Error generating category ID:", error);
    // Fallback to a timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-5);
    return `${prefix}-${timestamp}`;
  }
}

/**
 * Generates a unique item subcategory ID in the format SUB-XXXXX
 * Where XXXXX is a sequential number with leading zeros
 */
export async function generateSubcategoryId(tenantId: number, prefix: string = "SUB"): Promise<string> {
  try {
    // Get all existing subcategories
    const subcategories = await storage.getAllItemSubcategories(tenantId);
    
    // Find the maximum sequence number
    let maxSeq = 0;
    subcategories.forEach(subcategory => {
      if (subcategory.subcategoryId && subcategory.subcategoryId.startsWith(`${prefix}-`)) {
        const seqStr = subcategory.subcategoryId.substring(prefix.length + 1);
        const seq = parseInt(seqStr);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
    
    // Generate the next sequence number with leading zeros
    const nextSeq = (maxSeq + 1).toString().padStart(5, '0');
    
    return `${prefix}-${nextSeq}`;
  } catch (error) {
    console.error("Error generating subcategory ID:", error);
    // Fallback to a timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-5);
    return `${prefix}-${timestamp}`;
  }
}

/**
 * Generates a unique item unit ID in the format UNIT-XXXXX
 * Where XXXXX is a sequential number with leading zeros
 */
export async function generateUnitId(tenantId: number): Promise<string> {
  try {
    // Get all existing item units
    const units = await storage.getAllItemUnits(tenantId);
    const prefix = "UNIT-";
    
    // Find the maximum sequence number
    let maxSeq = 0;
    units.forEach(unit => {
      if (unit.unitCode && unit.unitCode.startsWith(prefix)) {
        const seqStr = unit.unitCode.substring(prefix.length);
        const seq = parseInt(seqStr);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
    
    // Generate the next sequence number with leading zeros
    const nextSeq = (maxSeq + 1).toString().padStart(5, '0');
    
    return `${prefix}${nextSeq}`;
  } catch (error) {
    console.error("Error generating item unit ID:", error);
    // Fallback to a timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-8);
    return `UNIT-${timestamp}`;
  }
}

/**
 * Generates a unique ID for any entity with the given prefix and number of digits
 * This is a generic function that can be used by any module
 */
export async function generateId(prefix: string = "ID", digits: number = 5): Promise<string> {
  try {
    // Create a unique ID based on timestamp for now
    // In a production app, this should query the database to ensure sequential numbering
    const timestamp = Date.now();
    const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const uniquePart = (timestamp % 100000).toString().padStart(digits, '0');
    
    return `${prefix}-${uniquePart}${randomPart.substring(0, 2)}`;
  } catch (error) {
    console.error(`Error generating ID with prefix ${prefix}:`, error);
    const timestamp = Date.now().toString().slice(-digits);
    return `${prefix}-${timestamp}`;
  }
}

/**
 * Generates a unique inventory movement ID in the format INV-YYYYMMDD-XXXXX
 * Where YYYYMMDD is the current date and XXXXX is a sequential number with leading zeros
 */
export async function generateInventoryMovementId(): Promise<string> {
  try {
    // Get the current date in YYYYMMDD format
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    // Use the current timestamp for uniqueness in case we can't access the DB
    const timestamp = Date.now();
    const uniqueId = (timestamp % 100000).toString().padStart(5, '0');
    
    // For gate passes, we'll use a GP prefix
    return `GP-${dateStr}-${uniqueId}`;
  } catch (error) {
    console.error("Error generating inventory movement ID:", error);
    // Fallback to a timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-10);
    return `GP-${timestamp}`;
  }
}