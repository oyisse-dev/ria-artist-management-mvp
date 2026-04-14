import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { TABLE_NAME } from "../lib/config.js";
import { ddb } from "../lib/db.js";
import { keys } from "../lib/keys.js";

export async function listArtistTasks(artistId: string) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :taskPrefix)",
      ExpressionAttributeValues: {
        ":pk": keys.artistPk(artistId),
        ":taskPrefix": "TASK#"
      }
    })
  );
  return (result.Items ?? []).map(mapTask);
}

export async function listMyTasks(userId: string) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": keys.gsi1AssigneePk(userId) }
    })
  );
  return (result.Items ?? []).map(mapTask);
}

export async function createTask(body: Record<string, unknown>, userId: string) {
  const taskId = uuid();
  const artistId = String(body.artistId ?? "");
  const now = new Date().toISOString();
  const dueDate = body.dueDate ? String(body.dueDate) : undefined;
  const assignedTo = body.assignedTo ? String(body.assignedTo) : undefined;

  const item = {
    PK: keys.artistPk(artistId),
    SK: keys.taskSk(taskId),
    entityType: "TASK",
    taskId,
    artistId,
    title: String(body.title ?? ""),
    dueDate,
    completed: false,
    assignedTo,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    GSI1PK: assignedTo ? keys.gsi1AssigneePk(assignedTo) : undefined,
    GSI1SK: keys.gsi1TaskSk(dueDate, taskId),
    GSI2PK: keys.gsi2TaskPk,
    GSI2SK: keys.gsi2TaskSk(dueDate, taskId)
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `TASK#${taskId}`,
        SK: "METADATA",
        entityType: "TASK_POINTER",
        taskId,
        artistId
      }
    })
  );
  return mapTask(item);
}

export async function updateTask(taskId: string, body: Record<string, unknown>) {
  const task = await getTaskById(taskId);
  if (!task) return null;

  const dueDate = body.dueDate ? String(body.dueDate) : task.dueDate;
  const assignedTo = body.assignedTo ? String(body.assignedTo) : task.assignedTo;
  const item = {
    ...task.raw,
    title: body.title ? String(body.title) : task.title,
    dueDate,
    assignedTo,
    completed:
      typeof body.completed === "boolean"
        ? body.completed
        : typeof body.completed === "string"
          ? body.completed === "true"
          : task.completed,
    updatedAt: new Date().toISOString(),
    GSI1PK: assignedTo ? keys.gsi1AssigneePk(assignedTo) : undefined,
    GSI1SK: keys.gsi1TaskSk(dueDate, taskId),
    GSI2PK: keys.gsi2TaskPk,
    GSI2SK: keys.gsi2TaskSk(dueDate, taskId)
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return mapTask(item);
}

async function getTaskById(taskId: string) {
  const pointer = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `TASK#${taskId}`, SK: "METADATA" }
    })
  );
  if (!pointer.Item?.artistId) return null;

  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: keys.artistPk(String(pointer.Item.artistId)),
        SK: keys.taskSk(taskId)
      }
    })
  );
  if (!result.Item) return null;
  return { ...mapTask(result.Item), raw: result.Item };
}

function mapTask(item: Record<string, unknown>) {
  return {
    taskId: String(item.taskId),
    artistId: String(item.artistId),
    title: String(item.title),
    dueDate: item.dueDate ? String(item.dueDate) : undefined,
    completed: Boolean(item.completed),
    assignedTo: item.assignedTo ? String(item.assignedTo) : undefined,
    createdBy: String(item.createdBy ?? ""),
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? "")
  };
}
