-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'native' CHECK (type IN ('native', 'github')),
  owner_id UUID,
  guest_id TEXT,
  github_repo_url TEXT,
  github_branch TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document contents table (stores notes and drawing data)
CREATE TABLE document_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  notes_content JSONB DEFAULT '[]',
  drawing_content JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_document_contents_document_id ON document_contents(document_id);
CREATE INDEX idx_projects_guest_id ON projects(guest_id);
CREATE INDEX idx_projects_owner_id ON projects(owner_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER document_contents_updated_at BEFORE UPDATE ON document_contents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable RLS (we'll add policies later for auth)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_contents ENABLE ROW LEVEL SECURITY;

-- Temporary permissive policies for anonymous access (Phase 1)
CREATE POLICY "Allow all for now" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for now" ON documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for now" ON document_contents FOR ALL USING (true) WITH CHECK (true);
