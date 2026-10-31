# HR Compliance + AI Documents (Sprint H1)

Buyer-audit and labor-law features for BSCI / WRAP / SEDEX tracking, HR OCR, PDF generation, and AI insights.

## Enable feature flags

All flags default **off**. Set on `tenants.feature_flags` (Settings or SQL):

| Flag | Purpose |
|------|---------|
| `compliance_tracking_enabled` | Frameworks, requirements, scores, audit readiness |
| `age_verification_required` | DOB required; age &lt; 15 blocks hire |
| `medical_certificate_tracking_enabled` | Medical CRUD + expiry Celery job |
| `ocr_cv_extraction_enabled` | AI extract CV |
| `ocr_id_extraction_enabled` | National ID + birth certificate OCR |
| `ocr_medical_extraction_enabled` | Medical certificate OCR |
| `auto_document_generation_enabled` | ID card / letters / payslip PDF |
| `ai_attendance_analysis_enabled` | Attendance patterns |
| `ai_turnover_prediction_enabled` | Turnover risk |
| `ai_payroll_anomaly_detection_enabled` | Payroll anomalies |
| `ai_compliance_risk_prediction_enabled` | Pre-audit risk |

## Migrations

```powershell
docker compose exec backend alembic upgrade head
```

Revisions **224–229** add compliance frameworks/requirements/records, age verifications, medical records, and AI analysis cache.

## Activate frameworks

1. Open **HR → Compliance** (`/app/hr/compliance`).
2. Activate system templates (**BSCI**, **WRAP**, **SEDEX**) — copies requirements into the tenant.
3. Create / update employee compliance records with evidence; view **score** and **audit readiness**.

## Age verification

- On employee create/update when `age_verification_required` is on: DOB required; age &lt; 15 → HTTP 400.
- Employee detail → **Age verification** tab, or API under `/api/v1/hr/compliance/employees/{id}/age-verifications`.
- Ages 15–17 → `YOUNG_WORKER` (light work only unless notes mention light work).

## Medical certificates

- Employee detail → **Medical** tab.
- Daily Celery task `hr.medical_certificate_expiry` alerts at 30/15/7 days (fail-closed).

## OCR onboarding

- `/app/hr/employees/ai-onboard` — upload CV/NID/birth/medical, review fields, then **Confirm & create** (never auto-saves).
- APIs: `POST /api/v1/ai-extract/hr/cv` (and national-id, medical-certificate, birth-certificate).

## PDF documents

Requires `auto_document_generation_enabled`. From employee detail **Generate document**, or:

- `POST /api/v1/hr/employees/{id}/documents/id-card`
- `.../appointment-letter`, `.../age-verification-cert`, `.../payslip?run_id=`
- Bulk: `POST /api/v1/hr/employees/bulk-documents/id-cards` (ZIP)

Payslip download from payroll also returns real PDF (`reportlab`).

## AI insights

- `/app/hr/ai-insights`
- `GET /api/v1/ai-tool/hr/attendance-analysis`
- `GET /api/v1/ai-tool/hr/turnover-risk`
- `GET /api/v1/ai-tool/hr/payroll-anomalies?run_id=`
- `GET /api/v1/ai-tool/hr/compliance-risk?framework_id=`

Heuristics first; optional LLM narrative when OpenRouter/Gemini is configured.

## Soft permissions

Missing key ⇒ allow. Explicit `false` denies:

- `hr.compliance.view` / `hr.compliance.manage`
- `hr.ocr.use` / `ai.hr_extract`
- `hr.ai.insights.view`
- `hr.documents.generate`
- `hr.age_verification.verify`
- `hr.medical.manage`

## Rollback

1. Turn flags off.
2. `docker compose exec backend alembic downgrade 223` (drops 224–229 tables).

## Tests

```powershell
docker compose exec backend pytest tests/test_hr_compliance_h1.py -q
```
