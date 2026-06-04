-- Add pdf_url column to scripts for native PDF viewer
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS pdf_url TEXT;
