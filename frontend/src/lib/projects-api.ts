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
  depends_on?: string;
  position: number;
  // joined completion
  checklist_completions?: ChecklistCompletion[];
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
export async function fetchProjectChecklist(projectId: string) {
  const { data, error } = await supabase
    .from("project_checklists")
    .select("*, checklist_completions(*), users(full_name)")
    .eq("project_id", projectId)
    .order("position");
  if (error) throw error;
  return (data ?? []) as ChecklistItem[];
}

export async function updateChecklistItem(id: string, updates: Partial<ChecklistItem>) {
  const { data, error } = await supabase
    .from("project_checklists")
    .update(updates)
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
    })
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
  const done = items.filter(
    (i) => i.checklist_completions?.[0]?.approval_status === "approved"
  ).length;
  return Math.round((done / items.length) * 100);
}
