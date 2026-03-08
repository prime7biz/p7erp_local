CREATE TABLE "achievement_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"badge_id" integer NOT NULL,
	"activity_type" varchar(50) NOT NULL,
	"old_level" integer,
	"new_level" integer,
	"old_progress" integer,
	"new_progress" integer,
	"points_awarded" integer,
	"message" text,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievement_badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"icon" varchar(50) NOT NULL,
	"category" varchar(50) NOT NULL,
	"max_level" integer DEFAULT 1 NOT NULL,
	"thresholds" jsonb NOT NULL,
	"color_class" varchar(50) NOT NULL,
	"tenant_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"badge_id" integer NOT NULL,
	"current_level" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"unlocked" boolean DEFAULT false NOT NULL,
	"date_unlocked" timestamp,
	"date_level_up" timestamp,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_user_id_badge_id_tenant_id_unique" UNIQUE("user_id","badge_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "user_performance_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"metric_type" varchar(50) NOT NULL,
	"value" integer NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"customer_id" integer NOT NULL,
	"feedback_date" date DEFAULT now(),
	"quality_rating" integer,
	"delivery_rating" integer,
	"communication_rating" integer,
	"price_rating" integer,
	"overall_rating" integer,
	"comments" text,
	"strengths_highlighted" text,
	"improvement_areas" text,
	"action_taken" text,
	"responded_by" integer,
	"response_date" date,
	"response_comments" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"tenant_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cm_cost_breakdowns" (
	"id" serial PRIMARY KEY NOT NULL,
	"style_id" integer NOT NULL,
	"operation_name" varchar(100) NOT NULL,
	"department" varchar(100),
	"machine_type" varchar(100),
	"time_required" numeric(8, 2),
	"cost_per_minute" numeric(8, 4),
	"total_cost" numeric(10, 2) NOT NULL,
	"remarks" text,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_inquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"inquiry_number" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"inquiry_date" timestamp DEFAULT now() NOT NULL,
	"season" varchar(50),
	"delivery_deadline" date,
	"fabric_requirements" text,
	"sampling_requirements" text,
	"production_capacity" integer,
	"target_price" numeric(10, 2),
	"target_markets" varchar(255),
	"compliance_requirements" text,
	"inquiry_status" varchar(50) DEFAULT 'New' NOT NULL,
	"assigned_to" integer,
	"sustainability_requirements" text,
	"preferred_colors" text,
	"special_finishes" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"comments" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"tenant_id" integer NOT NULL,
	CONSTRAINT "commercial_inquiries_inquiry_number_unique" UNIQUE("inquiry_number")
);
--> statement-breakpoint
CREATE TABLE "commercial_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"quotation_id" integer,
	"customer_id" integer NOT NULL,
	"po_number" varchar(100),
	"order_date" timestamp DEFAULT now() NOT NULL,
	"delivery_date" date,
	"order_status" varchar(50) DEFAULT 'New' NOT NULL,
	"total_quantity" integer,
	"total_amount" numeric(12, 2),
	"currency_code" varchar(3) DEFAULT 'USD',
	"exchange_rate" numeric(10, 4),
	"payment_terms" varchar(255),
	"shipping_terms" varchar(255),
	"is_confirmed" boolean DEFAULT false,
	"confirmed_by" integer,
	"confirmation_date" timestamp,
	"buyer_remarks" text,
	"internal_notes" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"tenant_id" integer NOT NULL,
	CONSTRAINT "commercial_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "commercial_quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_number" varchar(50) NOT NULL,
	"inquiry_id" integer,
	"customer_id" integer NOT NULL,
	"quotation_date" timestamp DEFAULT now() NOT NULL,
	"valid_until" date NOT NULL,
	"fabric_details" text,
	"production_lead_time" integer,
	"sampling_cost" numeric(10, 2),
	"quotation_status" varchar(50) DEFAULT 'Draft' NOT NULL,
	"payment_terms" varchar(255),
	"shipping_terms" varchar(255),
	"total_quantity" integer,
	"total_amount" numeric(12, 2),
	"profit_margin" numeric(5, 2),
	"currency_code" varchar(3) DEFAULT 'USD',
	"exchange_rate" numeric(10, 4),
	"is_approved" boolean DEFAULT false,
	"approved_by" integer,
	"approval_date" timestamp,
	"comments" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"tenant_id" integer NOT NULL,
	CONSTRAINT "commercial_quotations_quotation_number_unique" UNIQUE("quotation_number")
);
--> statement-breakpoint
CREATE TABLE "costing_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"template_name" varchar(100) NOT NULL,
	"product_category" varchar(100) NOT NULL,
	"description" text,
	"default_wastage" numeric(5, 2),
	"default_profit" numeric(5, 2),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "costing_templates_tenant_id_template_name_unique" UNIQUE("tenant_id","template_name")
);
--> statement-breakpoint
CREATE TABLE "export_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_id" integer,
	"document_type" varchar(50) NOT NULL,
	"document_number" varchar(100),
	"document_date" date,
	"issued_by" varchar(100),
	"issued_to" varchar(100),
	"description" text,
	"amount" numeric(12, 2),
	"currency_code" varchar(3) DEFAULT 'USD',
	"status" varchar(50) DEFAULT 'Draft',
	"document_files" jsonb DEFAULT '[]'::jsonb,
	"remarks" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letter_of_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"lc_number" varchar(100) NOT NULL,
	"order_id" integer,
	"customer_id" integer NOT NULL,
	"bank_name" varchar(255),
	"issuing_bank" varchar(255),
	"advising_bank" varchar(255),
	"issuance_date" date,
	"expiry_date" date,
	"last_shipment_date" date,
	"amount" numeric(12, 2),
	"currency_code" varchar(3) DEFAULT 'USD',
	"status" varchar(50) DEFAULT 'Draft',
	"documents" jsonb DEFAULT '[]'::jsonb,
	"amendment_details" text,
	"amendment_date" date,
	"lc_terms" text,
	"payment_terms" varchar(255),
	"bank_charges" numeric(10, 2),
	"discrepancies" text,
	"reminder_date" date,
	"comments" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"tenant_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_styles" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"quotation_style_id" integer,
	"style_name" varchar(100) NOT NULL,
	"style_code" varchar(50),
	"product_category" varchar(100),
	"description" text,
	"technical_details" text,
	"size_range" varchar(255),
	"colors" varchar(255),
	"fabric_composition" varchar(255),
	"fabric_weight" varchar(50),
	"artwork" jsonb DEFAULT '[]'::jsonb,
	"quantity_per_size" jsonb,
	"unit_price" numeric(10, 2),
	"total_quantity" integer,
	"total_amount" numeric(12, 2),
	"delivery_date" date,
	"packing_instructions" text,
	"special_requirements" text,
	"quality_standards" text,
	"approved_sample" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_styles" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer NOT NULL,
	"style_name" varchar(100) NOT NULL,
	"style_code" varchar(50),
	"product_category" varchar(100),
	"description" text,
	"technical_details" text,
	"size_range" varchar(255),
	"colors" varchar(255),
	"fabric_composition" varchar(255),
	"fabric_weight" varchar(50),
	"artwork" jsonb DEFAULT '[]'::jsonb,
	"quantity_per_size" jsonb,
	"unit_price" numeric(10, 2),
	"total_quantity" integer,
	"total_amount" numeric(12, 2),
	"comments" text,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipment_number" varchar(50) NOT NULL,
	"order_id" integer,
	"shipment_date" date,
	"etd" date,
	"eta" date,
	"shipment_mode" varchar(50),
	"carrier" varchar(255),
	"tracking_number" varchar(100),
	"container_details" jsonb,
	"goods_description" text,
	"package_count" integer,
	"gross_weight" numeric(10, 2),
	"net_weight" numeric(10, 2),
	"volume" numeric(10, 2),
	"unit_of_measure" varchar(20),
	"forwarder" varchar(255),
	"shipping_documents" jsonb,
	"customs_clearance_status" varchar(50),
	"inspection_details" text,
	"status" varchar(50) DEFAULT 'Planned',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"tenant_id" integer NOT NULL,
	CONSTRAINT "shipments_shipment_number_unique" UNIQUE("shipment_number")
);
--> statement-breakpoint
CREATE TABLE "style_cost_breakdowns" (
	"id" serial PRIMARY KEY NOT NULL,
	"style_id" integer NOT NULL,
	"material_category" varchar(100) NOT NULL,
	"material_name" varchar(100) NOT NULL,
	"material_description" text,
	"supplier" varchar(100),
	"unit" varchar(20) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"wastage" numeric(5, 2),
	"total_cost" numeric(10, 2) NOT NULL,
	"remarks" text,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_agents" ADD COLUMN "agent_address" text;--> statement-breakpoint
ALTER TABLE "customer_agents" ADD COLUMN "tenant_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "website" varchar;--> statement-breakpoint
ALTER TABLE "achievement_activity_logs" ADD CONSTRAINT "achievement_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_activity_logs" ADD CONSTRAINT "achievement_activity_logs_badge_id_achievement_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."achievement_badges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_activity_logs" ADD CONSTRAINT "achievement_activity_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_badges" ADD CONSTRAINT "achievement_badges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_badge_id_achievement_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."achievement_badges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_performance_metrics" ADD CONSTRAINT "user_performance_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_performance_metrics" ADD CONSTRAINT "user_performance_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_feedback" ADD CONSTRAINT "buyer_feedback_order_id_commercial_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commercial_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_feedback" ADD CONSTRAINT "buyer_feedback_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_feedback" ADD CONSTRAINT "buyer_feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cm_cost_breakdowns" ADD CONSTRAINT "cm_cost_breakdowns_style_id_quotation_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."quotation_styles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cm_cost_breakdowns" ADD CONSTRAINT "cm_cost_breakdowns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_inquiries" ADD CONSTRAINT "commercial_inquiries_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_inquiries" ADD CONSTRAINT "commercial_inquiries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_orders" ADD CONSTRAINT "commercial_orders_quotation_id_commercial_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."commercial_quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_orders" ADD CONSTRAINT "commercial_orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_orders" ADD CONSTRAINT "commercial_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_orders" ADD CONSTRAINT "commercial_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_quotations" ADD CONSTRAINT "commercial_quotations_inquiry_id_commercial_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."commercial_inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_quotations" ADD CONSTRAINT "commercial_quotations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_quotations" ADD CONSTRAINT "commercial_quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_quotations" ADD CONSTRAINT "commercial_quotations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_templates" ADD CONSTRAINT "costing_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_documents" ADD CONSTRAINT "export_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_documents" ADD CONSTRAINT "export_documents_order_id_commercial_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commercial_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_documents" ADD CONSTRAINT "export_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_of_credits" ADD CONSTRAINT "letter_of_credits_order_id_commercial_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commercial_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_of_credits" ADD CONSTRAINT "letter_of_credits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_styles" ADD CONSTRAINT "order_styles_order_id_commercial_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commercial_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_styles" ADD CONSTRAINT "order_styles_quotation_style_id_quotation_styles_id_fk" FOREIGN KEY ("quotation_style_id") REFERENCES "public"."quotation_styles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_styles" ADD CONSTRAINT "order_styles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_styles" ADD CONSTRAINT "quotation_styles_quotation_id_commercial_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."commercial_quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_styles" ADD CONSTRAINT "quotation_styles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_commercial_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commercial_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_cost_breakdowns" ADD CONSTRAINT "style_cost_breakdowns_style_id_quotation_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."quotation_styles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_cost_breakdowns" ADD CONSTRAINT "style_cost_breakdowns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_agents" ADD CONSTRAINT "customer_agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;