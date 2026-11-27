import { request } from "@/api/core";

export type SubAccount = {
  id: number;
  code: string;
  name: string;
  category: string;
  employee_id: number | null;
  customer_id: number | null;
  vendor_id: number | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
};

export type SubAccountRegisterRow = {
  id: number;
  code: string;
  name: string;
  category: string;
  debit_total: string;
  credit_total: string;
  net: string;
};

export function listSubAccounts(): Promise<SubAccount[]> {
  return request<SubAccount[]>("/api/v1/finance/sub-accounts");
}

export function createSubAccount(body: {
  code: string;
  name: string;
  category: string;
  phone?: string;
  notes?: string;
}): Promise<SubAccount> {
  return request<SubAccount>("/api/v1/finance/sub-accounts", { method: "POST", body: JSON.stringify(body) });
}

export function updateSubAccount(id: number, body: SubAccount): Promise<SubAccount> {
  return request<SubAccount>(`/api/v1/finance/sub-accounts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export type OpenBillReference = {
  id: number;
  bill_number: string;
  pending_amount: string;
  entry_side: string | null;
};

export function listOpenBillReferences(accountId: number, entrySide?: string): Promise<OpenBillReference[]> {
  const q = new URLSearchParams({ account_id: String(accountId) });
  if (entrySide) q.set("entry_side", entrySide);
  return request<OpenBillReference[]>(`/api/v1/finance/sub-accounts/open-bill-references?${q.toString()}`);
}

export function subAccountRegister(): Promise<SubAccountRegisterRow[]> {
  return request<SubAccountRegisterRow[]>("/api/v1/finance/sub-accounts/register");
}
