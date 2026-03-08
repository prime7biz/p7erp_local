import { db } from '../db';
import { parties, customers, vendors, chartOfAccounts, accountGroups } from '@shared/schema';
import { eq, and, ilike, sql, desc } from 'drizzle-orm';

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-\(\)\+]/g, '').trim();
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

async function findMatchingParty(tenantId: number, opts: {
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  name: string;
}) {
  const allParties = await db.select().from(parties)
    .where(eq(parties.tenantId, tenantId));

  if (opts.taxId) {
    const match = allParties.find(p => p.taxId && p.taxId === opts.taxId);
    if (match) return match;
  }

  const normalizedEmail = normalizeEmail(opts.email);
  if (normalizedEmail) {
    const match = allParties.find(p => normalizeEmail(p.email) === normalizedEmail);
    if (match) return match;
  }

  const normalizedPhone = normalizePhone(opts.phone);
  if (normalizedPhone) {
    const match = allParties.find(p => normalizePhone(p.phone) === normalizedPhone);
    if (match) return match;
  }

  const normalizedName = normalizeName(opts.name);
  const match = allParties.find(p => normalizeName(p.name) === normalizedName);
  if (match) return match;

  return null;
}

async function findMatchingCustomer(tenantId: number, opts: {
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  name: string;
}) {
  const allCustomers = await db.select().from(customers)
    .where(eq(customers.tenantId, tenantId));

  const normalizedEmail = normalizeEmail(opts.email);
  if (normalizedEmail) {
    const match = allCustomers.find(c => normalizeEmail(c.email) === normalizedEmail);
    if (match) return match;
  }

  const normalizedPhone = normalizePhone(opts.phone);
  if (normalizedPhone) {
    const match = allCustomers.find(c => normalizePhone(c.phone) === normalizedPhone);
    if (match) return match;
  }

  const normalizedName = normalizeName(opts.name);
  const match = allCustomers.find(c => normalizeName(c.customerName) === normalizedName);
  if (match) return match;

  return null;
}

async function findMatchingVendor(tenantId: number, opts: {
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  name: string;
}) {
  const allVendors = await db.select().from(vendors)
    .where(eq(vendors.tenantId, tenantId));

  if (opts.taxId) {
    const match = allVendors.find(v => v.taxId && v.taxId === opts.taxId);
    if (match) return match;
  }

  const normalizedEmail = normalizeEmail(opts.email);
  if (normalizedEmail) {
    const match = allVendors.find(v => normalizeEmail(v.email) === normalizedEmail);
    if (match) return match;
  }

  const normalizedPhone = normalizePhone(opts.phone);
  if (normalizedPhone) {
    const match = allVendors.find(v => normalizePhone(v.phone) === normalizedPhone);
    if (match) return match;
  }

  const normalizedName = normalizeName(opts.name);
  const match = allVendors.find(v => normalizeName(v.vendorName) === normalizedName);
  if (match) return match;

  return null;
}

async function generatePartyCode(tenantId: number, partyType: string): Promise<string> {
  const prefix = partyType === 'vendor' ? 'VND' : partyType === 'customer' ? 'CUS' : 'PTY';
  const existing = await db
    .select({ partyCode: parties.partyCode })
    .from(parties)
    .where(and(eq(parties.tenantId, tenantId), ilike(parties.partyCode, `${prefix}-%`)))
    .orderBy(desc(parties.id));

  let maxNum = 0;
  for (const row of existing) {
    const num = parseInt(row.partyCode.replace(`${prefix}-`, ''), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

async function generateCustomerId(tenantId: number): Promise<string> {
  const existingCustomers = await db.select({ customerId: customers.customerId })
    .from(customers)
    .where(eq(customers.tenantId, tenantId));
  let maxNum = 0;
  for (const c of existingCustomers) {
    if (c.customerId?.startsWith('CUST-')) {
      const num = parseInt(c.customerId.substring(5), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `CUST-${String(maxNum + 1).padStart(5, '0')}`;
}

async function generateVendorCode(tenantId: number): Promise<string> {
  const existingVendors = await db.select({ vendorCode: vendors.vendorCode })
    .from(vendors)
    .where(eq(vendors.tenantId, tenantId));
  let maxNum = 0;
  for (const v of existingVendors) {
    if (v.vendorCode?.startsWith('VND-')) {
      const num = parseInt(v.vendorCode.substring(4), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `VND-${String(maxNum + 1).padStart(3, '0')}`;
}

async function getNextAccountNumber(tenantId: number): Promise<string> {
  const [result] = await db
    .select({ maxNum: sql<string>`MAX(CAST(account_number AS integer))` })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.tenantId, tenantId));
  const maxNum = parseInt(result?.maxNum || '0', 10);
  return String(maxNum + 1);
}

async function getOrCreateSundryGroup(tenantId: number, type: 'debtor' | 'creditor'): Promise<{ id: number; name: string }> {
  const pattern = type === 'debtor' ? '%sundry debtor%' : '%sundry creditor%';
  const [existing] = await db.select().from(accountGroups)
    .where(and(eq(accountGroups.tenantId, tenantId), ilike(accountGroups.name, pattern)));
  if (existing) return { id: existing.id, name: existing.name };

  if (type === 'creditor') {
    throw new Error('Sundry Creditors group not found for tenant');
  }

  const [currentAssetsGroup] = await db.select().from(accountGroups)
    .where(and(eq(accountGroups.tenantId, tenantId), ilike(accountGroups.name, '%current asset%')));
  const parentGroupId = currentAssetsGroup?.id || 108;

  const [newGroup] = await db.insert(accountGroups).values({
    tenantId,
    name: 'Sundry Debtors',
    code: 'SUNDRY_DEBTORS',
    parentGroupId,
    nature: 'Asset',
    affectsGrossProfit: false,
    isDefault: false,
    sortOrder: 0,
    isActive: true,
  }).returning();
  return { id: newGroup.id, name: newGroup.name };
}

async function createLedgerAccount(tenantId: number, partyName: string, partyType: string): Promise<number> {
  const isDebtor = partyType === 'customer';
  const group = isDebtor
    ? await getOrCreateSundryGroup(tenantId, 'debtor')
    : await getOrCreateSundryGroup(tenantId, 'creditor');

  const accountNumber = await getNextAccountNumber(tenantId);

  const result = await db.insert(chartOfAccounts).values({
    tenantId,
    accountTypeId: isDebtor ? 1 : 2,
    groupId: group.id,
    accountNumber,
    name: partyName,
    isActive: true,
    path: `${group.name}/${partyName}`,
    level: 2,
    allowJournalEntries: true,
    isCashAccount: false,
    isBankAccount: false,
    normalBalance: isDebtor ? 'debit' : 'credit',
    balance: '0',
    openingBalance: '0',
    isMaterialSupplier: false,
  }).returning();
  const newAccount = (result as any[])[0];

  return newAccount.id;
}

export async function upsertPartyFromCustomer(
  tenantId: number,
  customer: {
    id: number;
    customerName: string;
    email?: string | null;
    phone?: string | null;
    contactPerson?: string | null;
    address?: string | null;
    country?: string | null;
    paymentTerms?: string | null;
  },
  userId?: number | null,
): Promise<void> {
  try {
    const existing = await findMatchingParty(tenantId, {
      email: customer.email,
      phone: customer.phone,
      name: customer.customerName,
    });

    if (existing) {
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (!existing.customerId) updateData.customerId = customer.id;
      if (existing.partyType === 'vendor') updateData.partyType = 'both';
      if (customer.email && !existing.email) updateData.email = customer.email;
      if (customer.phone && !existing.phone) updateData.phone = customer.phone;
      if (customer.contactPerson && !existing.contactPerson) updateData.contactPerson = customer.contactPerson;
      if (customer.address && !existing.address) updateData.address = customer.address;
      if (customer.country && !existing.country) updateData.country = customer.country;

      await db.update(parties)
        .set(updateData)
        .where(and(eq(parties.id, existing.id), eq(parties.tenantId, tenantId)));
      return;
    }

    const ledgerAccountId = await createLedgerAccount(tenantId, customer.customerName, 'customer');
    const partyCode = await generatePartyCode(tenantId, 'customer');

    await db.insert(parties).values({
      partyCode,
      name: customer.customerName,
      partyType: 'customer',
      ledgerAccountId,
      customerId: customer.id,
      contactPerson: customer.contactPerson || null,
      email: customer.email || null,
      phone: customer.phone || null,
      address: customer.address || null,
      country: customer.country || null,
      defaultPaymentTerms: customer.paymentTerms || null,
      groupLabel: 'Customer',
      tenantId,
      createdBy: userId || null,
      isActive: true,
    });
  } catch (error) {
    console.error('partySyncService: upsertPartyFromCustomer error (non-blocking):', error);
  }
}

export async function upsertPartyFromVendor(
  tenantId: number,
  vendor: {
    id: number;
    vendorName: string;
    vendorType?: string | null;
    email?: string | null;
    phone?: string | null;
    contactPerson?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    taxId?: string | null;
    bankName?: string | null;
    bankAccount?: string | null;
    paymentTerms?: string | null;
    creditLimit?: string | null;
  },
  userId?: number | null,
): Promise<void> {
  try {
    const existing = await findMatchingParty(tenantId, {
      taxId: vendor.taxId,
      email: vendor.email,
      phone: vendor.phone,
      name: vendor.vendorName,
    });

    if (existing) {
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (existing.partyType === 'customer') updateData.partyType = 'both';
      if (vendor.email && !existing.email) updateData.email = vendor.email;
      if (vendor.phone && !existing.phone) updateData.phone = vendor.phone;
      if (vendor.contactPerson && !existing.contactPerson) updateData.contactPerson = vendor.contactPerson;
      if (vendor.address && !existing.address) updateData.address = vendor.address;
      if (vendor.city && !existing.city) updateData.city = vendor.city;
      if (vendor.country && !existing.country) updateData.country = vendor.country;
      if (vendor.taxId && !existing.taxId) updateData.taxId = vendor.taxId;
      if (vendor.bankName && !existing.bankName) updateData.bankName = vendor.bankName;
      if (vendor.bankAccount && !existing.bankAccountNumber) updateData.bankAccountNumber = vendor.bankAccount;

      await db.update(parties)
        .set(updateData)
        .where(and(eq(parties.id, existing.id), eq(parties.tenantId, tenantId)));
      return;
    }

    const ledgerAccountId = await createLedgerAccount(tenantId, vendor.vendorName, 'vendor');
    const partyCode = await generatePartyCode(tenantId, 'vendor');

    await db.insert(parties).values({
      partyCode,
      name: vendor.vendorName,
      partyType: 'vendor',
      ledgerAccountId,
      contactPerson: vendor.contactPerson || null,
      email: vendor.email || null,
      phone: vendor.phone || null,
      address: vendor.address || null,
      city: vendor.city || null,
      country: vendor.country || null,
      groupLabel: vendor.vendorType || 'Supplier',
      taxId: vendor.taxId || null,
      bankName: vendor.bankName || null,
      bankAccountNumber: vendor.bankAccount || null,
      creditLimit: vendor.creditLimit || '0',
      defaultPaymentTerms: vendor.paymentTerms || null,
      tenantId,
      createdBy: userId || null,
      isActive: true,
    });
  } catch (error) {
    console.error('partySyncService: upsertPartyFromVendor error (non-blocking):', error);
  }
}

export async function upsertCustomerFromParty(
  tenantId: number,
  party: {
    id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    contactPerson?: string | null;
    address?: string | null;
    country?: string | null;
    defaultPaymentTerms?: string | null;
  },
): Promise<number | null> {
  try {
    const existing = await findMatchingCustomer(tenantId, {
      email: party.email,
      phone: party.phone,
      name: party.name,
    });

    if (existing) {
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (party.email && normalizeEmail(party.email) !== normalizeEmail(existing.email)) updateData.email = party.email;
      if (party.phone && normalizePhone(party.phone) !== normalizePhone(existing.phone)) updateData.phone = party.phone;
      if (party.contactPerson && !existing.contactPerson) updateData.contactPerson = party.contactPerson;
      if (party.address && !existing.address) updateData.address = party.address;

      if (Object.keys(updateData).length > 1) {
        await db.update(customers)
          .set(updateData)
          .where(and(eq(customers.id, existing.id), eq(customers.tenantId, tenantId)));
      }
      return existing.id;
    }

    const custId = await generateCustomerId(tenantId);
    const [newCustomer] = await db.insert(customers).values({
      customerId: custId,
      customerName: party.name,
      address: party.address || null,
      website: null,
      country: party.country || 'BD',
      hasAgent: false,
      contactPerson: party.contactPerson || party.name,
      email: party.email || `${party.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      phone: party.phone || '',
      paymentTerms: party.defaultPaymentTerms || null,
      isActive: true,
      tenantId,
    }).returning();
    return newCustomer.id;
  } catch (error) {
    console.error('partySyncService: upsertCustomerFromParty error (non-blocking):', error);
    return null;
  }
}

export async function upsertVendorFromParty(
  tenantId: number,
  party: {
    id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    contactPerson?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    taxId?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    groupLabel?: string | null;
    creditLimit?: string | null;
    defaultPaymentTerms?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  try {
    const existing = await findMatchingVendor(tenantId, {
      taxId: party.taxId,
      email: party.email,
      phone: party.phone,
      name: party.name,
    });

    if (existing) {
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (party.email && normalizeEmail(party.email) !== normalizeEmail(existing.email)) updateData.email = party.email;
      if (party.phone && normalizePhone(party.phone) !== normalizePhone(existing.phone)) updateData.phone = party.phone;
      if (party.contactPerson && !existing.contactPerson) updateData.contactPerson = party.contactPerson;
      if (party.address && !existing.address) updateData.address = party.address;
      if (party.city && !existing.city) updateData.city = party.city;
      if (party.country && !existing.country) updateData.country = party.country;
      if (party.taxId && !existing.taxId) updateData.taxId = party.taxId;

      if (Object.keys(updateData).length > 1) {
        await db.update(vendors)
          .set(updateData)
          .where(and(eq(vendors.id, existing.id), eq(vendors.tenantId, tenantId)));
      }
      return;
    }

    const vendorCode = await generateVendorCode(tenantId);
    await db.insert(vendors).values({
      vendorCode,
      vendorName: party.name,
      vendorType: party.groupLabel || null,
      contactPerson: party.contactPerson || null,
      phone: party.phone || null,
      email: party.email || null,
      address: party.address || null,
      city: party.city || null,
      country: party.country || null,
      taxId: party.taxId || null,
      bankName: party.bankName || null,
      bankAccount: party.bankAccountNumber || null,
      paymentTerms: party.defaultPaymentTerms || null,
      creditLimit: party.creditLimit || null,
      isActive: true,
      notes: party.notes || null,
      tenantId,
    });
  } catch (error) {
    console.error('partySyncService: upsertVendorFromParty error (non-blocking):', error);
  }
}

export async function syncExistingRecords(tenantId: number, userId?: number | null): Promise<{
  customersToParties: number;
  vendorsToParties: number;
  details: { customerParties: string[]; vendorParties: string[] };
}> {
  const summary = {
    customersToParties: 0,
    vendorsToParties: 0,
    details: { customerParties: [] as string[], vendorParties: [] as string[] },
  };

  const allCustomers = await db.select().from(customers)
    .where(eq(customers.tenantId, tenantId));

  for (const cust of allCustomers) {
    const existingParty = await findMatchingParty(tenantId, {
      email: cust.email,
      phone: cust.phone,
      name: cust.customerName,
    });

    if (existingParty) {
      if (!existingParty.customerId) {
        await db.update(parties)
          .set({ customerId: cust.id, updatedAt: new Date() })
          .where(eq(parties.id, existingParty.id));
      }
      continue;
    }

    await upsertPartyFromCustomer(tenantId, {
      id: cust.id,
      customerName: cust.customerName,
      email: cust.email,
      phone: cust.phone,
      contactPerson: cust.contactPerson,
      address: cust.address,
      country: cust.country,
      paymentTerms: cust.paymentTerms,
    }, userId);

    summary.customersToParties++;
    summary.details.customerParties.push(cust.customerName);
  }

  const allVendors = await db.select().from(vendors)
    .where(eq(vendors.tenantId, tenantId));

  for (const vnd of allVendors) {
    const existingParty = await findMatchingParty(tenantId, {
      taxId: vnd.taxId,
      email: vnd.email,
      phone: vnd.phone,
      name: vnd.vendorName,
    });

    if (existingParty) continue;

    await upsertPartyFromVendor(tenantId, {
      id: vnd.id,
      vendorName: vnd.vendorName,
      vendorType: vnd.vendorType,
      email: vnd.email,
      phone: vnd.phone,
      contactPerson: vnd.contactPerson,
      address: vnd.address,
      city: vnd.city,
      country: vnd.country,
      taxId: vnd.taxId,
      bankName: vnd.bankName,
      bankAccount: vnd.bankAccount,
      paymentTerms: vnd.paymentTerms,
      creditLimit: vnd.creditLimit ? String(vnd.creditLimit) : null,
    }, userId);

    summary.vendorsToParties++;
    summary.details.vendorParties.push(vnd.vendorName);
  }

  return summary;
}
