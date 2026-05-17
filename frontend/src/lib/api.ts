import { supabase } from "./supabase";
import type {
  Artist,
  AuditLog,
  Booking,
  ChecklistCompletion,
  Contract,
  ArtistAssignment,
  NotificationItem,
  Project,
  ProjectChecklist,
  Task,
  Transaction,
  UserProfile
} from "./database.types";

export type ProjectWithArtist = Project & { artist?: Pick<Artist, "id" | "stage_name" | "commission_rate"> | null; progress?: number };
export type ChecklistWithCompletion = ProjectChecklist & { completion?: ChecklistCompletion | null; assignee?: UserProfile | null };
export type TaskWithJoins = Task & { artist?: Pick<Artist, "id" | "stage_name"> | null; assignee?: Pick<UserProfile, "id" | "full_name"> | null; project?: Pick<Project, "id" | "title"> | null };
export type TransactionWithJoins = Transaction & { artist?: Pick<Artist, "id" | "stage_name" | "commission_rate"> | null; project?: Pick<Project, "id" | "title"> | null };
export type BookingWithJoins = Booking & { artist?: Pick<Artist, "id" | "stage_name"> | null; project?: Pick<Project, "id" | "title"> | null };
export type ArtistAssignmentWithJoins = ArtistAssignment & { artist?: Pick<Artist, "id" | "stage_name"> | null; user?: Pick<UserProfile, "id" | "full_name" | "email" | "role" | "is_active"> | null };

export function getErrorMessage(error: unknown, fallback = "Request failed") {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const details = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [details.message, details.details, details.hint, details.code].filter(Boolean);
    return parts.join(" ") || fallback;
  }
  return typeof error === "string" ? error : fallback;
}

function throwIf(error: unknown) {
  if (!error) return;
  throw new Error(getErrorMessage(error, "Supabase request failed"));
}

export async function getCurrentProfile() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.from("users").select("*").eq("id", auth.user.id).single();
  throwIf(error);
  return data;
}

export async function listUsers() {
  const { data, error } = await supabase.from("users").select("*").order("full_name");
  throwIf(error);
  return data ?? [];
}

export async function updateUserProfile(id: string, payload: Partial<Pick<UserProfile, "full_name" | "role" | "is_active">>) {
  const { data, error } = await supabase.from("users").update(payload).eq("id", id).select().single();
  throwIf(error);
  return data;
}

export async function listArtistAssignments() {
  const { data, error } = await supabase
    .from("artist_assignments")
    .select("*, artist:artists(id,stage_name), user:users(id,full_name,email,role)")
    .order("assigned_at", { ascending: false });
  throwIf(error);
  return (data ?? []) as ArtistAssignmentWithJoins[];
}

export async function assignArtistToUser(artistId: string, userId: string) {
  const { data, error } = await supabase
    .from("artist_assignments")
    .upsert({ artist_id: artistId, user_id: userId }, { onConflict: "artist_id,user_id" })
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function removeArtistAssignment(artistId: string, userId: string) {
  const { error } = await supabase.from("artist_assignments").delete().eq("artist_id", artistId).eq("user_id", userId);
  throwIf(error);
}

export async function inviteUser(payload: { email: string; role: string; fullName: string }) {
  const { data, error } = await supabase.functions.invoke("invite-user", { body: payload });
  throwIf(error);
  return data;
}

export async function listArtists() {
  const { data, error } = await supabase.from("artists").select("*").order("stage_name");
  throwIf(error);
  return data ?? [];
}

export async function getArtist(id: string) {
  const { data, error } = await supabase.from("artists").select("*").eq("id", id).single();
  throwIf(error);
  return data;
}

export async function createArtist(payload: Partial<Artist>) {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("artists")
    .insert({ ...payload, created_by: user.user?.id ?? null })
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function updateArtist(id: string, payload: Partial<Artist>) {
  const { data, error } = await supabase.from("artists").update(payload).eq("id", id).select().single();
  throwIf(error);
  return data;
}

export async function listContracts(artistId: string) {
  const { data, error } = await supabase.from("contracts").select("*").eq("artist_id", artistId).order("created_at", { ascending: false });
  throwIf(error);
  return data ?? [];
}

export async function createContract(payload: Partial<Contract>) {
  const { data, error } = await supabase.from("contracts").insert(payload).select().single();
  throwIf(error);
  return data;
}

export async function listProjects(filters?: { status?: string; type?: string; artistId?: string }) {
  let query = supabase
    .from("projects")
    .select("*, artist:artists(id,stage_name,commission_rate)")
    .order("target_date", { ascending: true, nullsFirst: false });
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.type) query = query.eq("type", filters.type);
  if (filters?.artistId) query = query.eq("artist_id", filters.artistId);
  const { data, error } = await query;
  throwIf(error);
  const rows = (data ?? []) as ProjectWithArtist[];
  return Promise.all(
    rows.map(async (project) => ({
      ...project,
      progress: await getProjectProgress(project.id)
    }))
  );
}

export async function getProject(id: string) {
  const { data, error } = await supabase.from("projects").select("*, artist:artists(id,stage_name,commission_rate)").eq("id", id).single();
  throwIf(error);
  return { ...(data as ProjectWithArtist), progress: await getProjectProgress(id) };
}

export async function getProjectProgress(projectId: string) {
  const { data, error } = await supabase.rpc("project_progress", { p_project_id: projectId });
  if (error) return 0;
  return Number(data ?? 0);
}

export async function createProject(payload: Partial<Project> & { artist_id: string; title: string; type: string }) {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...payload, created_by: user.user?.id ?? null })
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function updateProject(id: string, payload: Partial<Project>) {
  const { data, error } = await supabase.from("projects").update(payload).eq("id", id).select().single();
  throwIf(error);
  return data;
}

export async function listProjectChecklist(projectId: string) {
  const { data: checklists, error } = await supabase
    .from("project_checklists")
    .select("*, assignee:users!project_checklists_assigned_to_fkey(id,full_name,email,role,created_at)")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("group_name")
    .order("position");
  throwIf(error);
  const ids = (checklists ?? []).map((item) => item.id);
  const { data: completions, error: completionError } = ids.length
    ? await supabase.from("checklist_completions").select("*").in("checklist_id", ids)
    : { data: [], error: null };
  throwIf(completionError);
  const completionByChecklist = new Map((completions ?? []).map((item) => [item.checklist_id, item]));
  return ((checklists ?? []) as ChecklistWithCompletion[]).map((item) => ({
    ...item,
    completion: completionByChecklist.get(item.id) ?? null
  }));
}

export async function saveChecklistCompletion(checklistId: string, payload: Partial<ChecklistCompletion>) {
  const { data: user } = await supabase.auth.getUser();
  const insert = {
    checklist_id: checklistId,
    completed_by: payload.completed_by ?? user.user?.id ?? null,
    ...payload
  };
  const { data, error } = await supabase
    .from("checklist_completions")
    .upsert(insert, { onConflict: "checklist_id" })
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function archiveChecklistItem(id: string) {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("project_checklists")
    .update({ archived_at: new Date().toISOString(), archived_by: user.user?.id ?? null })
    .eq("id", id)
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function uploadProjectAsset(project: Project, file: File, category = "assets") {
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const path = `${project.artist_id}/${project.id}/${category}/${safeName}`;
  const { error } = await supabase.storage.from("project-assets").upload(path, file, { upsert: false });
  throwIf(error);
  return path;
}

export async function listProjectAssets(project: Project) {
  const prefix = `${project.artist_id}/${project.id}/assets`;
  const { data, error } = await supabase.storage.from("project-assets").list(prefix, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  throwIf(error);
  return (data ?? []).map((item) => ({
    name: item.name,
    id: item.id ?? undefined,
    created_at: item.created_at ?? undefined,
    metadata: item.metadata as Record<string, unknown> | undefined
  }));
}

export async function signedAssetUrl(path: string, bucket = "project-assets") {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  throwIf(error);
  return data?.signedUrl ?? "";
}

export async function uploadPrivateFile(bucket: "contracts" | "receipts" | "photos", artistId: string, file: File, category: string) {
  const path = `${artistId}/${category}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  throwIf(error);
  return path;
}

export async function listTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, artist:artists(id,stage_name), assignee:users!tasks_assigned_to_fkey(id,full_name), project:projects(id,title)")
    .order("due_date", { ascending: true, nullsFirst: false });
  throwIf(error);
  return (data ?? []) as TaskWithJoins[];
}

export async function createTask(payload: Partial<Task>) {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...payload, created_by: user.user?.id ?? null })
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function updateTask(id: string, payload: Partial<Task>) {
  const next = payload.completed ? { ...payload, completed_at: new Date().toISOString() } : payload;
  const { data, error } = await supabase.from("tasks").update(next).eq("id", id).select().single();
  throwIf(error);
  return data;
}

export async function listTransactions(projectId?: string, artistId?: string) {
  let query = supabase.from("transactions").select("*, artist:artists(id,stage_name,commission_rate), project:projects(id,title)").order("date", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  if (artistId) query = query.eq("artist_id", artistId);
  const { data, error } = await query;
  throwIf(error);
  return (data ?? []) as TransactionWithJoins[];
}

export async function createTransaction(payload: Partial<Transaction>) {
  const { data: user } = await supabase.auth.getUser();
  const artist = payload.artist_id ? await getArtist(payload.artist_id) : null;
  const amount = Number(payload.amount ?? 0);
  const commissionRate = Number(artist?.commission_rate ?? 20);
  const commission = payload.type === "income" ? (amount * commissionRate) / 100 : 0;
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...payload,
      created_by: user.user?.id ?? null,
      commission_amount: commission,
      artist_net_amount: payload.type === "income" ? amount - commission : 0
    })
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function listBookings() {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, artist:artists(id,stage_name), project:projects(id,title)")
    .order("date", { ascending: true });
  throwIf(error);
  return (data ?? []) as BookingWithJoins[];
}

export async function createBooking(payload: Partial<Booking> & { artist_id: string; event_name: string; date: string }) {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("bookings").insert({ ...payload, created_by: user.user?.id ?? null }).select().single();
  throwIf(error);
  return data;
}

export async function updateBooking(id: string, payload: Partial<Booking>) {
  const { data, error } = await supabase.from("bookings").update(payload).eq("id", id).select().single();
  throwIf(error);
  return data;
}

export async function listNotifications() {
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
  throwIf(error);
  return (data ?? []) as NotificationItem[];
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  throwIf(error);
}

export async function listAuditLogs(recordId?: string) {
  let query = supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(100);
  if (recordId) query = query.eq("record_id", recordId);
  const { data, error } = await query;
  throwIf(error);
  return (data ?? []) as AuditLog[];
}
