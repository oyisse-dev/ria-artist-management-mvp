-- ============================================================
-- RIA Artist Management — Phase 2 Database Migration
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 1. PROJECTS TABLE
-- ============================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('release', 'tour', 'campaign')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN (
    'planning', 'pre_production', 'recording', 'mix_master',
    'asset_collection', 'qc', 'distribution', 'live', 'completed'
  )),
  target_date DATE,
  actual_date DATE,
  budget_estimate DECIMAL(12,2),
  actual_cost DECIMAL(12,2) DEFAULT 0,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. PROJECT CHECKLIST TEMPLATES
-- ============================================================
CREATE TABLE project_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  assignee_role TEXT, -- 'admin', 'manager', 'finance', or specific user
  assigned_to UUID REFERENCES users(id),
  due_date DATE,
  depends_on UUID REFERENCES project_checklists(id), -- dependency
  position INTEGER NOT NULL DEFAULT 0, -- order in checklist
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. CHECKLIST COMPLETIONS (tracks completion + uploads + approvals)
-- ============================================================
CREATE TABLE checklist_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_id UUID NOT NULL REFERENCES project_checklists(id) ON DELETE CASCADE,
  completed_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  file_urls TEXT[] DEFAULT '{}',
  file_names TEXT[] DEFAULT '{}',
  notes TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    approval_status IN ('pending', 'submitted', 'approved', 'rejected')
  ),
  approver_id UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(checklist_id) -- one completion record per checklist item
);

-- ============================================================
-- 4. BOOKINGS TABLE
-- ============================================================
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  event_name TEXT NOT NULL,
  venue TEXT,
  date DATE NOT NULL,
  end_date DATE,
  fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  deposit DECIMAL(12,2) DEFAULT 0,
  balance DECIMAL(12,2) GENERATED ALWAYS AS (fee - deposit) STORED,
  status TEXT NOT NULL DEFAULT 'inquiry' CHECK (
    status IN ('inquiry', 'confirmed', 'completed', 'cancelled')
  ),
  rider JSONB DEFAULT '{}', -- technical + hospitality requirements
  promoter_name TEXT,
  promoter_contact TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. AUDIT LOG TABLE
-- ============================================================
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  user_email TEXT,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'task_assigned', 'approval_required', 'deadline', 'booking_confirmed'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT, -- URL to the relevant page
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. MODIFY EXISTING TABLES — add project_id
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- ============================================================
-- 8. UPDATED_AT TRIGGERS
-- ============================================================
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 9. AUDIT LOG TRIGGERS (auto-log changes to key tables)
-- ============================================================
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_record_id UUID;
BEGIN
  -- Try to get current user from JWT
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_record_id := (OLD.id)::UUID;
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (v_user_id, 'DELETE', TG_TABLE_NAME, v_record_id, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := (NEW.id)::UUID;
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (v_user_id, 'UPDATE', TG_TABLE_NAME, v_record_id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := (NEW.id)::UUID;
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (v_user_id, 'INSERT', TG_TABLE_NAME, v_record_id, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to key tables
CREATE TRIGGER audit_artists AFTER INSERT OR UPDATE OR DELETE ON artists FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER audit_projects AFTER INSERT OR UPDATE OR DELETE ON projects FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER audit_transactions AFTER INSERT OR UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER audit_bookings AFTER INSERT OR UPDATE OR DELETE ON bookings FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER audit_contracts AFTER INSERT OR UPDATE OR DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ============================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================

-- Projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_read" ON projects FOR SELECT TO authenticated USING (current_user_role() IN ('admin','manager','finance'));
CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','manager'));
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated USING (current_user_role() IN ('admin','manager'));
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated USING (current_user_role() = 'admin');

-- Project Checklists
ALTER TABLE project_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklists_read" ON project_checklists FOR SELECT TO authenticated USING (current_user_role() IN ('admin','manager','finance'));
CREATE POLICY "checklists_insert" ON project_checklists FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','manager'));
CREATE POLICY "checklists_update" ON project_checklists FOR UPDATE TO authenticated USING (current_user_role() IN ('admin','manager'));
CREATE POLICY "checklists_delete" ON project_checklists FOR DELETE TO authenticated USING (current_user_role() = 'admin');

-- Checklist Completions
ALTER TABLE checklist_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "completions_read" ON checklist_completions FOR SELECT TO authenticated USING (current_user_role() IN ('admin','manager','finance'));
CREATE POLICY "completions_insert" ON checklist_completions FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','manager','finance'));
CREATE POLICY "completions_update" ON checklist_completions FOR UPDATE TO authenticated USING (current_user_role() IN ('admin','manager','finance'));

-- Bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings_read" ON bookings FOR SELECT TO authenticated USING (current_user_role() IN ('admin','manager','finance'));
CREATE POLICY "bookings_insert" ON bookings FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','manager'));
CREATE POLICY "bookings_update" ON bookings FOR UPDATE TO authenticated USING (current_user_role() IN ('admin','manager'));
CREATE POLICY "bookings_delete" ON bookings FOR DELETE TO authenticated USING (current_user_role() = 'admin');

-- Audit Log (read-only for all authenticated, no direct writes from client)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read" ON audit_log FOR SELECT TO authenticated USING (current_user_role() IN ('admin','manager'));

-- Notifications (each user sees only their own)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_read" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_update" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 11. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_projects_artist_id ON projects(artist_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_target_date ON projects(target_date);
CREATE INDEX IF NOT EXISTS idx_checklists_project_id ON project_checklists(project_id);
CREATE INDEX IF NOT EXISTS idx_checklists_assigned_to ON project_checklists(assigned_to);
CREATE INDEX IF NOT EXISTS idx_completions_checklist_id ON checklist_completions(checklist_id);
CREATE INDEX IF NOT EXISTS idx_completions_approval_status ON checklist_completions(approval_status);
CREATE INDEX IF NOT EXISTS idx_bookings_artist_id ON bookings(artist_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);

-- ============================================================
-- 12. DEFAULT RELEASE PLAN TEMPLATE FUNCTION
-- Call this after creating a release project to auto-populate checklist
-- Usage: SELECT create_release_checklist('<project_id>');
-- ============================================================
CREATE OR REPLACE FUNCTION create_release_checklist(p_project_id UUID)
RETURNS void AS $$
DECLARE
  items TEXT[] := ARRAY[
    'Brief & Concept Approval',
    'Recording Session Booked',
    'Recording Complete',
    'Rough Mix Delivered',
    'Final Mix Approved',
    'Mastering Complete',
    'Final Master WAV Delivered',
    'Split Sheets Signed',
    'Publishing Registration',
    'Front Cover Artwork (3000x3000 300dpi)',
    'Back Cover & Spine',
    'Artist Bio Updated',
    'Metadata Sheet Complete (ISRC, BPM, Key, Genre)',
    'Lyrics Proofread & Approved',
    'Distributor Account Ready',
    'Distribution Submission',
    'Pre-Save Link Created',
    'Social Media Content Calendar',
    'Press Release Written',
    'Playlist Pitching Submitted',
    'Music Video / Visualizer',
    'Release Day Checklist Complete',
    'Post-Release Performance Report'
  ];
  item TEXT;
  pos INTEGER := 0;
BEGIN
  FOREACH item IN ARRAY items LOOP
    INSERT INTO project_checklists (project_id, item_name, required, position)
    VALUES (p_project_id, item, true, pos);
    pos := pos + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DONE
-- ============================================================
