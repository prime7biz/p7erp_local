"""Parser checks for the Tally day book. Uses made-up lines only, never a real company file.

Run: docker compose exec -T backend pytest tests/test_tally_daybook_import.py -q
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

_PATH = Path(__file__).resolve().parents[1] / "scripts" / "tally_daybook_import" / "parse_daybook.py"
_SPEC = importlib.util.spec_from_file_location("parse_daybook", _PATH)
parse_daybook = importlib.util.module_from_spec(_SPEC)
assert _SPEC and _SPEC.loader
_SPEC.loader.exec_module(parse_daybook)


SAMPLE = """
Day Book
Page 1
CPV #0001 06-Jul-26
Cash - Head Office 1,05,512.00 Cr
Rent 1,05,512.00 Dr
Being office rent cheque AF1280655
JV #0002 06-Jul-26
Sales 10.00 Cr
Cash 9.00 Dr
"""


def test_parser_keeps_balanced_vouchers_and_holds_the_rest():
    ok, held = parse_daybook.parse_daybook_text(SAMPLE)
    assert len(ok) == 1
    assert ok[0]["erp_type"] == "PAYMENT"
    assert ok[0]["debit_total"] == "105512.00"
    assert ok[0]["narration"].startswith("[Tally Ref: CPV#0001]")
    assert ok[0]["instrument_reference"] == "AF1280655"
    assert ok[0]["reference"] == "TALLY-06-Jul-26-CPV-0001"
    assert held[0]["reason"] == "does not balance"
