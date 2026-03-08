import { parseIntParam } from "../utils/parseParams";
import { requireTenant } from "../utils/tenantScope";
import express, { Request, Response } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { formatDateForPostgres, formatDateTimeForPostgres } from '../utils/dateFormatter';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';
import { getBoss, REPORT_PDF_QUEUE } from '../jobs';
import { getReportsDir } from '../jobs/pdfGenerator';
import { requireAnyPermission } from '../middleware/rbacMiddleware';

const router = express.Router();

router.use(requireAnyPermission(
  'accounts:trial_balance:read',
  'accounts:pl:read',
  'accounts:balance_sheet:read',
  'accounts:voucher_register:read',
  'accounts:party_ledger:read',
  'inventory:stock_valuation:read',
  'inventory:stock_summary:read',
  'purchase:register:read',
  'sales:register:read',
  'hr:payroll_report:read'
));

const FORBIDDEN_SQL_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'MERGE', 'REPLACE', 'CALL',
  'SET ', 'COPY', 'LOAD', 'VACUUM', 'REINDEX', 'CLUSTER', 'COMMENT',
];

function validateReadOnlyQuery(queryText: string): void {
  const normalized = queryText.trim().replace(/\s+/g, ' ').toUpperCase();

  if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
    throw new Error('Only SELECT queries are allowed for reports');
  }

  if (queryText.includes(';')) {
    throw new Error('Multiple statements (semicolons) are not allowed in report queries');
  }

  for (const keyword of FORBIDDEN_SQL_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword.trim()}\\b`, 'i');
    if (pattern.test(normalized.replace(/^(SELECT|WITH)\b.*?\bFROM\b/s, ''))) {
      if (keyword.trim() === 'SET' && /\bOFFSET\b/i.test(queryText)) continue;
      throw new Error(`Forbidden SQL keyword detected: ${keyword.trim()}`);
    }
  }
}

const TEMPLATE_ALLOWED_COLUMNS = [
  'name', 'description', 'report_type', 'category', 'module', 'query_text', 'parameters', 'updated_at'
];

const WIDGET_ALLOWED_COLUMNS = [
  'name', 'description', 'widget_type', 'report_id', 'position', 'size', 'settings', 'is_shared', 'updated_at'
];

const SCHEDULE_ALLOWED_COLUMNS = [
  'name', 'description', 'template_id', 'parameters', 'schedule_type', 'schedule_config',
  'next_run_at', 'is_active', 'output_format', 'email_recipients', 'updated_at'
];

function validateColumnNames(columns: string[], allowedColumns: string[]): void {
  for (const col of columns) {
    if (!allowedColumns.includes(col)) {
      throw new Error(`Invalid column name: ${col}`);
    }
  }
}

// Initialize OpenAI client if API key is available
let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

// Initialize Anthropic client if API key is available
let anthropic: any = null;
if (process.env.ANTHROPIC_API_KEY) {
  try {
    // Using dynamic import instead of require for ESM compatibility
    import('@anthropic-ai/sdk').then(({ default: Anthropic }) => {
      anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      console.log('Anthropic API initialized successfully');
    }).catch(error => {
      console.error('Failed to initialize Anthropic client:', error);
    });
  } catch (error) {
    console.error('Failed to initialize Anthropic client:', error);
  }
}

/**
 * Get all report templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    
    const templates = await db.execute(sql`
      SELECT 
        rt.id,
        rt.name,
        rt.description,
        rt.report_type as "reportType",
        rt.category,
        rt.module,
        rt.query_text as "queryText",
        rt.parameters,
        rt.created_at as "createdAt",
        rt.updated_at as "updatedAt",
        u.username as "createdByName"
      FROM 
        report_templates rt
      LEFT JOIN
        users u ON rt.created_by = u.id
      WHERE 
        rt.tenant_id = ${tenantId}
      ORDER BY
        rt.created_at DESC
    `);

    // If no templates exist yet, create some default templates
    if (templates.rows.length === 0) {
      const defaultTemplates = [
        {
          name: "Sales Performance Analysis",
          description: "Analyzes sales data by product, region, and time period",
          report_type: "sales",
          category: "Sales",
          module: "Commercial",
          tenant_id: tenantId,
          created_by: req.user?.id || 1,
          query_text: `SELECT 
            o.id as order_id, 
            o.order_id as order_number,
            o.customer_id, 
            c.name as customer_name,
            o.total_amount, 
            o.created_at as order_date,
            o.order_status
          FROM orders o
          JOIN customers c ON o.customer_id = c.id
          WHERE o.tenant_id = :tenantId
          ORDER BY o.created_at DESC`,
          parameters: JSON.stringify({
            tenantId: tenantId
          })
        },
        {
          name: "Production Efficiency Report",
          description: "Evaluates manufacturing efficiency, downtime, and output quality",
          report_type: "production",
          category: "Production",
          module: "Manufacturing",
          tenant_id: tenantId,
          created_by: req.user?.id || 1,
          query_text: `SELECT 
            prod.id,
            prod.order_id,
            o.order_id as order_number,
            prod.style_name,
            prod.efficiency,
            prod.actual_production,
            prod.target_production,
            prod.production_date,
            prod.quality_score
          FROM production_daily prod
          JOIN orders o ON prod.order_id = o.id
          WHERE prod.tenant_id = :tenantId
          ORDER BY prod.production_date DESC`,
          parameters: JSON.stringify({
            tenantId: tenantId
          })
        },
        {
          name: "Material Cost Analysis",
          description: "Breaks down material costs and identifies cost-saving opportunities",
          report_type: "costs",
          category: "Finance",
          module: "Procurement",
          tenant_id: tenantId,
          created_by: req.user?.id || 1,
          query_text: `SELECT 
            mb.id,
            mb.order_id,
            o.order_id as order_number,
            mb.material_type,
            mb.total_cost,
            mb.unit_price,
            mb.quantity_needed,
            mb.booking_status,
            mb.expected_delivery_date
          FROM material_bookings mb
          JOIN orders o ON mb.order_id = o.id
          WHERE mb.tenant_id = :tenantId
          ORDER BY mb.total_cost DESC`,
          parameters: JSON.stringify({
            tenantId: tenantId
          })
        },
        {
          name: "Order Fulfillment Performance",
          description: "Measures on-time delivery rates and order completion metrics",
          report_type: "logistics",
          category: "Logistics",
          module: "Shipping",
          tenant_id: tenantId,
          created_by: req.user?.id || 1,
          query_text: `SELECT 
            o.id,
            o.order_id as order_number,
            o.customer_id,
            c.name as customer_name,
            o.style_name,
            o.order_date,
            o.delivery_date,
            o.shipping_date,
            o.order_status,
            CASE 
              WHEN o.shipping_date <= o.delivery_date THEN 'On Time'
              ELSE 'Late'
            END as delivery_status
          FROM orders o
          JOIN customers c ON o.customer_id = c.id
          WHERE o.tenant_id = :tenantId
          ORDER BY o.delivery_date DESC`,
          parameters: JSON.stringify({
            tenantId: tenantId
          })
        },
        {
          name: "Quality Control Analysis",
          description: "Tracks defect rates, types, and quality testing results",
          report_type: "quality",
          category: "Quality",
          module: "QA",
          tenant_id: tenantId,
          created_by: req.user?.id || 1,
          query_text: `SELECT 
            q.id,
            q.order_id,
            o.order_id as order_number,
            q.style_name,
            q.inspection_date,
            q.inspector_name,
            q.inspection_type,
            q.passed,
            q.defect_count,
            q.defect_types,
            q.inspection_notes
          FROM quality_inspections q
          JOIN orders o ON q.order_id = o.id
          WHERE q.tenant_id = :tenantId
          ORDER BY q.inspection_date DESC`,
          parameters: JSON.stringify({
            tenantId: tenantId
          })
        }
      ];
      
      // Insert default templates
      for (const template of defaultTemplates) {
        await db.execute(sql`
          INSERT INTO report_templates (
            tenant_id,
            name,
            description,
            report_type,
            category,
            module,
            query_text,
            parameters,
            created_by,
            created_at,
            updated_at
          ) VALUES (
            ${template.tenant_id},
            ${template.name},
            ${template.description},
            ${template.report_type},
            ${template.category},
            ${template.module},
            ${template.query_text},
            ${template.parameters},
            ${template.created_by},
            NOW(),
            NOW()
          )
        `);
      }
      
      // Fetch the newly created templates
      const newTemplates = await db.execute(sql`
        SELECT 
          rt.id,
          rt.name,
          rt.description,
          rt.report_type as "reportType",
          rt.category,
          rt.module,
          rt.query_text as "queryText",
          rt.parameters,
          rt.created_at as "createdAt",
          rt.updated_at as "updatedAt",
          u.username as "createdByName"
        FROM 
          report_templates rt
        LEFT JOIN
          users u ON rt.created_by = u.id
        WHERE 
          rt.tenant_id = ${tenantId}
        ORDER BY
          rt.created_at DESC
      `);
      
      return res.json(newTemplates.rows);
    }

    res.json(templates.rows);
  } catch (error) {
    console.error('Error fetching report templates:', error);
    res.status(500).json({ message: 'Failed to fetch report templates' });
  }
});

/**
 * Get a specific report template by ID
 */
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    
    const result = await db.execute(sql`
      SELECT 
        rt.id,
        rt.name,
        rt.description,
        rt.report_type as "reportType",
        rt.category,
        rt.module,
        rt.query_text as "queryText",
        rt.parameters,
        rt.created_at as "createdAt",
        rt.updated_at as "updatedAt",
        u.username as "createdByName"
      FROM 
        report_templates rt
      LEFT JOIN
        users u ON rt.created_by = u.id
      WHERE 
        rt.tenant_id = ${tenantId}
        AND rt.id = ${parseInt(id)}
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Report template not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching report template:', error);
    res.status(500).json({ message: 'Failed to fetch report template' });
  }
});

/**
 * Create a new report template
 */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      description, 
      reportType, 
      category, 
      module, 
      queryText, 
      parameters 
    } = req.body;
    
    const tenantId = requireTenant(req);
    const userId = req.user?.id || 1;
    
    // Input validation
    if (!name || !reportType || !category || !module) {
      return res.status(400).json({ 
        message: 'Missing required fields: name, reportType, category, module' 
      });
    }

    const result = await db.execute(sql`
      INSERT INTO report_templates (
        tenant_id,
        name,
        description,
        report_type,
        category,
        module,
        query_text,
        parameters,
        created_by,
        created_at,
        updated_at
      ) VALUES (
        ${tenantId},
        ${name},
        ${description || null},
        ${reportType},
        ${category},
        ${module},
        ${queryText || null},
        ${parameters ? JSON.stringify(parameters) : null},
        ${userId},
        NOW(),
        NOW()
      )
      RETURNING id
    `);

    const templateId = result.rows[0].id;
    
    res.status(201).json({ 
      id: templateId,
      message: 'Report template created successfully' 
    });
  } catch (error) {
    console.error('Error creating report template:', error);
    res.status(500).json({ message: 'Failed to create report template' });
  }
});

/**
 * Update an existing report template
 */
router.patch('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      reportType, 
      category, 
      module, 
      queryText, 
      parameters 
    } = req.body;
    
    const tenantId = requireTenant(req);
    
    // Check if template exists and belongs to tenant
    const checkResult = await db.execute(sql`
      SELECT id FROM report_templates
      WHERE id = ${parseInt(id)} AND tenant_id = ${tenantId}
    `);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Report template not found' });
    }

    // Build dynamic update query
    let updateColumns = [];
    let updateValues = [];

    if (name !== undefined) {
      updateColumns.push('name');
      updateValues.push(name);
    }
    
    if (description !== undefined) {
      updateColumns.push('description');
      updateValues.push(description || null);
    }
    
    if (reportType !== undefined) {
      updateColumns.push('report_type');
      updateValues.push(reportType);
    }
    
    if (category !== undefined) {
      updateColumns.push('category');
      updateValues.push(category);
    }
    
    if (module !== undefined) {
      updateColumns.push('module');
      updateValues.push(module);
    }
    
    if (queryText !== undefined) {
      updateColumns.push('query_text');
      updateValues.push(queryText || null);
    }
    
    if (parameters !== undefined) {
      updateColumns.push('parameters');
      updateValues.push(parameters ? JSON.stringify(parameters) : null);
    }
    
    // Always update the updated_at timestamp
    updateColumns.push('updated_at');
    updateValues.push('NOW()');
    
    if (updateColumns.length === 1 && updateColumns[0] === 'updated_at') {
      return res.status(400).json({ message: 'No fields to update' });
    }
    
    validateColumnNames(updateColumns, TEMPLATE_ALLOWED_COLUMNS);

    const setClause = updateColumns.map((col, index) => {
      if (col === 'updated_at') {
        return `"${col}" = NOW()`;
      }
      return `"${col}" = $${index + 1}`;
    }).join(', ');
    
    const query = `
      UPDATE report_templates
      SET ${setClause}
      WHERE id = $${updateValues.length + 1} AND tenant_id = $${updateValues.length + 2}
      RETURNING id
    `;
    
    updateValues.push(parseInt(id));
    updateValues.push(tenantId);
    
    const result = await db.query(query, updateValues);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Report template not found' });
    }
    
    res.json({ 
      id: parseInt(id),
      message: 'Report template updated successfully' 
    });
  } catch (error) {
    console.error('Error updating report template:', error);
    res.status(500).json({ message: 'Failed to update report template' });
  }
});

/**
 * Delete a report template
 */
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    
    const result = await db.execute(sql`
      DELETE FROM report_templates
      WHERE id = ${parseInt(id)} AND tenant_id = ${tenantId}
      RETURNING id
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Report template not found' });
    }
    
    res.json({ message: 'Report template deleted successfully' });
  } catch (error) {
    console.error('Error deleting report template:', error);
    res.status(500).json({ message: 'Failed to delete report template' });
  }
});

/**
 * Get all generated reports
 */
router.get('/generated', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = req.user?.id || 1;
    
    const reports = await db.execute(sql`
      SELECT 
        gr.id,
        gr.name,
        gr.description,
        gr.report_type as "reportType",
        gr.category,
        gr.module,
        gr.template_id as "templateId",
        gr.status,
        gr.created_by as "createdBy",
        u.username as "createdByName",
        gr.created_at as "createdAt",
        gr.completed_at as "completedAt",
        gr.output_format as "outputFormat",
        gr.view_count as "viewCount",
        CASE WHEN fr.report_id IS NOT NULL THEN true ELSE false END as "isFavorite"
      FROM 
        generated_reports gr
      LEFT JOIN
        users u ON gr.created_by = u.id
      LEFT JOIN
        favorite_reports fr ON gr.id = fr.report_id AND fr.user_id = ${userId}
      WHERE 
        gr.tenant_id = ${tenantId}
      ORDER BY
        gr.created_at DESC
    `);

    res.json(reports.rows);
  } catch (error) {
    console.error('Error fetching generated reports:', error);
    res.status(500).json({ message: 'Failed to fetch generated reports' });
  }
});

/**
 * Generate a new report
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      description, 
      templateId, 
      parameters, 
      outputFormat, 
      reportType,
      category,
      module,
      customQuery 
    } = req.body;
    
    const tenantId = requireTenant(req);
    const userId = req.user?.id || 1;
    
    // Input validation
    if (!name) {
      return res.status(400).json({ message: 'Report name is required' });
    }
    
    if (!templateId && !customQuery) {
      return res.status(400).json({ message: 'Either templateId or customQuery is required' });
    }
    
    if (customQuery) {
      try {
        validateReadOnlyQuery(customQuery);
      } catch (validationError: any) {
        return res.status(400).json({ message: validationError.message });
      }
    }
    
    // First, create the report entry with status 'pending'
    const insertResult = await db.execute(sql`
      INSERT INTO generated_reports (
        tenant_id,
        name,
        description,
        report_type,
        category,
        module,
        template_id,
        parameters,
        status,
        created_by,
        created_at,
        updated_at,
        output_format,
        view_count
      ) VALUES (
        ${tenantId},
        ${name},
        ${description || null},
        ${reportType || null},
        ${category || null},
        ${module || null},
        ${templateId || null},
        ${parameters ? JSON.stringify(parameters) : null},
        'pending',
        ${userId},
        NOW(),
        NOW(),
        ${outputFormat || 'json'},
        0
      )
      RETURNING id
    `);
    
    const reportId = insertResult.rows[0].id;
    
    // Execute the report query asynchronously
    executeReportQuery(reportId, templateId, parameters, tenantId)
      .then(() => {
        // Generate AI insights for the report
        if (openai || anthropic) {
          const templateInfo = templateId ? { id: templateId } : null;
          generateInsights(reportType || 'custom', [], tenantId, reportId)
            .then(() => console.log(`Generated insights for report ${reportId}`))
            .catch(error => console.error(`Error generating insights for report ${reportId}:`, error));
        }
      })
      .catch(error => {
        console.error(`Error executing report query ${reportId}:`, error);
        // Update the report status to 'failed'
        db.execute(sql`
          UPDATE generated_reports
          SET status = 'failed', error_message = ${error.message}
          WHERE id = ${reportId}
        `).catch(updateError => {
          console.error(`Error updating report status to failed:`, updateError);
        });
      });
    
    res.status(201).json({ 
      id: reportId,
      message: 'Report generation started' 
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ message: 'Failed to create report' });
  }
});

/**
 * Execute a report query and store the results
 */
async function executeReportQuery(reportId: number, templateId: any, parameters: any, tenantId: number) {
  try {
    // First, get the template query if a templateId was provided
    let queryText = '';
    let reportType = '';
    let category = '';
    let module = '';
    
    if (templateId) {
      const templateResult = await db.execute(sql`
        SELECT query_text, report_type, category, module
        FROM report_templates
        WHERE id = ${templateId} AND tenant_id = ${tenantId}
      `);
      
      if (templateResult.rows.length === 0) {
        throw new Error('Report template not found');
      }
      
      queryText = templateResult.rows[0].query_text;
      reportType = templateResult.rows[0].report_type;
      category = templateResult.rows[0].category;
      module = templateResult.rows[0].module;
      
      if (!queryText) {
        throw new Error('Template has no query defined');
      }
    } else {
      // If no templateId, a custom query should have been provided
      const reportResult = await db.execute(sql`
        SELECT custom_query, report_type, category, module
        FROM generated_reports
        WHERE id = ${reportId} AND tenant_id = ${tenantId}
      `);
      
      if (reportResult.rows.length === 0) {
        throw new Error('Report not found');
      }
      
      queryText = reportResult.rows[0].custom_query;
      reportType = reportResult.rows[0].report_type;
      category = reportResult.rows[0].category;
      module = reportResult.rows[0].module;
      
      if (!queryText) {
        throw new Error('No query provided for custom report');
      }
    }
    
    validateReadOnlyQuery(queryText);

    const paramValues: any[] = [];
    let paramIndex = 1;

    if (parameters) {
      for (const [key, value] of Object.entries(parameters)) {
        const placeholder = `:${key}`;
        if (!queryText.includes(placeholder)) continue;

        if (value === null) {
          queryText = queryText.split(placeholder).join('NULL');
        } else if (Array.isArray(value)) {
          const placeholders = value.map((item) => {
            paramValues.push(item);
            return `$${paramIndex++}`;
          });
          queryText = queryText.split(placeholder).join(`(${placeholders.join(', ')})`);
        } else if (value instanceof Date) {
          paramValues.push(formatDateForPostgres(value));
          queryText = queryText.split(placeholder).join(`$${paramIndex++}`);
        } else {
          paramValues.push(value);
          queryText = queryText.split(placeholder).join(`$${paramIndex++}`);
        }
      }
    }

    const reportData = paramValues.length > 0
      ? await db.query(queryText, paramValues)
      : await db.execute(sql.raw(queryText));
    
    // Store the report data
    await db.execute(sql`
      UPDATE generated_reports
      SET 
        status = 'completed',
        results = ${JSON.stringify(reportData.rows)},
        completed_at = NOW(),
        updated_at = NOW(),
        report_type = COALESCE(${reportType}, report_type),
        category = COALESCE(${category}, category),
        module = COALESCE(${module}, module)
      WHERE id = ${reportId}
    `);
    
    // Generate insights for the report
    return reportData.rows;
  } catch (error) {
    console.error('Error executing report query:', error);
    // Update the report status to 'failed'
    await db.execute(sql`
      UPDATE generated_reports
      SET status = 'failed', error_message = ${error.message}, updated_at = NOW()
      WHERE id = ${reportId}
    `);
    throw error;
  }
}

/**
 * Generate AI insights for a report
 */
async function generateInsights(reportType: string, data: any[], tenantId: number, reportId: number) {
  try {
    if (!openai && !anthropic) {
      console.log('No AI service available for generating insights');
      return;
    }
    
    // Fetch the report data
    const reportResult = await db.execute(sql`
      SELECT results, category, module
      FROM generated_reports
      WHERE id = ${reportId} AND tenant_id = ${tenantId}
    `);
    
    if (reportResult.rows.length === 0) {
      throw new Error('Report not found');
    }
    
    const reportData = reportResult.rows[0].results;
    if (!reportData || reportData.length === 0) {
      console.log('No data available in the report for generating insights');
      return;
    }
    
    // Prepare the prompt based on report type and data
    const jsonData = JSON.stringify(reportData);
    const category = reportResult.rows[0].category;
    const module = reportResult.rows[0].module;
    
    let insights = [];
    
    // Try to use OpenAI first, then fall back to Anthropic if available
    if (openai) {
      const prompt = `
        You are an expert business analyst for a garment manufacturing ERP system.
        Analyze the following data from a ${reportType} report in the ${category} category and ${module} module:
        
        ${jsonData.length > 10000 ? jsonData.substring(0, 10000) + '...(truncated)' : jsonData}
        
        Provide 3-5 key business insights based on this data. Each insight should:
        1. Highlight a notable pattern, anomaly, or trend
        2. Explain why it matters to the business
        3. Suggest a potential action item based on this insight
        
        Return your analysis as a JSON array of objects with the following structure:
        [
          {
            "title": "Brief insight title",
            "description": "Detailed explanation of the insight",
            "importance": "High/Medium/Low",
            "recommendation": "What action should be taken"
          }
        ]
      `;
      
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        });
        
        const content = response.choices[0].message.content;
        if (content) {
          try {
            const parsedInsights = JSON.parse(content);
            insights = Array.isArray(parsedInsights) ? parsedInsights : 
                      (parsedInsights.insights ? parsedInsights.insights : []);
          } catch (parseError) {
            console.error('Error parsing OpenAI response:', parseError);
          }
        }
      } catch (openaiError) {
        console.error('OpenAI API error:', openaiError);
        // Fall back to Anthropic if available
        if (anthropic) {
          try {
            const response = await anthropic.messages.create({
              model: "claude-3-7-sonnet-20250219", // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
              max_tokens: 1000,
              system: "You are an expert business analyst for a garment manufacturing ERP system. Provide concise, data-driven insights in JSON format.",
              messages: [
                { 
                  role: "user", 
                  content: prompt 
                }
              ]
            });
            
            try {
              const parsedInsights = JSON.parse(response.content[0].text);
              insights = Array.isArray(parsedInsights) ? parsedInsights : 
                        (parsedInsights.insights ? parsedInsights.insights : []);
            } catch (parseError) {
              console.error('Error parsing Anthropic response:', parseError);
            }
          } catch (anthropicError) {
            console.error('Anthropic API error:', anthropicError);
          }
        }
      }
    } else if (anthropic) {
      // Use Anthropic directly if OpenAI is not available
      try {
        const prompt = `
          You are an expert business analyst for a garment manufacturing ERP system.
          Analyze the following data from a ${reportType} report in the ${category} category and ${module} module:
          
          ${jsonData.length > 10000 ? jsonData.substring(0, 10000) + '...(truncated)' : jsonData}
          
          Provide 3-5 key business insights based on this data. Each insight should:
          1. Highlight a notable pattern, anomaly, or trend
          2. Explain why it matters to the business
          3. Suggest a potential action item based on this insight
          
          Return your analysis as a JSON array of objects with the following structure:
          [
            {
              "title": "Brief insight title",
              "description": "Detailed explanation of the insight",
              "importance": "High/Medium/Low",
              "recommendation": "What action should be taken"
            }
          ]
        `;
        
        const response = await anthropic.messages.create({
          model: "claude-3-7-sonnet-20250219", // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
          max_tokens: 1000,
          system: "You are an expert business analyst for a garment manufacturing ERP system. Provide concise, data-driven insights in JSON format.",
          messages: [
            { 
              role: "user", 
              content: prompt 
            }
          ]
        });
        
        try {
          const parsedInsights = JSON.parse(response.content[0].text);
          insights = Array.isArray(parsedInsights) ? parsedInsights : 
                    (parsedInsights.insights ? parsedInsights.insights : []);
        } catch (parseError) {
          console.error('Error parsing Anthropic response:', parseError);
        }
      } catch (anthropicError) {
        console.error('Anthropic API error:', anthropicError);
      }
    }
    
    // Store the insights
    if (insights && insights.length > 0) {
      await db.execute(sql`
        INSERT INTO report_insights (
          report_id,
          tenant_id,
          insights,
          created_at,
          updated_at
        ) VALUES (
          ${reportId},
          ${tenantId},
          ${JSON.stringify(insights)},
          NOW(),
          NOW()
        )
        ON CONFLICT (report_id)
        DO UPDATE SET
          insights = ${JSON.stringify(insights)},
          updated_at = NOW()
      `);
    }
  } catch (error) {
    console.error('Error generating insights:', error);
  }
}

/**
 * Get a generated report by ID
 */
router.get('/generated/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    const userId = req.user?.id || 1;
    
    // Fetch the report
    const result = await db.execute(sql`
      SELECT 
        gr.id,
        gr.name,
        gr.description,
        gr.report_type as "reportType",
        gr.category,
        gr.module,
        gr.template_id as "templateId",
        gr.parameters,
        gr.status,
        gr.results,
        gr.error_message as "errorMessage",
        gr.created_by as "createdBy",
        u.username as "createdByName",
        gr.created_at as "createdAt",
        gr.updated_at as "updatedAt",
        gr.completed_at as "completedAt",
        gr.output_format as "outputFormat",
        CASE WHEN fr.report_id IS NOT NULL THEN true ELSE false END as "isFavorite"
      FROM 
        generated_reports gr
      LEFT JOIN
        users u ON gr.created_by = u.id
      LEFT JOIN
        favorite_reports fr ON gr.id = fr.report_id AND fr.user_id = ${userId}
      WHERE 
        gr.id = ${parseInt(id)}
        AND gr.tenant_id = ${tenantId}
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    const report = result.rows[0];
    
    // Increment the view count
    await db.execute(sql`
      UPDATE generated_reports
      SET view_count = view_count + 1
      WHERE id = ${parseInt(id)}
    `);
    
    // Fetch report insights if available
    try {
      const insightsResult = await db.execute(sql`
        SELECT insights
        FROM report_insights
        WHERE report_id = ${parseInt(id)}
      `);
      
      if (insightsResult.rows.length > 0) {
        report.insights = insightsResult.rows[0].insights;
      }
    } catch (insightsError) {
      console.error('Error fetching report insights:', insightsError);
    }
    
    res.json(report);
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ message: 'Failed to fetch report' });
  }
});

/**
 * Toggle favorite status for a report
 */
router.patch('/generated/:id/favorite', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isFavorite } = req.body;
    const tenantId = requireTenant(req);
    const userId = req.user?.id || 1;
    
    // Check if report exists and belongs to tenant
    const checkResult = await db.execute(sql`
      SELECT id FROM generated_reports
      WHERE id = ${parseInt(id)} AND tenant_id = ${tenantId}
    `);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    if (isFavorite) {
      // Add to favorites
      await db.execute(sql`
        INSERT INTO favorite_reports (
          user_id,
          report_id,
          created_at
        ) VALUES (
          ${userId},
          ${parseInt(id)},
          NOW()
        )
        ON CONFLICT (user_id, report_id)
        DO NOTHING
      `);
    } else {
      // Remove from favorites
      await db.execute(sql`
        DELETE FROM favorite_reports
        WHERE user_id = ${userId} AND report_id = ${parseInt(id)}
      `);
    }
    
    res.json({ 
      id: parseInt(id),
      isFavorite: isFavorite,
      message: isFavorite ? 'Report added to favorites' : 'Report removed from favorites'
    });
  } catch (error) {
    console.error('Error updating favorite status:', error);
    res.status(500).json({ message: 'Failed to update favorite status' });
  }
});

/**
 * Delete a generated report
 */
router.delete('/generated/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    
    // Begin transaction
    await db.execute(sql`BEGIN`);
    
    try {
      // Delete related insights
      await db.execute(sql`
        DELETE FROM report_insights
        WHERE report_id = ${parseInt(id)}
      `);
      
      // Delete from favorites
      await db.execute(sql`
        DELETE FROM favorite_reports
        WHERE report_id = ${parseInt(id)}
      `);
      
      // Delete the report
      const result = await db.execute(sql`
        DELETE FROM generated_reports
        WHERE id = ${parseInt(id)} AND tenant_id = ${tenantId}
        RETURNING id
      `);
      
      if (result.rows.length === 0) {
        await db.execute(sql`ROLLBACK`);
        return res.status(404).json({ message: 'Report not found' });
      }
      
      // Commit transaction
      await db.execute(sql`COMMIT`);
      
      res.json({ message: 'Report deleted successfully' });
    } catch (error) {
      // Rollback transaction on error
      await db.execute(sql`ROLLBACK`);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ message: 'Failed to delete report' });
  }
});

/**
 * Get dashboard widgets for the reporting module
 */
router.get('/dashboard/widgets', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = req.user?.id || 1;
    
    const widgets = await db.execute(sql`
      SELECT 
        id,
        name,
        description,
        widget_type as "widgetType",
        report_id as "reportId",
        position,
        size,
        settings,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM 
        report_dashboard_widgets
      WHERE 
        tenant_id = ${tenantId}
        AND (user_id = ${userId} OR is_shared = true)
      ORDER BY
        position
    `);

    res.json(widgets.rows);
  } catch (error) {
    console.error('Error fetching dashboard widgets:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard widgets' });
  }
});

/**
 * Create a new dashboard widget
 */
router.post('/dashboard/widgets', async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      description, 
      widgetType, 
      reportId, 
      position, 
      size, 
      settings,
      isShared 
    } = req.body;
    
    const tenantId = requireTenant(req);
    const userId = req.user?.id || 1;
    
    if (!name || !widgetType) {
      return res.status(400).json({ message: 'Name and widget type are required' });
    }
    
    const result = await db.execute(sql`
      INSERT INTO report_dashboard_widgets (
        tenant_id,
        user_id,
        name,
        description,
        widget_type,
        report_id,
        position,
        size,
        settings,
        is_shared,
        created_at,
        updated_at
      ) VALUES (
        ${tenantId},
        ${userId},
        ${name},
        ${description || null},
        ${widgetType},
        ${reportId || null},
        ${position || 0},
        ${size || 'medium'},
        ${settings ? JSON.stringify(settings) : null},
        ${isShared || false},
        NOW(),
        NOW()
      )
      RETURNING id
    `);
    
    res.status(201).json({
      id: result.rows[0].id,
      message: 'Dashboard widget created successfully'
    });
  } catch (error) {
    console.error('Error creating dashboard widget:', error);
    res.status(500).json({ message: 'Failed to create dashboard widget' });
  }
});

/**
 * Update a dashboard widget
 */
router.patch('/dashboard/widgets/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      widgetType, 
      reportId, 
      position, 
      size, 
      settings,
      isShared 
    } = req.body;
    
    const tenantId = requireTenant(req);
    const userId = req.user?.id || 1;
    
    // Check if widget exists and belongs to user or tenant
    const checkResult = await db.execute(sql`
      SELECT id FROM report_dashboard_widgets
      WHERE id = ${parseInt(id)} 
        AND tenant_id = ${tenantId}
        AND (user_id = ${userId} OR is_shared = true)
    `);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Dashboard widget not found' });
    }
    
    // Build dynamic update query
    let updateColumns = [];
    let updateValues = [];
    
    if (name !== undefined) {
      updateColumns.push('name');
      updateValues.push(name);
    }
    
    if (description !== undefined) {
      updateColumns.push('description');
      updateValues.push(description || null);
    }
    
    if (widgetType !== undefined) {
      updateColumns.push('widget_type');
      updateValues.push(widgetType);
    }
    
    if (reportId !== undefined) {
      updateColumns.push('report_id');
      updateValues.push(reportId || null);
    }
    
    if (position !== undefined) {
      updateColumns.push('position');
      updateValues.push(position);
    }
    
    if (size !== undefined) {
      updateColumns.push('size');
      updateValues.push(size);
    }
    
    if (settings !== undefined) {
      updateColumns.push('settings');
      updateValues.push(settings ? JSON.stringify(settings) : null);
    }
    
    if (isShared !== undefined) {
      updateColumns.push('is_shared');
      updateValues.push(isShared);
    }
    
    // Always update the updated_at timestamp
    updateColumns.push('updated_at');
    updateValues.push('NOW()');
    
    if (updateColumns.length === 1 && updateColumns[0] === 'updated_at') {
      return res.status(400).json({ message: 'No fields to update' });
    }
    
    validateColumnNames(updateColumns, WIDGET_ALLOWED_COLUMNS);

    const setClause = updateColumns.map((col, index) => {
      if (col === 'updated_at') {
        return `"${col}" = NOW()`;
      }
      return `"${col}" = $${index + 1}`;
    }).join(', ');
    
    const query = `
      UPDATE report_dashboard_widgets
      SET ${setClause}
      WHERE id = $${updateValues.length + 1} 
        AND tenant_id = $${updateValues.length + 2}
        AND (user_id = $${updateValues.length + 3} OR is_shared = true)
      RETURNING id
    `;
    
    updateValues.push(parseInt(id));
    updateValues.push(tenantId);
    updateValues.push(userId);
    
    const result = await db.query(query, updateValues);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Dashboard widget not found or you do not have permission to update it' });
    }
    
    res.json({
      id: parseInt(id),
      message: 'Dashboard widget updated successfully'
    });
  } catch (error) {
    console.error('Error updating dashboard widget:', error);
    res.status(500).json({ message: 'Failed to update dashboard widget' });
  }
});

/**
 * Delete a dashboard widget
 */
router.delete('/dashboard/widgets/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    const userId = req.user?.id || 1;
    
    const result = await db.execute(sql`
      DELETE FROM report_dashboard_widgets
      WHERE id = ${parseInt(id)} 
        AND tenant_id = ${tenantId}
        AND (user_id = ${userId} OR is_shared = true)
      RETURNING id
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dashboard widget not found or you do not have permission to delete it' });
    }
    
    res.json({ message: 'Dashboard widget deleted successfully' });
  } catch (error) {
    console.error('Error deleting dashboard widget:', error);
    res.status(500).json({ message: 'Failed to delete dashboard widget' });
  }
});

/**
 * Get insights for a specific report
 */
router.get('/insights/:reportId', async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const tenantId = requireTenant(req);
    
    // First check if the report exists and belongs to the tenant
    const checkResult = await db.execute(sql`
      SELECT id FROM generated_reports
      WHERE id = ${parseInt(reportId)} AND tenant_id = ${tenantId}
    `);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    // Get the insights
    const result = await db.execute(sql`
      SELECT 
        report_id as "reportId",
        insights,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM report_insights
      WHERE report_id = ${parseInt(reportId)}
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No insights found for this report' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching report insights:', error);
    res.status(500).json({ message: 'Failed to fetch report insights' });
  }
});

/**
 * Request new AI insights for a report
 */
router.post('/insights/:reportId', async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const tenantId = requireTenant(req);
    
    // Check if the report exists and belongs to the tenant
    const reportResult = await db.execute(sql`
      SELECT 
        id, 
        status, 
        report_type as "reportType", 
        category, 
        module
      FROM generated_reports
      WHERE id = ${parseInt(reportId)} AND tenant_id = ${tenantId}
    `);
    
    if (reportResult.rows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    const report = reportResult.rows[0];
    
    if (report.status !== 'completed') {
      return res.status(400).json({ message: 'Cannot generate insights for an incomplete report' });
    }
    
    // Generate new insights asynchronously
    res.status(202).json({ message: 'Generating new insights' });
    
    // Run the insight generation in the background
    generateInsights(report.reportType, [], tenantId, parseInt(reportId))
      .then(() => {
        console.log(`Generated new insights for report ${reportId}`);
      })
      .catch(error => {
        console.error(`Error generating new insights for report ${reportId}:`, error);
      });
  } catch (error) {
    console.error('Error requesting new insights:', error);
    res.status(500).json({ message: 'Failed to request new insights' });
  }
});

/**
 * Get scheduled reports
 */
router.get('/schedules', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    
    const schedules = await db.execute(sql`
      SELECT 
        rs.id,
        rs.name,
        rs.description,
        rs.template_id as "templateId",
        rt.name as "templateName",
        rs.parameters,
        rs.schedule_type as "scheduleType",
        rs.schedule_config as "scheduleConfig",
        rs.last_run_at as "lastRunAt",
        rs.next_run_at as "nextRunAt",
        rs.is_active as "isActive",
        rs.output_format as "outputFormat",
        rs.email_recipients as "emailRecipients",
        rs.created_by as "createdBy",
        u.username as "createdByName",
        rs.created_at as "createdAt",
        rs.updated_at as "updatedAt"
      FROM 
        report_schedules rs
      LEFT JOIN
        report_templates rt ON rs.template_id = rt.id
      LEFT JOIN
        users u ON rs.created_by = u.id
      WHERE 
        rs.tenant_id = ${tenantId}
      ORDER BY
        rs.created_at DESC
    `);

    res.json(schedules.rows);
  } catch (error) {
    console.error('Error fetching report schedules:', error);
    res.status(500).json({ message: 'Failed to fetch report schedules' });
  }
});

/**
 * Create a new report schedule
 */
router.post('/schedules', async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      description, 
      templateId, 
      parameters, 
      scheduleType,
      scheduleConfig,
      outputFormat,
      emailRecipients,
      isActive
    } = req.body;
    
    const tenantId = requireTenant(req);
    const userId = req.user?.id || 1;
    
    // Input validation
    if (!name || !templateId || !scheduleType || !scheduleConfig) {
      return res.status(400).json({ 
        message: 'Missing required fields: name, templateId, scheduleType, scheduleConfig' 
      });
    }
    
    // Check if template exists
    const templateCheck = await db.execute(sql`
      SELECT id FROM report_templates
      WHERE id = ${templateId} AND tenant_id = ${tenantId}
    `);
    
    if (templateCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Report template not found' });
    }
    
    // Calculate next run time based on schedule
    let nextRunAt = new Date();
    
    // This is simplified - a real implementation would need more complex logic
    if (scheduleType === 'daily') {
      nextRunAt.setDate(nextRunAt.getDate() + 1);
      nextRunAt.setHours(scheduleConfig.hour || 0, scheduleConfig.minute || 0, 0, 0);
    } else if (scheduleType === 'weekly') {
      const dayOffset = (scheduleConfig.dayOfWeek || 1) - nextRunAt.getDay();
      nextRunAt.setDate(nextRunAt.getDate() + (dayOffset < 0 ? 7 + dayOffset : dayOffset));
      nextRunAt.setHours(scheduleConfig.hour || 0, scheduleConfig.minute || 0, 0, 0);
    } else if (scheduleType === 'monthly') {
      nextRunAt.setMonth(nextRunAt.getMonth() + 1);
      nextRunAt.setDate(Math.min(scheduleConfig.dayOfMonth || 1, new Date(nextRunAt.getFullYear(), nextRunAt.getMonth() + 1, 0).getDate()));
      nextRunAt.setHours(scheduleConfig.hour || 0, scheduleConfig.minute || 0, 0, 0);
    }
    
    const result = await db.execute(sql`
      INSERT INTO report_schedules (
        tenant_id,
        name,
        description,
        template_id,
        parameters,
        schedule_type,
        schedule_config,
        next_run_at,
        is_active,
        output_format,
        email_recipients,
        created_by,
        created_at,
        updated_at
      ) VALUES (
        ${tenantId},
        ${name},
        ${description || null},
        ${templateId},
        ${parameters ? JSON.stringify(parameters) : null},
        ${scheduleType},
        ${JSON.stringify(scheduleConfig)},
        ${formatDateTimeForPostgres(nextRunAt)},
        ${isActive !== undefined ? isActive : true},
        ${outputFormat || 'pdf'},
        ${emailRecipients ? JSON.stringify(emailRecipients) : null},
        ${userId},
        NOW(),
        NOW()
      )
      RETURNING id
    `);
    
    res.status(201).json({
      id: result.rows[0].id,
      message: 'Report schedule created successfully',
      nextRunAt: nextRunAt
    });
  } catch (error) {
    console.error('Error creating report schedule:', error);
    res.status(500).json({ message: 'Failed to create report schedule' });
  }
});

/**
 * Update a report schedule
 */
router.patch('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      templateId, 
      parameters, 
      scheduleType,
      scheduleConfig,
      outputFormat,
      emailRecipients,
      isActive
    } = req.body;
    
    const tenantId = requireTenant(req);
    
    // Check if schedule exists
    const scheduleCheck = await db.execute(sql`
      SELECT id, schedule_type, schedule_config
      FROM report_schedules
      WHERE id = ${parseInt(id)} AND tenant_id = ${tenantId}
    `);
    
    if (scheduleCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Report schedule not found' });
    }
    
    // Calculate new next run time if schedule changed
    let nextRunAt = null;
    const currentScheduleType = scheduleCheck.rows[0].schedule_type;
    const currentScheduleConfig = scheduleCheck.rows[0].schedule_config;
    
    if (scheduleType !== undefined && scheduleConfig !== undefined && 
        (scheduleType !== currentScheduleType || 
         JSON.stringify(scheduleConfig) !== JSON.stringify(currentScheduleConfig))) {
      
      nextRunAt = new Date();
      
      // This is simplified - a real implementation would need more complex logic
      if (scheduleType === 'daily') {
        nextRunAt.setDate(nextRunAt.getDate() + 1);
        nextRunAt.setHours(scheduleConfig.hour || 0, scheduleConfig.minute || 0, 0, 0);
      } else if (scheduleType === 'weekly') {
        const dayOffset = (scheduleConfig.dayOfWeek || 1) - nextRunAt.getDay();
        nextRunAt.setDate(nextRunAt.getDate() + (dayOffset < 0 ? 7 + dayOffset : dayOffset));
        nextRunAt.setHours(scheduleConfig.hour || 0, scheduleConfig.minute || 0, 0, 0);
      } else if (scheduleType === 'monthly') {
        nextRunAt.setMonth(nextRunAt.getMonth() + 1);
        nextRunAt.setDate(Math.min(scheduleConfig.dayOfMonth || 1, new Date(nextRunAt.getFullYear(), nextRunAt.getMonth() + 1, 0).getDate()));
        nextRunAt.setHours(scheduleConfig.hour || 0, scheduleConfig.minute || 0, 0, 0);
      }
    }
    
    // Build dynamic update query
    let updateColumns = [];
    let updateValues = [];
    
    if (name !== undefined) {
      updateColumns.push('name');
      updateValues.push(name);
    }
    
    if (description !== undefined) {
      updateColumns.push('description');
      updateValues.push(description || null);
    }
    
    if (templateId !== undefined) {
      // Check if template exists
      const templateCheck = await db.execute(sql`
        SELECT id FROM report_templates
        WHERE id = ${templateId} AND tenant_id = ${tenantId}
      `);
      
      if (templateCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Report template not found' });
      }
      
      updateColumns.push('template_id');
      updateValues.push(templateId);
    }
    
    if (parameters !== undefined) {
      updateColumns.push('parameters');
      updateValues.push(parameters ? JSON.stringify(parameters) : null);
    }
    
    if (scheduleType !== undefined) {
      updateColumns.push('schedule_type');
      updateValues.push(scheduleType);
    }
    
    if (scheduleConfig !== undefined) {
      updateColumns.push('schedule_config');
      updateValues.push(JSON.stringify(scheduleConfig));
    }
    
    if (nextRunAt !== null) {
      updateColumns.push('next_run_at');
      updateValues.push(formatDateTimeForPostgres(nextRunAt));
    }
    
    if (isActive !== undefined) {
      updateColumns.push('is_active');
      updateValues.push(isActive);
    }
    
    if (outputFormat !== undefined) {
      updateColumns.push('output_format');
      updateValues.push(outputFormat);
    }
    
    if (emailRecipients !== undefined) {
      updateColumns.push('email_recipients');
      updateValues.push(emailRecipients ? JSON.stringify(emailRecipients) : null);
    }
    
    // Always update the updated_at timestamp
    updateColumns.push('updated_at');
    updateValues.push('NOW()');
    
    if (updateColumns.length === 1 && updateColumns[0] === 'updated_at') {
      return res.status(400).json({ message: 'No fields to update' });
    }
    
    validateColumnNames(updateColumns, SCHEDULE_ALLOWED_COLUMNS);

    const setClause = updateColumns.map((col, index) => {
      if (col === 'updated_at') {
        return `"${col}" = NOW()`;
      }
      return `"${col}" = $${index + 1}`;
    }).join(', ');
    
    const query = `
      UPDATE report_schedules
      SET ${setClause}
      WHERE id = $${updateValues.length + 1} AND tenant_id = $${updateValues.length + 2}
      RETURNING id
    `;
    
    updateValues.push(parseInt(id));
    updateValues.push(tenantId);
    
    const result = await db.query(query, updateValues);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Report schedule not found' });
    }
    
    res.json({
      id: parseInt(id),
      message: 'Report schedule updated successfully',
      nextRunAt: nextRunAt
    });
  } catch (error) {
    console.error('Error updating report schedule:', error);
    res.status(500).json({ message: 'Failed to update report schedule' });
  }
});

/**
 * Delete a report schedule
 */
router.delete('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    
    const result = await db.execute(sql`
      DELETE FROM report_schedules
      WHERE id = ${parseInt(id)} AND tenant_id = ${tenantId}
      RETURNING id
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Report schedule not found' });
    }
    
    res.json({ message: 'Report schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting report schedule:', error);
    res.status(500).json({ message: 'Failed to delete report schedule' });
  }
});

/**
 * Export a generated report in various formats
 */
router.get('/generated/:id/export/:format', async (req: Request, res: Response) => {
  try {
    const { id, format } = req.params;
    const tenantId = requireTenant(req);
    
    // Check if report exists and belongs to tenant
    const reportResult = await db.execute(sql`
      SELECT 
        name, 
        results,
        status
      FROM generated_reports
      WHERE id = ${parseInt(id)} AND tenant_id = ${tenantId}
    `);
    
    if (reportResult.rows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    const report = reportResult.rows[0];
    
    if (report.status !== 'completed') {
      return res.status(400).json({ message: 'Cannot export an incomplete report' });
    }
    
    if (!report.results || report.results.length === 0) {
      return res.status(400).json({ message: 'Report has no data to export' });
    }
    
    // Handle different export formats
    switch (format.toLowerCase()) {
      case 'json':
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${report.name}.json"`);
        return res.json(report.results);
        
      case 'csv':
        // Simple CSV conversion
        if (report.results.length > 0) {
          const headers = Object.keys(report.results[0]).join(',') + '\n';
          const rows = report.results.map(row => {
            return Object.values(row).map(value => {
              // Handle strings with commas, quotes, etc.
              if (typeof value === 'string') {
                return `"${value.replace(/"/g, '""')}"`;
              } else if (value === null || value === undefined) {
                return '';
              } else if (typeof value === 'object') {
                return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
              }
              return value;
            }).join(',');
          }).join('\n');
          
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${report.name}.csv"`);
          return res.send(headers + rows);
        }
        return res.status(400).json({ message: 'Report has no data to export as CSV' });
        
      case 'excel':
        // For simplicity, we'll send CSV and let the client know we'd use a library like exceljs in production
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${report.name}.csv"`);
        
        if (report.results.length > 0) {
          const headers = Object.keys(report.results[0]).join(',') + '\n';
          const rows = report.results.map(row => {
            return Object.values(row).map(value => {
              if (typeof value === 'string') {
                return `"${value.replace(/"/g, '""')}"`;
              } else if (value === null || value === undefined) {
                return '';
              } else if (typeof value === 'object') {
                return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
              }
              return value;
            }).join(',');
          }).join('\n');
          
          return res.send(headers + rows);
        }
        return res.status(400).json({ message: 'Report has no data to export as Excel' });
        
      case 'pdf':
        try {
          const boss = getBoss();
          const sanitizedName = (report.name || 'report').replace(/[^a-zA-Z0-9-_]/g, '_');
          const pdfFileName = `${sanitizedName}_${Date.now()}_${tenantId}.pdf`;
          const pdfFilePath = path.join(getReportsDir(), pdfFileName);
          
          const fileResult = await db.execute(sql`
            INSERT INTO report_files (
              tenant_id, report_id, job_id, file_name, file_path, 
              mime_type, status, generated_by, created_at, updated_at
            ) VALUES (
              ${tenantId}, ${parseInt(id)}, 'pending', ${pdfFileName}, ${pdfFilePath},
              'application/pdf', 'queued', ${req.user?.id || 1}, NOW(), NOW()
            ) RETURNING id
          `);
          
          const reportFileId = (fileResult.rows[0] as any).id;
          
          const jobId = await (boss as any).send(REPORT_PDF_QUEUE, {
            reportId: parseInt(id),
            tenantId,
            userId: req.user?.id || 1,
            reportFileId,
            fileName: pdfFileName,
          });
          
          await db.execute(sql`
            UPDATE report_files SET job_id = ${jobId || 'unknown'} WHERE id = ${reportFileId}
          `);
          
          return res.status(202).json({
            message: 'PDF generation started',
            jobId: jobId,
            reportFileId,
            statusUrl: `/api/reports/files/${reportFileId}/status`,
            downloadUrl: `/api/reports/files/${reportFileId}/download`,
          });
        } catch (pdfError: any) {
          console.error('Error queueing PDF generation:', pdfError);
          return res.status(500).json({ message: 'Failed to queue PDF generation: ' + pdfError.message });
        }
        
      default:
        return res.status(400).json({ message: `Unsupported export format: ${format}` });
    }
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ message: 'Failed to export report' });
  }
});

/**
 * Get PDF generation job status
 */
router.get('/files/:fileId/status', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const tenantId = requireTenant(req);
    
    const result = await db.execute(sql`
      SELECT 
        id,
        job_id as "jobId",
        file_name as "fileName",
        file_size as "fileSize",
        status,
        error_message as "errorMessage",
        created_at as "createdAt",
        updated_at as "updatedAt",
        expires_at as "expiresAt"
      FROM report_files
      WHERE id = ${parseInt(fileId)} AND tenant_id = ${tenantId}
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Report file not found' });
    }
    
    const file = result.rows[0] as any;
    res.json({
      ...file,
      downloadUrl: file.status === 'completed' ? `/api/reports/files/${fileId}/download` : null,
    });
  } catch (error) {
    console.error('Error fetching file status:', error);
    res.status(500).json({ message: 'Failed to fetch file status' });
  }
});

/**
 * Download a generated PDF file with tenant isolation
 */
router.get('/files/:fileId/download', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const tenantId = requireTenant(req);
    
    const result = await db.execute(sql`
      SELECT 
        file_name,
        file_path,
        mime_type,
        status,
        expires_at
      FROM report_files
      WHERE id = ${parseInt(fileId)} AND tenant_id = ${tenantId}
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Report file not found' });
    }
    
    const file = result.rows[0] as any;
    
    if (file.status !== 'completed') {
      return res.status(400).json({ message: `File is not ready. Current status: ${file.status}` });
    }
    
    if (file.expires_at && new Date(file.expires_at) < new Date()) {
      return res.status(410).json({ message: 'File has expired and is no longer available' });
    }
    
    if (!file.file_path || !fs.existsSync(file.file_path)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }
    
    res.setHeader('Content-Type', file.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
    
    const fileStream = fs.createReadStream(file.file_path);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ message: 'Failed to download file' });
  }
});

/**
 * List all generated PDF files for the tenant
 */
router.get('/files', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    
    const result = await db.execute(sql`
      SELECT 
        rf.id,
        rf.report_id as "reportId",
        rf.job_id as "jobId",
        rf.file_name as "fileName",
        rf.file_size as "fileSize",
        rf.mime_type as "mimeType",
        rf.status,
        rf.error_message as "errorMessage",
        rf.generated_by as "generatedBy",
        u.username as "generatedByName",
        rf.expires_at as "expiresAt",
        rf.created_at as "createdAt",
        rf.updated_at as "updatedAt"
      FROM report_files rf
      LEFT JOIN users u ON rf.generated_by = u.id
      WHERE rf.tenant_id = ${tenantId}
      ORDER BY rf.created_at DESC
      LIMIT 50
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching report files:', error);
    res.status(500).json({ message: 'Failed to fetch report files' });
  }
});

/**
 * Delete a generated PDF file
 */
router.delete('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const tenantId = requireTenant(req);
    
    const result = await db.execute(sql`
      SELECT file_path FROM report_files
      WHERE id = ${parseInt(fileId)} AND tenant_id = ${tenantId}
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Report file not found' });
    }
    
    const filePath = (result.rows[0] as any).file_path;
    
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    await db.execute(sql`
      DELETE FROM report_files
      WHERE id = ${parseInt(fileId)} AND tenant_id = ${tenantId}
    `);
    
    res.json({ message: 'Report file deleted successfully' });
  } catch (error) {
    console.error('Error deleting report file:', error);
    res.status(500).json({ message: 'Failed to delete report file' });
  }
});

export default router;