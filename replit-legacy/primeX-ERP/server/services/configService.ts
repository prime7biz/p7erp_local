import { db } from '../db';
import { tenantLedgerMappings, tenantWarehouseDefaults, approvalPolicies, numberSeries, tenantSettings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export async function getTenantLedgerMappings(tenantId: number): Promise<any> {
  const [result] = await db.select().from(tenantLedgerMappings).where(eq(tenantLedgerMappings.tenantId, tenantId));
  return result || null;
}

export async function upsertTenantLedgerMappings(tenantId: number, data: any): Promise<any> {
  const [result] = await db.insert(tenantLedgerMappings)
    .values({ tenantId, ...data })
    .onConflictDoUpdate({
      target: [tenantLedgerMappings.tenantId],
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return result;
}

export async function getTenantWarehouseDefaults(tenantId: number): Promise<any> {
  const [result] = await db.select().from(tenantWarehouseDefaults).where(eq(tenantWarehouseDefaults.tenantId, tenantId));
  return result || null;
}

export async function upsertTenantWarehouseDefaults(tenantId: number, data: any): Promise<any> {
  const [result] = await db.insert(tenantWarehouseDefaults)
    .values({ tenantId, ...data })
    .onConflictDoUpdate({
      target: [tenantWarehouseDefaults.tenantId],
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return result;
}

export async function getApprovalPolicies(tenantId: number, docType?: string): Promise<any[]> {
  if (docType) {
    return db.select().from(approvalPolicies).where(
      and(
        eq(approvalPolicies.tenantId, tenantId),
        eq(approvalPolicies.docType, docType)
      )
    );
  }
  return db.select().from(approvalPolicies).where(eq(approvalPolicies.tenantId, tenantId));
}

export async function upsertApprovalPolicy(tenantId: number, data: any): Promise<any> {
  const [result] = await db.insert(approvalPolicies)
    .values({ tenantId, ...data })
    .onConflictDoUpdate({
      target: [approvalPolicies.id],
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return result;
}

export async function getSystemReadiness(tenantId: number): Promise<object> {
  const checks: Array<{ name: string; status: 'ok' | 'missing' | 'partial'; details?: any }> = [];

  const [settings] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  const settingsComplete = !!(settings?.companyName && settings?.baseCurrency && settings?.fiscalYearStart);
  checks.push({
    name: 'tenant_settings',
    status: settings ? (settingsComplete ? 'ok' : 'partial') : 'missing',
    details: settings ? {
      companyName: !!settings.companyName,
      baseCurrency: !!settings.baseCurrency,
      fiscalYearStart: !!settings.fiscalYearStart,
    } : undefined,
  });

  const ledgerMappings = await getTenantLedgerMappings(tenantId);
  if (ledgerMappings) {
    const mappingFields = [
      'inventoryAssetLedgerId', 'accountsReceivableLedgerId', 'accountsPayableLedgerId',
      'salesRevenueLedgerId', 'cogsLedgerId', 'salaryExpenseLedgerId', 'salaryPayableLedgerId',
      'bankLedgerId', 'cashLedgerId',
    ];
    const set = mappingFields.filter(f => ledgerMappings[f] != null);
    const missing = mappingFields.filter(f => ledgerMappings[f] == null);
    checks.push({
      name: 'ledger_mappings',
      status: missing.length === 0 ? 'ok' : (set.length > 0 ? 'partial' : 'missing'),
      details: { set, missing },
    });
  } else {
    checks.push({ name: 'ledger_mappings', status: 'missing' });
  }

  const series = await db.select().from(numberSeries).where(eq(numberSeries.tenantId, tenantId));
  const configuredDocTypes = series.map(s => s.docType);
  const requiredDocTypes = ['PO', 'SO', 'GRN', 'INV', 'VOUCHER', 'DC'];
  const missingDocTypes = requiredDocTypes.filter(dt => !configuredDocTypes.includes(dt));
  checks.push({
    name: 'number_series',
    status: missingDocTypes.length === 0 ? 'ok' : (configuredDocTypes.length > 0 ? 'partial' : 'missing'),
    details: { configured: configuredDocTypes, missing: missingDocTypes },
  });

  const warehouseDefaults = await getTenantWarehouseDefaults(tenantId);
  checks.push({
    name: 'warehouse_defaults',
    status: warehouseDefaults ? 'ok' : 'missing',
    details: warehouseDefaults ? {
      rm: !!warehouseDefaults.defaultWarehouseRmId,
      wip: !!warehouseDefaults.defaultWarehouseWipId,
      fg: !!warehouseDefaults.defaultWarehouseFgId,
    } : undefined,
  });

  const ready = checks.every(c => c.status === 'ok');
  return { ready, checks };
}
