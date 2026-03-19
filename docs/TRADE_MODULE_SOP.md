# Trade Module SOP

This SOP explains how to run export/import work in a paper-free workflow using Trade Cases.

## 1) Create Trade Case

1. Open `App -> Trade Cases`.
2. Click **Create Trade Case**.
3. Set:
   - Direction (`EXPORT` or `IMPORT`)
   - Reference
   - Optional links (`order_id`, `proforma_invoice_id`, `vendor_id`)
4. Save.

## 2) Add Shipment

1. Open `App -> Logistics`.
2. Select the Trade Case.
3. Enter shipment reference, status, ETD/ETA, carrier, BL/AWB.
4. Save and update status as shipment progresses.

## 3) Upload Documents

1. Open Trade Case detail page.
2. In **Documents**, choose document type (`PI`, `LC`, `INVOICE`, `PACKING_LIST`, `BL`, `COO`, `BOOKING_CONFIRM`).
3. Upload file.
4. Repeat for all required document types.

## 4) Stage Transition

1. Open Trade Case detail.
2. In **Stage Transition**, choose next stage.
3. Click **Move Stage**.
4. If blocked, upload missing documents shown by validation error.

## 5) Monitor Risks

1. Open `App -> Trade Control Tower`.
2. Review:
   - Missing docs cases
   - Overdue shipment count
   - At-risk case list
3. Open each case and correct data/status/documents.

## 6) Close and Settle

1. Ensure shipment is completed.
2. Move stage to `SETTLED`.
3. Verify margin panel and stage log are complete.
4. Confirm activity appears in audit logs.

## 7) UAT Scenario

Minimum UAT flow:
1. Create Trade Case from order/PI.
2. Create one shipment.
3. Upload required docs.
4. Transition through stages up to `SHIPPED`.
5. Resolve one related alert.
6. Move to `SETTLED`.

See **docs/TRADE_UAT_CHECKLIST.md** for a full numbered UAT checklist and **docs/TRADE_GO_LIVE_CRITERIA.md** for go/no-go gates.

---

## 8) Production storage (trade documents)

- **Current behaviour:** Trade document uploads are stored on the app server under `media/trade_docs/` (see `backend/app/modules/trade_case/router.py` – `TRADE_DOCS_DIR`).
- **Production option:** For production, you can configure object storage (e.g. S3 or S3-compatible) via environment variables. Example future settings (when implemented): `TRADE_DOCS_BACKEND=s3`, `TRADE_DOCS_BUCKET=your-bucket`, and credentials. Until then, ensure `media/trade_docs/` is backed up and, if scaling to multiple app nodes, consider a shared volume or migrating to S3.
- **SOP:** Include `media/trade_docs` in your backup and restore procedures (see Backup & Restore in Settings).

---

## 9) Advanced flows

- **Multiple shipments:** One Trade Case can have several shipments. Add each in Logistics; documents can be attached at case level or referenced per shipment. Control Tower shows at-risk cases across all shipments.
- **LC amendments:** If an LC is amended, update the linked BTB LC or case notes. Stage flow does not block on LC amendment; ensure documents reflect the current LC.
- **Partial shipment / split:** Create separate shipments for each leg or partial; use the same case and update stage when the main commercial docs apply to the case.

---

## 10) Troubleshooting

| Issue | What to check |
|-------|----------------|
| Cannot move stage | Required documents for the next stage are missing. Check validation message and upload the listed types (e.g. PI, LC, BL, INVOICE, PACKING_LIST). |
| Trade Cases / Control Tower / Logistics not visible | Tenant type must be `buying_house` or `both`. Manufacturer-only tenants do not see these menu items. |
| Document upload fails | Ensure file size and type are within limits; check server disk space for `media/trade_docs/`. |
| Alerts not updating | Control Tower and alerts are evaluated on load; refresh the page. For scheduled evaluation, ensure alert rules cron/job is running. |
| Margin not showing | Enter cost and value (or link PI/order); margin panel calculates from case and linked order data. |

