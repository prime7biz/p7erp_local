import { AccountMovement } from "./rules";

export const NATURE_TO_STATEMENT: Record<string, "pl" | "bs"> = {
  Income: "pl",
  Expense: "pl",
  Asset: "bs",
  Liability: "bs",
  Equity: "bs",
};

export const PL_NATURES = ["Income", "Expense"];
export const BS_NATURES = ["Asset", "Liability", "Equity"];

export interface GroupNode {
  groupId: number;
  groupName: string;
  nature: string;
  level: number;
  parentGroupId: number | null;
  accounts: Array<{
    accountId: number;
    accountName: string;
    accountNumber: string;
    debit: number;
    credit: number;
    balance: number;
  }>;
  children: GroupNode[];
  total: number;
}

export function buildGroupTree(
  groups: any[],
  accountsByGroup: Map<number, GroupNode["accounts"]>,
  parentId: number | null,
  level: number
): GroupNode[] {
  const children = groups.filter((g) =>
    parentId === null ? g.parentGroupId === null : g.parentGroupId === parentId
  );

  return children
    .map((group) => {
      const childNodes = buildGroupTree(groups, accountsByGroup, group.id, level + 1);
      const accounts = accountsByGroup.get(group.id) || [];

      let total = accounts.reduce((s, a) => s + a.balance, 0);
      for (const child of childNodes) {
        total += child.total;
      }

      return {
        groupId: group.id,
        groupName: group.name,
        nature: group.nature,
        level,
        parentGroupId: group.parentGroupId,
        accounts,
        children: childNodes,
        total: Math.round(total * 100) / 100,
      };
    })
    .filter(
      (g) =>
        g.total !== 0 || g.accounts.length > 0 || g.children.length > 0
    );
}

export function computeAccountBalance(
  acct: AccountMovement,
  mode: "period" | "closing"
): number {
  if (mode === "period") {
    if (acct.groupNature === "Income") {
      return Math.round((acct.periodCredit - acct.periodDebit) * 100) / 100;
    }
    return Math.round((acct.periodDebit - acct.periodCredit) * 100) / 100;
  }
  const totalDebit = acct.openingDebit + acct.periodDebit;
  const totalCredit = acct.openingCredit + acct.periodCredit;
  if (acct.groupNature === "Asset" || acct.groupNature === "Expense") {
    return Math.round((totalDebit - totalCredit) * 100) / 100;
  }
  return Math.round((totalCredit - totalDebit) * 100) / 100;
}

export const CASH_FLOW_MAPPING = {
  operating: {
    description: "Cash Flow from Operating Activities",
    adjustmentNatures: ["Expense"],
    adjustmentGroupKeywords: ["depreciation", "amortization", "provision"],
    workingCapitalNatures: {
      currentAssets: { nature: "Asset", keywords: ["receivable", "inventory", "advance", "prepaid", "current"] },
      currentLiabilities: { nature: "Liability", keywords: ["payable", "accrued", "provision", "current", "outstanding"] },
    },
  },
  investing: {
    description: "Cash Flow from Investing Activities",
    groupKeywords: ["fixed asset", "capital", "investment", "property", "equipment", "machinery"],
  },
  financing: {
    description: "Cash Flow from Financing Activities",
    groupKeywords: ["loan", "borrowing", "capital", "equity", "share", "dividend"],
  },
};

export function classifyCashFlowItem(
  groupName: string,
  nature: string
): "operating" | "investing" | "financing" | "operating_wc" | null {
  const lowerName = groupName.toLowerCase();

  for (const kw of CASH_FLOW_MAPPING.investing.groupKeywords) {
    if (lowerName.includes(kw) && nature === "Asset") return "investing";
  }

  for (const kw of CASH_FLOW_MAPPING.financing.groupKeywords) {
    if ((nature === "Liability" || nature === "Equity") && lowerName.includes(kw)) return "financing";
  }

  if (nature === "Asset" || nature === "Liability") {
    return "operating_wc";
  }

  return null;
}
