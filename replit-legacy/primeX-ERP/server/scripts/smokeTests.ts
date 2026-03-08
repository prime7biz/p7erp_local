const BASE = 'http://localhost:5000';

async function fetchRaw(url: string, options?: any) {
  const resp = await fetch(BASE + url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    redirect: 'manual',
  });
  const cookies = resp.headers.getSetCookie?.() || [];
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, data, cookies };
}

function extractTokenFromCookies(cookies: string[]): string | null {
  for (const c of cookies) {
    const m = c.match(/token=([^;]+)/);
    if (m) return m[1];
  }
  return null;
}

async function authFetch(url: string, token: string, options?: any) {
  return fetchRaw(url, {
    ...options,
    headers: { 'Cookie': `token=${token}`, ...(options?.headers || {}) },
  });
}

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
    if (details) console.log(`     Details:`, typeof details === 'string' ? details : JSON.stringify(details));
  }
}

async function main() {
  console.log('\n=== ERP Smoke Test Suite ===\n');
  
  // =====================
  // 1. HEALTH CHECK
  // =====================
  console.log('--- 1. Health Check ---');
  const health = await fetchRaw('/api/health');
  assert(health.status === 200 && health.data.status === 'ok', 'GET /api/health returns 200 ok');
  assert(typeof health.data.uptime === 'number', 'Health includes uptime');
  
  // =====================
  // 2. AUTH FLOW
  // =====================
  console.log('\n--- 2. Auth Flow ---');
  const login = await fetchRaw('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'urmi', password: 'lakhsma123', companyCode: 'LAKHS4821' }),
  });
  const token = extractTokenFromCookies(login.cookies);
  assert(login.status === 200 && !!token, 'Login returns token cookie');
  
  if (!token) {
    console.log('\n⚠️  Cannot continue without auth token. Aborting.');
    console.log('     Login response:', JSON.stringify(login.data));
    process.exit(1);
  }
  
  const me = await authFetch('/api/auth/me', token);
  assert(me.status === 200 && me.data.id, 'GET /api/auth/me returns user');
  
  // =====================
  // 3. TENANT ISOLATION
  // =====================
  console.log('\n--- 3. Tenant Isolation ---');
  const noAuth = await fetchRaw('/api/dashboard/kpi');
  assert(noAuth.status === 401 || noAuth.status === 403, 'No-auth request rejected');
  
  // =====================
  // 4. CONFIG ENDPOINTS
  // =====================
  console.log('\n--- 4. Config Endpoints ---');
  const settings = await authFetch('/api/settings/tenant', token);
  assert(settings.status === 200, 'GET /api/settings/tenant returns 200', { status: settings.status });
  
  const numSeries = await authFetch('/api/settings/number-series', token);
  assert(numSeries.status === 200, 'GET /api/settings/number-series returns 200', { status: numSeries.status });
  
  const readiness = await authFetch('/api/settings/health', token);
  assert(readiness.status === 200, 'GET /api/settings/health returns readiness', { status: readiness.status });
  
  // =====================
  // 5. PAYROLL ENDPOINTS
  // =====================
  console.log('\n--- 5. Payroll Endpoints ---');
  const payrollRuns = await authFetch('/api/payroll/runs', token);
  assert(payrollRuns.status === 200, 'GET /api/payroll/runs returns 200', { status: payrollRuns.status });
  
  const advances = await authFetch('/api/payroll/advances', token);
  assert(advances.status === 200, 'GET /api/payroll/advances returns 200', { status: advances.status });
  
  const salStructures = await authFetch('/api/payroll/salary-structures', token);
  assert(salStructures.status === 200, 'GET /api/payroll/salary-structures returns 200', { status: salStructures.status });
  
  // =====================
  // 6. PURCHASE ENDPOINTS
  // =====================
  console.log('\n--- 6. Purchase Endpoints ---');
  const bills = await authFetch('/api/purchase/bills', token);
  assert(bills.status === 200, 'GET /api/purchase/bills returns 200', { status: bills.status });
  
  const payments = await authFetch('/api/purchase/payments', token);
  assert(payments.status === 200, 'GET /api/purchase/payments returns 200', { status: payments.status });
  
  const apAging = await authFetch('/api/purchase/reports/ap-aging?asOf=2026-02-21', token);
  assert(apAging.status === 200, 'GET /api/purchase/reports/ap-aging returns 200', { status: apAging.status });
  
  // =====================
  // 7. EXISTING ENDPOINTS STILL WORK
  // =====================
  console.log('\n--- 7. Existing Endpoints ---');
  const kpi = await authFetch('/api/dashboard/kpi', token);
  assert(kpi.status === 200, 'GET /api/dashboard/kpi returns 200', { status: kpi.status });
  
  const customers = await authFetch('/api/customers', token);
  assert(customers.status === 200, 'GET /api/customers returns 200', { status: customers.status });
  
  const hrEmployees = await authFetch('/api/hr/employees', token);
  assert(hrEmployees.status === 200, 'GET /api/hr/employees returns 200', { status: hrEmployees.status });
  
  // =====================
  // SUMMARY
  // =====================
  console.log(`\n=== Smoke Tests Complete ===`);
  console.log(`  Passed: ${passed}/${testNum}`);
  console.log(`  Failed: ${failed}/${testNum}`);
  
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed.');
    process.exit(1);
  } else {
    console.log('\n✅ All smoke tests passed!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Smoke tests crashed:', err);
  process.exit(1);
});
