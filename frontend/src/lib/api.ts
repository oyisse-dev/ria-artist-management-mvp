/**
 * API layer — queries Supabase directly from the frontend.
 * Commission calculation is done client-side for now.
 * When the backend Lambda is deployed, swap these calls to use the REST client below.
 */
import { supabase } from "./supabase";

const DEFAULT_COMMISSION = 20;

// ---- Artists ----
export async function fetchArtists() {
  const { data, error } = await supabase.from("artists").select("*").order("stage_name");
  if (error) throw error;
  return (data ?? []).map(mapArtist);
}

export async function fetchArtist(id: string) {
  const { data, error } = await supabase.from("artists").select("*").eq("id", id).single();
  if (error) throw error;
  return mapArtist(data);
}

export async function createArtist(body: Record<string, unknown>) {
  const { data, error } = await supabase.from("artists").insert({
    stage_name: body.stageName,
    legal_name: body.legalName || null,
    contact_email: body.contactEmail || null,
    phone: body.phone || null,
    bio: body.bio || null,
    commission_rate: Number(body.commissionRate ?? DEFAULT_COMMISSION),
    contract_start: body.contractStart || null,
    contract_end: body.contractEnd || null,
  }).select().single();
  if (error) throw error;
  return mapArtist(data);
}

export async function updateArtist(id: string, body: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  if (body.stageName !== undefined) updates.stage_name = body.stageName;
  if (body.legalName !== undefined) updates.legal_name = body.legalName || null;
  if (body.contactEmail !== undefined) updates.contact_email = body.contactEmail || null;
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.bio !== undefined) updates.bio = body.bio || null;
  if (body.commissionRate !== undefined) updates.commission_rate = Number(body.commissionRate);
  if (body.contractStart !== undefined) updates.contract_start = body.contractStart || null;
  if (body.contractEnd !== undefined) updates.contract_end = body.contractEnd || null;
  const { data, error } = await supabase.from("artists").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return mapArtist(data);
}

export async function deleteArtist(id: string) {
  const { error } = await supabase.from("artists").delete().eq("id", id);
  if (error) throw error;
}

function mapArtist(row: Record<string, unknown>) {
  return {
    artistId: String(row.id),
    stageName: String(row.stage_name),
    legalName: row.legal_name ? String(row.legal_name) : undefined,
    contactEmail: row.contact_email ? String(row.contact_email) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    bio: row.bio ? String(row.bio) : undefined,
    commissionRate: Number(row.commission_rate ?? DEFAULT_COMMISSION),
    contractStart: row.contract_start ? String(row.contract_start) : undefined,
    contractEnd: row.contract_end ? String(row.contract_end) : undefined,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

// ---- Tasks ----
export async function fetchMyTasks() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from("tasks").select("*")
    .eq("assigned_to", user.id).order("due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapTask);
}

export async function fetchArtistTasks(artistId: string) {
  const { data, error } = await supabase.from("tasks").select("*")
    .eq("artist_id", artistId).order("due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapTask);
}

export async function createTask(body: Record<string, unknown>) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("tasks").insert({
    artist_id: body.artistId,
    title: body.title,
    description: body.description || null,
    due_date: body.dueDate || null,
    assigned_to: body.assignedTo || null,
    completed: false,
    created_by: user?.id,
  }).select().single();
  if (error) throw error;
  return mapTask(data);
}

export async function updateTask(id: string, body: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.dueDate !== undefined) updates.due_date = body.dueDate;
  if (body.assignedTo !== undefined) updates.assigned_to = body.assignedTo;
  if (body.completed !== undefined) {
    updates.completed = body.completed;
    updates.completed_at = body.completed ? new Date().toISOString() : null;
  }
  const { data, error } = await supabase.from("tasks").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return mapTask(data);
}

function mapTask(row: Record<string, unknown>) {
  return {
    taskId: String(row.id),
    artistId: String(row.artist_id),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    dueDate: row.due_date ? String(row.due_date) : undefined,
    completed: Boolean(row.completed),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    assignedTo: row.assigned_to ? String(row.assigned_to) : undefined,
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

// ---- Transactions ----
export async function fetchArtistTransactions(artistId: string) {
  const { data, error } = await supabase.from("transactions").select("*")
    .eq("artist_id", artistId).order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTransaction);
}

export async function createTransaction(body: Record<string, unknown>) {
  const { data: { user } } = await supabase.auth.getUser();
  const artistId = String(body.artistId ?? "");
  const amount = Number(body.amount ?? 0);
  const type = String(body.type ?? "expense");

  // Get artist commission rate
  const { data: artist } = await supabase.from("artists").select("commission_rate").eq("id", artistId).single();
  const commissionRate = Number(artist?.commission_rate ?? DEFAULT_COMMISSION);
  const commissionAmount = type === "income" ? (amount * commissionRate) / 100 : 0;
  const artistNetAmount = type === "income" ? amount - commissionAmount : 0;

  const { data, error } = await supabase.from("transactions").insert({
    artist_id: artistId,
    amount,
    type,
    date: body.date,
    category: body.category || null,
    notes: body.notes || null,
    description: body.notes || null,
    commission_amount: commissionAmount,
    artist_net_amount: artistNetAmount,
    created_by: user?.id,
  }).select().single();
  if (error) throw error;
  return mapTransaction(data);
}

function mapTransaction(row: Record<string, unknown>) {
  return {
    transactionId: String(row.id),
    artistId: String(row.artist_id),
    amount: Number(row.amount ?? 0),
    date: String(row.date ?? ""),
    type: String(row.type ?? "expense") as "income" | "expense",
    category: row.category ? String(row.category) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    commissionAmount: Number(row.commission_amount ?? 0),
    artistNetAmount: Number(row.artist_net_amount ?? 0),
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

// ---- Users ----
export async function fetchUsers() {
  const { data } = await supabase.from("users").select("*").order("full_name");
  return data ?? [];
}
