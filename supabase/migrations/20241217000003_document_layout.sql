-- Add layout settings to document_contents
ALTER TABLE document_contents 
ADD COLUMN layout_mode TEXT DEFAULT 'both' CHECK (layout_mode IN ('notes', 'drawing', 'both')),
ADD COLUMN layout_ratio REAL DEFAULT 50;
