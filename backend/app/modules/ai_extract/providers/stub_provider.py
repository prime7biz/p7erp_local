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

    async def extract_order_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes
        del content_type
        return {
            "style_ref": "ST-ORDER-DEMO-01",
            "quantity": 12000,
            "order_date": "2026-03-01",
            "delivery_date": "2026-09-30",
            "shipping_term": "FOB",
            "commission_mode": "INCLUDE",
            "commission_type": "PERCENTAGE",
            "commission_value": "2.5",
            "remarks": "Stub extraction — replace with real PO in production.",
            "buyer_po_number": "PO-778899",
            "po_date": "2026-02-28",
            "_confidences": {
                "style_ref": 0.82,
                "quantity": 0.91,
                "delivery_date": 0.88,
                "shipping_term": 0.79,
                "buyer_po_number": 0.85,
            },
            "_unmapped_text": ["Payment: TT 30 days"],
            "_warnings": ["Confirm ex-factory vs delivery date with buyer."],
        }

    async def extract_lc_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes
        is_pdf = "pdf" in content_type.lower()
        return {
            "reference": "ELC-2026-DEMO-001",
            "lc_number": "ELC-2026-DEMO-001",
            "issuing_bank": "Demo Issuing Bank Ltd",
            "contract_type": "EXPORT_LC",
            "amount": "50000.00",
            "currency": "USD",
            "buyer_name": "Nordic Apparel AB",
            "bank_name": "Demo Issuing Bank Ltd",
            "issue_date": "2026-01-15",
            "expiry_date": "2026-08-15",
            "shipment_date": "2026-08-20",
            "applicant": "Nordic Apparel AB",
            "beneficiary": "Prime Garments Ltd",
            "port_of_loading": "Chittagong",
            "port_of_discharge": "Hamburg",
            "partial_shipment_allowed": "YES",
            "transshipment_allowed": "NO",
            "documents_required": "Commercial invoice, Packing list, BL, Certificate of origin",
            "special_instructions": "3rd party inspection required before shipment.",
            "incoterms": "FOB",
            "notes": "Stub LC extract — Transshipment not allowed. Confirm against original SWIFT/MT700.",
            "order_value_hint": "52000",
            "order_delivery_date_hint": "2026-08-20",
            "_confidences": {
                "reference": 0.9,
                "lc_number": 0.9,
                "amount": 0.88,
                "currency": 0.95,
                "buyer_name": 0.82,
                "bank_name": 0.8,
                "expiry_date": 0.85,
                "shipment_date": 0.8,
            },
            "_unmapped_text": ["Partial shipment allowed" if is_pdf else "Scanned LC footer"],
            "_warnings": ["Soft stub extraction — review all fields before saving."],
        }

    async def extract_shipping_doc_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes
        is_pdf = "pdf" in content_type.lower()
        return {
            "reference": "SHIP-2026-DEMO-01",
            "carrier": "Maersk Demo Line",
            "shipping_line": "Maersk Demo Line",
            "booking_ref": "BK-778899",
            "bl_awb": "MAEU1234567890",
            "bl_number": "MAEU1234567890",
            "vessel_name": "MAERSK DEMO",
            "etd": "2026-04-10",
            "eta": "2026-05-02",
            "origin_port": "Chittagong",
            "dest_port": "Hamburg",
            "port_of_loading": "Chittagong",
            "port_of_discharge": "Hamburg",
            "container_number": "MSCU1234567",
            "freight_terms": "PREPAID",
            "notify_party": "Nordic Apparel AB",
            "consignee": "Nordic Apparel AB",
            "notes": "Stub shipping extract — verify against BL/AWB.",
            "_confidences": {
                "reference": 0.86,
                "carrier": 0.8,
                "booking_ref": 0.84,
                "bl_awb": 0.91,
                "etd": 0.78,
                "eta": 0.76,
                "origin_port": 0.88,
                "dest_port": 0.87,
                "container_number": 0.9,
            },
            "_unmapped_text": ["Freight prepaid" if is_pdf else "Stamp unclear"],
            "_warnings": ["Soft stub extraction — review all fields before saving."],
        }

    async def extract_packing_list_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes
        del content_type
        return {
            "reference": "PL-2026-DEMO-01",
            "carton_numbers": "1-120",
            "total_cartons": "120",
            "quantities_per_carton": "4",
            "total_quantity": "500",
            "style_breakdown": "S-DEMO: 500 pcs",
            "net_weight_kg": "480",
            "gross_weight_kg": "520",
            "dimensions_cm": "60x40x40",
            "order_quantity_hint": "480",
            "header_cartons_hint": "120",
            "notes": "Stub packing list extract.",
            "_confidences": {
                "total_cartons": 0.9,
                "total_quantity": 0.88,
                "net_weight_kg": 0.8,
            },
            "_unmapped_text": [],
            "_warnings": ["Soft stub packing list — validate against order qty."],
        }

    async def extract_vendor_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes
        is_pdf = "pdf" in content_type.lower()
        return {
            "vendorDisplayName": "Global Fabrics Trading",
            "legalName": "Global Fabrics Trading Ltd.",
            "tradeName": "GFT Supply",
            "contactPerson": "Rahim Karim",
            "designation": "Sales Manager",
            "email": "rahim@gft-supply.example",
            "phone": "+880-2-9998877",
            "mobile": "+8801711002200",
            "website": "https://gft-supply.example",
            "addressLine1": "Plot 12, Sector 4",
            "city": "Dhaka",
            "stateOrRegion": "Dhaka Division",
            "postalCode": "1230",
            "country": "Bangladesh",
            "taxId": "BIN-445566",
            "registrationNumber": "C-102938",
            "vendorType": "foreign",
            "defaultCurrency": "USD",
            "paymentTermsDays": 45,
            "paymentTerms": "Net 45 days",
            "incoterms": "FOB",
            "shippingTerms": "Air / sea as agreed",
            "leadTimeNotes": "Sample 2–3 weeks; bulk 60–75 days",
            "bankName": "Demo Bank Ltd",
            "bankAccountTitle": "Global Fabrics Trading Ltd.",
            "bankAccountNo": "0192837465",
            "swiftCode": "DEMOBDDH",
            "iban": "",
            "complianceStatus": "documents_pending",
            "complianceReferenceNumbers": "TL-2025-001",
            "certificationsSummary": "OEKO-TEX requested",
            "onboardingStatus": "in_progress",
            "remarks": "Preferred for knits" if is_pdf else "Scanned supplier profile",
            "_confidences": {
                "vendorDisplayName": 0.92,
                "legalName": 0.88,
                "email": 0.9,
                "bankAccountNo": 0.72,
            },
            "_unmapped_text": ["ISO certificate mentioned but number unclear"],
            "_warnings": ["Verify SWIFT with finance before first payment."],
        }

    async def extract_hr_cv_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes, content_type
        return {
            "full_name": "Karim Rahman",
            "first_name": "Karim",
            "last_name": "Rahman",
            "date_of_birth": "1990-05-15",
            "gender": "MALE",
            "national_id": "1990123456789",
            "phone": "+8801712345678",
            "email": "karim.rahman@example.com",
            "address_line": "House 10, Road 5, Mirpur",
            "city": "Dhaka",
            "country": "Bangladesh",
            "education": [{"degree": "BSc", "institution": "DU", "year": "2012", "grade": "3.5"}],
            "work_experience": [
                {
                    "company": "Demo Garments",
                    "position": "Supervisor",
                    "from_date": "2018-01",
                    "to_date": "2024-12",
                    "responsibilities": "Line supervision",
                }
            ],
            "skills": ["sewing", "quality"],
            "languages": ["Bengali", "English"],
            "_confidences": {"full_name": 0.95, "date_of_birth": 0.9, "national_id": 0.88},
            "_unmapped_text": [],
            "_warnings": [],
        }

    async def extract_hr_national_id_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes, content_type
        return {
            "name": "Karim Rahman",
            "name_bangla": "করিম রহমান",
            "father_name": "Abdul Rahman",
            "mother_name": "Fatema Begum",
            "date_of_birth": "1990-05-15",
            "national_id": "1990123456789",
            "address": "Mirpur, Dhaka",
            "blood_group": "B+",
            "issue_date": "2018-01-01",
            "_confidences": {"national_id": 0.96, "date_of_birth": 0.94},
            "_unmapped_text": [],
            "_warnings": [],
        }

    async def extract_hr_medical_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes, content_type
        return {
            "employee_name": "Karim Rahman",
            "examination_date": "2026-01-10",
            "expiry_date": "2027-01-10",
            "fitness_status": "FIT",
            "conditions": [],
            "restrictions": [],
            "doctor_name": "Dr. A. Hossain",
            "doctor_registration": "BMDC-12345",
            "hospital_clinic": "City Clinic",
            "height_cm": 170,
            "weight_kg": 68,
            "blood_pressure": "120/80",
            "vision": "6/6",
            "hearing": "NORMAL",
            "_confidences": {"fitness_status": 0.92, "examination_date": 0.9},
            "_unmapped_text": [],
            "_warnings": [],
        }

    async def extract_hr_birth_certificate_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        del file_bytes, content_type
        return {
            "name": "Karim Rahman",
            "date_of_birth": "1990-05-15",
            "father_name": "Abdul Rahman",
            "mother_name": "Fatema Begum",
            "birth_registration_number": "BR-1990-001234",
            "place_of_birth": "Dhaka",
            "issue_date": "1990-06-01",
            "_confidences": {"date_of_birth": 0.97, "birth_registration_number": 0.85},
            "_unmapped_text": [],
            "_warnings": [],
        }
