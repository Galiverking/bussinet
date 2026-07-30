-- Migration 001: Add loc_override column for maps links
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS loc_override TEXT;

-- Optional: Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
ORDER BY ordinal_position;