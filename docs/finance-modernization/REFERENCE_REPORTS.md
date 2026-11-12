# Finance reference reports (Tally samples from the user, 2026-11-12)

Six PDF exports from Tally for **LAKHSMA INNER WEAR LTD.**, period **1-Jan-25 to 31-Dec-25**. Amounts use the
South Asian grouping (`1,81,38,63,870.26`), negatives print as `(-)`, balances carry a `Dr` / `Cr` suffix.
Every report has the company name, address, e-mail, the report title and the period in the header, and
"continued ..." / "Carried Over" / "Brought Forward" lines between printed pages.

The structure below is what P7 must be able to produce from its own ledger (account groups + posted vouchers).

## 1. Trial Balance (grouped)

Columns: **Opening Balance** | **Transactions Debit** | **Transactions Credit** | **Closing Balance** (Dr/Cr).
Rows: primary group (bold, with group totals) then its ledgers (indented). Groups seen, in order:
Capital Account, Loans (Liability), Current Liabilities, Fixed Assets, Investments, Current Assets,
Sales Accounts, Purchase Accounts, Direct Expenses, Indirect Incomes, Indirect Expenses, then a
**Profit & Loss A/c** line (opening = accumulated profit/loss brought forward). Grand Total: debit = credit.

## 2. Balance Sheet (two-sided, "horizontal")

Left = **Liabilities**, right = **Assets**, one column "as at 31-Dec-25" with ledger amounts in an inner column
and group totals in the outer column.

- Liabilities: Capital Account (Paid Up Capital); Loans (Liability) (Bank OD A/c, Long Term Borrowing, loans from
 named parties); Current Liabilities (Provision for Salary & Wages, Sundry Creditors, Accrued Expenses,
 Accumulated Depreciation, Back to Back Liability, EDF Liabilities for BB L/C, FOD Loan, Loan From Directors,
 Packing Credit Loan, Short Term Borrowing, Time Loan, Provisioning Bill).
- Assets: Fixed Assets (Deferred Revenue Expenses, Intangible, Tangible); Investments; Current Assets
 (Closing Stock, Cash-in-hand, Cash at Bank, Advance Deposit & Prepayment, Advance Income Tax & VAT,
 Export Bill Receivable, Marginal Deposit); **Profit & Loss A/c** (debit balance = accumulated loss) split into
 **Opening Balance** and **Current Period**.
- Both sides total the same figure.

## 3. Profit & Loss A/c (Trading + P&L, two-sided)

Left = debits, right = credits, single period column.

- Trading part: left = Opening Stock (Finished Goods / Raw Materials / Work-In-Process), Purchase Accounts
 (Accessories, AOP, Embroidery & Printing, Fabrics Dyeing, Fabrics, Goods in Transit, Knitting, Packing, Spare
 Parts, Yarn), Direct Expenses (operational bonus, salary, utilities, depreciation, ...). Right = Sales Accounts
 (Export Sales, Insurance Comm., Leftover Sales, Others, Sub-Contract, Wastage Sales), **Closing Stock** (FG / RM /
 WIP) and **Gross Loss c/o** (or Gross Profit c/o on the left when positive). Trading totals match.
- P&L part: left = Gross Loss b/f, Indirect Expenses (admin & selling, finance expenses, income tax, forex
 gain/loss, penalties, ...). Right = Indirect Incomes (discount, interest, audit fee, cash incentive, ...) and
 **Nett Loss** (or Nett Profit on the left). Totals match.
- Closing stock comes from stock valuation, not from a ledger balance.

## 4. Cash Flow – Monthly Summary

Columns: Month | Cash Movement **Inflow** | **Outflow** | **Nett Flow**; twelve month rows + Grand Total.
Cash = cash-in-hand + bank ledgers (Tally "Cash-in-hand" and "Bank Accounts" groups; OD accounts are part of it).
Drill-down in Tally: month -> groups -> ledgers -> vouchers.

## 5. Funds Flow – Monthly Summary

Columns: Month | Working Capital **Opening** | **Closing** | **Funds Flow** (closing - opening); Grand Total row shows
the year's opening, closing and total flow. Working capital = Current Assets - Current Liabilities.

## 6. Ratio Analysis

Left = **Principal Groups** (with Dr/Cr): Working Capital (CA - CL), Cash-in-hand, Cash at Bank, Bank OD A/c,
Sundry Debtors, Sundry Debtors due till today, Sundry Creditors, Sundry Creditors due till today, Sales Accounts,
Purchase Accounts, Stock-in-hand, Nett Profit / Nett Loss, Working Capital Turnover (Sales / Working Capital),
Inventory Turnover (Sales / Closing Stock).

Right = **Principal Ratios**: Current Ratio (CA : CL), Quick Ratio ((CA - Stock) : CL), Debt/Equity
(Loans (Liability) : Capital + Nett Profit), Gross Profit %, Nett Profit %, Operating Cost % (of Sales),
Receivable Turnover in days, Return on Investment % (Nett Profit / (Capital + Nett Profit)),
Return on Working Capital % (Nett Profit / Working Capital).
