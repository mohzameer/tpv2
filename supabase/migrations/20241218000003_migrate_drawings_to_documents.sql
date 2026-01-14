-- Migration script to create separate drawing documents from existing documents
-- This script:
-- 1. Removes any existing drawing documents (cleanup from previous attempts)
-- 2. Keeps ALL existing documents as text documents (preserves them unchanged)
-- 3. Creates NEW separate document entries for drawings
-- 4. Copies drawing_content and drawing_files to the new drawing documents
-- 5. Names drawings as "drawing-1", "drawing-2", etc. per project
-- 6. Only creates drawings if drawing_content is not null
-- 
-- NOTE: This works with the OLD schema (document_contents table exists)
-- Run this BEFORE 20241218000006_merge_document_contents.sql

-- Step 1: Remove any existing drawing documents (cleanup)
-- This deletes document_contents first (due to foreign key constraint)
DELETE FROM document_contents
WHERE document_id IN (
  SELECT id FROM documents WHERE document_type = 'drawing'
);

-- Then delete the drawing documents
DELETE FROM documents
WHERE document_type = 'drawing';

-- Step 2: Ensure all remaining documents are marked as text (safety check)
UPDATE documents
SET document_type = 'text'
WHERE document_type IS NULL OR document_type != 'text';

-- Step 3: Create new drawing documents for documents that have drawing_content
-- This processes each project separately to ensure proper numbering
-- Only creates drawings if drawing_content is not null
DO $$
DECLARE
  project_rec RECORD;
  doc_rec RECORD;
  new_doc_id INTEGER;
  drawing_num INTEGER;
  total_drawings_created INTEGER := 0;
BEGIN
  -- Loop through each project
  FOR project_rec IN SELECT DISTINCT id as project_id FROM projects LOOP
    drawing_num := 0;
    
    -- Loop through documents in this project that have drawing_content
    -- Using document_contents table (old schema)
    FOR doc_rec IN 
      SELECT 
        d.id as original_doc_id,
        d.created_at,
        dc.drawing_content,
        dc.drawing_files
      FROM documents d
      INNER JOIN document_contents dc ON dc.document_id = d.id
      WHERE d.project_id = project_rec.project_id
      AND d.document_type = 'text'  -- Only process text documents
      AND dc.drawing_content IS NOT NULL  -- drawing_content must not be null
      ORDER BY d.created_at
    LOOP
      drawing_num := drawing_num + 1;
      
      -- Create new drawing document
      INSERT INTO documents (project_id, title, document_type, created_at, updated_at)
      VALUES (
        project_rec.project_id, 
        'drawing-' || drawing_num, 
        'drawing', 
        doc_rec.created_at, 
        NOW()
      )
      RETURNING id INTO new_doc_id;
      
      -- Create document_contents for the new drawing document
      -- Copy drawing_content and drawing_files from the original
      INSERT INTO document_contents (document_id, drawing_content, drawing_files, updated_at)
      VALUES (
        new_doc_id, 
        doc_rec.drawing_content, 
        COALESCE(doc_rec.drawing_files, '{}'::jsonb),
        NOW()
      );
      
      total_drawings_created := total_drawings_created + 1;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  Removed all existing drawing documents';
  RAISE NOTICE '  Created % new drawing documents (only from documents where drawing_content IS NOT NULL)', total_drawings_created;
  RAISE NOTICE '  All original documents preserved as text documents';
END $$;

-- Step 4: Final summary
DO $$
DECLARE
  text_docs_count INTEGER;
  drawing_docs_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO text_docs_count FROM documents WHERE document_type = 'text';
  SELECT COUNT(*) INTO drawing_docs_count FROM documents WHERE document_type = 'drawing';
  
  RAISE NOTICE 'Final counts:';
  RAISE NOTICE '  Text documents (preserved): %', text_docs_count;
  RAISE NOTICE '  Drawing documents (newly created): %', drawing_docs_count;
END $$;
