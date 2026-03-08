# Prime7 ERP System

## Overview
Prime7 is an AI-driven SaaS ERP system designed for global garment manufacturers and buying houses. Its primary purpose is to optimize operations through intelligent tools, advanced technology, and a multi-tenant architecture. It provides AI-powered insights and comprehensive workflow management across the entire garment manufacturing process. The system supports key functionalities including CRM, Sample Development, Time & Action Planning, Bill of Materials, Inventory, Commercial, Production, HR, Financial Management, Budgeting, Business Intelligence, and Role-Based Access Control. The business vision is to become the industry standard for garment ERPs globally, driving efficiency and profitability within the sector.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack TypeScript Application
-   **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack Query, Shadcn/ui with Tailwind CSS, React Hook Form with Zod.
-   **Backend**: Node.js (20.x) with Express.js.
-   **Database**: PostgreSQL with Drizzle ORM.

### Multi-Tenant SaaS Architecture
The system employs a multi-tenant design ensuring data isolation through `tenantId` filtering. It features shared infrastructure, tenant-specific security, subscription-based access, role-based permissions, and company code-based login.

### Core Business Modules & Features
-   **Authentication & Authorization**: JWT-based with granular Role-Based Access Control (RBAC) and multi-role assignments.
-   **Multi-Level Approval Workflow**: Configurable state machine with amount-based routing and full audit trails.
-   **Financial Management**: Multi-currency support (BDT base), budgeting, accounting period locks, Bill-Wise Tracking, Cost Center Job Costing, Bank Reconciliation, and an immutable accounting engine.
-   **Inventory & Logistics**: Real-time Stock Ledger with weighted average valuation, stock adjustments, delivery challans, enhanced gate passes, and lot/batch traceability.
-   **End-to-End Document Flow**: Integrated purchase and sales processes.
-   **Financial Reporting Engine**: APIs for Trial Balance, General Ledger, Profit & Loss, Balance Sheet, and Cash Flow.
-   **Production Management**: Comprehensive material flow management from yarn to finished goods, production orders, consumption tracking, cost roll-up, and Quality Management.
-   **Supply Chain**: Subcontract management, Commercial LC, document tracking, shipment workflow, and Procure-to-Pay processes.
-   **Sales & Merchandising**: Order-to-Cash, Styles management (BOM, colorways, size scales), Sample Program, Time & Action (TNA), Order Pipeline, and Consumption Reconciliation.
-   **Tenant Business Type Specificity**: Module visibility is controlled by the `businessType` field ('buying_house'|'manufacturer'|'both').
-   **Merchandising Workflow**: Guided flows from inquiry to order confirmation, TNA auto-generation, order amendment tracking, shipment documentation checklist, and critical alerts.
-   **HR & Payroll**: Full payroll lifecycle including salary structures, runs, payslips, and employee advances.
-   **Master Data & Config Control**: Centralized configuration for document numbering, ledger mappings, warehouse defaults, and approval policies.
-   **Operational Hardening**: Includes a reversal engine, immutability guards, reconciliation reports, and an exceptions engine.
-   **Order Follow-up Lifecycle**: Comprehensive tracking from Inquiry to Export Realization, including Export Cases, Proforma Invoices, BTB LCs, FX Receipts & Settlement, Profitability Analysis, Costing Variance, Cash Flow Forecast, and AI Predictions, utilizing `metadata jsonb` for flexible data extension.

### Sidebar Navigation
Organized into 12 departmental sections: Dashboard, Merchandising, Export & Import, Inventory, Manufacturing, Quality, AI Tools, HR, Finance, Workflow, Reports, and System.

### AI Integration
The system integrates OpenAI GPT-4o (primary) and Anthropic Claude Sonnet 4.0 (fallback) for features such as inventory optimization, demand forecasting, customer insights, production analysis, smart recommendations, financial anomaly detection, ratio analysis, voucher entry assistance, BOM suggestions, and exchange rate suggestions.

### Design System & Branding
-   **UI Framework**: Shadcn/ui components with Tailwind CSS.
-   **Data Visualization**: Recharts (BarChart, PieChart, AreaChart) and react-simple-maps.
-   **Theming**: Uses CSS variables with an eye-comfort palette. Primary accent color is orange (`#F97316`). Background is light grey, foreground is dark charcoal, cards are pure white. Sidebar features a snow white background with dark charcoal text and orange accents for active states. Charts use a diverse color palette.
-   **Logo**: Features "PRIME7ERP" with an orange "7" and underline, used in various forms for light and dark backgrounds.
-   **Favicon**: P7 orange icon.
-   **Login/Register**: Full-page split layout with a futuristic garment factory hero image.
-   **Landing Page Hero**: Orange gradient with an AI-generated futuristic factory background.
-   **Demo Video**: An AI-generated intro video (`client/public/demo-intro.mp4`) auto-plays on the landing page.
-   **Footer**: Dark gradient with white-inverted logo and orange accents.
-   **Dashboard**: Features rich KPI cards, secondary stat strips, various charts, a world map, AI insights, and recent orders.
-   **Registration**: Extended fields include phone, company address, country, business type, base currency, fiscal year, and time zone.

### Security & Multi-Tenant Guardrails
-   **HTTP Security**: Implemented with Helmet for secure headers, strict CORS, and request size limits.
-   **Tenant Guardrails**: Middleware enforces tenant context and specific filtering.
-   **Database Indexes**: Composite indexes are used on high-traffic tenant-scoped tables.
-   **Failed Login Tracking**: Records failed login attempts and implements brute force detection.
-   **Session Security**: Tracks `lastLoginAt` and `lastLoginIp` and detects concurrent sessions from different IPs.
-   **Tenant Isolation Hardening**: Prevents cross-tenant breaches with critical security event logging.

### Real-Time Notifications (SSE)
-   **Backend**: SSE endpoint `GET /api/workflow-tasks/notifications/stream` with JWT authentication and heartbeat.
-   **Frontend**: `useNotificationStream` hook with auto-reconnect and exponential backoff for instant toast pop-ups and real-time bell badge updates.

### Super User Override with Hidden Audit
Super users can bypass workflow guards (SoD, approval matrix, period locks, permissions), with override actions logged as `super_user_only` metadata, hidden from regular staff.

### Role-Aware Approval Queue
Features authority-based filter tabs ("Pending My Check", "Pending My Recommendation", "Pending My Approval", "Ready to Post") displaying documents awaiting specific actions from the current user. Super users see all tabs.

### Comprehensive Activity Log Module
Available at `/settings/activity-logs` (super user only), providing a security dashboard and a filterable log table for actions such as login/logout, CRUD operations, approvals, exports, prints, report views, and backup events.

### Key Enhancements
-   **QR Code Document Verification**: Public endpoint for verifying documents via QR codes.
-   **Bank Cheque Printing**: Customizable cheque templates for direct printing.
-   **Gate Pass & Delivery Challan Enhancements**: Flexible party and inventory item selectors.
-   **Bulk Export**: Reusable utility for CSV/Excel export.
-   **Party Sync**: Bidirectional synchronization between vendor, customer, and party tables.
-   **Go-Live Safety Hardening**: Idempotency for PO/GRN creation, GL account validation, comprehensive audit trails, immutable bank reconciliation, and automatic GL entries for employee advances.
-   **Production Readiness**: Dashboards and reports utilize real tenant-scoped data.
-   **Full System Sample Data**: Seed script populates realistic data across all modules for comprehensive testing.
-   **Logistics Module**: A fully functional 6-tab system (Dashboard, Shipment Tracking, Import/Export, Cost Management, Document Management, AI Insights) connected to real API data from the Commercial module.
-   **Manufacturing Dashboard**: Displays production KPIs and department-wise metrics from real production data.
-   **Quality Data Seeded**: Includes QC inspections, parameters, templates, lab tests, and CAPA actions for functional QC module.
-   **Comprehensive Reporting**: 22 reports covering financial, inventory, PO, GRN, sales, LC, BTB, production, QC, HR, and logistics.
-   **Tutorial Maintenance Rule**: All feature changes require simultaneous updates to tutorial articles in `client/src/data/tutorials.ts`, accessible via an in-app help center.

### Quotation System (Redesigned)
-   **Form**: Single-page scrollable layout (no tabs) at `/quotations/new` and `/quotations/:id`
-   **Multi-Currency**: Per-row currency selection with exchange rate → BDT conversion. Live rates from open.er-api.com.
-   **Material Costs**: Derived at render time — `matSubtotal = Σ(amountPerDozen × projectedQuantity/12)` avoids stale closure bugs.
-   **Material/Description**: Searchable combobox (Command+Popover) loading items from inventory filtered by category. Includes "Add New Item" inline dialog for creating inventory items without leaving the form.
-   **Size Ratio**: Collapsible section with presets, weighted fabric factor, pack ratio, cartons calculation.
-   **PDF**: `GET /api/quotations/:id/pdf` generates PDFKit document with watermark, all cost tables, signature lines.
-   **Email**: `POST /api/quotations/:id/send-email` sends branded HTML email via Resend.
-   **Print CSS**: `@media print` rules in `client/src/index.css` for clean printable output.

## External Dependencies

### Runtime Dependencies
-   **Database**: PostgreSQL 16.
-   **AI Services**: OpenAI GPT-4o, Anthropic Claude.
-   **Authentication**: bcrypt, JWT.
-   **Validation**: Zod.
-   **Email Service**: Resend API.
-   **Forex Exchange Rates**: ExchangeRate-API (open.er-api.com).

### UI Dependencies
-   **Radix UI**: Accessible component primitives.
-   **Lucide React**: Icon library.
-   **Date-fns**: Date utilities.
-   **DND Kit**: Drag-and-drop functionality.