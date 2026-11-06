import type { TutorialSection } from "../types";

const S = "/tutorials/screens";
const V = "/tutorials/videos";
const D = "/tutorials/diagrams/export-import";

export const exportImportSection: TutorialSection = {
  id: "export-import",
  title: "Export & Import",
  description:
    "Proforma invoices, master LCs / sales contracts, BTB LCs, export cases, commercial invoices, LC performance, commission, bond & VAT registers, trade cases and logistics.",
  articles: [
    // ---------------------------------------------------------------- Module map
    {
      id: "commercial-overview",
      title: "Export & Import: module map and the export document chain",
      summary:
        "What every screen under Export & Import is for, and the order an RMG export job moves through them: PI, master LC, BTB LC, shipment, documents and realisation.",
      tags: ["commercial", "export", "import", "LC", "BTB", "proforma", "trade", "logistics", "realisation"],
      keywords: [
        "export import",
        "commercial department",
        "LC opening",
        "master LC",
        "back to back LC",
        "BTB",
        "sales contract",
        "PI",
        "proforma",
        "shipment",
        "export documents",
        "realisation",
        "realization",
        "export proceeds",
        "trade case",
      ],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "commercial",
      coverImage: `${S}/commercial.jpg`,
      content: `## Overview

**Export & Import** is where the commercial team runs the paperwork and bank side of every export order: the buyer's **Proforma Invoice (PI)**, the buyer's **Master LC or Sales Contract**, the **BTB LCs** you open for fabric and trims, the **shipment** and its **packing list**, the **export documents**, and finally the **realisation** (the money from the buyer reaching your bank).

Who uses it: commercial officers, export / import executives, merchandisers (to check LC status) and accountants (for vouchers created from these screens).

New to export words like LC, BTB, UD or BL? Read [Export & Import glossary](/app/tutorials/commercial-glossary) first.

## Before you start

- You need **Merchandising / commercial** access to open the **Commercial** screens. **Trade Cases**, **Trade Control Tower** and **Logistics** also need **Trade** access.
- **Trade Cases**, **Trade Control Tower** and **Logistics** appear only for tenant type **buying_house** or **both**, and only while **Settings → Configuration → Enable Trade module** is ticked (tenant flag \`trade_enabled\`). When it is off these three menu items disappear and their links send you back to the dashboard.
- **Commission** and **Bond & VAT registers** each have their own switch in **Settings → Configuration** (**Commission engine**, **Bangladesh bond & VAT registers**). When a switch is off the menu item is hidden.
- Master data you will need: **customers (buyers)**, **confirmed orders**, **vendors (suppliers)**, **purchase orders** for fabric / trims, and **bank accounts** linked to GL ledgers.

## The screens in the sidebar

| Sidebar item | Path | Use it to |
|---|---|---|
| **Commercial** | \`/app/commercial\` | Hub with a card (and record count) for every screen below |
| **Export Cases** | \`/app/commercial/export-cases\` | Keep shipping mode, Incoterms, export licence and dates per order |
| **Master Contracts** | \`/app/commercial/master-contracts\` | Record the buyer's Master Export LC or Sales Contract and watch BTB utilization |
| **Proforma Invoices** | \`/app/commercial/proforma-invoices\` | Make your PI to the buyer (EXPORT) or record a supplier's PI (IMPORT) |
| **Commercial Invoices** | \`/app/commercial/invoices\` | Invoice the goods you shipped (from a posted delivery challan) and record buyer payments |
| **BTB LCs** | \`/app/commercial/btb-lcs\` | Open back-to-back LCs for suppliers and post their accounting |
| **LC Performance** | \`/app/commercial/lc-performance\` | Per master LC: shipped, realised, left to ship, BTB opened, expiry warnings |
| **Commission** | \`/app/commercial/commission\` | Commission you earn and commission you pay agents |
| **Bond & VAT registers** | \`/app/commercial/bd-compliance\` | UD, bond register and Mushak 6.1 / 6.2 / 6.3 / 6.10 / 9.1 working registers |
| **Trade Cases** | \`/app/trade/cases\` | One folder per export/import job with stages and uploaded documents |
| **Trade Control Tower** | \`/app/trade/dashboard\` | At-risk cases, missing documents, overdue shipments |
| **Logistics** | \`/app/logistics\` | Shipments (booking, BL/AWB, ETD/ETA), packing lists and containers |

## Steps — one export order from start to finish

1. **Confirm the order** in Merchandising (see [Quotation to order](/app/tutorials/merch-quotation-to-order)).
2. **Proforma Invoices → Create Proforma Invoice** with **Direction** = EXPORT, tick the order, fill buyer, ports and terms, **Save as Draft**, then **Issue** and **Print** it for the buyer. Guide: [Proforma invoices](/app/tutorials/commercial-proforma-invoices).
3. When the buyer's bank sends the LC (or the buyer signs a sales contract), record it in **Master Contracts**. Guide: [Master LC / sales contract](/app/tutorials/commercial-master-contracts).
4. For fabric and trims bought on credit, open **BTB LCs** under that master contract and record the **Opening**. Guide: [BTB LCs](/app/tutorials/commercial-btb-lcs).
5. (Optional, buying house / both) Create a **Trade Case** for the job and upload PI, LC, booking and shipping documents as they arrive. Guide: [Trade cases](/app/tutorials/trade-cases).
6. Book the shipment in **Logistics → Shipments**, then build the **packing list**. Guides: [Shipments and containers](/app/tutorials/logistics-shipments), [Packing lists](/app/tutorials/logistics-packing-cartons).
7. After the goods leave (posted **delivery challan**), create the **Commercial Invoice** and **Issue** it. Guide: [Commercial invoices](/app/tutorials/commercial-invoices).
8. When the buyer pays, **Record Payment** on the invoice; check progress in **LC Performance**. On BTB maturity, record **Documents Acceptance** and **Realization** for each BTB LC. Guide: [LC performance](/app/tutorials/commercial-lc-performance).

## What happens next

- Issuing a commercial invoice creates a **draft AR voucher**; recording a payment creates a **draft receipt voucher**; each BTB accounting step creates a voucher. Accounts reviews and posts them in **Accounts → Vouchers** (\`/app/accounts/vouchers\`).
- Commercial invoices feed **Mushak 6.2** and **LC Performance**; UD and bond movements feed the **Bond register**.
- Alerts (LC expiry, BTB utilization, missing trade documents) appear in **Merchandising → Critical Alerts** (\`/app/merchandising/alerts\`).

## Tips

- From an **order** detail page you can jump straight to a new PI or a new export case with the order already filled in.
- Link every order to its master contract, otherwise its invoices do not count in **LC Performance**.
- Each list uses one **Actions** button per row (see [Row actions](/app/tutorials/gs-row-actions)).

## Common problems

- **Trade Cases / Logistics missing from the sidebar** → your tenant type is manufacturer-only, or an admin unticked **Enable Trade module**.
- **A count on the Commercial hub shows "—"** → that list could not load (usually no permission). Open the screen to see the message.
- **Bond & VAT registers says "turned off for this company"** → an admin must tick **Bangladesh bond & VAT registers** in **Settings → Configuration**.`,
      infographics: [
        {
          type: "diagram",
          title: "The export document chain",
          caption: "PI → Master LC / Sales Contract → BTB LC → Shipment → Documents → Realisation, and the P7 screen for each step.",
          imageSrc: `${D}/document-chain.svg`,
          imageAlt:
            "Diagram of six boxes in a row: Proforma Invoice, Master LC or Sales Contract, BTB LC, Shipment, Documents and Realisation, with the P7 screen used for each step underneath",
        },
        {
          type: "flow",
          title: "Open each step",
          steps: [
            { label: "Proforma Invoice", href: "/app/commercial/proforma-invoices" },
            { label: "Master LC / Sales Contract", href: "/app/commercial/master-contracts" },
            { label: "BTB LC", href: "/app/commercial/btb-lcs" },
            { label: "Shipment & packing list", href: "/app/logistics" },
            { label: "Commercial invoice", href: "/app/commercial/invoices" },
            { label: "Realisation (LC Performance)", href: "/app/commercial/lc-performance" },
          ],
        },
      ],
      images: [
        {
          src: `${S}/commercial.jpg`,
          alt: "Commercial / Export & Import hub with cards for Export Cases, Master Contracts, Proforma Invoices, Commercial Invoices, Trade Cases, BTB LCs, Trade Control Tower and Logistics",
          caption: "The Commercial hub. The small number on a card is how many records that screen has.",
        },
      ],
      relatedAppRoutes: [
        "/app/commercial",
        "/app/commercial/export-cases",
        "/app/commercial/master-contracts",
        "/app/commercial/proforma-invoices",
        "/app/commercial/invoices",
        "/app/commercial/btb-lcs",
        "/app/commercial/lc-performance",
        "/app/trade/cases",
        "/app/trade/dashboard",
        "/app/logistics",
      ],
      relatedArticleIds: [
        "commercial-glossary",
        "commercial-proforma-invoices",
        "commercial-master-contracts",
        "commercial-btb-lcs",
        "commercial-invoices",
        "trade-cases",
        "merch-pipeline",
      ],
    },

    // ---------------------------------------------------------------- Glossary
    {
      id: "commercial-glossary",
      title: "Export & Import glossary: LC, BTB, UD, UP, EXP, HS code, Mushak, BL and more",
      summary: "Plain-English meaning of the export and import words used on P7 screens, with a link to where each one appears.",
      tags: ["glossary", "LC", "BTB", "UD", "Mushak", "BL", "HS code", "beginner"],
      keywords: [
        "what is LC",
        "what is BTB",
        "letter of credit",
        "back to back",
        "utilization declaration",
        "utilization permission",
        "UP",
        "EXP form",
        "HS code",
        "Mushak 6.1",
        "Mushak 6.2",
        "Mushak 6.3",
        "Mushak 6.10",
        "Mushak 9.1",
        "bill of lading",
        "AWB",
        "commercial invoice",
        "packing list",
        "incoterms",
        "FOB",
        "CIF",
        "TT",
        "realisation",
        "maturity",
        "lien bank",
        "bond",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      audience: "commercial",
      coverImage: `${S}/commercial-bd-compliance.jpg`,
      content: `## Overview

This page explains the words you will see on the **Export & Import** screens. Each entry says what it means in simple words and where it lives in P7 ERP.

## Before you start

Nothing to set up — keep this page open in another tab while you work. The big picture is in [Export & Import module map](/app/tutorials/commercial-overview).

## Money and bank words

| Word | Simple meaning | Where in P7 |
|---|---|---|
| **LC (Letter of Credit)** | A promise from the buyer's bank: "we will pay the exporter if the correct documents arrive on time". | Master Contracts, BTB LCs, Trade Case documents (type **LC**) |
| **Master LC / Export LC** | The LC the buyer opens in your favour for an order or season. It is your security to borrow against. | **Master Contracts**, Type **Master Export LC** |
| **Sales Contract** | A signed contract with the buyer used instead of an LC (often with TT payment). Banks still allow BTB against it. | **Master Contracts**, Type **Sales Contract** |
| **BTB LC (Back-to-Back LC)** | An LC **you** open for a fabric or trims supplier, backed by the master LC. Paid later (on **maturity**) from the export money. | **BTB LCs** |
| **BTB utilization** | Total BTB LCs ÷ master LC value. Banks usually stop new BTB above about 70–75%. | Master Contracts and BTB LCs (band), LC Performance |
| **Lien bank** | The bank that holds your master LC and opens your BTB LCs. | Master Contracts → **Bank Name** |
| **Maturity** | The date the BTB LC must be paid to the supplier's bank. | BTB LCs → **Maturity Date** |
| **TT (Telegraphic Transfer)** | Payment by bank transfer instead of LC (e.g. "TT in Advance", "TT 30 days"). | Proforma Invoice → **Terms of payment** |
| **Realisation** | The export money actually reaching your bank account. | Commercial invoice → **Record Payment**; **LC Performance → Realised** |
| **PI (Proforma Invoice)** | A price offer / advance invoice. The buyer uses your PI to open the LC; suppliers send you their PI to open BTB. | **Proforma Invoices** (EXPORT = ours, IMPORT = supplier's) |

## Shipping and document words

| Word | Simple meaning | Where in P7 |
|---|---|---|
| **Commercial invoice** | The final sales invoice for goods actually shipped. The bank and customs need it. | **Commercial Invoices**; Trade Case document **INVOICE** |
| **Packing list** | Carton-by-carton list: carton numbers, colour, size, pieces, weights, CBM. | **Logistics → Packing Lists**; Trade Case document **PACKING_LIST** |
| **BL (Bill of Lading)** | The shipping line's receipt for sea cargo — proof the goods were loaded. For air cargo it is the **AWB (Air Waybill)**. | Logistics shipment **BL/AWB**; Trade Case document **BL** |
| **COO (Certificate of Origin)** | Paper saying the goods were made in Bangladesh (needed for duty-free entry in many countries). | Trade Case document **COO** |
| **Booking confirmation** | The forwarder / shipping line confirming space on a vessel or flight. | Logistics **Booking Ref**; Trade Case document **BOOKING_CONFIRM** |
| **ETD / ETA** | Estimated time of departure / arrival. | Logistics shipments, Trade Cases |
| **Incoterms (FOB, CIF, CFR, EXW, DDP …)** | Who pays freight and insurance and where the risk passes. **FOB** = you deliver on board at the Bangladesh port; **CIF** = you also pay freight and insurance. | Proforma Invoice → **Terms of shipping**; Export Case → **Incoterms** |
| **HS code** | International product code customs uses to decide duty (e.g. 6109 = knitted T-shirts). | UD → Permitted imports → **HS code** |
| **CBM** | Cubic metres — the volume of your cartons, used for freight. | Packing list carton detail |
| **EXP form** | Bangladesh Bank export form filled for every export shipment so the export proceeds can be tracked. P7 does not create the EXP form; keep its number in the export case or shipment notes. | Export Case → **Export license number** / shipment **Notes** |

## Bond and VAT words (Bangladesh)

| Word | Simple meaning | Where in P7 |
|---|---|---|
| **Bonded warehouse** | Licence that lets an exporter import raw materials without paying duty, as long as they are used in exported goods. | Bond & VAT registers |
| **UD (Utilization Declaration)** | Permission from BGMEA / BKMEA / BEPZA listing what and how much you may import duty-free against one export LC. | **Bond & VAT registers → UD register** |
| **UP (Utilization Permission)** | Paper from the association after export confirming the imported materials were used in the shipped goods; needed to settle the bond at audit. Prepared from your UD and bond records. | Bond register exports (working figures; P7 does not issue UP) |
| **Mushak 6.1** | VAT purchase register — what you bought in the month. | **Mushak 6.1 (purchases)** tab |
| **Mushak 6.2** | VAT sales register — what you sold (exports are zero-rated). | **Mushak 6.2 (sales)** tab |
| **Mushak 6.3** | Tax invoice for each sale. | **Mushak 6.3** link on each 6.2 row |
| **Mushak 6.10** | List of purchases and sales above **BDT 2,00,000** in the month. | **Mushak 6.10 (> 2 lakh)** tab |
| **Mushak 9.1** | Monthly VAT return (due by the 15th of the next month). | **Mushak 9.1 (draft return)** tab |
| **BIN** | Business Identification Number for VAT. | **Settings → Configuration → Finance & costing** |

## Tips

- P7's Mushak tabs are **working registers**. P7 is not NBR-enlisted VAT software and does not produce the NBR e-filing file — your VAT consultant should check figures before filing.
- The e-UD / CBMS customs files are also not produced by P7; use the exports as a checklist.

## Common problems

- **"Which LC do I choose on a BTB LC?"** → always the buyer's master LC or sales contract that the supplier's goods are for.
- **"PI or commercial invoice?"** → PI comes **before** the order is shipped (an offer); the commercial invoice comes **after** shipment (the real bill).`,
      images: [
        {
          src: `${S}/commercial-bd-compliance.jpg`,
          alt: "Bond & VAT registers screen with tabs UD register, Bond register and Mushak 6.1, 6.2, 6.10 and 9.1",
          caption: "UD, bond and Mushak registers live on one screen with a tab for each.",
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Where the words fit",
          caption: "Follow the chain from left to right; the glossary words appear in the box where you use them.",
          imageSrc: `${D}/document-chain.svg`,
          imageAlt: "Export document chain diagram from proforma invoice to realisation",
        },
      ],
      relatedAppRoutes: [
        "/app/commercial",
        "/app/commercial/master-contracts",
        "/app/commercial/btb-lcs",
        "/app/commercial/bd-compliance",
        "/app/logistics",
      ],
      relatedArticleIds: ["commercial-overview", "commercial-bd-registers", "commercial-btb-lcs", "logistics-packing-cartons"],
    },

    // ---------------------------------------------------------------- Proforma invoices
    {
      id: "commercial-proforma-invoices",
      title: "Proforma invoices: create, issue and print a PI (export or supplier PI)",
      summary:
        "Make your PI to the buyer from one or more orders, or record a supplier's PI against a master contract and PO, then issue, print and track payments.",
      tags: ["proforma", "PI", "export", "import", "buyer", "LC", "TT"],
      keywords: ["proforma invoice", "PI", "pro forma", "vendor PI", "supplier PI", "export PI", "advance TT", "print PI", "issue PI"],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      audience: "commercial",
      coverImage: `${S}/commercial-proforma-invoices.jpg`,
      content: `## Overview

A **Proforma Invoice (PI)** is a price offer you send before shipping. The buyer uses it to open the LC or pay TT in advance. P7 keeps two kinds on one list:

- **EXPORT (Our PI to customer)** — made from one or more of your orders.
- **IMPORT (Vendor PI to us)** — a supplier's PI for fabric or trims, linked to the master contract and the purchase order. You need it to open a BTB LC.

Open **Export & Import → Proforma Invoices** (\`/app/commercial/proforma-invoices\`).

## Before you start

- EXPORT PI: the order must exist. An order that is already on an **issued** export PI is hidden from the picker (so it is not invoiced twice).
- IMPORT PI: the **vendor**, the **master contract** and a **purchase order** for that vendor must exist.
- To pre-fill the shipper bank, add your bank in Finance with account number and SWIFT.

## Steps

### A. Make an export PI

1. Click **Create Proforma Invoice**.
2. Under **Flow linkage** leave **Direction** = **EXPORT (Our PI to customer)**.
3. Under **Orders (required)** tick one or more orders. The **Selected** box lists them.
4. Fill **Buyer** (name, address, optional bank details), **Consignee**, **Notify party** and **Beneficiary / Shipper** (your company).
5. Under **Shipping terms & ports** choose **Terms of shipping (INCOTERMS)** (e.g. FOB), **Terms of payment** (LC, TT in Advance, TT 30 days, CAD, DP, DA …), **Currency**, **Shipping country**, **Destination port / airport** and **Shipment port**.
6. Under **Invoice details** enter **Reference** (e.g. PI-2026-001), **Invoice date** and **Amount**.
7. Tick the **Documents to be provided** (Commercial Invoice, Packing List, Bill of Lading, REX, Beneficiary Certificate, Certificate of Origin) and add **Terms and conditions** with **Add term**.
8. Under **Shipper bank** pick **Fill from saved account (optional)** or type account number, branch, bank name, account name, address and SWIFT.
9. Click **Save as Draft**. P7 opens the PI in edit mode.

### B. Issue and print

1. On the saved PI click **Issue**. The status changes from **DRAFT** to **ISSUED** and the order can no longer be picked for another export PI.
2. Click **Print** for the printable PI to send to the buyer.
3. On an issued PI a **Payments** panel shows **PI total**, **Allocated (incl. drafts)**, **Posted paid** and **Outstanding**. For an advance TT, enter **Amount**, **Receipt date**, **Bank account**, **Receivable ledger**, **Currency** and **Exchange rate to base**, then click **Record Payment** — a draft receipt voucher is created for finance to post.

### C. Record a supplier (import) PI

1. **Create Proforma Invoice** → **Direction** = **IMPORT (Vendor PI to us)**.
2. Choose **Master Contract / LC (required)**, **Vendor (required)** and **Purchase order (required)**. The PO list shows only that vendor's POs that are not on another PI.
3. Orders are optional for an import PI. Fill the rest as above and **Save as Draft**, then **Issue**.

### D. Row actions on the list

Each row has a **Print** button and an **Actions** menu: **Edit**, **Create Trade Case** (makes a trade case linked to this PI and opens it) and **Delete** (only while **DRAFT**).

## What happens next

- Record the buyer's LC in [Master Contracts](/app/tutorials/commercial-master-contracts). The edit page has a **Create Master Contract** button that opens that screen.
- An issued **IMPORT** PI can be chosen as **Vendor PI (IMPORT)** when you open a [BTB LC](/app/tutorials/commercial-btb-lcs).
- **Create Trade Case** starts the paperwork folder — see [Trade cases](/app/tutorials/trade-cases).

## Tips

- One export PI can cover several orders of the same buyer (the **Orders** column lists their codes).
- Prices for the later commercial invoice can come from the PI, so keep the PI amount right.

## Common problems

- **Save as Draft / Issue are greyed out** → EXPORT with no order ticked, or IMPORT without master contract, vendor and PO.
- **"Select at least one order."** → tick an order under **Orders (required)**.
- **"Select vendor for import proforma." / "Select master contract / LC for import proforma." / "Select a purchase order for import proforma."** → fill the three **Flow linkage** fields.
- **My order is not in the list** → it is already on an issued export PI. Open that PI instead.
- **Purchase order list says "Select vendor first"** → choose the vendor first.
- **Only EXPORT proforma invoices can record receipt vouchers.** → supplier PIs are paid through the BTB LC, not from the PI.`,
      infographics: [
        {
          type: "steps",
          title: "Export PI in four steps",
          steps: [
            {
              title: "Create and pick orders",
              body: "**Create Proforma Invoice** → Direction **EXPORT** → tick orders.",
              imageSrc: `${S}/commercial-pi-new-form.jpg`,
              imageAlt: "Create Proforma Invoice form with Flow linkage and Orders sections",
              href: "/app/commercial/proforma-invoices/new",
            },
            {
              title: "Supplier PI needs three links",
              body: "Direction **IMPORT** shows **Master Contract / LC**, **Vendor** and **Purchase order** (all required).",
              imageSrc: `${S}/commercial-pi-import-linkage.jpg`,
              imageAlt: "Flow linkage section with Direction IMPORT and the master contract, vendor and purchase order drop-downs",
            },
            {
              title: "Save, Issue, Print",
              body: "**Save as Draft** → **Issue** → **Print**. Issued PIs show the **Payments** panel.",
              imageSrc: `${S}/commercial-pi-issued-payments.jpg`,
              imageAlt: "Edit Proforma Invoice page of an issued PI with the Payments panel",
            },
            {
              title: "Row actions",
              body: "**Print**, then **Actions → Edit / Create Trade Case / Delete**.",
              imageSrc: `${S}/commercial-pi-actions-menu.jpg`,
              imageAlt: "Proforma invoice list with the Actions menu open showing Edit and Create Trade Case",
              href: "/app/commercial/proforma-invoices",
            },
          ],
        },
      ],
      images: [
        {
          src: `${S}/commercial-proforma-invoices.jpg`,
          alt: "Proforma Invoices list with reference, status, direction, amount, currency, orders and master contract columns",
          caption: "EXPORT rows are your PIs; IMPORT rows are supplier PIs. DRAFT can still be deleted, ISSUED is final.",
        },
      ],
      relatedAppRoutes: ["/app/commercial/proforma-invoices", "/app/commercial/proforma-invoices/new"],
      relatedArticleIds: ["commercial-overview", "commercial-master-contracts", "commercial-btb-lcs", "trade-cases", "merch-quotation-to-order"],
    },

    // ---------------------------------------------------------------- Master contracts
    {
      id: "commercial-master-contracts",
      title: "Master LC / sales contract: record the buyer's LC and watch BTB utilization",
      summary:
        "Record each Master Export LC or Sales Contract, keep its status and expiry, and see how much of it is already used by BTB LCs.",
      tags: ["master LC", "sales contract", "export LC", "BTB", "utilization", "lien bank"],
      keywords: ["master contract", "master LC", "export LC", "sales contract", "SC", "contract register", "BTB limit", "LC utilization", "lien"],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      audience: "commercial",
      coverImage: `${S}/commercial-master-contracts.jpg`,
      content: `## Overview

The **Master Contract** is the buyer-side document — a **Master Export LC** or a **Sales Contract**. Every BTB LC you open for suppliers sits under one master contract, so this screen shows how much "room" is left for new BTB LCs.

Open **Export & Import → Master Contracts** (\`/app/commercial/master-contracts\`). The top cards show **Total Master Contracts**, **Active** and **Total Value**.

## Before you start

- Have the LC copy (PDF or photo) or the signed sales contract.
- Know the **lien bank** (the bank holding the LC).

## Steps

### A. Create a master contract

1. (Optional) In **Extract from LC document** click **Upload file**, choose the LC PDF / image, then **Extract data**. Review each field in **Review LC extracted fields** and apply the ones that are right — nothing is saved automatically.
2. Under **Create Master Contract** choose **Type**: **Master Export LC** or **Sales Contract**.
3. Enter **Reference *** (the LC / contract number, e.g. ELC-2026-001) and **Status** (**DRAFT** while waiting, **ACTIVE** once received).
4. Enter **Contract Date**, **Expiry Date**, **Amount**, **Currency** (e.g. USD), **Buyer Name** and **Bank Name** (lien bank).
5. Click **Create Master Contract**.

### B. Check utilization and update

1. In **Master Contract Register** use **All status** and **Utilization: Highest first** to find contracts that are nearly full.
2. Click a row. The side panel shows **Utilization** (used / remaining / total and a coloured band), **Readiness** (cost center **Linked / Missing**, **BTB LC count**, **Maturity due soon**, **Maturity overdue**, **Active alerts**) and **Child BTB LCs**.
3. Change **Type**, **Status**, **Reference**, **Amount**, **Currency** or **Buyer** and click **Save Contract**.
4. **Export CSV** or **Print** the readiness summary for the bank or management.
5. When all shipments are realised, set **Status** to **CLOSED**.

## What happens next

- A **cost center** is created automatically when the contract becomes OPEN / ACTIVE (shown as **Auto on OPEN/ACTIVE** until then). Vouchers for this LC can then be reported together.
- Open [BTB LCs](/app/tutorials/commercial-btb-lcs) and choose this contract as **Master Contract**.
- [LC performance](/app/tutorials/commercial-lc-performance) shows shipped, realised and left to ship for every open contract.

## Tips

- Utilization bands: **Very Good** < 50%, **Good** 50–60%, **Satisfactory** 60–65%, **No Credit Zone** 65–70%, **Red Flag** > 70%.
- Alert badges in the **Alert** column open **Critical Alerts** filtered to that contract.
- Use one master contract per buyer LC (or per sales contract); amendments change the amount on the same record.

## Common problems

- **"Reference is required."** → type the LC / contract number.
- **The register is empty after creating** → check the **All status** filter.
- **Utilization shows "—"** → no amount on the contract, or no BTB LC under it yet.
- **Cost Center shows "Missing"** → set the status to **ACTIVE** and **Save Contract**.`,
      videos: [
        {
          src: `${V}/trade-sales-contract-tour.webm`,
          poster: `${V}/trade-sales-contract-tour-poster.jpg`,
          title: "Record a Master LC / Sales Contract and check BTB utilization",
          caption: "Fills the Create Master Contract form (not saved), then opens a contract to show utilization, readiness and child BTB LCs.",
          durationSeconds: 51,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "BTB utilization bands",
          caption: "Banks usually stop new BTB LCs in the red zone.",
          imageSrc: `${D}/btb-utilization-bands.svg`,
          imageAlt: "Colour bar from 0 to 100 percent: Very Good under 50, Good 50 to 60, Satisfactory 60 to 65, No Credit Zone 65 to 70 and Red Flag above 70",
        },
        {
          type: "steps",
          title: "Register and detail",
          steps: [
            {
              title: "Create",
              body: "Type, **Reference**, status, dates, amount, currency, buyer, lien bank → **Create Master Contract**.",
              imageSrc: `${S}/commercial-master-contracts.jpg`,
              imageAlt: "Create Master Contract form with Extract from LC document upload area",
              href: "/app/commercial/master-contracts",
            },
            {
              title: "Find nearly full contracts",
              body: "**Master Contract Register** → **Utilization: Highest first**.",
              imageSrc: `${S}/commercial-mc-register.jpg`,
              imageAlt: "Master Contract Register table with BTB utilization bars and bands",
            },
            {
              title: "Open the side panel",
              body: "Click a row for utilization, readiness, **Save Contract** and **Child BTB LCs**.",
              imageSrc: `${S}/commercial-mc-drawer.jpg`,
              imageAlt: "Master contract side panel with utilization bar, readiness box and child BTB LC list",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/commercial/master-contracts"],
      relatedArticleIds: ["commercial-overview", "commercial-btb-lcs", "commercial-lc-performance", "commercial-glossary"],
    },

    // ---------------------------------------------------------------- BTB LCs
    {
      id: "commercial-btb-lcs",
      title: "BTB LCs: open a back-to-back LC and post opening, acceptance and payment",
      summary:
        "Open a BTB LC for a supplier under a master contract, keep its status, and record the three accounting steps: opening, documents acceptance and realization.",
      tags: ["BTB", "back to back LC", "import", "supplier", "maturity", "accounting"],
      keywords: ["BTB LC", "back-to-back", "B2B LC", "import LC", "LC opening", "acceptance", "maturity payment", "import bill", "BTB realization"],
      estimatedMinutes: 9,
      lastUpdated: "2026-11-06",
      audience: "commercial",
      coverImage: `${S}/commercial-btb-lcs.jpg`,
      content: `## Overview

A **BTB (back-to-back) LC** is the LC **you** open through your lien bank to pay a fabric or trims supplier. It is backed by the buyer's master LC, and is paid on its **maturity date** — usually from the export money.

Open **Export & Import → BTB LCs** (\`/app/commercial/btb-lcs\`). The cards show **Total BTB LC**, **Open / Draft** and **Total Value**.

## Before you start

- The buyer's **master contract** exists ([guide](/app/tutorials/commercial-master-contracts)).
- The **vendor** exists, ideally with an issued supplier PI (**IMPORT** proforma) and a **purchase order** ([PO guide](/app/tutorials/inv-po-deep)).
- For accounting steps you need finance access; default BTB ledgers are created by the system chart of accounts.

## Steps

### A. Open a BTB LC

1. Under **Open BTB LC** type **Reference *** (e.g. BTB-2026-001) and choose **Status** (usually **DRAFT** until the bank confirms).
2. Choose **Master Contract *** — a **Master utilization** bar appears with used / remaining / total.
3. Choose **Vendor ***. **Vendor PI (IMPORT)** and **Purchase Order** then list only that vendor's records; pick them.
4. Optionally choose **Export PI (optional)** (your PI to the buyer).
5. Enter **LC Date**, **Maturity Date**, **Amount**, **Currency**, **FX Rate to Base** and **Base Amount**.
6. Check the utilization bar. Above 70% it warns **"Red flag: utilization is above 70% and should be blocked by bank policy."**
7. Click **Open BTB LC**.

### B. Keep the status up to date

In the register use the row's **Actions** menu: **Set Draft**, **Set Open**, **Set Amended** (bank changed it) or **Set Closed** (fully paid). Filter by **All status**, **All master contracts** and **All vendors**.

### C. Record the accounting (three steps)

Open **Actions → Accounting** (or **Record LC open**). The drawer shows **Current lifecycle** with links to the **Open Voucher**, **Import Bill Voucher** and **Realization Voucher**.

1. **1) Record Opening** — when the bank opens the LC. Check the date and **Amount**, then **Record Opening**.
2. **2) Record Documents Acceptance** — when the supplier's documents arrive and the bank accepts them. Enter the **maturity date**, voucher date and amount, then **Record Documents Acceptance**.
3. **3) Record Realization** — on maturity, when the bank pays the supplier. Choose **Payment / bank GL** (not needed if the LC's bank account has a GL), date and amount, then **Record Realization**.

Tick **Advanced: override GL accounts** only if your accountant uses different ledgers. Click **Close** to leave the drawer.

The **Lifecycle** column in the register then reads **OPEN** → **DOCUMENTS_ACCEPTED** → **REALIZED**.

## What happens next

- Each step creates a voucher for Accounts to review and post in **Accounts → Vouchers**.
- The **Lifecycle** column and the master contract's **Maturity due soon / overdue** counts update. Unpaid maturities raise alerts.
- **LC Performance** shows **BTB opened** and its % of the master LC.

## Tips

- Open the BTB LC in P7 on the same day the bank opens it, so utilization is always correct.
- Keep **Maturity Date** filled — it drives the due-soon and overdue warnings.

## Common problems

- **"Reference is required." / "Master contract is required." / "Vendor is required."** → fill those three fields.
- **Vendor PI list is empty** → the supplier PI is not saved as **IMPORT** for this vendor, or a different vendor is selected.
- **Accounting step fails** → the default BTB ledgers or the bank GL are missing; ask your accountant to check the chart of accounts or use **Advanced** to choose accounts.
- **Utilization looks too high** → every BTB LC under the contract counts, whatever its status; correct the amount of a wrong or cancelled one.`,
      videos: [
        {
          src: `${V}/trade-btb-lc-tour.webm`,
          poster: `${V}/trade-btb-lc-tour-poster.jpg`,
          title: "Open a BTB LC for fabric or trims",
          caption: "Fills the Open BTB LC form (not saved), then shows the row Actions menu and the Accounting drawer with its three steps.",
          durationSeconds: 49,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Status and accounting",
          caption: "Status: DRAFT → OPEN → AMENDED → CLOSED. Accounting: Opening → Documents Acceptance → Realization, each with its own voucher.",
          imageSrc: `${D}/btb-lc-accounting.svg`,
          imageAlt:
            "Diagram of BTB LC statuses Draft, Open, Amended and Closed, and three accounting boxes: Record Opening, Record Documents Acceptance and Record Realization with their debit and credit accounts",
        },
        {
          type: "steps",
          title: "On the screen",
          steps: [
            {
              title: "Open BTB LC form",
              body: "Reference, master contract, vendor, vendor PI, PO, dates, amount → **Open BTB LC**.",
              imageSrc: `${S}/commercial-btb-lcs.jpg`,
              imageAlt: "Open BTB LC form with Reference, Status, Master Contract, Vendor, Vendor PI, Export PI, Purchase Order and amount fields",
              href: "/app/commercial/btb-lcs",
            },
            {
              title: "Register",
              body: "Master utilization, **Lifecycle**, **Maturity**, cost center and alerts per BTB LC.",
              imageSrc: `${S}/commercial-btb-register.jpg`,
              imageAlt: "BTB LC register table with filters and utilization bars",
            },
            {
              title: "Actions menu",
              body: "**Accounting**, **Record LC open**, **Set Draft / Open / Amended / Closed**.",
              imageSrc: `${S}/commercial-btb-actions-menu.jpg`,
              imageAlt: "BTB LC row Actions menu open",
            },
            {
              title: "Accounting drawer",
              body: "**1) Record Opening**, **2) Record Documents Acceptance**, **3) Record Realization**.",
              imageSrc: `${S}/commercial-btb-accounting.jpg`,
              imageAlt: "BTB LC Accounting drawer with current lifecycle and the three record sections",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/commercial/btb-lcs"],
      relatedArticleIds: ["commercial-master-contracts", "commercial-proforma-invoices", "commercial-lc-performance", "fin-voucher-entry", "inv-po-deep"],
    },

    // ---------------------------------------------------------------- Export cases
    {
      id: "commercial-export-cases",
      title: "Export cases: shipping mode, Incoterms and export licence per order",
      summary: "Create an export case for an order to keep destination, shipping mode, Incoterms, export licence, customs agent and shipment dates in one place.",
      tags: ["export case", "export", "incoterms", "customs", "shipment date"],
      keywords: ["export case", "export file", "export licence", "export license", "customs agent", "C&F agent", "EXP number", "shipping mode"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "commercial",
      coverImage: `${S}/commercial-export-cases.jpg`,
      content: `## Overview

An **Export Case** is a short record per order with the export facts: destination, shipping mode, Incoterms, export licence, customs (C&F) agent and expected / actual shipment dates. It can link to a **Trade Case**.

Open **Export & Import → Export Cases** (\`/app/commercial/export-cases\`).

## Before you start

- The order should be confirmed. Its delivery date limits the expected shipment date.

## Steps

1. Click **Create Export Case** (or, from an order, use the export case link — the order is filled in for you).
2. In **Order** type part of the order code or customer in **Search order code / customer…**, then pick the order. P7 fills **Reference** (\`EXP-<order code>\`), **Expected shipment date** (order delivery date), **Destination country** (customer's country) and **Amount (reference)** when it can.
3. Check **Reference *** and choose **Status** (**DRAFT**, **SUBMITTED**, **APPROVED**, **REJECTED**).
4. Enter **Export license number** (or EXP number), **Destination country**, **Shipping mode** (**AIR**, **SEA**, **ROAD**) and **Incoterms** (**FOB**, **CIF**, **CFR**, **EXW**, **DDP**).
5. Enter **Expected shipment date**, **Actual shipment date** (after it ships), **Customs agent** and **Case date**.
6. Click **Create** (or **Update** when editing). **Cancel** goes back without saving.

## What happens next

- The list shows **Code**, **Status**, **Order ID**, **Trade Case** and **Created**. Use **Actions → Edit**, **View order** or **View trade case**.

## Tips

- Keep the actual shipment date filled — it is the date your team will be asked for most.

## Common problems

- **"Reference is required"** → type a reference.
- **"Expected shipment date must be on or before the order delivery date"** → move the date earlier or agree a new delivery date on the order.
- **"Actual shipment date must be on or after the expected shipment date"** → correct the dates.
- **You see status OPEN on old demo rows** → older records may use OPEN; new ones use the four statuses above.`,
      images: [
        {
          src: `${S}/commercial-export-case-form.jpg`,
          alt: "New Export Case form with order search, reference, status, export license, destination, shipping mode, Incoterms and dates",
          caption: "New Export Case — choose the order first and P7 fills several fields.",
        },
        {
          src: `${S}/commercial-export-cases.jpg`,
          alt: "Export Cases list with code, status, order, trade case and Actions buttons",
          caption: "Export Cases list. Order and trade case numbers are links.",
        },
      ],
      relatedAppRoutes: ["/app/commercial/export-cases", "/app/commercial/export-cases/new"],
      relatedArticleIds: ["commercial-overview", "trade-cases", "logistics-shipments"],
    },

    // ---------------------------------------------------------------- Commercial invoices
    {
      id: "commercial-invoices",
      title: "Commercial invoices: invoice shipped goods and record the buyer's payment",
      summary:
        "Create the commercial invoice from a posted delivery challan, issue it to raise a draft AR voucher, and record each buyer payment (realisation) as a draft receipt.",
      tags: ["commercial invoice", "export", "AR", "receivable", "realisation", "payment"],
      keywords: ["commercial invoice", "CI", "export invoice", "sales invoice", "AR voucher", "receipt", "realisation", "realization", "export proceeds", "price review"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "finance",
      coverImage: `${S}/commercial-invoices.jpg`,
      content: `## Overview

The **Commercial Invoice** is the real bill for goods you shipped. In P7 it is created from a **posted delivery challan**, so quantities match what left the factory. Issuing it raises a **draft AR voucher**; recording payments tracks the **realisation**.

Open **Export & Import → Commercial Invoices** (\`/app/commercial/invoices\`).

## Before you start

- The goods must be on a **posted** delivery challan (**Inventory → Delivery Challans**, \`/app/inventory/delivery-challans\`).
- Each line needs an auditable price: the order's price snapshot, the PI price or a confirmed quotation.
- For payments: a **bank account linked to a GL ledger** and a **receivable** ledger.

## Steps

### A. Create and issue

1. Open the posted delivery challan and click **Create Invoice** there. (If the list is empty, the button **Open delivery challans** takes you there.)
2. Back in **Commercial Invoices**, open the invoice with **Actions → View**.
3. Check the lines: **Description**, **Order**, **Qty**, **Unit price**, **Amount** and **Price source** (SNAPSHOT, PI, QUOTATION or MISSING).
4. Click **Issue invoice** (or **Actions → Issue** on the list). The message **"Issued. Draft AR voucher #… created for finance to post."** appears.
5. Use **Print** for the paper copy, **View challan** and **AR voucher** to jump to linked records.

### B. Record the buyer's payment (realisation)

1. Open an **ISSUED** invoice. The **Payments** box shows **Outstanding** and **Posted paid**.
2. Enter **Amount** (defaults to the outstanding amount), **Receipt date**, **Bank account**, **Receivable ledger** and **Exchange rate to base**.
3. Click **Record Payment**. A **draft receipt** voucher is created; posting it in Accounts makes it count as realised.

### C. Cancel

On an issued invoice click **Cancel** (or **Actions → Cancel**) and confirm.

## What happens next

- Accounts posts the AR voucher and the receipt in **Accounts → Vouchers**.
- Issued invoices count as **Shipped** in [LC performance](/app/tutorials/commercial-lc-performance); posted receipts count as **Realised**.
- Issued invoices appear in **Mushak 6.2 (sales)** as zero-rated exports ([Bond & VAT registers](/app/tutorials/commercial-bd-registers)).

## Tips

- Filter the list by **All statuses** (DRAFT / ISSUED / CANCELLED), date range and **Search customer…**.
- The **Customer party ledger** card on the invoice shows what this buyer owes in total.

## Common problems

- **Issue is greyed out and "Price review required" is shown** → some lines have no auditable price. Fix the order snapshot, PI or quotation price, then try again.
- **"Select bank (with GL) and receivable ledger."** → banks without a GL are disabled; link the bank to a GL in Finance first.
- **"Existing receipt reused."** → you pressed Record Payment twice; P7 kept just one draft.`,
      images: [
        {
          src: `${S}/commercial-invoices.jpg`,
          alt: "Commercial Invoices list with status and date filters and an empty state with an Open delivery challans button",
          caption: "No invoices yet? Start from a posted delivery challan.",
        },
      ],
      infographics: [
        {
          type: "flow",
          title: "From challan to money received",
          steps: [
            { label: "Posted delivery challan", href: "/app/inventory/delivery-challans" },
            { label: "Create Invoice (DRAFT)", href: "/app/commercial/invoices" },
            { label: "Issue → draft AR voucher", href: "/app/commercial/invoices" },
            { label: "Record Payment → draft receipt", href: "/app/commercial/invoices" },
            { label: "Post in Accounts", href: "/app/accounts/vouchers" },
          ],
        },
      ],
      relatedAppRoutes: ["/app/commercial/invoices", "/app/inventory/delivery-challans"],
      relatedArticleIds: ["commercial-lc-performance", "commercial-bd-registers", "fin-voucher-entry", "commercial-overview"],
    },

    // ---------------------------------------------------------------- LC performance
    {
      id: "commercial-lc-performance",
      title: "LC performance: shipped, realised and left to ship for every export LC",
      summary:
        "One table per open master LC / sales contract with LC value, shipped, realised, outstanding, left to ship, BTB opened and expiry warnings.",
      tags: ["LC performance", "realisation", "export LC", "BTB", "expiry", "dashboard"],
      keywords: ["LC dashboard", "LC status", "realisation report", "export realisation", "shipped not realised", "LC expiry", "BTB percentage", "outstanding export"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "commercial",
      coverImage: `${S}/commercial-lc-performance.jpg`,
      content: `## Overview

**LC Performance** answers "how is each LC doing?" in one table. Open **Export & Import → LC Performance** (\`/app/commercial/lc-performance\`). It is read-only.

## Before you start

- Orders must be **linked to the master contract**, otherwise their invoices are not counted.
- **Shipped** = issued commercial invoices on the LC's orders. **Realised** = posted receipts allocated to those invoices.

## Steps

1. Read the cards at the top: per currency **all open LCs** (LC value, shipped, realised, outstanding, left to ship) and **Needs attention** (how many LCs have a warning).
2. Tick **Show only these** to list only the LCs that need attention.
3. In the table check, per LC: **LC value**, **Shipped** (with % bar), **Realised** (plus "awaiting posting" for draft receipts), **Shipped, not realised**, **Left to ship**, **BTB opened** (count and % of LC) and **Expiry** (days left or days ago).
4. Read the **Watch** column:
   - **Expired, not fully shipped** — LC expired with goods still to ship (ask the buyer for an amendment).
   - **Expires ≤ 30 days** — hurry the remaining shipments.
   - **Shipped above LC value** — over-shipped; the bank may refuse documents.
   - **BTB > 75% of LC** — little room for more BTB LCs.
   - **On track** — nothing to do.
5. Click the LC reference to open **Master Contracts**. Use **Columns** and **Export** for a spreadsheet.

## What happens next

- To raise **Realised**, record buyer payments on the [commercial invoices](/app/tutorials/commercial-invoices) and have Accounts post them.

## Tips

- Amounts are shown in each LC's own currency.
- Check this screen weekly with the bank file — "Shipped, not realised" is the money you are waiting for.

## Common problems

- **Shipped shows 0 although goods have left** → the commercial invoice is not **ISSUED**, or the order is not linked to the master contract.
- **Realised is 0 but the buyer paid** → the receipt voucher is still a draft ("awaiting posting").`,
      images: [
        {
          src: `${S}/commercial-lc-performance-wide.jpg`,
          alt: "LC performance table on a wide screen showing the Watch column with warning tags",
          caption: "With Show only these ticked, only LCs with a warning in the Watch column are listed.",
        },
      ],
      relatedAppRoutes: ["/app/commercial/lc-performance"],
      relatedArticleIds: ["commercial-master-contracts", "commercial-invoices", "commercial-btb-lcs"],
    },

    // ---------------------------------------------------------------- Commission
    {
      id: "commercial-commission",
      title: "Commission: earned from factories/buyers and paid to agents",
      summary: "Record each shipment's FOB value; commission in both directions is calculated, grouped into statements and turned into draft vouchers.",
      tags: ["commission", "buying house", "agent", "TDS", "VDS", "AIT", "statement", "shipment"],
      keywords: ["brokerage", "commission invoice", "agent commission", "buying commission", "commission statement"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "finance",
      coverImage: `${S}/commercial-commission.jpg`,
      content: `## Overview

**Export & Import → Commission** (\`/app/commercial/commission\`) handles two kinds of commission on every shipment:

- **We earn** — commission a factory or buyer pays your buying house.
- **We pay** — commission you owe an agent linked to the order.

Who uses it: buying-house accounts and commercial staff.

## Before you start

- The menu item shows only while **Settings → Configuration → Commission engine** is on (tenant flag \`commission_engine_enabled\`).
- Orders must exist. Agents are linked to buyers in Merchandising.

## Steps

### 1. Rules & settings tab (once)

1. Under **Commission rules** choose **Direction** (**We earn (from factory/buyer)** or **We pay (to agent)**), **Applies to** (everyone, one factory, one buyer or one agent — then **Which one**), **Rate type** (% of shipped FOB value, or **Fixed amount per piece**) and **Rate**. The most specific rule wins.
2. Commission terms typed on an **order** override rules. They count as agent commission when the order has an agent, otherwise as commission you earn. An agent's default rate on the buyer–agent link is used next.
3. Under **Tax and accounts** enter **TDS / AIT %** and **VDS %** (0 until you set them), choose the accounts (commission income, receivable, expense, payable, TDS/VDS) and click **Save settings**.

### 2. Shipments tab

1. Under **Record a shipment** choose **Order ***, the **Factory (if we earn from it)**, **Shipment / invoice ref *** (e.g. INV-2026-014), **Shipment date ***, **Shipped FOB value ***, **Currency**, **Rate to BDT** and **Pieces (for per-piece rates)**.
2. Click **Record shipment**. **We earn** and **We pay** are calculated immediately.
3. If rules change later, use **Actions → Recalculate** on shipments not yet on a statement. **Actions → Open order** opens the order.

### 3. Statements tab

1. **Pending commission** groups lines by party and currency. Click **Create statement**.
2. **Actions → Issue** creates a **DRAFT journal voucher** in BDT for accounts to review and post (commission receivable/income, or expense/payable, with TDS and VDS lines). **Open voucher** jumps to it.
3. **Actions → Cancel** returns the lines to pending. A draft voucher is cancelled automatically; a posted voucher must be reversed in Accounts first.

## What happens next

- Posted vouchers show in the party ledgers and in **Accounts → Vouchers**.

## Tips

- One shipment reference can be recorded once per order.
- Use the commercial invoice number as the shipment reference so both match.

## Common problems

- **Commission is 0** → no rule matches and the order has no commission terms; add a rule.
- **Cannot delete or recalculate a shipment** → it is on a statement; cancel the statement first.`,
      images: [
        {
          src: `${S}/commercial-commission.jpg`,
          alt: "Commission page with Shipments, Statements and Rules & settings tabs and the Record a shipment form",
          caption: "Record a shipment; the We earn and We pay columns fill in automatically.",
        },
      ],
      relatedAppRoutes: ["/app/commercial/commission"],
      relatedArticleIds: ["commercial-overview", "fin-voucher-entry"],
    },

    // ---------------------------------------------------------------- BD registers
    {
      id: "commercial-bd-registers",
      title: "Bond & VAT registers: UD utilization, bond register, Mushak 6.1 / 6.2 / 6.3 / 6.10 / 9.1",
      summary: "Record each UD and its permitted imports, track imports and consumption in bond, and export monthly purchase and sales VAT registers.",
      tags: ["UD", "utilization declaration", "bond", "bonded warehouse", "Mushak", "VAT", "BGMEA", "BKMEA", "customs"],
      keywords: [
        "Mushak 6.1",
        "Mushak 6.2",
        "Mushak 6.3",
        "Mushak 6.10",
        "Mushak 9.1",
        "mushak",
        "tax invoice",
        "VAT return",
        "purchase register",
        "sales register",
        "bond licence",
        "UP",
        "utilization permission",
        "BEPZA",
        "HS code",
      ],
      estimatedMinutes: 10,
      lastUpdated: "2026-11-06",
      audience: "commercial",
      coverImage: `${S}/commercial-bd-compliance.jpg`,
      content: `## Overview

**Export & Import → Bond & VAT registers** (\`/app/commercial/bd-compliance\`) keeps the registers a Bangladesh bonded exporter needs between audits: the **UD register**, the **Bond register** and the **Mushak** VAT registers.

These are **working registers** — exports are spreadsheets (CSV / Excel from each table's **Export** menu), **not** the official e-UD, CBMS or NBR upload files. Check figures before filing.

## Before you start

- The menu item shows only while **Settings → Configuration → Bangladesh bond & VAT registers** is on (tenant flag \`bd_bond_compliance_enabled\`). If it is off the page says **"Bond & VAT registers are turned off for this company."**
- Set your company's **VAT BIN** in **Settings → Configuration → Finance & costing**; it is printed on 6.3 and 9.1.
- Mushak tabs need finance access; UD and bond tabs need Export & Import access.

## Steps

### 1. UD register

1. Click **New UD**. Enter **UD number ***, **Amendment no.** (0 for the original), **Issuer** (BGMEA, BKMEA, BEPZA), **UD date**, **Export LC / contract no.**, **Buyer**, **Export value (USD)** and **Expiry date**.
2. Under **Permitted imports** add each raw material: **Item description ***, **HS code**, **UOM**, **Entitled qty** and **Value (USD)**. Click **+ Add import line** for the next item.
3. Click **Save UD** (or **Cancel**), then **Actions → Approve**. Approved UDs are locked; use **Back to draft** to correct them, or record an amendment as a new UD with the next amendment number.
4. **Actions → Close UD** when the export is complete. Draft UDs can also be **Edit**ed or **Delete**d.

### 2. Record bond movements

Open a UD (**Actions → View utilization**). Under **Record bond movement** choose the **Import line**, the **Movement**, **Reference (B/E, invoice…)**, **Quantity**, **Value (BDT)** and **Date**, then click **Record**. **Close** hides the panel.

- **Import into bond** — material received against the UD (bill of entry, invoice).
- **Consumed / exported** — material used in shipped garments.

The table shows **Entitled**, **Imported**, **Consumed**, **In bond**, **Remaining entitlement** and **Used** %. Warnings appear when imports exceed the entitlement, consumption exceeds imports, or the UD expires within 30 days (the expiry turns amber with the days left).

### 3. Bond register

The **Bond register** tab lists every movement in date order with a running balance per item (**Item balance**), and the opening and closing balance for the period. Set **From**, **To** and **UD no.** (optional), then click **Refresh**. By default it shows only the last few days — widen **From** to see older movements.

### 4. Mushak 6.1 and 6.2

Pick the **Month** at the top of each tab and click **Refresh**.

- **Mushak 6.1 (purchases)** — recorded vendor bills for the month (drafts and cancelled bills are left out), with supplier BIN from the vendor's tax ID, taxable value and VAT in your base currency.
- **Mushak 6.2 (sales)** — issued and posted commercial invoices, treated as **zero-rated exports**. Add local sales manually. Each row has a **Mushak 6.3** link that opens a printable **tax invoice** (seller BIN, buyer BIN, lines, SD, VAT and totals in BDT).

### 5. Mushak 6.10 and 9.1

- **Mushak 6.10 (> 2 lakh)** — purchases and sales in the month whose total is above **BDT 2,00,000**, with **Export Excel**.
- **Mushak 9.1 (draft return)** — a monthly summary built from 6.1 and 6.2: zero-rated export supply, standard-rated supply and output VAT, purchases and input VAT, then **net VAT payable** or **credit to carry forward**. The return is due by the 15th of the following month.

> These are figures prepared from P7 records. P7 is not NBR-enlisted VAT software and does not create the NBR e-filing file — have your VAT consultant check them before you file.

## What happens next

- Your yearly **UP (utilization permission)** work uses the UD and bond figures as the source list.
- 6.1 fills from [vendor bills](/app/tutorials/fin-bills-ap); 6.2 fills from [commercial invoices](/app/tutorials/commercial-invoices).

## Tips

- Use the same item description on the UD and in bond entries; linking movements to a UD line keeps utilization exact.
- Record imports the day the bill of entry is assessed, and consumption when the shipment's commercial invoice is issued.

## Common problems

- **"UD number is required"** → fill **UD number**.
- **Record bond movement is missing** → the UD is **CLOSED** or has no permitted import lines.
- **6.1 / 6.2 say "Nothing recorded for this month."** → change the **Month**; only recorded bills and issued invoices are listed.
- **Bond register says "No bond movements in this period."** → move the **From** date earlier and click **Refresh**.
- **9.1 shows "BIN not set"** → add the VAT BIN in **Settings → Configuration** (\`/app/settings/config\`).
- **Red figures in Remaining entitlement** → you imported more than the UD allows; record a UD amendment with the extra quantity.`,
      infographics: [
        {
          type: "diagram",
          title: "What feeds each register",
          caption: "You type UDs and bond movements; Mushak registers are built from vendor bills and commercial invoices.",
          imageSrc: `${D}/ud-bond-vat-flow.svg`,
          imageAlt:
            "Diagram: UD, import into bond and consumed or exported feed utilization and the bond register; vendor bills feed Mushak 6.1, commercial invoices feed Mushak 6.2 and 6.3, and both feed 6.10 and the 9.1 draft return",
        },
        {
          type: "steps",
          title: "Tab by tab",
          steps: [
            {
              title: "New UD",
              body: "UD number, issuer, export LC, buyer, value, expiry and **Permitted imports**.",
              imageSrc: `${S}/commercial-ud-form.jpg`,
              imageAlt: "New UD form with permitted import lines",
              href: "/app/commercial/bd-compliance",
            },
            {
              title: "View utilization",
              body: "**Actions → View utilization** → **Record bond movement**.",
              imageSrc: `${S}/commercial-ud-utilization.jpg`,
              imageAlt: "UD utilization panel with warnings, entitled, imported, consumed, in bond and remaining entitlement columns, and the Record bond movement form",
            },
            {
              title: "Bond register",
              body: "Set **From** / **To** / **UD no.** → **Refresh**. Every movement with a running balance per item.",
              imageSrc: `${S}/commercial-bond-register.jpg`,
              imageAlt: "Bond register tab",
            },
            {
              title: "Mushak 6.2",
              body: "Monthly sales register; each row links to the **Mushak 6.3** tax invoice.",
              imageSrc: `${S}/commercial-mushak-62.jpg`,
              imageAlt: "Mushak 6.2 sales register tab with a month picker",
            },
            {
              title: "Mushak 9.1",
              body: "Draft monthly return built from 6.1 and 6.2.",
              imageSrc: `${S}/commercial-mushak-91.jpg`,
              imageAlt: "Mushak 9.1 draft return tab",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/commercial/bd-compliance"],
      relatedArticleIds: ["commercial-glossary", "commercial-overview", "commercial-invoices", "fin-bills-ap"],
    },

    // ---------------------------------------------------------------- Trade cases
    {
      id: "trade-cases",
      title: "Trade cases: one folder per export/import job, with stages and documents",
      summary:
        "Create a trade case, link order and PI, upload PI / LC / booking / BL / invoice / packing list files and move the case through its stages up to SETTLED.",
      tags: ["trade case", "export", "import", "documents", "stage", "BL", "COO"],
      keywords: ["trade case", "export file", "import file", "document checklist", "paperless", "move stage", "required documents", "settle case"],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      audience: "commercial",
      coverImage: `${S}/trade-cases.jpg`,
      content: `## Overview

A **Trade Case** is a digital folder for one export or import job. It links the order, PI, master contract and BTB LC, holds the uploaded documents and moves through fixed **stages**. Shipments in Logistics belong to a trade case.

Open **Export & Import → Trade Cases** (\`/app/trade/cases\`). The cards show **Total Cases**, **Open Cases** and **Shipped Cases**.

## Before you start

- Visible only for tenant type **buying_house** or **both**, with **Enable Trade module** on in **Settings → Configuration** (flag \`trade_enabled\`).
- Roles can be limited with \`trade.create\`, \`trade.transition\` and \`trade.document.upload\`.
- Have scans (PDF / image) of the PI, LC, booking confirmation, BL, commercial invoice and packing list.

## Steps

### A. Create a case

1. Under **Create Trade Case** choose **Direction** (**EXPORT** or **IMPORT**) and type **Reference *** (e.g. TC-2026-001).
2. Optionally enter **Order ID** and **Proforma Invoice ID** (the numbers shown as #… on those lists).
3. Click **Create Trade Case**. The case opens. (Faster: on **Proforma Invoices** use **Actions → Create Trade Case**.)

### B. Upload documents

1. On the case page scroll to **Documents**.
2. Choose the type: **PI**, **LC**, **INVOICE**, **PACKING_LIST**, **BL**, **COO** or **BOOKING_CONFIRM**.
3. Choose the file. It uploads at once and shows **Type**, **File**, **Version** and **Uploaded**. Use **Download** to open it later.

### C. Move the stage

1. In **Stage Transition** pick the target stage and click **Move Stage**.
2. If a document is missing, a yellow box shows **"Missing docs for …"** — upload it first.
3. The table below logs **From**, **To**, **When** and **Notes** for every move.

| Stage | Documents needed to enter it |
|---|---|
| DRAFT | — |
| COMMERCIAL | PI |
| LC_OPEN | LC (can be skipped for TT jobs) |
| BOOKING | BOOKING_CONFIRM |
| DOCS | BL, INVOICE, PACKING_LIST |
| SHIPPED | — |
| SETTLED | — (closes the case) |

### D. Plan the shipment

Use **Create Next → Plan shipment** (or list **Actions → Create Shipment / Open Logistics**) to open Logistics with this case selected. **Shipments** on the case page lists them.

## What happens next

- The **Estimated Margin** card shows revenue, cost and margin from finance records linked to the case.
- **Trade Control Tower** counts missing documents and overdue shipments across all cases.

## Tips

- Filter the list by **All directions**, **All statuses**, **All stages**, created dates, or tick **At risk (ETD ≤ 7d, not shipped/settled)**. **Export CSV** downloads the list.
- Documents can be deleted only while the case is **DRAFT** (to keep the audit trail).

## Common problems

- **"Missing required documents for DOCS: BL, INVOICE"** → upload those types, then **Move Stage** again.
- **"Invalid stage transition: COMMERCIAL -> DOCS"** → move one step at a time (COMMERCIAL → LC_OPEN or BOOKING → DOCS).
- **"Reference is required."** → type a reference before **Create Trade Case**.
- **Old demo cases show stage IN_PROGRESS** → that stage is not in the standard list; pick the right stage in **Stage Transition**.`,
      infographics: [
        {
          type: "diagram",
          title: "Stages and required documents",
          caption: "Upload the orange documents before moving into that stage.",
          imageSrc: `${D}/trade-case-stages.svg`,
          imageAlt:
            "Trade case stages Draft, Commercial, LC Open, Booking, Docs, Shipped and Settled, with required documents PI, LC, booking confirmation, and BL, invoice and packing list",
        },
        {
          type: "steps",
          title: "On the case page",
          steps: [
            {
              title: "Open the case",
              body: "**Actions → View**. **Open Logistics** and **Create Shipment** are in the same menu.",
              imageSrc: `${S}/trade-case-actions-menu.jpg`,
              imageAlt: "Trade Cases list with the Actions menu open showing View, Open Logistics and Create Shipment",
              href: "/app/trade/cases",
            },
            {
              title: "Links, margin, create next",
              body: "Order, PI, BTB LC and customer links; **Estimated Margin**; **Create Next** buttons.",
              imageSrc: `${S}/trade-case-detail.jpg`,
              imageAlt: "Trade case detail page header with linked records, estimated margin and Create Next buttons",
            },
            {
              title: "Move the stage",
              body: "Pick the stage → **Move Stage**. Missing documents are listed in yellow.",
              imageSrc: `${S}/trade-case-stage-transition.jpg`,
              imageAlt: "Stage Transition box with DOCS selected and a yellow warning listing the missing documents",
            },
            {
              title: "Upload documents",
              body: "Choose the type, then the file. **Download** opens it again.",
              imageSrc: `${S}/trade-case-documents.jpg`,
              imageAlt: "Shipments and Documents boxes on the trade case page",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/trade/cases"],
      relatedArticleIds: ["trade-control-tower", "logistics-shipments", "commercial-proforma-invoices", "commercial-glossary"],
    },

    // ---------------------------------------------------------------- Trade control tower
    {
      id: "trade-control-tower",
      title: "Trade Control Tower: at-risk cases, missing documents and overdue shipments",
      summary: "A daily check screen that counts open, shipped and settled trade cases and lists the cases that need action now.",
      tags: ["trade", "control tower", "alerts", "risk", "shipment delay"],
      keywords: ["trade dashboard", "at risk", "overdue shipment", "missing documents", "LC expiry soon", "case stuck"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      audience: "commercial",
      coverImage: `${S}/trade-dashboard.jpg`,
      content: `## Overview

**Export & Import → Trade Control Tower** (\`/app/trade/dashboard\`) is the morning check for the commercial team. It counts cases and points you to the ones with problems.

## Before you start

- Same visibility as Trade Cases (tenant type **buying_house** / **both**, trade module on).
- Alerts are created by the daily scan; **Run scan** on **Critical Alerts** forces it.

## Steps

1. Read the cards: **Total Cases**, **Open Cases**, **Shipped Cases**, **Settled Cases**, **Cases Missing Docs** and **Overdue Shipments**. Each card is a link (to the filtered list or to the matching alerts).
2. Click **List: at-risk cases (ETD window)** for cases whose ETD is within 7 days and not shipped / settled.
3. Use **More alert types**: **LC expiry soon** and **Case stuck**.
4. In **At-Risk Cases** click **Open** to fix the case or **Create Shipment** to book it. **Export CSV** downloads the list.
5. Click **Refresh** after you fix things; **All trade alerts** opens every trade alert.

## What happens next

- Fixing the case (uploading documents, moving the stage, updating the shipment) clears the alert on the next scan.

## Tips

- Work top-down: overdue shipments first, then missing documents, then LC expiry.

## Common problems

- **Counts look old** → click **Refresh**; alerts update after the daily scan or **Run scan**.`,
      images: [
        {
          src: `${S}/trade-dashboard.jpg`,
          alt: "Trade Control Tower with six count cards and the At-Risk Cases table with Open and Create Shipment buttons",
          caption: "Every card is clickable. At-Risk Cases lists the jobs to look at today.",
        },
      ],
      relatedAppRoutes: ["/app/trade/dashboard", "/app/merchandising/alerts"],
      relatedArticleIds: ["trade-cases", "logistics-shipments"],
    },

    // ---------------------------------------------------------------- Logistics shipments
    {
      id: "logistics-shipments",
      title: "Shipments and containers: booking, BL/AWB, ETD and ETA",
      summary: "Create a shipment for a trade case, keep carrier, booking, BL/AWB and dates up to date, and add container numbers.",
      tags: ["logistics", "shipment", "BL", "AWB", "ETD", "ETA", "container"],
      keywords: ["shipment booking", "forwarder", "vessel", "bill of lading", "air waybill", "container number", "seal", "ETD", "ETA", "shipping"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "logistics",
      coverImage: `${S}/logistics.jpg`,
      content: `## Overview

**Export & Import → Logistics** (\`/app/logistics\`) has two tabs: **Shipments** (booking, BL/AWB, ETD / ETA) and **Packing Lists** (packing lists and containers). Every shipment belongs to a [trade case](/app/tutorials/trade-cases).

## Before you start

- Same visibility as Trade Cases (tenant type **buying_house** / **both**, trade module on).
- Create the trade case first. Opening Logistics from a case (**Plan shipment**) pre-selects it.

## Steps

### A. Create a shipment

1. (Optional) In **Extract from shipping document** upload a BL, AWB or packing list and click **Extract data**. Review the fields and apply the right ones; if it matches an existing shipment, the form switches to **Update Shipment**.
2. Choose **Trade Case *** and type **Reference *** (e.g. SHIP-2026-001).
3. Set **Status**: **PLANNED**, **BOOKED**, **IN_TRANSIT**, **ARRIVED**, **DELIVERED** or **CLOSED**.
4. Fill **Carrier**, **Booking Ref**, **BL/AWB**, **ETD**, **ETA**, **Origin Port**, **Destination Port** and **Notes**.
5. Click **Create Shipment**.

### B. Update as it moves

1. In the list use **Actions → Edit shipment**. The form at the top changes to **Update Shipment**.
2. Change the status and dates, then click **Update Shipment** (or **Cancel**).
3. Filter with **All trade cases**, **All statuses** and the ETD dates; **Export CSV** downloads the list.

### C. Containers

1. Open the **Packing Lists** tab and scroll to **Containers**.
2. Choose **Shipment**, type **Container #**, **Type** (e.g. 40HC) and **Loading status** (**EMPTY**, **LOADING**, **LOADED**, **CLOSED**).
3. Click **Add container**.

## What happens next

- The trade case's **Shipments** box and the Control Tower **Overdue Shipments** count update.
- Build the carton detail on a [packing list](/app/tutorials/logistics-packing-cartons).

## Tips

- Put the BL or AWB number in as soon as you get it — banks ask for it with the documents.
- Keep ETD realistic; the at-risk filter uses it.

## Common problems

- **"Trade case and shipment reference are required."** → choose the trade case and type a reference.
- **"Shipment and container number are required"** → pick the shipment before **Add container**.
- **Logistics is missing from the menu** → trade module is off or your tenant is manufacturer-only.`,
      videos: [
        {
          src: `${V}/logistics-packing-list.webm`,
          poster: `${V}/logistics-packing-list-poster.jpg`,
          title: "Plan a shipment and fill a packing list",
          caption: "Fills the Create Shipment form (not saved), then opens a packing list to show carton detail and containers.",
          durationSeconds: 47,
        },
      ],
      images: [
        {
          src: `${S}/logistics-shipments-list.jpg`,
          alt: "Shipments list with reference, trade case, status, carrier, booking ref, BL/AWB, ETD, ETA and Actions",
          caption: "Shipments list. Use Actions → Edit shipment to update status and dates.",
        },
      ],
      relatedAppRoutes: ["/app/logistics"],
      relatedArticleIds: ["logistics-packing-cartons", "trade-cases", "trade-control-tower"],
    },

    // ---------------------------------------------------------------- Packing lists
    {
      id: "logistics-packing-cartons",
      title: "Packing lists: carton detail by colour and size",
      summary: "Create a packing list, enter carton ranges with colour, size and pieces per carton, add containers and finalize; totals, weights, CBM and left-to-pack are calculated.",
      tags: ["packing list", "carton", "CBM", "weight", "assortment", "ratio", "shipment"],
      keywords: ["packing detail", "solid pack", "assorted pack", "carton marks", "ratio pack", "carton range", "finalize packing list", "container"],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      audience: "logistics",
      coverImage: `${S}/logistics-packing-detail.jpg`,
      content: `## Overview

A **packing list** says what is in every carton. In P7 you create the header on **Logistics → Packing Lists** (\`/app/logistics?tab=packing\`), then fill the **Carton detail** on the packing list page.

## Before you start

- Know the **order ID** (and shipment, if booked). The order's **colour / size breakdown** lets P7 show what is left to pack ([colour × size](/app/tutorials/merch-order-color-size)).
- The **Carton detail** section can be hidden by an admin (**Settings → Configuration → Carton detail on packing lists**).

## Steps

### A. Create the packing list

1. Open **Logistics → Packing Lists**.
2. Enter **Order ID**, pick **Shipment** (optional) and **Total cartons** (can be 0 — the carton detail fills it).
3. Click **Create packing list**. P7 opens the new packing list. Existing ones are in the table — click **Open**.

### B. Carton detail

1. Click **Add carton range** and enter **Carton from / to** (e.g. 1–40), **Colour**, **Size** and **Pcs / ctn**.
2. Enter **Net kg / ctn** and **Gross kg / ctn**, and the carton **L cm × W cm × H cm** to get total weights and **CBM**.
3. **Assorted cartons** (several sizes in one carton): click the **copy** button on a row to add another size for the **same carton range**. Weights and dimensions are taken from the first row of each range.
4. Click **Save cartons**. The packing list's **Total cartons**, **Gross weight (kg)** and **Net weight (kg)** update.

### C. Ordered vs packed

If the order has a colour / size breakdown, the **By colour / size** table shows **In this list**, **All lists for order**, **Ordered** and **Left to pack**. Over-packing is shown in red.

### D. Containers and finalize

1. A shipment must be linked (the page says **"Link a shipment on this packing list before adding containers."** otherwise).
2. Under **Containers** enter **Container #**, **Type** (20GP, 40GP, 40HQ, LCL), **Seal #**, **Tare weight (kg)** and **Max weight (kg)**, then **Add container**. **Remaining kg** shows the space left.
3. When cartons and containers are complete, click **Finalize**. A **Finalized** packing list is read-only.

## What happens next

- Upload the printed packing list to the trade case as **PACKING_LIST** — it is required for the **DOCS** stage.

## Tips

- Enter one row per carton range and colour/size; keep ranges continuous (1–40, 41–80 …).

## Common problems

- **"Cartons 1–10 and 8–12 overlap"** → two different carton ranges may not share carton numbers; fix the from / to numbers.
- **Finalize button missing** → the list is not DRAFT, has no containers, or total cartons is 0.
- **Weights show "save to recalculate"** → click **Save cartons**.
- **The tab text says size/colour packing "comes later"** → ignore it; carton detail is on the packing list page.`,
      videos: [
        {
          src: `${V}/logistics-packing-list.webm`,
          poster: `${V}/logistics-packing-list-poster.jpg`,
          title: "Plan a shipment and fill a packing list",
          caption: "Shows the Packing Lists tab, opens a packing list and walks through carton detail and containers. Nothing is saved.",
          durationSeconds: 47,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Packing list in three screens",
          steps: [
            {
              title: "Create the header",
              body: "**Order ID**, **Shipment**, **Total cartons** → **Create packing list**.",
              imageSrc: `${S}/logistics-packing-tab.jpg`,
              imageAlt: "Packing Lists tab with the create form, packing list table and Containers section",
              href: "/app/logistics?tab=packing",
            },
            {
              title: "Carton detail",
              body: "**Add carton range** → colour, size, pcs, weights, size → **Save cartons**.",
              imageSrc: `${S}/logistics-packing-detail.jpg`,
              imageAlt: "Packing list page with totals cards, carton detail table and containers",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/logistics"],
      relatedArticleIds: ["logistics-shipments", "trade-cases", "merch-order-color-size", "commercial-overview"],
    },
  ],
};
