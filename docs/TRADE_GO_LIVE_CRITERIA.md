# Trade Module Go-Live Criteria

Use this document for the go/no-go decision before enabling the Trade (export/import) module in production.

## Gates

### 1. UAT complete

- [ ] **TRADE_UAT_CHECKLIST.md** has been executed and all applicable steps passed.
- [ ] Sign-off section is filled (Test lead and/or Product).
- [ ] Trade finance linkage cases `TRADE-UAT-009` to `TRADE-UAT-013` are passed (cost center link, BTB cap/bands, lifecycle posting, voucher traceability, alerts).

### 2. Configuration and access

- [ ] Tenant types that should see Trade have `buying_house` or `both`; manufacturer-only tenants do not see Trade Cases / Control Tower / Logistics.
- [ ] Roles and permissions for Trade Case create/edit and document upload are assigned correctly.
- [ ] Stage flow (e.g. required documents per stage) matches business rules and has been validated in UAT.

### 3. Data and storage

- [ ] Trade document storage path (`media/trade_docs/` or configured S3) is included in backup/restore procedures.
- [ ] No sensitive test data left in production tenant(s) if reusing same DB.

### 4. Operations and support

- [ ] **TRADE_MODULE_SOP.md** has been read by support/ops; troubleshooting section is known.
- [ ] Known limitations (e.g. local file storage, single-node) are accepted or a plan for S3/multi-node is in place.
- [ ] Finance team confirms CoA mapping for BTB lifecycle postings (LC liability, blocked facility, import bill liability, payment account).

### 5. Rollback

- [ ] Rollback plan is clear: disable menu visibility for Trade (e.g. tenant type or feature flag) and/or revert deployment; existing Trade Case data remains in DB for later re-enable.

---

## Go / No-Go

| Decision | Date | Authority |
|----------|------|-----------|
| ☐ Go     |      |           |
| ☐ No-Go  |      |           |

If **No-Go**, record reason and target date for next review:

- Reason: _______________________
- Next review: _______________________
