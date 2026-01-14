# Migration Order

This document outlines the correct order for running database migrations for the unified document architecture.

## Migration Sequence

Run migrations in the following order:

### 1. `20241218000002_document_type.sql`
**Purpose:** Adds `document_type` column to `documents` table
- Adds `document_type` field ('text' | 'drawing')
- Creates index on `document_type`
- Sets default to 'text' for existing documents

### 2. `20241218000003_migrate_drawings_to_documents.sql`
**Purpose:** Creates separate drawing documents from existing documents
- Removes any existing drawing documents (cleanup)
- Preserves all existing documents as text documents
- Creates NEW separate drawing documents for documents with `drawing_content`
- Names drawings as "drawing-1", "drawing-2", etc. per project
- **Note:** This works with the OLD schema (uses `document_contents` table)

### 3. `20241218000006_merge_document_contents.sql`
**Purpose:** Merges `document_contents` table into `documents` table
- Adds content columns to `documents` table:
  - `notes_content` (JSONB)
  - `drawing_content` (JSONB)
  - `drawing_files` (JSONB)
  - `text_mode` (TEXT)
- Migrates data from `document_contents` to `documents`
- Sets defaults for documents without content
- Drops the `document_contents` table
- Creates indexes for JSONB columns

## Important Notes

- **Do not skip steps** - Each migration depends on the previous one
- **Run in order** - The timestamp prefix ensures correct ordering
- **Backup first** - Always backup your database before running migrations
- **Test environment** - Test migrations in a development environment first

## After Running Migrations

After completing all migrations, you will have:
- ✅ `document_type` field on all documents
- ✅ Separate drawing documents created (if any existed)
- ✅ All content merged into `documents` table
- ✅ No `document_contents` table (simplified schema)
- ✅ Code already updated to work with merged schema

## Troubleshooting

If you encounter errors:
1. Check that previous migrations have run successfully
2. Verify the `document_contents` table exists before running the merge migration
3. Ensure all documents have been migrated before dropping `document_contents`
4. Check database logs for specific error messages
