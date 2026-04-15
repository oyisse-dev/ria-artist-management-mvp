-- Checklist Builder Upgrade: editable tasks, deliverable types, and archive/restore

ALTER TABLE project_checklists
  ADD COLUMN IF NOT EXISTS group_name TEXT DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS due_offset_days INTEGER,
  ADD COLUMN IF NOT EXISTS has_deliverable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deliverable_type TEXT,
  ADD COLUMN IF NOT EXISTS deliverable_custom TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_checklists_group_name ON project_checklists(group_name);
CREATE INDEX IF NOT EXISTS idx_checklists_archived_at ON project_checklists(archived_at);

-- Keep checklist delete only for admin; manager uses archive via update.
-- Existing policy allows admin+manager update already in phase2-migration.sql
