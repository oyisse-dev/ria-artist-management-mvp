import { supabase } from "./supabase";

export type ProjectType = "release" | "tour" | "campaign";
export type ProjectStatus =
  | "planning" | "pre_production" | "recording" | "mix_master"
  | "asset_collection" | "qc" | "distribution" | "live" | "completed";

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  pre_production: "Pre-Production",
  recording: "Recording",
  mix_master: "Mix & Master",
  asset_collection: "Asset Collection",
  qc: "QC",
  distribution: "Distribution",
  live: "Live",
  completed: "Completed",
};

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: "bg-slate-100 text-slate-600",
  pre_production: "bg-purple-100 text-purple-700",
  recording: "bg-blue-100 text-blue-700",
  mix_master: "bg-indigo-100 text-indigo-700",
  asset_collection: "bg-amber-100 text-amber-700",
  qc: "bg-orange-100 text-orange-700",
  distribution: "bg-cyan-100 text-cyan-700",
  live: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-700",
};

export type Project = {
  id: string;
  artist_id: string;
  type: ProjectType;
  title: string;
  status: ProjectStatus;
  target_date?: string;
  actual_date?: string;
  budget_estimate?: number;
  actual_cost?: number;
  description?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // joined
  artists?: { stage_name: string };
  progress?: number; // calculated
};

export type ChecklistItem = {
  id: string;
  project_id: string;
  item_name: string;
  description?: string;
  required: boolean;
  assignee_role?: string;
  assigned_to?: string;
  due_date?: string;
  due_offset_days?: number | null;
  depends_on?: string;
  position: number;
  group_name?: string;
  has_deliverable?: boolean;
  deliverable_type?: string;
  deliverable_custom?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  archived_at?: string | null;
  archived_by?: string | null;
  // joined completion
  checklist_completions?: ChecklistCompletion[] | ChecklistCompletion;
  users?: { full_name: string };
};

export type ChecklistCompletion = {
  id: string;
  checklist_id: string;
  completed_by?: string;
  completed_at?: string;
  file_urls: string[];
  file_names: string[];
  notes?: string;
  approval_status: "pending" | "submitted" | "approved" | "rejected";
  approver_id?: string;
  approved_at?: string;
  rejection_reason?: string;
};

export type Booking = {
  id: string;
  artist_id: string;
  project_id?: string;
  event_name: string;
  venue?: string;
  date: string;
  end_date?: string;
  fee: number;
  deposit: number;
  balance: number;
  status: "inquiry" | "confirmed" | "completed" | "cancelled";
  rider?: Record<string, unknown>;
  promoter_name?: string;
  promoter_contact?: string;
  notes?: string;
  artists?: { stage_name: string };
};

// ---- Projects ----
export async function fetchProjects(artistId?: string) {
  let q = supabase
    .from("projects")
    .select("*, artists(stage_name)")
    .order("created_at", { ascending: false });
  if (artistId) q = q.eq("artist_id", artistId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function fetchProject(id: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("*, artists(stage_name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Project;
}

export async function createProject(body: Partial<Project> & { artistId: string; title: string; type: ProjectType }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("projects").insert({
    artist_id: body.artistId,
    type: body.type,
    title: body.title,
    status: "planning",
    target_date: body.target_date || null,
    budget_estimate: body.budget_estimate || null,
    description: body.description || null,
    created_by: user?.id,
  }).select("*, artists(stage_name)").single();
  if (error) throw error;

  // Auto-populate release checklist
  if (body.type === "release") {
    await supabase.rpc("create_release_checklist", { p_project_id: data.id });
  }
  return data as Project;
}

export async function updateProject(id: string, updates: Partial<Project>) {
  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select("*, artists(stage_name)")
    .single();
  if (error) throw error;
  return data as Project;
}

export async function deleteProject(id: string) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// ---- Checklists ----
export async function fetchProjectChecklist(projectId: string, opts?: { includeArchived?: boolean }) {
  const applyArchivedFilter = <T extends { is: (col: string, val: null) => T }>(query: T) => {
    if (!opts?.includeArchived) return query.is("archived_at", null);
    return query;
  };

  // Attempt 1: full query with joins
  {
    const q = applyArchivedFilter(
      supabase
        .from("project_checklists")
        .select("*, checklist_completions(*), users(full_name)")
        .eq("project_id", projectId)
        .order("position")
    );
    const { data, error } = await q;
    if (!error) return (data ?? []) as ChecklistItem[];
    console.warn("fetchProjectChecklist: full query failed, falling back:", error.message);
  }

  // Attempt 2: remove users join (common RLS/relationship failure point)
  {
    const q = applyArchivedFilter(
      supabase
        .from("project_checklists")
        .select("*, checklist_completions(*)")
        .eq("project_id", projectId)
        .order("position")
    );
    const { data, error } = await q;
    if (!error) return (data ?? []) as ChecklistItem[];
    console.warn("fetchProjectChecklist: completion join query failed, falling back:", error.message);
  }

  // Attempt 3: base checklist only (keeps page functional)
  {
    const q = applyArchivedFilter(
      supabase
        .from("project_checklists")
        .select("*")
        .eq("project_id", projectId)
        .order("position")
    );
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as ChecklistItem[]).map((row) => ({ ...row, checklist_completions: [] }));
  }
}

export async function createChecklistItem(body: Partial<ChecklistItem> & { project_id: string; item_name: string; position?: number }) {
  const { data, error } = await supabase
    .from("project_checklists")
    .insert({
      project_id: body.project_id,
      item_name: body.item_name,
      description: body.description || null,
      required: body.required ?? true,
      assignee_role: body.assignee_role || null,
      assigned_to: body.assigned_to || null,
      due_offset_days: body.due_offset_days ?? null,
      group_name: body.group_name || "General",
      has_deliverable: body.has_deliverable ?? true,
      deliverable_type: body.deliverable_type || null,
      deliverable_custom: body.deliverable_custom || null,
      position: body.position ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChecklistItem(id: string, updates: Partial<ChecklistItem>) {
  const attempt = async (payload: Partial<ChecklistItem>) => {
    return await supabase
      .from("project_checklists")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
  };

  let { data, error } = await attempt(updates);

  // Backward-compatible fallback for environments where new columns are not migrated yet.
  if (error && "priority" in updates) {
    const msg = String((error as any)?.message ?? "").toLowerCase();
    const details = String((error as any)?.details ?? "").toLowerCase();
    const hint = String((error as any)?.hint ?? "").toLowerCase();
    if (msg.includes("priority") || details.includes("priority") || hint.includes("priority")) {
      const { priority, ...withoutPriority } = updates as any;
      ({ data, error } = await attempt(withoutPriority));
    }
  }

  if (error) throw error;
  return data;
}

export async function archiveChecklistItem(id: string) {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("project_checklists")
    .update({ archived_at: new Date().toISOString(), archived_by: auth.user?.id ?? null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function restoreChecklistItem(id: string) {
  const { data, error } = await supabase
    .from("project_checklists")
    .update({ archived_at: null, archived_by: null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function submitChecklistCompletion(
  checklistId: string,
  body: { notes?: string; fileUrls?: string[]; fileNames?: string[] }
) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("checklist_completions")
    .upsert({
      checklist_id: checklistId,
      completed_by: user?.id,
      completed_at: new Date().toISOString(),
      file_urls: body.fileUrls ?? [],
      file_names: body.fileNames ?? [],
      notes: body.notes || null,
      approval_status: "submitted",
    }, { onConflict: "checklist_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveChecklistItem(completionId: string, approved: boolean, reason?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("checklist_completions")
    .update({
      approval_status: approved ? "approved" : "rejected",
      approver_id: user?.id,
      approved_at: approved ? new Date().toISOString() : null,
      rejection_reason: reason || null,
    })
    .eq("id", completionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Bookings ----
export async function fetchBookings(artistId?: string) {
  let q = supabase
    .from("bookings")
    .select("*, artists(stage_name)")
    .order("date", { ascending: true });
  if (artistId) q = q.eq("artist_id", artistId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function createBooking(body: Partial<Booking> & { artistId: string; eventName: string; date: string; fee: number }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("bookings").insert({
    artist_id: body.artistId,
    event_name: body.eventName,
    venue: body.venue || null,
    date: body.date,
    fee: body.fee,
    deposit: body.deposit ?? 0,
    status: body.status ?? "inquiry",
    promoter_name: body.promoter_name || null,
    promoter_contact: body.promoter_contact || null,
    notes: body.notes || null,
    created_by: user?.id,
  }).select("*, artists(stage_name)").single();
  if (error) throw error;
  return data as Booking;
}

export async function updateBooking(id: string, updates: Partial<Booking>) {
  const { data, error } = await supabase
    .from("bookings")
    .update(updates)
    .eq("id", id)
    .select("*, artists(stage_name)")
    .single();
  if (error) throw error;
  return data as Booking;
}

// ---- Audit Log ----
export async function fetchAuditLog(tableName?: string, recordId?: string) {
  let q = supabase
    .from("audit_log")
    .select("*, users(full_name)")
    .order("changed_at", { ascending: false })
    .limit(100);
  if (tableName) q = q.eq("table_name", tableName);
  if (recordId) q = q.eq("record_id", recordId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ---- Helpers ----
export function calcProgress(items: ChecklistItem[]): number {
  if (!items.length) return 0;
  const done = items.filter((i: any) => {
    const c = i?.checklist_completions;
    const completion = Array.isArray(c) ? c[0] : c;
    return completion?.approval_status === "approved";
  }).length;
  return Math.round((done / items.length) * 100);
}
