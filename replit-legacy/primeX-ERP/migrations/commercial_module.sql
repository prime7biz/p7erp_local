-- Commercial module migration script
-- This adds the necessary tables for the commercial module

-- Commercial Inquiries Table
CREATE TABLE IF NOT EXISTS "commercial_inquiries" (
  "id" SERIAL PRIMARY KEY,
  "inquiry_number" VARCHAR(50) NOT NULL UNIQUE,
  "customer_id" INTEGER NOT NULL,
  "inquiry_date" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "season" VARCHAR(50),
  "delivery_deadline" DATE,
  "fabric_requirements" TEXT,
  "sampling_requirements" TEXT,
  "production_capacity" INTEGER,
  "target_price" DECIMAL(10, 2),
  "target_markets" VARCHAR(255),
  "compliance_requirements" TEXT,
  "inquiry_status" VARCHAR(50) NOT NULL DEFAULT 'New',
  "assigned_to" INTEGER REFERENCES "users"("id"),
  "sustainability_requirements" TEXT,
  "preferred_colors" TEXT,
  "special_finishes" TEXT,
  "attachments" JSON DEFAULT '[]',
  "comments" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id" INTEGER NOT NULL
);

-- Commercial Quotations Table
CREATE TABLE IF NOT EXISTS "commercial_quotations" (
  "id" SERIAL PRIMARY KEY,
  "quotation_number" VARCHAR(50) NOT NULL UNIQUE,
  "inquiry_id" INTEGER REFERENCES "commercial_inquiries"("id"),
  "customer_id" INTEGER NOT NULL,
  "quotation_date" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" DATE NOT NULL,
  "fabric_details" TEXT,
  "production_lead_time" INTEGER,
  "sampling_cost" DECIMAL(10, 2),
  "quotation_status" VARCHAR(50) NOT NULL DEFAULT 'Draft',
  "payment_terms" VARCHAR(255),
  "shipping_terms" VARCHAR(255),
  "total_quantity" INTEGER,
  "total_amount" DECIMAL(12, 2),
  "profit_margin" DECIMAL(5, 2),
  "currency_code" VARCHAR(3) DEFAULT 'USD',
  "exchange_rate" DECIMAL(10, 4),
  "is_approved" BOOLEAN DEFAULT FALSE,
  "approved_by" INTEGER REFERENCES "users"("id"),
  "approval_date" TIMESTAMP,
  "comments" TEXT,
  "created_by" INTEGER REFERENCES "users"("id"),
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id" INTEGER NOT NULL
);

-- Commercial Orders Table
CREATE TABLE IF NOT EXISTS "commercial_orders" (
  "id" SERIAL PRIMARY KEY,
  "order_number" VARCHAR(50) NOT NULL UNIQUE,
  "quotation_id" INTEGER REFERENCES "commercial_quotations"("id"),
  "customer_id" INTEGER NOT NULL,
  "po_number" VARCHAR(100),
  "order_date" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "delivery_date" DATE,
  "order_status" VARCHAR(50) NOT NULL DEFAULT 'New',
  "total_quantity" INTEGER,
  "total_amount" DECIMAL(12, 2),
  "currency_code" VARCHAR(3) DEFAULT 'USD',
  "exchange_rate" DECIMAL(10, 4),
  "payment_terms" VARCHAR(255),
  "shipping_terms" VARCHAR(255),
  "is_confirmed" BOOLEAN DEFAULT FALSE,
  "confirmed_by" INTEGER REFERENCES "users"("id"),
  "confirmation_date" TIMESTAMP,
  "buyer_remarks" TEXT,
  "internal_notes" TEXT,
  "attachments" JSON DEFAULT '[]',
  "created_by" INTEGER REFERENCES "users"("id"),
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id" INTEGER NOT NULL
);

-- Letter of Credits (LC) Table
CREATE TABLE IF NOT EXISTS "letter_of_credits" (
  "id" SERIAL PRIMARY KEY,
  "lc_number" VARCHAR(100) NOT NULL,
  "order_id" INTEGER REFERENCES "commercial_orders"("id"),
  "customer_id" INTEGER NOT NULL,
  "bank_name" VARCHAR(255),
  "issuing_bank" VARCHAR(255),
  "advising_bank" VARCHAR(255),
  "issuance_date" DATE,
  "expiry_date" DATE,
  "last_shipment_date" DATE,
  "amount" DECIMAL(12, 2),
  "currency_code" VARCHAR(3) DEFAULT 'USD',
  "status" VARCHAR(50) DEFAULT 'Draft',
  "documents" JSON DEFAULT '[]',
  "amendment_details" TEXT,
  "amendment_date" DATE,
  "lc_terms" TEXT,
  "payment_terms" VARCHAR(255),
  "bank_charges" DECIMAL(10, 2),
  "discrepancies" TEXT,
  "reminder_date" DATE,
  "comments" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id" INTEGER NOT NULL
);

-- Shipments Table
CREATE TABLE IF NOT EXISTS "shipments" (
  "id" SERIAL PRIMARY KEY,
  "shipment_number" VARCHAR(50) NOT NULL UNIQUE,
  "order_id" INTEGER REFERENCES "commercial_orders"("id"),
  "shipment_date" DATE,
  "etd" DATE, -- Estimated Time of Departure
  "eta" DATE, -- Estimated Time of Arrival
  "shipment_mode" VARCHAR(50), -- Air, Sea, Land
  "carrier" VARCHAR(255),
  "tracking_number" VARCHAR(100),
  "container_details" JSON,
  "goods_description" TEXT,
  "package_count" INTEGER,
  "gross_weight" DECIMAL(10, 2),
  "net_weight" DECIMAL(10, 2),
  "volume" DECIMAL(10, 2),
  "unit_of_measure" VARCHAR(20),
  "forwarder" VARCHAR(255),
  "shipping_documents" JSON,
  "customs_clearance_status" VARCHAR(50),
  "inspection_details" TEXT,
  "status" VARCHAR(50) DEFAULT 'Planned',
  "notes" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id" INTEGER NOT NULL
);

-- Buyer Feedback Table
CREATE TABLE IF NOT EXISTS "buyer_feedback" (
  "id" SERIAL PRIMARY KEY,
  "order_id" INTEGER REFERENCES "commercial_orders"("id"),
  "customer_id" INTEGER NOT NULL,
  "feedback_date" DATE DEFAULT CURRENT_DATE,
  "quality_rating" INTEGER, -- 1-5 scale
  "delivery_rating" INTEGER, -- 1-5 scale
  "communication_rating" INTEGER, -- 1-5 scale
  "price_rating" INTEGER, -- 1-5 scale
  "overall_rating" INTEGER, -- 1-5 scale
  "comments" TEXT,
  "strengths_highlighted" TEXT,
  "improvement_areas" TEXT,
  "action_taken" TEXT,
  "responded_by" INTEGER REFERENCES "users"("id"),
  "response_date" DATE,
  "response_comments" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id" INTEGER NOT NULL
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS "commercial_inquiries_customer_id_idx" ON "commercial_inquiries"("customer_id");
CREATE INDEX IF NOT EXISTS "commercial_inquiries_tenant_id_idx" ON "commercial_inquiries"("tenant_id");

CREATE INDEX IF NOT EXISTS "commercial_quotations_inquiry_id_idx" ON "commercial_quotations"("inquiry_id");
CREATE INDEX IF NOT EXISTS "commercial_quotations_customer_id_idx" ON "commercial_quotations"("customer_id");
CREATE INDEX IF NOT EXISTS "commercial_quotations_tenant_id_idx" ON "commercial_quotations"("tenant_id");

CREATE INDEX IF NOT EXISTS "commercial_orders_quotation_id_idx" ON "commercial_orders"("quotation_id");
CREATE INDEX IF NOT EXISTS "commercial_orders_customer_id_idx" ON "commercial_orders"("customer_id");
CREATE INDEX IF NOT EXISTS "commercial_orders_tenant_id_idx" ON "commercial_orders"("tenant_id");

CREATE INDEX IF NOT EXISTS "letter_of_credits_order_id_idx" ON "letter_of_credits"("order_id");
CREATE INDEX IF NOT EXISTS "letter_of_credits_customer_id_idx" ON "letter_of_credits"("customer_id");
CREATE INDEX IF NOT EXISTS "letter_of_credits_tenant_id_idx" ON "letter_of_credits"("tenant_id");

CREATE INDEX IF NOT EXISTS "shipments_order_id_idx" ON "shipments"("order_id");
CREATE INDEX IF NOT EXISTS "shipments_tenant_id_idx" ON "shipments"("tenant_id");

CREATE INDEX IF NOT EXISTS "buyer_feedback_order_id_idx" ON "buyer_feedback"("order_id");
CREATE INDEX IF NOT EXISTS "buyer_feedback_customer_id_idx" ON "buyer_feedback"("customer_id");
CREATE INDEX IF NOT EXISTS "buyer_feedback_tenant_id_idx" ON "buyer_feedback"("tenant_id");