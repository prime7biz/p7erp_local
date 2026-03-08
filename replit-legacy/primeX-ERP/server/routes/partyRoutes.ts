import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../db';
import { parties, chartOfAccounts, accountGroups, voucherItems, vouchers, customers, vendors } from '@shared/schema';
import { eq, and, ilike, sql, desc, or, count, isNull, inArray, max } from 'drizzle-orm';
import { requireLock } from '../middleware/lockMiddleware';
import { requirePermission } from '../middleware/rbacMiddleware';
import { upsertCustomerFromParty, upsertVendorFromParty, syncExistingRecords } from '../services/partySyncService';

const router = express.Router();

const getTenantId = (req: Request): number => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new Error("Tenant ID not found");
  return tenantId;
};

const getUserId = (req: Request): number => {
  const userId = req.user?.id;
  if (!userId) throw new Error("User ID not found");
  return userId;
};

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

async function getNextAccountNumber(tenantId: number): Promise<string> {
  const [result] = await db
    .select({ maxNum: sql<string>`MAX(CAST(account_number AS integer))` })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.tenantId, tenantId));
  const maxNum = parseInt(result?.maxNum || '0', 10);
  return String(maxNum + 1);
}

async function getOrCreateSundryDebtorsGroup(tenantId: number): Promise<{ id: number; name: string }> {
  const [existing] = await db.select().from(accountGroups)
    .where(and(eq(accountGroups.tenantId, tenantId), ilike(accountGroups.name, '%sundry debtor%')));
  if (existing) return { id: existing.id, name: existing.name };

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

async function getSundryCreditorGroup(tenantId: number): Promise<{ id: number; name: string }> {
  const [existing] = await db.select().from(accountGroups)
    .where(and(eq(accountGroups.tenantId, tenantId), ilike(accountGroups.name, '%sundry creditor%')));
  if (existing) return { id: existing.id, name: existing.name };
  throw new Error('Sundry Creditors group not found for tenant');
}

async function createLedgerAccount(tenantId: number, partyName: string, partyType: string): Promise<number> {
  const isDebtor = partyType === 'customer';
  const group = isDebtor
    ? await getOrCreateSundryDebtorsGroup(tenantId)
    : await getSundryCreditorGroup(tenantId);

  const accountNumber = await getNextAccountNumber(tenantId);

  const [newAccount] = await db.insert(chartOfAccounts).values({
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

  return newAccount.id;
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

async function autoCreateCustomer(tenantId: number, partyName: string, partyData: any): Promise<number> {
  const custId = await generateCustomerId(tenantId);
  const [newCustomer] = await db.insert(customers).values({
    customerId: custId,
    customerName: partyName,
    address: partyData.address || null,
    website: null,
    country: partyData.country || 'BD',
    hasAgent: false,
    contactPerson: partyData.contactPerson || partyName,
    email: partyData.email || `${partyName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    phone: partyData.phone || '',
    paymentTerms: partyData.defaultPaymentTerms || null,
    isActive: true,
    tenantId,
  }).returning();
  return newCustomer.id;
}

async function autoCreateVendor(tenantId: number, partyName: string, partyData: any): Promise<void> {
  const vendorCode = await generateVendorCode(tenantId);
  await db.insert(vendors).values({
    vendorCode,
    vendorName: partyName,
    vendorType: partyData.groupLabel || null,
    contactPerson: partyData.contactPerson || null,
    phone: partyData.phone || null,
    email: partyData.email || null,
    address: partyData.address || null,
    city: partyData.city || null,
    country: partyData.country || null,
    taxId: partyData.taxId || null,
    bankName: partyData.bankName || null,
    bankAccount: partyData.bankAccountNumber || null,
    paymentTerms: partyData.defaultPaymentTerms || null,
    creditLimit: partyData.creditLimit ? String(partyData.creditLimit) : null,
    isActive: true,
    notes: partyData.notes || null,
    tenantId,
  }).returning();
}

router.get('/summary', requirePermission('crm:customer:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const [totalResult] = await db
      .select({ count: count() })
      .from(parties)
      .where(and(eq(parties.tenantId, tenantId), eq(parties.isActive, true)));

    const [vendorResult] = await db
      .select({ count: count() })
      .from(parties)
      .where(and(eq(parties.tenantId, tenantId), eq(parties.isActive, true), eq(parties.partyType, 'vendor')));

    const [customerResult] = await db
      .select({ count: count() })
      .from(parties)
      .where(and(eq(parties.tenantId, tenantId), eq(parties.isActive, true), eq(parties.partyType, 'customer')));

    const [bothResult] = await db
      .select({ count: count() })
      .from(parties)
      .where(and(eq(parties.tenantId, tenantId), eq(parties.isActive, true), eq(parties.partyType, 'both')));

    res.json({
      totalParties: totalResult?.count || 0,
      totalVendors: vendorResult?.count || 0,
      totalCustomers: customerResult?.count || 0,
      totalBoth: bothResult?.count || 0,
    });
  } catch (error: any) {
    console.error('Party summary error:', error);
    res.status(500).json({ message: error.message || 'Failed to get party summary' });
  }
});

router.get('/', requirePermission('crm:customer:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { search, partyType, group, page = '1', limit = '50' } = req.query as Record<string, string>;

    const conditions: any[] = [eq(parties.tenantId, tenantId)];

    if (partyType && partyType !== 'all') {
      conditions.push(eq(parties.partyType, partyType));
    }
    if (group && group !== 'all') {
      conditions.push(eq(parties.groupLabel, group));
    }
    if (search) {
      conditions.push(
        or(
          ilike(parties.name, `%${search}%`),
          ilike(parties.partyCode, `%${search}%`)
        )
      );
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await db
      .select({
        party: parties,
        ledgerAccountName: chartOfAccounts.name,
        ledgerAccountNumber: chartOfAccounts.accountNumber,
      })
      .from(parties)
      .leftJoin(chartOfAccounts, eq(parties.ledgerAccountId, chartOfAccounts.id))
      .where(and(...conditions))
      .orderBy(desc(parties.createdAt))
      .limit(parseInt(limit))
      .offset(offset);

    const [countResult] = await db
      .select({ count: count() })
      .from(parties)
      .where(and(...conditions));

    const partyList = result.map(r => ({
      ...r.party,
      ledgerAccountName: r.ledgerAccountName,
      ledgerAccountNumber: r.ledgerAccountNumber,
    }));

    res.json({
      parties: partyList,
      total: countResult?.count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error: any) {
    console.error('List parties error:', error);
    res.status(500).json({ message: error.message || 'Failed to list parties' });
  }
});

router.get('/:id', requirePermission('crm:customer:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid party ID' });

    const [result] = await db
      .select({
        party: parties,
        ledgerAccountName: chartOfAccounts.name,
        ledgerAccountNumber: chartOfAccounts.accountNumber,
      })
      .from(parties)
      .leftJoin(chartOfAccounts, eq(parties.ledgerAccountId, chartOfAccounts.id))
      .where(and(eq(parties.id, id), eq(parties.tenantId, tenantId)));

    if (!result) return res.status(404).json({ message: 'Party not found' });

    let balance = null;
    if (result.party.ledgerAccountId) {
      const balanceResult = await db.execute(sql`
        SELECT 
          COALESCE(SUM(CAST(vi.debit_amount AS numeric)), 0) as total_debit,
          COALESCE(SUM(CAST(vi.credit_amount AS numeric)), 0) as total_credit
        FROM voucher_items vi
        JOIN vouchers v ON vi.voucher_id = v.id
        WHERE vi.account_id = ${result.party.ledgerAccountId}
          AND vi.tenant_id = ${tenantId}
          AND v.is_cancelled = false
      `);
      const [coaRow] = await db.select({ openingBalance: chartOfAccounts.openingBalance })
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.id, result.party.ledgerAccountId), eq(chartOfAccounts.tenantId, tenantId)));
      const coaOpeningBal = parseFloat(coaRow?.openingBalance || '0');

      if (balanceResult.rows.length > 0) {
        const row = balanceResult.rows[0] as any;
        const totalDebit = parseFloat(row.total_debit) || 0;
        const totalCredit = parseFloat(row.total_credit) || 0;
        balance = {
          totalDebit,
          totalCredit,
          openingBalance: coaOpeningBal,
          balance: coaOpeningBal + totalDebit - totalCredit,
        };
      }
    }

    res.json({
      ...result.party,
      ledgerAccountName: result.ledgerAccountName,
      ledgerAccountNumber: result.ledgerAccountNumber,
      balance,
    });
  } catch (error: any) {
    console.error('Get party error:', error);
    res.status(500).json({ message: error.message || 'Failed to get party' });
  }
});

router.get('/:id/crm-profile', requirePermission('crm:customer:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid party ID' });

    const [party] = await db.select().from(parties)
      .where(and(eq(parties.id, id), eq(parties.tenantId, tenantId)));
    if (!party) return res.status(404).json({ message: 'Party not found' });
    if (!party.customerId) return res.json({ linked: false, customer: null });

    const [customer] = await db.select().from(customers)
      .where(and(eq(customers.id, party.customerId), eq(customers.tenantId, tenantId)));
    if (!customer) return res.json({ linked: false, customer: null });

    res.json({
      linked: true,
      customer: {
        id: customer.id,
        customerId: customer.customerId,
        customerName: customer.customerName,
        email: customer.email,
        phone: customer.phone,
        country: customer.country,
        industrySegment: customer.industrySegment,
        paymentTerms: customer.paymentTerms,
        complianceLevel: customer.complianceLevel,
        sustainabilityRating: customer.sustainabilityRating,
        isActive: customer.isActive,
      },
    });
  } catch (error: any) {
    console.error('Get CRM profile error:', error);
    res.status(500).json({ message: error.message || 'Failed to get CRM profile' });
  }
});

router.post('/', requirePermission('crm:customer:create'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const { name, partyType, ledgerAccountId, customerId, contactPerson, email, phone,
      address, city, country, creditPeriodDays, creditLimit, defaultPaymentTerms,
      groupLabel, taxId, bankName, bankAccountNumber, bankBranch, bankRoutingNumber,
      notes } = req.body;

    if (!name || !partyType) {
      return res.status(400).json({ message: 'Name and partyType are required' });
    }

    if (!['customer', 'vendor', 'both'].includes(partyType)) {
      return res.status(400).json({ message: 'partyType must be customer, vendor, or both' });
    }

    let finalLedgerAccountId = ledgerAccountId || null;
    if (!ledgerAccountId) {
      const coaType = partyType === 'customer' ? 'customer' : 'vendor';
      finalLedgerAccountId = await createLedgerAccount(tenantId, name, coaType);
    }

    let finalCustomerId = customerId || null;
    if (!customerId && (partyType === 'customer' || partyType === 'both')) {
      finalCustomerId = await autoCreateCustomer(tenantId, name, req.body);
    }

    if (partyType === 'vendor' || partyType === 'both') {
      await autoCreateVendor(tenantId, name, req.body);
    }

    const partyCode = await generatePartyCode(tenantId, partyType);

    const [newParty] = await db.insert(parties).values({
      partyCode,
      name,
      partyType,
      ledgerAccountId: finalLedgerAccountId,
      customerId: finalCustomerId,
      contactPerson: contactPerson || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      city: city || null,
      country: country || null,
      creditPeriodDays: creditPeriodDays || 0,
      creditLimit: creditLimit ? String(creditLimit) : "0",
      defaultPaymentTerms: defaultPaymentTerms || null,
      groupLabel: groupLabel || null,
      taxId: taxId || null,
      bankName: bankName || null,
      bankAccountNumber: bankAccountNumber || null,
      bankBranch: bankBranch || null,
      bankRoutingNumber: bankRoutingNumber || null,
      notes: notes || null,
      tenantId,
      createdBy: userId,
      isActive: true,
    }).returning();

    if ((partyType === 'customer' || partyType === 'both') && !customerId) {
      await upsertCustomerFromParty(tenantId, newParty);
    }
    if ((partyType === 'vendor' || partyType === 'both')) {
      await upsertVendorFromParty(tenantId, newParty);
    }

    res.status(201).json(newParty);
  } catch (error: any) {
    console.error('Create party error:', error);
    res.status(500).json({ message: error.message || 'Failed to create party' });
  }
});

router.put('/:id', requirePermission('crm:customer:edit'), requireLock('party'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid party ID' });

    const [existing] = await db.select().from(parties)
      .where(and(eq(parties.id, id), eq(parties.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Party not found' });

    const { name, partyType, ledgerAccountId, customerId, contactPerson, email, phone,
      address, city, country, creditPeriodDays, creditLimit, defaultPaymentTerms,
      groupLabel, taxId, bankName, bankAccountNumber, bankBranch, bankRoutingNumber,
      notes, isActive } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (partyType !== undefined) updateData.partyType = partyType;
    if (ledgerAccountId !== undefined) updateData.ledgerAccountId = ledgerAccountId;
    if (customerId !== undefined) updateData.customerId = customerId;
    if (contactPerson !== undefined) updateData.contactPerson = contactPerson;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (country !== undefined) updateData.country = country;
    if (creditPeriodDays !== undefined) updateData.creditPeriodDays = creditPeriodDays;
    if (creditLimit !== undefined) updateData.creditLimit = String(creditLimit);
    if (defaultPaymentTerms !== undefined) updateData.defaultPaymentTerms = defaultPaymentTerms;
    if (groupLabel !== undefined) updateData.groupLabel = groupLabel;
    if (taxId !== undefined) updateData.taxId = taxId;
    if (bankName !== undefined) updateData.bankName = bankName;
    if (bankAccountNumber !== undefined) updateData.bankAccountNumber = bankAccountNumber;
    if (bankBranch !== undefined) updateData.bankBranch = bankBranch;
    if (bankRoutingNumber !== undefined) updateData.bankRoutingNumber = bankRoutingNumber;
    if (notes !== undefined) updateData.notes = notes;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db.update(parties)
      .set(updateData)
      .where(and(eq(parties.id, id), eq(parties.tenantId, tenantId)))
      .returning();

    const effectiveType = updated.partyType || existing.partyType;
    if (effectiveType === 'customer' || effectiveType === 'both') {
      await upsertCustomerFromParty(tenantId, updated);
    }
    if (effectiveType === 'vendor' || effectiveType === 'both') {
      await upsertVendorFromParty(tenantId, updated);
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Update party error:', error);
    res.status(500).json({ message: error.message || 'Failed to update party' });
  }
});

router.delete('/:id', requirePermission('crm:customer:delete'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid party ID' });

    const [updated] = await db.update(parties)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(parties.id, id), eq(parties.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Party not found' });

    res.json({ message: 'Party deactivated', party: updated });
  } catch (error: any) {
    console.error('Delete party error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete party' });
  }
});

router.get('/:id/ledger', requirePermission('crm:customer:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid party ID' });

    const [party] = await db.select().from(parties)
      .where(and(eq(parties.id, id), eq(parties.tenantId, tenantId)));
    if (!party) return res.status(404).json({ message: 'Party not found' });
    if (!party.ledgerAccountId) return res.json({ transactions: [], message: 'No ledger account linked' });

    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    let dateFilter = '';
    const params: any[] = [party.ledgerAccountId, tenantId];
    if (startDate) {
      dateFilter += ` AND v.voucher_date >= '${startDate}'`;
    }
    if (endDate) {
      dateFilter += ` AND v.voucher_date <= '${endDate}'`;
    }

    const result = await db.execute(sql`
      SELECT 
        vi.id, vi.voucher_id, vi.account_id,
        vi.debit_amount, vi.credit_amount, vi.description,
        v.voucher_number, v.voucher_date, v.description as voucher_description,
        v.is_posted
      FROM voucher_items vi
      JOIN vouchers v ON vi.voucher_id = v.id
      WHERE vi.account_id = ${party.ledgerAccountId}
        AND vi.tenant_id = ${tenantId}
        AND v.is_cancelled = false
      ORDER BY v.voucher_date DESC, v.id DESC
      LIMIT 100
    `);

    res.json({ transactions: result.rows });
  } catch (error: any) {
    console.error('Get party ledger error:', error);
    res.status(500).json({ message: error.message || 'Failed to get party ledger' });
  }
});

router.get('/:id/balance', requirePermission('crm:customer:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid party ID' });

    const [party] = await db.select().from(parties)
      .where(and(eq(parties.id, id), eq(parties.tenantId, tenantId)));
    if (!party) return res.status(404).json({ message: 'Party not found' });
    if (!party.ledgerAccountId) return res.json({ balance: 0, totalDebit: 0, totalCredit: 0, openingBalance: 0 });

    const result = await db.execute(sql`
      SELECT 
        COALESCE(SUM(CAST(vi.debit_amount AS numeric)), 0) as total_debit,
        COALESCE(SUM(CAST(vi.credit_amount AS numeric)), 0) as total_credit
      FROM voucher_items vi
      JOIN vouchers v ON vi.voucher_id = v.id
      WHERE vi.account_id = ${party.ledgerAccountId}
        AND vi.tenant_id = ${tenantId}
        AND v.is_cancelled = false
    `);

    const [coaRow] = await db.select({ openingBalance: chartOfAccounts.openingBalance })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, party.ledgerAccountId), eq(chartOfAccounts.tenantId, tenantId)));
    const coaOpeningBal = parseFloat(coaRow?.openingBalance || '0');

    const row = result.rows[0] as any;
    const totalDebit = parseFloat(row?.total_debit) || 0;
    const totalCredit = parseFloat(row?.total_credit) || 0;
    res.json({
      totalDebit,
      totalCredit,
      openingBalance: coaOpeningBal,
      balance: coaOpeningBal + totalDebit - totalCredit,
    });
  } catch (error: any) {
    console.error('Get party balance error:', error);
    res.status(500).json({ message: error.message || 'Failed to get party balance' });
  }
});

router.post('/sync-all', requirePermission('crm:customer:create'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const result = await syncExistingRecords(tenantId, userId);

    const unlinkedParties = await db.select().from(parties)
      .where(and(eq(parties.tenantId, tenantId), isNull(parties.ledgerAccountId)));

    let coaAccountsCreated = 0;
    const linkedParties: string[] = [];
    for (const party of unlinkedParties) {
      const coaType = party.partyType === 'customer' ? 'customer' : 'vendor';
      const ledgerAccountId = await createLedgerAccount(tenantId, party.name, coaType);
      coaAccountsCreated++;

      await db.update(parties)
        .set({ ledgerAccountId, updatedAt: new Date() })
        .where(eq(parties.id, party.id));

      linkedParties.push(party.name);
    }

    res.json({
      message: `Sync complete. Created ${result.customersToParties} customer parties, ${result.vendorsToParties} vendor parties, linked ${linkedParties.length} existing parties to COA. ${coaAccountsCreated} COA accounts created.`,
      summary: {
        ...result,
        partiesLinkedToCoa: linkedParties.length,
        coaAccountsCreated,
        details: {
          ...result.details,
          linkedParties,
        },
      },
    });
  } catch (error: any) {
    console.error('Sync all parties error:', error);
    res.status(500).json({ message: error.message || 'Failed to sync parties' });
  }
});

router.post('/migrate-from-coa', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const creditorGroups = await db.select().from(accountGroups)
      .where(and(
        eq(accountGroups.tenantId, tenantId),
        ilike(accountGroups.name, '%sundry creditor%')
      ));

    const debtorGroups = await db.select().from(accountGroups)
      .where(and(
        eq(accountGroups.tenantId, tenantId),
        ilike(accountGroups.name, '%sundry debtor%')
      ));

    const allGroups = [
      ...creditorGroups.map(g => ({ ...g, partyType: 'vendor' as const })),
      ...debtorGroups.map(g => ({ ...g, partyType: 'customer' as const })),
    ];

    if (allGroups.length === 0) {
      return res.json({ message: 'No Sundry Creditor/Debtor groups found', created: 0 });
    }

    const groupIds = allGroups.map(g => g.id);

    const accounts = await db.select().from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.tenantId, tenantId),
        sql`${chartOfAccounts.groupId} = ANY(${groupIds})`
      ));

    const existingParties = await db.select({ ledgerAccountId: parties.ledgerAccountId })
      .from(parties)
      .where(eq(parties.tenantId, tenantId));
    const existingAccountIds = new Set(existingParties.map(p => p.ledgerAccountId).filter(Boolean));

    let created = 0;
    const createdParties: any[] = [];

    for (const account of accounts) {
      if (existingAccountIds.has(account.id)) continue;

      const group = allGroups.find(g => g.id === account.groupId);
      if (!group) continue;

      const groupName = group.name || '';
      let groupLabel = 'Supplier';
      const lowerName = groupName.toLowerCase();
      if (lowerName.includes('dyeing')) groupLabel = 'Dyeing';
      else if (lowerName.includes('knitting')) groupLabel = 'Knitting';
      else if (lowerName.includes('washing')) groupLabel = 'Washing';
      else if (lowerName.includes('printing')) groupLabel = 'Printing';
      else if (lowerName.includes('embroidery')) groupLabel = 'Embroidery';
      else if (lowerName.includes('accessories')) groupLabel = 'Accessories';
      else if (lowerName.includes('fabric')) groupLabel = 'Fabric';
      else if (lowerName.includes('transport')) groupLabel = 'Transport';
      else if (lowerName.includes('debtor')) groupLabel = 'Customer';

      const partyCode = await generatePartyCode(tenantId, group.partyType);

      const [newParty] = await db.insert(parties).values({
        partyCode,
        name: account.name,
        partyType: group.partyType,
        ledgerAccountId: account.id,
        groupLabel,
        tenantId,
        createdBy: userId,
        isActive: true,
      }).returning();

      createdParties.push(newParty);
      created++;
    }

    res.json({
      message: `Migration complete. Created ${created} party records.`,
      created,
      parties: createdParties,
    });
  } catch (error: any) {
    console.error('Migrate parties from COA error:', error);
    res.status(500).json({ message: error.message || 'Failed to migrate parties from COA' });
  }
});

export default router;