"""Pydantic schemas for logistics shipments."""

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
