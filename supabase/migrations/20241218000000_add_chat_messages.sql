-- Add chat_messages column to document_contents
ALTER TABLE document_contents 
ADD COLUMN IF NOT EXISTS chat_messages JSONB DEFAULT '[]';
