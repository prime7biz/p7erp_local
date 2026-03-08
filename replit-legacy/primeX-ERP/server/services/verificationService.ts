import crypto from 'crypto';
import { db } from '../db';
import { vouchers, enhancedGatePasses, deliveryChallans, tenants, tenantSettings } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';

export function generateVerificationCode(type: 'VCH' | 'GP' | 'DC', id: number): string {
  const random = crypto.randomBytes(4).toString('hex');
  return `${type}-${id}-${random}`;
}

export async function assignVerificationCode(
  documentType: 'voucher' | 'gate_pass' | 'delivery_challan',
  documentId: number
): Promise<string> {
  const typePrefix = documentType === 'voucher' ? 'VCH' : documentType === 'gate_pass' ? 'GP' : 'DC';
  const code = generateVerificationCode(typePrefix, documentId);

  if (documentType === 'voucher') {
    await db.update(vouchers).set({ verificationCode: code }).where(eq(vouchers.id, documentId));
  } else if (documentType === 'gate_pass') {
    await db.update(enhancedGatePasses).set({ verificationCode: code }).where(eq(enhancedGatePasses.id, documentId));
  } else {
    await db.update(deliveryChallans).set({ verificationCode: code }).where(eq(deliveryChallans.id, documentId));
  }

  return code;
}

function formatAmount(value: string | number | null | undefined, currency: string = 'BDT'): string {
  if (value == null) return `${currency} 0.00`;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return `${currency} 0.00`;
  return `${currency} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resolveStatus(isPosted: boolean | null, workflowStatus: string | null): string {
  if (isPosted) return 'Posted';
  if (workflowStatus && workflowStatus !== 'DRAFT') return workflowStatus;
  return 'DRAFT';
}

export async function getVerificationDetails(code: string): Promise<{
  valid: boolean;
  documentType?: string;
  documentNumber?: string;
  date?: string;
  amount?: string;
  status?: string;
  companyName?: string;
  additionalInfo?: Record<string, any>;
} | null> {
  const [voucher] = await db.select({
    id: vouchers.id,
    voucherNumber: vouchers.voucherNumber,
    voucherDate: vouchers.voucherDate,
    amount: vouchers.amount,
    isPosted: vouchers.isPosted,
    workflowStatus: vouchers.workflowStatus,
    tenantId: vouchers.tenantId,
    currencyCode: vouchers.currencyCode,
  }).from(vouchers).where(eq(vouchers.verificationCode, code)).limit(1);

  if (voucher) {
    const tenantInfo = await getTenantCompanyName(voucher.tenantId);
    return {
      valid: true,
      documentType: 'Voucher',
      documentNumber: voucher.voucherNumber,
      date: voucher.voucherDate,
      amount: formatAmount(voucher.amount, voucher.currencyCode || 'BDT'),
      status: resolveStatus(voucher.isPosted, voucher.workflowStatus),
      companyName: tenantInfo,
    };
  }

  const [gatePass] = await db.select({
    id: enhancedGatePasses.id,
    gatePassNumber: enhancedGatePasses.gatePassNumber,
    gatePassDate: enhancedGatePasses.gatePassDate,
    gatePassType: enhancedGatePasses.gatePassType,
    workflowStatus: enhancedGatePasses.workflowStatus,
    totalQuantity: enhancedGatePasses.totalQuantity,
    tenantId: enhancedGatePasses.tenantId,
  }).from(enhancedGatePasses).where(eq(enhancedGatePasses.verificationCode, code)).limit(1);

  if (gatePass) {
    const tenantInfo = await getTenantCompanyName(gatePass.tenantId);
    const gpStatus = gatePass.workflowStatus || 'DRAFT';
    return {
      valid: true,
      documentType: 'Gate Pass',
      documentNumber: gatePass.gatePassNumber,
      date: gatePass.gatePassDate,
      amount: gatePass.totalQuantity ? `${gatePass.totalQuantity} items` : undefined,
      status: gpStatus,
      companyName: tenantInfo,
      additionalInfo: { type: gatePass.gatePassType },
    };
  }

  const [challan] = await db.select({
    id: deliveryChallans.id,
    challanNumber: deliveryChallans.challanNumber,
    challanDate: deliveryChallans.challanDate,
    totalAmount: deliveryChallans.totalAmount,
    totalQuantity: deliveryChallans.totalQuantity,
    isPosted: deliveryChallans.isPosted,
    workflowStatus: deliveryChallans.workflowStatus,
    currency: deliveryChallans.currency,
    tenantId: deliveryChallans.tenantId,
  }).from(deliveryChallans).where(eq(deliveryChallans.verificationCode, code)).limit(1);

  if (challan) {
    const tenantInfo = await getTenantCompanyName(challan.tenantId);
    return {
      valid: true,
      documentType: 'Delivery Challan',
      documentNumber: challan.challanNumber,
      date: challan.challanDate,
      amount: challan.totalAmount ? formatAmount(challan.totalAmount, challan.currency || 'BDT') : `${challan.totalQuantity} items`,
      status: resolveStatus(challan.isPosted, challan.workflowStatus),
      companyName: tenantInfo,
    };
  }

  return null;
}

async function getTenantCompanyName(tenantId: number): Promise<string> {
  const [settings] = await db.select({
    companyName: tenantSettings.companyName,
  }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);

  if (settings?.companyName) return settings.companyName;

  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return tenant?.name || 'Unknown Company';
}

export async function backfillVerificationCodes(): Promise<{
  vouchers: number;
  gatePasses: number;
  challans: number;
}> {
  const uncodedVouchers = await db.select({ id: vouchers.id })
    .from(vouchers)
    .where(sql`${vouchers.verificationCode} IS NULL AND ${vouchers.isPosted} = true`);

  for (const v of uncodedVouchers) {
    await assignVerificationCode('voucher', v.id);
  }

  const uncodedGatePasses = await db.select({ id: enhancedGatePasses.id })
    .from(enhancedGatePasses)
    .where(sql`${enhancedGatePasses.verificationCode} IS NULL AND ${enhancedGatePasses.workflowStatus} IN ('APPROVED', 'COMPLETED')`);

  for (const gp of uncodedGatePasses) {
    await assignVerificationCode('gate_pass', gp.id);
  }

  const uncodedChallans = await db.select({ id: deliveryChallans.id })
    .from(deliveryChallans)
    .where(sql`${deliveryChallans.verificationCode} IS NULL AND ${deliveryChallans.isPosted} = true`);

  for (const dc of uncodedChallans) {
    await assignVerificationCode('delivery_challan', dc.id);
  }

  return {
    vouchers: uncodedVouchers.length,
    gatePasses: uncodedGatePasses.length,
    challans: uncodedChallans.length,
  };
}
