import { pool } from '../db';

/**
 * Special utility to safely format a date for PostgreSQL (YYYY-MM-DD)
 */
function formatDateForPostgres(dateValue: any): string | null {
  if (!dateValue) return null;
  
  try {
    // If it's already a string in YYYY-MM-DD format, return it
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    
    // If it's a date object or can be converted to one, format it
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid date value");
    }
    
    // Format as YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (err) {
    console.warn("Date formatting error:", err);
    return null;
  }
}

/**
 * Directly updates an inquiry using raw SQL queries to avoid ORM issues
 */
export async function updateInquiryDirect(id: number, tenantId: number, data: Record<string, any>): Promise<any> {
  // Connect to the database directly
  const client = await pool.connect();
  
  try {
    // Start a transaction
    await client.query('BEGIN');
    
    // First verify the inquiry exists
    const checkResult = await client.query(
      'SELECT id FROM inquiries WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    
    if (checkResult.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new Error("Inquiry not found");
    }
    
    // Build a clean update object with proper types
    const cleanData: Record<string, any> = {};
    
    // Basic fields
    if (data.styleName !== undefined) cleanData.style_name = String(data.styleName);
    if (data.inquiryType !== undefined) cleanData.inquiry_type = String(data.inquiryType);
    if (data.department !== undefined) cleanData.department = String(data.department);
    if (data.projectedQuantity !== undefined) cleanData.projected_quantity = Number(data.projectedQuantity);
    if (data.targetPrice !== undefined) cleanData.target_price = Number(data.targetPrice);
    if (data.customerId !== undefined) cleanData.customer_id = Number(data.customerId);
    if (data.status !== undefined) cleanData.status = String(data.status);
    if (data.technicalFiles !== undefined) cleanData.technical_files = data.technicalFiles;
    
    // New fields added to the schema
    if (data.seasonYear !== undefined) cleanData.season_year = String(data.seasonYear);
    if (data.brand !== undefined) cleanData.brand = String(data.brand);
    if (data.materialComposition !== undefined) cleanData.material_composition = String(data.materialComposition);
    if (data.sizeRange !== undefined) cleanData.size_range = String(data.sizeRange);
    if (data.colorOptions !== undefined) cleanData.color_options = data.colorOptions;
    if (data.countryOfOrigin !== undefined) cleanData.country_of_origin = String(data.countryOfOrigin);
    if (data.incoterms !== undefined) cleanData.incoterms = String(data.incoterms);
    if (data.specialRequirements !== undefined) cleanData.special_requirements = String(data.specialRequirements);
    if (data.contactPersonRef !== undefined) cleanData.contact_person_ref = String(data.contactPersonRef);
    
    // Handle date field with special care
    const formattedDate = formatDateForPostgres(data.projectedDeliveryDate);
    if (formattedDate) {
      cleanData.projected_delivery_date = formattedDate;
    }
    
    // Use NOW() directly for the updated_at timestamp instead of a JavaScript Date
    // This avoids the toISOString error
    cleanData.updated_at = 'NOW()';
    
    // Build the update SET clause and values
    const updateParts: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    Object.entries(cleanData).forEach(([key, value]) => {
      // Special handling for updated_at to use NOW() function directly
      if (key === 'updated_at' && value === 'NOW()') {
        updateParts.push(`${key} = NOW()`); // Use PostgreSQL NOW() function directly
      } else {
        updateParts.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    });
    
    // If there's nothing to update, return early
    if (updateParts.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    
    // Add parameters for the WHERE clause
    values.push(id);
    values.push(tenantId);
    
    // Build and execute the final query
    const updateSql = `
      UPDATE inquiries 
      SET ${updateParts.join(', ')} 
      WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
      RETURNING *
    `;
    
    console.log("Executing SQL:", updateSql);
    const result = await client.query(updateSql, values);
    
    // Check if update was successful
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new Error("Update failed");
    }
    
    // Commit the transaction
    await client.query('COMMIT');
    
    // Convert snake_case to camelCase for response
    const updatedInquiry = result.rows[0];
    return {
      id: updatedInquiry.id,
      inquiryId: updatedInquiry.inquiry_id,
      customerId: updatedInquiry.customer_id,
      styleName: updatedInquiry.style_name,
      inquiryType: updatedInquiry.inquiry_type,
      department: updatedInquiry.department,
      projectedQuantity: updatedInquiry.projected_quantity,
      projectedDeliveryDate: updatedInquiry.projected_delivery_date,
      targetPrice: updatedInquiry.target_price,
      
      // Return all new fields
      seasonYear: updatedInquiry.season_year,
      brand: updatedInquiry.brand,
      materialComposition: updatedInquiry.material_composition,
      sizeRange: updatedInquiry.size_range,
      colorOptions: updatedInquiry.color_options || [],
      countryOfOrigin: updatedInquiry.country_of_origin,
      incoterms: updatedInquiry.incoterms,
      specialRequirements: updatedInquiry.special_requirements,
      contactPersonRef: updatedInquiry.contact_person_ref,
      
      technicalFiles: updatedInquiry.technical_files || [],
      status: updatedInquiry.status,
      tenantId: updatedInquiry.tenant_id,
      createdAt: updatedInquiry.created_at,
      updatedAt: updatedInquiry.updated_at
    };
  } catch (error) {
    // Rollback the transaction if anything goes wrong
    await client.query('ROLLBACK');
    console.error("Error in direct inquiry update:", error);
    throw error;
  } finally {
    // Always release the client back to the pool
    client.release();
  }
}