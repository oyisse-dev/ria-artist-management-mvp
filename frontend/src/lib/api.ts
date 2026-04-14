import axios from "axios";
import { config } from "./config";
import { useAuthStore } from "../context/auth-store";

const client = axios.create({
  baseURL: config.apiBaseUrl
});

client.interceptors.request.use((request) => {
  const token = useAuthStore.getState().accessToken;
  if (token) request.headers.Authorization = `Bearer ${token}`;
  return request;
});

export async function fetchDashboard() {
  const { data } = await client.get("/dashboard");
  return data as {
    pendingTasks: number;
    totalIncome: number;
    totalExpense: number;
    net: number;
    recentTransactions: Array<Record<string, unknown>>;
  };
}

export async function fetchArtists() {
  const { data } = await client.get("/artists");
  return data.items as Array<Record<string, unknown>>;
}

export async function fetchMyTasks() {
  const { data } = await client.get("/tasks/me");
  return data.items as Array<Record<string, unknown>>;
}
