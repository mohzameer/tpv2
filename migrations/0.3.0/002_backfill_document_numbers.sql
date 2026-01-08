-- ThinkPost v0.3.0 - Backfill Document Numbers
-- 
-- This script backfills document_number for existing documents.
-- Run this AFTER the column has been added but BEFORE adding NOT NULL constraint.
--
-- Usage:
--   1. Ensure document_number column exists (nullable)
--   2. Run this script
--   3. Verify results
--   4. Then run the NOT NULL constraint addition
--
-- This can be run multiple times safely (idempotent)

-- Backfill existing documents with sequential numbers per project
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

-- Verification queries (run these to check results):

-- 1. Check if any documents still have NULL document_number
SELECT 
  COUNT(*) as null_count,
  COUNT(DISTINCT project_id) as affected_projects
FROM documents
WHERE document_number IS NULL;

-- 2. Check document number ranges per project
SELECT 
  project_id,
  COUNT(*) as doc_count,
  MIN(document_number) as min_num,
  MAX(document_number) as max_num,
  CASE 
    WHEN MAX(document_number) = COUNT(*) THEN 'OK - Sequential'
    ELSE 'WARNING - Gaps detected'
  END as status
FROM documents
GROUP BY project_id
ORDER BY project_id;

-- 3. Check for duplicate document numbers within projects (should be 0)
SELECT 
  project_id,
  document_number,
  COUNT(*) as duplicate_count
FROM documents
WHERE document_number IS NOT NULL
GROUP BY project_id, document_number
HAVING COUNT(*) > 1;

-- 4. Summary statistics
SELECT 
  COUNT(DISTINCT project_id) as total_projects,
  COUNT(*) as total_documents,
  COUNT(CASE WHEN document_number IS NULL THEN 1 END) as null_document_numbers,
  COUNT(CASE WHEN document_number IS NOT NULL THEN 1 END) as assigned_document_numbers,
  MIN(document_number) as min_document_number,
  MAX(document_number) as max_document_number
FROM documents;

