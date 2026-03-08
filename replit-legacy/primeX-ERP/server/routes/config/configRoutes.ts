import { Router, Request, Response } from "express";
import { getNumberSeries, upsertNumberSeries, previewNextNumber, generateNextNumber } from '../../services/numberSeriesService';
import { getTenantLedgerMappings, upsertTenantLedgerMappings, getTenantWarehouseDefaults, upsertTenantWarehouseDefaults, getApprovalPolicies, upsertApprovalPolicy, getSystemReadiness } from '../../services/configService';
import { db } from '../../db';
import { tenantSettings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

// ============================================================================
// Tenant Settings Routes
// ============================================================================

/**
 * GET /tenant
 * Get tenant settings for the authenticated tenant
 */
router.get('/tenant', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    
    const [settings] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
    
    if (!settings) {
      return res.status(404).json({ success: false, message: 'Tenant settings not found' });
    }
    
    return res.json({ success: true, data: settings });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error fetching tenant settings:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

/**
 * PUT /tenant
 * Update tenant settings
 */
router.put('/tenant', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const updateData = req.body;
    
    const [updated] = await db.update(tenantSettings)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(tenantSettings.tenantId, tenantId))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Tenant settings not found' });
    }
    
    return res.json({ success: true, data: updated });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error updating tenant settings:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/tenant/business-type', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { tenants } = await import('@shared/schema');
    const [tenant] = await db.select({ businessType: tenants.businessType }).from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
    return res.json({ success: true, data: { businessType: tenant.businessType } });
  } catch (error: any) {
    console.error('Error fetching business type:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.put('/tenant/business-type', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { businessType } = req.body;
    if (!['buying_house', 'manufacturer', 'both'].includes(businessType)) {
      return res.status(400).json({ success: false, message: 'Invalid business type. Must be buying_house, manufacturer, or both.' });
    }
    const { tenants } = await import('@shared/schema');
    const [updated] = await db.update(tenants)
      .set({ businessType, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();
    if (!updated) return res.status(404).json({ success: false, message: 'Tenant not found' });
    return res.json({ success: true, data: { businessType: updated.businessType } });
  } catch (error: any) {
    console.error('Error updating business type:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Number Series Routes
// ============================================================================

/**
 * GET /number-series
 * Get all number series for the tenant
 */
router.get('/number-series', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const series = await getNumberSeries(tenantId);
    
    return res.json({ success: true, data: series });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error fetching number series:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

/**
 * POST /number-series
 * Create or update (upsert) number series
 */
router.post('/number-series', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { docType, prefix, padding, resetPolicy } = req.body;
    
    if (!docType || !prefix) {
      return res.status(400).json({ success: false, message: 'docType and prefix are required' });
    }
    
    const result = await upsertNumberSeries(tenantId, {
      docType,
      prefix,
      padding,
      resetPolicy,
    });
    
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error upserting number series:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

/**
 * POST /number-series/:docType/preview
 * Preview the next number that would be generated for a document type
 */
router.post('/number-series/:docType/preview', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { docType } = req.params;
    
    const nextNumber = await previewNextNumber(tenantId, docType);
    
    return res.json({ success: true, data: { nextNumber } });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error previewing number series:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

/**
 * POST /number-series/:docType/next
 * Generate the next number for a document type (internal/admin only)
 * This actually increments the counter
 */
router.post('/number-series/:docType/next', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { docType } = req.params;
    const { date } = req.body;
    
    const nextNumber = await generateNextNumber(tenantId, docType, { date });
    
    return res.json({ success: true, data: { nextNumber } });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error generating next number:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Ledger Mappings Routes
// ============================================================================

/**
 * GET /ledger-mappings
 * Get tenant ledger mappings
 */
router.get('/ledger-mappings', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const mappings = await getTenantLedgerMappings(tenantId);
    
    return res.json({ success: true, data: mappings });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error fetching ledger mappings:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

/**
 * PUT /ledger-mappings
 * Upsert tenant ledger mappings
 */
router.put('/ledger-mappings', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const mappingData = req.body;
    
    const result = await upsertTenantLedgerMappings(tenantId, mappingData);
    
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error upserting ledger mappings:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Warehouse Defaults Routes
// ============================================================================

/**
 * GET /warehouses/defaults
 * Get warehouse defaults for the tenant
 */
router.get('/warehouses/defaults', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const defaults = await getTenantWarehouseDefaults(tenantId);
    
    return res.json({ success: true, data: defaults });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error fetching warehouse defaults:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

/**
 * PUT /warehouses/defaults
 * Upsert warehouse defaults for the tenant
 */
router.put('/warehouses/defaults', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const defaultsData = req.body;
    
    const result = await upsertTenantWarehouseDefaults(tenantId, defaultsData);
    
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error upserting warehouse defaults:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Approval Policies Routes
// ============================================================================

/**
 * GET /approval-policies
 * Get approval policies for the tenant
 * Optional query param: ?docType= to filter by document type
 */
router.get('/approval-policies', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { docType } = req.query;
    
    const policies = await getApprovalPolicies(tenantId, docType as string | undefined);
    
    return res.json({ success: true, data: policies });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error fetching approval policies:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

/**
 * POST /approval-policies
 * Create or update (upsert) an approval policy
 */
router.post('/approval-policies', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const policyData = req.body;
    
    if (!policyData.docType || !policyData.action) {
      return res.status(400).json({ success: false, message: 'docType and action are required' });
    }
    
    const result = await upsertApprovalPolicy(tenantId, policyData);
    
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error upserting approval policy:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// System Readiness Routes
// ============================================================================

/**
 * GET /health
 * Get system readiness check for the tenant
 * Returns a report on configuration completeness
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const readinessReport = await getSystemReadiness(tenantId);
    
    return res.json({ success: true, data: readinessReport });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting system readiness:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

export default router;
