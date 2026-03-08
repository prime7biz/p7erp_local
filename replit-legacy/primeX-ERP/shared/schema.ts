import { pgTable, text, serial, integer, boolean, timestamp, unique, foreignKey, varchar, date, time, jsonb, numeric, decimal, real, doublePrecision, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { type InferSelectModel, relations, sql } from "drizzle-orm";

// Tenants table - multi-tenancy support
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  logo: text("logo"),
  isActive: boolean("is_active").default(true).notNull(),
  companyCode: varchar("company_code", { length: 20 }).unique(),
  businessType: varchar("business_type", { length: 20 }).default("both").notNull(),
  status: varchar("status", { length: 20 }).default("APPROVED").notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by"),
  rejectedReason: text("rejected_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Subscription Plans table - Define available packages
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  maxUsers: integer("max_users").notNull(),
  pricePerUserPerMonth: integer("price_per_user_per_month").notNull().default(0),
  monthlyPrice: integer("monthly_price").notNull().default(0),
  dailyEntryLimit: integer("daily_entry_limit"),
  trialDays: integer("trial_days").default(0),
  features: text("features").array().notNull().default([]),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Daily entry counts for tracking Trial plan limits
export const dailyEntryCounts = pgTable("daily_entry_counts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  entryDate: date("entry_date").notNull(),
  entryCount: integer("entry_count").notNull().default(0),
}, (table) => ({
  uniqueTenantDate: unique().on(table.tenantId, table.entryDate),
}));

// Subscriptions table - for managing tenant subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  plan: text("plan").notNull(), // Use text plan name instead of planId reference
  status: text("status").notNull(), // active, trial, expired, cancelled, suspended
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("subscriptions_tenant_idx").on(table.tenantId),
}));

// Roles table - Define role hierarchy and permissions
export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  level: integer("level").notNull(), // 1=Owner, 2=Director, 3=General Manager, etc.
  permissions: jsonb("permissions").notNull().default('{}'),
  tenantId: integer("tenant_id").references(() => tenants.id),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("roles_tenant_idx").on(table.tenantId),
}));

// Users table - for authentication and user management
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  roleId: integer("role_id").notNull().references(() => roles.id),
  departmentId: integer("department_id").references(() => departments.id),
  employeeId: text("employee_id"),
  employeeRefId: integer("employee_ref_id"),
  phone: text("phone"),
  address: text("address"),
  joiningDate: date("joining_date"),
  isActive: boolean("is_active").default(true).notNull(),
  isSuperUser: boolean("is_super_user").default(false).notNull(),
  lastLogin: timestamp("last_login"),
  lastLoginIp: varchar("last_login_ip", { length: 50 }),
  profileImage: text("profile_image"),
  emailVerified: boolean("email_verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("users_tenant_idx").on(table.tenantId),
  idx_users_tenant_email: index("idx_users_tenant_email").on(table.tenantId, table.email),
  idx_users_tenant_active: index("idx_users_tenant_active").on(table.tenantId, table.isActive),
}));

// Departments table - Organizational structure
export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  code: varchar("code", { length: 255 }).notNull(),
  description: text("description"),
  headUserId: integer("head_user_id").references(() => users.id),
  parentDepartmentId: integer("parent_department_id").references(() => departments.id),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantCodeUnique: unique("departments_tenant_code_unique").on(table.tenantId, table.code),
}));

// Designations table - Job titles and levels
export const designations = pgTable("designations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name").notNull(),
  level: integer("level").default(1),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("designations_tenant_idx").on(table.tenantId),
}));

// Employees table - HR employee records
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  employeeId: varchar("employee_id").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  gender: varchar("gender"),
  dateOfBirth: date("date_of_birth"),
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),
  department: varchar("department"),
  designation: varchar("designation"),
  joinDate: date("join_date").notNull(),
  employmentType: varchar("employment_type").default("Full-time"),
  education: text("education"),
  experience: text("experience"),
  skills: text("skills"),
  salary: numeric("salary"),
  bankAccount: varchar("bank_account"),
  isActive: boolean("is_active").default(true),
  profileImage: varchar("profile_image"),
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  nationalId: varchar("national_id"),
  paymentMethod: varchar("payment_method", { length: 20 }).default("BANK"),
  bankName: varchar("bank_name", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  departmentId: integer("department_id").references(() => departments.id),
  designationId: integer("designation_id").references(() => designations.id),
}, (table) => ({
  tenantEmployeeIdUnique: unique("employees_tenant_employee_id_unique").on(table.tenantId, table.employeeId),
}));

// Tenant Settings table - Configuration for each tenant
export const tenantSettings = pgTable("tenant_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  // Company Information
  companyName: text("company_name"),
  companyAddress: text("company_address"),
  companyPhone: text("company_phone"),
  companyEmail: text("company_email"),
  companyWebsite: text("company_website"),
  companyLogo: text("company_logo"),
  taxNumber: text("tax_number"),
  registrationNumber: text("registration_number"),
  
  // Financial Settings
  baseCurrency: text("base_currency").default("BDT").notNull(), // Primary currency
  localCurrency: text("local_currency").default("BDT").notNull(), // Local accounting currency
  displayCurrency: text("display_currency").default("BDT").notNull(), // Default display currency
  fiscalYearStart: text("fiscal_year_start").default("April").notNull(),
  fiscalYearEnd: text("fiscal_year_end").default("March").notNull(),
  timeZone: text("time_zone").default("UTC").notNull(),
  dateFormat: text("date_format").default("DD/MM/YYYY").notNull(),
  
  // HR Settings
  workingDaysPerWeek: integer("working_days_per_week").default(5).notNull(),
  workingHoursPerDay: real("working_hours_per_day").default(8).notNull(),
  weekStartDay: text("week_start_day").default("Monday").notNull(),
  probationPeriodDays: integer("probation_period_days").default(90).notNull(),
  
  // Accounting Settings
  accountingMethod: text("accounting_method").default("accrual").notNull(), // accrual, cash
  inventoryMethod: text("inventory_method").default("FIFO").notNull(), // FIFO, LIFO, Average
  deprecationMethod: text("deprecation_method").default("straight_line").notNull(),
  
  // System Settings
  multiCurrencyEnabled: boolean("multi_currency_enabled").default(false).notNull(),
  autoBackupEnabled: boolean("auto_backup_enabled").default(true).notNull(),
  autoBackupFrequency: varchar("auto_backup_frequency", { length: 20 }).default("daily"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  passwordPolicy: jsonb("password_policy").default('{"minLength": 8, "requireUppercase": true, "requireNumbers": true, "requireSpecialChars": true}').notNull(),
  
  // Notification Settings
  emailNotifications: boolean("email_notifications").default(true).notNull(),
  smsNotifications: boolean("sms_notifications").default(false).notNull(),
  systemNotifications: boolean("system_notifications").default(true).notNull(),
  
  // Production Settings
  defaultLeadTime: integer("default_lead_time").default(30).notNull(),
  qualityControlEnabled: boolean("quality_control_enabled").default(true).notNull(),
  autoOrderGeneration: boolean("auto_order_generation").default(false).notNull(),
  
  // Inventory & Approval Settings
  negativeStockPolicy: varchar("negative_stock_policy", { length: 30 }).default("BLOCK"),
  requireApprovalForBackdatePosting: boolean("require_approval_for_backdate_posting").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantUnique: unique().on(table.tenantId),
}));

// Currency Exchange Rates table
export const currencyExchangeRates = pgTable("currency_exchange_rates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 12, scale: 6 }).notNull(),
  effectiveDate: date("effective_date").defaultNow().notNull(),
  source: text("source").default("manual").notNull(), // manual, api, bank
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  currencyPairUnique: unique().on(table.tenantId, table.fromCurrency, table.toCurrency, table.effectiveDate),
}));

// User Permissions table - Granular permissions for users
export const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  module: text("module").notNull(), // e.g., 'orders', 'customers', 'inventory'
  action: text("action").notNull(), // e.g., 'create', 'read', 'update', 'delete'
  granted: boolean("granted").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userModuleActionUnique: unique().on(table.userId, table.module, table.action),
}));

// Calendar Events table - for AI-enhanced calendar system
export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  startDateTime: timestamp("start_date_time").notNull(),
  endDateTime: timestamp("end_date_time").notNull(),
  allDay: boolean("all_day").default(false).notNull(),
  location: text("location"),
  virtualMeetingUrl: text("virtual_meeting_url"),
  category: text("category").notNull(), // meeting, production, delivery, quality, etc.
  color: text("color").default("#3B82F6"), // Color for UI display
  priority: text("priority").default("medium").notNull(), // high, medium, low
  status: text("status").default("scheduled").notNull(), // scheduled, in-progress, completed, cancelled
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurrencePattern: jsonb("recurrence_pattern"), // JSON with recurrence details
  creatorId: integer("creator_id").notNull().references(() => users.id),
  attendees: jsonb("attendees").notNull(), // Array of user objects with user ID and response status
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  relatedEntityType: text("related_entity_type"), // order, production, inventory, etc.
  relatedEntityId: integer("related_entity_id"), // ID of the related entity
  reminderMinutes: integer("reminder_minutes"), // Minutes before event to send reminder
  attachments: jsonb("attachments"), // JSON array of attachment objects with URLs
  notes: text("notes"), // Meeting notes or follow-up items
  aiSuggestions: jsonb("ai_suggestions"), // AI-generated insights or recommendations
  aiSummary: text("ai_summary"), // AI-generated summary of the event
  isSuggested: boolean("is_suggested").default(false), // Indicates if this was AI-suggested
  suggestedReason: text("suggested_reason"), // Why AI suggested this event
  conflicts: jsonb("conflicts"), // Potential calendar conflicts detected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("calendar_events_tenant_idx").on(table.tenantId),
}));

// Calendar Settings table - user preferences for calendar
export const calendarSettings = pgTable("calendar_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  workingHoursStart: time("working_hours_start").default("09:00:00"),
  workingHoursEnd: time("working_hours_end").default("17:00:00"),
  workingDays: jsonb("working_days").default(["1", "2", "3", "4", "5"]), // 0=Sunday, 1=Monday, etc.
  defaultView: text("default_view").default("week"), // day, week, month, schedule
  defaultReminder: integer("default_reminder").default(15), // minutes
  showWeekends: boolean("show_weekends").default(false),
  timeZone: text("time_zone").default("UTC"),
  categoryColors: jsonb("category_colors"), // JSON mapping category to color
  notificationPreferences: jsonb("notification_preferences"), // JSON with notification settings
  calendarIntegrations: jsonb("calendar_integrations"), // External calendar integrations
  aiAssistEnabled: boolean("ai_assist_enabled").default(true), // Enable AI calendar assistant
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Create insert schemas using Zod
export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  approvedBy: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCalendarSettingsSchema = createInsertSchema(calendarSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type InsertCalendarSettings = z.infer<typeof insertCalendarSettingsSchema>;

export type User = typeof users.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type CalendarSettings = typeof calendarSettings.$inferSelect;

// Customer module tables
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull(), // Auto-generated unique ID (e.g., CUST-001)
  customerName: varchar("customer_name").notNull(),
  address: text("address"), // New field for customer address
  website: varchar("website"), // New field for customer website
  country: varchar("country").notNull(),
  hasAgent: boolean("has_agent").default(false).notNull(),
  contactPerson: varchar("contact_person").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone").notNull(),
  // Garment industry specific fields
  industrySegment: varchar("industry_segment"), // Type of industry segment
  paymentTerms: varchar("payment_terms"), // Payment terms like Net 30, Net 60, etc
  leadTime: integer("lead_time"), // Average lead time in days
  complianceLevel: varchar("compliance_level"), // Level of compliance with standards
  sustainabilityRating: numeric("sustainability_rating", { precision: 3, scale: 1 }), // 0-5 rating scale
  isActive: boolean("is_active").default(true).notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantCustomerIdUnique: unique("customers_tenant_customer_id_unique").on(table.tenantId, table.customerId),
}));

// Agent details table (linked to customers with hasAgent=true)
export const customerAgents = pgTable("customer_agents", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, {
    onDelete: "cascade",
  }),
  agentName: varchar("agent_name").notNull(),
  agentEmail: varchar("agent_email").notNull(),
  agentPhone: varchar("agent_phone").notNull(),
  agentAddress: text("agent_address"), // New field for agent address
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("customer_agents_tenant_idx").on(table.tenantId),
}));

// Insert schemas for customers
export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  customerId: true, // customerId is auto-generated and should not be provided by the client
  createdAt: true,
  updatedAt: true,
});

// Insert schemas for agent details
export const insertCustomerAgentSchema = createInsertSchema(customerAgents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Tasks table - for task management
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: date("due_date"),
  dueTime: time("due_time"),
  priority: text("priority").notNull().default("medium"), // urgent, important, medium, standard
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, canceled
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  assignedTo: integer("assigned_to").references(() => users.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  relatedEntityType: text("related_entity_type"), // customer, order, etc.
  relatedEntityId: integer("related_entity_id"),
  tags: text("tags").array(),
  reminderAt: timestamp("reminder_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Task comments for collaboration
export const taskComments = pgTable("task_comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, {
    onDelete: "cascade",
  }),
  userId: integer("user_id").notNull().references(() => users.id),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Task AI insights
export const taskAIInsights = pgTable("task_ai_insights", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, {
    onDelete: "cascade",
  }),
  insightType: text("insight_type").notNull(), // productivity, health, priority, deadline
  title: text("title").notNull(),
  description: text("description").notNull(),
  recommendations: text("recommendations").array(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for tasks
export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

// Insert schemas for task comments
export const insertTaskCommentSchema = createInsertSchema(taskComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Insert schemas for task AI insights
export const insertTaskAIInsightSchema = createInsertSchema(taskAIInsights).omit({
  id: true,
  createdAt: true,
});

// Export types
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type InsertTaskComment = z.infer<typeof insertTaskCommentSchema>;
export type InsertTaskAIInsight = z.infer<typeof insertTaskAIInsightSchema>;
export type Task = typeof tasks.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;
export type TaskAIInsight = typeof taskAIInsights.$inferSelect;

// Inquiries schema
export const inquiries = pgTable("inquiries", {
  id: serial("id").primaryKey(),
  inquiryId: varchar("inquiry_id").notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  styleName: varchar("style_name").notNull(),
  styleId: integer("style_id").references(() => styles.id),
  inquiryType: varchar("inquiry_type").notNull(), // Sample Development, Salesman Sample, Quotation, Repeat Order
  department: varchar("department").notNull(), // Infant, Kids, Boys, Girls, Men's, Ladies
  projectedQuantity: integer("projected_quantity").notNull(),
  projectedDeliveryDate: date("projected_delivery_date").notNull(), // Changed to date type to match form
  targetPrice: numeric("target_price").notNull(),
  
  // Additional fields from the inquiry form
  seasonYear: varchar("season_year"), // Season and year for the product
  brand: varchar("brand"), // Brand name for production
  materialComposition: varchar("material_composition"), // Material composition (e.g., 95% Cotton, 5% Elastane)
  sizeRange: varchar("size_range"), // Size range (e.g., S-XXL, 28-36)
  colorOptions: text("color_options").array(), // Array of color options
  countryOfOrigin: varchar("country_of_origin"), // Manufacturing country
  incoterms: varchar("incoterms"), // International Commercial Terms for shipping
  specialRequirements: text("special_requirements"), // Special requirements or certifications
  contactPersonRef: varchar("contact_person_ref"), // Contact person reference
  targetMarkets: varchar("target_markets", { length: 255 }),
  complianceRequirements: text("compliance_requirements"),
  sustainabilityRequirements: text("sustainability_requirements"),
  preferredColors: text("preferred_colors"),
  specialFinishes: text("special_finishes"),
  
  technicalFiles: text("technical_files").array(), // Store file paths as array
  status: varchar("status").default("new").notNull(), // new, in_progress, quotation_sent, converted_to_order, closed
  tenantId: integer("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInquirySchema = createInsertSchema(inquiries, {
  projectedDeliveryDate: z.coerce.date(),
  targetPrice: z.coerce.number(),
  technicalFiles: z.array(z.string()).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInquiry = z.infer<typeof insertInquirySchema>;
export type Inquiry = typeof inquiries.$inferSelect;

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertCustomerAgent = z.infer<typeof insertCustomerAgentSchema>;
export type Customer = typeof customers.$inferSelect;
export type CustomerAgent = typeof customerAgents.$inferSelect;

// Vendors table for supplier/vendor management
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  vendorCode: varchar("vendor_code").notNull(),
  vendorName: varchar("vendor_name").notNull(),
  vendorType: varchar("vendor_type"),
  contactPerson: varchar("contact_person"),
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),
  city: varchar("city"),
  country: varchar("country"),
  bankName: varchar("bank_name"),
  bankAccount: varchar("bank_account"),
  bankSwift: varchar("bank_swift"),
  paymentTerms: varchar("payment_terms"),
  creditLimit: numeric("credit_limit"),
  taxId: varchar("tax_id"),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Inventory Module - Warehouse Management
export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  warehouseId: varchar("warehouse_id").notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name").notNull(),
  type: varchar("type").notNull().default("company"), // company, vendor, third_party
  location: varchar("location").notNull(),
  address: varchar("address"),
  contactPerson: varchar("contact_person"),
  contactPhone: varchar("contact_phone"),
  contactEmail: varchar("contact_email"),
  totalCapacity: numeric("total_capacity"), // Total storage capacity in square feet or meters
  usedCapacity: numeric("used_capacity"), // Used storage space
  capacityUnit: varchar("capacity_unit").default("sqft"), // sqft, sqm, etc.
  isTemperatureControlled: boolean("is_temperature_controlled").default(false),
  temperatureRange: varchar("temperature_range"), // e.g., "18-22°C"
  isHumidityControlled: boolean("is_humidity_controlled").default(false),
  humidityRange: varchar("humidity_range"), // e.g., "40-60%"
  vendorId: integer("vendor_id").references(() => vendors.id), // Only for vendor/third-party warehouses
  hasAlarmSystem: boolean("has_alarm_system").default(false),
  hasSprinklerSystem: boolean("has_sprinkler_system").default(false),
  hasSecurityPersonnel: boolean("has_security_personnel").default(false),
  hasCCTV: boolean("has_cctv").default(false),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantWarehouseIdUnique: unique("warehouses_tenant_warehouse_id_unique").on(table.tenantId, table.warehouseId),
}));

export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWarehouseSchema = createInsertSchema(warehouses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type Warehouse = typeof warehouses.$inferSelect;

// Inventory Stock Movements
export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  movementId: varchar("movement_id").notNull().unique(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  type: varchar("type").notNull(), // receive, issue, transfer, processing_send, processing_receive, subcontract_send, subcontract_receive, return, adjustment, manufacturing
  sourceType: varchar("source_type"), // purchase_order, manufacturing_order, sales_order, etc.
  sourceId: integer("source_id"), // ID of the source document
  description: text("description"),
  movementDate: timestamp("movement_date").defaultNow().notNull(),
  processedBy: integer("processed_by").references(() => users.id),
  status: varchar("status").default("draft").notNull(), // draft, approved, processed, cancelled
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  additionalData: jsonb("additional_data"), // Store items, target warehouse, processing unit, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("inventory_movements_tenant_idx").on(table.tenantId),
}));

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;

// ============================================================
// Inventory Module - Stock Groups (Tally-style hierarchical classification)
// ============================================================
export const stockGroups = pgTable("stock_groups", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }),
  parentId: integer("parent_id"),
  level: integer("level").default(0).notNull(),
  path: text("path"),
  nature: varchar("nature", { length: 30 }).notNull().default("raw_material"),
  inventoryAccountId: integer("inventory_account_id").references(() => chartOfAccounts.id),
  cogsAccountId: integer("cogs_account_id").references(() => chartOfAccounts.id),
  wipAccountId: integer("wip_account_id").references(() => chartOfAccounts.id),
  adjustmentAccountId: integer("adjustment_account_id").references(() => chartOfAccounts.id),
  grniAccountId: integer("grni_account_id").references(() => chartOfAccounts.id),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("stock_groups_tenant_idx").on(table.tenantId),
  tenantCodeUnique: unique("stock_groups_tenant_code_unique").on(table.tenantId, table.code),
}));

export const insertStockGroupSchema = createInsertSchema(stockGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStockGroup = z.infer<typeof insertStockGroupSchema>;
export type StockGroup = typeof stockGroups.$inferSelect;

// Inventory Module - Item Categories
export const itemCategories = pgTable("item_categories", {
  id: serial("id").primaryKey(),
  categoryId: varchar("category_id").notNull().unique(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name").notNull(),
  description: varchar("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertItemCategorySchema = createInsertSchema(itemCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertItemCategory = z.infer<typeof insertItemCategorySchema>;
export type ItemCategory = typeof itemCategories.$inferSelect;

// Inventory Module - Item Subcategories
export const itemSubcategories = pgTable("item_subcategories", {
  id: serial("id").primaryKey(),
  subcategoryId: varchar("subcategory_id").notNull().unique(),
  categoryId: integer("category_id").notNull().references(() => itemCategories.id),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name").notNull(),
  description: varchar("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertItemSubcategorySchema = createInsertSchema(itemSubcategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertItemSubcategory = z.infer<typeof insertItemSubcategorySchema>;
export type ItemSubcategory = typeof itemSubcategories.$inferSelect;

// Units table for measurement units used in inventory
export const itemUnits = pgTable("item_units", {
  id: serial("id").primaryKey(),
  unitCode: varchar("unit_code", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull(), // length, weight, volume, quantity, etc.
  baseUnit: boolean("base_unit").default(false).notNull(), // Is this a base unit or derived unit
  conversionFactor: numeric("conversion_factor").default("1"), // For conversion between related units
  baseUnitId: integer("base_unit_id").references(() => itemUnits.id), // Reference to base unit if this is a derived unit
  isCompound: boolean("is_compound").default(false).notNull(),
  compoundOfId: integer("compound_of_id"),
  compoundQty: numeric("compound_qty"),
  isActive: boolean("is_active").default(true).notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertItemUnitSchema = createInsertSchema(itemUnits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertItemUnit = z.infer<typeof insertItemUnitSchema>;
export type ItemUnit = typeof itemUnits.$inferSelect;

// Inventory Module - Items
export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  itemCode: varchar("item_code", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  categoryId: integer("category_id").notNull().references(() => itemCategories.id),
  subcategoryId: integer("subcategory_id").references(() => itemSubcategories.id),
  stockGroupId: integer("stock_group_id").references(() => stockGroups.id),
  unitId: integer("unit_id").notNull().references(() => itemUnits.id),
  purchaseUnitId: integer("purchase_unit_id").references(() => itemUnits.id),
  sku: varchar("sku", { length: 50 }),
  barcode: varchar("barcode", { length: 50 }),
  hasVariants: boolean("has_variants").default(false).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("standard"),
  minStockLevel: numeric("min_stock_level").default("0"),
  maxStockLevel: numeric("max_stock_level"),
  reorderPoint: numeric("reorder_point").default("0"),
  leadTimeInDays: integer("lead_time_in_days"),
  isActive: boolean("is_active").default(true).notNull(),
  isStockable: boolean("is_stockable").default(true).notNull(),
  isServiceItem: boolean("is_service_item").default(false).notNull(),
  isBillOfMaterial: boolean("is_bill_of_material").default(false).notNull(),
  costMethod: varchar("cost_method", { length: 20 }).default("average"), // fifo, lifo, average, specific
  defaultCost: numeric("default_cost").default("0"),
  defaultPrice: numeric("default_price").default("0"),
  images: text("images").array(), // Array of image URLs
  tags: text("tags").array(),
  attributes: jsonb("attributes"), // JSON for flexible custom attributes
  meta: jsonb("meta"), // Additional meta information
  vendorIds: integer("vendor_ids").array(), // Array of vendor IDs
  garmentTypes: text("garment_types").array(), // Types of garments this item can be used for
  seasons: text("seasons").array(), // Applicable seasons (Summer, Winter, Spring, etc.)
  materialContent: jsonb("material_content"), // Specific for fabrics (cotton 80%, polyester 20%)
  weight: numeric("weight"), // Weight per unit
  weightUnit: varchar("weight_unit", { length: 10 }), // kg, g, lb, etc.
  color: varchar("color", { length: 50 }),
  size: varchar("size", { length: 50 }),
  dimensions: jsonb("dimensions"), // For physical measurement specifications
  salesTaxable: boolean("sales_taxable").default(true),
  purchaseTaxable: boolean("purchase_taxable").default(true),
  taxRate: numeric("tax_rate").default("0"),
  hsCode: varchar("hs_code", { length: 20 }), // Harmonized System code for international trade
  countryOfOrigin: varchar("country_of_origin", { length: 50 }),
  discontinued: boolean("discontinued").default(false),
  discontinuedDate: timestamp("discontinued_date"),
  replacementItemId: integer("replacement_item_id").references(() => items.id),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantItemCodeUnique: unique("items_tenant_item_code_unique").on(table.tenantId, table.itemCode),
  tenantSkuUnique: unique("items_tenant_sku_unique").on(table.tenantId, table.sku),
  idx_items_tenant_active: index("idx_items_tenant_active").on(table.tenantId, table.isActive),
  idx_items_tenant_category: index("idx_items_tenant_category").on(table.tenantId, table.categoryId),
}));

// Item variants for handling multiple variations of the same item (color, size, etc.)
export const itemVariants = pgTable("item_variants", {
  id: serial("id").primaryKey(),
  parentItemId: integer("parent_item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  variantCode: varchar("variant_code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 50 }).unique(),
  barcode: varchar("barcode", { length: 50 }).unique(),
  attributes: jsonb("attributes").notNull(), // JSON containing variant attributes (color, size, etc.)
  images: text("images").array(), // Array of image URLs specific to this variant
  defaultCost: numeric("default_cost").default("0"),
  defaultPrice: numeric("default_price").default("0"),
  isActive: boolean("is_active").default(true).notNull(),
  weight: numeric("weight"), // Weight per unit
  dimensions: jsonb("dimensions"), // For physical measurement specifications
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bill of Materials (BOM) for garments
export const billOfMaterials = pgTable("bill_of_materials", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  version: varchar("version", { length: 20 }).notNull(), // Version number/code for this BOM
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  isDefault: boolean("is_default").default(false), // Is this the default BOM for the item
  effectiveDate: date("effective_date"), // When this BOM becomes effective
  expiryDate: date("expiry_date"), // When this BOM expires
  notes: text("notes"),
  totalCost: numeric("total_cost").default("0"), // Calculated total cost
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// BOM components link items to their component materials with quantities
export const bomComponents = pgTable("bom_components", {
  id: serial("id").primaryKey(),
  bomId: integer("bom_id").notNull().references(() => billOfMaterials.id, { onDelete: "cascade" }),
  componentItemId: integer("component_item_id").notNull().references(() => items.id),
  variantId: integer("variant_id").references(() => itemVariants.id), // For specific variants
  quantity: numeric("quantity").notNull().default("1"),
  unitId: integer("unit_id").notNull().references(() => itemUnits.id),
  wastagePercentage: numeric("wastage_percentage").default("0"), // Expected wastage
  costPerUnit: numeric("cost_per_unit").default("0"),
  position: varchar("position", { length: 50 }), // Where in the garment is this used (e.g., "collar", "cuff")
  notes: text("notes"),
  isOptional: boolean("is_optional").default(false),
  isAlternative: boolean("is_alternative").default(false),
  alternativeFor: integer("alternative_for").references(() => bomComponents.id), // Which component this is an alternative for
  sortOrder: integer("sort_order").default(0), // For ordering components in the BOM
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Item stock in warehouses
export const itemStock = pgTable("item_stock", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => items.id),
  variantId: integer("variant_id").references(() => itemVariants.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  locationCode: varchar("location_code", { length: 50 }), // Specific location within warehouse
  quantity: numeric("quantity").notNull().default("0"),
  reservedQuantity: numeric("reserved_quantity").default("0"), // Reserved for orders but not picked
  availableQuantity: numeric("available_quantity").default("0"), // Calculated: quantity - reservedQuantity
  unitCost: numeric("unit_cost").default("0"), // Current average cost per unit
  lastCountDate: timestamp("last_count_date"), // Date of last physical inventory count
  expiryDate: date("expiry_date"), // For items with expiration
  lotNumber: varchar("lot_number", { length: 50 }), // Batch/lot tracking
  serialNumbers: text("serial_numbers").array(), // For serial-tracked items
  minimumStockLevel: numeric("minimum_stock_level").default("0"), // Override item default for this warehouse
  maximumStockLevel: numeric("maximum_stock_level"), // Override item default for this warehouse
  reorderPoint: numeric("reorder_point").default("0"), // Override item default for this warehouse
  reorderQuantity: numeric("reorder_quantity").default("0"), // Suggested reorder quantity
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    // Create a unique constraint to ensure one row per item/variant/warehouse combination
    itemWarehouseUnique: unique().on(
      table.itemId, 
      table.variantId, 
      table.warehouseId, 
      table.locationCode
    ),
    tenantIdx: index("item_stock_tenant_idx").on(table.tenantId),
  };
});

// Price lists for items
export const priceLists = pgTable("price_lists", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  currency: varchar("currency", { length: 3 }).notNull().default("BDT"),
  isActive: boolean("is_active").default(true).notNull(),
  isDefault: boolean("is_default").default(false),
  effectiveDate: date("effective_date").notNull(),
  expiryDate: date("expiry_date"),
  customerGroupId: integer("customer_group_id"), // For customer-specific pricing
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Price list items
export const priceListItems = pgTable("price_list_items", {
  id: serial("id").primaryKey(),
  priceListId: integer("price_list_id").notNull().references(() => priceLists.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  variantId: integer("variant_id").references(() => itemVariants.id),
  price: numeric("price").notNull(),
  minQuantity: numeric("min_quantity").default("1"), // Minimum quantity for this price
  maxQuantity: numeric("max_quantity"), // Maximum quantity for this price
  specialPrice: numeric("special_price"), // Optional special/promotional price
  specialFrom: date("special_from"), // When special price starts
  specialTo: date("special_to"), // When special price ends
  discountPercentage: numeric("discount_percentage"), // As an alternative to direct price setting
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    // Create a unique constraint to ensure one row per price list/item/variant combination
    priceListItemUnique: unique().on(
      table.priceListId, 
      table.itemId, 
      table.variantId, 
      table.minQuantity
    )
  };
});

// Create insert schemas for items and related tables
export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  discontinuedDate: true
});

export const insertItemVariantSchema = createInsertSchema(itemVariants).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertBillOfMaterialsSchema = createInsertSchema(billOfMaterials).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertBomComponentSchema = createInsertSchema(bomComponents).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertItemStockSchema = createInsertSchema(itemStock).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastCountDate: true
});

export const insertPriceListSchema = createInsertSchema(priceLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertPriceListItemSchema = createInsertSchema(priceListItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Export types
export type InsertItem = z.infer<typeof insertItemSchema>;
export type InsertItemVariant = z.infer<typeof insertItemVariantSchema>;
export type InsertBillOfMaterials = z.infer<typeof insertBillOfMaterialsSchema>;
export type InsertBomComponent = z.infer<typeof insertBomComponentSchema>;
export type InsertItemStock = z.infer<typeof insertItemStockSchema>;
export type InsertPriceList = z.infer<typeof insertPriceListSchema>;
export type InsertPriceListItem = z.infer<typeof insertPriceListItemSchema>;

export type Item = typeof items.$inferSelect;
export type ItemVariant = typeof itemVariants.$inferSelect;
export type BillOfMaterials = typeof billOfMaterials.$inferSelect;
export type BomComponent = typeof bomComponents.$inferSelect;
export type ItemStock = typeof itemStock.$inferSelect;
export type PriceList = typeof priceLists.$inferSelect;
export type PriceListItem = typeof priceListItems.$inferSelect;

// Accounts Module - Currency Management Tables
export const currencies = pgTable("currencies", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 3 }).notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  symbol: varchar("symbol", { length: 5 }).notNull(),
  decimalPlaces: integer("decimal_places").default(2).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("currencies_code_tenant_idx").on(table.code, table.tenantId),
]);

// Exchange rates (relative to base currency)
export const exchangeRates = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  currencyId: integer("currency_id").notNull().references(() => currencies.id, {
    onDelete: "cascade",
  }),
  rate: decimal("rate", { precision: 10, scale: 6 }).notNull(), // Exchange rate relative to base currency
  validFrom: timestamp("valid_from").notNull(), // When this rate begins to be valid
  validTo: timestamp("valid_to"), // When this rate expires (null = indefinite)
  source: varchar("source", { length: 50 }), // Source of exchange rate (e.g., "manual", "api", "openai")
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("exchange_rates_tenant_idx").on(table.tenantId),
}));

// Currency conversion AI insights
export const currencyInsights = pgTable("currency_insights", {
  id: serial("id").primaryKey(),
  currencyId: integer("currency_id").notNull().references(() => currencies.id, {
    onDelete: "cascade",
  }),
  insightType: varchar("insight_type", { length: 50 }).notNull(), // "trend", "forecast", "risk" etc.
  title: varchar("title", { length: 200 }).notNull(), // Short title of the insight
  content: text("content").notNull(), // Detailed insight content
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // AI confidence level (0-1)
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Create insert schemas for currency tables
export const insertCurrencySchema = createInsertSchema(currencies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExchangeRateSchema = createInsertSchema(exchangeRates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCurrencyInsightSchema = createInsertSchema(currencyInsights).omit({
  id: true,
  createdAt: true,
});

// Export currency types
export type InsertCurrency = z.infer<typeof insertCurrencySchema>;
export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;
export type InsertCurrencyInsight = z.infer<typeof insertCurrencyInsightSchema>;
export type Currency = typeof currencies.$inferSelect;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type CurrencyInsight = typeof currencyInsights.$inferSelect;

// Quotation Module - Main Quotations
export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  quotationId: varchar("quotation_id", { length: 20 }).notNull().unique(),
  inquiryId: integer("inquiry_id").references(() => inquiries.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  styleName: varchar("style_name", { length: 255 }).notNull(),
  styleId: integer("style_id").references(() => styles.id),
  department: varchar("department", { length: 100 }).notNull(),
  projectedQuantity: integer("projected_quantity").notNull(),
  projectedDeliveryDate: date("projected_delivery_date"),
  targetPrice: numeric("target_price"),
  // @deprecated Use workflowStatus instead. Will be removed after migration.
  status: varchar("status", { length: 50 }).default("draft"),
  workflowStatus: varchar("workflow_status", { length: 30 }).default("DRAFT"),
  workflowInstanceId: integer("workflow_instance_id").references(() => workflowInstances.id),
  materialCost: numeric("material_cost").default("0"),
  manufacturingCost: numeric("manufacturing_cost").default("0"),
  otherCost: numeric("other_cost").default("0"),
  totalCost: numeric("total_cost").default("0"),
  costPerPiece: numeric("cost_per_piece").default("0"),
  profitPercentage: numeric("profit_percentage").default("0"),
  quotedPrice: numeric("quoted_price").default("0"),
  quotationDate: date("quotation_date").defaultNow(),
  validUntil: date("valid_until"),
  notes: text("notes"),
  componentIds: integer("component_ids").array(),
  colorwayIds: integer("colorway_ids").array(),
  sizeScaleId: integer("size_scale_id"),
  versionNo: integer("version_no").default(1).notNull(),
  revisionOfQuotationId: integer("revision_of_quotation_id"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  sizeRatioEnabled: boolean("size_ratio_enabled").default(false),
  weightedFabricFactor: numeric("weighted_fabric_factor").default("1.0"),
  packRatio: varchar("pack_ratio", { length: 50 }),
  pcsPerCarton: integer("pcs_per_carton"),
  targetPriceCurrency: varchar("target_price_currency", { length: 10 }).default("USD"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Quotation Module - Material Costs
export const quotationMaterials = pgTable("quotation_materials", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  quotationId: integer("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  serialNo: integer("serial_no").notNull(),
  categoryId: integer("category_id").references(() => itemCategories.id),
  subcategoryId: integer("subcategory_id"),
  itemId: integer("item_id").references(() => items.id),
  description: text("description"),
  unit: varchar("unit", { length: 20 }),
  consumptionPerDozen: numeric("consumption_per_dozen").default("0").notNull(),
  unitPrice: numeric("unit_price").default("0").notNull(),
  amountPerDozen: numeric("amount_per_dozen").default("0").notNull(),
  totalAmount: numeric("total_amount").default("0").notNull(),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  exchangeRate: numeric("exchange_rate").default("1"),
  baseAmount: numeric("base_amount").default("0"),
  localAmount: numeric("local_amount").default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("quotation_materials_tenant_idx").on(table.tenantId),
}));

// Quotation Module - Manufacturing Costs
export const quotationManufacturing = pgTable("quotation_manufacturing", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  quotationId: integer("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  serialNo: integer("serial_no").notNull(),
  stylePart: varchar("style_part", { length: 50 }).notNull(),
  machinesRequired: integer("machines_required").notNull(),
  productionPerHour: numeric("production_per_hour").notNull(),
  productionPerDay: numeric("production_per_day").notNull(),
  costPerMachine: numeric("cost_per_machine").notNull(),
  totalLineCost: numeric("total_line_cost").notNull(),
  costPerDozen: numeric("cost_per_dozen").notNull(),
  cmPerPiece: numeric("cm_per_piece").notNull(),
  totalOrderCost: numeric("total_order_cost").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("quotation_manufacturing_tenant_idx").on(table.tenantId),
}));

// Quotation Module - Other Costs
export const quotationOtherCosts = pgTable("quotation_other_costs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  quotationId: integer("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  serialNo: integer("serial_no").notNull(),
  costHead: varchar("cost_head", { length: 100 }).notNull(),
  percentage: numeric("percentage").default("0"),
  totalAmount: numeric("total_amount").default("0"),
  costType: varchar("cost_type", { length: 20 }).default("fixed"),
  value: numeric("value").default("0"),
  basedOn: varchar("based_on", { length: 30 }).default("subtotal"),
  calculatedAmount: numeric("calculated_amount").default("0"),
  notes: text("notes"),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  exchangeRate: numeric("exchange_rate").default("1"),
  baseAmount: numeric("base_amount").default("0"),
  localAmount: numeric("local_amount").default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("quotation_other_costs_tenant_idx").on(table.tenantId),
}));

// Quotation Module - Size Ratios
export const quotationSizeRatios = pgTable("quotation_size_ratios", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  quotationId: integer("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  serialNo: integer("serial_no").notNull(),
  size: varchar("size", { length: 10 }).notNull(),
  ratioPercentage: numeric("ratio_percentage").default("0").notNull(),
  fabricFactor: numeric("fabric_factor").default("1.0").notNull(),
  quantity: integer("quantity").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("quotation_size_ratios_tenant_idx").on(table.tenantId),
}));

// Quotation Module - Cost Summary
export const quotationCostSummary = pgTable("quotation_cost_summary", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  quotationId: integer("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  categoryName: varchar("category_name", { length: 100 }).notNull(),
  totalCost: numeric("total_cost").notNull(),
  percentageOfTotal: numeric("percentage_of_total").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("quotation_cost_summary_tenant_idx").on(table.tenantId),
}));

// Create Zod schemas for insert operations
export const insertQuotationSchema = createInsertSchema(quotations).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertQuotationMaterialSchema = createInsertSchema(quotationMaterials).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertQuotationManufacturingSchema = createInsertSchema(quotationManufacturing).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertQuotationOtherCostSchema = createInsertSchema(quotationOtherCosts).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertQuotationCostSummarySchema = createInsertSchema(quotationCostSummary).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertQuotationSizeRatioSchema = createInsertSchema(quotationSizeRatios).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

// Export types
export type Quotation = typeof quotations.$inferSelect;
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;

export type QuotationMaterial = typeof quotationMaterials.$inferSelect;
export type InsertQuotationMaterial = z.infer<typeof insertQuotationMaterialSchema>;

export type QuotationManufacturing = typeof quotationManufacturing.$inferSelect;
export type InsertQuotationManufacturing = z.infer<typeof insertQuotationManufacturingSchema>;

export type QuotationOtherCost = typeof quotationOtherCosts.$inferSelect;
export type InsertQuotationOtherCost = z.infer<typeof insertQuotationOtherCostSchema>;

export type QuotationSizeRatio = typeof quotationSizeRatios.$inferSelect;
export type InsertQuotationSizeRatio = z.infer<typeof insertQuotationSizeRatioSchema>;

export type QuotationCostSummary = typeof quotationCostSummary.$inferSelect;
export type InsertQuotationCostSummary = z.infer<typeof insertQuotationCostSummarySchema>;

// Orders Module - Main orders table
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderId: varchar("order_id", { length: 20 }).notNull().unique(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  quotationId: integer("quotation_id").references(() => quotations.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  styleName: varchar("style_name", { length: 255 }).notNull(),
  styleId: integer("style_id").references(() => styles.id),
  department: varchar("department", { length: 100 }).notNull(),
  totalQuantity: integer("total_quantity").notNull(),
  deliveryDate: date("delivery_date").notNull(),
  deliveryMode: varchar("delivery_mode", { length: 50 }).notNull(), // Air, Sea, etc.
  deliveryPort: varchar("delivery_port", { length: 100 }),
  paymentTerms: varchar("payment_terms", { length: 100 }),
  orderStatus: varchar("order_status", { length: 50 }).default("new").notNull(), // new, in_progress, ready_for_production, in_production, completed, shipped, delivered, canceled
  poNumber: varchar("po_number", { length: 100 }),
  shippingTerms: varchar("shipping_terms", { length: 255 }),
  exportCaseId: integer("export_case_id"),
  priceConfirmed: numeric("price_confirmed").notNull(),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  exchangeRate: numeric("exchange_rate"),
  notes: text("notes"),
  componentIds: integer("component_ids").array(),
  colorwayIds: integer("colorway_ids").array(),
  sizeScaleId: integer("size_scale_id"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Order Color and Size Breakdown
export const orderColorSizeBreakdown = pgTable("order_color_size_breakdown", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  color: varchar("color", { length: 50 }).notNull(),
  size: varchar("size", { length: 20 }).notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("order_color_size_breakdown_tenant_idx").on(table.tenantId),
}));

// Order Raw Materials table - Based on BOM but specific to the order
export const orderMaterials = pgTable("order_materials", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  materialType: varchar("material_type", { length: 100 }).notNull(), // Fabric, Label, Hangtag, etc.
  itemId: integer("item_id").references(() => items.id),
  variantId: integer("variant_id").references(() => itemVariants.id),
  quantityNeeded: numeric("quantity_needed").notNull(),
  unitId: integer("unit_id").references(() => itemUnits.id),
  unitPrice: numeric("unit_price").notNull(),
  totalCost: numeric("total_cost").notNull(),
  bookingStatus: varchar("booking_status", { length: 50 }).default("pending").notNull(), // pending, booked, received
  expectedDeliveryDate: date("expected_delivery_date"),
  actualDeliveryDate: date("actual_delivery_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("order_materials_tenant_idx").on(table.tenantId),
}));

// Sample Requirements and Approval Tracking
export const orderSamples = pgTable("order_samples", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sampleType: varchar("sample_type", { length: 50 }).notNull(), // Photo Sample, Fit Sample, PP Sample, Shipping Sample
  required: boolean("required").default(true),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, in_process, submitted_for_approval, approved, rejected
  submittedDate: date("submitted_date"),
  approvalDate: date("approval_date"),
  rejectionDate: date("rejection_date"),
  rejectionReason: text("rejection_reason"),
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("order_samples_tenant_idx").on(table.tenantId),
}));

// Trims and Label Approval Tracking
export const orderTrims = pgTable("order_trims", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  trimType: varchar("trim_type", { length: 50 }).notNull(), // Label, Hangtag, Sticker, etc.
  description: text("description"),
  imageUrl: text("image_url"),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, submitted_for_approval, approved, rejected
  submittedDate: date("submitted_date"),
  approvalDate: date("approval_date"),
  rejectionDate: date("rejection_date"),
  rejectionReason: text("rejection_reason"),
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("order_trims_tenant_idx").on(table.tenantId),
}));

// Time and Action Plan (T&A) Module
export const timeActionPlans = pgTable("time_action_plans", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(), // Delivery date
  totalDays: integer("total_days").notNull(), // Calculated lead time
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, completed, canceled
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Time and Action Plan Milestones
export const timeActionMilestones = pgTable("time_action_milestones", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => timeActionPlans.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  milestoneName: varchar("milestone_name", { length: 100 }).notNull(),
  description: text("description"),
  plannedStartDate: date("planned_start_date").notNull(),
  plannedEndDate: date("planned_end_date").notNull(),
  actualStartDate: date("actual_start_date"),
  actualEndDate: date("actual_end_date"),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, in_progress, completed, delayed, at_risk
  responsiblePerson: varchar("responsible_person", { length: 100 }),
  department: varchar("department", { length: 100 }),
  comments: text("comments"),
  dependencies: text("dependencies").array(),
  priority: varchar("priority", { length: 20 }).default("medium"), // high, medium, low
  isCritical: boolean("is_critical").default(false),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// CRM Module - Customer Interactions
export const customerInteractions = pgTable("customer_interactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  interactionType: varchar("interaction_type", { length: 50 }).notNull(), // email, call, meeting, site_visit, etc.
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description"),
  interactionDate: timestamp("interaction_date").notNull(),
  nextFollowUpDate: timestamp("next_follow_up_date"),
  status: varchar("status", { length: 50 }).default("open").notNull(), // open, in_progress, closed
  assignedTo: integer("assigned_to").references(() => users.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Buyer Portal Users (Customer Portal Access)
export const buyerPortalUsers = pgTable("buyer_portal_users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastLogin: timestamp("last_login"),
  resetToken: varchar("reset_token", { length: 255 }),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sample Development Module
export const sampleDevelopments = pgTable("sample_developments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  inquiryId: integer("inquiry_id").references(() => inquiries.id),
  sampleId: varchar("sample_id", { length: 20 }).notNull().unique(),
  styleName: varchar("style_name", { length: 255 }).notNull(),
  department: varchar("department", { length: 100 }).notNull(),
  sampleType: varchar("sample_type", { length: 50 }).notNull(), // Development Sample, Sales Sample, Pre-Production, etc.
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  requestedDate: date("requested_date").notNull(),
  targetCompletionDate: date("target_completion_date").notNull(),
  actualCompletionDate: date("actual_completion_date"),
  status: varchar("status", { length: 50 }).default("new").notNull(), // new, in_process, completed, sent_to_customer, approved, rejected
  rejectionReason: text("rejection_reason"),
  comments: text("comments"),
  technicalDetails: jsonb("technical_details"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sample Components and Materials
export const sampleMaterials = pgTable("sample_materials", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sampleId: integer("sample_id").notNull().references(() => sampleDevelopments.id, { onDelete: "cascade" }),
  materialType: varchar("material_type", { length: 100 }).notNull(), // Fabric, Label, Hangtag, etc.
  itemId: integer("item_id").references(() => items.id),
  quantity: numeric("quantity").notNull(),
  unitId: integer("unit_id").references(() => itemUnits.id),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, received, used
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Notifications Table for Buyer Portal and Internal Users
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  notificationType: varchar("notification_type", { length: 50 }).notNull(), // inquiry, quotation, order, sample, general
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  relatedEntityType: varchar("related_entity_type", { length: 50 }), // order, quotation, inquiry, sample
  relatedEntityId: integer("related_entity_id"),
  userId: integer("user_id"), // Internal user ID (if applicable)
  portalUserId: integer("portal_user_id"), // Buyer portal user ID (if applicable)
  isRead: boolean("is_read").default(false),
  isSent: boolean("is_sent").default(false),
  sentAt: timestamp("sent_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("notifications_tenant_idx").on(table.tenantId),
  idx_notifications_tenant_user: index("idx_notifications_tenant_user").on(table.tenantId, table.userId),
  idx_notifications_tenant_read: index("idx_notifications_tenant_read").on(table.tenantId, table.isRead),
}));

// Create Zod schemas for insert operations for the order module
export const insertOrderSchema = createInsertSchema(orders, {
  deliveryDate: z.coerce.date(),
  priceConfirmed: z.coerce.number(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertOrderColorSizeBreakdownSchema = createInsertSchema(orderColorSizeBreakdown).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertOrderMaterialsSchema = createInsertSchema(orderMaterials, {
  quantityNeeded: z.coerce.number(),
  unitPrice: z.coerce.number(),
  totalCost: z.coerce.number(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertOrderSamplesSchema = createInsertSchema(orderSamples).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertOrderTrimsSchema = createInsertSchema(orderTrims).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Create Zod schemas for Time and Action Plan (T&A) Module
export const insertTimeActionPlanSchema = createInsertSchema(timeActionPlans, {
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertTimeActionMilestoneSchema = createInsertSchema(timeActionMilestones, {
  plannedStartDate: z.coerce.date(),
  plannedEndDate: z.coerce.date(),
  actualStartDate: z.coerce.date().optional(),
  actualEndDate: z.coerce.date().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Create Zod schemas for CRM module
export const insertCustomerInteractionSchema = createInsertSchema(customerInteractions, {
  interactionDate: z.coerce.date(),
  nextFollowUpDate: z.coerce.date().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertBuyerPortalUserSchema = createInsertSchema(buyerPortalUsers).omit({
  id: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true
});

// Create Zod schemas for Sample Development module
export const insertSampleDevelopmentSchema = createInsertSchema(sampleDevelopments, {
  requestedDate: z.coerce.date(),
  targetCompletionDate: z.coerce.date(),
  actualCompletionDate: z.coerce.date().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertSampleMaterialSchema = createInsertSchema(sampleMaterials, {
  quantity: z.coerce.number(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Export types for the Order Module
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderColorSizeBreakdown = typeof orderColorSizeBreakdown.$inferSelect;
export type InsertOrderColorSizeBreakdown = z.infer<typeof insertOrderColorSizeBreakdownSchema>;

export type OrderMaterial = typeof orderMaterials.$inferSelect;
export type InsertOrderMaterial = z.infer<typeof insertOrderMaterialsSchema>;

export type OrderSample = typeof orderSamples.$inferSelect;
export type InsertOrderSample = z.infer<typeof insertOrderSamplesSchema>;

export type OrderTrim = typeof orderTrims.$inferSelect;
export type InsertOrderTrim = z.infer<typeof insertOrderTrimsSchema>;

// Export types for Time and Action Plan (T&A) Module
export type TimeActionPlan = typeof timeActionPlans.$inferSelect;
export type InsertTimeActionPlan = z.infer<typeof insertTimeActionPlanSchema>;

export type TimeActionMilestone = typeof timeActionMilestones.$inferSelect;
export type InsertTimeActionMilestone = z.infer<typeof insertTimeActionMilestoneSchema>;

// Export types for CRM module
export type CustomerInteraction = typeof customerInteractions.$inferSelect;
export type InsertCustomerInteraction = z.infer<typeof insertCustomerInteractionSchema>;

export type BuyerPortalUser = typeof buyerPortalUsers.$inferSelect;
export type InsertBuyerPortalUser = z.infer<typeof insertBuyerPortalUserSchema>;

// Export types for Sample Development module
export type SampleDevelopment = typeof sampleDevelopments.$inferSelect;
export type InsertSampleDevelopment = z.infer<typeof insertSampleDevelopmentSchema>;

export type SampleMaterial = typeof sampleMaterials.$inferSelect;
export type InsertSampleMaterial = z.infer<typeof insertSampleMaterialSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// CRM Activity Log Table for tracking customer interactions
export const crmActivities = pgTable("crm_activities", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  activityType: varchar("activity_type", { length: 50 }).notNull(), // call, email, meeting, note, portal_activity
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  activityDate: timestamp("activity_date").notNull(),
  relatedEntityType: varchar("related_entity_type", { length: 50 }), // inquiry, quotation, order, sample, trim
  relatedEntityId: integer("related_entity_id"),
  followUpRequired: boolean("follow_up_required").default(false),
  followUpDate: timestamp("follow_up_date"),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sample Approval Tracking Table
export const sampleApprovals = pgTable("sample_approvals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sampleId: integer("sample_id").notNull().references(() => sampleDevelopments.id, { onDelete: "cascade" }),
  approvalType: varchar("approval_type", { length: 50 }).notNull(), // photo, fit, pp, shipping
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, revised
  comments: text("comments"),
  attachments: text("attachments").array(),
  approvedBy: integer("approved_by").references(() => buyerPortalUsers.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("sample_approvals_tenant_idx").on(table.tenantId),
}));

// Trim and Label Approval Table
export const trimApprovals = pgTable("trim_approvals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  trimType: varchar("trim_type", { length: 50 }).notNull(), // label, hangtag, packaging, sticker
  description: text("description"),
  attachments: text("attachments").array(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, revised
  comments: text("comments"),
  approvedBy: integer("approved_by").references(() => buyerPortalUsers.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer Portal Activity Logs
export const portalActivityLogs = pgTable("portal_activity_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  portalUserId: integer("portal_user_id").notNull().references(() => buyerPortalUsers.id),
  activityType: varchar("activity_type", { length: 50 }).notNull(), // login, view, approval, rejection, comment
  activityDetail: text("activity_detail").notNull(),
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: integer("related_entity_id"),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI-Powered Customer Insights Table
export const customerInsights = pgTable("customer_insights", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  insightType: varchar("insight_type", { length: 50 }).notNull(), // order_pattern, communication, feedback, risk, opportunity
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  insightData: jsonb("insight_data"), // Structured data for charts and visualization
  score: integer("score"), // Numerical score/rating if applicable
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer Communication Templates
export const communicationTemplates = pgTable("communication_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // email, sms, portal_notification
  subject: varchar("subject", { length: 255 }),
  content: text("content").notNull(),
  variables: jsonb("variables"), // Available template variables
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas for CRM tables
export const insertCrmActivitySchema = createInsertSchema(crmActivities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSampleApprovalSchema = createInsertSchema(sampleApprovals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrimApprovalSchema = createInsertSchema(trimApprovals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPortalActivityLogSchema = createInsertSchema(portalActivityLogs).omit({
  id: true,
  createdAt: true,
});

export const insertCustomerInsightSchema = createInsertSchema(customerInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommunicationTemplateSchema = createInsertSchema(communicationTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for CRM tables
export type CrmActivity = typeof crmActivities.$inferSelect;
export type InsertCrmActivity = z.infer<typeof insertCrmActivitySchema>;

export type SampleApproval = typeof sampleApprovals.$inferSelect;
export type InsertSampleApproval = z.infer<typeof insertSampleApprovalSchema>;

export type TrimApproval = typeof trimApprovals.$inferSelect;
export type InsertTrimApproval = z.infer<typeof insertTrimApprovalSchema>;

export type PortalActivityLog = typeof portalActivityLogs.$inferSelect;
export type InsertPortalActivityLog = z.infer<typeof insertPortalActivityLogSchema>;

export type CustomerInsight = typeof customerInsights.$inferSelect;
export type InsertCustomerInsight = z.infer<typeof insertCustomerInsightSchema>;

export type CommunicationTemplate = typeof communicationTemplates.$inferSelect;
export type InsertCommunicationTemplate = z.infer<typeof insertCommunicationTemplateSchema>;

// ============================================================
// Accounting Module Tables
// ============================================================

// Account Types table - defines types of accounts in the chart of accounts
export const accountTypes = pgTable("account_types", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // Asset, Liability, Equity, Income, Expense
  description: text("description"),
  normalBalance: varchar("normal_balance", { length: 10 }).notNull(), // debit or credit
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    tenantCodeUnq: unique().on(table.tenantId, table.code),
    tenantIdx: index("account_types_tenant_idx").on(table.tenantId),
  };
});

// Account Groups table - Tally-style account grouping hierarchy
export const accountGroups = pgTable("account_groups", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 30 }).notNull(),
  parentGroupId: integer("parent_group_id"),
  nature: varchar("nature", { length: 20 }).notNull(),
  affectsGrossProfit: boolean("affects_gross_profit").default(false).notNull(),
  isBankGroup: boolean("is_bank_group").default(false).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    tenantCodeUnq: unique().on(table.tenantId, table.code),
  };
});

// Chart of Accounts table - defines the accounts for financial transactions
export const chartOfAccounts = pgTable("chart_of_accounts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  accountTypeId: integer("account_type_id").notNull().references(() => accountTypes.id),
  groupId: integer("group_id").notNull().references(() => accountGroups.id),
  parentAccountId: integer("parent_account_id").references(() => chartOfAccounts.id),
  accountNumber: varchar("account_number", { length: 30 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  path: varchar("path", { length: 255 }).notNull(),
  level: integer("level").notNull().default(1),
  allowJournalEntries: boolean("allow_journal_entries").default(true).notNull(),
  isCashAccount: boolean("is_cash_account").default(false).notNull(),
  isBankAccount: boolean("is_bank_account").default(false).notNull(),
  normalBalance: varchar("normal_balance", { length: 10 }).default("debit"),
  bankAccountDetails: jsonb("bank_account_details"),
  balance: numeric("balance", { precision: 15, scale: 2 }).default("0").notNull(),
  openingBalance: numeric("opening_balance", { precision: 15, scale: 2 }).default("0"),
  isMaterialSupplier: boolean("is_material_supplier").default(false).notNull(),
  supplierContactPerson: varchar("supplier_contact_person", { length: 100 }),
  supplierPhone: varchar("supplier_phone", { length: 30 }),
  supplierEmail: varchar("supplier_email", { length: 100 }),
  supplierAddress: text("supplier_address"),
  supplierCity: varchar("supplier_city", { length: 50 }),
  supplierCountry: varchar("supplier_country", { length: 50 }),
  supplierTaxId: varchar("supplier_tax_id", { length: 50 }),
  supplierPaymentTerms: varchar("supplier_payment_terms", { length: 50 }),
  supplierCreditLimit: numeric("supplier_credit_limit", { precision: 15, scale: 2 }),
  accountCurrencyCode: varchar("account_currency_code", { length: 10 }),
  maintainFcBalance: boolean("maintain_fc_balance").default(false).notNull(),
  enableBillWise: boolean("enable_bill_wise").default(false).notNull(),
  hasInterest: boolean("has_interest").default(false).notNull(),
  yearlyInterestRate: numeric("yearly_interest_rate", { precision: 8, scale: 4 }),
  interestPostingFrequency: varchar("interest_posting_frequency", { length: 20 }).default("quarterly"),
  lastInterestPostedDate: timestamp("last_interest_posted_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    tenantAccountNumberUnq: unique().on(table.tenantId, table.accountNumber),
  };
});

// Fiscal Years table - defines financial years for accounting periods
export const fiscalYears = pgTable("fiscal_years", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"), // open, closed
  isCurrent: boolean("is_current").default(false),
  notes: text("notes"),
  isClosed: boolean("is_closed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    tenantNameUnq: unique().on(table.tenantId, table.name),
  };
});

// Accounting Periods table - defines periods within fiscal years
export const accountingPeriods = pgTable("accounting_periods", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  fiscalYearId: integer("fiscal_year_id").references(() => fiscalYears.id),
  name: varchar("name", { length: 100 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isClosed: boolean("is_closed").default(false).notNull(),
  closedBy: integer("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at"),
  closedReason: text("closed_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    fiscalYearPeriodUnq: unique().on(table.fiscalYearId, table.name),
    tenantDateUnique: unique().on(table.tenantId, table.startDate, table.endDate),
  };
});

// Journal Types table - defines types of journal entries
export const journalTypes = pgTable("journal_types", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  description: text("description"),
  prefix: varchar("prefix", { length: 10 }),
  nextNumber: integer("next_number").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    tenantCodeUnq: unique().on(table.tenantId, table.code),
    tenantIdx: index("journal_types_tenant_idx").on(table.tenantId),
  };
});

// Journals table - header for journal entries
export const journals = pgTable("journals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  journalTypeId: integer("journal_type_id").notNull().references(() => journalTypes.id),
  fiscalYearId: integer("fiscal_year_id").references(() => fiscalYears.id),
  periodId: integer("period_id").references(() => accountingPeriods.id),
  reversalOfJournalId: integer("reversal_of_journal_id").references(() => journals.id),
  journalNumber: varchar("journal_number", { length: 50 }).notNull(),
  journalDate: date("journal_date").notNull(),
  postDate: date("post_date"),
  reference: varchar("reference", { length: 100 }),
  description: text("description").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft, posted, reversed
  amount: numeric("amount", { precision: 15, scale: 2 }).default("0").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  postedBy: integer("posted_by").references(() => users.id),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    tenantJournalNumberUnq: unique().on(table.tenantId, table.journalNumber),
  };
});

// Journal Lines table - detail lines for journals
export const journalLines = pgTable("journal_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  journalId: integer("journal_id").notNull().references(() => journals.id),
  accountId: integer("account_id").notNull().references(() => chartOfAccounts.id),
  description: text("description"),
  debitAmount: numeric("debit_amount", { precision: 15, scale: 2 }).default("0").notNull(),
  creditAmount: numeric("credit_amount", { precision: 15, scale: 2 }).default("0").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("journal_lines_tenant_idx").on(table.tenantId),
}));

// Voucher Management tables
export const voucherTypes = pgTable("voucher_types", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  journalTypeId: integer("journal_type_id").references(() => journalTypes.id),
  prefix: varchar("prefix", { length: 10 }).notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  isPurchase: boolean("is_purchase").default(false),
  isSales: boolean("is_sales").default(false),
  isPayment: boolean("is_payment").default(false),
  isReceipt: boolean("is_receipt").default(false),
  isJournal: boolean("is_journal").default(false),
  isContra: boolean("is_contra").default(false),
  isAsset: boolean("is_asset").default(false),
  isLiability: boolean("is_liability").default(false),
  requiresApproval: boolean("requires_approval").default(true),
  requiresAttachment: boolean("requires_attachment").default(false),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("voucher_types_tenant_idx").on(table.tenantId),
}));

export const voucherStatus = pgTable("voucher_status", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 20 }).default("#808080"),
  isBlocking: boolean("is_blocking").default(false),
  isDefault: boolean("is_default").default(false),
  sequence: integer("sequence").default(0),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("voucher_status_tenant_idx").on(table.tenantId),
}));

export const voucherWorkflow = pgTable("voucher_workflow", {
  id: serial("id").primaryKey(),
  voucherTypeId: integer("voucher_type_id").notNull().references(() => voucherTypes.id),
  fromStatusId: integer("from_status_id").references(() => voucherStatus.id),
  toStatusId: integer("to_status_id").notNull().references(() => voucherStatus.id),
  actionName: varchar("action_name", { length: 50 }).notNull(),
  requiredRole: varchar("required_role", { length: 50 }),
  description: text("description"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("voucher_workflow_tenant_idx").on(table.tenantId),
}));

export const approvalRules = pgTable("approval_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  voucherTypeId: integer("voucher_type_id").references(() => voucherTypes.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  minAmount: numeric("min_amount", { precision: 15, scale: 2 }).default("0"),
  maxAmount: numeric("max_amount", { precision: 15, scale: 2 }),
  requiredRole: varchar("required_role", { length: 50 }).notNull(),
  approvalLevel: integer("approval_level").notNull().default(1),
  makerCheckerEnabled: boolean("maker_checker_enabled").default(true).notNull(),
  originModule: varchar("origin_module", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("approval_rules_tenant_idx").on(table.tenantId),
}));

export const vouchers = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  voucherNumber: varchar("voucher_number", { length: 50 }).notNull(),
  voucherTypeId: integer("voucher_type_id").notNull().references(() => voucherTypes.id),
  voucherDate: date("voucher_date").notNull(),
  postingDate: date("posting_date"),
  fiscalYearId: integer("fiscal_year_id").notNull().references(() => fiscalYears.id),
  accountingPeriodId: integer("accounting_period_id").references(() => accountingPeriods.id),
  // @deprecated Use workflowStatus instead. Will be removed after migration.
  statusId: integer("status_id").notNull().references(() => voucherStatus.id),
  reference: varchar("reference", { length: 100 }),
  referenceDate: date("reference_date"),
  description: text("description"),
  preparedById: integer("prepared_by_id").notNull().references(() => users.id),
  approvedById: integer("approved_by_id").references(() => users.id),
  approvedDate: timestamp("approved_date"),
  submittedById: integer("submitted_by_id").references(() => users.id),
  submittedDate: timestamp("submitted_date"),
  checkedById: integer("checked_by_id").references(() => users.id),
  checkedDate: timestamp("checked_date"),
  postedById: integer("posted_by_id").references(() => users.id),
  postedDate: timestamp("posted_date"),
  rejectedById: integer("rejected_by_id").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  rejectedDate: timestamp("rejected_date"),
  entityType: varchar("entity_type", { length: 50 }), // vendor, customer, employee
  entityId: integer("entity_id"), // ID of the related entity
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  currencyCode: varchar("currency_code", { length: 10 }).default("BDT"),
  exchangeRate: numeric("exchange_rate", { precision: 10, scale: 6 }).default("1"),
  baseCurrencyAmount: numeric("base_currency_amount", { precision: 15, scale: 2 }),
  journalId: integer("journal_id").references(() => journals.id), // Link to journal if posted
  isPosted: boolean("is_posted").default(false),
  postingReference: varchar("posting_reference", { length: 100 }),
  workflowStatus: varchar("workflow_status", { length: 30 }).default("DRAFT"),
  workflowInstanceId: integer("workflow_instance_id").references(() => workflowInstances.id),
  isCancelled: boolean("is_cancelled").default(false),
  cancellationReason: text("cancellation_reason"),
  cancelledById: integer("cancelled_by_id").references(() => users.id),
  cancellationDate: timestamp("cancellation_date"),
  attachments: jsonb("attachments"), // JSON array of attachment objects with URLs
  notes: text("notes"),
  tags: text("tags").array(),
  customFields: jsonb("custom_fields"), // For extensibility
  aiSummary: text("ai_summary"), // AI-generated insights
  originModule: varchar("origin_module", { length: 50 }),
  originType: varchar("origin_type", { length: 50 }),
  originId: integer("origin_id"),
  originRef: varchar("origin_ref", { length: 100 }),
  originalVoucherId: integer("original_voucher_id"),
  reversalVoucherId: integer("reversal_voucher_id"),
  correctedVoucherId: integer("corrected_voucher_id"),
  reversalReason: text("reversal_reason"),
  isReversal: boolean("is_reversal").default(false),
  verificationCode: varchar("verification_code", { length: 64 }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    originUnq: unique().on(table.tenantId, table.originModule, table.originType, table.originId),
    tenantVoucherNumberUnique: unique("vouchers_tenant_voucher_number_unique").on(table.tenantId, table.voucherNumber, table.voucherTypeId),
    idx_vouchers_tenant_date: index("idx_vouchers_tenant_date").on(table.tenantId, table.voucherDate),
    idx_vouchers_tenant_type: index("idx_vouchers_tenant_type").on(table.tenantId, table.voucherTypeId),
  };
});

export const voucherItems = pgTable("voucher_items", {
  id: serial("id").primaryKey(),
  voucherId: integer("voucher_id").notNull().references(() => vouchers.id, {
    onDelete: "cascade",
  }),
  lineNumber: integer("line_number").notNull(),
  accountId: integer("account_id").notNull().references(() => chartOfAccounts.id),
  description: text("description"),
  debitAmount: numeric("debit_amount", { precision: 15, scale: 2 }).default("0"),
  creditAmount: numeric("credit_amount", { precision: 15, scale: 2 }).default("0"),
  baseCurrencyDebit: numeric("base_currency_debit", { precision: 15, scale: 2 }).default("0"),
  baseCurrencyCreditAmount: numeric("base_currency_credit", { precision: 15, scale: 2 }).default("0"),
  fcCurrencyCode: varchar("fc_currency_code", { length: 10 }),
  fcDebitAmount: numeric("fc_debit_amount", { precision: 18, scale: 6 }).default("0"),
  fcCreditAmount: numeric("fc_credit_amount", { precision: 18, scale: 6 }).default("0"),
  itemExchangeRate: numeric("item_exchange_rate", { precision: 18, scale: 8 }),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).default("0"),
  taxPercentage: numeric("tax_percentage", { precision: 5, scale: 2 }).default("0"),
  costCenterId: integer("cost_center_id"),
  costCategoryId: integer("cost_category_id"),
  projectId: integer("project_id"),
  entityType: varchar("entity_type", { length: 50 }), // vendor, customer, employee, item, asset
  entityId: integer("entity_id"), // ID of the related entity
  reference: varchar("reference", { length: 100 }),
  attachments: jsonb("attachments"), // JSON array of attachment objects with URLs
  notes: text("notes"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("voucher_items_tenant_idx").on(table.tenantId),
}));

export const voucherApprovalHistory = pgTable("voucher_approval_history", {
  id: serial("id").primaryKey(),
  voucherId: integer("voucher_id").notNull().references(() => vouchers.id, {
    onDelete: "cascade",
  }),
  fromStatusId: integer("from_status_id").references(() => voucherStatus.id),
  toStatusId: integer("to_status_id").notNull().references(() => voucherStatus.id),
  actionName: varchar("action_name", { length: 50 }).notNull(),
  actionById: integer("action_by_id").notNull().references(() => users.id),
  comments: text("comments"),
  actionDate: timestamp("action_date").defaultNow().notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("voucher_approval_history_tenant_idx").on(table.tenantId),
}));

export const voucherEditHistory = pgTable("voucher_edit_history", {
  id: serial("id").primaryKey(),
  voucherId: integer("voucher_id").notNull().references(() => vouchers.id, { onDelete: "cascade" }),
  editedById: integer("edited_by_id").notNull().references(() => users.id),
  fieldName: varchar("field_name", { length: 100 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  editDate: timestamp("edit_date").defaultNow().notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
}, (table) => ({
  tenantIdx: index("voucher_edit_history_tenant_idx").on(table.tenantId),
}));

export const ledgerPostings = pgTable("ledger_postings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  voucherId: integer("voucher_id").notNull().references(() => vouchers.id),
  voucherItemId: integer("voucher_item_id").notNull().references(() => voucherItems.id),
  accountId: integer("account_id").notNull().references(() => chartOfAccounts.id),
  postingDate: date("posting_date").notNull(),
  debitAmount: numeric("debit_amount", { precision: 15, scale: 2 }).default("0").notNull(),
  creditAmount: numeric("credit_amount", { precision: 15, scale: 2 }).default("0").notNull(),
  narration: text("narration"),
  postedById: integer("posted_by_id").references(() => users.id),
  fiscalYearId: integer("fiscal_year_id").references(() => fiscalYears.id),
  accountingPeriodId: integer("accounting_period_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("ledger_postings_tenant_idx").on(table.tenantId),
  tenantDateIdx: index("ledger_postings_tenant_date_idx").on(table.tenantId, table.postingDate),
  tenantAccountIdx: index("ledger_postings_tenant_account_idx").on(table.tenantId, table.accountId),
  tenantAccountDateIdx: index("ledger_postings_tenant_account_date_idx").on(table.tenantId, table.accountId, table.postingDate),
}));

export const ledgerOpeningBalances = pgTable("ledger_opening_balances", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  accountId: integer("account_id").notNull().references(() => chartOfAccounts.id),
  fiscalYearId: integer("fiscal_year_id").notNull().references(() => fiscalYears.id),
  openingDebit: numeric("opening_debit", { precision: 15, scale: 2 }).default("0").notNull(),
  openingCredit: numeric("opening_credit", { precision: 15, scale: 2 }).default("0").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    uniqueBalance: unique().on(table.tenantId, table.accountId, table.fiscalYearId),
  };
});

// Posting Profiles - templates for how different transaction types map to accounting entries
export const postingProfiles = pgTable("posting_profiles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  originModule: varchar("origin_module", { length: 50 }).notNull(),
  originType: varchar("origin_type", { length: 50 }).notNull(),
  voucherTypeId: integer("voucher_type_id").notNull().references(() => voucherTypes.id),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const postingProfileLines = pgTable("posting_profile_lines", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => postingProfiles.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  accountCode: varchar("account_code", { length: 20 }).notNull(),
  accountId: integer("account_id").references(() => chartOfAccounts.id),
  debitFormula: varchar("debit_formula", { length: 200 }),
  creditFormula: varchar("credit_formula", { length: 200 }),
  description: text("description"),
  costCenterField: varchar("cost_center_field", { length: 100 }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
});

// Types for Accounting Module
export type AccountType = typeof accountTypes.$inferSelect;
export type InsertAccountType = typeof accountTypes.$inferInsert;

export const insertAccountGroupSchema = createInsertSchema(accountGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AccountGroup = typeof accountGroups.$inferSelect;
export type InsertAccountGroup = z.infer<typeof insertAccountGroupSchema>;

// Insert schemas for Voucher Management
export const insertVoucherTypeSchema = createInsertSchema(voucherTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVoucherStatusSchema = createInsertSchema(voucherStatus).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVoucherWorkflowSchema = createInsertSchema(voucherWorkflow).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVoucherSchema = createInsertSchema(vouchers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  postingDate: true,
  approvedDate: true,
  approvedById: true,
  submittedById: true,
  submittedDate: true,
  checkedById: true,
  checkedDate: true,
  postedById: true,
  postedDate: true,
  rejectedDate: true,
  rejectedById: true,
  rejectionReason: true,
  cancellationDate: true,
  cancelledById: true,
  cancellationReason: true,
  baseCurrencyAmount: true,
  journalId: true,
  isPosted: true,
  postingReference: true,
  isCancelled: true,
  aiSummary: true,
});

export const insertVoucherItemSchema = createInsertSchema(voucherItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVoucherApprovalHistorySchema = createInsertSchema(voucherApprovalHistory).omit({
  id: true,
  createdAt: true,
  actionDate: true,
});

// Export voucher module types
export type VoucherType = typeof voucherTypes.$inferSelect;
export type InsertVoucherType = z.infer<typeof insertVoucherTypeSchema>;

export type VoucherStatus = typeof voucherStatus.$inferSelect;
export type InsertVoucherStatus = z.infer<typeof insertVoucherStatusSchema>;

export type VoucherWorkflow = typeof voucherWorkflow.$inferSelect;
export type InsertVoucherWorkflow = z.infer<typeof insertVoucherWorkflowSchema>;

export type Voucher = typeof vouchers.$inferSelect;
export type InsertVoucher = z.infer<typeof insertVoucherSchema>;

export type VoucherItem = typeof voucherItems.$inferSelect;
export type InsertVoucherItem = z.infer<typeof insertVoucherItemSchema>;

export type VoucherApprovalHistory = typeof voucherApprovalHistory.$inferSelect;
export type InsertVoucherApprovalHistory = z.infer<typeof insertVoucherApprovalHistorySchema>;

export const insertApprovalRuleSchema = createInsertSchema(approvalRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ApprovalRule = typeof approvalRules.$inferSelect;
export type InsertApprovalRule = z.infer<typeof insertApprovalRuleSchema>;

export const insertVoucherEditHistorySchema = createInsertSchema(voucherEditHistory).omit({
  id: true,
  editDate: true,
});
export type VoucherEditHistory = typeof voucherEditHistory.$inferSelect;
export type InsertVoucherEditHistory = z.infer<typeof insertVoucherEditHistorySchema>;

export const insertLedgerPostingSchema = createInsertSchema(ledgerPostings).omit({
  id: true,
  createdAt: true,
});
export type LedgerPosting = typeof ledgerPostings.$inferSelect;
export type InsertLedgerPosting = z.infer<typeof insertLedgerPostingSchema>;

export const insertLedgerOpeningBalanceSchema = createInsertSchema(ledgerOpeningBalances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type LedgerOpeningBalance = typeof ledgerOpeningBalances.$inferSelect;
export type InsertLedgerOpeningBalance = z.infer<typeof insertLedgerOpeningBalanceSchema>;

export const insertPostingProfileSchema = createInsertSchema(postingProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type PostingProfile = typeof postingProfiles.$inferSelect;
export type InsertPostingProfile = z.infer<typeof insertPostingProfileSchema>;

export const insertPostingProfileLineSchema = createInsertSchema(postingProfileLines).omit({
  id: true,
});
export type PostingProfileLine = typeof postingProfileLines.$inferSelect;
export type InsertPostingProfileLine = z.infer<typeof insertPostingProfileLineSchema>;

export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type InsertChartOfAccount = typeof chartOfAccounts.$inferInsert;

export type FiscalYear = typeof fiscalYears.$inferSelect;
export type InsertFiscalYear = typeof fiscalYears.$inferInsert;

export const insertAccountingPeriodSchema = createInsertSchema(accountingPeriods).omit({ id: true, createdAt: true, updatedAt: true });
export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type InsertAccountingPeriod = z.infer<typeof insertAccountingPeriodSchema>;

export type JournalType = typeof journalTypes.$inferSelect;
export type InsertJournalType = typeof journalTypes.$inferInsert;

export type Journal = typeof journals.$inferSelect;
export type InsertJournal = typeof journals.$inferInsert;

export type JournalLine = typeof journalLines.$inferSelect;
export type InsertJournalLine = typeof journalLines.$inferInsert;

// Financial Statement Templates table
export const financialStatementTemplates = pgTable("financial_statement_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // balance_sheet, income_statement, cash_flow
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    tenantNameTypeUnq: unique().on(table.tenantId, table.name, table.type),
  };
});

// Financial Statement Sections table
export const financialStatementSections = pgTable("financial_statement_sections", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  templateId: integer("template_id").notNull().references(() => financialStatementTemplates.id),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // header, calculation, accounts
  formula: text("formula"), // Used for calculation sections
  parentSectionId: integer("parent_section_id").references(() => financialStatementSections.id),
  displayOrder: integer("display_order").default(0).notNull(),
  indentLevel: integer("indent_level").default(0).notNull(),
  showTotal: boolean("show_total").default(true),
  isNegative: boolean("is_negative").default(false), // Indicates if the section should display as negative
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Financial Statement Section Accounts table - maps accounts to sections
export const financialStatementSectionAccounts = pgTable("financial_statement_section_accounts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sectionId: integer("section_id").notNull().references(() => financialStatementSections.id),
  accountId: integer("account_id").notNull().references(() => chartOfAccounts.id),
  includeSubAccounts: boolean("include_sub_accounts").default(true),
  isNegative: boolean("is_negative").default(false), // Flip sign of account amount
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    sectionAccountUnq: unique().on(table.sectionId, table.accountId),
  };
});

// Financial Insights table - AI-generated insights about financial data
export const financialInsights = pgTable("financial_insights", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  insightType: varchar("insight_type", { length: 50 }).notNull(), // profitability, liquidity, growth, etc.
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  recommendations: text("recommendations").array(),
  metrics: jsonb("metrics"), // Relevant financial metrics
  severity: varchar("severity", { length: 20 }), // info, warning, critical
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  comparisonPeriodStart: date("comparison_period_start"),
  comparisonPeriodEnd: date("comparison_period_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Types for Financial Reporting Module
export type FinancialStatementTemplate = typeof financialStatementTemplates.$inferSelect;
export type InsertFinancialStatementTemplate = typeof financialStatementTemplates.$inferInsert;

export type FinancialStatementSection = typeof financialStatementSections.$inferSelect;
export type InsertFinancialStatementSection = typeof financialStatementSections.$inferInsert;

export type FinancialStatementSectionAccount = typeof financialStatementSectionAccounts.$inferSelect;
export type InsertFinancialStatementSectionAccount = typeof financialStatementSectionAccounts.$inferInsert;

export type FinancialInsight = typeof financialInsights.$inferSelect;
export type InsertFinancialInsight = typeof financialInsights.$inferInsert;

// Export Commercial Module tables
export * from "./schema/commercial";

// Achievement badges schema
export const achievementBadges = pgTable("achievement_badges", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  icon: varchar("icon", { length: 50 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // productivity, quality, efficiency, collaboration
  maxLevel: integer("max_level").default(1).notNull(),
  thresholds: jsonb("thresholds").notNull(), // Array of point thresholds for each level
  colorClass: varchar("color_class", { length: 50 }).notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("achievement_badges_tenant_idx").on(table.tenantId),
}));

// User achievements schema
export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  badgeId: integer("badge_id").notNull().references(() => achievementBadges.id),
  currentLevel: integer("current_level").default(0).notNull(),
  progress: integer("progress").default(0).notNull(), // Percentage progress to next level
  pointsEarned: integer("points_earned").default(0).notNull(),
  unlocked: boolean("unlocked").default(false).notNull(),
  dateUnlocked: timestamp("date_unlocked"),
  dateLevelUp: timestamp("date_level_up"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    userBadgeUnique: unique().on(table.userId, table.badgeId, table.tenantId),
  }
});

// User performance metrics schema
export const userPerformanceMetrics = pgTable("user_performance_metrics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  metricType: varchar("metric_type", { length: 50 }).notNull(), // tasks_completed, quality_score, efficiency_rate, etc.
  value: integer("value").notNull(),
  date: timestamp("date").defaultNow().notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Achievement activity logs schema
export const achievementActivityLogs = pgTable("achievement_activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  badgeId: integer("badge_id").notNull().references(() => achievementBadges.id),
  activityType: varchar("activity_type", { length: 50 }).notNull(), // unlock, level_up, progress
  oldLevel: integer("old_level"),
  newLevel: integer("new_level"),
  oldProgress: integer("old_progress"),
  newProgress: integer("new_progress"),
  pointsAwarded: integer("points_awarded"),
  message: text("message"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Create insert schemas for achievement tables
export const insertAchievementBadgeSchema = createInsertSchema(achievementBadges).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserAchievementSchema = createInsertSchema(userAchievements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserPerformanceMetricSchema = createInsertSchema(userPerformanceMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAchievementActivityLogSchema = createInsertSchema(achievementActivityLogs).omit({
  id: true,
  createdAt: true,
});

// Create types for achievement tables
export type AchievementBadge = typeof achievementBadges.$inferSelect;
export type InsertAchievementBadge = z.infer<typeof insertAchievementBadgeSchema>;

export type UserAchievement = typeof userAchievements.$inferSelect;
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;

export type UserPerformanceMetric = typeof userPerformanceMetrics.$inferSelect;
export type InsertUserPerformanceMetric = z.infer<typeof insertUserPerformanceMetricSchema>;

export type AchievementActivityLog = typeof achievementActivityLogs.$inferSelect;
export type InsertAchievementActivityLog = z.infer<typeof insertAchievementActivityLogSchema>;

// ============================================================
// Report Files - Async PDF Generation Job Queue
// ============================================================

export const reportFiles = pgTable("report_files", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  reportId: integer("report_id"),
  jobId: varchar("job_id", { length: 255 }).notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  filePath: varchar("file_path", { length: 1000 }).notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }).default("application/pdf").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  errorMessage: text("error_message"),
  generatedBy: integer("generated_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertReportFileSchema = createInsertSchema(reportFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ReportFile = typeof reportFiles.$inferSelect;
export type InsertReportFile = z.infer<typeof insertReportFileSchema>;

// ============================================================
// Inventory / Manufacturing Module
// ============================================================

export const processingUnits = pgTable("processing_units", {
  id: serial("id").primaryKey(),
  unitCode: varchar("unit_code", { length: 20 }).notNull().unique(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  address: text("address"),
  contactPerson: varchar("contact_person", { length: 100 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  contactEmail: varchar("contact_email", { length: 100 }),
  country: varchar("country", { length: 50 }),
  capabilities: text("capabilities").array(),
  certifications: text("certifications").array(),
  averageLeadTime: integer("average_lead_time"),
  qualityRating: numeric("quality_rating"),
  processLossRate: numeric("process_loss_rate").default("0"),
  costPerUnit: numeric("cost_per_unit").default("0"),
  costCurrency: varchar("cost_currency", { length: 3 }).default("BDT"),
  capacity: numeric("capacity"),
  capacityUnit: varchar("capacity_unit", { length: 20 }),
  vendorId: integer("vendor_id").references(() => vendors.id),
  isInternal: boolean("is_internal").default(false),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  poNumber: varchar("po_number", { length: 30 }).notNull(),
  supplierId: integer("supplier_id").notNull().references(() => vendors.id),
  requisitionId: integer("requisition_id"),
  orderDate: date("order_date"),
  expectedDeliveryDate: date("expected_delivery_date"),
  currency: varchar("currency", { length: 3 }),
  exchangeRate: numeric("exchange_rate"),
  subtotal: numeric("subtotal"),
  taxAmount: numeric("tax_amount"),
  shippingCharges: numeric("shipping_charges"),
  totalAmount: numeric("total_amount"),
  // @deprecated Use workflowStatus instead. Will be removed after migration.
  status: varchar("status", { length: 30 }).default("draft"),
  workflowStatus: varchar("workflow_status", { length: 30 }).default("DRAFT"),
  workflowInstanceId: integer("workflow_instance_id").references(() => workflowInstances.id),
  paymentTerms: varchar("payment_terms", { length: 100 }),
  deliveryAddress: text("delivery_address"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  btbLcId: integer("btb_lc_id"),
  exportOrderId: integer("export_order_id"),
}, (table) => ({
  tenantPoNumberUnique: unique("purchase_orders_tenant_po_number_unique").on(table.tenantId, table.poNumber),
}));

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  poId: integer("po_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  quantity: numeric("quantity").notNull(),
  unitPrice: numeric("unit_price").notNull(),
  discountPercent: numeric("discount_percent"),
  taxPercent: numeric("tax_percent"),
  lineTotal: numeric("line_total").notNull(),
  receivedQuantity: numeric("received_quantity"),
  unitId: integer("unit_id"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("purchase_order_items_tenant_idx").on(table.tenantId),
}));

export const goodsReceivingNotes = pgTable("goods_receiving_notes", {
  id: serial("id").primaryKey(),
  grnNumber: varchar("grn_number", { length: 30 }).notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  receivingDate: date("receiving_date").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  invoiceNumber: varchar("invoice_number", { length: 50 }),
  invoiceDate: date("invoice_date"),
  invoiceAmount: numeric("invoice_amount"),
  challanNumber: varchar("challan_number", { length: 50 }),
  vehicleNumber: varchar("vehicle_number", { length: 30 }),
  transporterName: varchar("transporter_name", { length: 100 }),
  receivedBy: integer("received_by").notNull().references(() => users.id),
  inspectedBy: integer("inspected_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  qualityNotes: text("quality_notes"),
  workflowStatus: varchar("workflow_status", { length: 30 }).default("DRAFT"),
  workflowInstanceId: integer("workflow_instance_id").references(() => workflowInstances.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantGrnNumberUnique: unique("goods_receiving_notes_tenant_grn_number_unique").on(table.tenantId, table.grnNumber),
}));

export const grnItems = pgTable("grn_items", {
  id: serial("id").primaryKey(),
  grnId: integer("grn_id").notNull().references(() => goodsReceivingNotes.id, { onDelete: "cascade" }),
  purchaseOrderItemId: integer("purchase_order_item_id").references(() => purchaseOrderItems.id),
  itemId: integer("item_id").notNull().references(() => items.id),
  variantId: integer("variant_id").references(() => itemVariants.id),
  orderedQuantity: numeric("ordered_quantity"),
  receivedQuantity: numeric("received_quantity").notNull(),
  acceptedQuantity: numeric("accepted_quantity"),
  rejectedQuantity: numeric("rejected_quantity").default("0"),
  unitId: integer("unit_id").notNull().references(() => itemUnits.id),
  unitCost: numeric("unit_cost").notNull(),
  totalCost: numeric("total_cost").notNull(),
  batchNumber: varchar("batch_number", { length: 50 }),
  expiryDate: date("expiry_date"),
  qualityStatus: varchar("quality_status", { length: 30 }).default("pending"),
  qualityNotes: text("quality_notes"),
  locationCode: varchar("location_code", { length: 50 }),
  postedQuantity: numeric("posted_quantity").default("0"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("grn_items_tenant_idx").on(table.tenantId),
}));

export const manufacturingOrders = pgTable("manufacturing_orders", {
  id: serial("id").primaryKey(),
  moNumber: varchar("mo_number", { length: 30 }).notNull().unique(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  finishedItemId: integer("finished_item_id").notNull().references(() => items.id),
  finishedVariantId: integer("finished_variant_id").references(() => itemVariants.id),
  bomId: integer("bom_id").references(() => billOfMaterials.id),
  orderId: integer("order_id").references(() => orders.id),
  plannedQuantity: numeric("planned_quantity").notNull(),
  completedQuantity: numeric("completed_quantity").default("0"),
  rejectedQuantity: numeric("rejected_quantity").default("0"),
  unitId: integer("unit_id").notNull().references(() => itemUnits.id),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  priority: varchar("priority", { length: 20 }).default("normal"),
  plannedStartDate: date("planned_start_date"),
  plannedEndDate: date("planned_end_date"),
  actualStartDate: date("actual_start_date"),
  actualEndDate: date("actual_end_date"),
  currentStage: varchar("current_stage", { length: 50 }),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  totalMaterialCost: numeric("total_material_cost").default("0"),
  totalProcessingCost: numeric("total_processing_cost").default("0"),
  totalOverheadCost: numeric("total_overhead_cost").default("0"),
  totalCost: numeric("total_cost").default("0"),
  costPerUnit: numeric("cost_per_unit").default("0"),
  totalProcessLoss: numeric("total_process_loss").default("0"),
  processLossPercentage: numeric("process_loss_percentage").default("0"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("manufacturing_orders_tenant_idx").on(table.tenantId),
}));

export const manufacturingStages = pgTable("manufacturing_stages", {
  id: serial("id").primaryKey(),
  manufacturingOrderId: integer("manufacturing_order_id").notNull().references(() => manufacturingOrders.id, { onDelete: "cascade" }),
  stageNumber: integer("stage_number").notNull(),
  stageName: varchar("stage_name", { length: 50 }).notNull(),
  stageType: varchar("stage_type", { length: 30 }).notNull(),
  processingUnitId: integer("processing_unit_id").references(() => processingUnits.id),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  inputQuantity: numeric("input_quantity"),
  outputQuantity: numeric("output_quantity"),
  processLoss: numeric("process_loss").default("0"),
  processLossPercentage: numeric("process_loss_percentage").default("0"),
  expectedLossPercentage: numeric("expected_loss_percentage").default("0"),
  inputItemId: integer("input_item_id").references(() => items.id),
  outputItemId: integer("output_item_id").references(() => items.id),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  processingCost: numeric("processing_cost").default("0"),
  materialCost: numeric("material_cost").default("0"),
  overheadCost: numeric("overhead_cost").default("0"),
  totalStageCost: numeric("total_stage_cost").default("0"),
  plannedStartDate: date("planned_start_date"),
  plannedEndDate: date("planned_end_date"),
  actualStartDate: date("actual_start_date"),
  actualEndDate: date("actual_end_date"),
  gatePassOut: varchar("gate_pass_out", { length: 30 }),
  gatePassIn: varchar("gate_pass_in", { length: 30 }),
  challanNumber: varchar("challan_number", { length: 50 }),
  qualityCheckPassed: boolean("quality_check_passed"),
  qualityNotes: text("quality_notes"),
  notes: text("notes"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("manufacturing_stages_tenant_idx").on(table.tenantId),
}));

export const stageMaterials = pgTable("stage_materials", {
  id: serial("id").primaryKey(),
  stageId: integer("stage_id").notNull().references(() => manufacturingStages.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  variantId: integer("variant_id").references(() => itemVariants.id),
  type: varchar("type", { length: 20 }).notNull(),
  quantity: numeric("quantity").notNull(),
  unitId: integer("unit_id").notNull().references(() => itemUnits.id),
  unitCost: numeric("unit_cost").default("0"),
  totalCost: numeric("total_cost").default("0"),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  batchNumber: varchar("batch_number", { length: 50 }),
  notes: text("notes"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const qualityInspections = pgTable("quality_inspections", {
  id: serial("id").primaryKey(),
  inspectionNumber: varchar("inspection_number", { length: 30 }).notNull().unique(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sourceType: varchar("source_type", { length: 30 }).notNull(),
  sourceId: integer("source_id").notNull(),
  itemId: integer("item_id").notNull().references(() => items.id),
  variantId: integer("variant_id").references(() => itemVariants.id),
  inspectionDate: date("inspection_date").notNull(),
  inspectedBy: integer("inspected_by").notNull().references(() => users.id),
  sampleSize: numeric("sample_size"),
  totalQuantity: numeric("total_quantity").notNull(),
  passedQuantity: numeric("passed_quantity").default("0"),
  failedQuantity: numeric("failed_quantity").default("0"),
  result: varchar("result", { length: 20 }).notNull().default("pending"),
  defectTypes: text("defect_types").array(),
  defectDetails: jsonb("defect_details"),
  aqlLevel: varchar("aql_level", { length: 10 }),
  notes: text("notes"),
  images: text("images").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const inventoryInsights = pgTable("inventory_insights", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  insightType: varchar("insight_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  recommendations: text("recommendations").array(),
  metrics: jsonb("metrics"),
  severity: varchar("severity", { length: 20 }).default("info"),
  confidence: numeric("confidence"),
  relatedItemId: integer("related_item_id").references(() => items.id),
  relatedOrderId: integer("related_order_id").references(() => manufacturingOrders.id),
  isRead: boolean("is_read").default(false),
  isDismissed: boolean("is_dismissed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProcessingUnitSchema = createInsertSchema(processingUnits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({
  id: true,
  createdAt: true,
});

export const insertGoodsReceivingNoteSchema = createInsertSchema(goodsReceivingNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGrnItemSchema = createInsertSchema(grnItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertManufacturingOrderSchema = createInsertSchema(manufacturingOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertManufacturingStageSchema = createInsertSchema(manufacturingStages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStageMaterialSchema = createInsertSchema(stageMaterials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQualityInspectionSchema = createInsertSchema(qualityInspections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInventoryInsightSchema = createInsertSchema(inventoryInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProcessingUnit = typeof processingUnits.$inferSelect;
export type InsertProcessingUnit = z.infer<typeof insertProcessingUnitSchema>;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;

export type GoodsReceivingNote = typeof goodsReceivingNotes.$inferSelect;
export type InsertGoodsReceivingNote = z.infer<typeof insertGoodsReceivingNoteSchema>;

export type GrnItem = typeof grnItems.$inferSelect;
export type InsertGrnItem = z.infer<typeof insertGrnItemSchema>;

export type ManufacturingOrder = typeof manufacturingOrders.$inferSelect;
export type InsertManufacturingOrder = z.infer<typeof insertManufacturingOrderSchema>;

export type ManufacturingStage = typeof manufacturingStages.$inferSelect;
export type InsertManufacturingStage = z.infer<typeof insertManufacturingStageSchema>;

export type StageMaterial = typeof stageMaterials.$inferSelect;
export type InsertStageMaterial = z.infer<typeof insertStageMaterialSchema>;

export type QualityInspection = typeof qualityInspections.$inferSelect;
export type InsertQualityInspection = z.infer<typeof insertQualityInspectionSchema>;

export type InventoryInsight = typeof inventoryInsights.$inferSelect;
export type InsertInventoryInsight = z.infer<typeof insertInventoryInsightSchema>;

// ============================================================
// Settings Module - Roles, Permissions, and Tenant Settings
// ============================================================

// Insert schemas for settings module
export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantSettingsSchema = createInsertSchema(tenantSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserPermissionSchema = createInsertSchema(userPermissions).omit({
  id: true,
  createdAt: true,
});

// Settings module specific user schema
export const insertSettingsUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLogin: true,
}).extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleId: z.number().min(1, "Role is required"),
});

// Types for settings module
export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;

export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;

export const insertDesignationSchema = createInsertSchema(designations).omit({
  id: true,
  createdAt: true,
});
export type Designation = typeof designations.$inferSelect;
export type InsertDesignation = z.infer<typeof insertDesignationSchema>;

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;

export type TenantSettings = typeof tenantSettings.$inferSelect;
export type InsertTenantSettings = z.infer<typeof insertTenantSettingsSchema>;

export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;

// Note: User and InsertUser types are already defined above

// ============================================================
// Subscription Relations
// ============================================================

export const tenantRelations = relations(tenants, ({ one, many }) => ({
  subscription: one(subscriptions),
  users: many(users),
  departments: many(departments),
  settings: one(tenantSettings),
}));

export const subscriptionPlanRelations = relations(subscriptionPlans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionRelations = relations(subscriptions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [subscriptions.tenantId],
    references: [tenants.id],
  }),
}));

export const userRelations = relations(users, ({ one }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),
}));

// ============================================================
// Subscription Schemas
// ============================================================

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Registration schema for new tenant signup
export const tenantRegistrationSchema = z.object({
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  username: z.string().min(3, "Username must be at least 3 characters").regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().min(5, "Phone number is required"),
  companyAddress: z.string().optional(),
  country: z.string().optional(),
  businessType: z.enum(["manufacturer", "buying_house", "both"]).optional(),
  baseCurrency: z.enum(["BDT", "USD", "EUR", "GBP"]).optional(),
  fiscalYearStart: z.string().optional(),
  timeZone: z.string().optional(),
  planId: z.number().optional(),
});

// Login schema
export const loginSchema = z.object({
  companyCode: z.string().min(1, "Company code is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// ============================================================
// Admin Portal Tables
// ============================================================

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailVerificationTokenSchema = createInsertSchema(emailVerificationTokens).omit({ id: true, createdAt: true });
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true });
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role").notNull().default("support"), // super_admin, support, billing
  isActive: boolean("is_active").default(true).notNull(),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").references(() => users.id),
  assignedAdminId: integer("assigned_admin_id").references(() => adminUsers.id),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"), // open, in_progress, resolved, closed
  priority: text("priority").notNull().default("medium"), // low, medium, high, critical
  category: text("category").default("general"), // general, billing, technical, feature_request
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ticketComments = pgTable("ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => supportTickets.id),
  authorType: text("author_type").notNull(), // admin, user
  authorId: integer("author_id").notNull(),
  content: text("content").notNull(),
  isInternal: boolean("is_internal").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const billingRecords = pgTable("billing_records", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  planName: text("plan_name").notNull(),
  amount: integer("amount").notNull(), // in BDT paisa
  currency: text("currency").notNull().default("BDT"),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: text("status").notNull().default("pending"), // pending, paid, overdue, cancelled
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  invoiceNumber: text("invoice_number"),
  notes: text("notes"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("billing_records_tenant_idx").on(table.tenantId),
}));

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => adminUsers.id),
  action: text("action").notNull(),
  entityType: text("entity_type"), // tenant, subscription, user, ticket, billing
  entityId: integer("entity_id"),
  tenantId: integer("tenant_id").references(() => tenants.id),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Admin Portal Insert Schemas and Types
export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({ id: true, createdAt: true, updatedAt: true, lastLogin: true });
export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true, closedAt: true });
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;

export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({ id: true, createdAt: true });
export type TicketComment = typeof ticketComments.$inferSelect;
export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;

export const insertBillingRecordSchema = createInsertSchema(billingRecords).omit({ id: true, createdAt: true, updatedAt: true, paidAt: true });
export type BillingRecord = typeof billingRecords.$inferSelect;
export type InsertBillingRecord = z.infer<typeof insertBillingRecordSchema>;

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({ id: true, createdAt: true });
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;

export const adminLoginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password is required"),
});
export type AdminLoginCredentials = z.infer<typeof adminLoginSchema>;

// ============================================================
// Subscription Types
// ============================================================

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export type TenantRegistration = z.infer<typeof tenantRegistrationSchema>;
export type LoginCredentials = z.infer<typeof loginSchema>;

// ============================================================
// AI Chat Conversations & Messages
// ============================================================

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// ============================================================
// Budget System
// ============================================================

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  fiscalYearId: integer("fiscal_year_id").notNull(),
  name: text("budget_name").notNull(),
  description: text("description"),
  budgetType: text("budget_type").notNull().default("annual"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  tenantIdx: index("budgets_tenant_idx").on(table.tenantId),
}));

export const budgetItems = pgTable("budget_items", {
  id: serial("id").primaryKey(),
  budgetId: integer("budget_id").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull(),
  groupId: integer("group_id"),
  month1: numeric("month1", { precision: 15, scale: 2 }).default("0"),
  month2: numeric("month2", { precision: 15, scale: 2 }).default("0"),
  month3: numeric("month3", { precision: 15, scale: 2 }).default("0"),
  month4: numeric("month4", { precision: 15, scale: 2 }).default("0"),
  month5: numeric("month5", { precision: 15, scale: 2 }).default("0"),
  month6: numeric("month6", { precision: 15, scale: 2 }).default("0"),
  month7: numeric("month7", { precision: 15, scale: 2 }).default("0"),
  month8: numeric("month8", { precision: 15, scale: 2 }).default("0"),
  month9: numeric("month9", { precision: 15, scale: 2 }).default("0"),
  month10: numeric("month10", { precision: 15, scale: 2 }).default("0"),
  month11: numeric("month11", { precision: 15, scale: 2 }).default("0"),
  month12: numeric("month12", { precision: 15, scale: 2 }).default("0"),
  annualTotal: numeric("annual_total", { precision: 15, scale: 2 }).default("0"),
  tenantId: integer("tenant_id").notNull(),
}, (table) => ({
  tenantIdx: index("budget_items_tenant_idx").on(table.tenantId),
}));

export const insertBudgetSchema = createInsertSchema(budgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBudgetItemSchema = createInsertSchema(budgetItems).omit({
  id: true,
});

export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type BudgetItem = typeof budgetItems.$inferSelect;
export type InsertBudgetItem = z.infer<typeof insertBudgetItemSchema>;

export const erpPermissions = pgTable("erp_permissions", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  module: varchar("module", { length: 50 }).notNull(),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).default("document"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: integer("permission_id").notNull().references(() => erpPermissions.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  grantedBy: integer("granted_by").references(() => users.id),
}, (table) => ({
  rolePermUnique: unique().on(table.roleId, table.permissionId),
}));

export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  isPrimary: boolean("is_primary").default(false).notNull(),
  effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
  effectiveTo: timestamp("effective_to"),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  assignedBy: integer("assigned_by").references(() => users.id),
}, (table) => ({
  userRoleUnique: unique().on(table.userId, table.roleId),
}));

export const userAccessScopes = pgTable("user_access_scopes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scopeType: varchar("scope_type", { length: 50 }).notNull(),
  scopeValueId: integer("scope_value_id").notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userScopeUnique: unique().on(table.userId, table.scopeType, table.scopeValueId),
}));

export const roleAccessScopes = pgTable("role_access_scopes", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  scopeType: varchar("scope_type", { length: 50 }).notNull(),
  scopeValueId: integer("scope_value_id").notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  roleScopeUnique: unique().on(table.roleId, table.scopeType, table.scopeValueId),
}));

export const documentStatuses = pgTable("document_statuses", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 20 }).default("#808080"),
  sequence: integer("sequence").default(0).notNull(),
  isTerminal: boolean("is_terminal").default(false).notNull(),
  isEditable: boolean("is_editable").default(false).notNull(),
  isDeletable: boolean("is_deletable").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workflowTransitions = pgTable("workflow_transitions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  fromStatusCode: varchar("from_status_code", { length: 30 }),
  toStatusCode: varchar("to_status_code", { length: 30 }).notNull(),
  actionName: varchar("action_name", { length: 50 }).notNull(),
  requiredPermissionKey: varchar("required_permission_key", { length: 100 }),
  sodGroup: varchar("sod_group", { length: 50 }),
  isOptional: boolean("is_optional").default(false).notNull(),
  sequence: integer("sequence").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("workflow_transitions_tenant_idx").on(table.tenantId),
}));

export const approvalMatrix = pgTable("approval_matrix", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  minAmount: numeric("min_amount", { precision: 15, scale: 2 }).default("0").notNull(),
  maxAmount: numeric("max_amount", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  approvalLevel: integer("approval_level").notNull().default(1),
  ruleType: varchar("rule_type", { length: 20 }).default("ROLE").notNull(),
  requiredRoleId: integer("required_role_id").references(() => roles.id),
  requiredUserId: integer("required_user_id").references(() => users.id),
  requiredPermissionKey: varchar("required_permission_key", { length: 100 }),
  approvalMode: varchar("approval_mode", { length: 20 }).default("ANY_ONE").notNull(),
  requiredCount: integer("required_count").default(1).notNull(),
  scopeType: varchar("scope_type", { length: 50 }),
  scopeValueId: integer("scope_value_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("approval_matrix_tenant_idx").on(table.tenantId),
}));

export const sodRules = pgTable("sod_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  ruleName: varchar("rule_name", { length: 100 }).notNull(),
  conflictingActions: jsonb("conflicting_actions").notNull(),
  sodMode: varchar("sod_mode", { length: 20 }).default("STANDARD").notNull(),
  isStrict: boolean("is_strict").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("sod_rules_tenant_idx").on(table.tenantId),
}));

export const documentLocks = pgTable("document_locks", {
  id: serial("id").primaryKey(),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  docId: integer("doc_id").notNull(),
  lockedBy: integer("locked_by").notNull().references(() => users.id),
  lockToken: varchar("lock_token", { length: 100 }).notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lockReason: varchar("lock_reason", { length: 255 }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
}, (table) => ({
  docLockUnique: unique().on(table.docType, table.docId),
}));

export const documentWorkflowHistory = pgTable("document_workflow_history", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  docId: integer("doc_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  controlStep: varchar("control_step", { length: 30 }),
  fromStatus: varchar("from_status", { length: 30 }),
  toStatus: varchar("to_status", { length: 30 }).notNull(),
  performedBy: integer("performed_by").notNull().references(() => users.id),
  actorRoleId: integer("actor_role_id").references(() => roles.id),
  performedAt: timestamp("performed_at").defaultNow().notNull(),
  comments: text("comments"),
  reason: text("reason"),
  isOverride: boolean("is_override").default(false).notNull(),
  overrideReason: text("override_reason"),
  ipAddress: varchar("ip_address", { length: 50 }),
  amountAtAction: numeric("amount_at_action", { precision: 15, scale: 2 }),
  metadata: jsonb("metadata"),
  requestId: varchar("request_id", { length: 100 }),
});

export const documentVersions = pgTable("document_versions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  docId: integer("doc_id").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  parentVersionId: integer("parent_version_id").references(() => documentVersions.id),
  amendmentReason: text("amendment_reason"),
  snapshotData: jsonb("snapshot_data").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workflowDefinitions = pgTable("workflow_definitions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  version: integer("version").notNull().default(1),
  definitionJson: jsonb("definition_json").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantDocVersionUnique: unique().on(table.tenantId, table.docType, table.version),
}));

export const workflowInstances = pgTable("workflow_instances", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  docId: integer("doc_id").notNull(),
  workflowDefinitionId: integer("workflow_definition_id").notNull().references(() => workflowDefinitions.id),
  currentStatus: varchar("current_status", { length: 30 }).notNull().default("DRAFT"),
  currentOwnerRoleId: integer("current_owner_role_id").references(() => roles.id),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  tenantIdx: index("workflow_instances_tenant_idx").on(table.tenantId),
}));

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  action: varchar("action", { length: 30 }).notNull(),
  performedBy: integer("performed_by").notNull().references(() => users.id),
  performedAt: timestamp("performed_at").defaultNow().notNull(),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  diffJson: jsonb("diff_json"),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  requestId: varchar("request_id", { length: 100 }),
  metadata: jsonb("metadata"),
  visibility: varchar("visibility", { length: 30 }).default("all").notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, performedAt: true });
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export const insertErpPermissionSchema = createInsertSchema(erpPermissions).omit({ id: true, createdAt: true });
export type ErpPermission = typeof erpPermissions.$inferSelect;
export type InsertErpPermission = z.infer<typeof insertErpPermissionSchema>;

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ id: true, grantedAt: true });
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ id: true, assignedAt: true });
export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;

export const insertUserAccessScopeSchema = createInsertSchema(userAccessScopes).omit({ id: true, createdAt: true });
export type UserAccessScope = typeof userAccessScopes.$inferSelect;
export type InsertUserAccessScope = z.infer<typeof insertUserAccessScopeSchema>;

export const insertRoleAccessScopeSchema = createInsertSchema(roleAccessScopes).omit({ id: true, createdAt: true });
export type RoleAccessScope = typeof roleAccessScopes.$inferSelect;
export type InsertRoleAccessScope = z.infer<typeof insertRoleAccessScopeSchema>;

export const insertDocumentStatusSchema = createInsertSchema(documentStatuses).omit({ id: true, createdAt: true });
export type DocumentStatus = typeof documentStatuses.$inferSelect;
export type InsertDocumentStatus = z.infer<typeof insertDocumentStatusSchema>;

export const insertWorkflowTransitionSchema = createInsertSchema(workflowTransitions).omit({ id: true, createdAt: true });
export type WorkflowTransition = typeof workflowTransitions.$inferSelect;
export type InsertWorkflowTransition = z.infer<typeof insertWorkflowTransitionSchema>;

export const insertApprovalMatrixSchema = createInsertSchema(approvalMatrix).omit({ id: true, createdAt: true });
export type ApprovalMatrix = typeof approvalMatrix.$inferSelect;
export type InsertApprovalMatrix = z.infer<typeof insertApprovalMatrixSchema>;

export const insertSodRuleSchema = createInsertSchema(sodRules).omit({ id: true, createdAt: true });
export type SodRule = typeof sodRules.$inferSelect;
export type InsertSodRule = z.infer<typeof insertSodRuleSchema>;

export const insertDocumentLockSchema = createInsertSchema(documentLocks).omit({ id: true, lockedAt: true });
export type DocumentLock = typeof documentLocks.$inferSelect;
export type InsertDocumentLock = z.infer<typeof insertDocumentLockSchema>;

export const insertDocumentWorkflowHistorySchema = createInsertSchema(documentWorkflowHistory).omit({ id: true, performedAt: true });
export type DocumentWorkflowHistory = typeof documentWorkflowHistory.$inferSelect;
export type InsertDocumentWorkflowHistory = z.infer<typeof insertDocumentWorkflowHistorySchema>;

export const insertDocumentVersionSchema = createInsertSchema(documentVersions).omit({ id: true, createdAt: true });
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type InsertDocumentVersion = z.infer<typeof insertDocumentVersionSchema>;

export const insertWorkflowDefinitionSchema = createInsertSchema(workflowDefinitions).omit({ id: true, createdAt: true });
export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type InsertWorkflowDefinition = z.infer<typeof insertWorkflowDefinitionSchema>;

export const insertWorkflowInstanceSchema = createInsertSchema(workflowInstances).omit({ id: true, startedAt: true });
export type WorkflowInstance = typeof workflowInstances.$inferSelect;
export type InsertWorkflowInstance = z.infer<typeof insertWorkflowInstanceSchema>;

// ============================================================
// Party Master System (Tally-style unified party ledger)
// ============================================================

export const parties = pgTable("parties", {
  id: serial("id").primaryKey(),
  partyCode: varchar("party_code", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  partyType: varchar("party_type", { length: 20 }).notNull(),
  ledgerAccountId: integer("ledger_account_id").references(() => chartOfAccounts.id),
  customerId: integer("customer_id").references(() => customers.id),
  contactPerson: varchar("contact_person", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  creditPeriodDays: integer("credit_period_days").default(0),
  creditLimit: numeric("credit_limit", { precision: 15, scale: 2 }).default("0"),
  defaultPaymentTerms: varchar("default_payment_terms", { length: 100 }),
  groupLabel: varchar("group_label", { length: 100 }),
  taxId: varchar("tax_id", { length: 50 }),
  bankName: varchar("bank_name", { length: 255 }),
  bankAccountNumber: varchar("bank_account_number", { length: 50 }),
  bankBranch: varchar("bank_branch", { length: 255 }),
  bankRoutingNumber: varchar("bank_routing_number", { length: 20 }),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPartySchema = createInsertSchema(parties).omit({
  id: true,
  partyCode: true,
  createdAt: true,
  updatedAt: true,
});
export type Party = typeof parties.$inferSelect;
export type InsertParty = z.infer<typeof insertPartySchema>;

// ============================================================
// Bill-Wise Tracking System (Tally-style bill references)
// ============================================================

export const billReferences = pgTable("bill_references", {
  id: serial("id").primaryKey(),
  billNumber: varchar("bill_number", { length: 50 }).notNull(),
  billDate: date("bill_date").notNull(),
  dueDate: date("due_date"),
  billType: varchar("bill_type", { length: 20 }).notNull(),
  partyId: integer("party_id").notNull().references(() => parties.id),
  accountId: integer("account_id").notNull().references(() => chartOfAccounts.id),
  originalAmount: numeric("original_amount", { precision: 15, scale: 2 }).notNull(),
  pendingAmount: numeric("pending_amount", { precision: 15, scale: 2 }).notNull(),
  sourceVoucherId: integer("source_voucher_id").references(() => vouchers.id),
  sourceDocType: varchar("source_doc_type", { length: 50 }),
  sourceDocNumber: varchar("source_doc_number", { length: 50 }),
  status: varchar("status", { length: 20 }).default("OPEN").notNull(),
  creditPeriodDays: integer("credit_period_days"),
  isOverdue: boolean("is_overdue").default(false),
  notes: text("notes"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const billAllocations = pgTable("bill_allocations", {
  id: serial("id").primaryKey(),
  billReferenceId: integer("bill_reference_id").references(() => billReferences.id),
  voucherId: integer("voucher_id").notNull().references(() => vouchers.id),
  voucherItemId: integer("voucher_item_id").references(() => voucherItems.id),
  allocationType: varchar("allocation_type", { length: 20 }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  partyId: integer("party_id").notNull().references(() => parties.id),
  accountId: integer("account_id").notNull().references(() => chartOfAccounts.id),
  allocationDate: date("allocation_date").notNull(),
  notes: text("notes"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("bill_allocations_tenant_idx").on(table.tenantId),
}));

export const insertBillReferenceSchema = createInsertSchema(billReferences).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type BillReference = typeof billReferences.$inferSelect;
export type InsertBillReference = z.infer<typeof insertBillReferenceSchema>;

export const insertBillAllocationSchema = createInsertSchema(billAllocations).omit({
  id: true, createdAt: true,
});
export type BillAllocation = typeof billAllocations.$inferSelect;
export type InsertBillAllocation = z.infer<typeof insertBillAllocationSchema>;

// ============================================================
// Cost Center Categories (Tally-style cost categories for job costing)
// ============================================================

export const costCenterCategories = pgTable("cost_center_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true).notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const costCenterBudgets = pgTable("cost_center_budgets", {
  id: serial("id").primaryKey(),
  costCenterId: integer("cost_center_id").notNull(),
  categoryId: integer("category_id").notNull().references(() => costCenterCategories.id),
  description: varchar("description", { length: 255 }),
  plannedQuantity: numeric("planned_quantity", { precision: 15, scale: 4 }),
  plannedRate: numeric("planned_rate", { precision: 15, scale: 4 }),
  plannedAmount: numeric("planned_amount", { precision: 15, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 50 }),
  notes: text("notes"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCostCenterCategorySchema = createInsertSchema(costCenterCategories).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CostCenterCategory = typeof costCenterCategories.$inferSelect;
export type InsertCostCenterCategory = z.infer<typeof insertCostCenterCategorySchema>;

export const insertCostCenterBudgetSchema = createInsertSchema(costCenterBudgets).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CostCenterBudget = typeof costCenterBudgets.$inferSelect;
export type InsertCostCenterBudget = z.infer<typeof insertCostCenterBudgetSchema>;

// ============================================================
// Delivery Challan System
// ============================================================

export const deliveryChallans = pgTable("delivery_challans", {
  id: serial("id").primaryKey(),
  challanNumber: varchar("challan_number", { length: 50 }).notNull(),
  challanDate: date("challan_date").notNull(),
  partyId: integer("party_id").references(() => parties.id),
  customerId: integer("customer_id").references(() => customers.id),
  orderId: integer("order_id").references(() => orders.id),
  warehouseId: integer("warehouse_id"),
  vehicleNumber: varchar("vehicle_number", { length: 50 }),
  driverName: varchar("driver_name", { length: 255 }),
  driverContact: varchar("driver_contact", { length: 50 }),
  transporterName: varchar("transporter_name", { length: 255 }),
  deliveryAddress: text("delivery_address"),
  receiverName: varchar("receiver_name", { length: 255 }),
  receiverContact: varchar("receiver_contact", { length: 50 }),
  totalQuantity: numeric("total_quantity", { precision: 15, scale: 4 }),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  workflowStatus: varchar("workflow_status", { length: 30 }).default("DRAFT"),
  workflowInstanceId: integer("workflow_instance_id"),
  isPosted: boolean("is_posted").default(false),
  postedById: integer("posted_by_id").references(() => users.id),
  postedAt: timestamp("posted_at"),
  invoiceVoucherId: integer("invoice_voucher_id").references(() => vouchers.id),
  invoiceCreated: boolean("invoice_created").default(false),
  notes: text("notes"),
  specialInstructions: text("special_instructions"),
  sourceDocType: varchar("source_doc_type", { length: 30 }),
  sourceDocId: integer("source_doc_id"),
  isManuallyModified: boolean("is_manually_modified").default(false),
  verificationCode: varchar("verification_code", { length: 64 }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantChallanNumberUnique: unique("delivery_challans_tenant_challan_number_unique").on(table.tenantId, table.challanNumber),
}));

export const deliveryChallanItems = pgTable("delivery_challan_items", {
  id: serial("id").primaryKey(),
  challanId: integer("challan_id").notNull().references(() => deliveryChallans.id, { onDelete: "cascade" }),
  itemId: integer("item_id"),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  itemCode: varchar("item_code", { length: 50 }),
  description: text("description"),
  quantity: numeric("quantity", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 50 }),
  rate: numeric("rate", { precision: 15, scale: 4 }),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  batchNumber: varchar("batch_number", { length: 50 }),
  color: varchar("color", { length: 50 }),
  size: varchar("size", { length: 50 }),
  remarks: text("remarks"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("delivery_challan_items_tenant_idx").on(table.tenantId),
}));

export const insertDeliveryChallanSchema = createInsertSchema(deliveryChallans).omit({
  id: true, challanNumber: true, createdAt: true, updatedAt: true, isPosted: true, postedById: true, postedAt: true, invoiceCreated: true, invoiceVoucherId: true,
});
export type DeliveryChallan = typeof deliveryChallans.$inferSelect;
export type InsertDeliveryChallan = z.infer<typeof insertDeliveryChallanSchema>;

export const insertDeliveryChallanItemSchema = createInsertSchema(deliveryChallanItems).omit({
  id: true, createdAt: true,
});
export type DeliveryChallanItem = typeof deliveryChallanItems.$inferSelect;
export type InsertDeliveryChallanItem = z.infer<typeof insertDeliveryChallanItemSchema>;

// ============================================================
// Enhanced Gate Pass System (Security Control Document)
// ============================================================

export const enhancedGatePasses = pgTable("enhanced_gate_passes", {
  id: serial("id").primaryKey(),
  gatePassNumber: varchar("gate_pass_number", { length: 50 }).notNull(),
  gatePassDate: date("gate_pass_date").notNull(),
  gatePassType: varchar("gate_pass_type", { length: 10 }).notNull(),
  partyId: integer("party_id").references(() => parties.id),
  partyName: varchar("party_name", { length: 255 }),
  deliveryChallanId: integer("delivery_challan_id").references(() => deliveryChallans.id),
  grnId: integer("grn_id"),
  purchaseOrderId: integer("purchase_order_id"),
  orderId: integer("order_id").references(() => orders.id),
  warehouseId: integer("warehouse_id"),
  vehicleNumber: varchar("vehicle_number", { length: 50 }),
  vehicleType: varchar("vehicle_type", { length: 50 }),
  driverName: varchar("driver_name", { length: 255 }),
  driverContact: varchar("driver_contact", { length: 50 }),
  driverLicense: varchar("driver_license", { length: 50 }),
  transporterName: varchar("transporter_name", { length: 255 }),
  securityGuardName: varchar("security_guard_name", { length: 255 }),
  securityCheckpoint: varchar("security_checkpoint", { length: 100 }),
  guardAcknowledged: boolean("guard_acknowledged").default(false),
  guardAcknowledgedAt: timestamp("guard_acknowledged_at"),
  entryTime: timestamp("entry_time"),
  exitTime: timestamp("exit_time"),
  workflowStatus: varchar("workflow_status", { length: 30 }).default("DRAFT"),
  workflowInstanceId: integer("workflow_instance_id"),
  totalItems: integer("total_items").default(0),
  totalQuantity: numeric("total_quantity", { precision: 15, scale: 4 }),
  purpose: text("purpose"),
  notes: text("notes"),
  remarks: text("remarks"),
  linkedDocType: varchar("linked_doc_type", { length: 30 }),
  linkedDocId: integer("linked_doc_id"),
  verificationCode: varchar("verification_code", { length: 64 }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdBy: integer("created_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const enhancedGatePassItems = pgTable("enhanced_gate_pass_items", {
  id: serial("id").primaryKey(),
  gatePassId: integer("gate_pass_id").notNull().references(() => enhancedGatePasses.id, { onDelete: "cascade" }),
  itemId: integer("item_id"),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  itemCode: varchar("item_code", { length: 50 }),
  description: text("description"),
  quantity: numeric("quantity", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 50 }),
  weight: numeric("weight", { precision: 15, scale: 4 }),
  batchNumber: varchar("batch_number", { length: 50 }),
  condition: varchar("condition", { length: 50 }).default("good"),
  remarks: text("remarks"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("enhanced_gate_pass_items_tenant_idx").on(table.tenantId),
}));

export const insertEnhancedGatePassSchema = createInsertSchema(enhancedGatePasses).omit({
  id: true, gatePassNumber: true, createdAt: true, updatedAt: true, guardAcknowledged: true, guardAcknowledgedAt: true,
});
export type EnhancedGatePass = typeof enhancedGatePasses.$inferSelect;
export type InsertEnhancedGatePass = z.infer<typeof insertEnhancedGatePassSchema>;

export const insertEnhancedGatePassItemSchema = createInsertSchema(enhancedGatePassItems).omit({
  id: true, createdAt: true,
});
export type EnhancedGatePassItem = typeof enhancedGatePassItems.$inferSelect;
export type InsertEnhancedGatePassItem = z.infer<typeof insertEnhancedGatePassItemSchema>;

// ============================================================
// Stock Ledger - Single source of truth for inventory tracking
// ============================================================
export const stockLedger = pgTable("stock_ledger", {
  id: serial("id").primaryKey(),
  docType: varchar("doc_type", { length: 30 }).notNull(),
  docId: integer("doc_id").notNull(),
  docNumber: varchar("doc_number", { length: 50 }),
  postingDate: date("posting_date").notNull(),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemCode: varchar("item_code", { length: 50 }),
  itemName: varchar("item_name", { length: 255 }),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  warehouseName: varchar("warehouse_name", { length: 255 }),
  qtyIn: numeric("qty_in", { precision: 15, scale: 4 }).default("0").notNull(),
  qtyOut: numeric("qty_out", { precision: 15, scale: 4 }).default("0").notNull(),
  balanceQty: numeric("balance_qty", { precision: 15, scale: 4 }).default("0").notNull(),
  rate: numeric("rate", { precision: 15, scale: 4 }).default("0"),
  valuationRate: numeric("valuation_rate", { precision: 15, scale: 4 }).default("0"),
  valueIn: numeric("value_in", { precision: 15, scale: 2 }).default("0"),
  valueOut: numeric("value_out", { precision: 15, scale: 2 }).default("0"),
  balanceValue: numeric("balance_value", { precision: 15, scale: 2 }).default("0"),
  unit: varchar("unit", { length: 50 }),
  batchNumber: varchar("batch_number", { length: 50 }),
  partyId: integer("party_id").references(() => parties.id),
  partyName: varchar("party_name", { length: 255 }),
  remarks: text("remarks"),
  isReversed: boolean("is_reversed").default(false),
  reversedById: integer("reversed_by_id"),
  accountingVoucherId: integer("accounting_voucher_id").references(() => vouchers.id),
  postingStatus: varchar("posting_status", { length: 20 }).default("PENDING_POSTING").notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("stock_ledger_tenant_idx").on(table.tenantId),
  tenantItemWarehouseDateIdx: index("stock_ledger_tenant_item_wh_date_idx").on(table.tenantId, table.itemId, table.warehouseId, table.postingDate),
  tenantPostingStatusIdx: index("stock_ledger_tenant_posting_status_idx").on(table.tenantId, table.postingStatus),
}));

export const insertStockLedgerSchema = createInsertSchema(stockLedger).omit({
  id: true, createdAt: true, balanceQty: true, balanceValue: true,
});
export type StockLedgerEntry = typeof stockLedger.$inferSelect;
export type InsertStockLedgerEntry = z.infer<typeof insertStockLedgerSchema>;

// Stock Adjustments - for manual corrections, write-offs, etc.
export const stockAdjustments = pgTable("stock_adjustments", {
  id: serial("id").primaryKey(),
  adjustmentNumber: varchar("adjustment_number", { length: 50 }).notNull(),
  adjustmentDate: date("adjustment_date").notNull(),
  adjustmentType: varchar("adjustment_type", { length: 30 }).notNull(),
  warehouseId: integer("warehouse_id"),
  reason: text("reason"),
  workflowStatus: varchar("workflow_status", { length: 30 }).default("DRAFT"),
  notes: text("notes"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdBy: integer("created_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("stock_adjustments_tenant_idx").on(table.tenantId),
}));

export const stockAdjustmentItems = pgTable("stock_adjustment_items", {
  id: serial("id").primaryKey(),
  adjustmentId: integer("adjustment_id").notNull().references(() => stockAdjustments.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemCode: varchar("item_code", { length: 50 }),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  currentQty: numeric("current_qty", { precision: 15, scale: 4 }).default("0"),
  adjustedQty: numeric("adjusted_qty", { precision: 15, scale: 4 }).notNull(),
  differenceQty: numeric("difference_qty", { precision: 15, scale: 4 }).notNull(),
  rate: numeric("rate", { precision: 15, scale: 4 }).default("0"),
  value: numeric("value", { precision: 15, scale: 2 }).default("0"),
  unit: varchar("unit", { length: 50 }),
  reason: text("reason"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("stock_adjustment_items_tenant_idx").on(table.tenantId),
}));

export const insertStockAdjustmentSchema = createInsertSchema(stockAdjustments).omit({
  id: true, adjustmentNumber: true, createdAt: true, updatedAt: true,
});
export type StockAdjustment = typeof stockAdjustments.$inferSelect;
export type InsertStockAdjustment = z.infer<typeof insertStockAdjustmentSchema>;

export const insertStockAdjustmentItemSchema = createInsertSchema(stockAdjustmentItems).omit({
  id: true, createdAt: true,
});
export type StockAdjustmentItem = typeof stockAdjustmentItems.$inferSelect;
export type InsertStockAdjustmentItem = z.infer<typeof insertStockAdjustmentItemSchema>;

// ============================================================
// Tenant Inventory Config — Maps inventory asset accounts per tenant
// ============================================================
export const tenantInventoryConfig = pgTable("tenant_inventory_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  inventoryAssetAccountId: integer("inventory_asset_account_id").references(() => chartOfAccounts.id),
  cogsAccountId: integer("cogs_account_id").references(() => chartOfAccounts.id),
  stockReceivedNotBilledAccountId: integer("stock_received_not_billed_account_id").references(() => chartOfAccounts.id),
  valuationMethod: varchar("valuation_method", { length: 20 }).default("WEIGHTED_AVERAGE").notNull(),
  allowNegativeStock: boolean("allow_negative_stock").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantUnique: unique("tenant_inventory_config_tenant_unique").on(table.tenantId),
}));

export const insertTenantInventoryConfigSchema = createInsertSchema(tenantInventoryConfig).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type TenantInventoryConfig = typeof tenantInventoryConfig.$inferSelect;
export type InsertTenantInventoryConfig = z.infer<typeof insertTenantInventoryConfigSchema>;

// ============================================================
// Order BOM Snapshots — Immutable frozen BOM at Sales Order finalization
// ============================================================
export const orderBomSnapshots = pgTable("order_bom_snapshots", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  snapshotVersion: integer("snapshot_version").notNull().default(1),
  isLocked: boolean("is_locked").default(true).notNull(),
  lockedAt: timestamp("locked_at"),
  lockedBy: integer("locked_by").references(() => users.id),
  totalEstimatedCost: numeric("total_estimated_cost", { precision: 15, scale: 2 }).default("0"),
  notes: text("notes"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderBomSnapshotItems = pgTable("order_bom_snapshot_items", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id").notNull().references(() => orderBomSnapshots.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemCode: varchar("item_code", { length: 50 }),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  materialType: varchar("material_type", { length: 50 }).notNull(),
  requiredQty: numeric("required_qty", { precision: 15, scale: 4 }).notNull(),
  wastagePercent: numeric("wastage_percent", { precision: 5, scale: 2 }).default("0"),
  totalRequiredQty: numeric("total_required_qty", { precision: 15, scale: 4 }).notNull(),
  unitId: integer("unit_id").references(() => itemUnits.id),
  unitName: varchar("unit_name", { length: 50 }),
  estimatedRate: numeric("estimated_rate", { precision: 15, scale: 4 }).default("0"),
  estimatedCost: numeric("estimated_cost", { precision: 15, scale: 2 }).default("0"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderBomSnapshotSchema = createInsertSchema(orderBomSnapshots).omit({
  id: true, createdAt: true,
});
export type OrderBomSnapshot = typeof orderBomSnapshots.$inferSelect;
export type InsertOrderBomSnapshot = z.infer<typeof insertOrderBomSnapshotSchema>;

export const insertOrderBomSnapshotItemSchema = createInsertSchema(orderBomSnapshotItems).omit({
  id: true, createdAt: true,
});
export type OrderBomSnapshotItem = typeof orderBomSnapshotItems.$inferSelect;
export type InsertOrderBomSnapshotItem = z.infer<typeof insertOrderBomSnapshotItemSchema>;

// ============================================================
// Material Reservations — Order-wise committed stock
// ============================================================
export const materialReservations = pgTable("material_reservations", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  snapshotId: integer("snapshot_id").references(() => orderBomSnapshots.id),
  itemId: integer("item_id").notNull().references(() => items.id),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  reservedQty: numeric("reserved_qty", { precision: 15, scale: 4 }).notNull().default("0"),
  issuedQty: numeric("issued_qty", { precision: 15, scale: 4 }).notNull().default("0"),
  remainingQty: numeric("remaining_qty", { precision: 15, scale: 4 }).notNull().default("0"),
  unitId: integer("unit_id").references(() => itemUnits.id),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMaterialReservationSchema = createInsertSchema(materialReservations).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type MaterialReservation = typeof materialReservations.$inferSelect;
export type InsertMaterialReservation = z.infer<typeof insertMaterialReservationSchema>;

// ============================================================
// Consumption Change Requests — Top management approval for BOM changes
// ============================================================
export const consumptionChangeRequests = pgTable("consumption_change_requests", {
  id: serial("id").primaryKey(),
  crNumber: varchar("cr_number", { length: 50 }).notNull(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  snapshotId: integer("snapshot_id").references(() => orderBomSnapshots.id),
  reason: text("reason").notNull(),
  changeType: varchar("change_type", { length: 30 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  requestedBy: integer("requested_by").notNull().references(() => users.id),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedBy: integer("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("consumption_change_requests_tenant_idx").on(table.tenantId),
}));

export const consumptionChangeItems = pgTable("consumption_change_items", {
  id: serial("id").primaryKey(),
  changeRequestId: integer("change_request_id").notNull().references(() => consumptionChangeRequests.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  previousQty: numeric("previous_qty", { precision: 15, scale: 4 }).notNull(),
  newQty: numeric("new_qty", { precision: 15, scale: 4 }).notNull(),
  deltaQty: numeric("delta_qty", { precision: 15, scale: 4 }).notNull(),
  unitName: varchar("unit_name", { length: 50 }),
  reason: text("reason"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("consumption_change_items_tenant_idx").on(table.tenantId),
}));

export const insertConsumptionChangeRequestSchema = createInsertSchema(consumptionChangeRequests).omit({
  id: true, crNumber: true, createdAt: true, updatedAt: true, requestedAt: true,
});
export type ConsumptionChangeRequest = typeof consumptionChangeRequests.$inferSelect;
export type InsertConsumptionChangeRequest = z.infer<typeof insertConsumptionChangeRequestSchema>;

export const insertConsumptionChangeItemSchema = createInsertSchema(consumptionChangeItems).omit({
  id: true, createdAt: true,
});
export type ConsumptionChangeItem = typeof consumptionChangeItems.$inferSelect;
export type InsertConsumptionChangeItem = z.infer<typeof insertConsumptionChangeItemSchema>;

// ============================================================
// Process Orders — Material Conversion (Yarn→Greige→Finished Fabric)
// ============================================================
export const processOrders = pgTable("process_orders", {
  id: serial("id").primaryKey(),
  processNumber: varchar("process_number", { length: 50 }).notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  processType: varchar("process_type", { length: 30 }).notNull(),
  processMethod: varchar("process_method", { length: 20 }).notNull().default("in_house"),
  orderId: integer("order_id").references(() => orders.id),
  vendorId: integer("vendor_id").references(() => vendors.id),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  inputItemId: integer("input_item_id").notNull().references(() => items.id),
  inputItemName: varchar("input_item_name", { length: 255 }).notNull(),
  inputQty: numeric("input_qty", { precision: 15, scale: 4 }).notNull(),
  inputUnitId: integer("input_unit_id").references(() => itemUnits.id),
  inputRate: numeric("input_rate", { precision: 15, scale: 4 }).default("0"),
  outputItemId: integer("output_item_id").notNull().references(() => items.id),
  outputItemName: varchar("output_item_name", { length: 255 }).notNull(),
  expectedOutputQty: numeric("expected_output_qty", { precision: 15, scale: 4 }).notNull(),
  actualOutputQty: numeric("actual_output_qty", { precision: 15, scale: 4 }).default("0"),
  outputUnitId: integer("output_unit_id").references(() => itemUnits.id),
  expectedWastagePercent: numeric("expected_wastage_percent", { precision: 5, scale: 2 }).default("0"),
  actualWastagePercent: numeric("actual_wastage_percent", { precision: 5, scale: 2 }).default("0"),
  processLossQty: numeric("process_loss_qty", { precision: 15, scale: 4 }).default("0"),
  processingCharges: numeric("processing_charges", { precision: 15, scale: 2 }).default("0"),
  outputRate: numeric("output_rate", { precision: 15, scale: 4 }).default("0"),
  totalInputValue: numeric("total_input_value", { precision: 15, scale: 2 }).default("0"),
  totalOutputValue: numeric("total_output_value", { precision: 15, scale: 2 }).default("0"),
  processLossValue: numeric("process_loss_value", { precision: 15, scale: 2 }).default("0"),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  issuedAt: timestamp("issued_at"),
  issuedBy: integer("issued_by").references(() => users.id),
  receivedAt: timestamp("received_at"),
  receivedBy: integer("received_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  remarks: text("remarks"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProcessOrderSchema = createInsertSchema(processOrders).omit({
  id: true, processNumber: true, createdAt: true, updatedAt: true,
});
export type ProcessOrder = typeof processOrders.$inferSelect;
export type InsertProcessOrder = z.infer<typeof insertProcessOrderSchema>;

// ============================================================
// Warehouse Transfers — Formal inter-warehouse stock transfers
// ============================================================
export const warehouseTransfers = pgTable("warehouse_transfers", {
  id: serial("id").primaryKey(),
  transferNumber: varchar("transfer_number", { length: 50 }).notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sourceWarehouseId: integer("source_warehouse_id").notNull().references(() => warehouses.id),
  destinationWarehouseId: integer("destination_warehouse_id").notNull().references(() => warehouses.id),
  transferDate: date("transfer_date").notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  shippedAt: timestamp("shipped_at"),
  receivedAt: timestamp("received_at"),
  receivedBy: integer("received_by").references(() => users.id),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("warehouse_transfers_tenant_idx").on(table.tenantId),
  tenantTransferNumberUnique: unique("warehouse_transfers_tenant_transfer_number_unique").on(table.tenantId, table.transferNumber),
}));

export const warehouseTransferItems = pgTable("warehouse_transfer_items", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").notNull().references(() => warehouseTransfers.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemCode: varchar("item_code", { length: 50 }),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  transferQty: numeric("transfer_qty", { precision: 15, scale: 4 }).notNull(),
  receivedQty: numeric("received_qty", { precision: 15, scale: 4 }).default("0"),
  unitId: integer("unit_id").references(() => itemUnits.id),
  unitName: varchar("unit_name", { length: 50 }),
  rate: numeric("rate", { precision: 15, scale: 4 }).default("0"),
  value: numeric("value", { precision: 15, scale: 2 }).default("0"),
  remarks: text("remarks"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("warehouse_transfer_items_tenant_idx").on(table.tenantId),
}));

// Idempotency Keys table - for idempotent API operations
export const idempotencyKeys = pgTable("idempotency_keys", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  requestId: varchar("request_id", { length: 255 }).notNull(),
  operationType: varchar("operation_type", { length: 100 }).notNull(),
  operationId: varchar("operation_id", { length: 255 }),
  statusCode: integer("status_code").notNull(),
  responseBody: jsonb("response_body"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => {
  return {
    tenantRequestUnq: unique().on(table.tenantId, table.requestId, table.operationType),
    expiresIdx: index("idx_idempotency_keys_expires").on(table.expiresAt),
  };
});

export const insertIdempotencyKeySchema = createInsertSchema(idempotencyKeys).omit({ id: true, createdAt: true });
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type InsertIdempotencyKey = z.infer<typeof insertIdempotencyKeySchema>;

export const insertWarehouseTransferSchema = createInsertSchema(warehouseTransfers).omit({
  id: true, transferNumber: true, createdAt: true, updatedAt: true,
});
export type WarehouseTransfer = typeof warehouseTransfers.$inferSelect;
export type InsertWarehouseTransfer = z.infer<typeof insertWarehouseTransferSchema>;

export const insertWarehouseTransferItemSchema = createInsertSchema(warehouseTransferItems).omit({
  id: true, createdAt: true,
});
export type WarehouseTransferItem = typeof warehouseTransferItems.$inferSelect;
export type InsertWarehouseTransferItem = z.infer<typeof insertWarehouseTransferItemSchema>;

// ============================================================
// Phase 4.1 — Production Transformation
// ============================================================

export const productionOrders = pgTable("production_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  orderNumber: varchar("order_number", { length: 50 }).notNull(),
  processType: varchar("process_type", { length: 30 }).notNull(),
  processMethod: varchar("process_method", { length: 20 }).notNull().default("IN_HOUSE"),
  inputItemId: integer("input_item_id").notNull().references(() => items.id),
  inputItemName: varchar("input_item_name", { length: 255 }).notNull(),
  outputItemId: integer("output_item_id").notNull().references(() => items.id),
  outputItemName: varchar("output_item_name", { length: 255 }).notNull(),
  plannedInputQty: numeric("planned_input_qty", { precision: 15, scale: 4 }).notNull(),
  plannedOutputQty: numeric("planned_output_qty", { precision: 15, scale: 4 }).notNull(),
  actualInputQty: numeric("actual_input_qty", { precision: 15, scale: 4 }).default("0"),
  actualOutputQty: numeric("actual_output_qty", { precision: 15, scale: 4 }).default("0"),
  wastageQty: numeric("wastage_qty", { precision: 15, scale: 4 }).default("0"),
  wastagePct: numeric("wastage_pct", { precision: 5, scale: 2 }).default("0"),
  warehouseFromId: integer("warehouse_from_id").references(() => warehouses.id),
  warehouseToId: integer("warehouse_to_id").references(() => warehouses.id),
  subcontractorPartyId: integer("subcontractor_party_id").references(() => parties.id),
  processCost: numeric("process_cost", { precision: 15, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  orderId: integer("order_id").references(() => orders.id),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  startedAt: timestamp("started_at"),
  startedBy: integer("started_by").references(() => users.id),
  completedAt: timestamp("completed_at"),
  completedBy: integer("completed_by").references(() => users.id),
  accountingVoucherId: integer("accounting_voucher_id").references(() => vouchers.id),
  overrideReason: text("override_reason"),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("production_orders_tenant_idx").on(table.tenantId),
  tenantOrderNumberUnique: unique("production_orders_tenant_order_number_unique").on(table.tenantId, table.orderNumber),
}));

export const insertProductionOrderSchema = createInsertSchema(productionOrders).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type InsertProductionOrder = z.infer<typeof insertProductionOrderSchema>;

export const productionConsumptions = pgTable("production_consumptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  productionOrderId: integer("production_order_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  qty: numeric("qty", { precision: 15, scale: 4 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 15, scale: 4 }).default("0"),
  totalCost: numeric("total_cost", { precision: 15, scale: 2 }).default("0"),
  stockMoveId: integer("stock_move_id").references(() => stockLedger.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("production_consumptions_tenant_idx").on(table.tenantId),
}));

export const insertProductionConsumptionSchema = createInsertSchema(productionConsumptions).omit({
  id: true, createdAt: true,
});
export type ProductionConsumption = typeof productionConsumptions.$inferSelect;
export type InsertProductionConsumption = z.infer<typeof insertProductionConsumptionSchema>;

export const productionOutputs = pgTable("production_outputs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  productionOrderId: integer("production_order_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  qty: numeric("qty", { precision: 15, scale: 4 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 15, scale: 4 }).default("0"),
  totalCost: numeric("total_cost", { precision: 15, scale: 2 }).default("0"),
  stockMoveId: integer("stock_move_id").references(() => stockLedger.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("production_outputs_tenant_idx").on(table.tenantId),
}));

export const insertProductionOutputSchema = createInsertSchema(productionOutputs).omit({
  id: true, createdAt: true,
});
export type ProductionOutput = typeof productionOutputs.$inferSelect;
export type InsertProductionOutput = z.infer<typeof insertProductionOutputSchema>;

export const productionAccountingConfig = pgTable("production_accounting_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  wipAccountId: integer("wip_account_id").references(() => chartOfAccounts.id),
  productionExpenseAccountId: integer("production_expense_account_id").references(() => chartOfAccounts.id),
  subcontractPayableAccountId: integer("subcontract_payable_account_id").references(() => chartOfAccounts.id),
  finishedGoodsAccountId: integer("finished_goods_account_id").references(() => chartOfAccounts.id),
  rawMaterialAccountId: integer("raw_material_account_id").references(() => chartOfAccounts.id),
  processLossAccountId: integer("process_loss_account_id").references(() => chartOfAccounts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantUnique: unique("production_accounting_config_tenant_unique").on(table.tenantId),
}));

export const insertProductionAccountingConfigSchema = createInsertSchema(productionAccountingConfig).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ProductionAccountingConfig = typeof productionAccountingConfig.$inferSelect;
export type InsertProductionAccountingConfig = z.infer<typeof insertProductionAccountingConfigSchema>;

// ============================================================
// Phase 4.2 — Subcontract + Commercial + Logistics
// ============================================================

export const subcontractJobs = pgTable("subcontract_jobs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  jobNumber: varchar("job_number", { length: 50 }).notNull(),
  jobType: varchar("job_type", { length: 30 }).notNull(),
  partyId: integer("party_id").notNull().references(() => parties.id),
  sourceDocType: varchar("source_doc_type", { length: 30 }),
  sourceDocId: integer("source_doc_id"),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  plannedQty: numeric("planned_qty", { precision: 15, scale: 4 }).notNull(),
  sentQty: numeric("sent_qty", { precision: 15, scale: 4 }).default("0"),
  receivedQty: numeric("received_qty", { precision: 15, scale: 4 }).default("0"),
  rejectedQty: numeric("rejected_qty", { precision: 15, scale: 4 }).default("0"),
  rate: numeric("rate", { precision: 15, scale: 4 }).default("0"),
  amount: numeric("amount", { precision: 15, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  dueDate: date("due_date"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  overrideReason: text("override_reason"),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("subcontract_jobs_tenant_idx").on(table.tenantId),
  tenantJobNumberUnique: unique("subcontract_jobs_tenant_job_number_unique").on(table.tenantId, table.jobNumber),
}));

export const insertSubcontractJobSchema = createInsertSchema(subcontractJobs).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SubcontractJob = typeof subcontractJobs.$inferSelect;
export type InsertSubcontractJob = z.infer<typeof insertSubcontractJobSchema>;

export const subcontractChallans = pgTable("subcontract_challans", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  challanNumber: varchar("challan_number", { length: 50 }).notNull(),
  subcontractJobId: integer("subcontract_job_id").notNull().references(() => subcontractJobs.id),
  direction: varchar("direction", { length: 10 }).notNull(),
  challanDate: date("challan_date").notNull(),
  warehouseFromId: integer("warehouse_from_id").references(() => warehouses.id),
  warehouseToId: integer("warehouse_to_id").references(() => warehouses.id),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  postedAt: timestamp("posted_at"),
  postedBy: integer("posted_by").references(() => users.id),
  requestId: varchar("request_id", { length: 100 }),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("subcontract_challans_tenant_idx").on(table.tenantId),
  tenantChallanNumberUnique: unique("subcontract_challans_tenant_challan_number_unique").on(table.tenantId, table.challanNumber),
}));

export const insertSubcontractChallanSchema = createInsertSchema(subcontractChallans).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SubcontractChallan = typeof subcontractChallans.$inferSelect;
export type InsertSubcontractChallan = z.infer<typeof insertSubcontractChallanSchema>;

export const subcontractChallanLines = pgTable("subcontract_challan_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  challanId: integer("challan_id").notNull().references(() => subcontractChallans.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  qty: numeric("qty", { precision: 15, scale: 4 }).notNull(),
  rate: numeric("rate", { precision: 15, scale: 4 }).default("0"),
  amount: numeric("amount", { precision: 15, scale: 2 }).default("0"),
  stockMoveId: integer("stock_move_id").references(() => stockLedger.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("subcontract_challan_lines_tenant_idx").on(table.tenantId),
}));

export const insertSubcontractChallanLineSchema = createInsertSchema(subcontractChallanLines).omit({
  id: true, createdAt: true,
});
export type SubcontractChallanLine = typeof subcontractChallanLines.$inferSelect;
export type InsertSubcontractChallanLine = z.infer<typeof insertSubcontractChallanLineSchema>;

export const subcontractBills = pgTable("subcontract_bills", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  billNumber: varchar("bill_number", { length: 50 }).notNull(),
  subcontractJobId: integer("subcontract_job_id").notNull().references(() => subcontractJobs.id),
  billDate: date("bill_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).default("0"),
  discountAmount: numeric("discount_amount", { precision: 15, scale: 2 }).default("0"),
  netAmount: numeric("net_amount", { precision: 15, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  accountingVoucherId: integer("accounting_voucher_id").references(() => vouchers.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  postedBy: integer("posted_by").references(() => users.id),
  postedAt: timestamp("posted_at"),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("subcontract_bills_tenant_idx").on(table.tenantId),
  tenantBillNumberUnique: unique("subcontract_bills_tenant_bill_number_unique").on(table.tenantId, table.billNumber),
}));

export const insertSubcontractBillSchema = createInsertSchema(subcontractBills).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SubcontractBill = typeof subcontractBills.$inferSelect;
export type InsertSubcontractBill = z.infer<typeof insertSubcontractBillSchema>;

export const commercialLcs = pgTable("commercial_lcs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  lcNumber: varchar("lc_number", { length: 50 }).notNull(),
  lcType: varchar("lc_type", { length: 20 }).notNull(),
  bankName: varchar("bank_name", { length: 255 }),
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date"),
  applicant: varchar("applicant", { length: 255 }),
  beneficiary: varchar("beneficiary", { length: 255 }),
  lcValue: numeric("lc_value", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  linkedSalesOrderId: integer("linked_sales_order_id").references(() => orders.id),
  linkedPurchaseOrderId: integer("linked_purchase_order_id"),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  amendmentCount: integer("amendment_count").default(0),
  attachments: jsonb("attachments"),
  metadata: jsonb("metadata"),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("commercial_lcs_tenant_idx").on(table.tenantId),
  tenantLcNumberUnique: unique("commercial_lcs_tenant_lc_number_unique").on(table.tenantId, table.lcNumber),
}));

export const insertCommercialLcSchema = createInsertSchema(commercialLcs).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CommercialLc = typeof commercialLcs.$inferSelect;
export type InsertCommercialLc = z.infer<typeof insertCommercialLcSchema>;

export const commercialDocuments = pgTable("commercial_documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  docType: varchar("doc_type", { length: 30 }).notNull(),
  docNumber: varchar("doc_number", { length: 50 }).notNull(),
  docDate: date("doc_date").notNull(),
  relatedType: varchar("related_type", { length: 30 }),
  relatedId: integer("related_id"),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  metadata: jsonb("metadata"),
  attachments: jsonb("attachments"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("commercial_documents_tenant_idx").on(table.tenantId),
  tenantDocTypeNumberUnique: unique("commercial_documents_tenant_doc_type_number_unique").on(table.tenantId, table.docType, table.docNumber),
}));

export const insertCommercialDocumentSchema = createInsertSchema(commercialDocuments).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CommercialDocument = typeof commercialDocuments.$inferSelect;
export type InsertCommercialDocument = z.infer<typeof insertCommercialDocumentSchema>;

export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  shipmentNumber: varchar("shipment_number", { length: 50 }).notNull(),
  salesOrderId: integer("order_id").references(() => orders.id),
  mode: varchar("mode", { length: 20 }).notNull(),
  forwarder: varchar("forwarder", { length: 255 }),
  vesselOrFlight: varchar("vessel_or_flight", { length: 255 }),
  containerNumber: varchar("container_number", { length: 100 }),
  etd: date("etd"),
  eta: date("eta"),
  portOfLoading: varchar("port_of_loading", { length: 255 }),
  portOfDischarge: varchar("port_of_discharge", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("PLANNED"),
  commercialInvoiceId: integer("commercial_invoice_id"),
  packingListId: integer("packing_list_id"),
  metadata: jsonb("metadata"),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("shipments_tenant_idx").on(table.tenantId),
  tenantShipmentNumberUnique: unique("shipments_tenant_shipment_number_unique").on(table.tenantId, table.shipmentNumber),
}));

export const insertShipmentSchema = createInsertSchema(shipments).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type Shipment = typeof shipments.$inferSelect;
export type InsertShipment = z.infer<typeof insertShipmentSchema>;

export const subcontractAccountingConfig = pgTable("subcontract_accounting_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  wipLedgerId: integer("wip_ledger_id").references(() => chartOfAccounts.id),
  subcontractExpenseLedgerId: integer("subcontract_expense_ledger_id").references(() => chartOfAccounts.id),
  subcontractPayableLedgerId: integer("subcontract_payable_ledger_id").references(() => chartOfAccounts.id),
  freightExpenseLedgerId: integer("freight_expense_ledger_id").references(() => chartOfAccounts.id),
  landedCostLedgerId: integer("landed_cost_ledger_id").references(() => chartOfAccounts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantUnique: unique("subcontract_accounting_config_tenant_unique").on(table.tenantId),
}));

export const insertSubcontractAccountingConfigSchema = createInsertSchema(subcontractAccountingConfig).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SubcontractAccountingConfig = typeof subcontractAccountingConfig.$inferSelect;
export type InsertSubcontractAccountingConfig = z.infer<typeof insertSubcontractAccountingConfigSchema>;

// ============================================================
// Phase 4.3 — Order-to-Cash
// ============================================================

export const salesOrders = pgTable("sales_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  orderNumber: varchar("order_number", { length: 50 }).notNull(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  partyId: integer("party_id").references(() => parties.id),
  orderDate: date("order_date").notNull(),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }).default("0"),
  discountAmount: numeric("discount_amount", { precision: 15, scale: 2 }).default("0"),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).default("0"),
  grandTotal: numeric("grand_total", { precision: 15, scale: 2 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  remarks: text("remarks"),
  linkedOrderId: integer("linked_order_id").references(() => orders.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("sales_orders_tenant_idx").on(table.tenantId),
  tenantOrderNumberUnique: unique("sales_orders_tenant_order_number_unique").on(table.tenantId, table.orderNumber),
}));

export const insertSalesOrderSchema = createInsertSchema(salesOrders).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SalesOrder = typeof salesOrders.$inferSelect;
export type InsertSalesOrder = z.infer<typeof insertSalesOrderSchema>;

export const salesOrderItems = pgTable("sales_order_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  salesOrderId: integer("sales_order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  qty: numeric("qty", { precision: 15, scale: 4 }).notNull(),
  rate: numeric("rate", { precision: 15, scale: 4 }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  deliveredQty: numeric("delivered_qty", { precision: 15, scale: 4 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("sales_order_items_tenant_idx").on(table.tenantId),
}));

export const insertSalesOrderItemSchema = createInsertSchema(salesOrderItems).omit({
  id: true, createdAt: true,
});
export type SalesOrderItem = typeof salesOrderItems.$inferSelect;
export type InsertSalesOrderItem = z.infer<typeof insertSalesOrderItemSchema>;

export const deliveryNotes = pgTable("delivery_notes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  deliveryNumber: varchar("delivery_number", { length: 50 }).notNull(),
  salesOrderId: integer("sales_order_id").notNull().references(() => salesOrders.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  deliveryDate: date("delivery_date").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  postedBy: integer("posted_by").references(() => users.id),
  postedAt: timestamp("posted_at"),
  requestId: varchar("request_id", { length: 100 }),
  accountingVoucherId: integer("accounting_voucher_id").references(() => vouchers.id),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("delivery_notes_tenant_idx").on(table.tenantId),
  tenantDeliveryNumberUnique: unique("delivery_notes_tenant_delivery_number_unique").on(table.tenantId, table.deliveryNumber),
}));

export const insertDeliveryNoteSchema = createInsertSchema(deliveryNotes).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type DeliveryNote = typeof deliveryNotes.$inferSelect;
export type InsertDeliveryNote = z.infer<typeof insertDeliveryNoteSchema>;

export const deliveryNoteItems = pgTable("delivery_note_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  deliveryNoteId: integer("delivery_note_id").notNull().references(() => deliveryNotes.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  qty: numeric("qty", { precision: 15, scale: 4 }).notNull(),
  rate: numeric("rate", { precision: 15, scale: 4 }).default("0"),
  amount: numeric("amount", { precision: 15, scale: 2 }).default("0"),
  stockMoveId: integer("stock_move_id").references(() => stockLedger.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("delivery_note_items_tenant_idx").on(table.tenantId),
}));

export const insertDeliveryNoteItemSchema = createInsertSchema(deliveryNoteItems).omit({
  id: true, createdAt: true,
});
export type DeliveryNoteItem = typeof deliveryNoteItems.$inferSelect;
export type InsertDeliveryNoteItem = z.infer<typeof insertDeliveryNoteItemSchema>;

export const salesInvoices = pgTable("sales_invoices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  partyId: integer("party_id").references(() => parties.id),
  shipmentId: integer("shipment_id").references(() => shipments.id),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).default("0"),
  discountAmount: numeric("discount_amount", { precision: 15, scale: 2 }).default("0"),
  netAmount: numeric("net_amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  accountingVoucherId: integer("accounting_voucher_id").references(() => vouchers.id),
  cogsVoucherId: integer("cogs_voucher_id").references(() => vouchers.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  postedBy: integer("posted_by").references(() => users.id),
  postedAt: timestamp("posted_at"),
  requestId: varchar("request_id", { length: 100 }),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("sales_invoices_tenant_idx").on(table.tenantId),
  tenantInvoiceNumberUnique: unique("sales_invoices_tenant_invoice_number_unique").on(table.tenantId, table.invoiceNumber),
}));

export const insertSalesInvoiceSchema = createInsertSchema(salesInvoices).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SalesInvoice = typeof salesInvoices.$inferSelect;
export type InsertSalesInvoice = z.infer<typeof insertSalesInvoiceSchema>;

export const salesInvoiceItems = pgTable("sales_invoice_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  salesInvoiceId: integer("sales_invoice_id").notNull().references(() => salesInvoices.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  qty: numeric("qty", { precision: 15, scale: 4 }).notNull(),
  rate: numeric("rate", { precision: 15, scale: 4 }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("sales_invoice_items_tenant_idx").on(table.tenantId),
}));

export const insertSalesInvoiceItemSchema = createInsertSchema(salesInvoiceItems).omit({
  id: true, createdAt: true,
});
export type SalesInvoiceItem = typeof salesInvoiceItems.$inferSelect;
export type InsertSalesInvoiceItem = z.infer<typeof insertSalesInvoiceItemSchema>;

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  receiptNumber: varchar("receipt_number", { length: 50 }).notNull(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  partyId: integer("party_id").references(() => parties.id),
  salesInvoiceId: integer("sales_invoice_id").references(() => salesInvoices.id),
  bankAccountId: integer("bank_account_id").references(() => chartOfAccounts.id),
  receiptDate: date("receipt_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  method: varchar("method", { length: 20 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  accountingVoucherId: integer("accounting_voucher_id").references(() => vouchers.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  postedBy: integer("posted_by").references(() => users.id),
  postedAt: timestamp("posted_at"),
  requestId: varchar("request_id", { length: 100 }),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("collections_tenant_idx").on(table.tenantId),
  tenantReceiptNumberUnique: unique("collections_tenant_receipt_number_unique").on(table.tenantId, table.receiptNumber),
}));

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;

export const exportProceeds = pgTable("export_proceeds", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  shipmentId: integer("shipment_id").references(() => shipments.id),
  salesInvoiceId: integer("sales_invoice_id").references(() => salesInvoices.id),
  bankRefNumber: varchar("bank_ref_number", { length: 100 }),
  proceedDate: date("proceed_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  conversionRate: numeric("conversion_rate", { precision: 10, scale: 6 }).default("1"),
  bdtAmount: numeric("bdt_amount", { precision: 15, scale: 2 }).notNull(),
  bankCharges: numeric("bank_charges", { precision: 15, scale: 2 }).default("0"),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  accountingVoucherId: integer("accounting_voucher_id").references(() => vouchers.id),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("export_proceeds_tenant_idx").on(table.tenantId),
}));

export const insertExportProceedSchema = createInsertSchema(exportProceeds).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ExportProceed = typeof exportProceeds.$inferSelect;
export type InsertExportProceed = z.infer<typeof insertExportProceedSchema>;

export const exportIncentives = pgTable("export_incentives", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  expectedAmount: numeric("expected_amount", { precision: 15, scale: 2 }).default("0"),
  receivedAmount: numeric("received_amount", { precision: 15, scale: 2 }).default("0"),
  status: varchar("status", { length: 20 }).notNull().default("EXPECTED"),
  accountingVoucherId: integer("accounting_voucher_id").references(() => vouchers.id),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("export_incentives_tenant_idx").on(table.tenantId),
}));

export const insertExportIncentiveSchema = createInsertSchema(exportIncentives).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ExportIncentive = typeof exportIncentives.$inferSelect;
export type InsertExportIncentive = z.infer<typeof insertExportIncentiveSchema>;

export const salesAccountingConfig = pgTable("sales_accounting_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  salesRevenueLedgerId: integer("sales_revenue_ledger_id").references(() => chartOfAccounts.id),
  accountsReceivableLedgerId: integer("accounts_receivable_ledger_id").references(() => chartOfAccounts.id),
  cogsLedgerId: integer("cogs_ledger_id").references(() => chartOfAccounts.id),
  bankLedgerId: integer("bank_ledger_id").references(() => chartOfAccounts.id),
  cashLedgerId: integer("cash_ledger_id").references(() => chartOfAccounts.id),
  bankChargesLedgerId: integer("bank_charges_ledger_id").references(() => chartOfAccounts.id),
  fxGainLossLedgerId: integer("fx_gain_loss_ledger_id").references(() => chartOfAccounts.id),
  exportReceivableLedgerId: integer("export_receivable_ledger_id").references(() => chartOfAccounts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantUnique: unique("sales_accounting_config_tenant_unique").on(table.tenantId),
}));

export const insertSalesAccountingConfigSchema = createInsertSchema(salesAccountingConfig).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SalesAccountingConfig = typeof salesAccountingConfig.$inferSelect;
export type InsertSalesAccountingConfig = z.infer<typeof insertSalesAccountingConfigSchema>;

// ============================================================
// PHASE 5.1 — HR + PAYROLL
// ============================================================

export const salaryStructures = pgTable("salary_structures", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  basic: numeric("basic", { precision: 15, scale: 2 }),
  houseRent: numeric("house_rent", { precision: 15, scale: 2 }),
  medical: numeric("medical", { precision: 15, scale: 2 }),
  conveyance: numeric("conveyance", { precision: 15, scale: 2 }),
  otherAllowances: numeric("other_allowances", { precision: 15, scale: 2 }),
  grossSalary: numeric("gross_salary", { precision: 15, scale: 2 }),
  taxDeduction: numeric("tax_deduction", { precision: 15, scale: 2 }),
  pfDeduction: numeric("pf_deduction", { precision: 15, scale: 2 }),
  otherDeductions: numeric("other_deductions", { precision: 15, scale: 2 }),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantEmployeeEffectiveUnique: unique("salary_structures_tenant_emp_eff_unique").on(table.tenantId, table.employeeId, table.effectiveFrom),
}));

export const insertSalaryStructureSchema = createInsertSchema(salaryStructures).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SalaryStructure = typeof salaryStructures.$inferSelect;
export type InsertSalaryStructure = z.infer<typeof insertSalaryStructureSchema>;

export const payrollRuns = pgTable("payroll_runs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  payrollMonth: varchar("payroll_month", { length: 7 }).notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: varchar("status", { length: 20 }).default("DRAFT"),
  totalGross: numeric("total_gross", { precision: 15, scale: 2 }),
  totalDeductions: numeric("total_deductions", { precision: 15, scale: 2 }),
  totalNet: numeric("total_net", { precision: 15, scale: 2 }),
  employeeCount: integer("employee_count"),
  accrualVoucherId: integer("accrual_voucher_id").references(() => vouchers.id),
  paymentVoucherId: integer("payment_voucher_id").references(() => vouchers.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  postedBy: integer("posted_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  postedAt: timestamp("posted_at"),
  paidAt: timestamp("paid_at"),
  requestId: varchar("request_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantPayrollMonthUnique: unique("payroll_runs_tenant_month_unique").on(table.tenantId, table.payrollMonth),
}));

export const insertPayrollRunSchema = createInsertSchema(payrollRuns).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;

export const payslips = pgTable("payslips", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  payrollRunId: integer("payroll_run_id").notNull().references(() => payrollRuns.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  grossPay: numeric("gross_pay", { precision: 15, scale: 2 }),
  totalDeductions: numeric("total_deductions", { precision: 15, scale: 2 }),
  netPay: numeric("net_pay", { precision: 15, scale: 2 }),
  earningsBreakdown: jsonb("earnings_breakdown"),
  deductionsBreakdown: jsonb("deductions_breakdown"),
  advanceRecovery: numeric("advance_recovery", { precision: 15, scale: 2 }).default("0"),
  status: varchar("status", { length: 20 }).default("GENERATED"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantRunEmployeeUnique: unique("payslips_tenant_run_emp_unique").on(table.tenantId, table.payrollRunId, table.employeeId),
}));

export const insertPayslipSchema = createInsertSchema(payslips).omit({
  id: true, createdAt: true,
});
export type Payslip = typeof payslips.$inferSelect;
export type InsertPayslip = z.infer<typeof insertPayslipSchema>;

export const employeeAdvances = pgTable("employee_advances", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  advanceDate: date("advance_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  monthlyDeductionAmount: numeric("monthly_deduction_amount", { precision: 15, scale: 2 }).notNull(),
  totalRecovered: numeric("total_recovered", { precision: 15, scale: 2 }).default("0"),
  outstandingAmount: numeric("outstanding_amount", { precision: 15, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).default("ACTIVE"),
  disbursementVoucherId: integer("disbursement_voucher_id").references(() => vouchers.id),
  reason: text("reason"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantEmployeeStatusIdx: index("employee_advances_tenant_emp_status_idx").on(table.tenantId, table.employeeId, table.status),
}));

export const insertEmployeeAdvanceSchema = createInsertSchema(employeeAdvances).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type EmployeeAdvance = typeof employeeAdvances.$inferSelect;
export type InsertEmployeeAdvance = z.infer<typeof insertEmployeeAdvanceSchema>;

export const payrollAccountingConfig = pgTable("payroll_accounting_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  salaryExpenseLedgerId: integer("salary_expense_ledger_id").references(() => chartOfAccounts.id),
  salaryPayableLedgerId: integer("salary_payable_ledger_id").references(() => chartOfAccounts.id),
  bankLedgerId: integer("bank_ledger_id").references(() => chartOfAccounts.id),
  cashLedgerId: integer("cash_ledger_id").references(() => chartOfAccounts.id),
  taxPayableLedgerId: integer("tax_payable_ledger_id").references(() => chartOfAccounts.id),
  pfPayableLedgerId: integer("pf_payable_ledger_id").references(() => chartOfAccounts.id),
  advanceReceivableLedgerId: integer("advance_receivable_ledger_id").references(() => chartOfAccounts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantUnique: unique("payroll_accounting_config_tenant_unique").on(table.tenantId),
}));

export const insertPayrollAccountingConfigSchema = createInsertSchema(payrollAccountingConfig).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type PayrollAccountingConfig = typeof payrollAccountingConfig.$inferSelect;
export type InsertPayrollAccountingConfig = z.infer<typeof insertPayrollAccountingConfigSchema>;

// ============================================================
// PHASE 5.2 — PROCURE-TO-PAY
// ============================================================

export const supplierInvoices = pgTable("supplier_invoices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  supplierId: integer("supplier_id").notNull().references(() => vendors.id),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id),
  grnId: integer("grn_id").references(() => goodsReceivingNotes.id),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  currency: varchar("currency", { length: 3 }).default("BDT"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }),
  discountAmount: numeric("discount_amount", { precision: 15, scale: 2 }),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 15, scale: 2 }).default("0"),
  status: varchar("status", { length: 20 }).default("DRAFT"),
  accountingVoucherId: integer("accounting_voucher_id").references(() => vouchers.id),
  requestId: varchar("request_id", { length: 100 }),
  notes: text("notes"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantSupplierInvoiceUnique: unique("supplier_invoices_tenant_supplier_inv_unique").on(table.tenantId, table.supplierId, table.invoiceNumber),
}));

export const insertSupplierInvoiceSchema = createInsertSchema(supplierInvoices).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type InsertSupplierInvoice = z.infer<typeof insertSupplierInvoiceSchema>;

export const supplierInvoiceItems = pgTable("supplier_invoice_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  invoiceId: integer("invoice_id").notNull().references(() => supplierInvoices.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => items.id),
  description: text("description"),
  quantity: numeric("quantity", { precision: 15, scale: 4 }),
  unitPrice: numeric("unit_price", { precision: 15, scale: 4 }),
  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }),
  lineTotal: numeric("line_total", { precision: 15, scale: 2 }).notNull(),
  grnItemId: integer("grn_item_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSupplierInvoiceItemSchema = createInsertSchema(supplierInvoiceItems).omit({
  id: true, createdAt: true,
});
export type SupplierInvoiceItem = typeof supplierInvoiceItems.$inferSelect;
export type InsertSupplierInvoiceItem = z.infer<typeof insertSupplierInvoiceItemSchema>;

export const supplierPayments = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  paymentNumber: varchar("payment_number", { length: 50 }).notNull(),
  supplierId: integer("supplier_id").notNull().references(() => vendors.id),
  paymentDate: date("payment_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
  bankReference: varchar("bank_reference", { length: 100 }),
  status: varchar("status", { length: 20 }).default("DRAFT"),
  accountingVoucherId: integer("accounting_voucher_id").references(() => vouchers.id),
  requestId: varchar("request_id", { length: 100 }),
  notes: text("notes"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantPaymentNumberUnique: unique("supplier_payments_tenant_payment_unique").on(table.tenantId, table.paymentNumber),
}));

export const insertSupplierPaymentSchema = createInsertSchema(supplierPayments).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;

export const paymentAllocations = pgTable("payment_allocations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  paymentId: integer("payment_id").notNull().references(() => supplierPayments.id, { onDelete: "cascade" }),
  invoiceId: integer("invoice_id").notNull().references(() => supplierInvoices.id),
  allocatedAmount: numeric("allocated_amount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentAllocationSchema = createInsertSchema(paymentAllocations).omit({
  id: true, createdAt: true,
});
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type InsertPaymentAllocation = z.infer<typeof insertPaymentAllocationSchema>;

export const purchaseAccountingConfig = pgTable("purchase_accounting_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  inventoryAssetLedgerId: integer("inventory_asset_ledger_id").references(() => chartOfAccounts.id),
  accountsPayableLedgerId: integer("accounts_payable_ledger_id").references(() => chartOfAccounts.id),
  purchaseExpenseLedgerId: integer("purchase_expense_ledger_id").references(() => chartOfAccounts.id),
  landedCostLedgerId: integer("landed_cost_ledger_id").references(() => chartOfAccounts.id),
  freightExpenseLedgerId: integer("freight_expense_ledger_id").references(() => chartOfAccounts.id),
  bankLedgerId: integer("bank_ledger_id").references(() => chartOfAccounts.id),
  cashLedgerId: integer("cash_ledger_id").references(() => chartOfAccounts.id),
  taxInputLedgerId: integer("tax_input_ledger_id").references(() => chartOfAccounts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantUnique: unique("purchase_accounting_config_tenant_unique").on(table.tenantId),
}));

export const insertPurchaseAccountingConfigSchema = createInsertSchema(purchaseAccountingConfig).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type PurchaseAccountingConfig = typeof purchaseAccountingConfig.$inferSelect;
export type InsertPurchaseAccountingConfig = z.infer<typeof insertPurchaseAccountingConfigSchema>;

// ============================================================
// PHASE 5.3 — MASTER DATA + CONFIG
// ============================================================

export const numberSeries = pgTable("number_series", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  docType: varchar("doc_type", { length: 30 }).notNull(),
  prefix: varchar("prefix", { length: 20 }).notNull(),
  padding: integer("padding").default(6),
  nextNumber: integer("next_number").default(1).notNull(),
  resetPolicy: varchar("reset_policy", { length: 20 }).default("NEVER"),
  currentPeriod: varchar("current_period", { length: 10 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantDocTypeUnique: unique("number_series_tenant_doc_type_unique").on(table.tenantId, table.docType),
}));

export const insertNumberSeriesSchema = createInsertSchema(numberSeries).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type NumberSeries = typeof numberSeries.$inferSelect;
export type InsertNumberSeries = z.infer<typeof insertNumberSeriesSchema>;

export const tenantLedgerMappings = pgTable("tenant_ledger_mappings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  inventoryAssetLedgerId: integer("inventory_asset_ledger_id").references(() => chartOfAccounts.id),
  accountsReceivableLedgerId: integer("accounts_receivable_ledger_id").references(() => chartOfAccounts.id),
  accountsPayableLedgerId: integer("accounts_payable_ledger_id").references(() => chartOfAccounts.id),
  salesRevenueLedgerId: integer("sales_revenue_ledger_id").references(() => chartOfAccounts.id),
  cogsLedgerId: integer("cogs_ledger_id").references(() => chartOfAccounts.id),
  salaryExpenseLedgerId: integer("salary_expense_ledger_id").references(() => chartOfAccounts.id),
  salaryPayableLedgerId: integer("salary_payable_ledger_id").references(() => chartOfAccounts.id),
  subcontractPayableLedgerId: integer("subcontract_payable_ledger_id").references(() => chartOfAccounts.id),
  bankLedgerId: integer("bank_ledger_id").references(() => chartOfAccounts.id),
  cashLedgerId: integer("cash_ledger_id").references(() => chartOfAccounts.id),
  taxInputLedgerId: integer("tax_input_ledger_id").references(() => chartOfAccounts.id),
  taxOutputLedgerId: integer("tax_output_ledger_id").references(() => chartOfAccounts.id),
  wipLedgerId: integer("wip_ledger_id").references(() => chartOfAccounts.id),
  advanceReceivableLedgerId: integer("advance_receivable_ledger_id").references(() => chartOfAccounts.id),
  purchaseExpenseLedgerId: integer("purchase_expense_ledger_id").references(() => chartOfAccounts.id),
  landedCostLedgerId: integer("landed_cost_ledger_id").references(() => chartOfAccounts.id),
  freightExpenseLedgerId: integer("freight_expense_ledger_id").references(() => chartOfAccounts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantUnique: unique("tenant_ledger_mappings_tenant_unique").on(table.tenantId),
}));

export const insertTenantLedgerMappingSchema = createInsertSchema(tenantLedgerMappings).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type TenantLedgerMapping = typeof tenantLedgerMappings.$inferSelect;
export type InsertTenantLedgerMapping = z.infer<typeof insertTenantLedgerMappingSchema>;

export const tenantWarehouseDefaults = pgTable("tenant_warehouse_defaults", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  defaultWarehouseRmId: integer("default_warehouse_rm_id").references(() => warehouses.id),
  defaultWarehouseWipId: integer("default_warehouse_wip_id").references(() => warehouses.id),
  defaultWarehouseFgId: integer("default_warehouse_fg_id").references(() => warehouses.id),
  defaultWarehouseSubcontractOutId: integer("default_warehouse_subcontract_out_id").references(() => warehouses.id),
  defaultWarehouseScrapId: integer("default_warehouse_scrap_id").references(() => warehouses.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantUnique: unique("tenant_warehouse_defaults_tenant_unique").on(table.tenantId),
}));

export const insertTenantWarehouseDefaultSchema = createInsertSchema(tenantWarehouseDefaults).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type TenantWarehouseDefault = typeof tenantWarehouseDefaults.$inferSelect;
export type InsertTenantWarehouseDefault = z.infer<typeof insertTenantWarehouseDefaultSchema>;

export const approvalPolicies = pgTable("approval_policies", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  docType: varchar("doc_type", { length: 30 }).notNull(),
  action: varchar("action", { length: 30 }).notNull(),
  requiredPermission: varchar("required_permission", { length: 100 }),
  minRoleLevel: integer("min_role_level"),
  amountThreshold: numeric("amount_threshold", { precision: 15, scale: 2 }),
  requiresReason: boolean("requires_reason").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantDocTypeActionIdx: index("approval_policies_tenant_doc_action_idx").on(table.tenantId, table.docType, table.action),
}));

export const insertApprovalPolicySchema = createInsertSchema(approvalPolicies).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ApprovalPolicy = typeof approvalPolicies.$inferSelect;
export type InsertApprovalPolicy = z.infer<typeof insertApprovalPolicySchema>;

// ===================== PHASE 7.1 — MERCHANDISING =====================

export const styles = pgTable("styles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  buyerId: integer("buyer_id").references(() => customers.id),
  styleNo: varchar("style_no", { length: 50 }).notNull(),
  season: varchar("season", { length: 50 }),
  productType: varchar("product_type", { length: 50 }),
  description: text("description"),
  status: varchar("status", { length: 20 }).default("DRAFT").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  techPackMeta: jsonb("tech_pack_meta"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantStyleNoUnique: unique("styles_tenant_style_no_unique").on(table.tenantId, table.styleNo),
}));

export const insertStyleSchema = createInsertSchema(styles).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type Style = typeof styles.$inferSelect;
export type InsertStyle = z.infer<typeof insertStyleSchema>;

export const styleComponents = pgTable("style_components", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  styleId: integer("style_id").notNull().references(() => styles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  componentType: varchar("component_type", { length: 50 }).notNull(),
  uom: varchar("uom", { length: 20 }),
  skuCode: varchar("sku_code", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantStyleNameUnique: unique("style_components_tenant_style_name_unique").on(table.tenantId, table.styleId, table.name),
}));

export const insertStyleComponentSchema = createInsertSchema(styleComponents).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type StyleComponent = typeof styleComponents.$inferSelect;
export type InsertStyleComponent = z.infer<typeof insertStyleComponentSchema>;

export const styleColorways = pgTable("style_colorways", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  styleId: integer("style_id").notNull().references(() => styles.id, { onDelete: "cascade" }),
  colorName: varchar("color_name", { length: 100 }).notNull(),
  colorCode: varchar("color_code", { length: 20 }),
  pantoneRef: varchar("pantone_ref", { length: 50 }),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantStyleColorUnique: unique("style_colorways_tenant_style_color_unique").on(table.tenantId, table.styleId, table.colorName),
}));

export const insertStyleColorwaySchema = createInsertSchema(styleColorways).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type StyleColorway = typeof styleColorways.$inferSelect;
export type InsertStyleColorway = z.infer<typeof insertStyleColorwaySchema>;

export const styleSizeScales = pgTable("style_size_scales", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  styleId: integer("style_id").notNull().references(() => styles.id, { onDelete: "cascade" }),
  scaleName: varchar("scale_name", { length: 100 }).notNull(),
  sizes: jsonb("sizes").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantStyleScaleUnique: unique("style_size_scales_tenant_style_scale_unique").on(table.tenantId, table.styleId, table.scaleName),
}));

export const insertStyleSizeScaleSchema = createInsertSchema(styleSizeScales).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type StyleSizeScale = typeof styleSizeScales.$inferSelect;
export type InsertStyleSizeScale = z.infer<typeof insertStyleSizeScaleSchema>;

export const costings = pgTable("costings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  quotationId: integer("quotation_id").notNull().references(() => quotations.id),
  smv: numeric("smv", { precision: 10, scale: 4 }),
  efficiency: numeric("efficiency", { precision: 5, scale: 2 }),
  cm: numeric("cm", { precision: 15, scale: 2 }),
  overhead: numeric("overhead", { precision: 15, scale: 2 }),
  marginPct: numeric("margin_pct", { precision: 5, scale: 2 }),
  fabricCost: numeric("fabric_cost", { precision: 15, scale: 2 }),
  trimsCost: numeric("trims_cost", { precision: 15, scale: 2 }),
  packingCost: numeric("packing_cost", { precision: 15, scale: 2 }),
  washingCost: numeric("washing_cost", { precision: 15, scale: 2 }),
  printingCost: numeric("printing_cost", { precision: 15, scale: 2 }),
  testingCost: numeric("testing_cost", { precision: 15, scale: 2 }),
  commercialCost: numeric("commercial_cost", { precision: 15, scale: 2 }),
  financeCost: numeric("finance_cost", { precision: 15, scale: 2 }),
  totalCostPerPc: numeric("total_cost_per_pc", { precision: 15, scale: 2 }),
  targetPrice: numeric("target_price", { precision: 15, scale: 2 }),
  proposedPrice: numeric("proposed_price", { precision: 15, scale: 2 }),
  breakdown: jsonb("breakdown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCostingSchema = createInsertSchema(costings).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type Costing = typeof costings.$inferSelect;
export type InsertCosting = z.infer<typeof insertCostingSchema>;

// ===================== PHASE 7.2 — BOM + CONSUMPTION ENGINE =====================

export const styleBoms = pgTable("style_boms", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  styleId: integer("style_id").notNull().references(() => styles.id),
  componentId: integer("component_id").references(() => styleComponents.id),
  versionNo: integer("version_no").default(1).notNull(),
  status: varchar("status", { length: 20 }).default("DRAFT").notNull(),
  effectiveFrom: date("effective_from"),
  notes: text("notes"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  revisionOfBomId: integer("revision_of_bom_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantStyleVersionUnique: unique("style_boms_tenant_style_ver_unique").on(table.tenantId, table.styleId, table.versionNo),
}));

export const insertStyleBomSchema = createInsertSchema(styleBoms).omit({
  id: true, createdAt: true, updatedAt: true, approvedAt: true,
});
export type StyleBom = typeof styleBoms.$inferSelect;
export type InsertStyleBom = z.infer<typeof insertStyleBomSchema>;

export const styleBomLines = pgTable("style_bom_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  styleBomId: integer("style_bom_id").notNull().references(() => styleBoms.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 20 }).notNull(),
  itemId: integer("item_id").references(() => items.id),
  itemDescription: varchar("item_description", { length: 255 }),
  uom: varchar("uom", { length: 20 }),
  baseConsumption: numeric("base_consumption", { precision: 15, scale: 6 }).notNull(),
  wastagePct: numeric("wastage_pct", { precision: 5, scale: 2 }).default("0"),
  processLossPct: numeric("process_loss_pct", { precision: 5, scale: 2 }).default("0"),
  consumptionFormula: jsonb("consumption_formula"),
  colorPolicy: varchar("color_policy", { length: 20 }).default("SOLID"),
  sizePolicy: varchar("size_policy", { length: 20 }).default("SAME_ALL"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStyleBomLineSchema = createInsertSchema(styleBomLines).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type StyleBomLine = typeof styleBomLines.$inferSelect;
export type InsertStyleBomLine = z.infer<typeof insertStyleBomLineSchema>;

export const bomVariants = pgTable("bom_variants", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  styleBomLineId: integer("style_bom_line_id").notNull().references(() => styleBomLines.id, { onDelete: "cascade" }),
  size: varchar("size", { length: 20 }),
  color: varchar("color", { length: 50 }),
  consumptionOverride: numeric("consumption_override", { precision: 15, scale: 6 }),
  wastageOverridePct: numeric("wastage_override_pct", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBomVariantSchema = createInsertSchema(bomVariants).omit({
  id: true, createdAt: true,
});
export type BomVariant = typeof bomVariants.$inferSelect;
export type InsertBomVariant = z.infer<typeof insertBomVariantSchema>;

export const consumptionPlans = pgTable("consumption_plans", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  salesOrderId: integer("sales_order_id").notNull().references(() => orders.id),
  status: varchar("status", { length: 20 }).default("PLANNED").notNull(),
  requestId: varchar("request_id", { length: 100 }),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  overrideReason: text("override_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantRequestIdUnique: unique("consumption_plans_tenant_req_unique").on(table.tenantId, table.requestId),
}));

export const insertConsumptionPlanSchema = createInsertSchema(consumptionPlans).omit({
  id: true, createdAt: true, approvedAt: true,
});
export type ConsumptionPlan = typeof consumptionPlans.$inferSelect;
export type InsertConsumptionPlan = z.infer<typeof insertConsumptionPlanSchema>;

export const consumptionPlanLines = pgTable("consumption_plan_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  consumptionPlanId: integer("consumption_plan_id").notNull().references(() => consumptionPlans.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => items.id),
  requiredQty: numeric("required_qty", { precision: 15, scale: 4 }).notNull(),
  reservedQty: numeric("reserved_qty", { precision: 15, scale: 4 }).default("0"),
  uom: varchar("uom", { length: 20 }),
  sourceWarehouseId: integer("source_warehouse_id").references(() => warehouses.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertConsumptionPlanLineSchema = createInsertSchema(consumptionPlanLines).omit({
  id: true, createdAt: true,
});
export type ConsumptionPlanLine = typeof consumptionPlanLines.$inferSelect;
export type InsertConsumptionPlanLine = z.infer<typeof insertConsumptionPlanLineSchema>;

// ===================== PHASE 7.3 — SAMPLE PROGRAM =====================

export const sampleRequests = pgTable("sample_requests", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  requestNumber: varchar("request_number", { length: 30 }).notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  sampleTypeId: integer("sample_type_id"),
  orderId: integer("order_id").references(() => orders.id),
  inquiryId: integer("inquiry_id").references(() => inquiries.id),
  styleName: varchar("style_name", { length: 255 }),
  styleCode: varchar("style_code", { length: 50 }),
  department: varchar("department", { length: 100 }),
  quantity: integer("quantity").notNull().default(1),
  requestDate: date("request_date"),
  requiredDate: date("required_date"),
  estimatedCompletionDate: date("estimated_completion_date"),
  actualCompletionDate: date("actual_completion_date"),
  priority: varchar("priority", { length: 20 }).default("normal"),
  status: varchar("status", { length: 30 }).default("requested").notNull(),
  materialRequirements: jsonb("material_requirements"),
  specifications: jsonb("specifications"),
  buyerComments: text("buyer_comments"),
  internalNotes: text("internal_notes"),
  courierDetails: jsonb("courier_details"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  dispatchDate: date("dispatch_date"),
  receivedByBuyer: boolean("received_by_buyer").default(false),
  buyerFeedback: text("buyer_feedback"),
  approvalStatus: varchar("approval_status", { length: 20 }).default("pending"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  assignedTo: integer("assigned_to"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantRequestNumberUnique: unique("sample_requests_tenant_request_number_unique").on(table.tenantId, table.requestNumber),
}));

export const insertSampleRequestSchema = createInsertSchema(sampleRequests).omit({
  id: true, createdAt: true, updatedAt: true, approvedAt: true,
});
export type SampleRequest = typeof sampleRequests.$inferSelect;
export type InsertSampleRequest = z.infer<typeof insertSampleRequestSchema>;

export const sampleVersions = pgTable("sample_versions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sampleRequestId: integer("sample_request_id").notNull().references(() => sampleRequests.id, { onDelete: "cascade" }),
  versionNo: integer("version_no").default(1).notNull(),
  status: varchar("status", { length: 20 }).default("WORKING").notNull(),
  buyerComments: text("buyer_comments"),
  internalComments: text("internal_comments"),
  attachments: jsonb("attachments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSampleVersionSchema = createInsertSchema(sampleVersions).omit({
  id: true, createdAt: true,
});
export type SampleVersion = typeof sampleVersions.$inferSelect;
export type InsertSampleVersion = z.infer<typeof insertSampleVersionSchema>;

export const sampleBomSnapshots = pgTable("sample_bom_snapshots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sampleRequestId: integer("sample_request_id").notNull().references(() => sampleRequests.id),
  sampleVersionId: integer("sample_version_id").references(() => sampleVersions.id),
  sourceStyleBomId: integer("source_style_bom_id").references(() => styleBoms.id),
  sourceVersionNo: integer("source_version_no"),
  snapshot: jsonb("snapshot").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  lockedBy: integer("locked_by").references(() => users.id),
});

export const insertSampleBomSnapshotSchema = createInsertSchema(sampleBomSnapshots).omit({
  id: true, lockedAt: true,
});
export type SampleBomSnapshot = typeof sampleBomSnapshots.$inferSelect;
export type InsertSampleBomSnapshot = z.infer<typeof insertSampleBomSnapshotSchema>;

export const sampleMaterialRequests = pgTable("sample_material_requests", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sampleRequestId: integer("sample_request_id").notNull().references(() => sampleRequests.id),
  status: varchar("status", { length: 20 }).default("DRAFT").notNull(),
  requestId: varchar("request_id", { length: 100 }),
  approvedBy: integer("approved_by").references(() => users.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantRequestIdUnique: unique("sample_mat_req_tenant_req_unique").on(table.tenantId, table.requestId),
}));

export const insertSampleMaterialRequestSchema = createInsertSchema(sampleMaterialRequests).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type SampleMaterialRequest = typeof sampleMaterialRequests.$inferSelect;
export type InsertSampleMaterialRequest = z.infer<typeof insertSampleMaterialRequestSchema>;

export const sampleMaterialRequestLines = pgTable("sample_material_request_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sampleMaterialRequestId: integer("sample_material_request_id").notNull().references(() => sampleMaterialRequests.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => items.id),
  qty: numeric("qty", { precision: 15, scale: 4 }).notNull(),
  uom: varchar("uom", { length: 20 }),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSampleMaterialRequestLineSchema = createInsertSchema(sampleMaterialRequestLines).omit({
  id: true, createdAt: true,
});
export type SampleMaterialRequestLine = typeof sampleMaterialRequestLines.$inferSelect;
export type InsertSampleMaterialRequestLine = z.infer<typeof insertSampleMaterialRequestLineSchema>;

export const sampleActivityLog = pgTable("sample_activity_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sampleRequestId: integer("sample_request_id").notNull().references(() => sampleRequests.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 50 }).notNull(),
  fromStatus: varchar("from_status", { length: 30 }),
  toStatus: varchar("to_status", { length: 30 }),
  performedBy: integer("performed_by").references(() => users.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SampleActivityLog = typeof sampleActivityLog.$inferSelect;

// ===================== PHASE 7.4 — TIME & ACTION (TNA) =====================

export const tnaTemplates = pgTable("tna_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  appliesTo: varchar("applies_to", { length: 20 }).notNull(),
  productType: varchar("product_type", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTnaTemplateSchema = createInsertSchema(tnaTemplates).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type TnaTemplate = typeof tnaTemplates.$inferSelect;
export type InsertTnaTemplate = z.infer<typeof insertTnaTemplateSchema>;

export const tnaTemplateTasks = pgTable("tna_template_tasks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  templateId: integer("template_id").notNull().references(() => tnaTemplates.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  department: varchar("department", { length: 50 }),
  defaultOffsetDays: integer("default_offset_days").notNull(),
  durationDays: integer("duration_days"),
  dependencyTaskIds: integer("dependency_task_ids").array(),
  isCritical: boolean("is_critical").default(false),
  defaultOwnerRole: varchar("default_owner_role", { length: 50 }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTnaTemplateTaskSchema = createInsertSchema(tnaTemplateTasks).omit({
  id: true, createdAt: true,
});
export type TnaTemplateTask = typeof tnaTemplateTasks.$inferSelect;
export type InsertTnaTemplateTask = z.infer<typeof insertTnaTemplateTaskSchema>;

export const tnaPlans = pgTable("tna_plans", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  planNo: varchar("plan_no", { length: 50 }).notNull(),
  relatedType: varchar("related_type", { length: 20 }).notNull(),
  relatedId: integer("related_id").notNull(),
  templateId: integer("template_id").references(() => tnaTemplates.id),
  anchorDateType: varchar("anchor_date_type", { length: 30 }),
  anchorDate: date("anchor_date").notNull(),
  status: varchar("status", { length: 20 }).default("ACTIVE").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantPlanNoUnique: unique("tna_plans_tenant_plan_no_unique").on(table.tenantId, table.planNo),
}));

export const insertTnaPlanSchema = createInsertSchema(tnaPlans).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type TnaPlan = typeof tnaPlans.$inferSelect;
export type InsertTnaPlan = z.infer<typeof insertTnaPlanSchema>;

export const tnaTasks = pgTable("tna_tasks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  planId: integer("plan_id").notNull().references(() => tnaPlans.id, { onDelete: "cascade" }),
  templateTaskId: integer("template_task_id").references(() => tnaTemplateTasks.id),
  name: varchar("name", { length: 200 }).notNull(),
  department: varchar("department", { length: 50 }),
  plannedStart: date("planned_start"),
  plannedEnd: date("planned_end"),
  actualStart: date("actual_start"),
  actualEnd: date("actual_end"),
  status: varchar("status", { length: 20 }).default("NOT_STARTED").notNull(),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id),
  assignedRole: varchar("assigned_role", { length: 50 }),
  dependsOnTaskIds: integer("depends_on_task_ids").array(),
  isCritical: boolean("is_critical").default(false),
  remarks: text("remarks"),
  lastUpdatedBy: integer("last_updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTnaTaskSchema = createInsertSchema(tnaTasks).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type TnaTask = typeof tnaTasks.$inferSelect;
export type InsertTnaTask = z.infer<typeof insertTnaTaskSchema>;

export const tnaTaskUpdates = pgTable("tna_task_updates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  taskId: integer("task_id").notNull().references(() => tnaTasks.id, { onDelete: "cascade" }),
  fromStatus: varchar("from_status", { length: 20 }),
  toStatus: varchar("to_status", { length: 20 }),
  comment: text("comment"),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TnaTaskUpdate = typeof tnaTaskUpdates.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// Phase 8.1 — Factory Execution Core
// ═══════════════════════════════════════════════════════════════

export const sewingLines = pgTable("sewing_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  lineCode: varchar("line_code").notNull(),
  floor: varchar("floor"),
  capacityOperators: integer("capacity_operators"),
  defaultShiftHours: numeric("default_shift_hours"),
  status: varchar("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantLineCodeUnique: unique().on(table.tenantId, table.lineCode),
}));

export const insertSewingLineSchema = createInsertSchema(sewingLines).omit({ id: true, createdAt: true });
export type SewingLine = typeof sewingLines.$inferSelect;
export type InsertSewingLine = z.infer<typeof insertSewingLineSchema>;

export const shifts = pgTable("shifts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name").notNull(),
  startTime: time("start_time"),
  endTime: time("end_time"),
  breakMinutes: integer("break_minutes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertShiftSchema = createInsertSchema(shifts).omit({ id: true, createdAt: true });
export type Shift = typeof shifts.$inferSelect;
export type InsertShift = z.infer<typeof insertShiftSchema>;

export const productionPlans = pgTable("production_plans", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  planDate: date("plan_date").notNull(),
  relatedType: varchar("related_type").default("ORDER").notNull(),
  relatedId: integer("related_id"),
  styleId: integer("style_id").references(() => styles.id),
  plannedQty: integer("planned_qty").notNull(),
  targetQty: integer("target_qty").notNull(),
  status: varchar("status").default("DRAFT").notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProductionPlanSchema = createInsertSchema(productionPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type ProductionPlan = typeof productionPlans.$inferSelect;
export type InsertProductionPlan = z.infer<typeof insertProductionPlanSchema>;

export const lineAssignments = pgTable("line_assignments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  productionPlanId: integer("production_plan_id").notNull().references(() => productionPlans.id),
  lineId: integer("line_id").notNull().references(() => sewingLines.id),
  shiftId: integer("shift_id").notNull().references(() => shifts.id),
  targetQty: integer("target_qty").notNull(),
  smv: numeric("smv"),
  plannedEfficiencyPct: numeric("planned_efficiency_pct"),
  plannedManpower: integer("planned_manpower"),
  status: varchar("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLineAssignmentSchema = createInsertSchema(lineAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export type LineAssignment = typeof lineAssignments.$inferSelect;
export type InsertLineAssignment = z.infer<typeof insertLineAssignmentSchema>;

export const cuttingOrders = pgTable("cutting_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  productionPlanId: integer("production_plan_id").notNull().references(() => productionPlans.id),
  markerRef: varchar("marker_ref"),
  layCount: integer("lay_count"),
  plannedQty: integer("planned_qty").notNull(),
  cutQty: integer("cut_qty").default(0).notNull(),
  status: varchar("status").default("DRAFT").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCuttingOrderSchema = createInsertSchema(cuttingOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type CuttingOrder = typeof cuttingOrders.$inferSelect;
export type InsertCuttingOrder = z.infer<typeof insertCuttingOrderSchema>;

export const bundles = pgTable("bundles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  cuttingOrderId: integer("cutting_order_id").references(() => cuttingOrders.id),
  bundleNo: varchar("bundle_no").notNull(),
  bundleUid: varchar("bundle_uid").notNull().unique(),
  ticketId: integer("ticket_id"),
  size: varchar("size").notNull(),
  color: varchar("color").notNull(),
  qty: integer("qty").notNull(),
  goodQty: integer("good_qty").default(0).notNull(),
  rejectQty: integer("reject_qty").default(0).notNull(),
  reworkQty: integer("rework_qty").default(0).notNull(),
  lineId: integer("line_id").references(() => sewingLines.id),
  stage: varchar("stage").default("CUT").notNull(),
  issuedAt: timestamp("issued_at"),
  issuedBy: integer("issued_by").references(() => users.id),
  productionPlanId: integer("production_plan_id").references(() => productionPlans.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBundleSchema = createInsertSchema(bundles).omit({ id: true, createdAt: true, updatedAt: true });
export type Bundle = typeof bundles.$inferSelect;
export type InsertBundle = z.infer<typeof insertBundleSchema>;

export const hourlyProductionEntries = pgTable("hourly_production_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  entryDate: date("entry_date").notNull(),
  hourSlot: varchar("hour_slot").notNull(),
  department: varchar("department").notNull(),
  lineId: integer("line_id").references(() => sewingLines.id),
  productionPlanId: integer("production_plan_id").notNull().references(() => productionPlans.id),
  goodQty: integer("good_qty").default(0).notNull(),
  rejectQty: integer("reject_qty").default(0).notNull(),
  reworkQty: integer("rework_qty").default(0).notNull(),
  operatorsPresent: integer("operators_present"),
  remarks: text("remarks"),
  enteredBy: integer("entered_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHourlyProductionEntrySchema = createInsertSchema(hourlyProductionEntries).omit({ id: true, createdAt: true });
export type HourlyProductionEntry = typeof hourlyProductionEntries.$inferSelect;
export type InsertHourlyProductionEntry = z.infer<typeof insertHourlyProductionEntrySchema>;

export const wipMoves = pgTable("wip_moves", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  bundleId: integer("bundle_id").references(() => bundles.id),
  productionPlanId: integer("production_plan_id").notNull().references(() => productionPlans.id),
  fromStage: varchar("from_stage").notNull(),
  toStage: varchar("to_stage").notNull(),
  qty: integer("qty").notNull(),
  moveDateTime: timestamp("move_date_time").defaultNow().notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWipMoveSchema = createInsertSchema(wipMoves).omit({ id: true, createdAt: true });
export type WipMove = typeof wipMoves.$inferSelect;
export type InsertWipMove = z.infer<typeof insertWipMoveSchema>;

// ═══════════════════════════════════════════════════════════════
// Phase 8.2 — Cutting Deepening
// ═══════════════════════════════════════════════════════════════

export const markerPlans = pgTable("marker_plans", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  styleId: integer("style_id"),
  salesOrderId: integer("sales_order_id"),
  productionPlanId: integer("production_plan_id").references(() => productionPlans.id),
  markerRef: varchar("marker_ref").notNull(),
  width: numeric("width"),
  gsm: numeric("gsm"),
  efficiencyPct: numeric("efficiency_pct"),
  sizeRatio: jsonb("size_ratio"),
  plannedPcs: integer("planned_pcs").notNull(),
  status: varchar("status").default("DRAFT").notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMarkerPlanSchema = createInsertSchema(markerPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type MarkerPlan = typeof markerPlans.$inferSelect;
export type InsertMarkerPlan = z.infer<typeof insertMarkerPlanSchema>;

export const layPlans = pgTable("lay_plans", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  markerPlanId: integer("marker_plan_id").notNull().references(() => markerPlans.id),
  layNo: varchar("lay_no").notNull(),
  plies: integer("plies").notNull(),
  plannedPcs: integer("planned_pcs").notNull(),
  actualPcs: integer("actual_pcs").default(0).notNull(),
  fabricRollRefs: jsonb("fabric_roll_refs"),
  status: varchar("status").default("DRAFT").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLayPlanSchema = createInsertSchema(layPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type LayPlan = typeof layPlans.$inferSelect;
export type InsertLayPlan = z.infer<typeof insertLayPlanSchema>;

export const cuttingTickets = pgTable("cutting_tickets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  layPlanId: integer("lay_plan_id").notNull().references(() => layPlans.id),
  ticketNo: varchar("ticket_no").notNull(),
  size: varchar("size").notNull(),
  color: varchar("color").notNull(),
  plannedQty: integer("planned_qty").notNull(),
  cutQty: integer("cut_qty").default(0).notNull(),
  rejectsQty: integer("rejects_qty").default(0).notNull(),
  status: varchar("status").default("OPEN").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCuttingTicketSchema = createInsertSchema(cuttingTickets).omit({ id: true, createdAt: true, updatedAt: true });
export type CuttingTicket = typeof cuttingTickets.$inferSelect;
export type InsertCuttingTicket = z.infer<typeof insertCuttingTicketSchema>;

export const bundleIssues = pgTable("bundle_issues", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  productionPlanId: integer("production_plan_id").notNull().references(() => productionPlans.id),
  issueNo: varchar("issue_no").notNull(),
  fromDept: varchar("from_dept").default("CUTTING").notNull(),
  toLineId: integer("to_line_id").notNull().references(() => sewingLines.id),
  issueDateTime: timestamp("issue_date_time").defaultNow().notNull(),
  status: varchar("status").default("DRAFT").notNull(),
  requestId: varchar("request_id"),
  postedBy: integer("posted_by").references(() => users.id),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBundleIssueSchema = createInsertSchema(bundleIssues).omit({ id: true, createdAt: true });
export type BundleIssue = typeof bundleIssues.$inferSelect;
export type InsertBundleIssue = z.infer<typeof insertBundleIssueSchema>;

export const bundleIssueLines = pgTable("bundle_issue_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  bundleIssueId: integer("bundle_issue_id").notNull().references(() => bundleIssues.id),
  bundleId: integer("bundle_id").notNull().references(() => bundles.id),
  qtyIssued: integer("qty_issued").notNull(),
});

export const insertBundleIssueLineSchema = createInsertSchema(bundleIssueLines).omit({ id: true });
export type BundleIssueLine = typeof bundleIssueLines.$inferSelect;
export type InsertBundleIssueLine = z.infer<typeof insertBundleIssueLineSchema>;

// ═══════════════════════════════════════════════════════════════
// Phase 8.3 — Sewing Execution
// ═══════════════════════════════════════════════════════════════

export const operationBulletins = pgTable("operation_bulletins", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  styleId: integer("style_id").notNull(),
  obVersion: integer("ob_version").default(1).notNull(),
  status: varchar("status").default("DRAFT").notNull(),
  totalSmv: numeric("total_smv").notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  revisionOfObId: integer("revision_of_ob_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOperationBulletinSchema = createInsertSchema(operationBulletins).omit({ id: true, createdAt: true, updatedAt: true });
export type OperationBulletin = typeof operationBulletins.$inferSelect;
export type InsertOperationBulletin = z.infer<typeof insertOperationBulletinSchema>;

export const operationBulletinOps = pgTable("operation_bulletin_ops", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  obId: integer("ob_id").notNull().references(() => operationBulletins.id),
  opNo: integer("op_no").notNull(),
  opName: varchar("op_name").notNull(),
  smv: numeric("smv").notNull(),
  machineType: varchar("machine_type"),
  sequenceNo: integer("sequence_no").notNull(),
  qcPoints: jsonb("qc_points"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOperationBulletinOpSchema = createInsertSchema(operationBulletinOps).omit({ id: true, createdAt: true });
export type OperationBulletinOp = typeof operationBulletinOps.$inferSelect;
export type InsertOperationBulletinOp = z.infer<typeof insertOperationBulletinOpSchema>;

export const lineLoads = pgTable("line_loads", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  lineId: integer("line_id").notNull().references(() => sewingLines.id),
  shiftId: integer("shift_id").references(() => shifts.id),
  productionPlanId: integer("production_plan_id").references(() => productionPlans.id),
  salesOrderId: integer("sales_order_id"),
  styleId: integer("style_id"),
  obId: integer("ob_id").references(() => operationBulletins.id),
  plannedStartDate: date("planned_start_date"),
  plannedEndDate: date("planned_end_date"),
  targetPerHour: integer("target_per_hour"),
  targetPerDay: integer("target_per_day"),
  plannedEfficiencyPct: numeric("planned_efficiency_pct"),
  plannedManpower: integer("planned_manpower"),
  status: varchar("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLineLoadSchema = createInsertSchema(lineLoads).omit({ id: true, createdAt: true, updatedAt: true });
export type LineLoad = typeof lineLoads.$inferSelect;
export type InsertLineLoad = z.infer<typeof insertLineLoadSchema>;

export const sewingBundleProgress = pgTable("sewing_bundle_progress", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  bundleId: integer("bundle_id").notNull().references(() => bundles.id),
  lineLoadId: integer("line_load_id").notNull().references(() => lineLoads.id),
  status: varchar("status").default("RECEIVED").notNull(),
  goodQty: integer("good_qty").default(0).notNull(),
  reworkQty: integer("rework_qty").default(0).notNull(),
  rejectQty: integer("reject_qty").default(0).notNull(),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSewingBundleProgressSchema = createInsertSchema(sewingBundleProgress).omit({ id: true, createdAt: true });
export type SewingBundleProgress = typeof sewingBundleProgress.$inferSelect;
export type InsertSewingBundleProgress = z.infer<typeof insertSewingBundleProgressSchema>;

export const defectMaster = pgTable("defect_master", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  defectCode: varchar("defect_code").notNull(),
  defectName: varchar("defect_name").notNull(),
  process: varchar("process"),
  category: varchar("category"),
  severity: varchar("severity").default("LOW").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantDefectCodeUnique: unique().on(table.tenantId, table.defectCode),
}));

export const insertDefectMasterSchema = createInsertSchema(defectMaster).omit({ id: true, createdAt: true });
export type DefectMaster = typeof defectMaster.$inferSelect;
export type InsertDefectMaster = z.infer<typeof insertDefectMasterSchema>;

// ═══════════════════════════════════════════════════════════════
// Phase 8.4 — Finishing + Packing
// ═══════════════════════════════════════════════════════════════

export const finishingBatches = pgTable("finishing_batches", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  productionPlanId: integer("production_plan_id").references(() => productionPlans.id),
  salesOrderId: integer("sales_order_id"),
  styleId: integer("style_id"),
  batchNo: varchar("batch_no").notNull(),
  status: varchar("status").default("DRAFT").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFinishingBatchSchema = createInsertSchema(finishingBatches).omit({ id: true, createdAt: true, updatedAt: true });
export type FinishingBatch = typeof finishingBatches.$inferSelect;
export type InsertFinishingBatch = z.infer<typeof insertFinishingBatchSchema>;

export const finishingEntries = pgTable("finishing_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  finishingBatchId: integer("finishing_batch_id").notNull().references(() => finishingBatches.id),
  entryDate: date("entry_date").notNull(),
  hourSlot: varchar("hour_slot"),
  shiftId: integer("shift_id").references(() => shifts.id),
  goodQty: integer("good_qty").default(0).notNull(),
  reworkQty: integer("rework_qty").default(0).notNull(),
  rejectQty: integer("reject_qty").default(0).notNull(),
  remarks: text("remarks"),
  enteredBy: integer("entered_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFinishingEntrySchema = createInsertSchema(finishingEntries).omit({ id: true, createdAt: true });
export type FinishingEntry = typeof finishingEntries.$inferSelect;
export type InsertFinishingEntry = z.infer<typeof insertFinishingEntrySchema>;

export const packingBatches = pgTable("packing_batches", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  productionPlanId: integer("production_plan_id").references(() => productionPlans.id),
  salesOrderId: integer("sales_order_id"),
  styleId: integer("style_id"),
  batchNo: varchar("batch_no").notNull(),
  status: varchar("status").default("DRAFT").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPackingBatchSchema = createInsertSchema(packingBatches).omit({ id: true, createdAt: true, updatedAt: true });
export type PackingBatch = typeof packingBatches.$inferSelect;
export type InsertPackingBatch = z.infer<typeof insertPackingBatchSchema>;

export const packUnits = pgTable("pack_units", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  packingBatchId: integer("packing_batch_id").notNull().references(() => packingBatches.id),
  size: varchar("size").notNull(),
  color: varchar("color").notNull(),
  qtyPacked: integer("qty_packed").default(0).notNull(),
  qtyRework: integer("qty_rework").default(0).notNull(),
  qtyRejected: integer("qty_rejected").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPackUnitSchema = createInsertSchema(packUnits).omit({ id: true, createdAt: true });
export type PackUnit = typeof packUnits.$inferSelect;
export type InsertPackUnit = z.infer<typeof insertPackUnitSchema>;

export const cartons = pgTable("cartons", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  packingBatchId: integer("packing_batch_id").references(() => packingBatches.id),
  cartonNo: varchar("carton_no").notNull(),
  grossWeight: numeric("gross_weight"),
  netWeight: numeric("net_weight"),
  cbm: numeric("cbm"),
  status: varchar("status").default("OPEN").notNull(),
  sealedBy: integer("sealed_by").references(() => users.id),
  sealedAt: timestamp("sealed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCartonSchema = createInsertSchema(cartons).omit({ id: true, createdAt: true, updatedAt: true });
export type Carton = typeof cartons.$inferSelect;
export type InsertCarton = z.infer<typeof insertCartonSchema>;

export const cartonLines = pgTable("carton_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  cartonId: integer("carton_id").notNull().references(() => cartons.id),
  size: varchar("size").notNull(),
  color: varchar("color").notNull(),
  qty: integer("qty").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCartonLineSchema = createInsertSchema(cartonLines).omit({ id: true, createdAt: true });
export type CartonLine = typeof cartonLines.$inferSelect;
export type InsertCartonLine = z.infer<typeof insertCartonLineSchema>;

export const packingLists = pgTable("packing_lists", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  shipmentId: integer("shipment_id"),
  packingListNo: varchar("packing_list_no").notNull(),
  salesOrderId: integer("sales_order_id"),
  totalCartons: integer("total_cartons").default(0).notNull(),
  totalQty: integer("total_qty").default(0).notNull(),
  status: varchar("status").default("DRAFT").notNull(),
  issuedAt: timestamp("issued_at"),
  issuedBy: integer("issued_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPackingListSchema = createInsertSchema(packingLists).omit({ id: true, createdAt: true, updatedAt: true });
export type PackingList = typeof packingLists.$inferSelect;
export type InsertPackingList = z.infer<typeof insertPackingListSchema>;

export const packingListCartons = pgTable("packing_list_cartons", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  packingListId: integer("packing_list_id").notNull().references(() => packingLists.id),
  cartonId: integer("carton_id").notNull().references(() => cartons.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPackingListCartonSchema = createInsertSchema(packingListCartons).omit({ id: true, createdAt: true });
export type PackingListCarton = typeof packingListCartons.$inferSelect;
export type InsertPackingListCarton = z.infer<typeof insertPackingListCartonSchema>;

// ═══════════════════════════════════════════════════════════════
// Phase 9.1 — QC
// ═══════════════════════════════════════════════════════════════

export const qcInspections = pgTable("qc_inspections", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  type: varchar("type").notNull(),
  department: varchar("department").notNull(),
  productionPlanId: integer("production_plan_id").references(() => productionPlans.id),
  lineId: integer("line_id").references(() => sewingLines.id),
  bundleId: integer("bundle_id").references(() => bundles.id),
  cartonId: integer("carton_id").references(() => cartons.id),
  packingListId: integer("packing_list_id").references(() => packingLists.id),
  shipmentId: integer("shipment_id"),
  inspectionDateTime: timestamp("inspection_date_time").defaultNow().notNull(),
  inspectedQty: integer("inspected_qty").notNull(),
  defectQty: integer("defect_qty").default(0).notNull(),
  result: varchar("result").notNull(),
  inspectorUserId: integer("inspector_user_id").notNull().references(() => users.id),
  remarks: text("remarks"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertQcInspectionSchema = createInsertSchema(qcInspections).omit({ id: true, createdAt: true });
export type QcInspection = typeof qcInspections.$inferSelect;
export type InsertQcInspection = z.infer<typeof insertQcInspectionSchema>;

export const qcInspectionDefects = pgTable("qc_inspection_defects", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  inspectionId: integer("inspection_id").notNull().references(() => qcInspections.id),
  defectId: integer("defect_id").notNull().references(() => defectMaster.id),
  count: integer("count").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertQcInspectionDefectSchema = createInsertSchema(qcInspectionDefects).omit({ id: true, createdAt: true });
export type QcInspectionDefect = typeof qcInspectionDefects.$inferSelect;
export type InsertQcInspectionDefect = z.infer<typeof insertQcInspectionDefectSchema>;

export const qcFinalLots = pgTable("qc_final_lots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  relatedType: varchar("related_type").notNull(),
  relatedId: integer("related_id").notNull(),
  lotNo: varchar("lot_no").notNull(),
  totalQty: integer("total_qty").notNull(),
  cartonCount: integer("carton_count").default(0).notNull(),
  sampleSize: integer("sample_size").notNull(),
  allowedDefects: integer("allowed_defects").notNull(),
  foundDefects: integer("found_defects").default(0).notNull(),
  status: varchar("status").default("PLANNED").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertQcFinalLotSchema = createInsertSchema(qcFinalLots).omit({ id: true, createdAt: true, updatedAt: true });
export type QcFinalLot = typeof qcFinalLots.$inferSelect;
export type InsertQcFinalLot = z.infer<typeof insertQcFinalLotSchema>;

export const qcCorrectiveActions = pgTable("qc_corrective_actions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  inspectionId: integer("inspection_id").references(() => qcInspections.id),
  finalLotId: integer("final_lot_id").references(() => qcFinalLots.id),
  actionType: varchar("action_type").notNull(),
  ownerUserId: integer("owner_user_id").references(() => users.id),
  dueDate: date("due_date"),
  status: varchar("status").default("OPEN").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertQcCorrectiveActionSchema = createInsertSchema(qcCorrectiveActions).omit({ id: true, createdAt: true, updatedAt: true });
export type QcCorrectiveAction = typeof qcCorrectiveActions.$inferSelect;
export type InsertQcCorrectiveAction = z.infer<typeof insertQcCorrectiveActionSchema>;

// ═══════════════════════════════════════════════════════════════
// Phase 9.2 — IE/SMV
// ═══════════════════════════════════════════════════════════════

export const ieOperationsLibrary = pgTable("ie_operations_library", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  opCode: varchar("op_code").notNull(),
  opName: varchar("op_name").notNull(),
  defaultSmv: numeric("default_smv").notNull(),
  machineType: varchar("machine_type"),
  category: varchar("category"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantOpCodeUnique: unique().on(table.tenantId, table.opCode),
}));

export const insertIeOperationsLibrarySchema = createInsertSchema(ieOperationsLibrary).omit({ id: true, createdAt: true });
export type IeOperationsLibrary = typeof ieOperationsLibrary.$inferSelect;
export type InsertIeOperationsLibrary = z.infer<typeof insertIeOperationsLibrarySchema>;

export const ieLineConfigs = pgTable("ie_line_configs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  lineId: integer("line_id").notNull().references(() => sewingLines.id),
  defaultShiftMinutes: integer("default_shift_minutes").notNull(),
  defaultEfficiencyPct: numeric("default_efficiency_pct").notNull(),
  standardManpower: integer("standard_manpower").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertIeLineConfigSchema = createInsertSchema(ieLineConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type IeLineConfig = typeof ieLineConfigs.$inferSelect;
export type InsertIeLineConfig = z.infer<typeof insertIeLineConfigSchema>;

// ═══════════════════════════════════════════════════════════════
// Phase 9.3 — Skill Matrix
// ═══════════════════════════════════════════════════════════════

export const factoryOperators = pgTable("factory_operators", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  empId: integer("emp_id"),
  name: varchar("name").notNull(),
  grade: varchar("grade"),
  status: varchar("status").default("ACTIVE").notNull(),
  defaultLineId: integer("default_line_id").references(() => sewingLines.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFactoryOperatorSchema = createInsertSchema(factoryOperators).omit({ id: true, createdAt: true, updatedAt: true });
export type FactoryOperator = typeof factoryOperators.$inferSelect;
export type InsertFactoryOperator = z.infer<typeof insertFactoryOperatorSchema>;

export const operatorSkills = pgTable("operator_skills", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  operatorId: integer("operator_id").notNull().references(() => factoryOperators.id),
  opCode: varchar("op_code"),
  machineType: varchar("machine_type"),
  skillLevel: integer("skill_level").default(1).notNull(),
  speedFactor: numeric("speed_factor"),
  lastAssessedAt: timestamp("last_assessed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOperatorSkillSchema = createInsertSchema(operatorSkills).omit({ id: true, createdAt: true });
export type OperatorSkill = typeof operatorSkills.$inferSelect;
export type InsertOperatorSkill = z.infer<typeof insertOperatorSkillSchema>;

export const lineOperatorAssignments = pgTable("line_operator_assignments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  lineLoadId: integer("line_load_id").notNull().references(() => lineLoads.id),
  operatorId: integer("operator_id").notNull().references(() => factoryOperators.id),
  assignedOpCode: varchar("assigned_op_code"),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  removedAt: timestamp("removed_at"),
});

export const insertLineOperatorAssignmentSchema = createInsertSchema(lineOperatorAssignments).omit({ id: true });
export type LineOperatorAssignment = typeof lineOperatorAssignments.$inferSelect;
export type InsertLineOperatorAssignment = z.infer<typeof insertLineOperatorAssignmentSchema>;

export const lineBalanceRuns = pgTable("line_balance_runs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  lineLoadId: integer("line_load_id").notNull().references(() => lineLoads.id),
  runDate: date("run_date").notNull(),
  totalSmv: numeric("total_smv").notNull(),
  operatorsCount: integer("operators_count").notNull(),
  predictedTargetPerHour: numeric("predicted_target_per_hour"),
  bottleneckOps: jsonb("bottleneck_ops"),
  recommendation: jsonb("recommendation"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLineBalanceRunSchema = createInsertSchema(lineBalanceRuns).omit({ id: true, createdAt: true });
export type LineBalanceRun = typeof lineBalanceRuns.$inferSelect;
export type InsertLineBalanceRun = z.infer<typeof insertLineBalanceRunSchema>;

// ═══════════════════════════════════════════════════════════════
// Phase 9.4 — Advanced Planning
// ═══════════════════════════════════════════════════════════════

export const capacityResources = pgTable("capacity_resources", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  type: varchar("type").notNull(),
  resourceCode: varchar("resource_code").notNull(),
  attributes: jsonb("attributes"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantResourceCodeUnique: unique().on(table.tenantId, table.resourceCode),
}));

export const insertCapacityResourceSchema = createInsertSchema(capacityResources).omit({ id: true, createdAt: true, updatedAt: true });
export type CapacityResource = typeof capacityResources.$inferSelect;
export type InsertCapacityResource = z.infer<typeof insertCapacityResourceSchema>;

export const capacityCalendars = pgTable("capacity_calendars", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  resourceId: integer("resource_id").notNull().references(() => capacityResources.id),
  date: date("date").notNull(),
  availableMinutes: integer("available_minutes"),
  availableQty: numeric("available_qty"),
  downtimeMinutes: integer("downtime_minutes").default(0).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCapacityCalendarSchema = createInsertSchema(capacityCalendars).omit({ id: true, createdAt: true });
export type CapacityCalendar = typeof capacityCalendars.$inferSelect;
export type InsertCapacityCalendar = z.infer<typeof insertCapacityCalendarSchema>;

export const planningJobs = pgTable("planning_jobs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  jobType: varchar("job_type").notNull(),
  sourceType: varchar("source_type").notNull(),
  sourceId: integer("source_id").notNull(),
  requiredQty: numeric("required_qty").notNull(),
  dueDate: date("due_date").notNull(),
  constraints: jsonb("constraints"),
  status: varchar("status").default("OPEN").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlanningJobSchema = createInsertSchema(planningJobs).omit({ id: true, createdAt: true, updatedAt: true });
export type PlanningJob = typeof planningJobs.$inferSelect;
export type InsertPlanningJob = z.infer<typeof insertPlanningJobSchema>;

export const planningAllocations = pgTable("planning_allocations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  planningJobId: integer("planning_job_id").notNull().references(() => planningJobs.id),
  resourceId: integer("resource_id").notNull().references(() => capacityResources.id),
  date: date("date").notNull(),
  allocatedQty: numeric("allocated_qty"),
  allocatedMinutes: integer("allocated_minutes"),
  status: varchar("status").default("PLANNED").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPlanningAllocationSchema = createInsertSchema(planningAllocations).omit({ id: true, createdAt: true });
export type PlanningAllocation = typeof planningAllocations.$inferSelect;
export type InsertPlanningAllocation = z.infer<typeof insertPlanningAllocationSchema>;

// ═══════════════════════════════════════════════════════════════
// Phase 10.1 — AI Assistant
// ═══════════════════════════════════════════════════════════════

export const assistantThreads = pgTable("assistant_threads", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  title: varchar("title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssistantThreadSchema = createInsertSchema(assistantThreads).omit({ id: true, createdAt: true });
export type AssistantThread = typeof assistantThreads.$inferSelect;
export type InsertAssistantThread = z.infer<typeof insertAssistantThreadSchema>;

export const assistantMessages = pgTable("assistant_messages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  threadId: integer("thread_id").notNull().references(() => assistantThreads.id, { onDelete: "cascade" }),
  role: varchar("role").notNull(),
  content: text("content").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssistantMessageSchema = createInsertSchema(assistantMessages).omit({ id: true, createdAt: true });
export type AssistantMessage = typeof assistantMessages.$inferSelect;
export type InsertAssistantMessage = z.infer<typeof insertAssistantMessageSchema>;

export const assistantAuditLog = pgTable("assistant_audit_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  threadId: integer("thread_id").references(() => assistantThreads.id),
  action: varchar("action").notNull(),
  metadata: jsonb("metadata"),
  ipAddress: varchar("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssistantAuditLogSchema = createInsertSchema(assistantAuditLog).omit({ id: true, createdAt: true });
export type AssistantAuditLog = typeof assistantAuditLog.$inferSelect;
export type InsertAssistantAuditLog = z.infer<typeof insertAssistantAuditLogSchema>;

// ═══════════════════════════════════════════════════════════════
// Phase 10.2 — AI Automation
// ═══════════════════════════════════════════════════════════════

export const automationRules = pgTable("automation_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name").notNull(),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  triggerType: varchar("trigger_type").notNull(),
  eventKey: varchar("event_key"),
  scheduleCron: varchar("schedule_cron"),
  conditions: jsonb("conditions"),
  actions: jsonb("actions"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAutomationRuleSchema = createInsertSchema(automationRules).omit({ id: true, createdAt: true, updatedAt: true });
export type AutomationRule = typeof automationRules.$inferSelect;
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;

export const automationRuns = pgTable("automation_runs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  ruleId: integer("rule_id").notNull().references(() => automationRules.id),
  status: varchar("status").default("QUEUED").notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  inputContext: jsonb("input_context"),
  result: jsonb("result"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAutomationRunSchema = createInsertSchema(automationRuns).omit({ id: true, createdAt: true });
export type AutomationRun = typeof automationRuns.$inferSelect;
export type InsertAutomationRun = z.infer<typeof insertAutomationRunSchema>;

export const automationNotifications = pgTable("automation_notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  runId: integer("run_id").references(() => automationRuns.id),
  channel: varchar("channel").notNull(),
  recipientUserId: integer("recipient_user_id").references(() => users.id),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAutomationNotificationSchema = createInsertSchema(automationNotifications).omit({ id: true, createdAt: true });
export type AutomationNotification = typeof automationNotifications.$inferSelect;
export type InsertAutomationNotification = z.infer<typeof insertAutomationNotificationSchema>;

// ===================== ORDER DELIVERIES + DELIVERY LINES =====================

export const orderDeliveries = pgTable("order_deliveries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  deliveryNo: integer("delivery_no").default(1).notNull(),
  exFactoryDate: date("ex_factory_date"),
  shipDate: date("ship_date"),
  destination: varchar("destination", { length: 200 }),
  incoterm: varchar("incoterm", { length: 20 }),
  remarks: text("remarks"),
  status: varchar("status", { length: 30 }).default("PLANNED").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantOrderDeliveryUnique: unique("order_deliveries_tenant_order_delivery_unique").on(table.tenantId, table.orderId, table.deliveryNo),
  tenantIdx: index("order_deliveries_tenant_idx").on(table.tenantId),
}));

export const insertOrderDeliverySchema = createInsertSchema(orderDeliveries).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type OrderDelivery = typeof orderDeliveries.$inferSelect;
export type InsertOrderDelivery = z.infer<typeof insertOrderDeliverySchema>;

export const orderDeliveryLines = pgTable("order_delivery_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  orderDeliveryId: integer("order_delivery_id").notNull().references(() => orderDeliveries.id, { onDelete: "cascade" }),
  styleId: integer("style_id").notNull().references(() => styles.id),
  componentId: integer("component_id").references(() => styleComponents.id),
  colorwayId: integer("colorway_id").references(() => styleColorways.id),
  size: varchar("size", { length: 30 }).notNull(),
  qty: integer("qty").notNull(),
  packType: varchar("pack_type", { length: 20 }).default("SINGLE"),
  pcsPerPack: integer("pcs_per_pack").default(1),
  netQty: integer("net_qty").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("order_delivery_lines_tenant_idx").on(table.tenantId),
}));

export const insertOrderDeliveryLineSchema = createInsertSchema(orderDeliveryLines).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type OrderDeliveryLine = typeof orderDeliveryLines.$inferSelect;
export type InsertOrderDeliveryLine = z.infer<typeof insertOrderDeliveryLineSchema>;

// ===================== BOM OVERRIDE REQUESTS =====================

export const bomOverrideRequests = pgTable("bom_override_requests", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  styleBomId: integer("style_bom_id").notNull().references(() => styleBoms.id),
  bomLineId: integer("bom_line_id").references(() => styleBomLines.id),
  requestedBy: integer("requested_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  overrideData: jsonb("override_data").notNull(),
  status: varchar("status", { length: 20 }).default("PENDING").notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("bom_override_requests_tenant_idx").on(table.tenantId),
}));

export const insertBomOverrideRequestSchema = createInsertSchema(bomOverrideRequests).omit({
  id: true, createdAt: true, updatedAt: true, approvedAt: true,
});
export type BomOverrideRequest = typeof bomOverrideRequests.$inferSelect;
export type InsertBomOverrideRequest = z.infer<typeof insertBomOverrideRequestSchema>;

// ===================== RM REQUIREMENTS =====================

export const rmRequirements = pgTable("rm_requirements", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  orderId: integer("order_id").notNull().references(() => orders.id),
  styleBomId: integer("style_bom_id").references(() => styleBoms.id),
  status: varchar("status", { length: 20 }).default("DRAFT").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("rm_requirements_tenant_idx").on(table.tenantId),
}));

export const insertRmRequirementSchema = createInsertSchema(rmRequirements).omit({
  id: true, createdAt: true, updatedAt: true, generatedAt: true, approvedAt: true,
});
export type RmRequirement = typeof rmRequirements.$inferSelect;
export type InsertRmRequirement = z.infer<typeof insertRmRequirementSchema>;

export const rmRequirementLines = pgTable("rm_requirement_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  rmRequirementId: integer("rm_requirement_id").notNull().references(() => rmRequirements.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => items.id),
  itemDescription: varchar("item_description", { length: 255 }),
  uom: varchar("uom", { length: 20 }),
  grossQty: numeric("gross_qty", { precision: 15, scale: 4 }).notNull(),
  wastageQty: numeric("wastage_qty", { precision: 15, scale: 4 }).default("0"),
  bufferQty: numeric("buffer_qty", { precision: 15, scale: 4 }).default("0"),
  netRequiredQty: numeric("net_required_qty", { precision: 15, scale: 4 }).notNull(),
  availableStock: numeric("available_stock", { precision: 15, scale: 4 }).default("0"),
  openPoQty: numeric("open_po_qty", { precision: 15, scale: 4 }).default("0"),
  shortageQty: numeric("shortage_qty", { precision: 15, scale: 4 }).default("0"),
  componentId: integer("component_id").references(() => styleComponents.id),
  bomLineId: integer("bom_line_id").references(() => styleBomLines.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("rm_requirement_lines_tenant_idx").on(table.tenantId),
}));

export const insertRmRequirementLineSchema = createInsertSchema(rmRequirementLines).omit({
  id: true, createdAt: true,
});
export type RmRequirementLine = typeof rmRequirementLines.$inferSelect;
export type InsertRmRequirementLine = z.infer<typeof insertRmRequirementLineSchema>;

// === BANK RECONCILIATION ===

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  accountName: varchar("account_name", { length: 200 }).notNull(),
  bankName: varchar("bank_name", { length: 200 }).notNull(),
  accountNumber: varchar("account_number", { length: 50 }),
  branchName: varchar("branch_name", { length: 200 }),
  routingNumber: varchar("routing_number", { length: 50 }),
  swiftCode: varchar("swift_code", { length: 20 }),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  glAccountId: integer("gl_account_id"),
  isActive: boolean("is_active").default(true),
  openingBalance: numeric("opening_balance", { precision: 18, scale: 2 }).default("0"),
  currentBalance: numeric("current_balance", { precision: 18, scale: 2 }).default("0"),
  lastReconciledDate: date("last_reconciled_date"),
  lastReconciledBalance: numeric("last_reconciled_balance", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bankStatements = pgTable("bank_statements", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  bankAccountId: integer("bank_account_id").notNull(),
  statementDate: date("statement_date").notNull(),
  fileName: varchar("file_name", { length: 500 }),
  importedAt: timestamp("imported_at").defaultNow(),
  importedBy: integer("imported_by"),
  totalEntries: integer("total_entries").default(0),
  matchedEntries: integer("matched_entries").default(0),
  unmatchedEntries: integer("unmatched_entries").default(0),
  status: varchar("status", { length: 20 }).default("IMPORTED"),
});

export const bankStatementLines = pgTable("bank_statement_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  statementId: integer("statement_id").notNull(),
  transactionDate: date("transaction_date").notNull(),
  valueDate: date("value_date"),
  description: text("description"),
  reference: varchar("reference", { length: 200 }),
  debitAmount: numeric("debit_amount", { precision: 18, scale: 2 }).default("0"),
  creditAmount: numeric("credit_amount", { precision: 18, scale: 2 }).default("0"),
  balance: numeric("balance", { precision: 18, scale: 2 }),
  matchStatus: varchar("match_status", { length: 20 }).default("UNMATCHED"),
  matchedVoucherId: integer("matched_voucher_id"),
  matchedAt: timestamp("matched_at"),
  matchedBy: integer("matched_by"),
  matchConfidence: numeric("match_confidence", { precision: 5, scale: 2 }),
  notes: text("notes"),
});

export const bankReconciliations = pgTable("bank_reconciliations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  bankAccountId: integer("bank_account_id").notNull(),
  reconciliationDate: date("reconciliation_date").notNull(),
  statementBalance: numeric("statement_balance", { precision: 18, scale: 2 }).notNull(),
  bookBalance: numeric("book_balance", { precision: 18, scale: 2 }).notNull(),
  adjustedBalance: numeric("adjusted_balance", { precision: 18, scale: 2 }),
  status: varchar("status", { length: 20 }).default("DRAFT"),
  reconciledBy: integer("reconciled_by"),
  reconciledAt: timestamp("reconciled_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paymentRuns = pgTable("payment_runs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  runNumber: varchar("run_number", { length: 50 }).notNull(),
  bankAccountId: integer("bank_account_id").notNull(),
  runDate: date("run_date").notNull(),
  status: varchar("status", { length: 20 }).default("DRAFT"),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).default("0"),
  totalPayments: integer("total_payments").default(0),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  processedBy: integer("processed_by"),
  processedAt: timestamp("processed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paymentRunLines = pgTable("payment_run_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  paymentRunId: integer("payment_run_id").notNull(),
  partyId: integer("party_id").notNull(),
  billReferenceId: integer("bill_reference_id"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }).default("BANK_TRANSFER"),
  status: varchar("status", { length: 20 }).default("PENDING"),
  voucherId: integer("voucher_id"),
  notes: text("notes"),
});

export const insertBankAccountSchema = createInsertSchema(bankAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccounts.$inferSelect;

export const insertBankStatementSchema = createInsertSchema(bankStatements).omit({ id: true, importedAt: true });
export type InsertBankStatement = z.infer<typeof insertBankStatementSchema>;
export type BankStatement = typeof bankStatements.$inferSelect;

export const insertBankStatementLineSchema = createInsertSchema(bankStatementLines).omit({ id: true, matchedAt: true });
export type InsertBankStatementLine = z.infer<typeof insertBankStatementLineSchema>;
export type BankStatementLine = typeof bankStatementLines.$inferSelect;

export const insertBankReconciliationSchema = createInsertSchema(bankReconciliations).omit({ id: true, createdAt: true, reconciledAt: true });
export type InsertBankReconciliation = z.infer<typeof insertBankReconciliationSchema>;
export type BankReconciliation = typeof bankReconciliations.$inferSelect;

export const insertPaymentRunSchema = createInsertSchema(paymentRuns).omit({ id: true, createdAt: true, approvedAt: true, processedAt: true });
export type InsertPaymentRun = z.infer<typeof insertPaymentRunSchema>;
export type PaymentRun = typeof paymentRuns.$inferSelect;

export const insertPaymentRunLineSchema = createInsertSchema(paymentRunLines).omit({ id: true });
export type InsertPaymentRunLine = z.infer<typeof insertPaymentRunLineSchema>;
export type PaymentRunLine = typeof paymentRunLines.$inferSelect;

// === LOT / BATCH TRACEABILITY ===

export const lots = pgTable("lots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  lotNumber: varchar("lot_number", { length: 100 }).notNull(),
  itemId: integer("item_id").notNull(),
  warehouseId: integer("warehouse_id"),
  supplierId: integer("supplier_id"),
  purchaseOrderId: integer("purchase_order_id"),
  grnId: integer("grn_id"),
  batchDate: date("batch_date"),
  expiryDate: date("expiry_date"),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  remainingQty: numeric("remaining_qty", { precision: 18, scale: 4 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 18, scale: 4 }),
  status: varchar("status", { length: 20 }).default("AVAILABLE"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lotTransactions = pgTable("lot_transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  lotId: integer("lot_id").notNull(),
  transactionType: varchar("transaction_type", { length: 30 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  fromWarehouseId: integer("from_warehouse_id"),
  toWarehouseId: integer("to_warehouse_id"),
  performedBy: integer("performed_by"),
  transactionDate: timestamp("transaction_date").defaultNow(),
  notes: text("notes"),
});

export const lotAllocations = pgTable("lot_allocations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  lotId: integer("lot_id").notNull(),
  allocationType: varchar("allocation_type", { length: 30 }).notNull(),
  allocationId: integer("allocation_id").notNull(),
  allocatedQty: numeric("allocated_qty", { precision: 18, scale: 4 }).notNull(),
  issuedQty: numeric("issued_qty", { precision: 18, scale: 4 }).default("0"),
  status: varchar("status", { length: 20 }).default("ALLOCATED"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLotSchema = createInsertSchema(lots).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLot = z.infer<typeof insertLotSchema>;
export type Lot = typeof lots.$inferSelect;

export const insertLotTransactionSchema = createInsertSchema(lotTransactions).omit({ id: true, transactionDate: true });
export type InsertLotTransaction = z.infer<typeof insertLotTransactionSchema>;
export type LotTransaction = typeof lotTransactions.$inferSelect;

export const insertLotAllocationSchema = createInsertSchema(lotAllocations).omit({ id: true, createdAt: true });
export type InsertLotAllocation = z.infer<typeof insertLotAllocationSchema>;
export type LotAllocation = typeof lotAllocations.$inferSelect;

// === QUALITY MANAGEMENT ===

export const qcParameters = pgTable("qc_parameters", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }),
  measurementType: varchar("measurement_type", { length: 50 }),
  unit: varchar("unit", { length: 50 }),
  minValue: numeric("min_value", { precision: 18, scale: 4 }),
  maxValue: numeric("max_value", { precision: 18, scale: 4 }),
  targetValue: numeric("target_value", { precision: 18, scale: 4 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const qcTemplates = pgTable("qc_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }),
  inspectionStage: varchar("inspection_stage", { length: 50 }),
  aqlLevel: varchar("aql_level", { length: 20 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const qcTemplateParameters = pgTable("qc_template_parameters", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull(),
  parameterId: integer("parameter_id").notNull(),
  isMandatory: boolean("is_mandatory").default(true),
  sortOrder: integer("sort_order").default(0),
});

export const qcInspections2 = pgTable("qc_inspections_v2", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  inspectionNumber: varchar("inspection_number", { length: 50 }).notNull(),
  templateId: integer("template_id"),
  inspectionType: varchar("inspection_type", { length: 50 }).notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  lotId: integer("lot_id"),
  itemId: integer("item_id"),
  sampleSize: integer("sample_size"),
  inspectedQty: integer("inspected_qty"),
  passedQty: integer("passed_qty"),
  failedQty: integer("failed_qty"),
  overallResult: varchar("overall_result", { length: 20 }),
  status: varchar("status", { length: 20 }).default("DRAFT"),
  inspectedBy: integer("inspected_by"),
  inspectedAt: timestamp("inspected_at"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const qcInspectionResults2 = pgTable("qc_inspection_results_v2", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  inspectionId: integer("inspection_id").notNull(),
  parameterId: integer("parameter_id").notNull(),
  measuredValue: numeric("measured_value", { precision: 18, scale: 4 }),
  textResult: varchar("text_result", { length: 200 }),
  result: varchar("result", { length: 20 }),
  defectType: varchar("defect_type", { length: 100 }),
  defectSeverity: varchar("defect_severity", { length: 20 }),
  notes: text("notes"),
});

export const qcHoldReleases = pgTable("qc_hold_releases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  referenceType: varchar("reference_type", { length: 50 }).notNull(),
  referenceId: integer("reference_id").notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  reason: text("reason").notNull(),
  performedBy: integer("performed_by").notNull(),
  performedAt: timestamp("performed_at").defaultNow(),
  previousStatus: varchar("previous_status", { length: 30 }),
  newStatus: varchar("new_status", { length: 30 }),
});

export const labTests = pgTable("lab_tests", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  testNumber: varchar("test_number", { length: 50 }).notNull(),
  testName: varchar("test_name", { length: 200 }).notNull(),
  labName: varchar("lab_name", { length: 200 }),
  itemId: integer("item_id"),
  lotId: integer("lot_id"),
  sampleId: varchar("sample_id", { length: 100 }),
  testCategory: varchar("test_category", { length: 100 }),
  sentDate: date("sent_date"),
  expectedDate: date("expected_date"),
  receivedDate: date("received_date"),
  overallResult: varchar("overall_result", { length: 20 }),
  status: varchar("status", { length: 20 }).default("PENDING"),
  reportUrl: text("report_url"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const capaActions = pgTable("capa_actions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  capaNumber: varchar("capa_number", { length: 50 }).notNull(),
  capaType: varchar("capa_type", { length: 20 }).notNull(),
  sourceType: varchar("source_type", { length: 50 }),
  sourceId: integer("source_id"),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  rootCause: text("root_cause"),
  proposedAction: text("proposed_action"),
  assignedTo: integer("assigned_to"),
  priority: varchar("priority", { length: 20 }).default("MEDIUM"),
  dueDate: date("due_date"),
  completedDate: date("completed_date"),
  status: varchar("status", { length: 20 }).default("OPEN"),
  verifiedBy: integer("verified_by"),
  verifiedAt: timestamp("verified_at"),
  effectivenessCheck: text("effectiveness_check"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const returnRequests = pgTable("return_requests", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  returnNumber: varchar("return_number", { length: 50 }).notNull(),
  returnType: varchar("return_type", { length: 20 }).notNull(),
  partyId: integer("party_id"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).default("PENDING"),
  totalItems: integer("total_items").default(0),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).default("0"),
  qcInspectionId: integer("qc_inspection_id"),
  creditNoteId: integer("credit_note_id"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const returnRequestLines = pgTable("return_request_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  returnRequestId: integer("return_request_id").notNull(),
  itemId: integer("item_id").notNull(),
  lotId: integer("lot_id"),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 18, scale: 4 }),
  reason: text("reason"),
  condition: varchar("condition", { length: 20 }),
});

export const insertQcParameterSchema = createInsertSchema(qcParameters).omit({ id: true, createdAt: true });
export type InsertQcParameter = z.infer<typeof insertQcParameterSchema>;
export type QcParameter = typeof qcParameters.$inferSelect;

export const insertQcTemplateSchema = createInsertSchema(qcTemplates).omit({ id: true, createdAt: true });
export type InsertQcTemplate = z.infer<typeof insertQcTemplateSchema>;
export type QcTemplate = typeof qcTemplates.$inferSelect;

export const insertQcTemplateParameterSchema = createInsertSchema(qcTemplateParameters).omit({ id: true });
export type InsertQcTemplateParameter = z.infer<typeof insertQcTemplateParameterSchema>;
export type QcTemplateParameter = typeof qcTemplateParameters.$inferSelect;

export const insertQcInspection2Schema = createInsertSchema(qcInspections2).omit({ id: true, createdAt: true, inspectedAt: true, approvedAt: true });
export type InsertQcInspection2 = z.infer<typeof insertQcInspection2Schema>;
export type QcInspection2 = typeof qcInspections2.$inferSelect;

export const insertQcInspectionResultSchema = createInsertSchema(qcInspectionResults2).omit({ id: true });
export type InsertQcInspectionResult = z.infer<typeof insertQcInspectionResultSchema>;
export type QcInspectionResult = typeof qcInspectionResults2.$inferSelect;

export const insertQcHoldReleaseSchema = createInsertSchema(qcHoldReleases).omit({ id: true, performedAt: true });
export type InsertQcHoldRelease = z.infer<typeof insertQcHoldReleaseSchema>;
export type QcHoldRelease = typeof qcHoldReleases.$inferSelect;

export const insertLabTestSchema = createInsertSchema(labTests).omit({ id: true, createdAt: true });
export type InsertLabTest = z.infer<typeof insertLabTestSchema>;
export type LabTest = typeof labTests.$inferSelect;

export const insertCapaActionSchema = createInsertSchema(capaActions).omit({ id: true, createdAt: true, verifiedAt: true });
export type InsertCapaAction = z.infer<typeof insertCapaActionSchema>;
export type CapaAction = typeof capaActions.$inferSelect;

export const insertReturnRequestSchema = createInsertSchema(returnRequests).omit({ id: true, createdAt: true, approvedAt: true });
export type InsertReturnRequest = z.infer<typeof insertReturnRequestSchema>;
export type ReturnRequest = typeof returnRequests.$inferSelect;

export const insertReturnRequestLineSchema = createInsertSchema(returnRequestLines).omit({ id: true });
export type InsertReturnRequestLine = z.infer<typeof insertReturnRequestLineSchema>;

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  phone: text("phone"),
  message: text("message").notNull(),
  companySize: text("company_size"),
  source: text("source").default("website"),
  status: text("status").default("new").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true, status: true, source: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;
export type ReturnRequestLine = typeof returnRequestLines.$inferSelect;

export const orderAmendments = pgTable("order_amendments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  orderId: integer("order_id").notNull(),
  amendmentNumber: integer("amendment_number").notNull(),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reason: text("reason").notNull(),
  requestedBy: integer("requested_by").notNull().references(() => users.id),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderAmendmentSchema = createInsertSchema(orderAmendments).omit({ id: true, createdAt: true, approvedAt: true });
export type InsertOrderAmendment = z.infer<typeof insertOrderAmendmentSchema>;
export type OrderAmendment = typeof orderAmendments.$inferSelect;

export const shipmentDocChecklist = pgTable("shipment_doc_checklist", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  shipmentId: integer("shipment_id").notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  documentLabel: text("document_label").notNull(),
  isRequired: boolean("is_required").default(true).notNull(),
  isCompleted: boolean("is_completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  completedBy: integer("completed_by").references(() => users.id),
  documentUrl: text("document_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertShipmentDocChecklistSchema = createInsertSchema(shipmentDocChecklist).omit({ id: true, createdAt: true, completedAt: true });
export type InsertShipmentDocChecklist = z.infer<typeof insertShipmentDocChecklistSchema>;
export type ShipmentDocChecklist = typeof shipmentDocChecklist.$inferSelect;

export const tenantBackups = pgTable("tenant_backups", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sizeBytes: integer("size_bytes"),
  filePath: varchar("file_path", { length: 500 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  backupType: varchar("backup_type", { length: 50 }).notNull().default("full"),
  isAutoBackup: boolean("is_auto_backup").default(false),
  googleDriveFileId: varchar("google_drive_file_id", { length: 255 }),
  googleDriveUrl: varchar("google_drive_url", { length: 500 }),
  recordCounts: text("record_counts"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantBackupSchema = createInsertSchema(tenantBackups).omit({ id: true, createdAt: true });
export type InsertTenantBackup = z.infer<typeof insertTenantBackupSchema>;
export type TenantBackup = typeof tenantBackups.$inferSelect;

export const chequeTemplates = pgTable("cheque_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  bankAccountId: integer("bank_account_id").notNull().references(() => bankAccounts.id),
  templateName: varchar("template_name", { length: 255 }).notNull(),
  templateImageUrl: varchar("template_image_url", { length: 500 }),
  chequeWidthMm: integer("cheque_width_mm").default(186),
  chequeHeightMm: integer("cheque_height_mm").default(86),
  fieldPositions: jsonb("field_positions").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChequeTemplateSchema = createInsertSchema(chequeTemplates).omit({ id: true, createdAt: true });
export type InsertChequeTemplate = z.infer<typeof insertChequeTemplateSchema>;
export type ChequeTemplate = typeof chequeTemplates.$inferSelect;

// ==========================================
// ORDER FOLLOW-UP LIFECYCLE TABLES
// ==========================================

// Export Cases — groups orders under one LC for finance/commercial tracking
export const exportCases = pgTable("export_cases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  exportCaseNumber: varchar("export_case_number", { length: 50 }).notNull(),
  exportLcId: integer("export_lc_id").references(() => commercialLcs.id),
  buyerId: integer("buyer_id").notNull().references(() => customers.id),
  bankAccountId: integer("bank_account_id").references(() => bankAccounts.id),
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date"),
  totalValue: numeric("total_value", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("USD"),
  status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
  paymentMode: varchar("payment_mode", { length: 30 }),
  expectedRealizationDays: integer("expected_realization_days"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("export_cases_tenant_idx").on(table.tenantId),
  tenantCaseNumberUnique: unique("export_cases_tenant_number_unique").on(table.tenantId, table.exportCaseNumber),
}));

export const insertExportCaseSchema = createInsertSchema(exportCases).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExportCase = z.infer<typeof insertExportCaseSchema>;
export type ExportCase = typeof exportCases.$inferSelect;

// Export Case ↔ Orders bridge table
export const exportCaseOrders = pgTable("export_case_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  exportCaseId: integer("export_case_id").notNull().references(() => exportCases.id),
  orderId: integer("order_id").notNull().references(() => orders.id),
  allocatedValue: numeric("allocated_value", { precision: 15, scale: 2 }),
  allocatedQuantity: integer("allocated_quantity"),
  allocationMethod: varchar("allocation_method", { length: 20 }).default("FOB_SHARE"),
  locked: boolean("locked").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("export_case_orders_tenant_idx").on(table.tenantId),
  caseOrderUnique: unique("export_case_orders_case_order_unique").on(table.exportCaseId, table.orderId),
}));

export const insertExportCaseOrderSchema = createInsertSchema(exportCaseOrders).omit({ id: true, createdAt: true });
export type InsertExportCaseOrder = z.infer<typeof insertExportCaseOrderSchema>;
export type ExportCaseOrder = typeof exportCaseOrders.$inferSelect;

// Proforma Invoices — combine multiple POs before LC
export const proformaInvoices = pgTable("proforma_invoices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  piNumber: varchar("pi_number", { length: 50 }).notNull(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  orderId: integer("order_id"),
  inquiryId: integer("inquiry_id"),
  issueDate: date("issue_date").notNull(),
  validityDate: date("validity_date"),
  currency: varchar("currency", { length: 10 }).default("USD"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }),
  discountAmount: numeric("discount_amount", { precision: 15, scale: 2 }),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }),
  termsAndConditions: text("terms_and_conditions"),
  paymentTerms: varchar("payment_terms", { length: 255 }),
  deliveryTerms: varchar("delivery_terms", { length: 255 }),
  incoterm: varchar("incoterm", { length: 50 }),
  portOfLoading: varchar("port_of_loading", { length: 255 }),
  portOfDischarge: varchar("port_of_discharge", { length: 255 }),
  status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("proforma_invoices_tenant_idx").on(table.tenantId),
  tenantPiNumberUnique: unique("proforma_invoices_tenant_pi_unique").on(table.tenantId, table.piNumber),
}));

export const insertProformaInvoiceSchema = createInsertSchema(proformaInvoices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProformaInvoice = z.infer<typeof insertProformaInvoiceSchema>;
export type ProformaInvoice = typeof proformaInvoices.$inferSelect;

// Proforma Invoice line items
export const proformaInvoiceLines = pgTable("proforma_invoice_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  proformaInvoiceId: integer("proforma_invoice_id").notNull().references(() => proformaInvoices.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.id),
  orderLineId: integer("order_line_id").references(() => salesOrderItems.id),
  styleId: integer("style_id").references(() => styles.id),
  description: text("description"),
  hsCode: varchar("hs_code", { length: 20 }),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull(),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("pi_lines_tenant_idx").on(table.tenantId),
}));

export const insertProformaInvoiceLineSchema = createInsertSchema(proformaInvoiceLines).omit({ id: true, createdAt: true });
export type InsertProformaInvoiceLine = z.infer<typeof insertProformaInvoiceLineSchema>;
export type ProformaInvoiceLine = typeof proformaInvoiceLines.$inferSelect;

// Back-to-Back LCs — opened against master/export LC for material procurement
export const btbLcs = pgTable("btb_lcs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  btbLcNumber: varchar("btb_lc_number", { length: 50 }).notNull(),
  exportCaseId: integer("export_case_id").references(() => exportCases.id),
  masterLcId: integer("master_lc_id").references(() => commercialLcs.id),
  supplierId: integer("supplier_id").references(() => vendors.id),
  bankAccountId: integer("bank_account_id").references(() => bankAccounts.id),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  openDate: date("open_date"),
  expiryDate: date("expiry_date"),
  maturityDate: date("maturity_date"),
  maturityAmount: numeric("maturity_amount", { precision: 15, scale: 2 }),
  acceptanceDate: date("acceptance_date"),
  purchaseOrderId: integer("purchase_order_id"),
  status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
  remarks: text("remarks"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("btb_lcs_tenant_idx").on(table.tenantId),
  tenantBtbNumberUnique: unique("btb_lcs_tenant_number_unique").on(table.tenantId, table.btbLcNumber),
}));

export const insertBtbLcSchema = createInsertSchema(btbLcs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBtbLc = z.infer<typeof insertBtbLcSchema>;
export type BtbLc = typeof btbLcs.$inferSelect;

// BTB LC supplier documents received
export const btbLcDocuments = pgTable("btb_lc_documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  btbLcId: integer("btb_lc_id").notNull().references(() => btbLcs.id, { onDelete: "cascade" }),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  documentNumber: varchar("document_number", { length: 100 }),
  documentDate: date("document_date"),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  receivedDate: date("received_date"),
  discrepancyNotes: text("discrepancy_notes"),
  status: varchar("status", { length: 30 }).notNull().default("PENDING"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("btb_lc_documents_tenant_idx").on(table.tenantId),
}));

export const insertBtbLcDocumentSchema = createInsertSchema(btbLcDocuments).omit({ id: true, createdAt: true });
export type InsertBtbLcDocument = z.infer<typeof insertBtbLcDocumentSchema>;
export type BtbLcDocument = typeof btbLcDocuments.$inferSelect;

// FX Receipts — foreign currency payment received in export bank account
export const fxReceipts = pgTable("fx_receipts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  exportCaseId: integer("export_case_id").references(() => exportCases.id),
  receiptDate: date("receipt_date").notNull(),
  bankAccountId: integer("bank_account_id").references(() => bankAccounts.id),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 10, scale: 4 }),
  bdtAmount: numeric("bdt_amount", { precision: 15, scale: 2 }),
  bankCharges: numeric("bank_charges", { precision: 10, scale: 2 }).default("0"),
  netAmount: numeric("net_amount", { precision: 15, scale: 2 }),
  bankReference: varchar("bank_reference", { length: 100 }),
  voucherId: integer("voucher_id").references(() => vouchers.id),
  status: varchar("status", { length: 30 }).notNull().default("RECEIVED"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("fx_receipts_tenant_idx").on(table.tenantId),
}));

export const insertFxReceiptSchema = createInsertSchema(fxReceipts).omit({ id: true, createdAt: true });
export type InsertFxReceipt = z.infer<typeof insertFxReceiptSchema>;
export type FxReceipt = typeof fxReceipts.$inferSelect;

// FX Settlements — disbursement of FX receipts against BTB maturities, CD account, etc.
export const fxSettlements = pgTable("fx_settlements", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  fxReceiptId: integer("fx_receipt_id").notNull().references(() => fxReceipts.id),
  btbLcId: integer("btb_lc_id").references(() => btbLcs.id),
  settlementType: varchar("settlement_type", { length: 30 }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }),
  settlementDate: date("settlement_date").notNull(),
  voucherId: integer("voucher_id").references(() => vouchers.id),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("fx_settlements_tenant_idx").on(table.tenantId),
}));

export const insertFxSettlementSchema = createInsertSchema(fxSettlements).omit({ id: true, createdAt: true });
export type InsertFxSettlement = z.infer<typeof insertFxSettlementSchema>;
export type FxSettlement = typeof fxSettlements.$inferSelect;

// Document References — cross-entity search by any document number
export const documentRefs = pgTable("document_refs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  entityType: varchar("entity_type", { length: 30 }).notNull(),
  entityId: integer("entity_id").notNull(),
  refType: varchar("ref_type", { length: 30 }).notNull(),
  refValue: varchar("ref_value", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantRefIdx: index("document_refs_tenant_ref_idx").on(table.tenantId, table.refValue),
  tenantEntityIdx: index("document_refs_tenant_entity_idx").on(table.tenantId, table.entityType, table.entityId),
}));

export const insertDocumentRefSchema = createInsertSchema(documentRefs).omit({ id: true, createdAt: true });
export type InsertDocumentRef = z.infer<typeof insertDocumentRefSchema>;
export type DocumentRef = typeof documentRefs.$inferSelect;

// Entity Events — audit trail for timeline
export const entityEvents = pgTable("entity_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  entityType: varchar("entity_type", { length: 30 }).notNull(),
  entityId: integer("entity_id").notNull(),
  eventType: varchar("event_type", { length: 30 }).notNull(),
  payload: jsonb("payload"),
  summary: text("summary"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantEntityIdx: index("entity_events_tenant_entity_idx").on(table.tenantId, table.entityType, table.entityId),
  tenantCreatedIdx: index("entity_events_tenant_created_idx").on(table.tenantId, table.createdAt),
}));

export const insertEntityEventSchema = createInsertSchema(entityEvents).omit({ id: true, createdAt: true });
export type InsertEntityEvent = z.infer<typeof insertEntityEventSchema>;
export type EntityEvent = typeof entityEvents.$inferSelect;

// Cash Forecast Scenarios
export const cashForecastScenarios = pgTable("cash_forecast_scenarios", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 50 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantNameUnique: unique("cash_forecast_scenarios_tenant_name_unique").on(table.tenantId, table.name),
}));

export const insertCashForecastScenarioSchema = createInsertSchema(cashForecastScenarios).omit({ id: true, createdAt: true });
export type InsertCashForecastScenario = z.infer<typeof insertCashForecastScenarioSchema>;
export type CashForecastScenario = typeof cashForecastScenarios.$inferSelect;

// Cash Forecast Lines
export const cashForecastLines = pgTable("cash_forecast_lines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  scenarioId: integer("scenario_id").notNull().references(() => cashForecastScenarios.id, { onDelete: "cascade" }),
  forecastDate: date("forecast_date").notNull(),
  category: varchar("category", { length: 30 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  bdtAmount: numeric("bdt_amount", { precision: 15, scale: 2 }),
  confidence: varchar("confidence", { length: 10 }).default("MEDIUM"),
  sourceEntityType: varchar("source_entity_type", { length: 30 }),
  sourceEntityId: integer("source_entity_id"),
  notes: text("notes"),
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantScenarioIdx: index("cash_forecast_lines_tenant_scenario_idx").on(table.tenantId, table.scenarioId),
}));

export const insertCashForecastLineSchema = createInsertSchema(cashForecastLines).omit({ id: true, createdAt: true });
export type InsertCashForecastLine = z.infer<typeof insertCashForecastLineSchema>;
export type CashForecastLine = typeof cashForecastLines.$inferSelect;

// Profitability Allocations — how costs/revenue are split across styles/orders in an export case
export const profitabilityAllocations = pgTable("profitability_allocations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  exportCaseId: integer("export_case_id").notNull().references(() => exportCases.id),
  orderId: integer("order_id").references(() => orders.id),
  styleId: integer("style_id").references(() => styles.id),
  method: varchar("method", { length: 20 }).notNull().default("FOB_SHARE"),
  ratio: numeric("ratio", { precision: 8, scale: 4 }).notNull(),
  locked: boolean("locked").default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("profitability_allocations_tenant_idx").on(table.tenantId),
}));

export const insertProfitabilityAllocationSchema = createInsertSchema(profitabilityAllocations).omit({ id: true, createdAt: true });
export type InsertProfitabilityAllocation = z.infer<typeof insertProfitabilityAllocationSchema>;
export type ProfitabilityAllocation = typeof profitabilityAllocations.$inferSelect;

// Profitability Snapshots — computed results stored for fast dashboards
export const profitabilitySnapshots = pgTable("profitability_snapshots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  snapshotDate: date("snapshot_date").notNull(),
  entityType: varchar("entity_type", { length: 20 }).notNull(),
  entityId: integer("entity_id").notNull(),
  revenue: numeric("revenue", { precision: 15, scale: 2 }).default("0"),
  materialCost: numeric("material_cost", { precision: 15, scale: 2 }).default("0"),
  cmCost: numeric("cm_cost", { precision: 15, scale: 2 }).default("0"),
  overheadCost: numeric("overhead_cost", { precision: 15, scale: 2 }).default("0"),
  logisticsCost: numeric("logistics_cost", { precision: 15, scale: 2 }).default("0"),
  financeCost: numeric("finance_cost", { precision: 15, scale: 2 }).default("0"),
  bankCharges: numeric("bank_charges", { precision: 15, scale: 2 }).default("0"),
  totalCost: numeric("total_cost", { precision: 15, scale: 2 }).default("0"),
  grossProfit: numeric("gross_profit", { precision: 15, scale: 2 }).default("0"),
  grossMarginPct: numeric("gross_margin_pct", { precision: 8, scale: 2 }).default("0"),
  netProfit: numeric("net_profit", { precision: 15, scale: 2 }).default("0"),
  netMarginPct: numeric("net_margin_pct", { precision: 8, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 10 }).default("BDT"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantEntityIdx: index("profitability_snapshots_tenant_entity_idx").on(table.tenantId, table.entityType, table.entityId),
}));