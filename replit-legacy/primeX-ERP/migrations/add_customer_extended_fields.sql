-- Add additional customer fields for garment industry
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS industry_segment VARCHAR,
ADD COLUMN IF NOT EXISTS payment_terms VARCHAR,
ADD COLUMN IF NOT EXISTS lead_time INTEGER,
ADD COLUMN IF NOT EXISTS compliance_level VARCHAR,
ADD COLUMN IF NOT EXISTS sustainability_rating NUMERIC(3,1);