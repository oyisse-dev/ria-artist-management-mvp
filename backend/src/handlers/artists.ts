import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { TABLE_NAME, DEFAULT_COMMISSION_RATE } from "../lib/config.js";
import { ddb } from "../lib/db.js";
import { keys } from "../lib/keys.js";
import type { AuthUser } from "../lib/types.js";

export async function listArtists(user: AuthUser) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": "ARTIST" }
    })
  );

  const artists = (result.Items ?? []).map(mapArtist);
  if (user.roles.includes("Manager")) {
    return artists.filter((artist) => !artist.managerId || artist.managerId === user.id);
  }
  return artists;
}

export async function getArtist(artistId: string) {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: keys.artistPk(artistId), SK: keys.artistMetaSk }
    })
  );
  return result.Item ? mapArtist(result.Item) : null;
}

export async function createArtist(body: Record<string, unknown>, userId: string) {
  const artistId = uuid();
  const now = new Date().toISOString();
  const item = {
    PK: keys.artistPk(artistId),
    SK: keys.artistMetaSk,
    entityType: "ARTIST",
    artistId,
    stageName: String(body.stageName ?? "").trim(),
    legalName: body.legalName ? String(body.legalName) : undefined,
    commissionRate: Number(body.commissionRate ?? DEFAULT_COMMISSION_RATE),
    managerId: body.managerId ? String(body.managerId) : undefined,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    GSI2PK: "ARTIST",
    GSI2SK: `ARTIST#${artistId}`
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return mapArtist(item);
}

export async function updateArtist(artistId: string, body: Record<string, unknown>) {
  const current = await getArtist(artistId);
  if (!current) return null;

  const now = new Date().toISOString();
  const item = {
    PK: keys.artistPk(artistId),
    SK: keys.artistMetaSk,
    entityType: "ARTIST",
    artistId,
    stageName: body.stageName ? String(body.stageName) : current.stageName,
    legalName: body.legalName ? String(body.legalName) : current.legalName,
    commissionRate:
      typeof body.commissionRate !== "undefined"
        ? Number(body.commissionRate)
        : current.commissionRate,
    managerId: body.managerId ? String(body.managerId) : current.managerId,
    createdAt: current.createdAt,
    updatedAt: now,
    GSI2PK: "ARTIST",
    GSI2SK: `ARTIST#${artistId}`
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return mapArtist(item);
}

export async function deleteArtist(artistId: string) {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: keys.artistPk(artistId), SK: keys.artistMetaSk }
    })
  );
}

function mapArtist(item: Record<string, unknown>) {
  return {
    artistId: String(item.artistId),
    stageName: String(item.stageName),
    legalName: item.legalName ? String(item.legalName) : undefined,
    commissionRate: Number(item.commissionRate ?? DEFAULT_COMMISSION_RATE),
    managerId: item.managerId ? String(item.managerId) : undefined,
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? "")
  };
}
