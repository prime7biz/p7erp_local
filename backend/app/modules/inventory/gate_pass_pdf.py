"""Minimal gate-pass PDF (reportlab) for mobile Save PDF / Share."""

from __future__ import annotations

import io
from typing import Any

from app.models import Tenant
from app.models.inventory import EnhancedGatePass


def render_gate_pass_pdf(*, tenant: Tenant, row: EnhancedGatePass, challan_code: str | None) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 20 * mm
    company = (tenant.name or "Company").strip()
    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, y, company)
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y, "Gate Pass")
    y -= 10 * mm
    c.setFont("Helvetica", 10)

    def line(label: str, value: Any) -> None:
        nonlocal y
        text = f"{label}: {value if value not in (None, '') else '—'}"
        c.drawString(20 * mm, y, text[:110])
        y -= 6 * mm

    line("Code", row.gate_pass_code)
    line("Status", row.status)
    line("Purpose", row.purpose)
    line("Destination", row.destination)
    line("Vehicle", row.vehicle_no)
    line("Linked challan", challan_code)
    line("Guard acknowledged", "Yes" if row.guard_acknowledged else "No")
    line("Class 1", getattr(row, "class1_approval_status", None) or "—")
    line("Notes", (row.notes or "")[:90])
    if getattr(row, "verification_id", None):
        line("Verification", row.verification_id)
    c.showPage()
    c.save()
    return buf.getvalue()
