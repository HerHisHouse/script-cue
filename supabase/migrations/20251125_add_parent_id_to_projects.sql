-- Add parent_id to projects table to support nested folders
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_projects_parent_id ON projects(parent_id);
