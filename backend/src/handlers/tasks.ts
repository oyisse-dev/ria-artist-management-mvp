import { supabase } from "../lib/db.js";
import type { TaskItem } from "../lib/types.js";

export async function listArtistTasks(artistId: string): Promise<TaskItem[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("artist_id", artistId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map(mapTask);
}

export async function listMyTasks(userId: string): Promise<TaskItem[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("assigned_to", userId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map(mapTask);
}

export async function createTask(body: Record<string, unknown>, userId: string): Promise<TaskItem> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      artist_id: String(body.artistId ?? ""),
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : null,
      due_date: body.dueDate ? String(body.dueDate) : null,
      assigned_to: body.assignedTo ? String(body.assignedTo) : null,
      completed: false,
      created_by: userId
    })
    .select()
    .single();

  if (error) throw error;
  return mapTask(data);
}

export async function updateTask(taskId: string, body: Record<string, unknown>): Promise<TaskItem | null> {
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = String(body.title);
  if (body.description !== undefined) updates.description = String(body.description);
  if (body.dueDate !== undefined) updates.due_date = String(body.dueDate);
  if (body.assignedTo !== undefined) updates.assigned_to = String(body.assignedTo);
  if (body.completed !== undefined) {
    const completed = body.completed === true || body.completed === "true";
    updates.completed = completed;
    updates.completed_at = completed ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .select()
    .single();

  if (error) return null;
  return data ? mapTask(data) : null;
}

function mapTask(row: Record<string, unknown>): TaskItem {
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
    updatedAt: String(row.updated_at ?? "")
  };
}
