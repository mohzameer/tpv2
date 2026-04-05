-- ThinkPost v0.3.0: per-project document_number (see migrations/0.3.0/README.md)
-- Adds column, backfill, constraints, trigger for new inserts.

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS document_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_documents_project_number
ON documents(project_id, document_number);

WITH numbered_docs AS (
  SELECT
    id,
    project_id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id
      ORDER BY created_at ASC, id ASC
    ) AS doc_num
  FROM documents
  WHERE document_number IS NULL
)
UPDATE documents d
SET document_number = n.doc_num
FROM numbered_docs n
WHERE d.id = n.id AND d.document_number IS NULL;

ALTER TABLE documents
ALTER COLUMN document_number SET NOT NULL;

ALTER TABLE documents
ADD CONSTRAINT unique_project_document_number
UNIQUE (project_id, document_number);

CREATE OR REPLACE FUNCTION get_next_document_number(p_project_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('doc_num_' || p_project_id));

  SELECT COALESCE(MAX(document_number), 0) + 1
  INTO next_num
  FROM documents
  WHERE project_id = p_project_id;

  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_document_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.document_number IS NULL THEN
    NEW.document_number := get_next_document_number(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assign_document_number_trigger ON documents;
CREATE TRIGGER assign_document_number_trigger
  BEFORE INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION assign_document_number();
