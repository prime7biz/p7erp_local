import { eq, and, or, gte, lte, like, sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Secure query builder with tenant isolation and parameterization
 */
export class SecureQueryBuilder {
  
  /**
   * Build secure SELECT query with tenant isolation
   */
  static select(table: any, tenantId: number, conditions: any = {}) {
    let query = db.select().from(table).where(eq(table.tenantId, tenantId));
    
    // Add additional conditions securely
    if (conditions.id) {
      query = query.where(and(eq(table.tenantId, tenantId), eq(table.id, conditions.id)));
    }
    
    if (conditions.status) {
      query = query.where(and(eq(table.tenantId, tenantId), eq(table.status, conditions.status)));
    }
    
    if (conditions.dateRange) {
      query = query.where(and(
        eq(table.tenantId, tenantId),
        gte(table.createdAt, conditions.dateRange.start),
        lte(table.createdAt, conditions.dateRange.end)
      ));
    }
    
    return query;
  }
  
  /**
   * Build secure UPDATE query with tenant isolation
   */
  static update(table: any, tenantId: number, id: number, data: any) {
    return db.update(table)
      .set(data)
      .where(and(eq(table.tenantId, tenantId), eq(table.id, id)))
      .returning();
  }
  
  /**
   * Build secure DELETE query with tenant isolation
   */
  static delete(table: any, tenantId: number, id: number) {
    return db.delete(table)
      .where(and(eq(table.tenantId, tenantId), eq(table.id, id)))
      .returning();
  }
  
  /**
   * Build secure INSERT query with tenant isolation
   */
  static insert(table: any, data: any, tenantId: number) {
    return db.insert(table)
      .values({ ...data, tenantId })
      .returning();
  }
  
  /**
   * Secure search query with tenant isolation
   */
  static search(table: any, tenantId: number, searchTerm: string, searchFields: string[]) {
    const searchConditions = searchFields.map(field => 
      like(table[field], `%${searchTerm}%`)
    );
    
    return db.select()
      .from(table)
      .where(and(
        eq(table.tenantId, tenantId),
        or(...searchConditions)
      ));
  }
  
  /**
   * Validate and sanitize SQL parameters
   */
  static sanitizeParams(params: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) {
        sanitized[key] = null;
        continue;
      }
      
      switch (typeof value) {
        case 'string':
          // Remove potential SQL injection patterns
          sanitized[key] = value
            .replace(/['"\\;]/g, '') // Remove quotes and semicolons
            .trim()
            .slice(0, 1000); // Limit length
          break;
        case 'number':
          sanitized[key] = isFinite(value) ? value : 0;
          break;
        case 'boolean':
          sanitized[key] = Boolean(value);
          break;
        default:
          sanitized[key] = String(value).slice(0, 1000);
      }
    }
    
    return sanitized;
  }
  
  /**
   * Execute raw SQL with parameterization (use sparingly)
   */
  static executeRaw(query: string, params: any[] = []) {
    // Validate that query contains proper parameter placeholders
    const parameterCount = (query.match(/\$\d+/g) || []).length;
    if (parameterCount !== params.length) {
      throw new Error('Parameter count mismatch in SQL query');
    }
    
    // Sanitize parameters
    const sanitizedParams = params.map(param => {
      if (typeof param === 'string') {
        return param.replace(/['"\\;]/g, '').trim();
      }
      return param;
    });
    
    return db.execute(sql.raw(query, sanitizedParams));
  }
}

/**
 * Report generation with secure parameterized queries
 */
export class SecureReportBuilder {
  
  static async generateOrderReport(tenantId: number, filters: any = {}) {
    let query = `
      SELECT 
        o.id,
        o.order_id as order_number,
        o.customer_id,
        c.name as customer_name,
        o.style_name,
        o.order_date,
        o.delivery_date,
        o.shipping_date,
        o.order_status
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.tenant_id = $1 AND c.tenant_id = $1
    `;
    
    const params = [tenantId];
    let paramIndex = 2;
    
    if (filters.startDate) {
      query += ` AND o.order_date >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }
    
    if (filters.endDate) {
      query += ` AND o.order_date <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }
    
    if (filters.customerId) {
      query += ` AND o.customer_id = $${paramIndex}`;
      params.push(filters.customerId);
      paramIndex++;
    }
    
    query += ` ORDER BY o.order_date DESC`;
    
    return SecureQueryBuilder.executeRaw(query, params);
  }
  
  static async generateFinancialReport(tenantId: number, options: any = {}) {
    const query = `
      SELECT 
        coa.id,
        coa.account_number,
        coa.name,
        at.name AS account_type,
        at.category AS account_category,
        COALESCE(SUM(CASE WHEN j.journal_date < $2 THEN 
          CAST(jl.debit_amount AS DECIMAL(15,2)) - CAST(jl.credit_amount AS DECIMAL(15,2)) 
          ELSE 0 END), 0) AS opening_balance
      FROM chart_of_accounts coa
      JOIN account_types at ON at.id = coa.account_type_id AND at.tenant_id = coa.tenant_id
      LEFT JOIN journal_lines jl ON jl.account_id = coa.id AND jl.tenant_id = coa.tenant_id
      LEFT JOIN journals j ON j.id = jl.journal_id AND j.tenant_id = jl.tenant_id
      WHERE coa.tenant_id = $1 AND at.tenant_id = $1
      GROUP BY coa.id, coa.account_number, coa.name, at.name, at.category
      ORDER BY coa.account_number
    `;
    
    return SecureQueryBuilder.executeRaw(query, [
      tenantId,
      options.startDate || new Date().toISOString().split('T')[0]
    ]);
  }
}