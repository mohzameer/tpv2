-- ThinkPost v0.3.0 Migration
-- Adds per-project document numbering
-- 
-- This migration:
-- 1. Adds document_number column to documents table
-- 2. Backfills existing documents with sequential numbers per project
-- 3. Adds constraints and indexes
-- 4. Creates function and trigger for auto-increment

-- Step 1: Add document_number column (nullable initially for migration)
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS document_number INTEGER;

-- Step 2: Add index for performance (used in trigger and queries)
CREATE INDEX IF NOT EXISTS idx_documents_project_number 
ON documents(project_id, document_number);

-- Step 3: Backfill existing documents with sequential numbers
-- Numbers are assigned based on creation order (created_at, then id as tiebreaker)
WITH numbered_docs AS (
  SELECT 
    id,
    project_id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id 
      ORDER BY created_at ASC, id ASC
    ) as doc_num
  FROM documents
  WHERE document_number IS NULL
)
UPDATE documents d
SET document_number = n.doc_num
FROM numbered_docs n
WHERE d.id = n.id AND d.document_number IS NULL;

-- Step 4: Make document_number NOT NULL
-- This will fail if any documents still have NULL (shouldn't happen after backfill)
ALTER TABLE documents 
ALTER COLUMN document_number SET NOT NULL;

-- Step 5: Add unique constraint per project
ALTER TABLE documents 
ADD CONSTRAINT unique_project_document_number 
UNIQUE (project_id, document_number);

-- Step 6: Create function to get next document number for a project
-- Uses advisory lock to prevent race conditions
CREATE OR REPLACE FUNCTION get_next_document_number(p_project_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  -- Use advisory lock to prevent race conditions
  -- Hash the project_id to create a unique lock identifier
  PERFORM pg_advisory_xact_lock(hashtext('doc_num_' || p_project_id));
  
  -- Get max document number for this project and increment
  SELECT COALESCE(MAX(document_number), 0) + 1
  INTO next_num
  FROM documents
  WHERE project_id = p_project_id;
  
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create trigger function to auto-assign document_number
CREATE OR REPLACE FUNCTION assign_document_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Only assign if not already set (allows manual override if needed)
  IF NEW.document_number IS NULL THEN
    NEW.document_number := get_next_document_number(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger to auto-assign document_number on insert
DROP TRIGGER IF EXISTS assign_document_number_trigger ON documents;
CREATE TRIGGER assign_document_number_trigger
  BEFORE INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION assign_document_number();

-- Verification query (run manually to check):
-- SELECT project_id, COUNT(*) as doc_count, MIN(document_number) as min_num, MAX(document_number) as max_num
-- FROM documents
-- GROUP BY project_id
-- ORDER BY project_id;

