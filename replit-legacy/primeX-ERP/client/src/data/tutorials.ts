/**
 * TUTORIAL_MAINTENANCE_RULE:
 * When adding, modifying, or removing any feature, workflow, or process in the application,
 * the corresponding tutorial article(s) in this file MUST be updated simultaneously.
 * This includes:
 *   - Adding new articles for new features
 *   - Updating step-by-step instructions when workflows change
 *   - Updating lastUpdated dates on modified articles
 *   - Removing articles for deprecated features
 *   - Adding tags for searchability
 */

export interface TutorialArticle {
  id: string;
  title: string;
  content: string;
  tags: string[];
  lastUpdated: string;
  relatedArticles?: string[];
}

export interface TutorialSection {
  id: string;
  module: string;
  title: string;
  icon: string;
  description: string;
  articles: TutorialArticle[];
}

export const tutorials: TutorialSection[] = [
  {
    id: "getting-started",
    module: "Getting Started",
    title: "Getting Started",
    icon: "Rocket",
    description: "Learn the basics of Prime7 ERP — login, navigation, and initial setup.",
    articles: [
      {
        id: "gs-login",
        title: "How to Log In",
        content: `# How to Log In

## Overview
Prime7 ERP uses a multi-tenant login system. You need three pieces of information to access your account.

## Steps

1. Open the application and navigate to the login page
2. Enter your **Company Code** — this is your organization's unique identifier (e.g., LAKHS4821)
3. Enter your **Username** — provided by your system administrator
4. Enter your **Password**
5. Click the **Sign In** button

## Tips

- If you forget your password, click "Forgot Password" on the login page to receive a reset email
- Your company code is case-sensitive
- After login, you'll land on the Dashboard showing key metrics and summaries

## Troubleshooting

- **Invalid credentials**: Double-check your company code, username, and password
- **Account locked**: Contact your system administrator to unlock your account
- **Session expired**: Simply log in again — your work is auto-saved`,
        tags: ["login", "authentication", "company code", "password", "sign in"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["gs-dashboard", "gs-navigation"],
      },
      {
        id: "gs-dashboard",
        title: "Understanding the Dashboard",
        content: `# Understanding the Dashboard

## Overview
The Dashboard is your home screen after logging in. It provides a quick overview of your business operations.

## Key Sections

### Summary Cards
At the top, you'll see summary cards showing:
- **Total Orders** — active sales orders
- **Pending Approvals** — items waiting for your review
- **Revenue** — current period revenue in BDT
- **Alerts** — critical items needing attention

### Quick Actions
Common actions are accessible directly from the dashboard:
- Create new order
- View pending approvals
- Check critical alerts

### Recent Activity
Shows the latest transactions, status changes, and updates across all modules.

## Tips

- The dashboard refreshes automatically every few minutes
- Click any summary card to navigate to the detailed view
- Use the AI Assistant (accessible from sidebar) for quick data queries`,
        tags: ["dashboard", "home", "overview", "summary", "quick actions"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["gs-login", "gs-navigation"],
      },
      {
        id: "gs-navigation",
        title: "Navigating the Sidebar",
        content: `# Navigating the Sidebar

## Overview
The sidebar is your primary navigation tool. It organizes all modules into collapsible sections.

## How It Works

### Expanding/Collapsing Sections
- Click any section header (e.g., "Merchandising") to expand or collapse its items
- The arrow icon shows whether a section is expanded or collapsed

### Favorites
- Hover over any menu item to see a star icon
- Click the star to add it to your **Favorites** section at the top of the sidebar
- Click again to remove it from favorites

### Collapsing the Sidebar
- Click the arrow button at the top of the sidebar to collapse it to icons only
- Click again to expand it back

### Mobile Navigation
- On mobile devices, tap the menu icon in the top bar to open the sidebar
- Tap outside the sidebar or the X button to close it

## Module Visibility

Your sidebar may show different modules depending on your organization's **Business Type**:
- **Buying House**: Shows Sales, Commercial, and Merchandising modules; hides factory floor modules
- **Manufacturer**: Shows all modules including Production, Cutting, Sewing, Finishing
- **Both**: Shows everything

## Sidebar Footer

At the bottom of the sidebar you'll find:
- **Help & Tutorials** — opens the in-app tutorial and help center
- **App Version** — shows the current version number (e.g., v2.0.0)
- **Logout** — signs you out of the system

## Tips

- Use the search bar (Ctrl+K) to quickly find any page
- The sidebar remembers which sections you had expanded
- The version number helps support teams identify which features are available`,
        tags: ["sidebar", "navigation", "menu", "favorites", "mobile", "search", "version"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["gs-dashboard", "sys-business-type"],
      },
      {
        id: "gs-business-type",
        title: "Setting Your Business Type",
        content: `# Setting Your Business Type

## Overview
Prime7 ERP supports three business types that control which modules are visible in your sidebar and available features.

## Business Types

1. **Buying House** — For organizations that source and coordinate between buyers and factories. Hides factory floor modules (Cutting, Sewing, Finishing, IE)
2. **Manufacturer** — For garment factories with production floors. Shows all production-related modules
3. **Both** — For organizations that do both buying and manufacturing. Shows all modules

## How to Change

1. Go to **Settings** from the sidebar
2. Click the **Business Type** tab
3. You'll see three cards — Buying House, Manufacturer, and Both
4. Click the card matching your business type
5. Click **Save Changes**

## Important Notes

- Only super users (administrators) can change the business type
- Changing the business type immediately updates the sidebar for all users in your organization
- No data is deleted when you change the business type — modules are just hidden/shown`,
        tags: ["business type", "buying house", "manufacturer", "settings", "sidebar visibility"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["gs-navigation", "sys-settings"],
      },
    ],
  },
  {
    id: "sales-crm",
    module: "Merchandising",
    title: "Merchandising",
    icon: "Shirt",
    description: "Manage customers, inquiries, quotations, orders, styles, and BOM.",
    articles: [
      {
        id: "sales-customers",
        title: "Managing Customers",
        content: `# Managing Customers

## Overview
The Customers module is your central hub for managing all buyer and supplier information.

## Creating a New Customer

1. Go to **Merchandising > Customers** from the sidebar
2. Click **Add Customer** button
3. Fill in the required fields:
   - **Customer Name** — full legal name
   - **Customer Type** — Buyer, Supplier, or Both
   - **Contact Person** — primary contact name
   - **Email** and **Phone**
   - **Address** details
4. Click **Save**

## Searching and Filtering

- Use the search bar to find customers by name, code, or contact person
- Filter by customer type (Buyer/Supplier/Both)
- Sort by name, date created, or last activity

## Customer Details

Click any customer to view their full profile including:
- Contact information
- Linked inquiries, quotations, and orders
- Transaction history
- Outstanding balances

## Tips

- Keep customer records updated — they flow into all other modules
- Use the Party Dashboard for a consolidated view across all customer types`,
        tags: ["customers", "buyers", "suppliers", "CRM", "contacts"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sales-inquiries", "sales-parties"],
      },
      {
        id: "sales-inquiries",
        title: "Creating and Managing Inquiries",
        content: `# Creating and Managing Inquiries

## Overview
Inquiries are the starting point of the merchandising workflow. They capture buyer interest and lead to samples, quotations, and eventually orders.

## Creating an Inquiry

1. Go to **Merchandising > Inquiries**
2. Click **New Inquiry**
3. Fill in the required fields:
   - **Customer** — select the buyer from the dropdown
   - **Style Name** — the garment style being inquired about
   - **Inquiry Type** — Sample Development, Salesman Sample, Quotation, or Repeat Order
   - **Department** — Infant, Kids, Boys, Girls, Men's, or Ladies
   - **Projected Quantity** — estimated order quantity
   - **Target Price** — buyer's target price per unit (USD)
   - **Delivery Date** — projected delivery date
4. Optionally fill in:
   - **Season / Year** — e.g., SS-2026
   - **Brand** — buyer brand name
   - **Material Composition** — e.g., 95% Cotton, 5% Elastane
   - **Size Range** — e.g., S-XXL
   - **Special Requirements** — certifications, treatments, or other notes
5. Click **Create Inquiry**

## Inquiry to Sample Flow

From an inquiry detail page, you can:
1. Click **Request Proto Sample** to create a linked sample request
2. The sample form will be pre-filled with inquiry data (style, buyer, department)
3. Track linked samples in the "Linked Sample Requests" section of the inquiry

## Status Workflow

Inquiries move through these statuses:
- **New** → **Under Review** → **Quoted** → **Won** / **Lost**

## Tips

- Use the Order Pipeline Dashboard to see all inquiries and their progress
- Link inquiries to quotations for seamless workflow tracking`,
        tags: ["inquiries", "leads", "buyer interest", "proto sample", "merchandising"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sales-customers", "merch-samples", "sales-quotations"],
      },
      {
        id: "sales-quotations",
        title: "Quotations and Pricing",
        content: `# Quotations and Pricing

## Overview
Quotations are formal price proposals sent to buyers based on inquiries and costing.

## Creating a Quotation

1. Go to **Merchandising > Quotations**
2. Click **New Quotation**
3. Select the **Customer** and optionally link to an **Inquiry**
4. Add line items with:
   - Style name and description
   - Quantity
   - Unit price (in the agreed currency)
   - Delivery terms
5. Review the total and click **Save**

## Converting to Order

When a quotation is accepted:
1. Open the quotation detail page
2. Click **Convert to Order**
3. Review and confirm the order details
4. The system will create a sales order linked to the quotation

## Approval Workflow

Quotations may require approval before sending to the buyer:
- Submit for approval from the quotation detail page
- Approvers review and approve/reject from the Approval Queue
- Once approved, the quotation can be sent to the buyer

## Tips

- If a linked sample request was approved by the buyer, a "Sample Approved" badge will appear
- Multi-currency quotations automatically convert to BDT at current exchange rates`,
        tags: ["quotations", "pricing", "costing", "convert to order", "approval"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sales-inquiries", "sales-orders"],
      },
      {
        id: "sales-orders",
        title: "Sales Orders",
        content: `# Sales Orders

## Overview
Sales Orders are confirmed buyer orders that drive production, procurement, and shipment.

## Creating an Order

Orders are typically created by:
1. **Converting a quotation** — click "Convert to Order" on an accepted quotation
2. **Manual creation** — go to Merchandising > Orders > New Order

## Order Detail Page

The order detail page has several tabs:
- **Overview** — order summary, buyer, quantities, dates
- **TNA Plan** — Time & Action plan linked to this order. Click "Generate TNA Plan" if none exists
- **Amendments** — history of any changes made after order confirmation

## Order Amendments

When you edit a confirmed order:
- Changes are tracked as formal amendments
- Each amendment records: what changed, old value, new value, reason, and who requested it
- Amendments can be approved or rejected by authorized users

## Status Workflow

Orders progress through:
- **Draft** → **Confirmed** → **In Production** → **Ready to Ship** → **Shipped** → **Delivered**

## Tips

- After confirming an order, the system will prompt you to generate a TNA plan
- Track all orders across stages using the Order Pipeline Dashboard
- Use the Consumption Reconciliation page to compare planned vs. actual material usage`,
        tags: ["orders", "sales orders", "amendments", "TNA", "order status", "confirmed"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sales-quotations", "merch-pipeline", "merch-tna"],
      },
      {
        id: "sales-parties",
        title: "Party Dashboard",
        content: `# Party Dashboard

## Overview
The Party Dashboard provides a unified view of all business parties — buyers, suppliers, agents, and more.

## How to Use

1. Go to **Merchandising > Parties**
2. Browse or search across all party types
3. Click any party to see their complete profile including:
   - Contact details
   - Transaction history
   - Outstanding balances
   - Linked documents (orders, invoices, etc.)

## Tips

- Use filters to narrow down by party type
- The dashboard aggregates data from Customers, Suppliers, and other party modules`,
        tags: ["parties", "party dashboard", "buyers", "suppliers", "contacts"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sales-customers"],
      },
      {
        id: "sales-document-flow",
        title: "Document Flow Tracking",
        content: `# Document Flow Tracking

## Overview
The Document Flow page provides a visual timeline showing how documents connect across the entire business process.

## How to Use

1. Go to **Merchandising > Document Flow**
2. Search for a specific order, inquiry, or quotation
3. View the connected chain: Inquiry → Quotation → Order → Production → Shipment → Invoice

## What It Shows

- Each document in the chain with its status
- Dates and amounts
- Links to jump directly to any document

## Tips

- Use Document Flow to trace any discrepancy back to its source
- Helpful for audits and reconciliation`,
        tags: ["document flow", "traceability", "audit trail", "linked documents"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sales-orders", "sales-quotations"],
      },
    ],
  },
  {
    id: "merchandising",
    module: "Merchandising",
    title: "Merchandising",
    icon: "Shirt",
    description: "Styles, BOM, consumption plans, order pipeline, and alerts.",
    articles: [
      {
        id: "merch-styles",
        title: "Managing Garment Styles",
        content: `# Managing Garment Styles

## Overview
Styles are the foundation of garment merchandising. Each style represents a unique garment design with its specifications.

## Creating a Style

1. Go to **Merchandising > Garment Styles**
2. Click **New Style**
3. Fill in:
   - **Style No** — unique style code (e.g., ST-2024-001)
   - **Buyer** — the customer this style is for
   - **Product Type** — e.g., T-shirt, Polo, Trouser
   - **Season** — e.g., SS24, AW24
   - **Description** — detailed style description
4. Add tech pack metadata if available
5. Click **Save**

## Style Detail

Each style detail page shows:
- Basic style information
- Linked BOM (Bill of Materials)
- Colorways and size scales
- Sample history
- Production status

## Tips

- Create styles before building BOMs — the BOM references the style
- Link styles to inquiries for seamless workflow tracking`,
        tags: ["styles", "garment styles", "tech pack", "season", "product type"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["merch-bom", "sales-inquiries"],
      },
      {
        id: "merch-bom",
        title: "BOM Builder (Bill of Materials)",
        content: `# BOM Builder

## Overview
The BOM Builder lets you create detailed material lists for each garment style, specifying every fabric, trim, and accessory needed.

## Creating a BOM

1. Go to **Merchandising > BOM Builder**
2. Select the **Style** you're building a BOM for
3. Add material lines:
   - **Item** — select from inventory items
   - **Category** — Fabric, Trim, Accessory, Packing
   - **Quantity per garment** — how much of each material per unit
   - **Unit** — yards, meters, pieces, etc.
   - **Wastage %** — expected material wastage
4. The system auto-calculates total requirements based on order quantity
5. Click **Save BOM**

## BOM vs Consumption

- **BOM** = planned material requirements
- **Consumption** = actual materials used in production
- Use the Consumption Reconciliation page to compare the two

## Tips

- Use the AI BOM Suggestion feature for intelligent material recommendations
- Lock the BOM before production starts to prevent accidental changes
- Review the BOM Orders page to see all orders using a specific BOM`,
        tags: ["BOM", "bill of materials", "materials", "fabric", "trim", "costing"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["merch-styles", "merch-consumption"],
      },
      {
        id: "merch-pipeline",
        title: "Order Pipeline Dashboard",
        content: `# Order Pipeline Dashboard

## Overview
The Order Pipeline provides a visual overview of all orders at every stage — from inquiry through to shipment.

## How to Access

Go to **Merchandising > Order Pipeline** from the sidebar.

## Pipeline Stages

Orders are displayed in columns by stage:
1. **Inquiry** — initial buyer interest
2. **Sample Dev** — sample being developed/reviewed
3. **Quotation** — pricing under negotiation
4. **Confirmed** — order confirmed by buyer
5. **In Production** — manufacturing in progress
6. **QC** — quality checks underway
7. **Ready to Ship** — production complete, awaiting shipment
8. **Shipped** — goods dispatched

## Color Coding

Each order card is color-coded:
- **Green** — on track (sufficient time before deadline)
- **Yellow** — at risk (less than 7 days buffer)
- **Red** — overdue (past deadline)

## Filtering

Use the filter bar to narrow by:
- Buyer name
- Merchandiser
- Date range

## Tips

- Click any card to navigate to its detail page
- Use this dashboard in daily standup meetings to review order status
- The pipeline aggregates data from inquiries, samples, quotations, orders, production, and shipments`,
        tags: ["pipeline", "kanban", "order tracking", "stages", "visual dashboard"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sales-orders", "merch-alerts"],
      },
      {
        id: "merch-alerts",
        title: "Critical Alerts Dashboard",
        content: `# Critical Alerts Dashboard

## Overview
The Critical Alerts page aggregates warnings and notifications from across all modules into a single view, so you never miss an important deadline.

## How to Access

Go to **Merchandising > Critical Alerts** from the sidebar. The sidebar badge shows the total alert count.

## Alert Types

### Overdue TNA Milestones
- TNA activities that are past their planned date but not yet completed
- Severity: Critical

### Pending Sample Approvals
- Sample requests waiting for buyer approval for more than 3 days
- Severity: Warning or Info based on wait time

### LC Expiry Warnings
- Letters of Credit expiring within 30 days
- Severity: Warning

### Orders at Risk
- Orders with delivery dates less than 14 days away where production is not completed
- Severity: Critical

## Summary Cards

At the top, you'll see counts for:
- **Critical** alerts (red)
- **Warning** alerts (yellow)
- **Info** alerts (blue)
- **Total** alerts

## Tips

- Click any alert to navigate directly to the related record
- Check this page daily to stay on top of deadlines
- Alerts update automatically based on real-time data`,
        tags: ["alerts", "critical alerts", "warnings", "deadlines", "overdue", "TNA"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["merch-pipeline", "merch-tna"],
      },
      {
        id: "merch-consumption",
        title: "Consumption Reconciliation",
        content: `# Consumption Reconciliation

## Overview
Compare planned material usage (from BOM) against actual consumption during production to identify variances.

## How to Use

1. Go to **Merchandising > Consumption Reconciliation**
2. Select an **Order** from the dropdown
3. View the comparison table showing:
   - **Material** name
   - **BOM Planned** quantity
   - **Actual Consumed** quantity
   - **Variance** (surplus or deficit)
   - **Variance %**

## Understanding Variances

- **Green** — within 5% tolerance (acceptable)
- **Red** — exceeds 5% tolerance (needs attention)
- **Positive variance** — used less than planned (surplus)
- **Negative variance** — used more than planned (deficit)

## Tips

- Review reconciliation reports after production completion
- Persistent negative variances may indicate wastage issues in production
- Use this data to refine future BOMs for better accuracy`,
        tags: ["consumption", "reconciliation", "BOM vs actual", "variance", "materials"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["merch-bom", "sales-orders"],
      },
      {
        id: "merch-samples",
        title: "Sample Development Workflow",
        content: `# Sample Development Workflow

## Overview
Sample development is a critical step in the garment merchandising process. Buyers review samples before confirming orders.

## Creating a Sample Request

### From an Inquiry
1. Open an inquiry detail page
2. Click **Request Proto Sample**
3. The form pre-fills with inquiry data (buyer, style, quantity)
4. Add any additional specifications
5. Click **Save**

### Standalone
1. Go to **Manufacturing > Samples > Sample Requests**
2. Click **New Request**
3. Fill in buyer, style, sample type, quantity, and required date
4. Click **Save**

## Sample Request Workflow

1. **Requested** — sample request created
2. **Submitted** — sent for internal review
3. **In Progress** — sample being produced
4. **Sent to Buyer** — sample shipped to buyer for review
5. **Approved by Buyer** — buyer approves the sample
6. **Rejected** — buyer rejects, may need revision

## After Buyer Approval

When a sample is approved:
1. A green **Proceed to Order Confirmation** button appears
2. Click it to create a quotation pre-filled with the sample/inquiry data
3. This links the quotation back to the approved sample

## Tips

- Track all sample versions — the system maintains version history
- Lock the BOM snapshot when the sample is approved
- Use sample activity logs to track every status change`,
        tags: ["samples", "proto sample", "sample approval", "buyer approval", "sample request"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sales-inquiries", "sales-quotations", "merch-tna"],
      },
      {
        id: "merch-tna",
        title: "Time & Action (TNA) Planning",
        content: `# Time & Action (TNA) Planning

## Overview
TNA plans track critical milestones and deadlines for each order, ensuring everything stays on schedule from order confirmation to shipment.

## Creating a TNA Plan

### From an Order
1. Open an order detail page
2. Click the **TNA Plan** tab
3. Click **Generate TNA Plan**
4. Select a TNA template (if available)
5. The system creates milestones based on the template and order delivery date

### From TNA Module
1. Go to **Manufacturing > TNA Dashboard**
2. Click **New Plan**
3. Select the order and template
4. Adjust milestone dates as needed

## TNA Templates

Templates define standard milestones for different order types:
- Fabric sourcing deadline
- Trim procurement
- PP sample approval
- Cutting start/end
- Sewing start/end
- Finishing and packing
- Final inspection
- Shipment

## Tracking Progress

- Each milestone shows: planned date, actual date, status, responsible person
- Overdue milestones appear in the Critical Alerts Dashboard
- The TNA Dashboard shows a bird's-eye view of all active plans

## Tips

- Create TNA templates for your common order types to save time
- Update milestone status daily during production
- Review TNA plans in weekly production meetings`,
        tags: ["TNA", "time and action", "milestones", "deadlines", "planning", "templates"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sales-orders", "merch-alerts", "merch-pipeline"],
      },
    ],
  },
  {
    id: "inventory",
    module: "Inventory",
    title: "Inventory Management",
    icon: "Package",
    description: "Items, stock, warehouses, purchase orders, GRN, and stock ledger.",
    articles: [
      {
        id: "inv-items",
        title: "Managing Inventory Items",
        content: `# Managing Inventory Items

## Overview
Inventory items represent all materials, fabrics, trims, and finished goods tracked in the system.

## Creating an Item

1. Go to **Inventory > Items & Stock**
2. Click **Add Item**
3. Fill in:
   - **Item Name** — descriptive name
   - **Item Code** — unique identifier
   - **Category** — Fabric, Trim, Accessory, Packing, Finished Good
   - **Unit of Measure** — meters, yards, pieces, kg, etc.
   - **Reorder Level** — minimum stock before reorder alert
4. Click **Save**

## Stock Groups and Categories

Organize items using:
- **Stock Groups** — broad groupings (Raw Materials, Work-in-Progress, Finished Goods)
- **Categories** — detailed groupings within stock groups
- **Subcategories** — further breakdown

## Tips

- Set reorder levels to get automated low-stock alerts
- Use lot/batch tracking for materials that need traceability
- The Stock Dashboard provides a visual overview of inventory health`,
        tags: ["items", "stock", "inventory", "materials", "categories", "reorder"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["inv-purchase-orders", "inv-stock-ledger"],
      },
      {
        id: "inv-purchase-orders",
        title: "Purchase Orders and Procurement",
        content: `# Purchase Orders and Procurement

## Overview
Purchase Orders (POs) are used to procure raw materials, fabrics, and trims from suppliers.

## Creating a Purchase Order

1. Go to **Inventory > Purchase Orders**
2. Click **New Purchase Order**
3. Select the **Supplier**
4. Add line items:
   - Select the inventory item
   - Enter quantity, unit price, and delivery date
5. Review totals and click **Save**

## PO Approval

- Submit the PO for approval
- Approvers review quantity, pricing, and supplier terms
- Approved POs can be sent to suppliers

## Receiving Goods (GRN)

When goods arrive:
1. Go to **Inventory > Goods Receiving**
2. Select the PO being received against
3. Enter received quantities (can be partial)
4. Record any quality issues
5. Click **Save GRN**
6. Stock levels update automatically

## Tips

- Compare PO prices across suppliers for better negotiations
- Use partial GRN for shipments arriving in batches
- The stock ledger automatically records all GRN movements`,
        tags: ["purchase orders", "procurement", "GRN", "goods receiving", "suppliers"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["inv-items", "inv-stock-ledger"],
      },
      {
        id: "inv-stock-ledger",
        title: "Stock Ledger and Valuation",
        content: `# Stock Ledger and Valuation

## Overview
The Stock Ledger records every inventory movement with weighted average cost valuation.

## Viewing the Stock Ledger

1. Go to **Inventory > Ledger**
2. Select an item to view its transaction history
3. Each entry shows: date, type (IN/OUT), quantity, rate, and running balance

## Stock Valuation

Go to **Inventory > Valuation** to see:
- Current stock quantity per item
- Weighted average cost per unit
- Total inventory value

## Stock Adjustments

For manual corrections:
1. Go to **Inventory > Adjustments**
2. Select the item and warehouse
3. Enter the adjustment quantity (positive for additions, negative for reductions)
4. Provide a reason
5. Click **Save**

## Tips

- The weighted average method automatically recalculates on every transaction
- Use stock adjustments for physical count reconciliation
- Export stock reports for financial audits`,
        tags: ["stock ledger", "valuation", "weighted average", "adjustments", "inventory report"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["inv-items", "inv-purchase-orders", "inv-warehouses"],
      },
      {
        id: "inv-warehouses",
        title: "Warehouses and Transfers",
        content: `# Warehouses and Transfers

## Overview
Manage multiple warehouse locations and transfer stock between them.

## Creating a Warehouse

1. Go to **Inventory > Warehouses**
2. Click **Add Warehouse**
3. Enter name, code, and address
4. Click **Save**

## Warehouse Transfers

1. Go to **Inventory > Transfers**
2. Click **New Transfer**
3. Select source and destination warehouses
4. Add items and quantities to transfer
5. Click **Save and Process**

## Tips

- Each item's stock is tracked per warehouse
- Use transfers for moving materials between factory floors and storage
- The stock summary page shows stock by warehouse`,
        tags: ["warehouses", "transfers", "stock movement", "locations"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["inv-items", "inv-stock-ledger"],
      },
      {
        id: "inv-delivery",
        title: "Delivery Challans and Gate Passes",
        content: `# Delivery Challans and Gate Passes

## Delivery Challans

Used for sending goods out of the premises:
1. Go to **Inventory > Delivery Challans** (under the sidebar)
2. Click **New Challan**
3. Select the party — you can either **pick from your registered parties** or **type a custom name** for one-time recipients using the toggle
4. Add items — use the **inventory item search** to find existing items, or click **+ Create New Item** to add a new item on the fly
5. When selecting an inventory item, the item code and unit are auto-filled
6. Fill in quantities, rates, and any special instructions
7. Submit for approval, then print the challan for dispatch

## Enhanced Gate Passes

For all materials entering or leaving the premises:
1. Go to **Inventory > Gate Passes**
2. Create **Inward** or **Outward** gate passes
3. Select a party from the list or type a custom party name using the **"Type manually"** toggle
4. Add items using **inventory search** with auto-fill, or create new items inline
5. Record vehicle details, driver info, and purpose
6. Get authorization approval
7. Print for security checkpoint

## QR Code Verification

When a delivery challan or gate pass is finalized, a **QR code** is automatically generated and printed on the document. External parties can scan this QR code with their phone to verify the document's authenticity on the public verification page.

## Tips

- Delivery challans update inventory when processed
- Gate passes provide an audit trail for security
- Both can be printed directly from the system with QR verification codes
- Use the ad-hoc party feature for one-time visitors or suppliers not yet in the system
- Items selected from inventory maintain proper stock tracking`,
        tags: ["delivery challan", "gate pass", "dispatch", "security", "outward", "qr code", "verification", "ad-hoc party"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["inv-items", "inv-warehouses", "sys-printing"],
      },
      {
        id: "inv-lot-tracking",
        title: "Lot and Batch Traceability",
        content: `# Lot and Batch Traceability

## Overview
Track materials by lot or batch number from receipt through production to finished goods.

## How It Works

1. When receiving goods via GRN, assign a **Lot Number**
2. The system tracks which lots are used in which production orders
3. If a quality issue is found, trace back to the original lot

## Viewing Lot History

1. Go to **Inventory > Lot Traceability**
2. Search by lot number
3. View the complete chain: Supplier → GRN → Production Order → Finished Goods

## Tips

- Essential for quality management and recall traceability
- Use lot tracking for all fabrics and critical trims`,
        tags: ["lot", "batch", "traceability", "tracking", "quality"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["inv-items", "quality-inspections"],
      },
    ],
  },
  {
    id: "manufacturing",
    module: "Manufacturing",
    title: "Manufacturing & Production",
    icon: "Factory",
    description: "Production planning, cutting, sewing, finishing, and IE efficiency.",
    articles: [
      {
        id: "mfg-production",
        title: "Production Overview",
        content: `# Production Overview

## Overview
The Production module manages the entire manufacturing process from planning through finishing and packing.

## Production Flow

1. **Planning** — create production orders and allocate resources
2. **Cutting** — cut fabric into garment components
3. **Sewing** — assemble cut pieces into garments
4. **Finishing & Packing** — final finishing, QC, and packing

## Creating a Production Order

1. Go to **Manufacturing > Production Overview**
2. Click **New Production Order**
3. Link to a sales order
4. Define quantity, target dates, and production line
5. Click **Save**

## Tips

- Production orders automatically pull BOM data from the linked sales order
- Track progress at each stage through the dashboard
- Use the IE (Industrial Engineering) module for efficiency tracking`,
        tags: ["production", "manufacturing", "production order", "factory"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["mfg-cutting", "mfg-sewing", "mfg-finishing"],
      },
      {
        id: "mfg-planning",
        title: "Production Planning",
        content: `# Production Planning

## Overview
Plan production capacity, schedule orders to lines, and manage resource allocation.

## How to Plan

1. Go to **Manufacturing > Planning**
2. View the capacity calendar showing line availability
3. Drag and drop orders to assign them to production lines
4. Set start and end dates for each operation

## Advanced Planning

For complex scheduling:
1. Go to **Manufacturing > Advanced Planning**
2. Use the AI-powered optimization for line balancing
3. Consider skill matrix and machine availability

## Tips

- Plan at least 2 weeks ahead for smooth operations
- Balance line loading to avoid bottlenecks
- Review TNA plans alongside production planning`,
        tags: ["planning", "capacity", "scheduling", "line balancing", "production lines"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["mfg-production", "merch-tna"],
      },
      {
        id: "mfg-cutting",
        title: "Cutting Operations",
        content: `# Cutting Operations

## Overview
Manage the cutting room — from spreading and cutting orders to issuing cut bundles to sewing lines.

## How to Use

1. Go to **Manufacturing > Cutting**
2. View cutting orders derived from production orders
3. Record:
   - Fabric layers and spreading details
   - Cut pieces by size and color
   - Bundle generation
4. Issue bundles to sewing lines

## Tips

- Track cutting waste against BOM estimates
- Generate bundle barcodes for sewing floor tracking
- Record reject/damaged pieces immediately`,
        tags: ["cutting", "cutting room", "bundles", "spreading", "fabric"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["mfg-production", "mfg-sewing"],
      },
      {
        id: "mfg-sewing",
        title: "Sewing Operations",
        content: `# Sewing Operations

## Overview
Track sewing line performance, bundle progress, and operator efficiency.

## How to Use

1. Go to **Manufacturing > Sewing**
2. Select the production line
3. Scan or enter bundles as they progress through operations
4. Track hourly output, line efficiency, and defect rates

## Tips

- Use barcode scanning for real-time bundle tracking
- Monitor line efficiency against SMV targets
- Address bottlenecks identified by the IE module`,
        tags: ["sewing", "sewing line", "bundles", "efficiency", "operators"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["mfg-cutting", "mfg-finishing", "mfg-ie"],
      },
      {
        id: "mfg-finishing",
        title: "Finishing and Packing",
        content: `# Finishing and Packing

## Overview
Manage the final stages of production — finishing, pressing, folding, and packing into cartons.

## How to Use

1. Go to **Manufacturing > Finishing/Packing**
2. Record finishing operations:
   - Thread trimming, washing, pressing
   - Quality spot checks
3. Create packing lists:
   - Assign garments to cartons by size and color
   - Record carton dimensions and weights
   - Generate packing list for shipment

## Tips

- Ensure all garments pass final QC before packing
- Match packing ratios to buyer specifications
- Link packing lists to shipment documentation`,
        tags: ["finishing", "packing", "cartons", "pressing", "packing list"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["mfg-sewing", "quality-inspections", "comm-shipments"],
      },
      {
        id: "mfg-ie",
        title: "IE and Efficiency Tracking",
        content: `# IE and Efficiency Tracking

## Overview
Industrial Engineering (IE) tools help monitor and improve production line efficiency.

## Key Metrics

- **SMV** (Standard Minute Value) — time standard for each operation
- **Line Efficiency** — actual output vs. theoretical capacity
- **Operator Performance** — individual operator productivity

## How to Use

1. Go to **Manufacturing > IE**
2. View real-time line efficiency dashboards
3. Set SMV targets for operations
4. Track actual vs. standard performance

## Tips

- Use efficiency data to identify training needs
- Balance operations to minimize waiting time between stations
- Review daily efficiency trends in team meetings`,
        tags: ["IE", "industrial engineering", "efficiency", "SMV", "productivity"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["mfg-sewing", "mfg-planning"],
      },
    ],
  },
  {
    id: "quality",
    module: "Quality",
    title: "Quality Management",
    icon: "Shield",
    description: "QC inspections, lab tests, CAPA, and returns management.",
    articles: [
      {
        id: "quality-dashboard",
        title: "QC Dashboard",
        content: `# QC Dashboard

## Overview
The QC Dashboard provides a real-time overview of quality metrics across all production orders.

## Key Metrics

- **Pass Rate** — percentage of inspections passing
- **Defect Rate** — defects per hundred units (DHU)
- **Top Defects** — most common defect types
- **Inspection Coverage** — percentage of production inspected

## How to Use

1. Go to **Quality > QC Dashboard**
2. View summary cards and trend charts
3. Drill down by order, line, or defect type

## Tips

- Set quality targets and monitor against them
- Use trend analysis to identify recurring issues
- Share dashboard in quality review meetings`,
        tags: ["QC", "quality dashboard", "defect rate", "pass rate", "metrics"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["quality-inspections", "quality-capa"],
      },
      {
        id: "quality-inspections",
        title: "Managing Inspections",
        content: `# Managing Inspections

## Overview
Record and manage inline, endline, and final inspections throughout the production process.

## Creating an Inspection

1. Go to **Quality > Inspections**
2. Click **New Inspection**
3. Select:
   - **Type** — Inline, Endline, Final, Pre-shipment
   - **Production Order** — link to the order being inspected
   - **Line/Stage** — where the inspection occurs
4. Record findings:
   - Sample size and accepted/rejected counts
   - Defect details (type, quantity, severity)
   - Overall pass/fail result
5. Click **Save**

## Tips

- Use AQL standards for sampling
- Photograph defects for reference
- Failed inspections should trigger CAPA actions`,
        tags: ["inspections", "inline", "endline", "final inspection", "AQL", "defects"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["quality-dashboard", "quality-capa"],
      },
      {
        id: "quality-capa",
        title: "CAPA (Corrective & Preventive Actions)",
        content: `# CAPA

## Overview
CAPA tracks corrective actions for quality issues and preventive actions to avoid recurrence.

## Creating a CAPA

1. Go to **Quality > CAPA**
2. Click **New CAPA**
3. Describe the issue, root cause analysis, and planned actions
4. Assign responsible persons and target dates
5. Track completion status

## Tips

- Link CAPAs to specific inspections or returns
- Follow up on open CAPAs regularly
- Use CAPA data to improve processes over time`,
        tags: ["CAPA", "corrective action", "preventive action", "root cause", "quality improvement"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["quality-inspections", "quality-dashboard"],
      },
    ],
  },
  {
    id: "commercial",
    module: "Commercial",
    title: "Commercial & Logistics",
    icon: "Globe",
    description: "Shipments, LC management, and documentation.",
    articles: [
      {
        id: "comm-shipments",
        title: "Shipment Management",
        content: `# Shipment Management

## Overview
Manage the export/import process from booking to delivery, including all documentation.

## Creating a Shipment

1. Go to **Merchandising > Commercial**
2. Click **New Shipment**
3. Link to a sales order
4. Enter shipping details:
   - Shipping line, vessel name
   - Port of loading and discharge
   - ETD (Expected Time of Departure) and ETA
   - Container details
5. Click **Save**

## Documentation Checklist

Each shipment has a required documents checklist:
- Commercial Invoice
- Packing List
- Bill of Lading
- Certificate of Origin
- GSP Form
- Inspection Certificate
- Beneficiary Certificate
- Customs Declaration

Mark each document as complete with the checkbox. The system shows completion percentage and warns if you try to mark a shipment as "Shipped" without completing required documents.

## Status Flow

- **Planned** → **Booked** → **Loaded** → **Shipped** → **In Transit** → **Delivered**

## Tips

- Complete all required documentation before marking as shipped
- Track shipments using the tracking reference number
- Link shipment documents to the commercial LC`,
        tags: ["shipments", "shipping", "documentation", "bill of lading", "container", "export"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["comm-lc", "sales-orders"],
      },
      {
        id: "comm-lc",
        title: "LC (Letter of Credit) Management",
        content: `# LC Management

## Overview
Track Letters of Credit from issuance to closure, including amendments and utilization.

## How to Use

1. Go to **Merchandising > Commercial**
2. View active LCs with their status and expiry dates
3. Track:
   - LC number and value
   - Issuing and advising banks
   - Expiry date (alerts appear 30 days before expiry)
   - Document requirements
   - Utilization against shipments

## Tips

- The Critical Alerts Dashboard warns about expiring LCs
- Match LC terms with shipment documentation carefully
- Track amendment history for audit purposes`,
        tags: ["LC", "letter of credit", "banking", "export documents", "expiry"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["comm-shipments", "merch-alerts"],
      },
    ],
  },
  {
    id: "export-lc",
    module: "Export & Import",
    title: "Export & Import Management",
    icon: "Globe",
    description: "Export cases, proforma invoices, BTB LCs, FX receipts, and order follow-up lifecycle.",
    articles: [
      {
        id: "ec-export-cases",
        title: "Export Case Management",
        content: `# Export Case Management

## Overview
Export Cases group orders under a master export LC for finance and commercial tracking. They represent the lifecycle of an export transaction from LC opening to settlement.

## Creating an Export Case

1. Go to **Export & Import > Export Cases**
2. Click **New Export Case**
3. Select the buyer and currency
4. Choose the **Payment Mode** (LC, TT, DP, DA, CAD, or Mixed) to indicate the payment mechanism
5. Set **Expected Realization Days** — the number of days from shipment to expected FX receipt
6. The system assigns a case number (EC-XXX format)
7. Link orders and the master LC to the case

## Status Flow

- **DRAFT** → **ACTIVE** → **SHIPPED** → **DOCS_SUBMITTED** → **NEGOTIATED** → **SETTLED** → **CLOSED**

## Key Features

- Link multiple orders to a single export case
- Track proforma invoices and BTB LCs under each case
- Monitor FX receipts and settlements
- View complete timeline from order to realization
- **Payment Mode** helps categorize export transactions for reporting
- **Expected Realization Days** feeds into Cash Flow Forecasting for FX receipt projections

## Tips

- Use the detail page tabs to navigate between Orders, PI, BTB LCs, FX, and Timeline
- Status transitions are available as buttons on the detail page
- Payment mode and realization days are shown in the detail page summary cards`,
        tags: ["export case", "LC", "export", "commercial", "orders", "settlement"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["ec-pi", "ec-btb", "ec-fx", "ec-followup"],
      },
      {
        id: "ec-pi",
        title: "Proforma Invoices",
        content: `# Proforma Invoices (PI)

## Overview
Proforma Invoices combine orders into formal documents sent to buyers before the commercial invoice.

## Creating a PI

1. Go to **Export & Import > Proforma Invoices**
2. Click **New PI**
3. Select the buyer, issue date, and currency
4. Add shipping and payment terms
5. The system assigns a PI number (PI-XXX format)

## Status Flow

- **DRAFT** → **SENT** → **ACCEPTED** / **REVISED** / **EXPIRED**

## Line Item Linking

When adding lines to a PI, you can optionally link each line to:
- A specific **Order** — to track which order the PI line relates to
- A specific **Order Line Item** — for granular traceability to the exact item within an order

This ensures end-to-end traceability from PI lines back to individual sales order items.

## Tips

- Link PIs to export cases for complete tracking
- PIs can be revised and reissued if buyer requests changes
- Track PI acceptance status for order confirmation workflow
- Use the order line item selector when adding PI lines to maintain item-level traceability`,
        tags: ["proforma invoice", "PI", "buyer", "commercial", "pricing"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["ec-export-cases", "sales-orders"],
      },
      {
        id: "ec-btb",
        title: "Back-to-Back LCs",
        content: `# Back-to-Back LCs

## Overview
BTB LCs are opened against master export LCs for purchasing raw materials and services from suppliers.

## Creating a BTB LC

1. Go to **Export & Import > BTB LCs**
2. Click **New BTB LC**
3. Enter the amount, currency, and link to an export case
4. Set open date, expiry date, and maturity date
5. The system assigns a BTB number (BTB-XXX format)

## Status Flow

- **DRAFT** → **OPENED** → **DOCS_RECEIVED** → **ACCEPTED** → **MATURED** → **PAID** → **SETTLED**

## Maturity Alerts

The system shows color-coded maturity warnings:
- **Red**: 7 days or less to maturity
- **Orange**: 14 days or less
- **Yellow**: 30 days or less
- **Green**: More than 30 days

## Tips

- Monitor the alerts badge on the BTB LCs list page
- Maturity information feeds into the Cash Flow Forecast
- Link BTB payments to FX settlements for full reconciliation`,
        tags: ["BTB", "back-to-back", "LC", "maturity", "supplier", "payment"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["ec-export-cases", "ec-fx"],
      },
      {
        id: "ec-fx",
        title: "FX Receipts & Settlement",
        content: `# FX Receipts & Settlement

## Overview
Track foreign currency receipts from export realization and allocate them against BTB maturities, bank charges, and other outflows.

## Recording an FX Receipt

1. Go to **Finance > FX Receipts**
2. Click **Record FX Receipt**
3. Enter receipt date, amount (in foreign currency), exchange rate
4. Optionally link to an export case and enter bank charges
5. The system calculates BDT equivalent and net amount

## Settlement Allocation

1. Click the arrow on any FX receipt row to open the settlement page
2. Select settlement type: BTB Payment, CD Account, Local Payment, Bank Charges, or Commission
3. Enter the BDT amount and link to a BTB LC if applicable
4. The system tracks settled vs. unsettled balance

## Dashboard Cards

- **Total FX Received**: Sum of all foreign currency receipts
- **Total BDT Value**: Converted total at actual exchange rates
- **Unsettled Balance**: FX not yet allocated to payments

## Tips

- Settle FX receipts promptly to maintain accurate cash position
- Link settlements to specific BTB LCs for audit trail
- The unsettled balance feeds into Cash Flow Forecast`,
        tags: ["FX", "foreign exchange", "settlement", "receipt", "bank", "BTB payment"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["ec-btb", "ec-export-cases", "fin-cash-forecast"],
      },
      {
        id: "ec-followup",
        title: "Order Follow-up",
        content: `# Order Follow-up

## Overview
The Order Follow-up page provides a unified timeline view tracking orders from inquiry to export realization, with two reference systems.

## Two View Modes

### Style View
Select a garment style to see its complete lifecycle:
- Inquiry → Quotation → Purchase Order → PI → Export Case → BTB LC → Shipment → FX Receipt

### Export LC View
Select an export case to see the financial lifecycle:
- Export Case → LC → Orders → PI → BTB LCs → Shipments → FX Receipts

## Search

Use the search bar to find by Style No, PO No, PI No, LC No, BTB No, BL No, or Invoice No. Results are clickable and switch to the appropriate view.

## Alerts Panel

The right sidebar shows active alerts including:
- BTB LC maturities approaching
- Pending shipments
- Overdue documents

## Tips

- Access from **Merchandising > Order Follow-up**
- Business type awareness: Buying houses see commercial focus, manufacturers see production stages too
- Use this as your daily operational dashboard for export tracking`,
        tags: ["follow-up", "timeline", "style view", "export LC view", "tracking", "alerts"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["ec-export-cases", "ec-btb", "ec-fx"],
      },
    ],
  },
  {
    id: "finance",
    module: "Finance",
    title: "Finance & Accounting",
    icon: "Calculator",
    description: "Chart of accounts, vouchers, budgets, and financial reports.",
    articles: [
      {
        id: "fin-coa",
        title: "Chart of Accounts",
        content: `# Chart of Accounts

## Overview
The Chart of Accounts (COA) organizes all financial accounts into a hierarchical structure.

## Structure

- **Account Groups** — top-level categories (Assets, Liabilities, Income, Expenses)
- **Ledger Accounts** — individual accounts within groups (Cash, Bank, Sales Revenue, etc.)

## Managing Accounts

1. Go to **Finance > Chart of Accounts**
2. View the account tree structure
3. Click **Add Account** to create new ledger accounts
4. Specify: account name, code, type, and parent group

## Tips

- Follow standard accounting practices for your industry
- Don't delete accounts that have transactions — make them inactive instead
- Use account groups for organized financial reporting`,
        tags: ["chart of accounts", "COA", "ledger", "account groups", "accounting"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-vouchers", "fin-reports"],
      },
      {
        id: "fin-vouchers",
        title: "Voucher Management",
        content: `# Voucher Management

## Overview
Vouchers are the primary way to record financial transactions in Prime7. Types include Journal, Payment, Receipt, and Contra vouchers.

## Creating a Voucher

1. Go to **Finance > Vouchers**
2. Click **New Voucher**
3. Select voucher type:
   - **Journal** — general entries (debit one account, credit another)
   - **Payment** — money going out
   - **Receipt** — money coming in
   - **Contra** — transfers between cash/bank accounts
4. Enter date, narration, and line items
5. Ensure debits equal credits
6. Click **Save**

## Approval Workflow

Vouchers follow an approval workflow:
1. **Draft** — created but not submitted
2. **Pending Approval** — submitted for review
3. **Approved** — approved by authorized person
4. **Posted** — finalized and posted to ledger

## Immutability Rule

Once a voucher is posted:
- It cannot be edited or deleted
- To correct errors, create a **Reversal** voucher
- Then create a new correct voucher

## Tips

- Use the AI Voucher Assistant for help with complex entries
- The Day Book shows all vouchers for a given date range
- Always include clear narrations for audit purposes`,
        tags: ["vouchers", "journal", "payment", "receipt", "contra", "approval", "posting"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-coa", "fin-reports", "workflow-approvals"],
      },
      {
        id: "fin-multicurrency",
        title: "Multi-Currency Transactions",
        content: `# Multi-Currency Transactions

## Overview
Prime7 uses BDT (Bangladeshi Taka) as the base currency but supports transactions in any currency.

## How It Works

1. Go to **Finance > Currency** to manage exchange rates
2. When creating vouchers or orders in foreign currency:
   - Select the transaction currency
   - The system suggests an exchange rate (AI-powered)
   - You can override the rate
   - All amounts are stored in both original currency and BDT equivalent

## Tips

- Update exchange rates regularly for accurate reporting
- The system tracks unrealized gains/losses on outstanding foreign currency balances
- Use the AI exchange rate suggestion for real-time rates`,
        tags: ["multi-currency", "exchange rate", "BDT", "foreign currency", "forex"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-vouchers", "fin-coa"],
      },
      {
        id: "fin-budgets",
        title: "Budgeting",
        content: `# Budgeting

## Overview
Create budgets for departments and cost centers, then track actual spending against budget.

## Creating a Budget

1. Go to **Finance > Budgets > Budget Entry**
2. Select the fiscal year and budget type
3. Enter planned amounts for each account/department
4. Click **Save**

## Budget vs. Actual

1. Go to **Finance > Budgets > Budget vs Actual**
2. View the comparison report showing:
   - Budgeted amount
   - Actual spending
   - Variance (favorable/unfavorable)
   - % utilized

## Tips

- Set budgets at the beginning of each fiscal year
- Review Budget vs. Actual monthly
- Use cost center budgets for order-level tracking`,
        tags: ["budget", "budget vs actual", "variance", "fiscal year", "planning"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-reports", "fin-cost-centers"],
      },
      {
        id: "fin-reports",
        title: "Financial Reports",
        content: `# Financial Reports

## Overview
Access all standard financial reports from the Finance module.

## Available Reports

### Day Book
- All vouchers for a selected date range
- Go to **Finance > Day Book**

### Trial Balance
- Summary of all account balances
- Go to **Finance > Trial Balance**

### Ledger Report
- Detailed transaction history for any account
- Go to **Finance > Ledger Report**

### Financial Statements
- Profit & Loss Statement
- Balance Sheet
- Go to **Finance > Financial Statements**

### Cash Flow
- Cash flow analysis by period
- Go to **Finance > Cash Flow**

### Ratio Analysis
- Key financial ratios (liquidity, profitability, efficiency)
- Go to **Finance > Ratio Analysis**

## Tips

- AI-powered anomaly detection highlights unusual patterns
- Export any report to PDF or Excel
- Use accounting period locks to prevent changes to finalized periods`,
        tags: ["reports", "trial balance", "P&L", "balance sheet", "cash flow", "ledger report"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-vouchers", "fin-coa"],
      },
      {
        id: "fin-cost-centers",
        title: "Cost Center and Job Costing",
        content: `# Cost Center and Job Costing

## Overview
Track costs at the order level using cost centers for precise profitability analysis.

## How It Works

1. Each sales order can be treated as a cost center
2. All expenses (materials, labor, overhead) are tagged to the cost center
3. Revenue from the order is compared against costs

## Viewing Job Cost Sheets

1. Go to **Finance > Cost Center Dashboard**
2. Select an order to see its Job Cost Sheet showing:
   - Material costs (from BOM/consumption)
   - Labor costs (from production)
   - Overhead allocation
   - Total cost vs. revenue
   - Profit margin

## Tips

- Use cost center analysis to identify most/least profitable orders
- Compare actual costs against BOM estimates for continuous improvement`,
        tags: ["cost center", "job costing", "profitability", "cost analysis", "order costs"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-budgets", "merch-consumption"],
      },
      {
        id: "fin-style-profitability",
        title: "Style Profitability Analysis",
        content: `# Style Profitability Analysis

## Overview
Analyze profit margins at the garment style level, comparing revenue against direct costs. Revenue is determined using a smart fallback chain for maximum accuracy.

## Revenue Source Hierarchy

The system automatically picks the most accurate revenue source available:
1. **FX Receipts** (highest fidelity) — actual foreign exchange received in BDT
2. **Sales Invoices** — invoiced amounts from posted sales invoices
3. **Order Value** (fallback) — estimated from confirmed price x quantity

A badge next to the Revenue card shows which source is being used (FX, Invoice, or Order).

## How to Use

1. Go to **Finance > Style Profitability**
2. Select a style from the dropdown
3. View summary cards: Revenue (with source indicator), Direct Costs, Gross Profit, Margin %
4. See cost breakdown by category (materials, labor, overhead, etc.)
5. Review order-level profitability for each order under the style

## Tips

- Styles with negative margins are highlighted in red
- Use this alongside Costing Variance for root cause analysis
- Compare margins across styles to identify most profitable product lines
- The revenue source badge helps you assess data confidence — FX-based is most reliable`,
        tags: ["profitability", "style", "margin", "revenue", "cost analysis"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-lc-profitability", "fin-costing-variance", "fin-cost-centers"],
      },
      {
        id: "fin-lc-profitability",
        title: "LC Profitability Analysis",
        content: `# LC Profitability Analysis

## Overview
Analyze profitability per export case / LC, tracking revenue from FX receipts against costs including BTB payments, bank charges, and commissions.

## How to Use

1. Go to **Finance > LC Profitability**
2. Select an export case from the dropdown
3. View: LC Value, FX Received, BTB Costs, Net Profit, Margin %
4. See detailed revenue and cost breakdown

## Tips

- This gives the financial view of export profitability
- Pair with Style Profitability for a complete picture
- Negative margins may indicate exchange rate losses or high BTB costs`,
        tags: ["profitability", "LC", "export case", "FX", "BTB", "margin"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-style-profitability", "ec-export-cases", "ec-fx"],
      },
      {
        id: "fin-costing-variance",
        title: "Costing Variance Analysis",
        content: `# Costing Variance Analysis

## Overview
Compare estimated (BOM/quotation) costs against actual costs for each style to identify overruns and savings.

## How to Use

1. Go to **Finance > Costing Variance**
2. Select a style from the dropdown
3. View summary: Estimated Cost, Actual Cost, Variance Amount, Variance %
4. See line-item variance for each cost element (fabric, trims, labor, etc.)

## Understanding Variance

- **Positive variance (red)**: Actual cost exceeded estimate — cost overrun
- **Negative variance (green)**: Actual cost below estimate — savings
- Near-zero variance: Estimation was accurate

## Tips

- Focus on high-variance elements for corrective action
- Feed variance insights back into future quotation/BOM estimates
- Regular review helps improve cost estimation accuracy`,
        tags: ["costing", "variance", "estimate", "actual", "overrun", "BOM"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-style-profitability", "merch-bom"],
      },
      {
        id: "fin-cash-forecast",
        title: "Cash Flow Forecast",
        content: `# Cash Flow Forecast

## Overview
Scenario-based cash flow projection incorporating FX receipts, BTB maturities, and local payments.

## Creating a Forecast

1. Go to **Finance > Cash Forecast**
2. Click **New Scenario**
3. Name your scenario (e.g., "Base Case Q2 2026")
4. Set start date and number of months (default: 6)
5. Click **Generate** to populate forecast lines

## Reading the Forecast

The forecast table shows monthly columns:
- **Inflows**: Expected FX receipts from export realization
- **Outflows**: BTB maturities, bank charges, local payments
- **Net**: Monthly net cash position
- **Cumulative**: Running total — negative values indicate potential cash shortfall

## Summary Cards

- **Expected Inflows (6M)**: Total projected foreign currency receipts
- **Expected Outflows (6M)**: Total projected payments
- **Net Cash Flow**: Overall projected position
- **BTB Maturities Due**: Total BTB payments coming due

## Tips

- Create multiple scenarios (optimistic, base, pessimistic) for planning
- Regenerate forecasts after recording new FX receipts or BTB LCs
- Red cumulative values signal periods needing financing attention`,
        tags: ["cash flow", "forecast", "scenario", "BTB maturity", "FX", "projection"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["ec-btb", "ec-fx", "fin-lc-profitability"],
      },
    ],
  },
  {
    id: "banking",
    module: "Finance",
    title: "Banking",
    icon: "DollarSign",
    description: "Bank accounts, reconciliation, and payment runs (under Finance).",
    articles: [
      {
        id: "bank-accounts",
        title: "Bank Account Management",
        content: `# Bank Account Management

## Overview
Manage all company bank accounts and track balances.

## Adding a Bank Account

1. Go to **Finance > Bank Accounts**
2. Click **Add Account**
3. Enter: bank name, account number, branch, currency
4. Link to the corresponding ledger account in COA
5. Click **Save**

## Tips

- Keep bank details updated for accurate reconciliation
- Each bank account should map to a ledger account`,
        tags: ["bank accounts", "banking", "account setup"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["bank-reconciliation", "bank-payments"],
      },
      {
        id: "bank-reconciliation",
        title: "Bank Reconciliation",
        content: `# Bank Reconciliation

## Overview
Match bank statement transactions with system records to identify discrepancies.

## How to Reconcile

1. Go to **Finance > Bank Reconciliation**
2. Select the bank account and period
3. Import or manually enter bank statement entries
4. Match system transactions with bank entries
5. Investigate and resolve unmatched items
6. Finalize the reconciliation

## Tips

- Reconcile monthly for clean books
- Unmatched items may indicate missed entries or timing differences
- The system highlights possible auto-matches`,
        tags: ["bank reconciliation", "matching", "statement", "discrepancies"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["bank-accounts", "fin-vouchers"],
      },
      {
        id: "bank-payments",
        title: "Payment Runs",
        content: `# Payment Runs

## Overview
Process batch payments to suppliers and other payees efficiently.

## Creating a Payment Run

1. Go to **Finance > Payment Runs**
2. Click **New Payment Run**
3. Select pending payables to include
4. Review amounts and bank account
5. Approve and process the payment run

## Tips

- Schedule regular payment runs for vendor payments
- Prioritize payments based on due dates and terms`,
        tags: ["payment runs", "batch payments", "vendor payments", "payables"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["bank-accounts", "bank-reconciliation"],
      },
    ],
  },
  {
    id: "hr",
    module: "HR",
    title: "Human Resources",
    icon: "Users",
    description: "Employee management, payroll, and attendance.",
    articles: [
      {
        id: "hr-employees",
        title: "Employee Management",
        content: `# Employee Management

## Overview
Maintain a centralized database of all employees with their personal, employment, and performance details.

## Adding an Employee

1. Go to **HR > Employees**
2. Click **Add Employee**
3. Fill in personal details, employment details, and department
4. Set salary structure and reporting hierarchy
5. Click **Save**

## Tips

- Keep employee records current for accurate payroll
- Use the performance module for periodic reviews`,
        tags: ["employees", "HR", "staff", "personnel", "department"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["hr-payroll", "hr-attendance"],
      },
      {
        id: "hr-payroll",
        title: "Payroll Processing",
        content: `# Payroll Processing

## Overview
Process monthly salaries including allowances, deductions, and statutory contributions.

## Running Payroll

1. Go to **HR > Payroll**
2. Select the pay period (month/year)
3. Review salary components:
   - Basic salary
   - Allowances (house rent, transport, medical)
   - Deductions (tax, provident fund, advances)
   - Overtime and bonuses
4. Generate payslips
5. Approve and finalize

## Employee Advances

- Track salary advances given to employees
- Advances are auto-deducted from future payroll runs

## Tips

- Process payroll on a consistent schedule
- Review statutory deductions annually for compliance
- Generate payslips for employee records`,
        tags: ["payroll", "salary", "payslips", "deductions", "allowances"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["hr-employees", "hr-attendance"],
      },
      {
        id: "hr-attendance",
        title: "Attendance Tracking",
        content: `# Attendance Tracking

## Overview
Track daily attendance, leaves, and absences for all employees.

## How to Use

1. Go to **HR > Attendance**
2. Mark daily attendance (Present, Absent, Leave, Half-day)
3. View attendance summaries by employee or department
4. Generate monthly attendance reports

## Tips

- Attendance data feeds into payroll calculations
- Track leave balances for each employee`,
        tags: ["attendance", "leave", "present", "absent", "time tracking"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["hr-employees", "hr-payroll"],
      },
    ],
  },
  {
    id: "workflow",
    module: "Workflow",
    title: "Workflow & Approvals",
    icon: "UserCheck",
    description: "Multi-level approval workflows and task management.",
    articles: [
      {
        id: "workflow-approvals",
        title: "Approval Queue and Workflows",
        content: `# Approval Queue and Workflows

## Overview
Prime7 uses multi-level approval workflows for financial documents, purchase orders, and other sensitive operations.

## How Approvals Work

1. A user creates a document (voucher, PO, etc.) and submits it for approval
2. The document enters the **Approval Queue**
3. Designated approvers see the item in their queue
4. Approver reviews and either **Approves** or **Rejects** with comments
5. For multi-level approvals, the document moves to the next approver
6. Once fully approved, the document can be processed/posted

## Viewing Your Approval Queue

1. Go to **Workflow > Approvals** from the sidebar
2. See all items pending your approval
3. Click any item to review details
4. Approve or reject with comments

## Amount-Based Routing

Approvals can be configured with amount thresholds:
- Small amounts → single-level approval
- Large amounts → multi-level (e.g., manager → director → finance head)

## Tips

- Check your approval queue daily
- Provide clear comments when rejecting — it helps the requester correct and resubmit
- Segregation of duties is enforced — the same person cannot create and approve`,
        tags: ["approvals", "workflow", "approval queue", "multi-level", "segregation of duties"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-vouchers", "inv-purchase-orders"],
      },
    ],
  },
  {
    id: "ai-tools",
    module: "AI Tools",
    title: "AI Tools",
    icon: "Bot",
    description: "AI Assistant and AI-powered automation features.",
    articles: [
      {
        id: "ai-assistant",
        title: "Using the AI Assistant",
        content: `# AI Assistant

## Overview
The AI Assistant is a conversational tool that helps you query data, get insights, and navigate the ERP system.

## How to Use

1. Go to **AI Tools > AI Assistant** from the sidebar
2. Type your question in natural language, for example:
   - "What are my top 5 customers by revenue?"
   - "Show me overdue orders"
   - "What's my current inventory value?"
3. The AI analyzes your data and provides answers

## Capabilities

- **Data Queries** — ask about orders, inventory, customers, finances
- **Insights** — get AI-generated analysis and recommendations
- **Navigation Help** — ask "where do I find..." to get guided to the right page

## Tips

- Be specific in your questions for better answers
- The AI uses your actual business data (respecting your tenant's data isolation)
- Use it for quick data lookups instead of building complex reports`,
        tags: ["AI", "assistant", "chatbot", "natural language", "data queries"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["ai-automation"],
      },
      {
        id: "ai-automation",
        title: "AI Automation Features",
        content: `# AI Automation

## Overview
AI-powered features that automate routine tasks and provide intelligent suggestions.

## Available Automations

### AI BOM Suggestion
- When creating a BOM, the AI suggests materials based on similar styles
- Saves time and reduces errors

### AI Exchange Rate
- Suggests current exchange rates for multi-currency transactions
- Based on real-time market data

### Financial Anomaly Detection
- Automatically scans financial data for unusual patterns
- Alerts on suspicious transactions or trends

### Demand Forecasting
- Predicts future demand based on historical data
- Helps with production planning and inventory management

### Smart Recommendations
- Inventory reorder suggestions
- Production scheduling optimization
- Customer insights and segmentation

## Tips

- AI features improve with more data — the more you use the system, the better suggestions become
- Always review AI suggestions before acting on them
- AI insights are available in reports and dashboards`,
        tags: ["AI", "automation", "BOM suggestion", "forecasting", "anomaly detection"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["ai-assistant", "merch-bom"],
      },
      {
        id: "ai-predictions",
        title: "AI Predictions Dashboard",
        content: `# AI Predictions Dashboard

## Overview
Get AI-powered predictions for cash flow, demand forecasting, and cost optimization.

## Available Predictions

### Cash Flow Prediction
- AI analyzes FX receipts, BTB maturities, and order pipeline
- Provides projected cash position with confidence levels

### Demand Forecasting
- Predicts future order volumes based on historical data and buyer patterns
- Includes seasonal trends and growth projections

### Cost Optimization
- Identifies cost-saving opportunities across materials, production, and logistics
- Recommends actions with estimated savings

## How to Use

1. Go to **AI Tools > AI Predictions**
2. Click **Generate** on any prediction card
3. Wait for the AI to analyze your data
4. Review the summary, predictions, and recommendations

## Tips

- Generate predictions regularly for the most current insights
- Predictions improve with more historical data in the system
- Use cash flow predictions alongside the manual Cash Forecast tool
- Each prediction shows confidence level (high, medium, low) and generation timestamp`,
        tags: ["AI", "predictions", "cash flow", "demand", "cost optimization", "forecasting"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["ai-automation", "fin-cash-forecast"],
      },
    ],
  },
  {
    id: "system",
    module: "System",
    title: "System Administration",
    icon: "Settings",
    description: "User management, roles, permissions, and system configuration.",
    articles: [
      {
        id: "sys-settings",
        title: "System Settings Overview",
        content: `# System Settings

## Overview
System Settings allow administrators to configure the application for their organization.

## How to Access

Go to **System > Settings** from the sidebar.

## Available Settings

### General Settings
- Company name and details
- Default currency and timezone
- Document numbering sequences

### Business Type
- Set your organization type: Buying House, Manufacturer, or Both
- Controls sidebar module visibility

### Configuration
- Ledger mappings for automated posting
- Warehouse defaults
- Approval policies and thresholds

## Tips

- Only super users can access system settings
- Changes take effect immediately for all users
- Review settings periodically as your business evolves`,
        tags: ["settings", "configuration", "system", "admin", "company setup"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sys-users", "sys-roles", "gs-business-type"],
      },
      {
        id: "sys-users",
        title: "User Management",
        content: `# User Management

## Overview
Create and manage user accounts, assign roles, and control access.

## Adding a User

1. Go to **System > User Mgmt** (super user only)
2. Click **Add User**
3. Enter: username, email, first name, last name
4. Set a temporary password
5. Assign one or more **Roles** (see Roles & Permissions)
6. Click **Save**

## Managing Users

- **Deactivate** a user to revoke access without deleting their account
- **Reset Password** for users who forgot their credentials
- **Change Roles** to update permissions

## Tips

- Follow the principle of least privilege — assign minimum required roles
- Deactivate accounts promptly when employees leave
- Use the audit log to monitor user activities`,
        tags: ["users", "user management", "accounts", "access control", "admin"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sys-roles", "sys-settings"],
      },
      {
        id: "sys-roles",
        title: "Roles and Permissions",
        content: `# Roles and Permissions

## Overview
Role-Based Access Control (RBAC) ensures users only see and do what they're authorized for.

## How Roles Work

- Each role defines a set of permissions (view, create, edit, delete, approve)
- Users can have multiple roles
- Permissions are additive — if any role grants access, the user has it

## Managing Roles

1. Go to **System > Roles** (super user only)
2. View existing roles and their permissions
3. Click **New Role** to create a custom role
4. Check/uncheck permissions for each module
5. Click **Save**

## Common Roles

- **Super User** — full access to everything
- **Merchandiser** — access to Sales, Merchandising, and Samples
- **Accountant** — access to Finance (including Banking) and Reports
- **Production Manager** — access to Manufacturing modules
- **QC Inspector** — access to Quality module

## Tips

- Create custom roles matching your organizational structure
- Review role assignments periodically
- Use report access flags for sensitive financial reports`,
        tags: ["roles", "permissions", "RBAC", "access control", "authorization"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sys-users", "sys-settings"],
      },
      {
        id: "sys-business-type",
        title: "Business Type Configuration",
        content: `# Business Type Configuration

## Overview
The Business Type setting controls which modules appear in the sidebar for all users in your organization.

## Options

1. **Buying House** — Shows Sales, Commercial, Merchandising, Finance, and HR. Hides factory floor modules (Cutting, Sewing, Finishing, IE)
2. **Manufacturer** — Shows all modules including full production floor capabilities
3. **Both** — Shows everything (default)

## How to Change

1. Go to **System > Settings**
2. Click the **Business Type** tab
3. Select your business type
4. Click **Save Changes**

## Important

- Only super users can change this setting
- Takes effect immediately for all users
- No data is deleted — modules are just hidden from the sidebar
- Users with direct URLs can still access hidden pages (controlled by role permissions)

## Tips

- Choose the type that best matches your primary operations
- If you're a buying house that occasionally manages production, choose "Both"`,
        tags: ["business type", "buying house", "manufacturer", "module visibility", "sidebar"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["gs-business-type", "gs-navigation"],
      },
      {
        id: "sys-backup",
        title: "Backup & Restore",
        content: `# Backup & Restore

## Overview
Prime7 ERP provides a comprehensive backup and restore system to protect your business data. You can create manual backups, schedule automatic backups, download backup files, and restore data when needed.

## Creating a Manual Backup

1. Go to **System > Backup & Restore** from the sidebar
2. Click **Create Full Backup**
3. The system will create a complete backup of all your data including master data, transactions, settings, and configurations
4. Once complete, the backup appears in the Saved Backups list with its size and record counts

## Automatic Backups

1. In the Backup & Restore page, find the **Auto-Backup Settings** section
2. Toggle **Enable automatic backups** on
3. Choose frequency: **Daily** or **Weekly**
4. Auto-backups run at 3:30 AM UTC and the system keeps the last 7 copies automatically
5. Click **Save Settings**

## Downloading a Backup

1. In the Saved Backups list, find the backup you want
2. Click the **Download** button
3. The backup is saved as a JSON file that you can store externally

## Restoring from a Backup

### From a Saved Backup
1. Find the backup in the Saved Backups list
2. Click **Restore**
3. Confirm the restoration in the dialog
4. The system will update your data to match the backup

### From an External File
1. Scroll to the **Restore from External File** section
2. Drag and drop or browse for a .json backup file
3. The system validates the file format and shows a preview
4. Click **Restore Data** and confirm

## Tips

- Create a manual backup before making major changes
- Auto-backups ensure you always have recent data to fall back on
- Only super users can create backups and perform restores
- Backup files contain all modules: customers, vendors, items, vouchers, orders, HR data, and more`,
        tags: ["backup", "restore", "data protection", "auto-backup", "download", "recovery"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sys-settings"],
      },
      {
        id: "sys-printing",
        title: "Printing Documents",
        content: `# Printing Documents

## Overview
Prime7 ERP generates professional A4 print layouts for all major documents. Printed documents include your company header, document details, and QR verification codes.

## What Can Be Printed

- **Vouchers** — all voucher types (payment, receipt, journal, contra)
- **Delivery Challans** — goods dispatch documents
- **Gate Passes** — inward and outward passes for security
- **Financial Reports** — trial balance, ledger, P&L, balance sheet, cash flow
- **Cheques** — bank cheques on pre-printed forms (see Cheque Printing below)

## How to Print

1. Open the document you want to print (e.g., a voucher)
2. Click the **Print** button in the action bar
3. The print preview opens with your company header, document details, and signature blocks
4. Click **Print** again or use Ctrl+P to send to your printer

## QR Code Verification

When documents like vouchers, gate passes, and delivery challans are finalized:
- A unique **QR code** is automatically added to the printed document
- Anyone can scan this QR code with their phone
- It opens a public verification page showing the document's authenticity, number, date, and status
- No login required to verify — perfect for external parties

## Cheque Printing

For printing on pre-printed bank cheques:
1. Go to **System > Cheque Templates** to set up your bank's cheque format
2. Upload a scanned image of a blank cheque
3. Position the fields (date, payee, amount) on the cheque image
4. When creating a payment voucher, click **Print Cheque** to print directly on the cheque

## Tips

- All prints include your company name, address, and logo from Settings
- Page numbers are added automatically for multi-page documents
- The app version is shown in the print footer for audit purposes`,
        tags: ["print", "printing", "QR code", "verification", "cheque", "A4", "documents"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-vouchers", "inv-delivery", "sys-cheque"],
      },
      {
        id: "sys-cheque",
        title: "Cheque Template Setup",
        content: `# Cheque Template Setup

## Overview
Configure cheque templates for your bank accounts so you can print on pre-printed bank cheques directly from Prime7 ERP.

## Setting Up a Template

1. Go to **System > Cheque Templates** from the sidebar
2. Click **Create Template**
3. Select the **bank account** this template is for
4. Enter a template name (e.g., "BRAC Bank Gulshan Branch")
5. Upload a scanned image of a blank cheque (JPG or PNG, high resolution recommended)
6. Position each field on the cheque:
   - **Date** — where the date should print
   - **Payee Name** — where the recipient name goes
   - **Amount in Words** — the written amount area
   - **Amount in Figures** — the numeric amount box
7. Adjust font sizes for each field
8. Use the **live preview** to verify positioning with sample data
9. Click **Save**

## Printing a Cheque

1. Create or open a **payment** or **contra** voucher
2. After saving, you'll see a prompt to print a cheque
3. Or click the **Print Cheque** button on the voucher view page
4. The cheque prints with all fields positioned exactly on your bank's cheque form

## Tips

- Use a high-resolution scan (2000+ pixels wide) for best print quality
- Each bank account can have its own template
- Field positions are stored as percentages, so they scale correctly
- Test with a plain paper first before using actual cheque leaves`,
        tags: ["cheque", "check", "bank", "template", "printing", "payment"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sys-printing", "fin-vouchers"],
      },
      {
        id: "sys-export",
        title: "Exporting Data",
        content: `# Exporting Data

## Overview
Export your data from major list pages in CSV or Excel format for external analysis, reporting, or record-keeping.

## How to Export

1. Navigate to any list page that supports export (see below)
2. Click the **Export** button in the page header
3. Choose **CSV** or **Excel** format
4. The file downloads automatically with all visible data

## Pages with Export

- **Orders** — order number, buyer, quantity, value, status, dates
- **Customers** — name, code, type, contact info
- **Vouchers** — voucher number, type, date, party, amount, status
- **Items & Stock** — item code, name, category, unit, stock level, value
- **Inventory Movements** — date, item, warehouse, type, quantity, balance
- **Payroll** — employee, period, gross pay, deductions, net pay

## Tips

- Excel format preserves number formatting and is best for analysis
- CSV format is universal and works with any spreadsheet application
- Export includes all records matching your current filters
- Use exports for creating custom reports or sharing data with stakeholders`,
        tags: ["export", "CSV", "Excel", "download", "data", "bulk export"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["sys-settings"],
      },
    ],
  },
  {
    id: "reports",
    module: "Reports",
    title: "Reports & Analytics",
    icon: "BarChart3",
    description: "Reconciliation reports, exception tracking, and cashflow calendar.",
    articles: [
      {
        id: "reports-overview",
        title: "Reports Overview",
        content: `# Reports Overview

## Overview
Prime7 provides comprehensive reporting across all modules.

## Report Categories

### Financial Reports
- Day Book, Trial Balance, Ledger Reports
- P&L, Balance Sheet, Cash Flow
- Ratio Analysis
- Available under **Finance** in the sidebar

### Inventory Reports
- Stock Summary, Stock Ledger, Stock Valuation
- Available under **Inventory** in the sidebar

### Reconciliation Reports
- Bank reconciliation
- Inventory reconciliation
- Available under **Reports > Reconciliation**

### Exception Reports
- Automated scanning for anomalies
- Available under **Reports > Exceptions**

### Cashflow Calendar
- Visual calendar showing expected cash inflows and outflows
- Available under **Reports > Cashflow Calendar**

## Tips

- Schedule important reports for regular review
- Use AI-powered anomaly detection for proactive issue identification
- Export reports for sharing with stakeholders`,
        tags: ["reports", "analytics", "reconciliation", "exceptions", "cashflow"],
        lastUpdated: "2026-02-28",
        relatedArticles: ["fin-reports", "bank-reconciliation"],
      },
    ],
  },
  {
    id: "security-audit",
    module: "System",
    title: "Security & Audit",
    icon: "Shield",
    description: "Security hardening, activity logging, and audit trail features for system administrators.",
    articles: [
      {
        id: "sec-activity-logs",
        title: "Activity Logs & Footprint Tracking",
        content: `# Activity Logs & Footprint Tracking

## Overview
The Activity Logs module provides comprehensive tracking of all user actions within Prime7 ERP. Every login, document creation, approval, export, and print action is recorded with full context.

## Accessing Activity Logs
Navigate to **System > Activity Logs** (visible only to super users).

## Features

### Security Overview Dashboard
- **Total Events Today**: Count of all tracked actions
- **Active Users**: Number of unique users active in the last 24 hours
- **Logins Today**: Successful login count
- **Failed Logins**: Failed login attempts (helps detect brute force attacks)

### Log Table
Each log entry includes:
- **Date/Time**: When the action occurred
- **User**: Who performed the action
- **Action**: What was done (CREATE, UPDATE, DELETE, APPROVE, LOGIN, EXPORT, etc.)
- **Entity Type**: What type of record was affected (voucher, order, user, etc.)
- **IP Address**: Where the action originated
- **Details**: Additional context (old/new values for updates)

### Filters
- Date range picker
- User dropdown
- Action type (Create, Update, Delete, Approve, Login, Export, Print)
- Entity type
- Text search

### Color-Coded Badges
- Green: Create actions
- Blue: View/Read actions
- Amber: Update actions
- Red: Delete actions
- Purple: Approve/Workflow actions
- Orange: Export actions
- Gray: Login/Logout actions

## Tips
- Review failed login attempts regularly for security monitoring
- Use date range filters to investigate specific incidents
- Export activity logs to CSV for compliance reporting`,
        tags: ["activity logs", "audit", "security", "footprint", "tracking", "super user"],
        lastUpdated: "2026-03-01",
        relatedArticles: ["sec-super-user-override"],
      },
      {
        id: "sec-super-user-override",
        title: "Super User Override & Hidden Audit",
        content: `# Super User Override & Hidden Audit

## Overview
Super users have automatic override capability that bypasses all workflow guards (Segregation of Duties, approval matrix limits, period locks, permissions). This ensures the super user can always take action when needed, while maintaining a hidden audit trail.

## How It Works

### Automatic Override
- When a super user performs any workflow action, the system automatically applies override
- No additional clicks or confirmations needed
- The "Break Glass" checkbox is hidden for super users
- All workflow actions appear enabled regardless of SoD or permission rules

### Hidden Audit Trail
- Every override action is logged in the audit trail
- Override logs are marked with a special visibility flag
- **Only the super user can see these override logs** in the Activity Logs
- Regular staff members cannot see super user override entries
- This prevents confusion or concern among staff while maintaining full accountability

## Security Considerations
- Override audit logs are immutable and cannot be deleted
- IP address and timestamp are recorded for every override
- The hidden visibility only affects the Activity Logs display — the data is always preserved

## Tips
- Use super user override only when necessary
- Regularly review your own override history in Activity Logs
- Consider delegating routine approvals to appropriate staff with proper permissions`,
        tags: ["super user", "override", "audit", "security", "workflow", "hidden"],
        lastUpdated: "2026-03-01",
        relatedArticles: ["sec-activity-logs", "wf-approval-queue"],
      },
      {
        id: "sec-login-security",
        title: "Login Security & Brute Force Protection",
        content: `# Login Security & Brute Force Protection

## Overview
Prime7 ERP includes comprehensive login security features to protect your organization's data.

## Features

### Failed Login Tracking
- Every failed login attempt is recorded with username, IP address, and reason
- Reasons include: wrong password, user not found, account disabled
- Failed attempts are visible in the Activity Logs security dashboard

### Brute Force Detection
- After 5 failed login attempts from the same IP within 15 minutes, the system flags the activity
- Security stats dashboard highlights suspicious IP addresses
- Helps identify and respond to unauthorized access attempts

### Session Security
- Last login time and IP address are recorded for each user
- Concurrent sessions from different IPs are detected and logged
- Helps identify shared or compromised credentials

### Tenant Isolation
- All queries are tenant-scoped to prevent cross-tenant data access
- Any cross-tenant breach attempt is blocked and logged as a CRITICAL security event
- Database indexes enforce tenant boundaries on all high-traffic tables

## Tips
- Monitor the security dashboard regularly for unusual patterns
- Investigate clusters of failed login attempts from unknown IPs
- Ensure users use strong, unique passwords`,
        tags: ["login", "security", "brute force", "tenant isolation", "session"],
        lastUpdated: "2026-03-01",
        relatedArticles: ["sec-activity-logs"],
      },
    ],
  },
  {
    id: "notifications-workflow",
    module: "Workflow",
    title: "Notifications & Approvals",
    icon: "Bell",
    description: "Real-time notifications, approval queues, and workflow management.",
    articles: [
      {
        id: "wf-realtime-notifications",
        title: "Real-Time Pop-Up Notifications",
        content: `# Real-Time Pop-Up Notifications

## Overview
Prime7 ERP delivers instant notifications when documents transition through workflow steps. When someone approves your voucher, creates an order, or takes any workflow action that affects you, you'll see an instant toast notification.

## How It Works

### Server-Sent Events (SSE)
- The system maintains a live connection to the server
- Notifications are pushed instantly — no page refresh needed
- If the connection drops, it automatically reconnects

### What Triggers Notifications
- Document workflow transitions (submit, check, recommend, approve, post)
- Task assignments
- Approval requests
- Document rejections with comments

### Notification Bell
- The bell icon in the top navigation shows your unread count
- Click it to see your notification history
- Notifications are marked as read when viewed

## Tips
- Keep the browser tab open to receive real-time notifications
- If notifications stop appearing, refresh the page to re-establish the connection
- Check the notification bell regularly if you work in multiple tabs`,
        tags: ["notifications", "real-time", "SSE", "toast", "bell", "workflow"],
        lastUpdated: "2026-03-01",
        relatedArticles: ["wf-approval-queue"],
      },
      {
        id: "wf-approval-queue",
        title: "Role-Aware Approval Queue",
        content: `# Role-Aware Approval Queue

## Overview
The Approval Queue shows you only the documents that need YOUR specific action, organized by authority level.

## Authority-Based Tabs

### Pending My Check
Documents waiting for you to perform the initial check (first review after submission).

### Pending My Recommendation
Documents that have been checked and need your recommendation before final approval.

### Pending My Approval
Documents ready for your final approval based on your authority level and amount limits.

### Ready to Post
Approved documents ready to be posted to the general ledger.

## How It Works
- Each tab shows a count badge with the number of pending items
- You only see tabs relevant to your role and permissions
- Super users see all tabs with access to all pending items
- Clicking a document opens it with the appropriate action buttons

## Tips
- Check your approval queue regularly to avoid workflow bottlenecks
- Use the authority tabs to prioritize your most important actions
- The counts update in real-time as documents flow through the workflow`,
        tags: ["approval", "queue", "workflow", "check", "recommend", "approve", "post"],
        lastUpdated: "2026-03-01",
        relatedArticles: ["wf-realtime-notifications", "sec-super-user-override"],
      },
      {
        id: "wf-idempotency",
        title: "Go-Live Safety: PO/GRN Idempotency & GL Validation",
        content: `# Go-Live Safety: PO/GRN Idempotency & GL Validation

## Overview
Prime7 ERP includes safety features to prevent duplicate entries and ensure data integrity during critical operations.

## PO/GRN Idempotency Guards
- **Double-click protection**: Submitting the same PO or GRN twice will return the existing record instead of creating a duplicate
- **Request ID tracking**: Each creation request can include a unique request ID for idempotency
- **Unique number enforcement**: PO and GRN numbers are unique per tenant with pre-insert validation

## GL Account Validation
- Before a GRN can be completed, the system validates that:
  - Each item's stock group has an Inventory Account configured
  - Each item's stock group has a COGS Account configured
- If any account mapping is missing, a clear error message lists which items/groups need configuration
- This prevents incomplete or incorrect GL postings

## Tips
- Configure stock group GL mappings before processing GRNs
- The double-click protection works transparently — no extra steps needed
- If you see a GL validation error, go to **System > Stock Groups** to configure the missing account mappings`,
        tags: ["idempotency", "safety", "PO", "GRN", "GL", "validation", "go-live"],
        lastUpdated: "2026-03-01",
        relatedArticles: ["wf-approval-queue"],
      },
    ],
  },
  {
    id: "logistics",
    module: "Logistics",
    title: "Logistics & Supply Chain",
    icon: "Truck",
    description: "Manage shipments, import/export tracking, costs, and documents.",
    articles: [
      {
        id: "log-overview",
        title: "Logistics Module Overview",
        content: `# Logistics Module Overview

## What It Does
The Logistics module provides a comprehensive view of your supply chain — from shipment tracking to import/export document management and cost analysis.

## Key Tabs

### Dashboard
- Active shipments count, pending documents, on-time delivery rate, and total trade value
- Charts showing trade volume trends, document status breakdown, and shipping mode distribution
- Quick-access table of active shipments with progress indicators

### Shipment Tracking
- Real-time tracking of all shipments with status badges (scheduled, in transit, delivered)
- Search and filter by shipment reference
- Detail view showing vessel, ports, dates, and container information

### Import/Export Tracking
- Tracks Letters of Credit (LC), Back-to-Back LCs (BTB), Bills of Lading, and export documents
- Analytics tab shows value distribution and status breakdown by category

### Cost Management
- Aggregates costs from purchase orders (procurement), shipments (freight), and LCs (banking fees)
- Cost breakdown charts and filterable cost detail table

### Document Management
- Centralized view of all commercial and shipment documents
- Status tracking, type breakdown, and completion rates

### AI Logistics Insights
- AI-powered analysis based on real supply chain data
- Compliance risk scoring, route optimization suggestions, and expiry alerts

## How to Access
Navigate to **Logistics** in the sidebar. All data comes from your Commercial module entries.`,
        tags: ["logistics", "shipment", "tracking", "supply chain", "import", "export", "LC"],
        lastUpdated: "2026-03-01",
      },
    ],
  },
  {
    id: "manufacturing",
    module: "Manufacturing",
    title: "Manufacturing & Production",
    icon: "Factory",
    description: "Production orders, cutting, sewing, finishing, and quality control.",
    articles: [
      {
        id: "mfg-dashboard",
        title: "Production Dashboard Guide",
        content: `# Production Dashboard Guide

## Overview
The Production Dashboard gives you a real-time view of your manufacturing operations across all departments.

## Key KPIs
- **Total Orders**: Count of all production orders
- **Completed**: Orders that have finished production
- **In Progress**: Orders currently being manufactured
- **Production Rate**: Percentage of orders completed on time

## Department Views
The dashboard shows metrics for each department:
- **Cutting**: Markers created, bundles cut, bundles issued
- **Sewing**: Output quantity, efficiency %, DHU (Defects per Hundred Units)
- **Finishing**: Batches processed, completion rate
- **Packing**: Batches packed, cartons generated

## Charts
- Department-wise production output bar chart
- Efficiency comparison across departments
- Production order status summary with distribution donut chart

## Sub-Pages
- **Cutting**: Marker plans, lay plans, and bundle management
- **Sewing**: Line loading, operation bulletins, and output tracking
- **Finishing & Packing**: Batch management, carton details, and packing lists
- **IE Efficiency**: Industrial engineering metrics and time studies

## Process Orders
Track material transformation processes (dyeing, knitting, finishing) with input/output quantities, wastage tracking, and cost analysis.`,
        tags: ["production", "manufacturing", "cutting", "sewing", "finishing", "packing", "dashboard"],
        lastUpdated: "2026-03-01",
      },
    ],
  },
  {
    id: "quality",
    module: "Quality",
    title: "Quality Management",
    icon: "CheckSquare",
    description: "QC inspections, parameters, lab tests, and CAPA actions.",
    articles: [
      {
        id: "qc-overview",
        title: "Quality Module Overview",
        content: `# Quality Module Overview

## What It Covers
The Quality module manages all quality control activities from incoming material inspection through final audit.

## Key Components

### QC Parameters
Define measurable quality criteria:
- **Stitching Quality (SPI)**: Stitches per inch — target 12 SPI
- **Fabric Weight (GSM)**: Grams per square meter — target 180 GSM
- **Color Fastness**: Washing/rubbing resistance — target grade 4+
- **Measurement Accuracy**: Garment measurement tolerance — within 3mm
- **Seam Strength**: Newton force test — target 120N

### QC Templates
Pre-configured inspection checklists:
- **Inline Inspection**: During production, AQL 2.5
- **Final Inspection**: Pre-shipment, AQL 4.0
- **Fabric Inspection**: Incoming material, AQL 1.5

### QC Inspections
Record inspection results:
- Linked to production orders
- Tracks lot size, sample size, pass/fail quantities
- AQL-based acceptance/rejection
- Results feed into production efficiency calculations

### Lab Tests
External laboratory testing:
- Color fastness, GSM, shrinkage, and other physical tests
- Track sent date, expected date, and results
- Link to specific items and lots

### CAPA Actions
Corrective and Preventive Actions:
- Triggered by inspection failures or lab test issues
- Track root cause, proposed action, and assigned responsibility
- Priority levels and due dates for follow-up`,
        tags: ["quality", "QC", "inspection", "lab test", "CAPA", "AQL", "parameters"],
        lastUpdated: "2026-03-01",
      },
    ],
  },
  {
    id: "reporting",
    module: "Reports",
    title: "Reporting System",
    icon: "BarChart3",
    description: "Comprehensive business reports across all modules.",
    articles: [
      {
        id: "rpt-overview",
        title: "Reports Overview",
        content: `# Reports Overview

## Available Reports

### Financial Reports (under Finance > Reports)
1. **Day Book** — All posted vouchers for a date range
2. **Trial Balance** — Account balances summary
3. **Financial Statements** — Profit & Loss and Balance Sheet
4. **Group Summary** — Account group-wise totals
5. **Ratio Analysis** — Key financial ratios
6. **Cash Flow** — Cash movement analysis

### Business Reports (under Reports section)
7. **Purchase Order Summary** — PO list with status, vendor, amount, delivery dates
8. **GRN Summary** — Goods received with PO reference and quantities
9. **Sales Order Report** — Orders with customer, value, and delivery status
10. **LC Outstanding** — Active Letters of Credit with utilization %
11. **BTB LC Maturity** — Back-to-Back LCs with maturity tracking
12. **Production Efficiency** — Planned vs actual output with efficiency %
13. **QC Summary** — Inspection results, pass rates, and defect analysis
14. **Employee Summary** — Employee list by department and designation
15. **Payroll Summary** — Payroll runs with gross, deductions, and net pay
16. **Shipment Tracking** — Shipments with vessel, ports, and dates
17. **Gate Pass Register** — All gate passes with type and party details
18. **Delivery Challan Register** — Challans with party and item details

### Inventory Reports (under Inventory)
19. **Stock Ledger** — Item-wise movement history
20. **Stock Valuation** — Weighted average stock values
21. **Stock Summary** — Current stock positions

## Common Features
All reports include:
- **Date Range Filters** — Select start and end dates
- **Status Filters** — Filter by document status
- **Search** — Quick search across all columns
- **CSV Export** — Download data as CSV for Excel
- **Print** — Print-friendly layout
- **KPI Cards** — Summary metrics at the top

## How to Access
Navigate to the **Reports** section in the sidebar to see all available reports.`,
        tags: ["reports", "analytics", "export", "CSV", "financial", "inventory", "production", "HR"],
        lastUpdated: "2026-03-01",
      },
    ],
  },
];

export function searchTutorials(query: string): TutorialArticle[] {
  if (!query.trim()) return [];
  const lowerQuery = query.toLowerCase();
  const results: TutorialArticle[] = [];

  for (const section of tutorials) {
    for (const article of section.articles) {
      const matchesTitle = article.title.toLowerCase().includes(lowerQuery);
      const matchesContent = article.content.toLowerCase().includes(lowerQuery);
      const matchesTags = article.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
      if (matchesTitle || matchesContent || matchesTags) {
        results.push(article);
      }
    }
  }

  return results;
}

export function getArticleById(articleId: string): { article: TutorialArticle; section: TutorialSection } | null {
  for (const section of tutorials) {
    const article = section.articles.find(a => a.id === articleId);
    if (article) return { article, section };
  }
  return null;
}

export function getAllArticles(): TutorialArticle[] {
  return tutorials.flatMap(s => s.articles);
}
