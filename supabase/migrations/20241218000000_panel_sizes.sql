-- Add panel size columns to document_contents for saving panel widths
ALTER TABLE document_contents 
ADD COLUMN IF NOT EXISTS notes_panel_size REAL DEFAULT 100,
ADD COLUMN IF NOT EXISTS drawing_panel_size REAL DEFAULT 100;
