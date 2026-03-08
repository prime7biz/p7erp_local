# Prime7 ERP - Technical Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [Job Queue System & Async PDF Generation](#job-queue-system--async-pdf-generation)
8. [Core Modules](#core-modules)
9. [AI Integration](#ai-integration)
10. [Multi-Tenancy](#multi-tenancy)
11. [Security Features](#security-features)
12. [Workflow Diagrams](#workflow-diagrams)
13. [Key Features](#key-features)
14. [Development Guidelines](#development-guidelines)

---

## System Overview

Prime7 ERP is a comprehensive, AI-driven multi-tenant SaaS ERP system specifically designed for **garment manufacturers and buying houses** in Bangladesh-style manufacturing environments. The system provides intelligent operational tools for managing the complete order-to-delivery workflow.

### Key Characteristics
- **Multi-Tenant Architecture**: Complete data isolation between companies with shared infrastructure
- **AI-Powered Insights**: OpenAI GPT-4o and Anthropic Claude integration for intelligent recommendations
- **Multi-Currency Support**: USD, EUR, GBP, BDT with real-time exchange rates
- **Real-Time Operations**: No mock data - all integrations use live database queries
- **Mobile-Responsive UI**: Full functionality across desktop, tablet, and mobile devices

---

## Architecture

### High-Level Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   React 18  │  │ TanStack    │  │    Shadcn/UI +          │  │
│  │   + Wouter  │  │   Query v5  │  │    Tailwind CSS         │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
└─────────┼────────────────┼─────────────────────┼────────────────┘
          │                │                     │
          └────────────────┴──────────┬──────────┘
                                      │ HTTP/REST API
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVER (Node.js + Express)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ JWT Auth    │  │ Tenant      │  │    API Routes           │  │
│  │ Middleware  │  │ Isolation   │  │    (36+ route files)    │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
└─────────┼────────────────┼─────────────────────┼────────────────┘
          │                │                     │
          └────────────────┴──────────┬──────────┘
                                      │ Drizzle ORM
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database (Neon)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  80+ Tables │  │ Relations   │  │    Tenant-Scoped        │  │
│  │  Schema     │  │ + Indexes   │  │    Data Isolation       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   OpenAI API    │       │  Anthropic API  │       │  External APIs  │
│   (GPT-4o)      │       │  (Claude)       │       │  (Stripe, etc)  │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Request Flow
1. Client makes API request with JWT token in cookie
2. Express middleware validates JWT and extracts tenant context
3. Tenant isolation middleware ensures data scoping
4. Route handler processes request using Drizzle ORM
5. Database queries include `tenant_id` filter automatically
6. Response returned with proper CORS headers

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI Framework |
| TypeScript | 5.x | Type Safety |
| Vite | 5.x | Build Tool & Dev Server |
| Wouter | Latest | Lightweight Router |
| TanStack Query | 5.60.5 | Server State Management |
| Tailwind CSS | 3.x | Utility-First CSS |
| Shadcn/UI | Latest | Component Library |
| Radix UI | Various | Accessible Primitives |
| Recharts | Latest | Data Visualization |
| React Hook Form | Latest | Form Management |
| Zod | Latest | Schema Validation |
| Lucide React | 0.453.0 | Icon Library |
| Framer Motion | 11.18.2 | Animations |
| FullCalendar | 6.1.17 | Calendar Component |
| DND Kit | 6.3.1 | Drag & Drop |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x | Runtime Environment |
| Express | 4.21.2 | Web Framework |
| TypeScript | 5.x | Type Safety |
| Drizzle ORM | 0.39.1 | Database ORM |
| PostgreSQL | 16 | Database (Neon-hosted) |
| JWT | 9.0.2 | Authentication Tokens |
| bcrypt | 6.0.0 | Password Hashing |
| Cookie Parser | 1.4.7 | Cookie Management |
| Multer | 2.0.1 | File Uploads |
| Express Rate Limit | 7.5.0 | Rate Limiting |

### AI/ML
| Technology | Version | Purpose |
|------------|---------|---------|
| OpenAI SDK | 4.98.0 | GPT-4o Integration |
| Anthropic SDK | 0.37.0 | Claude Integration |
| TensorFlow.js | 4.22.0 | ML Predictions |

### External Services
| Service | Purpose |
|---------|---------|
| Neon Database | Serverless PostgreSQL |
| OpenAI | AI Insights & Recommendations |
| Anthropic | Fallback AI Provider |
| Stripe | Payment Processing |
| SendGrid | Email Notifications |

---

## Project Structure

```
prime7-erp/
├── client/                          # Frontend React Application
│   ├── src/
│   │   ├── App.tsx                  # Main app with routing
│   │   ├── main.tsx                 # Entry point
│   │   ├── index.css                # Global styles
│   │   ├── components/
│   │   │   ├── ui/                  # Shadcn/UI components (45+ files)
│   │   │   │   ├── button.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── form.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   └── ...
│   │   │   ├── layout/
│   │   │   │   ├── sidebar.tsx      # Main navigation
│   │   │   │   └── header.tsx
│   │   │   ├── dashboard/           # Dashboard widgets
│   │   │   ├── ai/                  # AI insight components
│   │   │   ├── hr/                  # HR module components
│   │   │   ├── production/          # Production components
│   │   │   ├── quality/             # Quality control
│   │   │   └── logistics/           # Logistics components
│   │   ├── pages/
│   │   │   ├── auth/                # Login, Register
│   │   │   ├── dashboard.tsx        # Main dashboard
│   │   │   ├── customers-new.tsx    # Customer management
│   │   │   ├── inquiries/           # Inquiry management
│   │   │   ├── quotations/          # Quotation system
│   │   │   ├── orders/              # Order management
│   │   │   ├── samples/             # Sample development
│   │   │   ├── inventory/           # Inventory module
│   │   │   ├── production/          # Production planning
│   │   │   ├── quality/             # Quality control
│   │   │   ├── commercial/          # Commercial/LC management
│   │   │   ├── accounts/            # Accounting module
│   │   │   ├── hr/                  # HR management
│   │   │   ├── reports/             # Analytics & reports
│   │   │   ├── settings/            # System settings
│   │   │   └── time-action/         # T&A planning
│   │   ├── hooks/
│   │   │   ├── use-toast.ts
│   │   │   ├── use-auth.ts
│   │   │   └── use-mobile.tsx
│   │   └── lib/
│   │       ├── queryClient.ts       # TanStack Query setup
│   │       ├── utils.ts             # Utility functions
│   │       └── protected-route.tsx
│   └── public/                      # Static assets
│
├── server/                          # Backend Express Application
│   ├── index.ts                     # Server entry point
│   ├── routes.ts                    # Route registration
│   ├── storage.ts                   # Database storage interface
│   ├── db.ts                        # Database connection
│   ├── vite.ts                      # Vite middleware
│   ├── auth.ts                      # Authentication logic
│   ├── middleware/
│   │   ├── tenantMiddleware.ts      # Multi-tenant isolation
│   │   ├── performanceMiddleware.ts # Performance monitoring
│   │   └── rateLimiter.ts           # Rate limiting
│   ├── api/                         # API Route Handlers (36 files)
│   │   ├── aiRoutes.ts              # AI endpoints
│   │   ├── aiInsightsRoutes.ts      # AI insights
│   │   ├── analyticsRoutes.ts       # Analytics
│   │   ├── calendarRoutes.ts        # Calendar
│   │   ├── commercialRoutes.ts      # LC/Commercial (38KB)
│   │   ├── crmRoutes.ts             # CRM
│   │   ├── currencyRoutes.ts        # Currency management
│   │   ├── customerRoutes.ts        # Customers
│   │   ├── demandForecastingRoutes.ts # AI forecasting
│   │   ├── garmentAnalyticsRoutes.ts # Garment analytics (26KB)
│   │   ├── gatePassRoutes.ts        # Gate passes
│   │   ├── inquiryRoutes.ts         # Inquiries
│   │   ├── inventoryMovementRoutes.ts # Inventory
│   │   ├── itemRoutes.ts            # Items
│   │   ├── itemCategoryRoutes.ts    # Categories
│   │   ├── orderRoutes.ts           # Orders
│   │   ├── physicalInventoryRoutes.ts # Stock counting
│   │   ├── quotationRoutes.ts       # Quotations (21KB)
│   │   ├── reportRoutes.ts          # Reports (57KB)
│   │   ├── sampleDevelopmentRoutes.ts # Samples
│   │   ├── settingsRoutes.ts        # Settings
│   │   ├── taskRoutes.ts            # Tasks
│   │   ├── timeActionRoutes.ts      # T&A planning
│   │   └── warehouseRoutes.ts       # Warehouses
│   └── services/
│       ├── aiService.ts             # AI integration
│       └── emailService.ts          # Email notifications
│
├── shared/                          # Shared Code
│   └── schema.ts                    # Database schema (2280 lines)
│
├── drizzle.config.ts                # Drizzle configuration
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
├── vite.config.ts                   # Vite configuration
└── tailwind.config.ts               # Tailwind configuration
```

---

## Database Schema

The system uses **80+ database tables** organized into functional modules. All tables include `tenant_id` for multi-tenant isolation.

### Core Tables

#### Multi-Tenancy & Authentication
| Table | Description |
|-------|-------------|
| `tenants` | Company/organization records |
| `subscription_plans` | Available SaaS plans (trial, basic, business, premium, enterprise) |
| `subscriptions` | Tenant subscription status |
| `users` | User accounts with tenant association |
| `roles` | Role definitions with permission levels |
| `departments` | Organizational structure |
| `user_permissions` | Granular user permissions |

#### Customer Relationship Management (CRM)
| Table | Description |
|-------|-------------|
| `customers` | Customer master data |
| `customer_agents` | Buying agent details |
| `customer_interactions` | Interaction history |
| `customer_insights` | AI-generated insights |
| `buyer_portal_users` | Portal access for buyers |
| `crm_activities` | Activity tracking |
| `communication_templates` | Email/SMS templates |

#### Sales & Quotations
| Table | Description |
|-------|-------------|
| `inquiries` | Customer inquiries |
| `quotations` | Price quotations |
| `quotation_materials` | Material cost breakdown |
| `quotation_manufacturing` | Manufacturing costs |
| `quotation_other_costs` | Additional costs |
| `quotation_cost_summary` | Cost summaries |

#### Order Management
| Table | Description |
|-------|-------------|
| `orders` | Sales orders |
| `order_color_size_breakdown` | Size/color matrix |
| `order_materials` | Materials per order |
| `order_samples` | Order samples |
| `order_trims` | Trims and accessories |

#### Sample Development
| Table | Description |
|-------|-------------|
| `sample_developments` | Sample records |
| `sample_materials` | Sample materials |
| `sample_approvals` | Approval workflow |
| `trim_approvals` | Trim approval tracking |

#### Inventory Management
| Table | Description |
|-------|-------------|
| `warehouses` | Warehouse locations |
| `item_categories` | Item categories |
| `item_subcategories` | Subcategories |
| `items` | Item master |
| `item_variants` | Color/size variants |
| `item_stock` | Stock levels by location |
| `item_units` | Units of measure |
| `inventory_movements` | Stock transactions |
| `bill_of_materials` | BOM headers |
| `bom_components` | BOM line items |

#### Production & Manufacturing
| Table | Description |
|-------|-------------|
| `work_orders` | Production work orders |
| `work_order_operations` | Operations per work order |
| `work_order_materials` | Materials per work order |
| `time_action_plans` | T&A plans |
| `time_action_milestones` | T&A milestones |

#### Commercial & Finance
| Table | Description |
|-------|-------------|
| `currencies` | Currency master |
| `exchange_rates` | Exchange rate history |
| `currency_exchange_rates` | Tenant-specific rates |
| `price_lists` | Customer price lists |
| `price_list_items` | Price list details |

#### Accounting Module
| Table | Description |
|-------|-------------|
| `account_types` | Account type definitions |
| `chart_of_accounts` | Full chart of accounts |
| `fiscal_years` | Fiscal year periods |
| `accounting_periods` | Monthly/quarterly periods |
| `journal_types` | Journal entry types |
| `journals` | Journal headers |
| `journal_lines` | Journal line items |
| `voucher_types` | Voucher type definitions |
| `vouchers` | Financial vouchers |
| `voucher_items` | Voucher line items |

#### HR Module
| Table | Description |
|-------|-------------|
| `employees` | Employee records |
| `designations` | Job titles |
| `attendance` | Attendance records |
| `payroll` | Payroll processing |

#### System & Notifications
| Table | Description |
|-------|-------------|
| `notifications` | System notifications |
| `calendar_events` | Calendar with AI suggestions |
| `calendar_settings` | User calendar preferences |
| `tasks` | Task management |
| `task_comments` | Task collaboration |
| `task_ai_insights` | AI task insights |
| `tenant_settings` | Tenant configuration |

#### Gamification & Achievements
| Table | Description |
|-------|-------------|
| `achievement_badges` | Badge definitions |
| `user_achievements` | User badges earned |
| `user_performance_metrics` | Performance tracking |
| `achievement_activity_logs` | Activity logging |

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/register` | User registration |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/kpi` | Key performance indicators |
| GET | `/api/dashboard/recent-orders` | Recent orders |
| GET | `/api/dashboard/production-status` | Production overview |
| GET | `/api/dashboard/low-stock-alerts` | Inventory alerts |
| GET | `/api/dashboard/pending-approvals` | Pending items |
| GET | `/api/dashboard/revenue-by-customer` | Revenue analytics |

### Customers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customers` | List customers |
| POST | `/api/customers` | Create customer |
| GET | `/api/customers/:id` | Get customer |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer |
| GET | `/api/customers/:id/interactions` | Customer history |

### Inquiries
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inquiries` | List inquiries |
| POST | `/api/inquiries` | Create inquiry |
| GET | `/api/inquiries/:id` | Get inquiry details |
| PUT | `/api/inquiries/:id` | Update inquiry |
| GET | `/api/inquiries/:id/ai-insights` | AI analysis |

### Quotations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quotations` | List quotations |
| POST | `/api/quotations` | Create quotation |
| GET | `/api/quotations/:id` | Get quotation |
| PUT | `/api/quotations/:id` | Update quotation |
| POST | `/api/quotations/:id/convert-to-order` | Convert to order |
| GET | `/api/quotations/:id/print` | Print preview |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders |
| POST | `/api/orders` | Create order |
| GET | `/api/orders/:id` | Get order |
| PUT | `/api/orders/:id` | Update order |
| GET | `/api/orders/:id/materials` | Order materials |
| GET | `/api/orders/:id/timeline` | Order timeline |

### Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/items` | List items |
| POST | `/api/items` | Create item |
| GET | `/api/items/:id` | Get item |
| PUT | `/api/items/:id` | Update item |
| GET | `/api/inventory/stock` | Stock levels |
| POST | `/api/inventory/movements` | Stock movement |
| GET | `/api/warehouses` | Warehouses |
| GET | `/api/item-categories` | Categories |

### Production
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/work-orders` | Work orders |
| POST | `/api/work-orders` | Create work order |
| GET | `/api/time-action-plans` | T&A plans |
| POST | `/api/time-action-plans` | Create T&A |

### Commercial
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/commercial/master-lcs` | Master LCs |
| GET | `/api/commercial/btb-lcs` | Back-to-back LCs |
| GET | `/api/commercial/purchase-orders` | Purchase orders |
| GET | `/api/commercial/profitability` | Profitability analysis |

### Accounting
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts/chart-of-accounts` | Chart of accounts |
| GET | `/api/accounts/journals` | Journals |
| POST | `/api/accounts/journals` | Create journal |
| GET | `/api/accounts/fiscal-years` | Fiscal years |
| GET | `/api/accounts/vouchers` | Vouchers |

### AI Services
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ai/insights/:entityType/:entityId` | AI insights |
| POST | `/api/ai/analyze` | AI analysis |
| GET | `/api/ai/recommendations` | AI recommendations |
| GET | `/api/demand-forecasting` | Demand predictions |
| GET | `/api/garment-analytics` | Garment analytics |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/tenant` | Tenant settings |
| PUT | `/api/settings/tenant` | Update settings |
| GET | `/api/settings/users` | User management |
| GET | `/api/settings/roles` | Role management |
| GET | `/api/settings/departments` | Departments |

---

## Job Queue System & Async PDF Generation

### Overview

The system uses **pg-boss**, a PostgreSQL-backed job queue, to handle asynchronous PDF report generation. This enables long-running report operations to complete without blocking API responses.

### Job Queue Configuration

**pg-boss Instance** (`server/jobs/boss.ts`)
- Singleton instance using PostgreSQL connection pool
- Automatic queue creation on startup
- Configuration:
  - **Retry Logic**: 3 retries with exponential backoff
  - **Job Expiry**: 60 minutes
  - **Archive Completed**: 24 hours after completion
  - **Purge Deleted**: 7 days after expiry
  - **Monitoring**: 30-second state check interval

**Initialization** (`server/jobs/index.ts`)
- Starts pg-boss on application startup
- Registers report PDF worker
- Schedules daily cleanup task at 03:00 UTC
- Graceful shutdown on SIGTERM/SIGINT

### Async PDF Report Generation Endpoints

#### Request PDF Generation
```
POST /api/reports/generated/:id/export/pdf
```
**Response** (202 Accepted)
```json
{
  "jobId": "job-uuid-string",
  "status": "queued",
  "statusUrl": "/api/reports/files/{fileId}/status",
  "downloadUrl": "/api/reports/files/{fileId}/download"
}
```

#### Check Generation Status
```
GET /api/reports/files/:fileId/status
```
**Response**
```json
{
  "id": 123,
  "status": "processing|completed|failed",
  "fileSize": 45678,
  "createdAt": "2026-02-07T10:30:00Z",
  "completedAt": "2026-02-07T10:32:15Z",
  "errorMessage": null
}
```

#### Download Generated PDF
```
GET /api/reports/files/:fileId/download
```
- Returns PDF file with proper headers
- Validates tenant isolation before download
- Sets expiry headers for cache control

#### List Generated Files
```
GET /api/reports/files
```
**Response**
```json
{
  "files": [
    {
      "id": 1,
      "reportName": "Sales Report",
      "status": "completed",
      "fileSize": 45678,
      "createdAt": "2026-02-07T10:30:00Z",
      "expiresAt": "2026-02-14T10:30:00Z"
    }
  ]
}
```

#### Delete Generated File
```
DELETE /api/reports/files/:fileId
```
- Removes file from disk
- Marks as deleted in database
- Returns 204 No Content

### Database Schema

**report_files Table**
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `tenant_id` | INT | Tenant isolation |
| `job_id` | VARCHAR | pg-boss job ID |
| `report_id` | INT | Reference to generated_reports |
| `user_id` | INT | Creator user ID |
| `file_name` | VARCHAR | PDF filename |
| `file_path` | VARCHAR | Server file path |
| `file_size` | INT | File size in bytes |
| `status` | ENUM | queued\|processing\|completed\|failed\|expired\|deleted |
| `error_message` | TEXT | Error details if failed |
| `expires_at` | TIMESTAMP | Expiry time (7 days) |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update |

### Cleanup System

**Scheduled Daily Cleanup** (03:00 UTC)
- Queries `report_files` table for expired records
- Deletes physical files from disk
- Updates database records to `expired` status
- Logs cleanup summary

**Retention Policy**
- Completed files: 7-day TTL
- Auto-delete: After 7 days of expiry
- Failed jobs: Purged with completed jobs

**Implementation**
- cron expression: `0 3 * * *` (UTC)
- Handled by pg-boss schedule feature
- Graceful error handling and logging

### Key Implementation Files

**Job Queue Core**
- `server/jobs/boss.ts` - pg-boss singleton and configuration
- `server/jobs/index.ts` - Job system initialization and cleanup scheduling

**PDF Generation**
- `server/jobs/pdfGenerator.ts` - PDFKit-based PDF generation engine
  - Table-based data formatting
  - Multi-page support with page numbering
  - AI insights integration
  - Header/footer with timestamps
- `server/jobs/reports.worker.ts` - Job worker for PDF generation
  - Fetches report data from database
  - Calls pdfGenerator function
  - Updates job status in report_files table
  - Error handling and retry management

**Schema Definition**
- `shared/schema.ts` - Drizzle ORM table definition for `report_files`

### Performance Characteristics

- **Job Processing**: Asynchronous, non-blocking
- **PDF Generation**: ~1-5 seconds per report (varies by data size)
- **Storage**: In-memory queue with PostgreSQL persistence
- **Concurrency**: Configurable worker processes
- **Scalability**: Distributable across multiple servers (pg-boss supports multi-server deployment)

---

## Core Modules

### 1. Customer Relationship Management (CRM)
- **Customer Master**: Complete customer profiles with industry-specific fields
- **Agent Management**: Buying house agent tracking
- **Interaction History**: Calls, emails, meetings, site visits
- **AI Insights**: Pattern analysis, risk assessment, opportunities
- **Buyer Portal**: Customer self-service access

### 2. Sample Development
- **Sample Types**: Development, Salesman, Pre-Production, Shipping
- **Material Tracking**: Fabric, trim, and accessory requirements
- **Approval Workflow**: Photo → Fit → PP → Shipping approval stages
- **Cost Tracking**: Sample costing and material allocation

### 3. Quotation Management
- **Multi-Currency**: USD, EUR, GBP, BDT support
- **Cost Breakdown**: Materials, manufacturing, overhead, profit margin
- **Version Control**: Quotation revision history
- **Approval Workflow**: Multi-level approval process
- **Order Conversion**: One-click conversion to sales order

### 4. Order Management
- **Order Entry**: Complete order details with color/size matrix
- **Material Planning**: BOM-based material requirements
- **T&A Planning**: Time & Action milestone tracking
- **Production Linking**: Integration with work orders
- **Document Generation**: PI, Order Confirmation, Packing List

### 5. Inventory Management
- **Multi-Warehouse**: Company, vendor, third-party locations
- **Item Master**: Categories, subcategories, variants
- **Stock Tracking**: Real-time stock levels
- **Movements**: Receipts, issues, transfers, adjustments
- **Gate Pass**: Material movement control
- **Physical Inventory**: Stock count and reconciliation

### 6. Production Planning
- **Work Orders**: Production job management
- **Operations**: Step-by-step production tracking
- **Material Issues**: Material allocation to production
- **Quality Control**: Inspection checkpoints
- **Efficiency Tracking**: Line efficiency, SAM analysis

### 7. Commercial Operations
- **Master LC**: Export LC management
- **BTB LC**: Back-to-back LC for imports
- **Purchase Orders**: Supplier PO management
- **Profitability**: Order-level profit tracking
- **Document Tracking**: LC amendment, negotiation dates

### 8. Accounting & Finance
- **Chart of Accounts**: Hierarchical account structure
- **Journal Entries**: Manual and automated journals
- **Voucher System**: Payment, Receipt, Journal vouchers
- **Fiscal Years**: Period-based accounting
- **Financial Reports**: Trial Balance, P&L, Balance Sheet

### 9. HR Management
- **Employee Master**: Complete employee records
- **Departments**: Organizational structure
- **Designations**: Job title management
- **Attendance**: Daily attendance tracking
- **Payroll**: Salary processing

### 10. Reports & Analytics
- **Dashboard**: KPIs, alerts, charts
- **Order Reports**: Status, delivery, profitability
- **Inventory Reports**: Stock, aging, movement
- **Financial Reports**: Standard financial statements
- **AI Analytics**: Trend analysis, predictions

---

## AI Integration

### AI Providers
1. **OpenAI GPT-4o** (Primary)
   - Customer insights generation
   - Demand forecasting
   - Natural language queries
   - Document analysis

2. **Anthropic Claude** (Fallback)
   - Secondary provider for redundancy
   - Complex reasoning tasks
   - Code analysis and suggestions

### AI Features

#### Customer Insights
```typescript
// AI-generated customer analysis
{
  insightType: "order_pattern" | "communication" | "feedback" | "risk" | "opportunity",
  title: string,
  description: string,
  score: number,
  recommendations: string[]
}
```

#### Demand Forecasting
- Historical order analysis
- Seasonal trend detection
- Material requirement predictions
- Capacity planning suggestions

#### Inventory Optimization
- Reorder point calculations
- Safety stock recommendations
- Slow-moving item alerts
- Procurement timing

#### Production Analysis
- Efficiency optimization
- Bottleneck identification
- Resource allocation
- Quality prediction

### AI Service Architecture
```typescript
// server/services/aiService.ts
class AIService {
  async generateInsight(context: InsightContext): Promise<AIInsight>;
  async analyzeTrends(data: TimeSeriesData): Promise<TrendAnalysis>;
  async predictDemand(itemId: number, horizon: number): Promise<DemandForecast>;
  async optimizeInventory(warehouseId: number): Promise<OptimizationPlan>;
}
```

---

## Multi-Tenancy

### Implementation Strategy
The system uses **row-level tenant isolation** where every database table includes a `tenant_id` column.

### Tenant Context Flow
```typescript
// 1. JWT token contains tenant_id
const token = jwt.sign({ userId, tenantId }, secret);

// 2. Middleware extracts and attaches tenant
app.use((req, res, next) => {
  const decoded = jwt.verify(token, secret);
  req.tenant = { id: decoded.tenantId };
  next();
});

// 3. All queries include tenant filter
const customers = await db.select()
  .from(schema.customers)
  .where(eq(schema.customers.tenantId, req.tenant.id));
```

### Subscription Plans
| Plan | Max Users | Features |
|------|-----------|----------|
| Trial | 2 | 14 days, limited modules |
| Basic | 5 | Core modules |
| Business | 20 | All modules, AI insights |
| Premium | 50 | All features + API access |
| Enterprise | Unlimited | Custom features, SLA |

### Tenant Settings
- Company information (name, address, logo)
- Financial settings (base currency, fiscal year)
- HR settings (working days, hours)
- System preferences (notifications, 2FA)

---

## Security Features

### Authentication
- JWT-based token authentication
- HttpOnly secure cookies
- bcrypt password hashing (cost factor 10)
- Session management with expiry

### Authorization
- Role-based access control (RBAC)
- Granular module-level permissions
- Action-level permissions (CRUD)
- Department-based data access

### Data Protection
- Tenant data isolation at query level
- Input validation with Zod schemas
- SQL injection prevention via ORM
- XSS protection with React escaping

### API Security
- Rate limiting (100 requests/15 min)
- CORS configuration
- Request size limits
- Performance monitoring

### Audit Trail
- Activity logging
- User action tracking
- Portal activity logs
- Data change history

---

## Workflow Diagrams

### Inquiry to Order Flow
```
┌─────────┐    ┌───────────┐    ┌──────────┐    ┌─────────┐
│ Inquiry │───▶│ Quotation │───▶│ Approval │───▶│  Order  │
└─────────┘    └───────────┘    └──────────┘    └─────────┘
     │               │                               │
     │               │                               ▼
     │               │                        ┌──────────────┐
     ▼               ▼                        │ T&A Planning │
┌─────────┐   ┌───────────────┐               └──────────────┘
│AI Insight│   │Cost Analysis  │                     │
└─────────┘   └───────────────┘                     ▼
                                              ┌──────────────┐
                                              │  Production  │
                                              └──────────────┘
```

### Sample Approval Workflow
```
┌─────────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Development │───▶│  Photo   │───▶│   Fit    │───▶│   PP     │
│   Sample    │    │ Approval │    │ Approval │    │ Approval │
└─────────────┘    └──────────┘    └──────────┘    └──────────┘
                        │               │               │
                        ▼               ▼               ▼
                  ┌──────────┐   ┌──────────┐   ┌──────────┐
                  │ Approved │   │ Approved │   │ Approved │
                  │  /Reject │   │  /Reject │   │  /Reject │
                  └──────────┘   └──────────┘   └──────────┘
```

### Order Profitability Flow
```
┌────────────┐
│ Master LC  │
└─────┬──────┘
      │
      ▼
┌────────────┐    ┌────────────┐    ┌────────────┐
│  BTB LC 1  │    │  BTB LC 2  │    │  BTB LC 3  │
└─────┬──────┘    └─────┬──────┘    └─────┬──────┘
      │                 │                 │
      ▼                 ▼                 ▼
┌────────────┐    ┌────────────┐    ┌────────────┐
│    PO 1    │    │    PO 2    │    │    PO 3    │
└─────┬──────┘    └─────┬──────┘    └─────┬──────┘
      │                 │                 │
      └─────────────────┼─────────────────┘
                        ▼
                 ┌────────────────┐
                 │ Profitability  │
                 │   Analysis     │
                 └────────────────┘
```

---

## Key Features

### Multi-Currency Operations
- Support for USD, EUR, GBP, BDT
- Real-time exchange rate updates
- Currency conversion in quotations
- Multi-currency reporting

### Document Printing
- Proforma Invoice (PI)
- Commercial Invoice
- Packing List
- Order Confirmation
- Sample Request Form
- Tech Pack Export

### Tech Pack Management
- Style specifications
- Material requirements
- Construction details
- Measurement charts
- Artwork and graphics

### Mobile Responsive
- Full functionality on all devices
- Touch-optimized UI
- Responsive data tables
- Mobile-friendly forms

### Real-Time Updates
- WebSocket notifications
- Live dashboard updates
- Instant stock alerts
- Approval notifications

---

## Development Guidelines

### Code Conventions
```typescript
// Use TypeScript strictly
// All API responses typed with Zod schemas
// React components use functional style with hooks
// TanStack Query for all data fetching
// Shadcn/UI components for consistency
```

### Database Changes
```bash
# Never write raw SQL migrations
# Use Drizzle schema definitions
npm run db:push        # Safe sync
npm run db:push --force  # Force sync (data loss warning)
```

### API Development
```typescript
// All routes must:
// 1. Validate input with Zod
// 2. Include tenant_id in queries
// 3. Use proper HTTP status codes
// 4. Return consistent response format
```

### Environment Variables
```
DATABASE_URL=           # PostgreSQL connection string
OPENAI_API_KEY=         # OpenAI API key
ANTHROPIC_API_KEY=      # Anthropic API key
JWT_SECRET=             # JWT signing secret
SESSION_SECRET=         # Session secret
```

---

## Performance Considerations

### Database Optimization
- Indexed foreign keys
- Tenant-scoped queries
- Connection pooling
- Query result caching

### Frontend Optimization
- Code splitting with Vite
- Lazy loading routes
- TanStack Query caching
- Optimistic updates

### API Performance
- Response compression
- Rate limiting
- Request batching
- Efficient pagination

---

## Future Development Suggestions

1. **Mobile App**: React Native version for field operations
2. **Barcode/RFID**: Inventory tracking integration
3. **IoT Integration**: Production machine monitoring
4. **Advanced Analytics**: BI dashboard with custom reports
5. **Workflow Automation**: Rule-based process automation
6. **Document OCR**: Automatic LC/PO data extraction
7. **Supplier Portal**: Vendor self-service platform
8. **Quality Image AI**: Visual inspection using computer vision

---

## Contact & Support

For development questions and feature requests, refer to this documentation for system architecture and codebase understanding.

---

*Last Updated: February 2026*
*Version: 1.0.0*
