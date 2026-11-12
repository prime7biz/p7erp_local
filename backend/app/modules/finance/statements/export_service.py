"""XLSX / PDF export of the six statements (PLAN "Export", acceptance 2.17).

The export is built from the SAME response object the JSON endpoint returns (no separate math): each statement is
flattened into one `ExportTable` of text cells (lakh / crore grouping, `(-)` for negatives, Dr / Cr suffix on
balances), and the table is written to openpyxl (xlsx) or reportlab (pdf). Both libraries are already in
requirements.txt and are imported lazily so a missing package cannot stop the app from starting.

Amounts in the files are text rounded to 2 places for reading (JSON keeps 4 places); a spreadsheet cannot sum them,
which is the price of the lakh / crore display.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from decimal import Decimal

from app.modules.finance.statements.flow_schemas import (
    CashFlowResponse,
    FundsFlowResponse,
    RatioAnalysisResponse,
)
from app.modules.finance.statements.money_format import format_dr_cr, format_indian
from app.modules.finance.statements.schemas import (
    BalanceSheetResponse,
    Envelope,
    ProfitLossResponse,
    SheetNode,
    TrialBalanceResponse,
)

ZERO = Decimal("0")

REPORT_TITLES = {
    "trial-balance": "Trial Balance",
    "balance-sheet": "Balance Sheet",
    "profit-loss": "Trading and Profit & Loss A/c",
    "cash-flow-monthly": "Cash Flow - Monthly Summary",
    "funds-flow-monthly": "Funds Flow - Monthly Summary",
    "ratio-analysis": "Ratio Analysis",
}


@dataclass
class ExportRow:
    cells: list[str]
    bold: bool = False
    indent: int = 0


@dataclass
class ExportTable:
    title: str
    company: str
    address: str
    period: str
    currency: str
    columns: list[str]
    rows: list[ExportRow] = field(default_factory=list)


def _period_text(env: Envelope) -> str:
    p = env.period
    if p.as_of_date:
        return f"As at {p.as_of_date.strftime('%d-%b-%Y')}"
    if p.from_date and p.to_date:
        return f"{p.from_date.strftime('%d-%b-%Y')} to {p.to_date.strftime('%d-%b-%Y')}"
    return f"Fiscal year {p.fiscal_year}"


def _new(env: Envelope, report: str, columns: list[str]) -> ExportTable:
    return ExportTable(
        title=REPORT_TITLES[report],
        company=env.company.name,
        address=env.company.address or "",
        period=_period_text(env),
        currency=env.base_currency,
        columns=columns,
    )


def _money(value: Decimal | None) -> str:
    return format_indian(value) if value is not None else ""


# ---- flatteners ----------------------------------------------------------------------------------------
def table_trial_balance(r: TrialBalanceResponse) -> ExportTable:
    t = _new(r, "trial-balance", ["Particulars", "Opening Balance", "Debit", "Credit", "Closing Balance"])
    for row in r.rows:
        net_open = row.opening_debit - row.opening_credit
        net_close = row.closing_debit - row.closing_credit
        t.rows.append(
            ExportRow(
                [row.name, format_dr_cr(net_open), _money(row.period_debit), _money(row.period_credit), format_dr_cr(net_close)],
                bold=row.row_type in ("primary", "profit_and_loss"),
                indent=row.depth,
            )
        )
    tot = r.totals
    t.rows.append(
        ExportRow(
            [
                "Grand Total",
                f"{format_indian(tot.opening_debit)} Dr",
                _money(tot.period_debit),
                _money(tot.period_credit),
                f"{format_indian(tot.closing_debit)} Dr",
            ],
            bold=True,
        )
    )
    return t


def _flatten_nodes(nodes: list[SheetNode], depth: int, out: list[ExportRow]) -> None:
    for n in nodes:
        out.append(
            ExportRow(
                [n.name, _money(n.inner_amount), _money(n.outer_amount)],
                bold=n.row_type in ("primary", "result"),
                indent=depth,
            )
        )
        _flatten_nodes(n.children, depth + 1, out)


def table_balance_sheet(r: BalanceSheetResponse) -> ExportTable:
    t = _new(r, "balance-sheet", ["Particulars", "Amount", "Total"])
    t.rows.append(ExportRow(["Liabilities", "", ""], bold=True))
    _flatten_nodes(r.liabilities, 1, t.rows)
    t.rows.append(ExportRow(["Total Liabilities", "", _money(r.totals.liabilities)], bold=True))
    t.rows.append(ExportRow(["Assets", "", ""], bold=True))
    _flatten_nodes(r.assets, 1, t.rows)
    t.rows.append(ExportRow(["Total Assets", "", _money(r.totals.assets)], bold=True))
    t.rows.append(ExportRow(["Difference", "", _money(r.totals.difference)]))
    return t


def table_profit_loss(r: ProfitLossResponse) -> ExportTable:
    t = _new(r, "profit-loss", ["Particulars", "Amount", "Total"])
    for heading, rows, total in (
        ("Trading Account - Debit", r.trading.debit_rows, r.trading.debit_total),
        ("Trading Account - Credit", r.trading.credit_rows, r.trading.credit_total),
        ("Profit & Loss A/c - Debit", r.profit_and_loss.debit_rows, r.profit_and_loss.debit_total),
        ("Profit & Loss A/c - Credit", r.profit_and_loss.credit_rows, r.profit_and_loss.credit_total),
    ):
        t.rows.append(ExportRow([heading, "", ""], bold=True))
        _flatten_nodes(rows, 1, t.rows)
        t.rows.append(ExportRow([f"Total ({heading.split(' - ')[-1]})", "", _money(total)], bold=True))
    return t


def table_cash_flow(r: CashFlowResponse) -> ExportTable:
    t = _new(r, "cash-flow-monthly", ["Month", "Inflow", "Outflow", "Nett Flow", "Closing Cash"])
    t.rows.append(ExportRow(["Opening Cash", "", "", "", format_dr_cr(r.opening_cash)], bold=True))
    for m in r.months:
        t.rows.append(ExportRow([m.label, _money(m.inflow), _money(m.outflow), _money(m.nett_flow), format_dr_cr(m.closing_cash)]))
    g = r.grand_total
    t.rows.append(
        ExportRow(["Grand Total", _money(g.inflow), _money(g.outflow), _money(g.nett_flow), format_dr_cr(g.closing_cash)], bold=True)
    )
    return t


def table_funds_flow(r: FundsFlowResponse) -> ExportTable:
    t = _new(r, "funds-flow-monthly", ["Month", "Working Capital Opening", "Working Capital Closing", "Funds Flow"])
    for m in r.months:
        t.rows.append(
            ExportRow([m.label, format_dr_cr(m.working_capital_opening), format_dr_cr(m.working_capital_closing), _money(m.funds_flow)])
        )
    g = r.grand_total
    t.rows.append(
        ExportRow(
            ["Grand Total", format_dr_cr(g.working_capital_opening), format_dr_cr(g.working_capital_closing), _money(g.funds_flow)],
            bold=True,
        )
    )
    return t


def table_ratios(r: RatioAnalysisResponse) -> ExportTable:
    t = _new(r, "ratio-analysis", ["Particulars", "Value", "Detail"])
    t.rows.append(ExportRow(["Principal Groups", "", ""], bold=True))
    for g in r.principal_groups:
        if g.amount is not None:
            value, detail = f"{format_indian(g.amount)} {g.dr_cr}".strip(), ""
        elif g.value is not None:
            value, detail = f"{format_indian(g.value)} {g.unit or ''}".strip(), ""
        else:
            value, detail = "N/A", g.reason or ""
        t.rows.append(ExportRow([g.label, value, detail], indent=1))
    t.rows.append(ExportRow(["Principal Ratios", "", ""], bold=True))
    for q in r.principal_ratios:
        detail = q.reason or (f"{format_indian(q.numerator)} / {format_indian(q.denominator)}")
        t.rows.append(ExportRow([q.label, q.display, detail], indent=1))
    return t


# ---- writers -------------------------------------------------------------------------------------------
def _safe_text(text: str) -> str:
    """Spreadsheet formula injection guard: a cell that starts with = + - @ is stored as text."""
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


def render_xlsx(table: ExportTable) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font

    wb = Workbook()
    ws = wb.active
    ws.title = "".join(ch for ch in table.title if ch not in "\\/*?:[]")[:31] or "Report"
    ws.append([_safe_text(table.company)])
    ws.append([_safe_text(table.address)])
    ws.append([table.title])
    ws.append([f"{table.period}   (amounts in {table.currency})"])
    ws.append([])
    for r in range(1, 5):
        ws.cell(row=r, column=1).font = Font(bold=r in (1, 3), size=14 if r == 1 else 11)
    ws.append(table.columns)
    header_row = ws.max_row
    for c in range(1, len(table.columns) + 1):
        ws.cell(row=header_row, column=c).font = Font(bold=True)
        ws.cell(row=header_row, column=c).alignment = Alignment(horizontal="left" if c == 1 else "right")
    for row in table.rows:
        ws.append([_safe_text(row.cells[0])] + [_safe_text(c) for c in row.cells[1:]])
        r = ws.max_row
        for c in range(1, len(table.columns) + 1):
            cell = ws.cell(row=r, column=c)
            cell.font = Font(bold=row.bold)
            cell.alignment = Alignment(horizontal="left" if c == 1 else "right", indent=row.indent if c == 1 else 0)
    ws.column_dimensions["A"].width = 44
    for c in range(2, len(table.columns) + 1):
        ws.column_dimensions[chr(64 + c)].width = 22
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def render_pdf(table: ExportTable) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

    buf = io.BytesIO()
    page = landscape(A4) if len(table.columns) > 4 else A4

    def decorate(canvas, doc):
        canvas.saveState()
        width, height = page
        canvas.setFont("Helvetica-Bold", 13)
        canvas.drawString(15 * mm, height - 14 * mm, table.company)
        canvas.setFont("Helvetica", 8)
        if table.address:
            canvas.drawString(15 * mm, height - 19 * mm, table.address[:140])
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(15 * mm, height - 25 * mm, table.title)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(15 * mm, height - 30 * mm, f"{table.period}   (amounts in {table.currency})")
        canvas.drawRightString(width - 15 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf, pagesize=page, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=36 * mm, bottomMargin=16 * mm,
        title=f"{table.company} - {table.title}",
    )
    data = [table.columns] + [[("  " * row.indent) + row.cells[0]] + row.cells[1:] for row in table.rows]
    grid = Table(data, repeatRows=1)
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.black),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.Color(0.96, 0.96, 0.96)]),
    ]
    for i, row in enumerate(table.rows, start=1):
        if row.bold:
            style.append(("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"))
    grid.setStyle(TableStyle(style))
    doc.build([grid], onFirstPage=decorate, onLaterPages=decorate)
    return buf.getvalue()


def build_table(report: str, response) -> ExportTable:
    return {
        "trial-balance": table_trial_balance,
        "balance-sheet": table_balance_sheet,
        "profit-loss": table_profit_loss,
        "cash-flow-monthly": table_cash_flow,
        "funds-flow-monthly": table_funds_flow,
        "ratio-analysis": table_ratios,
    }[report](response)
