import type { APIGatewayProxyEvent } from "aws-lambda";
import type { AuthUser, Role } from "./types.js";

function normalizeRole(group: string): Role | null {
  if (group === "Admin" || group === "Manager" || group === "Finance") return group;
  return null;
}

export function getAuthUser(event: APIGatewayProxyEvent): AuthUser {
  const claims = (event.requestContext.authorizer?.claims as Record<string, string> | undefined) ?? {};
  const sub = claims.sub ?? "unknown-user";
  const groupsRaw = claims["cognito:groups"] ?? "";
  const roles = groupsRaw
    .split(",")
    .map((x) => normalizeRole(x.trim()))
    .filter((x): x is Role => Boolean(x));

  return {
    id: sub,
    email: claims.email,
    name: claims.name,
    roles
  };
}

export function hasRole(user: AuthUser, allowed: Role[]): boolean {
  return allowed.some((role) => user.roles.includes(role));
}
