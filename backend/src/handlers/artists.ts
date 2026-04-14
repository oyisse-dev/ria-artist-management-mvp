import { supabase } from "../lib/db.js";
import { DEFAULT_COMMISSION_RATE } from "../lib/config.js";
import type { AuthUser, Artist } from "../lib/types.js";

export async function listArtists(user: AuthUser): Promise<Artist[]> {
  let query = supabase.from("artists").select("*").order("stage_name");

  // Managers only see their assigned artists
  if (user.role === "Manager") {
    const { data: assignments } = await supabase
      .from("artist_assignments")
      .select("artist_id")
      .eq("user_id", user.id);

    const assignedIds = (assignments ?? []).map((a) => a.artist_id);

    // Also include artists where they are the manager
    query = supabase
      .from("artists")
      .select("*")
      .or(`manager_id.eq.${user.id},id.in.(${assignedIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)
      .order("stage_name");
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapArtist);
}

export async function getArtist(artistId: string): Promise<Artist | null> {
  const { data, error } = await supabase
    .from("artists")
    .select("*")
    .eq("id", artistId)
    .single();

  if (error) return null;
  return data ? mapArtist(data) : null;
}

export async function createArtist(body: Record<string, unknown>, userId: string): Promise<Artist> {
  const { data, error } = await supabase
    .from("artists")
    .insert({
      stage_name: String(body.stageName ?? "").trim(),
      legal_name: body.legalName ? String(body.legalName) : null,
      contact_email: body.contactEmail ? String(body.contactEmail) : null,
      phone: body.phone ? String(body.phone) : null,
      bio: body.bio ? String(body.bio) : null,
      social_links: body.socialLinks ?? null,
      commission_rate: Number(body.commissionRate ?? DEFAULT_COMMISSION_RATE),
      manager_id: body.managerId ? String(body.managerId) : null,
      contract_start: body.contractStart ? String(body.contractStart) : null,
      contract_end: body.contractEnd ? String(body.contractEnd) : null,
      created_by: userId
    })
    .select()
    .single();

  if (error) throw error;
  return mapArtist(data);
}

export async function updateArtist(artistId: string, body: Record<string, unknown>): Promise<Artist | null> {
  const updates: Record<string, unknown> = {};
  if (body.stageName !== undefined) updates.stage_name = String(body.stageName);
  if (body.legalName !== undefined) updates.legal_name = String(body.legalName);
  if (body.contactEmail !== undefined) updates.contact_email = String(body.contactEmail);
  if (body.phone !== undefined) updates.phone = String(body.phone);
  if (body.bio !== undefined) updates.bio = String(body.bio);
  if (body.socialLinks !== undefined) updates.social_links = body.socialLinks;
  if (body.commissionRate !== undefined) updates.commission_rate = Number(body.commissionRate);
  if (body.managerId !== undefined) updates.manager_id = String(body.managerId);
  if (body.contractStart !== undefined) updates.contract_start = String(body.contractStart);
  if (body.contractEnd !== undefined) updates.contract_end = String(body.contractEnd);

  const { data, error } = await supabase
    .from("artists")
    .update(updates)
    .eq("id", artistId)
    .select()
    .single();

  if (error) return null;
  return data ? mapArtist(data) : null;
}

export async function deleteArtist(artistId: string): Promise<void> {
  const { error } = await supabase.from("artists").delete().eq("id", artistId);
  if (error) throw error;
}

function mapArtist(row: Record<string, unknown>): Artist {
  return {
    artistId: String(row.id),
    stageName: String(row.stage_name),
    legalName: row.legal_name ? String(row.legal_name) : undefined,
    contactEmail: row.contact_email ? String(row.contact_email) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    bio: row.bio ? String(row.bio) : undefined,
    socialLinks: row.social_links as Record<string, string> | undefined,
    commissionRate: Number(row.commission_rate ?? DEFAULT_COMMISSION_RATE),
    managerId: row.manager_id ? String(row.manager_id) : undefined,
    contractStart: row.contract_start ? String(row.contract_start) : undefined,
    contractEnd: row.contract_end ? String(row.contract_end) : undefined,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}
