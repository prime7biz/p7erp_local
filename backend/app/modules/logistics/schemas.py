"""Pydantic schemas for logistics shipments, packing lists, and containers."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class ShipmentCreate(BaseModel):
    trade_case_id: int
    reference: str = Field(..., max_length=64)
    status: str | None = Field(default="PLANNED", max_length=32)
    carrier: str | None = Field(default=None, max_length=255)
    booking_ref: str | None = Field(default=None, max_length=128)
    bl_awb: str | None = Field(default=None, max_length=128)
    etd: date | None = None
    eta: date | None = None
    origin_port: str | None = Field(default=None, max_length=255)
    dest_port: str | None = Field(default=None, max_length=255)
    notes: str | None = None


class ShipmentUpdate(BaseModel):
    reference: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, max_length=32)
    carrier: str | None = Field(default=None, max_length=255)
    booking_ref: str | None = Field(default=None, max_length=128)
    bl_awb: str | None = Field(default=None, max_length=128)
    etd: date | None = None
    eta: date | None = None
    origin_port: str | None = Field(default=None, max_length=255)
    dest_port: str | None = Field(default=None, max_length=255)
    notes: str | None = None


class ShipmentResponse(BaseModel):
    id: int
    tenant_id: int
    trade_case_id: int
    reference: str
    status: str
    carrier: str | None = None
    booking_ref: str | None = None
    bl_awb: str | None = None
    etd: str | None = None
    eta: str | None = None
    origin_port: str | None = None
    dest_port: str | None = None
    notes: str | None = None
    created_at: str
    updated_at: str


class PackingListCreate(BaseModel):
    packing_list_number: str | None = Field(default=None, max_length=32)
    shipment_id: int | None = None
    order_id: int | None = None
    delivery_challan_id: int | None = None
    packing_date: date | None = None
    total_cartons: int = Field(default=0, ge=0)
    gross_weight: float | None = Field(default=None, ge=0)
    net_weight: float | None = Field(default=None, ge=0)
    # Spec aliases (kg) — accepted as input synonyms.
    gross_weight_kg: float | None = Field(default=None, ge=0)
    net_weight_kg: float | None = Field(default=None, ge=0)
    status: str | None = Field(default="DRAFT", max_length=32)
    notes: str | None = None


class PackingListUpdate(BaseModel):
    shipment_id: int | None = None
    order_id: int | None = None
    delivery_challan_id: int | None = None
    packing_date: date | None = None
    total_cartons: int | None = Field(default=None, ge=0)
    gross_weight: float | None = Field(default=None, ge=0)
    net_weight: float | None = Field(default=None, ge=0)
    gross_weight_kg: float | None = Field(default=None, ge=0)
    net_weight_kg: float | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, max_length=32)
    notes: str | None = None


class PackingListContainerCreate(BaseModel):
    """Add a container under a packing list."""

    container_number: str = Field(..., min_length=1, max_length=64)
    container_type: str | None = Field(default="40GP", max_length=32)
    seal_number: str | None = Field(default=None, max_length=64)
    tare_weight_kg: float | None = Field(default=None, ge=0)
    max_weight_kg: float | None = Field(default=None, ge=0)
    loading_status: str | None = Field(default="EMPTY", max_length=32)
    notes: str | None = None


class ShipmentContainerCreate(BaseModel):
    shipment_id: int
    packing_list_id: int | None = None
    container_number: str = Field(..., min_length=1, max_length=64)
    container_type: str | None = Field(default=None, max_length=32)
    seal_number: str | None = Field(default=None, max_length=64)
    tare_weight_kg: float | None = Field(default=None, ge=0)
    max_weight_kg: float | None = Field(default=None, ge=0)
    loading_status: str | None = Field(default="EMPTY", max_length=32)
    notes: str | None = None


class ShipmentContainerUpdate(BaseModel):
    container_number: str | None = Field(default=None, max_length=64)
    container_type: str | None = Field(default=None, max_length=32)
    seal_number: str | None = Field(default=None, max_length=64)
    tare_weight_kg: float | None = Field(default=None, ge=0)
    max_weight_kg: float | None = Field(default=None, ge=0)
    loading_status: str | None = Field(default=None, max_length=32)
    notes: str | None = None


class ShipmentContainerResponse(BaseModel):
    id: int
    tenant_id: int
    shipment_id: int
    packing_list_id: int | None = None
    container_number: str
    container_type: str | None = None
    seal_number: str | None = None
    tare_weight_kg: float | None = None
    max_weight_kg: float | None = None
    remaining_capacity_kg: float | None = None
    loading_status: str
    loaded_at: str | None = None
    notes: str | None = None
    created_at: str
    updated_at: str


class PackingListResponse(BaseModel):
    id: int
    tenant_id: int
    packing_list_number: str
    shipment_id: int | None = None
    shipment_reference: str | None = None
    order_id: int | None = None
    order_code: str | None = None
    delivery_challan_id: int | None = None
    challan_code: str | None = None
    packing_date: str | None = None
    total_cartons: int
    gross_weight: float | None = None
    net_weight: float | None = None
    gross_weight_kg: float | None = None
    net_weight_kg: float | None = None
    status: str
    notes: str | None = None
    container_count: int = 0
    containers: list[ShipmentContainerResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str
