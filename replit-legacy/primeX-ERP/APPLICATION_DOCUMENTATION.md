# PrimeX ERP System - Complete Application Documentation

## Table of Contents
1. [Application Overview](#application-overview)
2. [Technology Stack](#technology-stack)
3. [Directory Structure](#directory-structure)
4. [Core Modules](#core-modules)
5. [Authentication & Authorization](#authentication--authorization)
6. [Database Schema](#database-schema)
7. [API Architecture](#api-architecture)
8. [Frontend Components](#frontend-components)
9. [AI Integration](#ai-integration)
10. [Multi-Tenant Architecture](#multi-tenant-architecture)
11. [Deployment & Configuration](#deployment--configuration)

## Application Overview

**PrimeX** is a comprehensive AI-driven SaaS ERP system specifically designed for garment manufacturers and buying houses. The system delivers intelligent operational tools with advanced technological capabilities and user-centric design, covering the complete garment manufacturing lifecycle from inquiry to production.

### Key Features
- Multi-tenant SaaS architecture with isolated company data
- AI-powered insights and recommendations
- Complete garment manufacturing workflow management
- Advanced inventory optimization with style recommendations
- Real-time production monitoring and analytics
- Multi-currency support for international operations
- Responsive design for desktop, tablet, and mobile devices

## Technology Stack

### Frontend
- **Framework**: React.js with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query (React Query v5)
- **UI Components**: Shadcn/ui + Tailwind CSS
- **Form Handling**: React Hook Form with Zod validation
- **Charts**: Recharts
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js 20.x
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT tokens with express-session
- **API Documentation**: RESTful APIs
- **File Processing**: Built-in file handling

### AI & Analytics
- **AI Provider**: OpenAI GPT-4o and Anthropic Claude Sonnet 4.0
- **Use Cases**: Style recommendations, demand forecasting, inventory optimization
- **Analytics**: Custom business intelligence modules

### Development Tools
- **Language**: TypeScript
- **Package Manager**: npm
- **Database Migrations**: Drizzle Kit
- **Code Quality**: ESLint configuration
- **Styling**: PostCSS with Tailwind CSS

## Directory Structure

```
project-root/
├── client/                          # Frontend React application
│   ├── src/
│   │   ├── components/             # Reusable UI components
│   │   │   ├── ai/                # AI-related components
│   │   │   │   └── style-recommendation-sidebar.tsx
│   │   │   ├── inventory/         # Inventory management components
│   │   │   ├── layout/           # Layout components (sidebar, topnav)
│   │   │   ├── onboarding/       # User onboarding tutorials
│   │   │   └── ui/               # Shadcn/ui base components
│   │   ├── context/              # React context providers
│   │   │   ├── auth-context.tsx  # Authentication context
│   │   │   ├── gamification-context.tsx
│   │   │   └── onboarding-context.tsx
│   │   ├── hooks/                # Custom React hooks
│   │   │   ├── use-auth.ts       # Authentication hook
│   │   │   └── use-toast.ts      # Toast notifications
│   │   ├── lib/                  # Utility libraries
│   │   │   ├── currency.ts       # Multi-currency utilities
│   │   │   ├── queryClient.ts    # TanStack Query configuration
│   │   │   └── utils.ts          # General utilities
│   │   ├── pages/                # Application pages/routes
│   │   │   ├── auth/            # Authentication pages
│   │   │   ├── inventory/       # Inventory management pages
│   │   │   ├── orders/          # Order management pages
│   │   │   ├── quotations/      # Quotation management pages
│   │   │   ├── accounts/        # Accounting module pages
│   │   │   ├── hr/              # Human Resources pages
│   │   │   ├── production/      # Production management pages
│   │   │   ├── quality/         # Quality control pages
│   │   │   ├── reports/         # Business intelligence reports
│   │   │   └── settings/        # System configuration pages
│   │   └── App.tsx              # Main application component
│   └── index.html               # HTML entry point
│
├── server/                        # Backend Express application
│   ├── api/                      # API route handlers
│   │   ├── aiRoutes.ts          # AI-powered features
│   │   ├── customerRoutes.ts    # Customer management
│   │   ├── inventoryRoutes.ts   # Inventory management
│   │   ├── orderRoutes.ts       # Order processing
│   │   ├── quotationRoutes.ts   # Quotation management
│   │   ├── currencyRoutes.ts    # Multi-currency support
│   │   ├── accountingRoutes.ts  # Financial accounting
│   │   ├── hrRoutes.ts          # Human resources
│   │   ├── productionRoutes.ts  # Production management
│   │   ├── qualityRoutes.ts     # Quality control
│   │   ├── reportRoutes.ts      # Business reports
│   │   └── settingsRoutes.ts    # System settings
│   ├── middleware/              # Express middleware
│   │   ├── auth.ts             # Authentication middleware
│   │   └── validation.ts       # Request validation
│   ├── services/               # Business logic services
│   │   ├── aiRecommendationService.ts
│   │   ├── currencyService.ts
│   │   └── inventoryService.ts
│   ├── db.ts                   # Database connection
│   ├── storage.ts              # Data access layer
│   ├── routes.ts               # Route registration
│   └── index.ts                # Server entry point
│
├── shared/                       # Shared TypeScript definitions
│   └── schema.ts                # Database schema definitions
│
├── migrations/                   # Database migration files
│   └── *.sql                    # SQL migration scripts
│
├── scripts/                     # Utility scripts
│   ├── create-sample-data.ts   # Sample data generation
│   └── database-setup.ts       # Database initialization
│
└── attached_assets/             # Project documentation and assets
    ├── screenshots/            # Application screenshots
    └── documentation/          # Additional documentation
```

## Core Modules

### 1. CRM & Customer Management
**Location**: `client/src/pages/customers/`, `server/api/customerRoutes.ts`

**Features**:
- Customer profile management with complete contact information
- Customer categorization (Buyer, Supplier, Both)
- Communication history tracking
- Credit limit and payment terms management
- Customer-specific pricing and contracts

**Key Components**:
- Customer listing with search and filtering
- Customer profile forms with validation
- Customer dashboard with order history
- Communication timeline

### 2. Inquiry Management
**Location**: `client/src/pages/inquiries/`, `server/api/inquiryRoutes.ts`

**Features**:
- Inquiry capture and tracking
- Style specifications and requirements
- Inquiry-to-quotation conversion
- Follow-up management
- Inquiry analytics and reporting

**Workflow**: Inquiry → Quotation → Order → Production

### 3. Quotation Management
**Location**: `client/src/pages/quotations/`, `server/api/quotationRoutes.ts`

**Features**:
- Dynamic quotation generation
- Multi-currency pricing support
- Style and material specifications
- Quotation versioning and revisions
- Approval workflows
- PDF generation and email integration

**Key Components**:
- Quotation form with real-time calculations
- Quotation listing with status tracking
- Quotation preview and printing
- Conversion to orders

### 4. Order Management
**Location**: `client/src/pages/orders/`, `server/api/orderRoutes.ts`

**Features**:
- Order processing and tracking
- Order status management (Pending, Confirmed, In Production, Completed)
- Delivery scheduling
- Order modifications and amendments
- Production planning integration

**Order Lifecycle**: Quotation → Order → Production → Quality → Delivery

### 5. Inventory Management
**Location**: `client/src/pages/inventory/`, `server/api/inventoryRoutes.ts`

**Features**:
- Multi-level inventory categorization (Categories → Subcategories → Items)
- Real-time stock tracking
- Warehouse management
- Inventory transactions (In, Out, Transfer, Adjustment)
- Gate pass and challan management
- Physical inventory counting with AI discrepancy analysis
- Low stock alerts and reorder notifications

**Key Components**:
- Item master data management
- Stock movement tracking
- Inventory valuation (FIFO, LIFO, Weighted Average)
- AI-powered inventory optimization
- Barcode integration support

### 6. Production Management
**Location**: `client/src/pages/production/`, `server/api/productionRoutes.ts`

**Features**:
- Production order creation and tracking
- Bill of Materials (BOM) management
- Production scheduling and capacity planning
- Work center management
- Production progress tracking
- Quality checkpoints integration

**Production Process**: Order → BOM → Production Plan → Execution → Quality → Completion

### 7. Quality Management
**Location**: `client/src/pages/quality/`, `server/api/qualityRoutes.ts`

**Features**:
- Quality control checkpoints
- Inspection criteria and standards
- Defect tracking and analysis
- Quality reports and compliance
- Supplier quality management
- AI-powered visual defect detection

### 8. Financial Accounting
**Location**: `client/src/pages/accounts/`, `server/api/accountingRoutes.ts`

**Features**:
- Chart of accounts management
- Journal entries and general ledger
- Accounts payable and receivable
- Multi-currency transactions
- Financial reporting (P&L, Balance Sheet, Cash Flow)
- Voucher management with approval workflows
- Bank reconciliation

**Accounting Modules**:
- General Ledger
- Accounts Payable
- Accounts Receivable
- Fixed Assets
- Inventory Accounting
- Multi-currency Support

### 9. Human Resources & Payroll
**Location**: `client/src/pages/hr/`, `server/api/hrRoutes.ts`

**Features**:
- Employee master data management
- Attendance tracking
- Leave management
- Payroll processing
- Performance management
- Employee self-service portal

### 10. Business Intelligence & Reports
**Location**: `client/src/pages/reports/`, `server/api/reportRoutes.ts`

**Features**:
- Real-time dashboards
- Interactive charts and graphs
- Custom report builder
- Scheduled report generation
- KPI monitoring
- Trend analysis
- Export capabilities (PDF, Excel, CSV)

**Report Categories**:
- Sales and Order Reports
- Inventory Reports
- Production Reports
- Financial Reports
- Quality Reports
- HR Reports

### 11. AI-Powered Features
**Location**: `client/src/components/ai/`, `server/api/aiRoutes.ts`

**Features**:
- Style recommendation sidebar for inventory optimization
- Demand forecasting and trend analysis
- Inventory optimization suggestions
- Production efficiency analysis
- Quality defect pattern recognition
- Automated insights and alerts

**AI Capabilities**:
- Inventory reorder recommendations with confidence scores
- Seasonal demand predictions
- Overstock and dead stock identification
- Style trend analysis
- Supplier performance predictions

### 12. Calendar & Task Management
**Location**: `client/src/pages/calendar-tasks.tsx`

**Features**:
- Unified calendar and task management
- Task assignment and tracking
- Calendar event scheduling
- Achievement and milestone tracking
- Team collaboration tools
- Deadline management

### 13. Settings & Configuration
**Location**: `client/src/pages/settings/`, `server/api/settingsRoutes.ts`

**Features**:
- Multi-tenant company settings
- User management and role-based permissions
- System configuration
- Currency settings and exchange rates
- Fiscal year configuration
- Email and notification settings
- Integration configurations

## Authentication & Authorization

### Multi-Tenant Authentication
- JWT-based authentication with secure token management
- Role-based access control (RBAC)
- Tenant isolation at database level
- Session management with Redis/PostgreSQL store
- Password security with bcrypt hashing

### User Roles
- **Super Admin**: System-wide access across all tenants
- **Company Admin**: Full access within tenant
- **Manager**: Departmental access with approval rights
- **User**: Standard operational access
- **Viewer**: Read-only access

### Security Features
- CORS configuration for secure API access
- Request validation with Zod schemas
- Rate limiting and API throttling
- Secure cookie handling
- Environment-based configuration

## Database Schema

### Core Tables
```sql
-- Tenant/Company Management
tenants
tenant_settings
tenant_users

-- User Management
users
user_roles
user_permissions

-- Customer Relationship Management
customers
customer_contacts
customer_addresses

-- Inquiry and Sales Management
inquiries
quotations
quotation_items
orders
order_items

-- Inventory Management
inventory_categories
inventory_subcategories
inventory_items
inventory_transactions
warehouses
gate_passes

-- Production Management
production_orders
bill_of_materials
work_centers
production_transactions

-- Quality Management
quality_checkpoints
quality_inspections
quality_defects

-- Financial Accounting
chart_of_accounts
journal_entries
vouchers
invoice_headers
invoice_details

-- Human Resources
employees
attendance_records
leave_requests
payroll_transactions

-- System Management
currencies
exchange_rates
audit_logs
notifications
```

### Key Relationships
- Tenant-based data isolation
- Hierarchical inventory categorization
- Order-to-production workflow linkage
- Financial transaction traceability
- Audit trail for all transactions

## API Architecture

### RESTful API Design
- **Base URL**: `/api/`
- **Authentication**: Bearer JWT tokens
- **Content Type**: `application/json`
- **Error Handling**: Standardized error responses
- **Pagination**: Cursor-based pagination for large datasets

### API Endpoints Structure
```
/api/auth/*              # Authentication endpoints
/api/customers/*         # Customer management
/api/inquiries/*         # Inquiry management
/api/quotations/*        # Quotation management
/api/orders/*            # Order management
/api/inventory/*         # Inventory management
/api/production/*        # Production management
/api/quality/*           # Quality management
/api/accounts/*          # Financial accounting
/api/hr/*               # Human resources
/api/reports/*          # Business intelligence
/api/ai/*               # AI-powered features
/api/settings/*         # System configuration
```

### Request/Response Patterns
- Consistent JSON response format
- Error handling with appropriate HTTP status codes
- Request validation using Zod schemas
- Response caching for performance optimization

## Frontend Components

### Layout Components
- **Sidebar**: Navigation menu with module access
- **TopNav**: User profile, notifications, and quick actions
- **DashboardContainer**: Main content wrapper
- **Modal**: Reusable modal dialogs

### UI Component Library
- Based on Shadcn/ui with Tailwind CSS
- Custom components for business-specific functionality
- Responsive design patterns
- Accessibility compliance (ARIA labels, keyboard navigation)

### State Management
- TanStack Query for server state management
- React Context for global application state
- Local state with React hooks
- Form state with React Hook Form

### Routing Strategy
- Client-side routing with Wouter
- Protected routes with authentication checks
- Dynamic route parameters
- Nested routing for complex modules

## AI Integration

### AI Service Architecture
- Integration with OpenAI GPT-4o and Anthropic Claude Sonnet 4.0
- Fallback system between AI providers
- Context-aware prompting for business intelligence
- Real-time analysis and recommendations

### AI Features Implementation
1. **Style Recommendation Sidebar**
   - Real-time inventory analysis
   - Demand forecasting algorithms
   - Confidence scoring for recommendations
   - Interactive insights dashboard

2. **Inventory Optimization**
   - Reorder point calculations
   - Seasonal trend analysis
   - Overstock identification
   - Dead stock alerts

3. **Production Intelligence**
   - Efficiency optimization suggestions
   - Quality defect pattern recognition
   - Capacity planning assistance
   - Predictive maintenance alerts

## Multi-Tenant Architecture

### Tenant Isolation
- Database-level tenant separation
- Row-level security policies
- Tenant-specific configuration
- Isolated data access patterns

### Scalability Design
- Horizontal scaling capabilities
- Database connection pooling
- Caching strategies for multi-tenant data
- Resource allocation per tenant

### Tenant Management
- Automated tenant provisioning
- Custom branding per tenant
- Tenant-specific settings and configurations
- Usage analytics and billing integration

## Deployment & Configuration

### Environment Configuration
```env
# Database Configuration
DATABASE_URL=postgresql://...
PGHOST=localhost
PGPORT=5432
PGDATABASE=primex_erp
PGUSER=primex_user
PGPASSWORD=secure_password

# AI Service Configuration
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Application Configuration
NODE_ENV=production
JWT_SECRET=secure_jwt_secret
SESSION_SECRET=secure_session_secret

# Email Configuration (if using SendGrid)
SENDGRID_API_KEY=SG...

# Currency Exchange API
EXCHANGE_RATE_API_KEY=...
```

### Deployment Strategy
- **Development**: Local development with hot module replacement
- **Staging**: Preview deployments for testing
- **Production**: Optimized builds with CDN integration

### Performance Optimizations
- Bundle splitting and lazy loading
- Image optimization and compression
- Database query optimization
- Caching strategies (Redis/in-memory)
- CDN integration for static assets

### Monitoring & Analytics
- Error tracking and logging
- Performance monitoring
- User analytics
- Business intelligence metrics
- System health monitoring

## Development Workflow

### Code Structure Guidelines
- TypeScript for type safety
- Modular component architecture
- Separation of concerns (UI, business logic, data access)
- Consistent naming conventions
- Comprehensive error handling

### Testing Strategy
- Unit tests for utility functions
- Integration tests for API endpoints
- Component testing for React components
- End-to-end testing for critical workflows

### Code Quality
- ESLint configuration for code standards
- Prettier for code formatting
- Husky for git hooks
- Automated code review processes

## Future Development Roadmap

### Planned Enhancements
1. **Mobile Application**: React Native mobile app
2. **Advanced AI Features**: Machine learning model training
3. **IoT Integration**: Real-time production monitoring
4. **Blockchain Integration**: Supply chain transparency
5. **Advanced Analytics**: Predictive analytics dashboard
6. **API Ecosystem**: Public API for third-party integrations

### Technical Improvements
- Microservices architecture migration
- GraphQL API implementation
- Real-time collaboration features
- Advanced caching strategies
- Performance optimization initiatives

---

## Conclusion

PrimeX ERP is a comprehensive, AI-driven solution designed specifically for the garment manufacturing industry. Its modular architecture, advanced AI integration, and multi-tenant capabilities make it a scalable and efficient platform for managing complex manufacturing operations. The application successfully bridges the gap between traditional ERP systems and modern AI-powered business intelligence, providing users with actionable insights and automated recommendations for optimal business performance.

For technical implementation details, refer to the individual module documentation and API specifications within each respective directory.