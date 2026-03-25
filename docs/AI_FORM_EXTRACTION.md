# AI-assisted document → form autofill

Stateless extraction: uploaded files are **not** stored on disk or in the database. Bytes are processed in memory and discarded.

## API (authenticated, tenant-scoped)

Base path: `/api/v1/ai-extract` (same prefix as other v1 routes).

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/customer-form` | `multipart/form-data` field `file` | `CustomerExtractionResponse` |
| `POST` | `/inquiry-form` | `multipart/form-data` field `file` | `InquiryExtractionResponse` |

**Allowed types:** `image/png`, `image/jpeg`, `image/jpg`, `image/webp`, `application/pdf`  
**Max size:** 10 MB  
**Rate limit:** Uses the same **heavy** bucket as `ai-tool` (`ai_rate_limit_heavy_per_window`).

### Response shapes (summary)

- **Customer:** `success`, `document_type`, `fields` (map of field key → `{ value, confidence, source_text? }`), `unmapped_text[]`, `warnings[]`, `duplicate_warnings[]` (possible existing customers by email/name).
- **Inquiry:** same idea plus `items[]` (garment lines), `candidate_matches` (`customer` / `style` ranked suggestions from master data).

Default provider is a **stub** (`StubExtractionProvider`) for development. Replace via `BaseExtractionProvider` in `backend/app/modules/ai_extract/service.py` when wiring OCR/LLM.

## Frontend

| Area | Location |
|------|----------|
| Upload + extract UI | `CustomerCreatePage`, `InquiryCreatePage` (create flow) |
| Reusable widgets | `frontend/src/components/ai-extract/` |
| Hook | `frontend/src/hooks/useDocumentExtraction.ts` |
| Types + helpers | `frontend/src/types/extraction.ts`, `frontend/src/utils/extractionHelpers.ts` |
| API client | `api.extractCustomerForm`, `api.extractInquiryForm` in `frontend/src/api/client.ts` |

## Manual test checklist

1. Log in, select tenant, open **New customer**.
2. Upload a small PNG/JPEG/PDF → **Extract data** → review panel shows fields; apply one field → input gets left-border highlight.
3. **Clear imported data** clears extraction state (form values stay unless user changed them).
4. Open **New inquiry** → upload file → suggested customer/style buttons set IDs without auto-creating records.
5. **Save** only persists when using the normal Save button (extraction never auto-saves).

## Next steps (engineering)

1. Add `OpenAIExtractionProvider` (or similar) behind settings/env; keep stub for offline dev.
2. Add PDF text extraction library for text-layer PDFs; route scanned PDFs to vision API.
3. Tighten duplicate detection (normalized phone, fuzzy legal name).
4. Optional: accept pasted email/HTML for buyer inquiry parsing.
