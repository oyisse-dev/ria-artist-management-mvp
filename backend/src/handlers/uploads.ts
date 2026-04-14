import { supabase } from "../lib/db.js";
import { v4 as uuid } from "uuid";

export async function createUploadUrl(body: Record<string, unknown>) {
  const artistId = String(body.artistId ?? "unknown");
  const type = String(body.type ?? "contracts");
  const ext = String(body.ext ?? "pdf").replace(".", "");
  const fileName = `${uuid()}.${ext}`;
  const path = `artists/${artistId}/${type}/${fileName}`;

  // Create a signed upload URL using Supabase Storage
  const { data, error } = await supabase.storage
    .from("ria-documents")
    .createSignedUploadUrl(path);

  if (error) throw error;

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    path,
    fileUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/ria-documents/${path}`
  };
}
