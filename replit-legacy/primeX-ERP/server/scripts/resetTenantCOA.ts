import { importCOAFromExcel } from '../services/coaImporter';

async function main() {
  const args = process.argv.slice(2);
  const argMap: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.substring(2).split('=');
      argMap[key] = valueParts.join('=') || 'true';
    }
  }

  const tenantId = parseInt(argMap['tenant'] || '0');
  const filePath = argMap['file'] || '';
  const cutoverDate = argMap['cutover'] || '2026-02-15';
  const dryRun = !argMap['commit'];

  if (!tenantId || !filePath) {
    console.log(`
Usage:
  npx tsx server/scripts/resetTenantCOA.ts --tenant=<tenant_id> --file="<path_to_xlsx>" --cutover="2026-02-15" [--commit]

Options:
  --tenant    Tenant ID (required)
  --file      Path to Excel file (required)
  --cutover   Cutover date for opening balances (default: 2026-02-15)
  --commit    If provided, commits changes. Otherwise runs in dry-run mode.

Examples:
  npx tsx server/scripts/resetTenantCOA.ts --tenant=1 --file="./data/COA.xlsx"
  npx tsx server/scripts/resetTenantCOA.ts --tenant=1 --file="./data/COA.xlsx" --cutover="2026-02-15" --commit
`);
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`COA Reset & Import Tool`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Tenant ID:    ${tenantId}`);
  console.log(`File:         ${filePath}`);
  console.log(`Cutover Date: ${cutoverDate}`);
  console.log(`Mode:         ${dryRun ? 'DRY RUN (no changes)' : 'COMMIT (will modify database)'}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    const result = await importCOAFromExcel(tenantId, filePath, cutoverDate, dryRun);

    if (result.nameCorrections.length > 0) {
      console.log(`\nName Corrections (${result.nameCorrections.length}):`);
      console.log('-'.repeat(60));
      for (const c of result.nameCorrections) {
        console.log(`  [${c.type}] "${c.original}" -> "${c.normalized}"`);
      }
    }

    if (result.totals) {
      console.log(`\nTotals:`);
      console.log(`  Total Dr: ${result.totals.totalDr.toFixed(2)}`);
      console.log(`  Total Cr: ${result.totals.totalCr.toFixed(2)}`);
      console.log(`  Difference: ${result.totals.difference.toFixed(2)}`);
    }

    if (result.groupMismatches.length > 0) {
      console.log(`\nGroup Mismatches (${result.groupMismatches.length}):`);
      console.log('-'.repeat(80));
      for (const m of result.groupMismatches) {
        console.log(`  ${m.topGroup} > ${m.subGroup}`);
        console.log(`    Expected: Dr=${m.expected.dr.toFixed(2)}, Cr=${m.expected.cr.toFixed(2)}`);
        console.log(`    Actual:   Dr=${m.actual.dr.toFixed(2)}, Cr=${m.actual.cr.toFixed(2)}`);
        console.log(`    Diff:     Dr=${m.diff.dr.toFixed(2)}, Cr=${m.diff.cr.toFixed(2)}`);
      }
    }

    if (result.validationErrors.length > 0) {
      console.log(`\nValidation Errors (${result.validationErrors.length}):`);
      console.log('-'.repeat(60));
      for (const err of result.validationErrors) {
        console.log(`  ERROR: ${err}`);
      }
    }

    if (result.deleted) {
      console.log(`\n${dryRun ? 'Would Delete' : 'Deleted'}:`);
      console.log(`  Groups: ${result.deleted.groups}`);
      console.log(`  Ledgers: ${result.deleted.ledgers}`);
      console.log(`  Opening Balances: ${result.deleted.openingBalances}`);
    }

    if (result.created) {
      console.log(`\n${dryRun ? 'Would Create' : 'Created'}:`);
      console.log(`  Groups: ${result.created.groups}`);
      console.log(`  Ledgers: ${result.created.ledgers}`);
      console.log(`  Opening Balances Set: ${result.created.openingBalancesSet}`);
    }

    if (result.backup) {
      console.log(`\nBackup saved to: ${result.backup.path}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(result.summary);
    console.log(`${'='.repeat(60)}\n`);

    process.exit(result.success ? 0 : 1);
  } catch (error: any) {
    console.error(`\nFATAL ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
