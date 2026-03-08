-- Create report templates table
CREATE TABLE IF NOT EXISTS report_templates (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  report_type VARCHAR(50) NOT NULL,
  category VARCHAR(100) NOT NULL,
  module VARCHAR(100) NOT NULL,
  query_text TEXT,
  parameters JSONB,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_report_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Add indexes for report_templates
CREATE INDEX IF NOT EXISTS idx_report_templates_tenant_id ON report_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_type_category ON report_templates(report_type, category);
CREATE INDEX IF NOT EXISTS idx_report_templates_module ON report_templates(module);

-- Create generated reports table
CREATE TABLE IF NOT EXISTS generated_reports (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  report_type VARCHAR(50),
  category VARCHAR(100),
  module VARCHAR(100),
  template_id INTEGER,
  parameters JSONB,
  custom_query TEXT,
  status VARCHAR(50) NOT NULL,
  results JSONB,
  error_message TEXT,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  output_format VARCHAR(10) NOT NULL DEFAULT 'json',
  view_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT fk_generated_reports_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_generated_reports_template FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE SET NULL
);

-- Add indexes for generated_reports
CREATE INDEX IF NOT EXISTS idx_generated_reports_tenant_id ON generated_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_status ON generated_reports(status);
CREATE INDEX IF NOT EXISTS idx_generated_reports_type_category ON generated_reports(report_type, category);
CREATE INDEX IF NOT EXISTS idx_generated_reports_created_by ON generated_reports(created_by);

-- Create favorite reports table
CREATE TABLE IF NOT EXISTS favorite_reports (
  user_id INTEGER NOT NULL,
  report_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, report_id),
  CONSTRAINT fk_favorite_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_favorite_reports_report FOREIGN KEY (report_id) REFERENCES generated_reports(id) ON DELETE CASCADE
);

-- Create report insights table
CREATE TABLE IF NOT EXISTS report_insights (
  report_id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  insights JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_report_insights_report FOREIGN KEY (report_id) REFERENCES generated_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_insights_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Add index for report_insights
CREATE INDEX IF NOT EXISTS idx_report_insights_tenant_id ON report_insights(tenant_id);

-- Create report dashboard widgets table
CREATE TABLE IF NOT EXISTS report_dashboard_widgets (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  widget_type VARCHAR(50) NOT NULL,
  report_id INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  size VARCHAR(20) NOT NULL DEFAULT 'medium',
  settings JSONB,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_report_dashboard_widgets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_dashboard_widgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_dashboard_widgets_report FOREIGN KEY (report_id) REFERENCES generated_reports(id) ON DELETE SET NULL
);

-- Add indexes for report_dashboard_widgets
CREATE INDEX IF NOT EXISTS idx_report_dashboard_widgets_tenant_id ON report_dashboard_widgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_dashboard_widgets_user_id ON report_dashboard_widgets(user_id);
CREATE INDEX IF NOT EXISTS idx_report_dashboard_widgets_is_shared ON report_dashboard_widgets(is_shared);

-- Create report schedules table
CREATE TABLE IF NOT EXISTS report_schedules (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_id INTEGER NOT NULL,
  parameters JSONB,
  schedule_type VARCHAR(20) NOT NULL,
  schedule_config JSONB NOT NULL,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  output_format VARCHAR(10) NOT NULL DEFAULT 'pdf',
  email_recipients JSONB,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_report_schedules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_schedules_template FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_schedules_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Add indexes for report_schedules
CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant_id ON report_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run_at ON report_schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_report_schedules_is_active ON report_schedules(is_active);