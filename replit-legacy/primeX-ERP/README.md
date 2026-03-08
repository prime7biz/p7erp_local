# primeX ERP System

AI-driven SaaS ERP system for garments manufacturers and buying houses, delivering intelligent operational tools with advanced technological capabilities and user-centric design.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [AI Integration](#ai-integration)
- [Deployment](#deployment)

## Overview

primeX is a comprehensive ERP solution specifically designed for the garment manufacturing industry. It features advanced AI-powered demand forecasting, real-time production monitoring, and specialized modules covering the complete garment manufacturing lifecycle from inquiry to production.

### Key Business Modules

- **CRM & Customer Management** - Complete customer relationship management
- **Sample Development** - Sample tracking and approval workflows
- **Time & Action Plan** - Production planning and milestone tracking
- **Bill of Materials** - Material planning and cost management
- **Inventory Management** - Multi-warehouse inventory tracking
- **Quotations & Orders** - Multi-currency quotation and order management
- **Production Management** - Real-time production monitoring
- **Quality Control** - Quality assurance and testing workflows
- **HR & Payroll** - Human resource management
- **Accounting & Finance** - Complete financial management
- **Reports & Analytics** - AI-powered business intelligence

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling and development server
- **Wouter** for client-side routing
- **TanStack Query** for server state management
- **React Hook Form** with Zod validation
- **Tailwind CSS** for styling
- **shadcn/ui** component library
- **Lucide React** for icons

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **PostgreSQL** database
- **Drizzle ORM** for database operations
- **JWT** for authentication
- **bcrypt** for password hashing
- **Cookie-based** session management

### AI & Analytics
- **OpenAI GPT-4** for intelligent insights
- **Anthropic Claude** for advanced analysis
- **TensorFlow.js** for demand forecasting
- **Custom ML models** for pattern recognition

## Project Structure

```
primeX/
├── client/                          # Frontend React application
│   ├── public/                      # Static assets
│   ├── src/
│   │   ├── components/              # Reusable UI components
│   │   │   ├── ui/                  # shadcn/ui components
│   │   │   ├── layout/              # Layout components (Sidebar, TopNav)
│   │   │   ├── ai/                  # AI-related components
│   │   │   └── onboarding/          # User onboarding components
│   │   ├── pages/                   # Page components
│   │   │   ├── auth/                # Authentication pages
│   │   │   ├── inventory/           # Inventory management pages
│   │   │   ├── quotations/          # Quotation management pages
│   │   │   ├── orders/              # Order management pages
│   │   │   ├── samples/             # Sample development pages
│   │   │   ├── time-action/         # Time & Action plan pages
│   │   │   ├── production/          # Production management pages
│   │   │   ├── quality/             # Quality control pages
│   │   │   ├── hr/                  # HR management pages
│   │   │   ├── accounts/            # Accounting pages
│   │   │   ├── commercial/          # Commercial department pages
│   │   │   ├── logistics/           # Logistics management pages
│   │   │   ├── reports/             # Reports and analytics pages
│   │   │   ├── crm/                 # CRM pages
│   │   │   └── settings/            # System settings pages
│   │   ├── context/                 # React contexts
│   │   │   ├── auth-context.tsx     # Authentication context
│   │   │   ├── onboarding-context.tsx # User onboarding context
│   │   │   └── gamification-context.tsx # Gamification features
│   │   ├── hooks/                   # Custom React hooks
│   │   ├── lib/                     # Utility libraries
│   │   │   ├── queryClient.ts       # TanStack Query configuration
│   │   │   └── utils.ts             # General utilities
│   │   └── App.tsx                  # Main application component
│   ├── index.html                   # HTML template
│   └── package.json                 # Frontend dependencies
├── server/                          # Backend Node.js application
│   ├── api/                         # API route handlers
│   │   ├── customerRoutes.ts        # Customer management APIs
│   │   ├── inventoryRoutes.ts       # Inventory management APIs
│   │   ├── quotationRoutes.ts       # Quotation management APIs
│   │   ├── orderRoutes.ts           # Order management APIs
│   │   ├── sampleDevelopmentRoutes.ts # Sample development APIs
│   │   ├── timeActionRoutes.ts      # Time & Action plan APIs
│   │   ├── aiRoutes.ts              # AI integration APIs
│   │   ├── reportRoutes.ts          # Reports and analytics APIs
│   │   ├── crmRoutes.ts             # CRM APIs
│   │   └── demandForecastingRoutes.ts # AI demand forecasting APIs
│   ├── middleware/                  # Express middleware
│   │   ├── auth.ts                  # JWT authentication middleware
│   │   ├── tenantIsolation.ts       # Multi-tenant data isolation
│   │   └── security.ts              # Security headers and rate limiting
│   ├── services/                    # Business logic services
│   │   ├── aiRecommendationService.ts # AI recommendation engine
│   │   ├── demandForecastingService.ts # Demand forecasting service
│   │   └── analyticsService.ts      # Analytics and reporting service
│   ├── routes/                      # Additional route modules
│   │   ├── accounting.ts            # Accounting routes
│   │   ├── voucherRoutes.ts         # Voucher management routes
│   │   └── currencyRoutes.ts        # Currency management routes
│   ├── db.ts                        # Database connection
│   ├── storage.ts                   # Data access layer
│   ├── routes.ts                    # Main routes configuration
│   └── index.ts                     # Server entry point
├── shared/                          # Shared types and schemas
│   ├── types.ts                     # TypeScript type definitions
│   └── schema.ts                    # Drizzle database schema
├── migrations/                      # Database migrations
├── scripts/                         # Utility scripts
│   ├── create-sample-time-action-plans.ts # Sample data generation
│   └── add-sample-time-action-plans.ts    # Additional sample data
├── drizzle.config.ts               # Drizzle ORM configuration
├── package.json                    # Root project dependencies
├── tsconfig.json                   # TypeScript configuration
├── tailwind.config.ts              # Tailwind CSS configuration
├── vite.config.ts                  # Vite configuration
└── .env                           # Environment variables

```

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd primeX
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   # Database
   DATABASE_URL=postgresql://username:password@localhost:5432/primex_db
   
   # JWT Secret
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   
   # AI API Keys (Optional)
   OPENAI_API_KEY=your-openai-api-key
   ANTHROPIC_API_KEY=your-anthropic-api-key
   
   # Email Service (Optional)
   SENDGRID_API_KEY=your-sendgrid-api-key
   ```

4. **Set up the database**
   ```bash
   # Generate and run migrations
   npm run db:generate
   npm run db:migrate
   
   # Or push schema directly (development)
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:5000`

### Demo Access

For quick testing, use the demo login button on the login page which provides access with pre-configured admin credentials.

## Authentication

The system uses JWT-based authentication with the following features:

- **Cookie-based sessions** for secure token storage
- **Multi-tenant isolation** ensuring data separation between companies
- **Role-based access control** (Admin, Manager, User roles)
- **Secure password hashing** using bcrypt
- **Token refresh** for extended sessions

### User Registration Flow

1. Company registration creates a new tenant
2. First user becomes the admin
3. Trial subscription is automatically created
4. JWT token is issued for immediate access

### Protected Routes

All API routes under `/api/` (except auth endpoints) require authentication:
- `/api/auth/login` - Public
- `/api/auth/register` - Public  
- `/api/auth/demo-login` - Public
- All other `/api/*` routes - Protected

## API Documentation

### Authentication Endpoints

#### POST `/api/auth/register`
Register a new company and admin user.

**Request:**
```json
{
  "companyName": "string",
  "username": "string", 
  "email": "string",
  "password": "string"
}
```

#### POST `/api/auth/login`
Authenticate user and receive JWT token.

**Request:**
```json
{
  "username": "string",
  "password": "string"
}
```

#### POST `/api/auth/demo-login`
Demo login with pre-configured admin user.

#### GET `/api/auth/me`
Get current authenticated user information.

#### POST `/api/auth/logout`
Logout and clear authentication token.

### Business Module APIs

#### Inventory Management
- `GET /api/warehouses` - List warehouses
- `POST /api/warehouses` - Create warehouse
- `GET /api/items` - List inventory items
- `POST /api/items` - Create inventory item
- `GET /api/inventory-movements` - List inventory transactions

#### Customer Management
- `GET /api/customers` - List customers
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer

#### Quotations & Orders
- `GET /api/quotations` - List quotations
- `POST /api/quotations` - Create quotation
- `POST /api/quotations/:id/convert-to-order` - Convert to order
- `GET /api/orders` - List orders

#### Sample Development
- `GET /api/samples` - List samples
- `POST /api/samples` - Create sample
- `PUT /api/samples/:id/status` - Update sample status

#### Time & Action Plans
- `GET /api/time-action-plans` - List plans
- `POST /api/time-action-plans` - Create plan
- `GET /api/time-action-plans/:id/milestones` - List milestones

#### AI & Analytics
- `GET /api/demand-forecasting` - Get demand forecasts
- `POST /api/ai/recommendations` - Get AI recommendations
- `GET /api/reports/analytics` - Get business analytics

## Database Schema

### Core Entities

#### Users & Tenants
- `users` - User accounts with role-based access
- `tenants` - Company/organization data isolation
- `subscriptions` - Subscription plans and billing

#### Business Entities
- `customers` - Customer information and contacts
- `suppliers` - Supplier and vendor management
- `warehouses` - Warehouse and location management
- `items` - Inventory items and products
- `categories` - Item categorization system

#### Business Processes
- `inquiries` - Customer inquiries and RFQs
- `quotations` - Price quotations and proposals
- `orders` - Purchase orders and sales orders
- `samples` - Sample development tracking
- `time_action_plans` - Production planning
- `inventory_movements` - Stock transactions

#### Financial
- `currencies` - Multi-currency support
- `exchange_rates` - Currency conversion rates
- `vouchers` - Accounting vouchers
- `accounts` - Chart of accounts

### Multi-Tenant Architecture

Every business entity includes `tenantId` for data isolation:
```sql
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name VARCHAR NOT NULL,
  -- other fields
);
```

## AI Integration

### Demand Forecasting

Uses machine learning models to predict future demand:

- **Time series analysis** for historical patterns
- **Seasonal pattern detection** for cyclical trends  
- **External factors integration** (holidays, events)
- **Multiple forecasting models** (ARIMA, Linear Regression, Neural Networks)

#### API Usage:
```javascript
// Get demand forecast
const forecast = await fetch('/api/demand-forecasting', {
  method: 'POST',
  body: JSON.stringify({
    itemId: 123,
    horizonDays: 30,
    includeSeasonality: true
  })
});
```

### AI Recommendations

Provides intelligent business insights:

- **Inventory optimization** suggestions
- **Reorder point calculations** 
- **Style and trend recommendations**
- **Production efficiency analysis**

### Integration Setup

Add your AI API keys to the `.env` file:
```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

The system gracefully handles missing API keys by disabling AI features.

## Security Features

### Multi-Tenant Data Isolation
- Automatic tenant filtering on all database queries
- Row-level security enforcement
- Tenant context validation in middleware

### Authentication Security
- JWT tokens with secure httpOnly cookies
- Password hashing with bcrypt (10 rounds)
- Rate limiting on authentication endpoints
- CSRF protection via SameSite cookies

### API Security
- Security headers (HSTS, CSP, X-Frame-Options)
- SQL injection prevention middleware
- Input validation with Zod schemas
- Audit logging for sensitive operations

## Development

### Adding New Features

1. **Database Schema**: Update `shared/schema.ts` with new tables
2. **API Routes**: Create route handlers in `server/api/`
3. **Frontend Pages**: Add page components in `client/src/pages/`
4. **Navigation**: Update sidebar navigation in `client/src/components/layout/sidebar.tsx`

### Database Migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations to database  
npm run db:migrate

# Development: Push schema directly
npm run db:push
```

### Code Structure Guidelines

- **Shared Types**: Define in `shared/types.ts` for frontend/backend consistency
- **API Validation**: Use Zod schemas for request validation
- **Error Handling**: Implement consistent error responses
- **TypeScript**: Maintain strict type safety across the codebase

## Deployment

### Production Build

```bash
# Build frontend
npm run build

# Start production server
npm start
```

### Environment Variables (Production)

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=secure-random-string
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

### Database Setup (Production)

```bash
# Run migrations
npm run db:migrate
```

### Performance Considerations

- **Database Indexing**: Ensure proper indexes on tenant_id and frequently queried fields
- **Caching**: Implement Redis caching for frequently accessed data
- **CDN**: Use CDN for static assets
- **Load Balancing**: Deploy multiple instances behind a load balancer

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software owned by Prime7 Business Solutions.

## Support

For technical support or questions:
- Email: support@prime7solutions.com
- Documentation: [Internal Wiki]
- Issue Tracker: [Internal System]

---

**primeX ERP System** - Empowering Garment Manufacturers with Intelligent Operations