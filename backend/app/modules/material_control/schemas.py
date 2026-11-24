"""Pydantic response shapes for Material Control Phase 1 (read-only)."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class ActionQueueItem(BaseModel):
    kind: Literal[
        "GRN_DRAFT",
        "GRN_UNBILLED",
        "VENDOR_BILL_DRAFT",
        "PO_OPEN",
        "PMI_DRAFT",
    ]
    severity: Literal["info", "warn", "urgent"] = "info"
    title: str
    detail: str | None = None
    href: str
    record_id: int
    record_code: str | None = None
    as_of_date: date | None = None


class ActionQueueResponse(BaseModel):
    items: list[ActionQueueItem] = Field(default_factory=list)
    truncated: bool = False


class StyleControlOrderRow(BaseModel):
    order_id: int
    order_code: str
    status: str | None = None
    delivery_date: date | None = None
    quantity: int | None = None


class StyleControlCounts(BaseModel):
    orders: int = 0
    open_pos: int = 0
    received_grns: int = 0
    unbilled_grns: int = 0
    pmi_issued: int = 0
    pmi_draft: int = 0


class ChainHealthNode(BaseModel):
    """One commercial-chain node (count + latest clickable link)."""

    count: int = 0
    latest_id: int | None = None
    latest_code: str | None = None


class StyleChainHealth(BaseModel):
    inquiries: ChainHealthNode = Field(default_factory=ChainHealthNode)
    quotations: ChainHealthNode = Field(default_factory=ChainHealthNode)
    orders: ChainHealthNode = Field(default_factory=ChainHealthNode)
    boms: ChainHealthNode = Field(default_factory=ChainHealthNode)
    proforma_invoices: ChainHealthNode = Field(default_factory=ChainHealthNode)
    master_contracts: ChainHealthNode = Field(default_factory=ChainHealthNode)
    btb_lcs: ChainHealthNode = Field(default_factory=ChainHealthNode)


class StyleControlSheetResponse(BaseModel):
    style_id: int
    style_code: str
    style_name: str | None = None
    counts: StyleControlCounts
    orders: list[StyleControlOrderRow] = Field(default_factory=list)
    chain_health: StyleChainHealth = Field(default_factory=StyleChainHealth)


class StyleListRow(BaseModel):
    style_id: int
    style_code: str
    style_name: str | None = None
    order_count: int = 0


class StyleListResponse(BaseModel):
    items: list[StyleListRow] = Field(default_factory=list)


class GenealogyMovementRow(BaseModel):
    id: int
    movement_type: str | None = None
    quantity: str | None = None
    item_id: int | None = None
    warehouse_id: int | None = None
    reference_type: str | None = None
    reference_id: int | None = None
    movement_date: date | None = None
    lot_number: str | None = None
    order_id: int | None = None


class GenealogyResponse(BaseModel):
    lot_number: str
    grn_line_count: int = 0
    movements: list[GenealogyMovementRow] = Field(default_factory=list)
