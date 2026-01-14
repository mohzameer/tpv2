-- Diagnostic script to check document state
-- Run this to see what documents exist in your database

-- Count documents by type
SELECT 
  document_type,
  COUNT(*) as count
FROM documents
GROUP BY document_type;

-- List all documents with their types
SELECT 
  d.id,
  d.project_id,
  d.title,
  d.document_type,
  d.created_at,
  d.updated_at,
  CASE 
    WHEN dc.notes_content IS NOT NULL AND dc.notes_content != '[]'::jsonb THEN 'yes'
    ELSE 'no'
  END as has_notes,
  CASE 
    WHEN dc.drawing_content IS NOT NULL 
     AND dc.drawing_content != '{}'::jsonb
     AND dc.drawing_content ? 'elements'
     AND jsonb_array_length(dc.drawing_content->'elements') > 0 THEN 'yes'
    ELSE 'no'
  END as has_drawing,
  CASE 
    WHEN dc.drawing_files IS NOT NULL 
     AND dc.drawing_files != '{}'::jsonb
     AND jsonb_typeof(dc.drawing_files) = 'object' THEN 'yes'
    ELSE 'no'
  END as has_drawing_files
FROM documents d
LEFT JOIN document_contents dc ON dc.document_id = d.id
ORDER BY d.project_id, d.created_at;

-- Check if any documents are missing document_contents
SELECT 
  d.id,
  d.title,
  d.document_type,
  'Missing document_contents' as issue
FROM documents d
LEFT JOIN document_contents dc ON dc.document_id = d.id
WHERE dc.id IS NULL;
