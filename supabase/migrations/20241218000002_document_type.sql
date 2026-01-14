-- Add document_type field to documents table
-- This enables unified document list with type-based rendering
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'text' CHECK (document_type IN ('text', 'drawing'));

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);