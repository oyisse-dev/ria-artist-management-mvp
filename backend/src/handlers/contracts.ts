import { supabase } from "../lib/db.js";
import type { ContractItem } from "../lib/types.js";

export async function listArtistContracts(artistId: string): Promise<ContractItem[]> {
  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("artist_id", artistId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapContract);
}

export async function createContract(body: Record<string, unknown>): Promise<ContractItem> {
  const { data, error } = await supabase
    .from("contracts")
    .insert({
      artist_id: String(body.artistId ?? ""),
      title: String(body.title ?? ""),
      file_url: body.fileUrl ? String(body.fileUrl) : null,
      signed_date: body.signedDate ? String(body.signedDate) : null,
      expiry_date: body.expiryDate ? String(body.expiryDate) : null
    })
    .select()
    .single();

  if (error) throw error;
  return mapContract(data);
}

export async function deleteContract(contractId: string): Promise<void> {
  const { error } = await supabase.from("contracts").delete().eq("id", contractId);
  if (error) throw error;
}

function mapContract(row: Record<string, unknown>): ContractItem {
  return {
    contractId: String(row.id),
    artistId: String(row.artist_id),
    title: String(row.title),
    fileUrl: row.file_url ? String(row.file_url) : undefined,
    signedDate: row.signed_date ? String(row.signed_date) : undefined,
    expiryDate: row.expiry_date ? String(row.expiry_date) : undefined,
    createdAt: String(row.created_at ?? "")
  };
}
