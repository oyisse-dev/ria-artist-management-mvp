import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getAuthUser, hasRole } from "./lib/auth.js";
import { noContent, response } from "./lib/http.js";
import { createArtist, deleteArtist, getArtist, listArtists, updateArtist } from "./handlers/artists.js";
import { createTask, listArtistTasks, listMyTasks, updateTask } from "./handlers/tasks.js";
import { createTransaction, listArtistTransactions } from "./handlers/transactions.js";
import { getDashboardSummary } from "./handlers/dashboard.js";
import { createUploadUrl } from "./handlers/uploads.js";

type Handler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

const routes: Array<{ method: string; regex: RegExp; handler: Handler }> = [
  { method: "GET", regex: /^\/artists$/, handler: handleListArtists },
  { method: "GET", regex: /^\/artists\/([^/]+)$/, handler: handleGetArtist },
  { method: "POST", regex: /^\/artists$/, handler: handleCreateArtist },
  { method: "PUT", regex: /^\/artists\/([^/]+)$/, handler: handleUpdateArtist },
  { method: "DELETE", regex: /^\/artists\/([^/]+)$/, handler: handleDeleteArtist },
  { method: "GET", regex: /^\/artists\/([^/]+)\/tasks$/, handler: handleArtistTasks },
  { method: "GET", regex: /^\/tasks\/me$/, handler: handleMyTasks },
  { method: "POST", regex: /^\/tasks$/, handler: handleCreateTask },
  { method: "PATCH", regex: /^\/tasks\/([^/]+)$/, handler: handleUpdateTask },
  { method: "GET", regex: /^\/artists\/([^/]+)\/transactions$/, handler: handleArtistTransactions },
  { method: "POST", regex: /^\/transactions$/, handler: handleCreateTransaction },
  { method: "GET", regex: /^\/dashboard$/, handler: handleDashboard },
  { method: "POST", regex: /^\/uploads\/presign$/, handler: handlePresignUpload }
];

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === "OPTIONS") return noContent();

  const path = event.path.replace(/^\/v1/, "") || "/";
  const method = event.httpMethod.toUpperCase();
  const route = routes.find((r) => r.method === method && r.regex.test(path));
  if (!route) return response(404, { message: "Not found" });

  try {
    return await route.handler({ ...event, path });
  } catch (error) {
    const statusCode =
      typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;
    if (statusCode !== 500) {
      return response(statusCode, {
        message: statusCode === 403 ? "Forbidden" : "Request failed"
      });
    }
    console.error("Unhandled error", error);
    return response(500, { message: "Internal server error" });
  }
}

async function handleListArtists(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager", "Finance"]);
  return response(200, { items: await listArtists(user) });
}

async function handleGetArtist(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager", "Finance"]);
  const artistId = extract(event.path, /^\/artists\/([^/]+)$/);
  const artist = await getArtist(artistId);
  return artist ? response(200, artist) : response(404, { message: "Artist not found" });
}

async function handleCreateArtist(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager"]);
  const body = parseBody(event.body);
  if (!body.stageName) return response(400, { message: "stageName is required" });
  return response(201, await createArtist(body, user.id));
}

async function handleUpdateArtist(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager"]);
  const artistId = extract(event.path, /^\/artists\/([^/]+)$/);
  const updated = await updateArtist(artistId, parseBody(event.body));
  return updated ? response(200, updated) : response(404, { message: "Artist not found" });
}

async function handleDeleteArtist(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin"]);
  const artistId = extract(event.path, /^\/artists\/([^/]+)$/);
  await deleteArtist(artistId);
  return noContent();
}

async function handleArtistTasks(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager", "Finance"]);
  const artistId = extract(event.path, /^\/artists\/([^/]+)\/tasks$/);
  return response(200, { items: await listArtistTasks(artistId) });
}

async function handleMyTasks(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager", "Finance"]);
  return response(200, { items: await listMyTasks(user.id) });
}

async function handleCreateTask(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager"]);
  const body = parseBody(event.body);
  if (!body.artistId || !body.title) return response(400, { message: "artistId and title are required" });
  return response(201, await createTask(body, user.id));
}

async function handleUpdateTask(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager", "Finance"]);
  const taskId = extract(event.path, /^\/tasks\/([^/]+)$/);
  const task = await updateTask(taskId, parseBody(event.body));
  return task ? response(200, task) : response(404, { message: "Task not found" });
}

async function handleArtistTransactions(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager", "Finance"]);
  const artistId = extract(event.path, /^\/artists\/([^/]+)\/transactions$/);
  return response(200, { items: await listArtistTransactions(artistId) });
}

async function handleCreateTransaction(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Finance", "Manager"]);
  const body = parseBody(event.body);
  if (!body.artistId || !body.amount || !body.type) {
    return response(400, { message: "artistId, amount, and type are required" });
  }
  return response(201, await createTransaction(body, user.id));
}

async function handleDashboard(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager", "Finance"]);
  return response(200, await getDashboardSummary());
}

async function handlePresignUpload(event: APIGatewayProxyEvent) {
  const user = getAuthUser(event);
  guard(user, ["Admin", "Manager", "Finance"]);
  const body = parseBody(event.body);
  if (!body.artistId) return response(400, { message: "artistId is required" });
  return response(200, await createUploadUrl(body));
}

function parseBody(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function guard(user: ReturnType<typeof getAuthUser>, allowed: Array<"Admin" | "Manager" | "Finance">) {
  if (!hasRole(user, allowed)) {
    const err = new Error("Forbidden");
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
}

function extract(path: string, regex: RegExp): string {
  const match = path.match(regex);
  if (!match?.[1]) throw new Error("Path param missing");
  return decodeURIComponent(match[1]);
}
