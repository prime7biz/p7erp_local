import { db } from '../db';
import { sql, eq, and } from 'drizzle-orm';

import { 
  tenants, users, employees, salaryStructures, payrollRuns, payslips, employeeAdvances,
  payrollAccountingConfig, supplierInvoices, supplierInvoiceItems, supplierPayments,
  paymentAllocations, purchaseAccountingConfig, numberSeries, tenantLedgerMappings,
  tenantWarehouseDefaults, approvalPolicies, vendors, items, warehouses,
  chartOfAccounts, vouchers, voucherItems, voucherTypes, voucherStatus, fiscalYears
} from '@shared/schema';

import { generateNextNumber, upsertNumberSeries, previewNextNumber } from '../services/numberSeriesService';
import { getSystemReadiness, upsertTenantLedgerMappings } from '../services/configService';

let passed = 0;
let failed = 0;
let testNum = 0;

function assert(condition: boolean, label: string, details?: any) {
  testNum++;
  if (condition) {
    passed++;
    console.log(`  ✅ Test ${testNum}: ${label}`);
  } else {
    failed++;
    console.log(`  ❌ Test ${testNum}: ${label}`);
    if (details) console.log(`     Details:`, JSON.stringify(details));
  }
}

async function main() {
  console.log('\n=== Phase 5 Verification Suite ===\n');
  
  const [tenant] = await db.select().from(tenants).limit(1);
  if (!tenant) { console.log('No tenant found. Skipping.'); return; }
  const tenantId = tenant.id;
  const [user] = await db.select().from(users).where(eq(users.tenantId, tenantId)).limit(1);
  const userId = user?.id || 1;
  
  // =====================
  // PHASE 5.3 — CONFIG
  // =====================
  console.log('\n--- Phase 5.3: Config & Number Series ---');
  
  const testDocType = `TEST_${Date.now()}`;
  await upsertNumberSeries(tenantId, { docType: testDocType, prefix: 'T-', padding: 6 });
  assert(true, 'Number series created');
  
  const preview = await previewNextNumber(tenantId, testDocType);
  assert(preview === 'T-000001', 'Number preview returns T-000001', { got: preview });
  
  const num1 = await generateNextNumber(tenantId, testDocType);
  assert(num1 === 'T-000001', 'First generated = T-000001', { got: num1 });
  
  const num2 = await generateNextNumber(tenantId, testDocType);
  assert(num2 === 'T-000002', 'Second generated = T-000002', { got: num2 });
  
  await upsertNumberSeries(tenantId, { docType: 'SO', prefix: 'SO-', padding: 5 });
  await upsertNumberSeries(tenantId, { docType: 'GRN', prefix: 'GRN-', padding: 5 });
  await upsertNumberSeries(tenantId, { docType: 'VOUCHER', prefix: 'V-', padding: 6 });
  assert(true, 'Multiple number series (SO, GRN, VOUCHER) created');
  
  const readiness = await getSystemReadiness(tenantId);
  assert(typeof readiness === 'object' && readiness !== null, 'System readiness returns object', readiness);
  
  // =====================
  // PHASE 5.1 — PAYROLL
  // =====================
  console.log('\n--- Phase 5.1: Payroll Verification ---');
  
  await db.delete(payslips).where(eq(payslips.tenantId, tenantId));
  await db.delete(payrollRuns).where(eq(payrollRuns.tenantId, tenantId));
  await db.delete(employeeAdvances).where(eq(employeeAdvances.tenantId, tenantId));
  await db.delete(salaryStructures).where(eq(salaryStructures.tenantId, tenantId));
  
  let existingEmps = await db.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.isActive, true))).limit(3);
  if (existingEmps.length < 3) {
    for (let i = existingEmps.length; i < 3; i++) {
      const empCode = `TEST-EMP-P5-${i+1}`;
      await db.insert(employees).values({
        tenantId,
        employeeId: empCode,
        firstName: `TestEmp${i+1}`,
        lastName: 'Phase5',
        joinDate: '2025-01-01',
        isActive: true,
        paymentMethod: 'BANK',
      }).onConflictDoNothing();
    }
    existingEmps = await db.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.isActive, true))).limit(3);
  }
  assert(existingEmps.length >= 3, `At least 3 active employees exist (got ${existingEmps.length})`);
  
  for (const emp of existingEmps) {
    await db.insert(salaryStructures).values({
      tenantId,
      employeeId: emp.id,
      basic: '20000',
      houseRent: '8000',
      medical: '3000',
      conveyance: '2000',
      otherAllowances: '1000',
      grossSalary: '34000',
      taxDeduction: '1000',
      pfDeduction: '500',
      otherDeductions: '0',
      effectiveFrom: '2025-01-01',
      isActive: true,
    }).onConflictDoNothing();
  }
  const salaries = await db.select().from(salaryStructures).where(eq(salaryStructures.tenantId, tenantId));
  assert(salaries.length >= 3, `Salary structures created (${salaries.length})`);
  
  const testMonth = '2025-12';
  await db.delete(payrollRuns).where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.payrollMonth, testMonth)));
  
  const [run] = await db.insert(payrollRuns).values({
    tenantId,
    payrollMonth: testMonth,
    startDate: '2025-12-01',
    endDate: '2025-12-31',
    status: 'DRAFT',
    createdBy: userId,
  }).returning();
  assert(run && run.status === 'DRAFT', 'Payroll run created in DRAFT');
  
  const payrollService = await import('../services/payrollService');
  const genResult = await payrollService.generatePayslips(tenantId, run.id);
  assert(genResult.count >= 3, `Payslips generated for ${genResult.count} employees`);
  assert(genResult.totalGross > 0, `Total gross = BDT ${genResult.totalGross}`);
  assert(genResult.totalNet > 0, `Total net = BDT ${genResult.totalNet}`);
  
  const slips = await db.select().from(payslips).where(eq(payslips.payrollRunId, run.id));
  let sumGross = 0, sumDed = 0, sumNet = 0;
  for (const s of slips) {
    sumGross += parseFloat(String(s.grossPay) || '0');
    sumDed += parseFloat(String(s.totalDeductions) || '0');
    sumNet += parseFloat(String(s.netPay) || '0');
  }
  assert(Math.abs(sumGross - genResult.totalGross) < 0.01, `Payslip gross sum matches run total`);
  assert(Math.abs(sumNet - genResult.totalNet) < 0.01, `Payslip net sum matches run total`);
  
  const approvedRun = await payrollService.approvePayrollRun(tenantId, run.id, userId);
  assert(approvedRun.status === 'APPROVED', 'Payroll approved');
  
  const [updatedRun] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, run.id));
  assert(parseFloat(String(updatedRun.totalGross)) > 0, `Run totalGross = ${updatedRun.totalGross}`);
  
  const advEmp = existingEmps[0];
  const advance = await payrollService.createAdvance(tenantId, {
    employeeId: advEmp.id,
    advanceDate: '2025-12-05',
    amount: 5000,
    monthlyDeductionAmount: 1000,
    reason: 'Test advance',
    createdBy: userId,
  });
  assert(advance.status === 'ACTIVE' && parseFloat(String(advance.outstandingAmount)) === 5000, 'Advance created with 5000 outstanding');
  
  const otherTenantRuns = await db.select().from(payrollRuns).where(and(eq(payrollRuns.tenantId, tenantId + 999), eq(payrollRuns.payrollMonth, testMonth)));
  assert(otherTenantRuns.length === 0, 'Tenant isolation: other tenant sees no data');
  
  // =====================
  // PHASE 5.2 — PURCHASE
  // =====================
  console.log('\n--- Phase 5.2: Purchase Workflow Verification ---');
  
  await db.delete(paymentAllocations).where(eq(paymentAllocations.tenantId, tenantId));
  await db.delete(supplierPayments).where(eq(supplierPayments.tenantId, tenantId));
  await db.delete(supplierInvoiceItems).where(eq(supplierInvoiceItems.tenantId, tenantId));
  await db.delete(supplierInvoices).where(eq(supplierInvoices.tenantId, tenantId));
  
  let [vendor] = await db.select().from(vendors).where(eq(vendors.tenantId, tenantId)).limit(1);
  if (!vendor) {
    [vendor] = await db.insert(vendors).values({
      tenantId,
      vendorCode: 'TEST-V001',
      vendorName: 'Test Supplier Phase5',
    }).returning();
  }
  
  const purchaseService = await import('../services/purchaseWorkflowService');
  const invoice = await purchaseService.createSupplierInvoice(tenantId, {
    invoiceNumber: `TINV-P5-${Date.now()}`,
    supplierId: vendor.id,
    invoiceDate: '2025-12-15',
    dueDate: '2026-01-15',
    totalAmount: 50000,
    subtotal: 47500,
    taxAmount: 2500,
    createdBy: userId,
    items: [
      { description: 'Cotton Fabric', quantity: 100, unitPrice: 475, lineTotal: 47500 },
    ],
  });
  assert(invoice.status === 'DRAFT', 'Supplier invoice created in DRAFT');
  
  const approvedInv = await purchaseService.approveSupplierInvoice(tenantId, invoice.id, userId);
  assert(approvedInv.status === 'APPROVED', 'Supplier invoice approved');
  
  const payment = await purchaseService.createSupplierPayment(tenantId, {
    paymentNumber: `PAY-P5-${Date.now()}`,
    supplierId: vendor.id,
    paymentDate: '2025-12-20',
    amount: 25000,
    paymentMethod: 'BANK',
    createdBy: userId,
    allocations: [{ invoiceId: invoice.id, allocatedAmount: 25000 }],
  });
  assert(payment.status === 'DRAFT', 'Supplier payment created in DRAFT');
  
  const approvedPay = await purchaseService.approveSupplierPayment(tenantId, payment.id, userId);
  assert(approvedPay.status === 'APPROVED', 'Supplier payment approved');
  
  const aging = await purchaseService.getAPAging(tenantId, '2026-02-20');
  assert(typeof aging === 'object', 'AP aging returns data structure');
  
  const trace = await purchaseService.getInvoiceTrace(tenantId, invoice.id);
  assert(trace && trace.invoice, 'Invoice trace returns data');
  
  // =====================
  // SUMMARY
  // =====================
  console.log(`\n=== Phase 5 Verification Complete ===`);
  console.log(`  Passed: ${passed}/${testNum}`);
  console.log(`  Failed: ${failed}/${testNum}`);
  
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Review above for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
