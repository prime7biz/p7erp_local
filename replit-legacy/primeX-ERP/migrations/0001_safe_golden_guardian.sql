CREATE TABLE "account_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(20) NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text,
	"normal_balance" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_types_tenant_id_code_unique" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"fiscal_year_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"is_current" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_periods_fiscal_year_id_name_unique" UNIQUE("fiscal_year_id","name")
);
--> statement-breakpoint
CREATE TABLE "bill_of_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"version" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false,
	"effective_date" date,
	"expiry_date" date,
	"notes" text,
	"total_cost" numeric DEFAULT '0',
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"bom_id" integer NOT NULL,
	"component_item_id" integer NOT NULL,
	"variant_id" integer,
	"quantity" numeric DEFAULT '1' NOT NULL,
	"unit_id" integer NOT NULL,
	"wastage_percentage" numeric DEFAULT '0',
	"cost_per_unit" numeric DEFAULT '0',
	"position" varchar(50),
	"notes" text,
	"is_optional" boolean DEFAULT false,
	"is_alternative" boolean DEFAULT false,
	"alternative_for" integer,
	"sort_order" integer DEFAULT 0,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_portal_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"password" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp,
	"reset_token" varchar(255),
	"reset_token_expiry" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_portal_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"account_type_id" integer NOT NULL,
	"parent_account_id" integer,
	"account_number" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"path" varchar(255) NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"allow_journal_entries" boolean DEFAULT true NOT NULL,
	"is_cash_account" boolean DEFAULT false NOT NULL,
	"is_bank_account" boolean DEFAULT false NOT NULL,
	"bank_account_details" jsonb,
	"balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chart_of_accounts_tenant_id_account_number_unique" UNIQUE("tenant_id","account_number")
);
--> statement-breakpoint
CREATE TABLE "communication_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	"subject" varchar(255),
	"content" text NOT NULL,
	"variables" jsonb,
	"is_active" boolean DEFAULT true,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"activity_type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"activity_date" timestamp NOT NULL,
	"related_entity_type" varchar(50),
	"related_entity_id" integer,
	"follow_up_required" boolean DEFAULT false,
	"follow_up_date" timestamp,
	"is_completed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(3) NOT NULL,
	"name" varchar(50) NOT NULL,
	"symbol" varchar(5) NOT NULL,
	"decimal_places" integer DEFAULT 2 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"tenant_id" integer NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "currency_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency_id" integer NOT NULL,
	"insight_type" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"confidence" numeric(3, 2),
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"insight_type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"insight_data" jsonb,
	"score" integer,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"interaction_type" varchar(50) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"description" text,
	"interaction_date" timestamp NOT NULL,
	"next_follow_up_date" timestamp,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"assigned_to" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency_id" integer NOT NULL,
	"rate" numeric(10, 6) NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_to" timestamp,
	"source" varchar(50),
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"insight_type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"recommendations" text[],
	"metrics" jsonb,
	"severity" varchar(20),
	"confidence" numeric(5, 2),
	"period_start" date,
	"period_end" date,
	"comparison_period_start" date,
	"comparison_period_end" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_statement_section_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"section_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"include_sub_accounts" boolean DEFAULT true,
	"is_negative" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "financial_statement_section_accounts_section_id_account_id_unique" UNIQUE("section_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "financial_statement_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	"formula" text,
	"parent_section_id" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"indent_level" integer DEFAULT 0 NOT NULL,
	"show_total" boolean DEFAULT true,
	"is_negative" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_statement_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "financial_statement_templates_tenant_id_name_type_unique" UNIQUE("tenant_id","name","type")
);
--> statement-breakpoint
CREATE TABLE "fiscal_years" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"is_current" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_years_tenant_id_name_unique" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "item_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"variant_id" integer,
	"warehouse_id" integer NOT NULL,
	"location_code" varchar(50),
	"quantity" numeric DEFAULT '0' NOT NULL,
	"reserved_quantity" numeric DEFAULT '0',
	"available_quantity" numeric DEFAULT '0',
	"unit_cost" numeric DEFAULT '0',
	"last_count_date" timestamp,
	"expiry_date" date,
	"lot_number" varchar(50),
	"serial_numbers" text[],
	"minimum_stock_level" numeric DEFAULT '0',
	"maximum_stock_level" numeric,
	"reorder_point" numeric DEFAULT '0',
	"reorder_quantity" numeric DEFAULT '0',
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_stock_item_id_variant_id_warehouse_id_location_code_unique" UNIQUE("item_id","variant_id","warehouse_id","location_code")
);
--> statement-breakpoint
CREATE TABLE "item_subcategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"subcategory_id" varchar NOT NULL,
	"category_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_subcategories_subcategory_id_unique" UNIQUE("subcategory_id")
);
--> statement-breakpoint
CREATE TABLE "item_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_code" varchar(10) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"type" varchar(50) NOT NULL,
	"base_unit" boolean DEFAULT false NOT NULL,
	"conversion_factor" numeric DEFAULT '1',
	"base_unit_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_units_unit_code_unique" UNIQUE("unit_code")
);
--> statement-breakpoint
CREATE TABLE "item_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_item_id" integer NOT NULL,
	"variant_code" varchar(30) NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(50),
	"barcode" varchar(50),
	"attributes" jsonb NOT NULL,
	"images" text[],
	"default_cost" numeric DEFAULT '0',
	"default_price" numeric DEFAULT '0',
	"is_active" boolean DEFAULT true NOT NULL,
	"weight" numeric,
	"dimensions" jsonb,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_variants_variant_code_unique" UNIQUE("variant_code"),
	CONSTRAINT "item_variants_sku_unique" UNIQUE("sku"),
	CONSTRAINT "item_variants_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category_id" integer NOT NULL,
	"subcategory_id" integer,
	"unit_id" integer NOT NULL,
	"purchase_unit_id" integer,
	"sku" varchar(50),
	"barcode" varchar(50),
	"has_variants" boolean DEFAULT false NOT NULL,
	"type" varchar(50) DEFAULT 'standard' NOT NULL,
	"min_stock_level" numeric DEFAULT '0',
	"max_stock_level" numeric,
	"reorder_point" numeric DEFAULT '0',
	"lead_time_in_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_stockable" boolean DEFAULT true NOT NULL,
	"is_service_item" boolean DEFAULT false NOT NULL,
	"is_bill_of_material" boolean DEFAULT false NOT NULL,
	"cost_method" varchar(20) DEFAULT 'average',
	"default_cost" numeric DEFAULT '0',
	"default_price" numeric DEFAULT '0',
	"images" text[],
	"tags" text[],
	"attributes" jsonb,
	"meta" jsonb,
	"vendor_ids" integer[],
	"garment_types" text[],
	"seasons" text[],
	"material_content" jsonb,
	"weight" numeric,
	"weight_unit" varchar(10),
	"color" varchar(50),
	"size" varchar(50),
	"dimensions" jsonb,
	"sales_taxable" boolean DEFAULT true,
	"purchase_taxable" boolean DEFAULT true,
	"tax_rate" numeric DEFAULT '0',
	"hs_code" varchar(20),
	"country_of_origin" varchar(50),
	"discontinued" boolean DEFAULT false,
	"discontinued_date" timestamp,
	"replacement_item_id" integer,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "items_item_code_unique" UNIQUE("item_code"),
	CONSTRAINT "items_sku_unique" UNIQUE("sku"),
	CONSTRAINT "items_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"journal_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"description" text,
	"debit_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"credit_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(20) NOT NULL,
	"description" text,
	"prefix" varchar(10),
	"next_number" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "journal_types_tenant_id_code_unique" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "journals" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"journal_type_id" integer NOT NULL,
	"fiscal_year_id" integer,
	"period_id" integer,
	"reversal_of_journal_id" integer,
	"journal_number" varchar(50) NOT NULL,
	"journal_date" date NOT NULL,
	"post_date" date,
	"reference" varchar(100),
	"description" text NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_by" integer NOT NULL,
	"posted_by" integer,
	"posted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "journals_tenant_id_journal_number_unique" UNIQUE("tenant_id","journal_number")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"notification_type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"related_entity_type" varchar(50),
	"related_entity_id" integer,
	"user_id" integer,
	"portal_user_id" integer,
	"is_read" boolean DEFAULT false,
	"is_sent" boolean DEFAULT false,
	"sent_at" timestamp,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_color_size_breakdown" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"color" varchar(50) NOT NULL,
	"size" varchar(20) NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"material_type" varchar(100) NOT NULL,
	"item_id" integer,
	"variant_id" integer,
	"quantity_needed" numeric NOT NULL,
	"unit_id" integer,
	"unit_price" numeric NOT NULL,
	"total_cost" numeric NOT NULL,
	"booking_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"expected_delivery_date" date,
	"actual_delivery_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_samples" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"sample_type" varchar(50) NOT NULL,
	"required" boolean DEFAULT true,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"submitted_date" date,
	"approval_date" date,
	"rejection_date" date,
	"rejection_reason" text,
	"comments" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_trims" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"trim_type" varchar(50) NOT NULL,
	"description" text,
	"image_url" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"submitted_date" date,
	"approval_date" date,
	"rejection_date" date,
	"rejection_reason" text,
	"comments" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(20) NOT NULL,
	"tenant_id" integer NOT NULL,
	"quotation_id" integer,
	"customer_id" integer NOT NULL,
	"style_name" varchar(255) NOT NULL,
	"department" varchar(100) NOT NULL,
	"total_quantity" integer NOT NULL,
	"delivery_date" date NOT NULL,
	"delivery_mode" varchar(50) NOT NULL,
	"delivery_port" varchar(100),
	"payment_terms" varchar(100),
	"order_status" varchar(50) DEFAULT 'new' NOT NULL,
	"price_confirmed" numeric NOT NULL,
	"currency" varchar(10) DEFAULT 'USD',
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "portal_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"portal_user_id" integer NOT NULL,
	"activity_type" varchar(50) NOT NULL,
	"activity_detail" text NOT NULL,
	"related_entity_type" varchar(50),
	"related_entity_id" integer,
	"ip_address" varchar(50),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_list_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"variant_id" integer,
	"price" numeric NOT NULL,
	"min_quantity" numeric DEFAULT '1',
	"max_quantity" numeric,
	"special_price" numeric,
	"special_from" date,
	"special_to" date,
	"discount_percentage" numeric,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "price_list_items_price_list_id_item_id_variant_id_min_quantity_unique" UNIQUE("price_list_id","item_id","variant_id","min_quantity")
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false,
	"effective_date" date NOT NULL,
	"expiry_date" date,
	"customer_group_id" integer,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_cost_summary" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"quotation_id" integer NOT NULL,
	"category_name" varchar(100) NOT NULL,
	"total_cost" numeric NOT NULL,
	"percentage_of_total" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_manufacturing" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"quotation_id" integer NOT NULL,
	"serial_no" integer NOT NULL,
	"style_part" varchar(50) NOT NULL,
	"machines_required" integer NOT NULL,
	"production_per_hour" numeric NOT NULL,
	"production_per_day" numeric NOT NULL,
	"cost_per_machine" numeric NOT NULL,
	"total_line_cost" numeric NOT NULL,
	"cost_per_dozen" numeric NOT NULL,
	"cm_per_piece" numeric NOT NULL,
	"total_order_cost" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"quotation_id" integer NOT NULL,
	"serial_no" integer NOT NULL,
	"category_id" integer,
	"item_id" integer,
	"consumption_per_dozen" numeric NOT NULL,
	"unit_price" numeric NOT NULL,
	"amount_per_dozen" numeric NOT NULL,
	"total_amount" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_other_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"quotation_id" integer NOT NULL,
	"serial_no" integer NOT NULL,
	"cost_head" varchar(100) NOT NULL,
	"percentage" numeric NOT NULL,
	"total_amount" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"quotation_id" varchar(20) NOT NULL,
	"inquiry_id" integer,
	"customer_id" integer NOT NULL,
	"style_name" varchar(255) NOT NULL,
	"department" varchar(100) NOT NULL,
	"projected_quantity" integer NOT NULL,
	"projected_delivery_date" date,
	"target_price" varchar(50),
	"status" varchar(50) DEFAULT 'draft',
	"material_cost" numeric DEFAULT '0',
	"manufacturing_cost" numeric DEFAULT '0',
	"other_cost" numeric DEFAULT '0',
	"total_cost" numeric DEFAULT '0',
	"cost_per_piece" numeric DEFAULT '0',
	"profit_percentage" numeric DEFAULT '0',
	"quoted_price" numeric DEFAULT '0',
	"quotation_date" date DEFAULT now(),
	"valid_until" date,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_quotation_id_unique" UNIQUE("quotation_id")
);
--> statement-breakpoint
CREATE TABLE "sample_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"sample_id" integer NOT NULL,
	"approval_type" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"comments" text,
	"attachments" text[],
	"approved_by" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sample_developments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"inquiry_id" integer,
	"sample_id" varchar(20) NOT NULL,
	"style_name" varchar(255) NOT NULL,
	"department" varchar(100) NOT NULL,
	"sample_type" varchar(50) NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"requested_date" date NOT NULL,
	"target_completion_date" date NOT NULL,
	"actual_completion_date" date,
	"status" varchar(50) DEFAULT 'new' NOT NULL,
	"rejection_reason" text,
	"comments" text,
	"technical_details" jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sample_developments_sample_id_unique" UNIQUE("sample_id")
);
--> statement-breakpoint
CREATE TABLE "sample_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"sample_id" integer NOT NULL,
	"material_type" varchar(100) NOT NULL,
	"item_id" integer,
	"quantity" numeric NOT NULL,
	"unit_id" integer,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"comments" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_action_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"milestone_name" varchar(100) NOT NULL,
	"description" text,
	"planned_start_date" date NOT NULL,
	"planned_end_date" date NOT NULL,
	"actual_start_date" date,
	"actual_end_date" date,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"responsible_person" varchar(100),
	"department" varchar(100),
	"comments" text,
	"dependencies" text[],
	"priority" varchar(20) DEFAULT 'medium',
	"is_critical" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_action_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_days" integer NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trim_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"trim_type" varchar(50) NOT NULL,
	"description" text,
	"attachments" text[],
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"comments" text,
	"approved_by" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_approval_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_id" integer NOT NULL,
	"from_status_id" integer,
	"to_status_id" integer NOT NULL,
	"action_name" varchar(50) NOT NULL,
	"action_by_id" integer NOT NULL,
	"comments" text,
	"action_date" timestamp DEFAULT now() NOT NULL,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_id" integer NOT NULL,
	"line_number" integer NOT NULL,
	"account_id" integer NOT NULL,
	"description" text,
	"debit_amount" numeric(15, 2) DEFAULT '0',
	"credit_amount" numeric(15, 2) DEFAULT '0',
	"base_currency_debit" numeric(15, 2) DEFAULT '0',
	"base_currency_credit" numeric(15, 2) DEFAULT '0',
	"tax_amount" numeric(15, 2) DEFAULT '0',
	"tax_percentage" numeric(5, 2) DEFAULT '0',
	"cost_center_id" integer,
	"project_id" integer,
	"entity_type" varchar(50),
	"entity_id" integer,
	"reference" varchar(100),
	"attachments" jsonb,
	"notes" text,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"code" varchar(20) NOT NULL,
	"description" text,
	"color" varchar(20) DEFAULT '#808080',
	"is_blocking" boolean DEFAULT false,
	"is_default" boolean DEFAULT false,
	"sequence" integer DEFAULT 0,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"journal_type_id" integer,
	"prefix" varchar(10) NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"is_purchase" boolean DEFAULT false,
	"is_sales" boolean DEFAULT false,
	"is_payment" boolean DEFAULT false,
	"is_receipt" boolean DEFAULT false,
	"is_journal" boolean DEFAULT false,
	"is_contra" boolean DEFAULT false,
	"is_asset" boolean DEFAULT false,
	"is_liability" boolean DEFAULT false,
	"requires_approval" boolean DEFAULT true,
	"requires_attachment" boolean DEFAULT false,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "voucher_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "voucher_workflow" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_type_id" integer NOT NULL,
	"from_status_id" integer,
	"to_status_id" integer NOT NULL,
	"action_name" varchar(50) NOT NULL,
	"required_role" varchar(50),
	"description" text,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_number" varchar(50) NOT NULL,
	"voucher_type_id" integer NOT NULL,
	"voucher_date" date NOT NULL,
	"posting_date" date,
	"fiscal_year_id" integer NOT NULL,
	"accounting_period_id" integer,
	"status_id" integer NOT NULL,
	"reference" varchar(100),
	"reference_date" date,
	"description" text,
	"prepared_by_id" integer NOT NULL,
	"approved_by_id" integer,
	"approved_date" timestamp,
	"rejected_by_id" integer,
	"rejection_reason" text,
	"rejected_date" timestamp,
	"entity_type" varchar(50),
	"entity_id" integer,
	"amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"currency_code" varchar(10) DEFAULT 'USD',
	"exchange_rate" numeric(10, 6) DEFAULT '1',
	"base_currency_amount" numeric(15, 2),
	"journal_id" integer,
	"is_posted" boolean DEFAULT false,
	"posting_reference" varchar(100),
	"is_cancelled" boolean DEFAULT false,
	"cancellation_reason" text,
	"cancelled_by_id" integer,
	"cancellation_date" timestamp,
	"attachments" jsonb,
	"notes" text,
	"tags" text[],
	"custom_fields" jsonb,
	"ai_summary" text,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_voucher_number_unique" UNIQUE("voucher_number")
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "status" varchar DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_types" ADD CONSTRAINT "account_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_bom_id_bill_of_materials_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bill_of_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_component_item_id_items_id_fk" FOREIGN KEY ("component_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_unit_id_item_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."item_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_alternative_for_bom_components_id_fk" FOREIGN KEY ("alternative_for") REFERENCES "public"."bom_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_portal_users" ADD CONSTRAINT "buyer_portal_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_portal_users" ADD CONSTRAINT "buyer_portal_users_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_account_type_id_account_types_id_fk" FOREIGN KEY ("account_type_id") REFERENCES "public"."account_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_insights" ADD CONSTRAINT "currency_insights_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_insights" ADD CONSTRAINT "currency_insights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_insights" ADD CONSTRAINT "customer_insights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_insights" ADD CONSTRAINT "customer_insights_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_insights" ADD CONSTRAINT "financial_insights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_section_accounts" ADD CONSTRAINT "financial_statement_section_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_section_accounts" ADD CONSTRAINT "financial_statement_section_accounts_section_id_financial_statement_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."financial_statement_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_section_accounts" ADD CONSTRAINT "financial_statement_section_accounts_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_sections" ADD CONSTRAINT "financial_statement_sections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_sections" ADD CONSTRAINT "financial_statement_sections_template_id_financial_statement_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."financial_statement_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_sections" ADD CONSTRAINT "financial_statement_sections_parent_section_id_financial_statement_sections_id_fk" FOREIGN KEY ("parent_section_id") REFERENCES "public"."financial_statement_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_templates" ADD CONSTRAINT "financial_statement_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_subcategories" ADD CONSTRAINT "item_subcategories_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_subcategories" ADD CONSTRAINT "item_subcategories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_units" ADD CONSTRAINT "item_units_base_unit_id_item_units_id_fk" FOREIGN KEY ("base_unit_id") REFERENCES "public"."item_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_units" ADD CONSTRAINT "item_units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_parent_item_id_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_subcategory_id_item_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."item_subcategories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_unit_id_item_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."item_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_purchase_unit_id_item_units_id_fk" FOREIGN KEY ("purchase_unit_id") REFERENCES "public"."item_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_replacement_item_id_items_id_fk" FOREIGN KEY ("replacement_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_types" ADD CONSTRAINT "journal_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_journal_type_id_journal_types_id_fk" FOREIGN KEY ("journal_type_id") REFERENCES "public"."journal_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_reversal_of_journal_id_journals_id_fk" FOREIGN KEY ("reversal_of_journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_color_size_breakdown" ADD CONSTRAINT "order_color_size_breakdown_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_color_size_breakdown" ADD CONSTRAINT "order_color_size_breakdown_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_materials" ADD CONSTRAINT "order_materials_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_materials" ADD CONSTRAINT "order_materials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_materials" ADD CONSTRAINT "order_materials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_materials" ADD CONSTRAINT "order_materials_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_materials" ADD CONSTRAINT "order_materials_unit_id_item_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."item_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_samples" ADD CONSTRAINT "order_samples_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_samples" ADD CONSTRAINT "order_samples_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_trims" ADD CONSTRAINT "order_trims_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_trims" ADD CONSTRAINT "order_trims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_activity_logs" ADD CONSTRAINT "portal_activity_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_activity_logs" ADD CONSTRAINT "portal_activity_logs_portal_user_id_buyer_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."buyer_portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_cost_summary" ADD CONSTRAINT "quotation_cost_summary_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_cost_summary" ADD CONSTRAINT "quotation_cost_summary_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_manufacturing" ADD CONSTRAINT "quotation_manufacturing_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_manufacturing" ADD CONSTRAINT "quotation_manufacturing_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_materials" ADD CONSTRAINT "quotation_materials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_materials" ADD CONSTRAINT "quotation_materials_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_materials" ADD CONSTRAINT "quotation_materials_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_materials" ADD CONSTRAINT "quotation_materials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_other_costs" ADD CONSTRAINT "quotation_other_costs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_other_costs" ADD CONSTRAINT "quotation_other_costs_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_approvals" ADD CONSTRAINT "sample_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_approvals" ADD CONSTRAINT "sample_approvals_sample_id_sample_developments_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."sample_developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_approvals" ADD CONSTRAINT "sample_approvals_approved_by_buyer_portal_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."buyer_portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_developments" ADD CONSTRAINT "sample_developments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_developments" ADD CONSTRAINT "sample_developments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_developments" ADD CONSTRAINT "sample_developments_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_developments" ADD CONSTRAINT "sample_developments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_materials" ADD CONSTRAINT "sample_materials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_materials" ADD CONSTRAINT "sample_materials_sample_id_sample_developments_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."sample_developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_materials" ADD CONSTRAINT "sample_materials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_materials" ADD CONSTRAINT "sample_materials_unit_id_item_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."item_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_action_milestones" ADD CONSTRAINT "time_action_milestones_plan_id_time_action_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."time_action_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_action_milestones" ADD CONSTRAINT "time_action_milestones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_action_plans" ADD CONSTRAINT "time_action_plans_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_action_plans" ADD CONSTRAINT "time_action_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_action_plans" ADD CONSTRAINT "time_action_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trim_approvals" ADD CONSTRAINT "trim_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trim_approvals" ADD CONSTRAINT "trim_approvals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trim_approvals" ADD CONSTRAINT "trim_approvals_approved_by_buyer_portal_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."buyer_portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_approval_history" ADD CONSTRAINT "voucher_approval_history_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_approval_history" ADD CONSTRAINT "voucher_approval_history_from_status_id_voucher_status_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."voucher_status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_approval_history" ADD CONSTRAINT "voucher_approval_history_to_status_id_voucher_status_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."voucher_status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_approval_history" ADD CONSTRAINT "voucher_approval_history_action_by_id_users_id_fk" FOREIGN KEY ("action_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_approval_history" ADD CONSTRAINT "voucher_approval_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_items" ADD CONSTRAINT "voucher_items_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_items" ADD CONSTRAINT "voucher_items_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_items" ADD CONSTRAINT "voucher_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_status" ADD CONSTRAINT "voucher_status_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_types" ADD CONSTRAINT "voucher_types_journal_type_id_journal_types_id_fk" FOREIGN KEY ("journal_type_id") REFERENCES "public"."journal_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_types" ADD CONSTRAINT "voucher_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_workflow" ADD CONSTRAINT "voucher_workflow_voucher_type_id_voucher_types_id_fk" FOREIGN KEY ("voucher_type_id") REFERENCES "public"."voucher_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_workflow" ADD CONSTRAINT "voucher_workflow_from_status_id_voucher_status_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."voucher_status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_workflow" ADD CONSTRAINT "voucher_workflow_to_status_id_voucher_status_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."voucher_status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_workflow" ADD CONSTRAINT "voucher_workflow_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_voucher_type_id_voucher_types_id_fk" FOREIGN KEY ("voucher_type_id") REFERENCES "public"."voucher_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_status_id_voucher_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."voucher_status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_prepared_by_id_users_id_fk" FOREIGN KEY ("prepared_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_rejected_by_id_users_id_fk" FOREIGN KEY ("rejected_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;