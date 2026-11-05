"""Accept Excel (.xlsx) wherever an importer expects CSV text.

`upload_to_csv_text` turns an uploaded file into CSV text:
  - .xlsx (detected by the ZIP signature, not only the file name) -> first worksheet as CSV
  - anything else -> decoded as UTF-8 (with BOM) or Latin-1

Existing CSV importers keep working unchanged; they just receive the converted text.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime

from fastapi import HTTPException

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_ROWS = 20000


def is_xlsx(filename: str | None, raw: bytes) -> bool:
    name = (filename or "").lower()
    return raw[:2] == b"PK" and (name.endswith(".xlsx") or name.endswith(".xlsm") or not name.endswith(".csv"))


def _cell_text(v: object) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat() if v.time() == datetime.min.time() else v.isoformat(sep=" ")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def xlsx_to_csv_text(raw: bytes) -> str:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover - openpyxl is in requirements.txt
        raise HTTPException(status_code=500, detail="Excel import is not available on this server") from exc
    try:
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read the Excel file. Save it as .xlsx and try again.") from exc
    try:
        ws = wb.worksheets[0]
        out = io.StringIO()
        writer = csv.writer(out)
        rows = 0
        for row in ws.iter_rows(values_only=True):
            cells = [_cell_text(v) for v in row]
            while cells and cells[-1] == "":
                cells.pop()
            if not cells:
                continue
            rows += 1
            if rows > MAX_ROWS + 1:
                raise HTTPException(status_code=400, detail=f"Sheet has too many rows (max {MAX_ROWS})")
            writer.writerow(cells)
        return out.getvalue()
    finally:
        wb.close()


def upload_to_csv_text(filename: str | None, raw: bytes) -> str:
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File is too large (max 5 MB)")
    if is_xlsx(filename, raw):
        return xlsx_to_csv_text(raw)
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")
