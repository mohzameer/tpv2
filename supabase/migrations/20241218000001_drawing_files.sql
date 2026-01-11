-- Add separate drawing_files column to document_contents for storing Excalidraw files separately
-- This provides a backup/recovery mechanism if files are lost during state changes
ALTER TABLE document_contents
ADD COLUMN IF NOT EXISTS drawing_files JSONB DEFAULT '{}';

-- Create an index on drawing_files for better query performance (though JSONB already has GIN indexing)
-- This is optional but can help with queries that check if files exist
CREATE INDEX IF NOT EXISTS idx_document_contents_drawing_files ON document_contents USING GIN (drawing_files);
