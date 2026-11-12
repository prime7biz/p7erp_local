"""Spreadsheet formula-injection guard for CSV / XLSX exports (CWE-1236).

A text cell that a spreadsheet could read as a formula is prefixed with a single quote, so it is shown as text.
"""

from __future__ import annotations

# ASCII and full-width (U+FF1D = , U+FF0B + , U+FF0D - , U+FF20 @) formula starters.
FORMULA_PREFIXES = ("=", "+", "-", "@", "\uff1d", "\uff0b", "\uff0d", "\uff20")
CONTROL_PREFIXES = ("\t", "\r", "\n")


def neutralize_formula(text: str) -> str:
    """Quote `text` when it starts with a formula character, a tab / CR / LF, or whitespace then a formula character."""
    if not text:
        return text
    if text.startswith(CONTROL_PREFIXES) or text.lstrip().startswith(FORMULA_PREFIXES):
        return "'" + text
    return text
