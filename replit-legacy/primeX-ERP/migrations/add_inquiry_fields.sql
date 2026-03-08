-- Migration to add new fields to inquiries table
ALTER TABLE inquiries 
  -- First, ensure the projected_delivery_date is a date type
  ALTER COLUMN projected_delivery_date TYPE date USING projected_delivery_date::date,
  
  -- Add the new fields
  ADD COLUMN IF NOT EXISTS season_year VARCHAR,
  ADD COLUMN IF NOT EXISTS brand VARCHAR,
  ADD COLUMN IF NOT EXISTS material_composition VARCHAR,
  ADD COLUMN IF NOT EXISTS size_range VARCHAR,
  ADD COLUMN IF NOT EXISTS color_options TEXT[],
  ADD COLUMN IF NOT EXISTS country_of_origin VARCHAR,
  ADD COLUMN IF NOT EXISTS incoterms VARCHAR,
  ADD COLUMN IF NOT EXISTS special_requirements TEXT,
  ADD COLUMN IF NOT EXISTS contact_person_ref VARCHAR;