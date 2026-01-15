-- Add document_links column to documents table
-- Stores links to other documents within the same project

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS document_links JSONB DEFAULT '[]';

-- Add index for querying documents with links
CREATE INDEX IF NOT EXISTS idx_documents_links ON documents USING GIN (document_links);

-- Add comment to document_links column
COMMENT ON COLUMN documents.document_links IS 'Array of document links, each containing id, targetDocumentId, type, title, position, etc.';

-- Ensure the column is accessible (RLS policies should already allow all, but this ensures it)
-- The existing "Allow all for now" policy should cover this column automatically

-- Force PostgREST to refresh its schema cache by notifying it of the schema change
-- This helps avoid PGRST204 errors immediately after migration
NOTIFY pgrst, 'reload schema';
