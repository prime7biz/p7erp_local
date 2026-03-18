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

