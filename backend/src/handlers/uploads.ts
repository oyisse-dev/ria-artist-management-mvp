import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuid } from "uuid";
import { BUCKET_NAME } from "../lib/config.js";

const s3 = new S3Client({});

export async function createUploadUrl(body: Record<string, unknown>) {
  const artistId = String(body.artistId ?? "unknown");
  const type = String(body.type ?? "contracts");
  const ext = String(body.ext ?? "pdf").replace(".", "");
  const key = `artists/${artistId}/${type}/${uuid()}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: String(body.contentType ?? "application/octet-stream")
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  return {
    uploadUrl,
    key,
    fileUrl: `s3://${BUCKET_NAME}/${key}`
  };
}
