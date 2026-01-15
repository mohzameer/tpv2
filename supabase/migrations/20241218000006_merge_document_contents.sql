-- Migration to merge document_contents into documents table
-- This simplifies the schema by removing the separate document_contents table

-- Step 1: Add content columns to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS notes_content JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS drawing_content JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS drawing_files JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS text_mode TEXT DEFAULT 'text' CHECK (text_mode IN ('text', 'markdown'));

-- Step 2: Migrate data from document_contents to documents
UPDATE documents d
SET 
  notes_content = COALESCE(dc.notes_content, '[]'::jsonb),
  drawing_content = COALESCE(dc.drawing_content, '{}'::jsonb),
  drawing_files = COALESCE(dc.drawing_files, '{}'::jsonb),
  text_mode = COALESCE(dc.text_mode, 'text')
FROM document_contents dc
WHERE dc.document_id = d.id;

-- Step 3: Set defaults for documents that don't have document_contents entry
UPDATE documents
SET 
  notes_content = '[]'::jsonb,
  drawing_content = '{}'::jsonb,
  drawing_files = '{}'::jsonb,
  text_mode = 'text'
WHERE notes_content IS NULL;

-- Step 4: Drop the document_contents table (CASCADE will handle any remaining dependencies)
DROP TABLE IF EXISTS document_contents CASCADE;

-- Step 5: Create indexes for better query performance on JSONB columns
CREATE INDEX IF NOT EXISTS idx_documents_notes_content ON documents USING GIN (notes_content);
CREATE INDEX IF NOT EXISTS idx_documents_drawing_content ON documents USING GIN (drawing_content);
CREATE INDEX IF NOT EXISTS idx_documents_drawing_files ON documents USING GIN (drawing_files);
