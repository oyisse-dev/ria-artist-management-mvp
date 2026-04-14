-- ============================================================
-- RIA Artist Management — Supabase Migration
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. SCHEMA ADDITIONS
-- ============================================================

-- artists: add missing columns
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES auth.users(id);

-- tasks: add missing columns
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- transactions: add calculated commission columns
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS artist_net_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER artists_updated_at
  BEFORE UPDATE ON artists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. LINK users TABLE TO auth.users
-- ============================================================
-- The users table stores role info; auth is handled by Supabase Auth
-- We link via id = auth.users.id

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Auto-create a users row when someone signs up via Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'Manager')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if current user is assigned to an artist
CREATE OR REPLACE FUNCTION user_assigned_to_artist(p_artist_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM artist_assignments
    WHERE artist_id = p_artist_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- ARTISTS ----
-- Admin: full access
-- Manager: see only their assigned artists
-- Finance: read all artists
CREATE POLICY "artists_select" ON artists FOR SELECT USING (
  current_user_role() = 'Admin'
  OR current_user_role() = 'Finance'
  OR (current_user_role() = 'Manager' AND (manager_id = auth.uid() OR user_assigned_to_artist(id)))
);
CREATE POLICY "artists_insert" ON artists FOR INSERT WITH CHECK (
  current_user_role() IN ('Admin', 'Manager')
);
CREATE POLICY "artists_update" ON artists FOR UPDATE USING (
  current_user_role() = 'Admin'
  OR (current_user_role() = 'Manager' AND (manager_id = auth.uid() OR user_assigned_to_artist(id)))
);
CREATE POLICY "artists_delete" ON artists FOR DELETE USING (
  current_user_role() = 'Admin'
);

-- ---- TASKS ----
-- Admin/Manager: full access to their artists' tasks
-- Finance: read only
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (
  current_user_role() IN ('Admin', 'Manager', 'Finance')
);
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (
  current_user_role() IN ('Admin', 'Manager')
);
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (
  current_user_role() IN ('Admin', 'Manager', 'Finance')
);
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (
  current_user_role() = 'Admin'
);

-- ---- TRANSACTIONS ----
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (
  current_user_role() IN ('Admin', 'Manager', 'Finance')
);
CREATE POLICY "transactions_insert" ON transactions FOR INSERT WITH CHECK (
  current_user_role() IN ('Admin', 'Manager', 'Finance')
);
CREATE POLICY "transactions_update" ON transactions FOR UPDATE USING (
  current_user_role() IN ('Admin', 'Finance')
);
CREATE POLICY "transactions_delete" ON transactions FOR DELETE USING (
  current_user_role() = 'Admin'
);

-- ---- CONTRACTS ----
CREATE POLICY "contracts_select" ON contracts FOR SELECT USING (
  current_user_role() IN ('Admin', 'Manager', 'Finance')
);
CREATE POLICY "contracts_insert" ON contracts FOR INSERT WITH CHECK (
  current_user_role() IN ('Admin', 'Manager')
);
CREATE POLICY "contracts_update" ON contracts FOR UPDATE USING (
  current_user_role() IN ('Admin', 'Manager')
);
CREATE POLICY "contracts_delete" ON contracts FOR DELETE USING (
  current_user_role() = 'Admin'
);

-- ---- ARTIST ASSIGNMENTS ----
CREATE POLICY "assignments_select" ON artist_assignments FOR SELECT USING (
  current_user_role() IN ('Admin', 'Manager', 'Finance')
);
CREATE POLICY "assignments_insert" ON artist_assignments FOR INSERT WITH CHECK (
  current_user_role() = 'Admin'
);
CREATE POLICY "assignments_delete" ON artist_assignments FOR DELETE USING (
  current_user_role() = 'Admin'
);

-- ---- USERS ----
-- Everyone can see users (for assigning tasks etc.)
-- Only Admins can change roles
CREATE POLICY "users_select" ON users FOR SELECT USING (
  current_user_role() IN ('Admin', 'Manager', 'Finance')
);
CREATE POLICY "users_update_self" ON users FOR UPDATE USING (
  auth.uid() = id AND current_user_role() != 'Admin' -- non-admins can only edit themselves
);
CREATE POLICY "users_update_admin" ON users FOR UPDATE USING (
  current_user_role() = 'Admin'
);

-- 5. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tasks_artist_id ON tasks(artist_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_artist_id ON transactions(artist_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_artist_assignments_user ON artist_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_artist_id ON contracts(artist_id);
