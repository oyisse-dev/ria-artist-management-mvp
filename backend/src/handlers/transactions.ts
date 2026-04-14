import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { DEFAULT_COMMISSION_RATE, TABLE_NAME } from "../lib/config.js";
import { ddb } from "../lib/db.js";
import { keys } from "../lib/keys.js";
import { getArtist } from "./artists.js";

export async function listArtistTransactions(artistId: string) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :txPrefix)",
      ExpressionAttributeValues: {
        ":pk": keys.artistPk(artistId),
        ":txPrefix": "TRANSACTION#"
      }
    })
  );
  return (result.Items ?? []).map(mapTransaction);
}

export async function createTransaction(body: Record<string, unknown>, userId: string) {
  const transactionId = uuid();
  const artistId = String(body.artistId ?? "");
  const amount = Number(body.amount ?? 0);
  const type = String(body.type ?? "expense") as "income" | "expense";
  const date = String(body.date ?? new Date().toISOString().slice(0, 10));
  const now = new Date().toISOString();

  const artist = await getArtist(artistId);
  const commissionRate = artist?.commissionRate ?? DEFAULT_COMMISSION_RATE;
  const commissionAmount = type === "income" ? (amount * commissionRate) / 100 : 0;
  const artistNetAmount = type === "income" ? amount - commissionAmount : 0;

  const item = {
    PK: keys.artistPk(artistId),
    SK: keys.transactionSk(transactionId),
    entityType: "TRANSACTION",
    transactionId,
    artistId,
    amount,
    type,
    date,
    category: body.category ? String(body.category) : undefined,
    notes: body.notes ? String(body.notes) : undefined,
    commissionAmount,
    artistNetAmount,
    createdBy: userId,
    createdAt: now,
    GSI3PK: keys.gsi3TxPk,
    GSI3SK: keys.gsi3TxSk(date, transactionId)
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return mapTransaction(item);
}

export async function recentTransactions(limit = 20) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI3",
      KeyConditionExpression: "GSI3PK = :pk",
      ExpressionAttributeValues: { ":pk": keys.gsi3TxPk },
      ScanIndexForward: false,
      Limit: limit
    })
  );
  return (result.Items ?? []).map(mapTransaction);
}

function mapTransaction(item: Record<string, unknown>) {
  return {
    transactionId: String(item.transactionId),
    artistId: String(item.artistId),
    amount: Number(item.amount ?? 0),
    date: String(item.date ?? ""),
    type: String(item.type ?? "expense"),
    category: item.category ? String(item.category) : undefined,
    notes: item.notes ? String(item.notes) : undefined,
    commissionAmount: Number(item.commissionAmount ?? 0),
    artistNetAmount: Number(item.artistNetAmount ?? 0),
    createdBy: String(item.createdBy ?? ""),
    createdAt: String(item.createdAt ?? "")
  };
}
