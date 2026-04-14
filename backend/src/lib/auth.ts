import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from "./config.js";
import type { AuthUser, Role } from "./types.js";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

export async function getAuthUser(authHeader: string | undefined): Promise<AuthUser> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  const token = authHeader.slice(7);

  // Verify the JWT and get the user
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  // Get user's role from public.users table
  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as Role) ?? "manager";

  return {
    id: user.id,
    email: user.email,
    name: profile?.full_name ?? user.email,
    role,
    roles: [role]
  };
}

export function hasRole(user: AuthUser, allowed: Role[]): boolean {
  return allowed.some((role) => user.roles.includes(role));
}
