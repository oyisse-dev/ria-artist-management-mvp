import axios from "axios";
import { config } from "./config";
import { useAuthStore } from "../context/auth-store";

const client = axios.create({ baseURL: config.apiBaseUrl });

client.interceptors.request.use((req) => {
  const token = useAuthStore.getState().accessToken;
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

// ---- Dashboard ----
export async function fetchDashboard() {
  const { data } = await client.get("/dashboard");
  return data as {
    pendingTasks: number;
    totalArtists: number;
    totalIncome: number;
    totalExpense: number;
    net: number;
    recentTransactions: Array<Record<string, unknown>>;
  };
}

// ---- Artists ----
export async function fetchArtists() {
  const { data } = await client.get("/artists");
  return data.items as Array<Record<string, unknown>>;
}

export async function fetchArtist(id: string) {
  const { data } = await client.get(`/artists/${id}`);
  return data as Record<string, unknown>;
}

export async function createArtist(body: Record<string, unknown>) {
  const { data } = await client.post("/artists", body);
  return data as Record<string, unknown>;
}

export async function updateArtist(id: string, body: Record<string, unknown>) {
  const { data } = await client.put(`/artists/${id}`, body);
  return data as Record<string, unknown>;
}

export async function deleteArtist(id: string) {
  await client.delete(`/artists/${id}`);
}

// ---- Tasks ----
export async function fetchMyTasks() {
  const { data } = await client.get("/tasks/me");
  return data.items as Array<Record<string, unknown>>;
}

export async function fetchArtistTasks(artistId: string) {
  const { data } = await client.get(`/artists/${artistId}/tasks`);
  return data.items as Array<Record<string, unknown>>;
}

export async function createTask(body: Record<string, unknown>) {
  const { data } = await client.post("/tasks", body);
  return data as Record<string, unknown>;
}

export async function updateTask(id: string, body: Record<string, unknown>) {
  const { data } = await client.patch(`/tasks/${id}`, body);
  return data as Record<string, unknown>;
}

// ---- Transactions ----
export async function fetchArtistTransactions(artistId: string) {
  const { data } = await client.get(`/artists/${artistId}/transactions`);
  return data.items as Array<Record<string, unknown>>;
}

export async function createTransaction(body: Record<string, unknown>) {
  const { data } = await client.post("/transactions", body);
  return data as Record<string, unknown>;
}

// ---- Users ----
export async function fetchUsers() {
  // Fetch directly from Supabase (public users table)
  const { supabase } = await import("./supabase");
  const { data } = await supabase.from("users").select("*").order("full_name");
  return data ?? [];
}
