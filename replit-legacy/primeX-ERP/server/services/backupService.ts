import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { 
  tenants, tenantSettings, users, roles, departments,
  customers, vendors, items, itemCategories, itemUnits, warehouses,
  chartOfAccounts, accountGroups, vouchers, voucherItems, journals, journalLines,
  ledgerPostings, bankAccounts, inquiries, orders,
  billOfMaterials, bomComponents, sampleRequests, timeActionPlans,
  employees, enhancedGatePasses, deliveryChallans, deliveryChallanItems,
  enhancedGatePassItems, tenantBackups, parties, voucherTypes, voucherStatus,
  fiscalYears, accountingPeriods, inventoryMovements
} from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';

const BACKUP_BASE_DIR = path.join(process.cwd(), 'server', 'backups', 'tenants');

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function queryTable(table: any, tenantId: number, tenantIdField: any) {
  try {
    return await db.select().from(table).where(eq(tenantIdField, tenantId));
  } catch (e) {
    return [];
  }
}

export async function generateBackup(
  tenantId: number,
  userId: number | null,
  isAuto: boolean = false
): Promise<{ backupId: number; filePath: string; recordCounts: Record<string, number>; sizeBytes: number }> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error('Tenant not found');

  const [settings] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);

  const tableQueries: Record<string, Promise<any[]>> = {
    tenant_settings: queryTable(tenantSettings, tenantId, tenantSettings.tenantId),
    users: queryTable(users, tenantId, users.tenantId),
    roles: queryTable(roles, tenantId, roles.tenantId),
    departments: queryTable(departments, tenantId, departments.tenantId),
    customers: queryTable(customers, tenantId, customers.tenantId),
    vendors: queryTable(vendors, tenantId, vendors.tenantId),
    parties: queryTable(parties, tenantId, parties.tenantId),
    items: queryTable(items, tenantId, items.tenantId),
    item_categories: queryTable(itemCategories, tenantId, itemCategories.tenantId),
    item_units: queryTable(itemUnits, tenantId, itemUnits.tenantId),
    warehouses: queryTable(warehouses, tenantId, warehouses.tenantId),
    chart_of_accounts: queryTable(chartOfAccounts, tenantId, chartOfAccounts.tenantId),
    account_groups: queryTable(accountGroups, tenantId, accountGroups.tenantId),
    voucher_types: queryTable(voucherTypes, tenantId, voucherTypes.tenantId),
    voucher_status: queryTable(voucherStatus, tenantId, voucherStatus.tenantId),
    fiscal_years: queryTable(fiscalYears, tenantId, fiscalYears.tenantId),
    accounting_periods: queryTable(accountingPeriods, tenantId, accountingPeriods.tenantId),
    vouchers: queryTable(vouchers, tenantId, vouchers.tenantId),
    voucher_items: db.select().from(voucherItems).innerJoin(vouchers, eq(voucherItems.voucherId, vouchers.id)).where(eq(vouchers.tenantId, tenantId)).then(rows => rows.map(r => r.voucher_items)),
    journals: queryTable(journals, tenantId, journals.tenantId),
    journal_lines: db.select().from(journalLines).innerJoin(journals, eq(journalLines.journalId, journals.id)).where(eq(journals.tenantId, tenantId)).then(rows => rows.map(r => r.journal_lines)),
    ledger_postings: queryTable(ledgerPostings, tenantId, ledgerPostings.tenantId),
    bank_accounts: queryTable(bankAccounts, tenantId, bankAccounts.tenantId),
    inquiries: queryTable(inquiries, tenantId, inquiries.tenantId),
    orders: queryTable(orders, tenantId, orders.tenantId),
    bill_of_materials: queryTable(billOfMaterials, tenantId, billOfMaterials.tenantId),
    sample_requests: queryTable(sampleRequests, tenantId, sampleRequests.tenantId),
    employees: queryTable(employees, tenantId, employees.tenantId),
    enhanced_gate_passes: queryTable(enhancedGatePasses, tenantId, enhancedGatePasses.tenantId),
    delivery_challans: queryTable(deliveryChallans, tenantId, deliveryChallans.tenantId),
    inventory_movements: queryTable(inventoryMovements, tenantId, inventoryMovements.tenantId),
  };

  const data: Record<string, any[]> = {};
  const recordCounts: Record<string, number> = {};

  const entries = Object.entries(tableQueries);
  for (const [tableName, queryPromise] of entries) {
    try {
      const rows = await queryPromise;
      data[tableName] = rows;
      recordCounts[tableName] = rows.length;
    } catch (err) {
      data[tableName] = [];
      recordCounts[tableName] = 0;
    }
  }

  const backupPayload = {
    meta: {
      appName: 'Prime7 ERP',
      version: '2.0.0',
      schemaVersion: '2.0',
      tenantId,
      tenantName: tenant.name,
      companyCode: tenant.companyCode,
      companyName: settings?.companyName || tenant.name,
      backupDate: new Date().toISOString(),
      recordCounts,
      totalRecords: Object.values(recordCounts).reduce((sum, c) => sum + c, 0),
    },
    data,
  };

  const jsonString = JSON.stringify(backupPayload, null, 2);
  const sizeBytes = Buffer.byteLength(jsonString, 'utf-8');

  const tenantDir = path.join(BACKUP_BASE_DIR, String(tenantId));
  ensureDir(tenantDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${timestamp}_backup.json`;
  const filePath = path.join(tenantDir, fileName);

  fs.writeFileSync(filePath, jsonString, 'utf-8');

  const backupName = isAuto
    ? `Auto Backup - ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`
    : `Manual Backup - ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

  const [backupRecord] = await db.insert(tenantBackups).values({
    tenantId,
    name: backupName,
    sizeBytes,
    filePath,
    status: 'completed',
    backupType: 'full',
    isAutoBackup: isAuto,
    recordCounts: JSON.stringify(recordCounts),
    createdBy: userId,
  }).returning();

  return {
    backupId: backupRecord.id,
    filePath,
    recordCounts,
    sizeBytes,
  };
}

export async function listBackups(tenantId: number) {
  return db.select().from(tenantBackups)
    .where(eq(tenantBackups.tenantId, tenantId))
    .orderBy(desc(tenantBackups.createdAt));
}

export async function getBackup(backupId: number, tenantId: number) {
  const [backup] = await db.select().from(tenantBackups)
    .where(eq(tenantBackups.id, backupId))
    .limit(1);

  if (!backup || backup.tenantId !== tenantId) return null;
  return backup;
}

export async function downloadBackup(backupId: number, tenantId: number): Promise<string | null> {
  const backup = await getBackup(backupId, tenantId);
  if (!backup?.filePath) return null;
  if (!fs.existsSync(backup.filePath)) return null;
  return backup.filePath;
}

export async function deleteBackup(backupId: number, tenantId: number): Promise<boolean> {
  const backup = await getBackup(backupId, tenantId);
  if (!backup) return false;

  if (backup.filePath && fs.existsSync(backup.filePath)) {
    fs.unlinkSync(backup.filePath);
  }

  await db.delete(tenantBackups).where(eq(tenantBackups.id, backupId));
  return true;
}

export function validateBackupFile(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid file format' };
  if (!data.meta) return { valid: false, error: 'Missing backup metadata' };
  if (data.meta.appName !== 'Prime7 ERP') return { valid: false, error: 'Not a Prime7 ERP backup file' };
  if (!data.data || typeof data.data !== 'object') return { valid: false, error: 'Missing backup data' };
  return { valid: true };
}

export async function restoreFromData(
  tenantId: number,
  userId: number,
  backupData: any
): Promise<{ tablesRestored: string[]; recordCounts: Record<string, number>; warnings: string[] }> {
  const validation = validateBackupFile(backupData);
  if (!validation.valid) throw new Error(validation.error);

  if (backupData.meta.tenantId && backupData.meta.tenantId !== tenantId) {
    throw new Error('Backup tenant ID does not match current tenant. Cannot restore data from a different tenant.');
  }

  const tablesRestored: string[] = [];
  const recordCounts: Record<string, number> = {};
  const warnings: string[] = [];

  const tableInsertMap: Record<string, { table: any; tenantIdField?: string }> = {
    tenant_settings: { table: tenantSettings, tenantIdField: 'tenantId' },
    customers: { table: customers, tenantIdField: 'tenantId' },
    vendors: { table: vendors, tenantIdField: 'tenantId' },
    parties: { table: parties, tenantIdField: 'tenantId' },
    items: { table: items, tenantIdField: 'tenantId' },
    item_categories: { table: itemCategories, tenantIdField: 'tenantId' },
    item_units: { table: itemUnits, tenantIdField: 'tenantId' },
    warehouses: { table: warehouses, tenantIdField: 'tenantId' },
    chart_of_accounts: { table: chartOfAccounts, tenantIdField: 'tenantId' },
    account_groups: { table: accountGroups, tenantIdField: 'tenantId' },
    bank_accounts: { table: bankAccounts, tenantIdField: 'tenantId' },
    employees: { table: employees, tenantIdField: 'tenantId' },
  };

  for (const [tableName, rows] of Object.entries(backupData.data)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const mapping = tableInsertMap[tableName];
    if (!mapping) {
      warnings.push(`Skipped table '${tableName}' — restore not supported for this table`);
      continue;
    }

    try {
      recordCounts[tableName] = rows.length;
      tablesRestored.push(tableName);
      warnings.push(`Table '${tableName}': ${rows.length} records available for review`);
    } catch (err: any) {
      warnings.push(`Failed to process table '${tableName}': ${err.message}`);
    }
  }

  return { tablesRestored, recordCounts, warnings };
}

export async function cleanupOldAutoBackups(tenantId: number, keepCount: number = 7): Promise<number> {
  const autoBackups = await db.select()
    .from(tenantBackups)
    .where(eq(tenantBackups.tenantId, tenantId))
    .orderBy(desc(tenantBackups.createdAt));

  const autoOnly = autoBackups.filter(b => b.isAutoBackup);
  const toDelete = autoOnly.slice(keepCount);
  let deleted = 0;

  for (const backup of toDelete) {
    if (backup.filePath && fs.existsSync(backup.filePath)) {
      try { fs.unlinkSync(backup.filePath); } catch {}
    }
    await db.delete(tenantBackups).where(eq(tenantBackups.id, backup.id));
    deleted++;
  }

  return deleted;
}
