"""Demo extraction without external AI — exercises UI states."""

from __future__ import annotations

from typing import Any

from app.modules.ai_extract.providers.base import BaseExtractionProvider


class StubExtractionProvider(BaseExtractionProvider):
    """Returns realistic structured data for development and tests."""

    async def extract_customer_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes
        is_pdf = "pdf" in content_type.lower()
        base: dict[str, Any] = {
            "legalEntityName": "Acme Garments Ltd.",
            "tradeName": "Acme Apparel",
            "taxIdVatNumber": "VAT-BD-998877",
            "website": "www.acme-apparel.com",
            "primaryContactName": "Jane Doe",
            "designation": "Merchandising Manager",
            "contactEmail": "jane.doe@acme-apparel.com",
            "countryCode": "+880",
            "contactPhone": "1711122334",
            "billingAddressLine1": "House 12, Road 4, Gulshan",
            "billingCity": "Dhaka",
            "billingPostalCode": "1212",
            "billingCountry": "Bangladesh",
            "shippingAddressLine1": "",
            "shippingCity": "",
            "shippingPostalCode": "",
            "shippingCountry": "",
            "_confidences": {
                "legalEntityName": 0.96,
                "tradeName": 0.78,
                "taxIdVatNumber": 0.55,
                "website": 0.82,
                "primaryContactName": 0.91,
                "designation": 0.62,
                "contactEmail": 0.94,
                "countryCode": 0.88,
                "contactPhone": 0.79,
                "billingAddressLine1": 0.9,
                "billingCity": 0.87,
                "billingPostalCode": 0.71,
                "billingCountry": 0.85,
            },
            "_unmapped_text": [
                "Registered under Companies Act 1994" if is_pdf else "Scanned business card — footer text",
            ],
            "_warnings": ["Shipping address not found in document; consider Same as billing."],
        }
        return base

    async def extract_inquiry_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes
        del content_type
        return {
            "customer_name_candidate": "H&M Buying Office",
            "customer_code_candidate": "",
            "style_name_candidate": "Mens Crew Neck Tee SS26",
            "style_ref": "ST-2204-B",
            "season": "SS26",
            "department": "Mens Knits",
            "quantity": 50000,
            "target_price": "3.25",
            "target_price_currency": "USD",
            "currency": "USD",
            "exchange_rate": "110.5",
            "expected_delivery_date": "2026-08-15",
            "shipping_term": "FOB",
            "intermediary_name": "Prime Agent Ltd",
            "commission_mode": "INCLUDE",
            "commission_type": "PERCENTAGE",
            "commission_value": "3",
            "notes": "Please confirm fabric quality and lab dips before bulk.",
            "_confidences": {
                "style_ref": 0.88,
                "season": 0.8,
                "department": 0.65,
                "quantity": 0.95,
                "target_price": 0.9,
                "shipping_term": 0.89,
                "customer_name_candidate": 0.74,
                "style_name_candidate": 0.71,
            },
            "_items": [
                {
                    "item_name": "T-Shirt",
                    "description": "100% Cotton, 180 GSM",
                    "quantity": 50000,
                    "confidence": 0.84,
                },
                {
                    "item_name": "Polo",
                    "description": "Pique knit — optional line",
                    "quantity": None,
                    "confidence": 0.41,
                },
            ],
            "_unmapped_text": ["Payment: LC at sight"],
            "_warnings": ["Could not confirm buyer reference number."],
        }
