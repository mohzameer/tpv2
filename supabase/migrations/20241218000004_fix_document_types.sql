-- Fix script to correct document_type assignments
-- This script helps identify and fix documents that were incorrectly marked as drawings

-- Step 1: Identify documents that should be text documents
-- A document should be 'text' if:
--   - It has notes_content with blocks
--   - AND it does NOT have meaningful drawing content (no elements or only empty drawing_content)

-- First, let's see what we have (for debugging)
DO $$
DECLARE
  text_count INTEGER;
  drawing_count INTEGER;
  text_with_drawings INTEGER;
  drawings_with_notes INTEGER;
BEGIN
  SELECT COUNT(*) INTO text_count FROM documents WHERE document_type = 'text';
  SELECT COUNT(*) INTO drawing_count FROM documents WHERE document_type = 'drawing';
  
  -- Count text docs that have drawing content
  SELECT COUNT(*) INTO text_with_drawings
  FROM documents d
  WHERE d.document_type = 'text'
  AND EXISTS (
    SELECT 1 FROM document_contents dc
    WHERE dc.document_id = d.id
    AND (
      (dc.drawing_content IS NOT NULL 
       AND dc.drawing_content != '{}'::jsonb
       AND dc.drawing_content ? 'elements'
       AND jsonb_array_length(dc.drawing_content->'elements') > 0)
      OR
      (dc.drawing_files IS NOT NULL 
       AND dc.drawing_files != '{}'::jsonb
       AND jsonb_typeof(dc.drawing_files) = 'object')
    )
  );
  
  -- Count drawing docs that have notes content
  SELECT COUNT(*) INTO drawings_with_notes
  FROM documents d
  WHERE d.document_type = 'drawing'
  AND EXISTS (
    SELECT 1 FROM document_contents dc
    WHERE dc.document_id = d.id
    AND dc.notes_content IS NOT NULL
    AND dc.notes_content != '[]'::jsonb
    AND jsonb_array_length(dc.notes_content) > 0
  );
  
  RAISE NOTICE 'Current state:';
  RAISE NOTICE '  Text documents: %', text_count;
  RAISE NOTICE '  Drawing documents: %', drawing_count;
  RAISE NOTICE '  Text docs with drawing content: %', text_with_drawings;
  RAISE NOTICE '  Drawing docs with notes content: %', drawings_with_notes;
END $$;

-- Step 2: Fix documents that are marked as drawings but should be text
-- A document should be text if it has notes_content but no meaningful drawing content
UPDATE documents d
SET document_type = 'text'
WHERE d.document_type = 'drawing'
AND EXISTS (
  SELECT 1 FROM document_contents dc
  WHERE dc.document_id = d.id
  AND dc.notes_content IS NOT NULL
  AND dc.notes_content != '[]'::jsonb
  AND jsonb_array_length(dc.notes_content) > 0
  -- AND it does NOT have meaningful drawing content
  AND NOT (
    (dc.drawing_content IS NOT NULL 
     AND dc.drawing_content != '{}'::jsonb
     AND dc.drawing_content ? 'elements'
     AND jsonb_array_length(dc.drawing_content->'elements') > 0)
    OR
    (dc.drawing_files IS NOT NULL 
     AND dc.drawing_files != '{}'::jsonb
     AND jsonb_typeof(dc.drawing_files) = 'object')
  )
);

-- Step 3: Ensure documents with drawing content are marked as drawings
-- This is a safety check to make sure drawings are correctly identified
UPDATE documents d
SET document_type = 'drawing'
WHERE d.document_type = 'text'
AND EXISTS (
  SELECT 1 FROM document_contents dc
  WHERE dc.document_id = d.id
  AND (
    -- Has drawing_content with elements
    (dc.drawing_content IS NOT NULL 
     AND dc.drawing_content != '{}'::jsonb
     AND dc.drawing_content ? 'elements'
     AND jsonb_array_length(dc.drawing_content->'elements') > 0)
    OR
    -- Has drawing_files
    (dc.drawing_files IS NOT NULL 
     AND dc.drawing_files != '{}'::jsonb
     AND jsonb_typeof(dc.drawing_files) = 'object')
  )
  -- AND does NOT have meaningful notes content (to avoid conflicts)
  AND NOT (
    dc.notes_content IS NOT NULL
    AND dc.notes_content != '[]'::jsonb
    AND jsonb_array_length(dc.notes_content) > 1  -- More than just default "Untitled" block
  )
);

-- Step 4: Final summary
DO $$
DECLARE
  text_count INTEGER;
  drawing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO text_count FROM documents WHERE document_type = 'text';
  SELECT COUNT(*) INTO drawing_count FROM documents WHERE document_type = 'drawing';
  
  RAISE NOTICE 'After fix:';
  RAISE NOTICE '  Text documents: %', text_count;
  RAISE NOTICE '  Drawing documents: %', drawing_count;
END $$;
