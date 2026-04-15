-- Phase 3: Milestone 1 + 2 foundation
-- Data model alignment + workflow support tables (idempotent)

-- 1) New canonical checklist item table
CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  group_name TEXT NOT NULL DEFAULT 'General',
  required BOOLEAN NOT NULL DEFAULT true,
  has_deliverable BOOLEAN NOT NULL DEFAULT true,
  assignee_role TEXT,
  assigned_to UUID REFERENCES users(id),
  approver_role TEXT,
  due_offset_days INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) New submission table for approval workflow history
CREATE TABLE IF NOT EXISTS checklist_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_item_id UUID NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_urls TEXT[] NOT NULL DEFAULT '{}',
  file_names TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','approved','rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional lightweight comment trail
CREATE TABLE IF NOT EXISTS checklist_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_item_id UUID NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reminder log for digest/notification workflow
CREATE TABLE IF NOT EXISTS checklist_reminder_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  kind TEXT NOT NULL, -- pending_approval | assigned_digest
  payload JSONB NOT NULL DEFAULT '{}',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_checklist_items_project_id ON checklist_items(project_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_group ON checklist_items(project_id, group_name, position);
CREATE INDEX IF NOT EXISTS idx_checklist_items_assigned_to ON checklist_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_checklist_submissions_item ON checklist_submissions(checklist_item_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_submissions_status ON checklist_submissions(status);
CREATE INDEX IF NOT EXISTS idx_checklist_comments_item ON checklist_comments(checklist_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_reminder_user ON checklist_reminder_log(user_id, sent_at DESC);

-- updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'checklist_items_updated_at'
  ) THEN
    CREATE TRIGGER checklist_items_updated_at
    BEFORE UPDATE ON checklist_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- 3) Backfill from current project_checklists/checklist_completions
INSERT INTO checklist_items (
  id, project_id, title, description, group_name, required, has_deliverable,
  assignee_role, assigned_to, approver_role, due_offset_days, position, priority,
  archived_at, archived_by, created_at, updated_at
)
SELECT
  pc.id,
  pc.project_id,
  pc.item_name,
  pc.description,
  COALESCE((to_jsonb(pc)->>'group_name'), 'General'),
  COALESCE(((to_jsonb(pc)->>'required')::boolean), true),
  COALESCE(((to_jsonb(pc)->>'has_deliverable')::boolean), true),
  (to_jsonb(pc)->>'assignee_role'),
  NULLIF((to_jsonb(pc)->>'assigned_to'), '')::uuid,
  (to_jsonb(pc)->>'approver_role'),
  NULLIF((to_jsonb(pc)->>'due_offset_days'), '')::integer,
  COALESCE(NULLIF((to_jsonb(pc)->>'position'), '')::integer, 0),
  COALESCE((to_jsonb(pc)->>'priority'), 'medium'),
  NULLIF((to_jsonb(pc)->>'archived_at'), '')::timestamptz,
  NULLIF((to_jsonb(pc)->>'archived_by'), '')::uuid,
  COALESCE(NULLIF((to_jsonb(pc)->>'created_at'), '')::timestamptz, now()),
  COALESCE(NULLIF((to_jsonb(pc)->>'updated_at'), '')::timestamptz, now())
FROM project_checklists pc
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  group_name = EXCLUDED.group_name,
  required = EXCLUDED.required,
  has_deliverable = EXCLUDED.has_deliverable,
  assignee_role = EXCLUDED.assignee_role,
  assigned_to = EXCLUDED.assigned_to,
  approver_role = EXCLUDED.approver_role,
  due_offset_days = EXCLUDED.due_offset_days,
  position = EXCLUDED.position,
  priority = EXCLUDED.priority,
  archived_at = EXCLUDED.archived_at,
  archived_by = EXCLUDED.archived_by,
  updated_at = now();

INSERT INTO checklist_submissions (
  id, checklist_item_id, submitted_by, submitted_at,
  file_urls, file_names, notes, status,
  reviewed_by, reviewed_at, rejection_reason, created_at
)
SELECT
  cc.id,
  cc.checklist_id,
  cc.completed_by,
  COALESCE(cc.completed_at, cc.created_at, now()),
  COALESCE(cc.file_urls, '{}'),
  COALESCE(cc.file_names, '{}'),
  cc.notes,
  COALESCE(cc.approval_status, 'pending'),
  cc.approver_id,
  cc.approved_at,
  cc.rejection_reason,
  COALESCE(cc.created_at, now())
FROM checklist_completions cc
ON CONFLICT (id) DO UPDATE SET
  notes = EXCLUDED.notes,
  status = EXCLUDED.status,
  reviewed_by = EXCLUDED.reviewed_by,
  reviewed_at = EXCLUDED.reviewed_at,
  rejection_reason = EXCLUDED.rejection_reason;

-- 4) Compatibility views (new model -> old app shape)
CREATE OR REPLACE VIEW v_project_checklists_compat AS
SELECT
  ci.id,
  ci.project_id,
  ci.title AS item_name,
  ci.description,
  ci.required,
  ci.assignee_role,
  ci.assigned_to,
  ci.position,
  ci.group_name,
  ci.has_deliverable,
  ci.approver_role,
  ci.due_offset_days,
  ci.priority,
  ci.archived_at,
  ci.archived_by,
  ci.created_at,
  ci.updated_at
FROM checklist_items ci;

CREATE OR REPLACE VIEW v_checklist_completions_compat AS
SELECT
  cs.id,
  cs.checklist_item_id AS checklist_id,
  cs.submitted_by AS completed_by,
  cs.submitted_at AS completed_at,
  cs.file_urls,
  cs.file_names,
  cs.notes,
  cs.status AS approval_status,
  cs.reviewed_by AS approver_id,
  cs.reviewed_at AS approved_at,
  cs.rejection_reason,
  cs.created_at
FROM checklist_submissions cs;

-- 5) RLS
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_reminder_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_items_read') THEN
    CREATE POLICY checklist_items_read ON checklist_items FOR SELECT TO authenticated
    USING (current_user_role() IN ('admin','manager','finance'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_items_write') THEN
    CREATE POLICY checklist_items_write ON checklist_items FOR ALL TO authenticated
    USING (current_user_role() IN ('admin','manager'))
    WITH CHECK (current_user_role() IN ('admin','manager'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_submissions_read') THEN
    CREATE POLICY checklist_submissions_read ON checklist_submissions FOR SELECT TO authenticated
    USING (current_user_role() IN ('admin','manager','finance'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_submissions_write') THEN
    CREATE POLICY checklist_submissions_write ON checklist_submissions FOR ALL TO authenticated
    USING (current_user_role() IN ('admin','manager','finance'))
    WITH CHECK (current_user_role() IN ('admin','manager','finance'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_comments_rw') THEN
    CREATE POLICY checklist_comments_rw ON checklist_comments FOR ALL TO authenticated
    USING (current_user_role() IN ('admin','manager','finance'))
    WITH CHECK (current_user_role() IN ('admin','manager','finance'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_reminder_log_read') THEN
    CREATE POLICY checklist_reminder_log_read ON checklist_reminder_log FOR SELECT TO authenticated
    USING (current_user_role() IN ('admin','manager'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_reminder_log_insert') THEN
    CREATE POLICY checklist_reminder_log_insert ON checklist_reminder_log FOR INSERT TO authenticated
    WITH CHECK (current_user_role() IN ('admin','manager'));
  END IF;
END $$;
