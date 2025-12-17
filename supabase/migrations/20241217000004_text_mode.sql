-- Add text mode setting to document_contents
ALTER TABLE document_contents 
ADD COLUMN text_mode TEXT DEFAULT 'text' CHECK (text_mode IN ('text', 'markdown'));
