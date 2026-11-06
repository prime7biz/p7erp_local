# Bangladesh RMG HR — operations runbook

Covers the Bangladesh HR system added on 2026-11-07: preset, rule sets and enforcement, employee numbering and identity,
photos / CVs / biometric references, gate passes, manual attendance, payroll registers, cases and separation, allowances
and bonuses. Source evidence: `docs/hr-compliance/BD_RMG_SOURCE_MANIFEST_2026.md`.

All backend commands run inside Docker (`docker compose exec backend ...`).

## 1. What ships, and what is on by default

| Area | Default | How it is switched |
|---|---|---|
| Bangladesh setup (preset), rule sets, previews | Available; nothing changes until someone clicks **Configure for Bangladesh** | HR → Bangladesh Setup |
| Employee numbers (`EMP-` + 7 digits, never reused) | On for every company (new employees get the next number; existing codes are kept) | HR Settings → Employee number format |
| Identity rule (mobile + NID or birth registration) | Off until the preset sets `hr_bd_identity_required` | Preset; admin can set it `false` in tenant flags |
| Enforcement: minimum wage, earned-leave accrual, maternity, festival-day work, service benefits | **Off** (strict: only an explicit `true` turns them on) | HR → Bangladesh Rules → Enforcement (manager / admin, needs an approved rule set covering today) |
| Tiffin / dinner / night bills, production bonus, Eid / festival bonus | **Off** | Settings → Configuration (`hr_meal_night_bills_enabled`, `hr_production_bonus_enabled`, `hr_festival_bonus_enabled`) |
| Photos, CVs, biometric consent, gate passes, manual attendance, registers, cases, separations | Available to roles with the matching permission | Settings → Roles |

The five enforcement flags, the preset marker `hr_bd_rmg_preset` and `hr_employee_number_format` can only be changed
through their own HR endpoints. **Settings → Configuration** keeps their stored values (it cannot switch enforcement on
without the approved-rule-set check and audit entry).

New permission keys (missing key = allowed for manager / admin paths; explicit `false` denies):
`hr.identity.manage`, `hr.biometric.manage`, `hr.gate_pass.manage`, `hr.gate_pass.scan`, `hr.discipline.manage`,
`hr.final_settlement.manage`, `hr.allowance.manage`, `hr.production_bonus.manage`, `hr.bonus.manage`.

## 2. Environment variables (backend, worker, beat)

| Variable | Default | Notes |
|---|---|---|
| `HR_FILE_ENCRYPTION_KEY` | empty | Fernet key for HR photos and documents. Empty = a key derived from `JWT_SECRET`. |
| `HR_CLAMAV_HOST` | empty | Optional `host:port` of a ClamAV daemon. When set, uploads are scanned and refused if the scanner is down. |

Both are passed through `docker-compose.prod.yml`. Nothing else is required to start the app.

> **Important:** decide the HR file key **before the first photo or CV is uploaded** and never change it afterwards.
> If `HR_FILE_ENCRYPTION_KEY` stays empty, rotating `JWT_SECRET` later makes every stored HR file unreadable. Generate a
> key once with
> `docker compose exec backend python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`,
> put it in the live `.env`, and keep a copy in the company's password vault. Files are stored under
> `MEDIA_ROOT/<tenant_id>/hr_secure/` (the `backend_media` volume), which must be included in backups.

## 3. Migrations

| Revision | Adds |
|---|---|
| `282_hr_bd_rule_sets_wage_rates` | `hr_bd_rule_sets`, `hr_bd_wage_schedule_rates` |
| `283_hr_bd_enforcement_ledgers` | wage-grade assignments, maternity cases, leave-accrual entries, festival-work entries, service-benefit cases |
| `284_hr_employee_identity_biometrics` | `hr_employees.birth_registration_no`, `hr_employees.photo_path` (nullable), privacy consents, biometric enrollments; index built `CONCURRENTLY` |
| `285_hr_employee_gate_passes` | gate passes and gate events |
| `286_hr_cases_separation_settlement` | cases and case events, separations, clearance items, final settlements, payroll document snapshots, payment acknowledgements |
| `287_hr_allowances_bonuses` | allowance rules / entries, production bonus schemes / entries, festival bonus lines (+ `final_settlement_id` on festival-work entries) |

All are additive. Every new tenant table has the `p7_tenant_isolation` RLS policy in its own migration.

Apply (local first, then production during the normal deploy): `docker compose exec backend alembic upgrade head`.

## 4. Rollout order (per company)

1. Deploy with every flag off. Check `/health`, HR → Employees, HR → Payroll → Runs.
2. Set `HR_FILE_ENCRYPTION_KEY` (section 2) before anyone uploads a photo.
3. HR → Bangladesh Setup → **Configure for Bangladesh**. Review conflicts.
4. HR → Bangladesh Rules → create and approve the official rule set (manager / admin).
5. Run **Checks & calculators**; assign wage grades; fix minimum-wage gaps.
6. Get the human compliance sign-off in section 7 of the source manifest.
7. Switch on enforcement **one area at a time**, starting with minimum wage, and watch the next payroll run.
8. Turn on allowances / bonuses in Settings → Configuration only when the company's rules are agreed.

## 5. Rollback

From the smallest to the largest step:

1. **Switch an area off** — HR → Bangladesh Rules → Enforcement (or Settings → Configuration for allowances / bonuses).
   Takes effect immediately; nothing is deleted.
2. **Undo the preset** — not needed: it only adds rows. Unused designations / structures can be deactivated by hand.
   Records already used by employees or payroll must stay for history.
3. **App rollback** — pin the previous images in the server `.env` (`BACKEND_IMAGE`, `FRONTEND_IMAGE`) and
   `docker compose -f docker-compose.prod.yml up -d`. The new tables are ignored by the old code.
4. **Schema rollback** — **take a database backup first** (`scripts/db_backup.sh`), then
   `docker compose exec backend alembic downgrade 281` (or one revision at a time with `alembic downgrade -1`).
   Downgrading **drops** the new tables and the two employee columns, which permanently deletes photos' links, birth
   registration numbers, consents, cases, settlements, gate logs, allowance and bonus entries. Use only when the data is
   expendable or restored from the backup. Posted settlement vouchers stay in Finance; reverse them there first.

## 6. Day-to-day checks

- **Missing OUT** list (HR → Manual IN / OUT) must be empty before payroll is finalized; open days block finalization.
- **Biometric deletion tasks**: withdrawn consents create a task to delete the person from the terminal; confirm it in the
  employee's Photo & biometrics tab.
- Audit actions to watch: `HR_BD_ENFORCEMENT_CHANGED`, `HR_BD_RULE_SET_APPROVED`, `HR_FINAL_SETTLEMENT_POSTED`,
  `HR_FINAL_SETTLEMENT_REVERSED`, `HR_PAYROLL_DOCUMENTS_FROZEN`, `HR_EMPLOYEE_DOCUMENT_DOWNLOADED`.

## 7. Tests

```powershell
docker compose exec backend pytest tests/test_hr_bd_source_manifest.py tests/test_hr_bd_preset.py tests/test_hr_bd_calculations.py tests/test_hr_bd_rules.py tests/test_hr_bd_enforcement.py -q
docker compose exec backend pytest tests/test_hr_employee_onboarding.py tests/test_hr_employee_gate_pass.py tests/test_hr_manual_attendance.py -q
docker compose exec backend pytest tests/test_hr_salary_register.py tests/test_hr_employee_cases.py tests/test_hr_final_settlement.py tests/test_hr_allowances_bonuses.py tests/test_hr_payroll_structure_editor.py -q
docker compose exec backend pytest tests/test_route_permission_inventory.py tests/test_rls_policies.py -q
```
