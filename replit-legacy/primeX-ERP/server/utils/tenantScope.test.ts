import { requireTenant, withTenantFilter, assertTenantWrite, TenantScopeError } from "./tenantScope";

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      passed++;
      console.log(`  PASS: ${name}`);
    } else {
      failed++;
      console.log(`  FAIL: ${name}`);
    }
  }

  console.log("\n=== Tenant Scope Unit Tests ===\n");

  console.log("[requireTenant]");
  try {
    requireTenant({ tenantId: undefined } as any);
    assert(false, "should throw when tenantId missing");
  } catch (e) {
    assert(e instanceof TenantScopeError, "throws TenantScopeError when tenantId missing");
  }

  try {
    const id = requireTenant({ tenantId: 5 } as any);
    assert(id === 5, "returns tenantId from req.tenantId");
  } catch {
    assert(false, "returns tenantId from req.tenantId");
  }

  try {
    const id = requireTenant({ user: { tenantId: 7 } } as any);
    assert(id === 7, "falls back to req.user.tenantId");
  } catch {
    assert(false, "falls back to req.user.tenantId");
  }

  try {
    requireTenant({ tenantId: "abc" } as any);
    assert(false, "should throw for non-number tenantId");
  } catch (e) {
    assert(e instanceof TenantScopeError, "throws for non-number tenantId");
  }

  console.log("\n[assertTenantWrite]");
  const payload1 = assertTenantWrite({ name: "Test", tenantId: 999 }, 1);
  assert(payload1.tenantId === 1, "overrides client-provided tenantId");
  assert(payload1.name === "Test", "preserves other fields");

  const payload2 = assertTenantWrite({ name: "NoTenant" }, 3);
  assert(payload2.tenantId === 3, "sets tenantId when not present");

  console.log("\n[withTenantFilter]");
  const filter = withTenantFilter({ name: "tenantId" } as any, 1);
  assert(filter !== undefined, "returns a SQL condition");

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
