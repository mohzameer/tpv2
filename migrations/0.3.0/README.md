# Migration 0.3.0: Per-Project Document Numbering

## Overview
This migration adds per-project document numbering to the `documents` table.

## Migration Files

### 1. `001_per_project_document_numbering.sql`
Main migration script that:
- Adds `document_number` column
- Creates indexes, functions, and triggers
- **Note**: This script includes a backfill step, but you can run it separately

### 2. `002_backfill_document_numbers.sql`
Standalone backfill script that:
- Assigns sequential document numbers to existing documents
- Can be run independently for testing
- Includes verification queries
- Safe to run multiple times (idempotent)

## Migration Options

### Option A: All-in-One (Recommended for Small Databases)
Run the main migration script which includes backfill:
```bash
psql -d your_database -f 001_per_project_document_numbering.sql
```

### Option B: Two-Step (Recommended for Large Databases)
1. Run main migration (without backfill):
   - Comment out the backfill section in `001_per_project_document_numbering.sql`
   - Or run it up to the backfill step
2. Run backfill separately:
```bash
psql -d your_database -f 002_backfill_document_numbers.sql
```
3. Verify results using queries in the backfill script
4. Continue with remaining steps (NOT NULL constraint, etc.)

## Step-by-Step Process

### Step 1: Add Column and Index
```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_number INTEGER;
CREATE INDEX IF NOT EXISTS idx_documents_project_number ON documents(project_id, document_number);
```

### Step 2: Backfill Existing Data
Run `002_backfill_document_numbers.sql` and verify results.

### Step 3: Add Constraints
```sql
ALTER TABLE documents ALTER COLUMN document_number SET NOT NULL;
ALTER TABLE documents ADD CONSTRAINT unique_project_document_number UNIQUE (project_id, document_number);
```

### Step 4: Create Functions and Triggers
The remaining steps in `001_per_project_document_numbering.sql`:
- Create `get_next_document_number()` function
- Create `assign_document_number()` trigger function
- Create trigger

## Verification

After running the backfill, check:
1. No NULL document_numbers: `SELECT COUNT(*) FROM documents WHERE document_number IS NULL;` (should be 0)
2. Sequential numbering per project
3. No duplicates within projects
4. All documents have numbers assigned

## Rollback

If you need to rollback:
```sql
-- Remove trigger
DROP TRIGGER IF EXISTS assign_document_number_trigger ON documents;

-- Remove functions
DROP FUNCTION IF EXISTS assign_document_number();
DROP FUNCTION IF EXISTS get_next_document_number(TEXT);

-- Remove constraints
ALTER TABLE documents DROP CONSTRAINT IF EXISTS unique_project_document_number;

-- Remove column (WARNING: This will lose document numbers)
ALTER TABLE documents DROP COLUMN IF EXISTS document_number;

-- Remove index
DROP INDEX IF EXISTS idx_documents_project_number;
```

## Performance Notes

- **Small databases** (< 10,000 documents): Run all-in-one, takes seconds
- **Medium databases** (10,000 - 100,000 documents): Two-step recommended, takes minutes
- **Large databases** (> 100,000 documents): Run backfill in batches or during maintenance window

## Troubleshooting

### Backfill takes too long
- Run during maintenance window
- Consider running in batches by project_id
- Check for missing indexes on `created_at` and `id`

### Duplicate document numbers detected
- This shouldn't happen, but if it does, investigate the backfill query
- May need to adjust ORDER BY clause

### NULL document numbers after backfill
- Check for documents with NULL `created_at` or `project_id`
- May need to handle edge cases manually

