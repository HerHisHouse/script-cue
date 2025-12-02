-- Add content column for storing raw script text/HTML
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS content TEXT;

-- Add annotations column for storing drawing paths (JSON array)
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS annotations JSONB;
