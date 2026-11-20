"""Minimal merchandising document PDFs (reportlab) for mobile Save PDF / Share."""

from __future__ import annotations

import io
from typing import Any, Sequence

from app.models import Tenant


def render_simple_doc_pdf(
    *,
    tenant: Tenant,
    title: str,
    lines: Sequence[tuple[str, Any]],
) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 20 * mm
    company = (tenant.name or "Company").strip()
    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, y, company[:90])
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y, title[:90])
    y -= 10 * mm
    c.setFont("Helvetica", 10)

    for label, value in lines:
        if y < 20 * mm:
            c.showPage()
            y = height - 20 * mm
            c.setFont("Helvetica", 10)
        text = f"{label}: {value if value not in (None, '') else '—'}"
        c.drawString(20 * mm, y, text[:110])
        y -= 6 * mm

    c.showPage()
    c.save()
    return buf.getvalue()
