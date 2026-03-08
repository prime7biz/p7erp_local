import { db } from '../db';
import { documentStatuses, erpPermissions, roles, sodRules, workflowTransitions, rolePermissions } from '@shared/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';

const DEFAULT_STATUSES = [
  { code: 'DRAFT', name: 'Draft', color: '#6B7280', sequence: 1, isEditable: true, isDeletable: true, isTerminal: false },
  { code: 'SUBMITTED', name: 'Submitted', color: '#3B82F6', sequence: 2, isEditable: false, isDeletable: false, isTerminal: false },
  { code: 'CHECKED', name: 'Checked', color: '#8B5CF6', sequence: 3, isEditable: false, isDeletable: false, isTerminal: false },
  { code: 'RECOMMENDED', name: 'Recommended', color: '#EC4899', sequence: 4, isEditable: false, isDeletable: false, isTerminal: false },
  { code: 'APPROVED', name: 'Approved', color: '#10B981', sequence: 5, isEditable: false, isDeletable: false, isTerminal: false },
  { code: 'POSTED', name: 'Posted', color: '#059669', sequence: 6, isEditable: false, isDeletable: false, isTerminal: true },
  { code: 'CLOSED', name: 'Closed', color: '#1F2937', sequence: 7, isEditable: false, isDeletable: false, isTerminal: true },
  { code: 'REJECTED', name: 'Rejected', color: '#EF4444', sequence: 8, isEditable: false, isDeletable: false, isTerminal: true },
  { code: 'CANCELLED', name: 'Cancelled', color: '#9CA3AF', sequence: 9, isEditable: false, isDeletable: false, isTerminal: true },
  { code: 'AMENDED', name: 'Amended', color: '#F59E0B', sequence: 10, isEditable: false, isDeletable: false, isTerminal: true },
  { code: 'PARTIALLY_POSTED', name: 'Partially Posted', color: '#F97316', sequence: 11, isEditable: false, isDeletable: false, isTerminal: false },
];

const MODULE_DOC_TYPES: Record<string, string[]> = {
  sales: ['quotation', 'sales_order'],
  purchase: ['purchase_order', 'grn'],
  inventory: ['gin', 'stock_transfer'],
  accounts: ['voucher', 'journal', 'payment', 'receipt', 'contra', 'period'],
  hr: ['employee', 'payroll'],
  production: ['work_order', 'cutting', 'sewing'],
  system: ['settings', 'users', 'roles'],
  crm: ['customer', 'inquiry', 'sample'],
};

const DOC_TYPE_DISPLAY_NAMES: Record<string, string> = {
  quotation: 'Quotation',
  sales_order: 'Sales Order',
  purchase_order: 'Purchase Order',
  grn: 'Goods Received Note',
  gin: 'Goods Issue Note',
  stock_transfer: 'Stock Transfer',
  voucher: 'Voucher',
  journal: 'Journal',
  payment: 'Payment',
  receipt: 'Receipt',
  contra: 'Contra',
  period: 'Accounting Period',
  employee: 'Employee',
  payroll: 'Payroll',
  work_order: 'Work Order',
  cutting: 'Cutting',
  sewing: 'Sewing',
  settings: 'Settings',
  users: 'Users',
  roles: 'Roles',
  customer: 'Customer',
  inquiry: 'Inquiry',
  sample: 'Sample Development',
};

const ACTION_DISPLAY_NAMES: Record<string, string> = {
  create: 'Create',
  read: 'Read',
  edit: 'Edit',
  delete: 'Delete',
  submit: 'Submit',
  check: 'Check',
  recommend: 'Recommend',
  approve: 'Approve',
  post: 'Post',
  send_back: 'Send Back',
  reject: 'Reject',
  cancel: 'Cancel',
  amend: 'Amend',
  print: 'Print',
  export: 'Export',
  override_post: 'Override Post',
};

const ACTION_CATEGORIES: Record<string, string> = {
  create: 'document',
  read: 'document',
  edit: 'document',
  delete: 'document',
  submit: 'workflow',
  check: 'workflow',
  recommend: 'workflow',
  approve: 'workflow',
  post: 'workflow',
  send_back: 'control',
  reject: 'control',
  cancel: 'control',
  amend: 'control',
  print: 'report',
  export: 'report',
  override_post: 'workflow',
};

const REPORT_PERMISSIONS = [
  { key: 'accounts:trial_balance:read', module: 'accounts', docType: 'trial_balance', displayName: 'View Trial Balance' },
  { key: 'accounts:pl:read', module: 'accounts', docType: 'pl', displayName: 'View Profit & Loss' },
  { key: 'accounts:balance_sheet:read', module: 'accounts', docType: 'balance_sheet', displayName: 'View Balance Sheet' },
  { key: 'accounts:party_ledger:read', module: 'accounts', docType: 'party_ledger', displayName: 'View Party Ledger' },
  { key: 'accounts:voucher_register:read', module: 'accounts', docType: 'voucher_register', displayName: 'View Voucher Register' },
  { key: 'inventory:stock_valuation:read', module: 'inventory', docType: 'stock_valuation', displayName: 'View Stock Valuation' },
  { key: 'inventory:stock_summary:read', module: 'inventory', docType: 'stock_summary', displayName: 'View Stock Summary' },
  { key: 'purchase:register:read', module: 'purchase', docType: 'register', displayName: 'View Purchase Register' },
  { key: 'sales:register:read', module: 'sales', docType: 'register', displayName: 'View Sales Register' },
  { key: 'hr:payroll_report:read', module: 'hr', docType: 'payroll_report', displayName: 'View Payroll Report' },
];

const REPORT_PERMISSION_KEYS = new Set(REPORT_PERMISSIONS.map((rp) => rp.key));

const ACTIONS = Object.keys(ACTION_DISPLAY_NAMES);

const DEFAULT_ROLES = [
  { name: 'admin', displayName: 'Admin', description: 'All permissions', level: 1 },
  { name: 'director', displayName: 'Director', description: 'All except system settings', level: 2 },
  { name: 'general_manager', displayName: 'General Manager', description: 'Approve, recommend, check, view all', level: 3 },
  { name: 'manager', displayName: 'Manager', description: 'Approve within limits, recommend, check', level: 4 },
  { name: 'approver', displayName: 'Approver', description: 'Approve workflow actions', level: 5 },
  { name: 'recommender', displayName: 'Recommender', description: 'Recommend workflow actions', level: 6 },
  { name: 'officer', displayName: 'Officer / Checker', description: 'Check, submit, create, edit', level: 7 },
  { name: 'data_entry', displayName: 'Data Entry', description: 'Create, edit, read only', level: 8 },
  { name: 'accounts_poster', displayName: 'Accounts Poster', description: 'Post to ledger/stock', level: 7 },
  { name: 'auditor', displayName: 'Auditor', description: 'Read-only access to everything', level: 9 },
  { name: 'module_accounts', displayName: 'Accounts Module Access', description: 'Access to Accounts module', level: 10 },
  { name: 'module_inventory', displayName: 'Inventory Module Access', description: 'Access to Inventory module', level: 10 },
  { name: 'module_purchase', displayName: 'Purchase Module Access', description: 'Access to Purchase module', level: 10 },
  { name: 'module_sales', displayName: 'Sales Module Access', description: 'Access to Sales module', level: 10 },
  { name: 'module_commercial_lc', displayName: 'Commercial/LC Module Access', description: 'Access to Commercial/LC module', level: 10 },
  { name: 'module_hr_payroll', displayName: 'HR/Payroll Module Access', description: 'Access to HR/Payroll module', level: 10 },
];

const WORKFLOW_DOC_TYPES = ['quotation', 'purchase_order', 'voucher', 'grn', 'gin', 'sales_order'];

const DOC_TYPE_TO_MODULE: Record<string, string> = {
  quotation: 'sales',
  sales_order: 'sales',
  purchase_order: 'purchase',
  grn: 'purchase',
  gin: 'inventory',
  voucher: 'accounts',
};

const SOD_DOC_TYPES = Array.from(new Set([
  ...Object.keys(DOC_TYPE_TO_MODULE),
  ...Object.values(MODULE_DOC_TYPES).flat(),
]));

export async function seedRBACDefaults(tenantId: number) {
  console.log(`[RBAC-SEED] Starting RBAC seeding for tenant ${tenantId}...`);

  await seedDocumentStatuses();
  await seedPermissionKeys();
  await seedDefaultRoles(tenantId);
  await seedSoDRules(tenantId);
  await seedWorkflowTransitions(tenantId);
  await seedRolePermissionMappings(tenantId);

  console.log(`[RBAC-SEED] RBAC seeding completed for tenant ${tenantId}.`);
}

async function seedDocumentStatuses() {
  console.log('[RBAC-SEED] Seeding document statuses...');
  const result = await db
    .insert(documentStatuses)
    .values(DEFAULT_STATUSES)
    .onConflictDoNothing()
    .returning({ code: documentStatuses.code });

  console.log(`[RBAC-SEED] Seeded ${result.length} new document statuses.`);
}

async function seedPermissionKeys() {
  console.log('[RBAC-SEED] Seeding permission keys...');
  const permissionRows: {
    key: string;
    module: string;
    docType: string;
    action: string;
    displayName: string;
    description: string;
    category: string;
  }[] = [];

  for (const [module, docTypes] of Object.entries(MODULE_DOC_TYPES)) {
    for (const docType of docTypes) {
      for (const action of ACTIONS) {
        const key = `${module}:${docType}:${action}`;
        const docDisplay = DOC_TYPE_DISPLAY_NAMES[docType] || docType;
        const actionDisplay = ACTION_DISPLAY_NAMES[action] || action;
        const displayName = `${actionDisplay} ${docDisplay}`;
        const category = ACTION_CATEGORIES[action] || 'document';

        permissionRows.push({
          key,
          module,
          docType,
          action,
          displayName,
          description: `${displayName} permission`,
          category,
        });
      }
    }
  }

  const reportPermissions = REPORT_PERMISSIONS.map((rp) => ({
    key: rp.key,
    module: rp.module,
    docType: rp.docType,
    action: 'read',
    displayName: rp.displayName,
    description: `${rp.displayName} permission`,
    category: 'report',
  }));
  permissionRows.push(...reportPermissions);

  const batchSize = 100;
  let totalInserted = 0;
  for (let i = 0; i < permissionRows.length; i += batchSize) {
    const batch = permissionRows.slice(i, i + batchSize);
    const result = await db
      .insert(erpPermissions)
      .values(batch)
      .onConflictDoNothing()
      .returning({ key: erpPermissions.key });
    totalInserted += result.length;
  }

  console.log(`[RBAC-SEED] Seeded ${totalInserted} new permission keys (total defined: ${permissionRows.length}).`);
}

async function seedDefaultRoles(tenantId: number) {
  console.log(`[RBAC-SEED] Seeding default roles for tenant ${tenantId}...`);

  const roleValues = DEFAULT_ROLES.map((r) => ({
    name: r.name,
    displayName: r.displayName,
    description: r.description,
    level: r.level,
    tenantId,
    permissions: {},
  }));

  const result = await db
    .insert(roles)
    .values(roleValues)
    .onConflictDoNothing()
    .returning({ name: roles.name });

  console.log(`[RBAC-SEED] Seeded ${result.length} new roles.`);
}

async function seedSoDRules(tenantId: number) {
  console.log(`[RBAC-SEED] Seeding SoD rules for tenant ${tenantId}...`);

  const sodValues: {
    tenantId: number;
    docType: string;
    ruleName: string;
    conflictingActions: string[];
    isStrict: boolean;
  }[] = [];

  for (const docType of SOD_DOC_TYPES) {
    sodValues.push(
      {
        tenantId,
        docType,
        ruleName: `${docType}_maker_checker`,
        conflictingActions: ['create', 'check'],
        isStrict: true,
      },
      {
        tenantId,
        docType,
        ruleName: `${docType}_maker_approver`,
        conflictingActions: ['create', 'approve'],
        isStrict: true,
      },
      {
        tenantId,
        docType,
        ruleName: `${docType}_checker_approver`,
        conflictingActions: ['check', 'approve'],
        isStrict: true,
      }
    );
  }

  const result = await db
    .insert(sodRules)
    .values(sodValues)
    .onConflictDoNothing()
    .returning({ ruleName: sodRules.ruleName });

  console.log(`[RBAC-SEED] Seeded ${result.length} new SoD rules.`);
}

async function seedWorkflowTransitions(tenantId: number) {
  console.log(`[RBAC-SEED] Seeding workflow transitions for tenant ${tenantId}...`);

  const transitions: {
    tenantId: number;
    docType: string;
    fromStatusCode: string | null;
    toStatusCode: string;
    actionName: string;
    requiredPermissionKey: string | null;
    sodGroup: string | null;
    isOptional: boolean;
    sequence: number;
  }[] = [];

  for (const docType of WORKFLOW_DOC_TYPES) {
    const module = DOC_TYPE_TO_MODULE[docType];
    if (!module) continue;

    const pk = (action: string) => `${module}:${docType}:${action}`;

    transitions.push(
      { tenantId, docType, fromStatusCode: null, toStatusCode: 'DRAFT', actionName: 'create', requiredPermissionKey: null, sodGroup: null, isOptional: false, sequence: 1 },
      { tenantId, docType, fromStatusCode: 'DRAFT', toStatusCode: 'SUBMITTED', actionName: 'submit', requiredPermissionKey: pk('submit'), sodGroup: 'maker', isOptional: false, sequence: 2 },
      { tenantId, docType, fromStatusCode: 'SUBMITTED', toStatusCode: 'CHECKED', actionName: 'check', requiredPermissionKey: pk('check'), sodGroup: 'checker', isOptional: false, sequence: 3 },
      { tenantId, docType, fromStatusCode: 'CHECKED', toStatusCode: 'RECOMMENDED', actionName: 'recommend', requiredPermissionKey: pk('recommend'), sodGroup: 'recommender', isOptional: true, sequence: 4 },
      { tenantId, docType, fromStatusCode: 'CHECKED', toStatusCode: 'APPROVED', actionName: 'approve', requiredPermissionKey: pk('approve'), sodGroup: 'approver', isOptional: false, sequence: 5 },
      { tenantId, docType, fromStatusCode: 'RECOMMENDED', toStatusCode: 'APPROVED', actionName: 'approve', requiredPermissionKey: pk('approve'), sodGroup: 'approver', isOptional: false, sequence: 6 },
      { tenantId, docType, fromStatusCode: 'APPROVED', toStatusCode: 'POSTED', actionName: 'post', requiredPermissionKey: pk('post'), sodGroup: 'poster', isOptional: false, sequence: 7 },
      { tenantId, docType, fromStatusCode: 'SUBMITTED', toStatusCode: 'DRAFT', actionName: 'send_back', requiredPermissionKey: pk('send_back'), sodGroup: null, isOptional: false, sequence: 8 },
      { tenantId, docType, fromStatusCode: 'CHECKED', toStatusCode: 'SUBMITTED', actionName: 'send_back', requiredPermissionKey: pk('send_back'), sodGroup: null, isOptional: false, sequence: 9 },
      { tenantId, docType, fromStatusCode: 'RECOMMENDED', toStatusCode: 'CHECKED', actionName: 'send_back', requiredPermissionKey: pk('send_back'), sodGroup: null, isOptional: false, sequence: 10 },
      { tenantId, docType, fromStatusCode: 'SUBMITTED', toStatusCode: 'REJECTED', actionName: 'reject', requiredPermissionKey: pk('reject'), sodGroup: null, isOptional: false, sequence: 11 },
      { tenantId, docType, fromStatusCode: 'CHECKED', toStatusCode: 'REJECTED', actionName: 'reject', requiredPermissionKey: pk('reject'), sodGroup: null, isOptional: false, sequence: 12 },
      { tenantId, docType, fromStatusCode: 'RECOMMENDED', toStatusCode: 'REJECTED', actionName: 'reject', requiredPermissionKey: pk('reject'), sodGroup: null, isOptional: false, sequence: 13 },
      { tenantId, docType, fromStatusCode: 'DRAFT', toStatusCode: 'CANCELLED', actionName: 'cancel', requiredPermissionKey: pk('cancel'), sodGroup: null, isOptional: false, sequence: 14 },
      { tenantId, docType, fromStatusCode: 'APPROVED', toStatusCode: 'CANCELLED', actionName: 'cancel', requiredPermissionKey: pk('cancel'), sodGroup: null, isOptional: false, sequence: 15 },
    );
  }

  const result = await db
    .insert(workflowTransitions)
    .values(transitions)
    .onConflictDoNothing()
    .returning({ id: workflowTransitions.id });

  console.log(`[RBAC-SEED] Seeded ${result.length} new workflow transitions.`);
}

async function seedRolePermissionMappings(tenantId: number) {
  console.log(`[RBAC-SEED] Seeding role→permission mappings for tenant ${tenantId}...`);

  const allPermissions = await db
    .select({ id: erpPermissions.id, key: erpPermissions.key, module: erpPermissions.module, action: erpPermissions.action })
    .from(erpPermissions)
    .where(eq(erpPermissions.isActive, true));

  if (allPermissions.length === 0) {
    console.log('[RBAC-SEED] No active permissions found, skipping role-permission mappings.');
    return;
  }

  const tenantRoles = await db
    .select({ id: roles.id, name: roles.name, tenantId: roles.tenantId })
    .from(roles)
    .where(or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)));

  if (tenantRoles.length === 0) {
    console.log('[RBAC-SEED] No roles found for tenant, skipping role-permission mappings.');
    return;
  }

  const dataEntryActions = ['create', 'read', 'edit'];
  const officerActions = ['create', 'read', 'edit', 'submit', 'check', 'print', 'export'];
  const recommenderActions = officerActions.concat('recommend');
  const approverActions = recommenderActions.concat('approve');
  const managerActions = approverActions.concat('delete', 'send_back', 'reject', 'cancel');
  const gmActions = managerActions.concat('amend');
  const directorActions = gmActions.concat('override_post');

  const roleActionMap: Record<string, (perm: { action: string; module: string; key: string }) => boolean> = {
    data_entry: (p) => dataEntryActions.includes(p.action) && !REPORT_PERMISSION_KEYS.has(p.key),
    officer: (p) => officerActions.includes(p.action) && !REPORT_PERMISSION_KEYS.has(p.key),
    accounts_poster: (p) => (officerActions.includes(p.action) || (p.action === 'post' && p.module === 'accounts')) && !REPORT_PERMISSION_KEYS.has(p.key),
    recommender: (p) => recommenderActions.includes(p.action) || REPORT_PERMISSION_KEYS.has(p.key),
    approver: (p) => approverActions.includes(p.action) || REPORT_PERMISSION_KEYS.has(p.key),
    manager: (p) => managerActions.includes(p.action) || REPORT_PERMISSION_KEYS.has(p.key),
    general_manager: (p) => gmActions.includes(p.action) || REPORT_PERMISSION_KEYS.has(p.key),
    director: (p) => directorActions.includes(p.action) || REPORT_PERMISSION_KEYS.has(p.key),
    admin: (_p) => true,
    owner: (_p) => true,
    auditor: (p) => p.action === 'read' || p.action === 'print' || p.action === 'export',
  };

  const mappings: { roleId: number; permissionId: number; tenantId: number }[] = [];

  for (const role of tenantRoles) {
    const filterFn = roleActionMap[role.name];
    if (!filterFn) continue;

    for (const perm of allPermissions) {
      if (filterFn({ action: perm.action, module: perm.module, key: perm.key })) {
        mappings.push({ roleId: role.id, permissionId: perm.id, tenantId });
      }
    }
  }

  if (mappings.length === 0) {
    console.log('[RBAC-SEED] No role-permission mappings to insert.');
    return;
  }

  const batchSize = 200;
  let totalInserted = 0;
  for (let i = 0; i < mappings.length; i += batchSize) {
    const batch = mappings.slice(i, i + batchSize);
    const result = await db
      .insert(rolePermissions)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: rolePermissions.id });
    totalInserted += result.length;
  }

  console.log(`[RBAC-SEED] Seeded ${totalInserted} new role-permission mappings (total defined: ${mappings.length}).`);
}
