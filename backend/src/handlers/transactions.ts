import { supabase } from "../lib/db.js";
import { DEFAULT_COMMISSION_RATE } from "../lib/config.js";
import type { TransactionItem } from "../lib/types.js";
import { getArtist } from "./artists.js";

export async function listArtistTransactions(artistId: string): Promise<TransactionItem[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("artist_id", artistId)
    .order("date", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapTransaction);
}

export async function createTransaction(body: Record<string, unknown>, userId: string): Promise<TransactionItem> {
  const artistId = String(body.artistId ?? "");
  const amount = Number(body.amount ?? 0);
  const type = String(body.type ?? "expense") as "income" | "expense";
  const date = String(body.date ?? new Date().toISOString().slice(0, 10));

  // Calculate commission
  const artist = await getArtist(artistId);
  const commissionRate = artist?.commissionRate ?? DEFAULT_COMMISSION_RATE;
  const commissionAmount = type === "income" ? (amount * commissionRate) / 100 : 0;
  const artistNetAmount = type === "income" ? amount - commissionAmount : 0;

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      artist_id: artistId,
      amount,
      type,
      date,
      category: body.category ? String(body.category) : null,
      description: body.description ?? (body.notes ? String(body.notes) : null),
      notes: body.notes ? String(body.notes) : null,
      receipt_url: body.receiptUrl ? String(body.receiptUrl) : null,
      commission_amount: commissionAmount,
      artist_net_amount: artistNetAmount,
      created_by: userId
    })
    .select()
    .single();

  if (error) throw error;
  return mapTransaction(data);
}

export async function recentTransactions(limit = 20): Promise<TransactionItem[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapTransaction);
}

function mapTransaction(row: Record<string, unknown>): TransactionItem {
  return {
    transactionId: String(row.id),
    artistId: String(row.artist_id),
    amount: Number(row.amount ?? 0),
    date: String(row.date ?? ""),
    type: String(row.type ?? "expense") as "income" | "expense",
    category: row.category ? String(row.category) : undefined,
    notes: row.notes ? String(row.notes) : (row.description ? String(row.description) : undefined),
    description: row.description ? String(row.description) : undefined,
    receiptUrl: row.receipt_url ? String(row.receipt_url) : undefined,
    commissionAmount: Number(row.commission_amount ?? 0),
    artistNetAmount: Number(row.artist_net_amount ?? 0),
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}
