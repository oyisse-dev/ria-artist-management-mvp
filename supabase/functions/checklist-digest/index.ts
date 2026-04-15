// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DigestKind = "pending_approval" | "assigned_digest";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: me } = await admin
      .from("users")
      .select("id, role, full_name, email")
      .eq("id", authData.user.id)
      .single();

    if (!me || !["admin", "manager"].includes(me.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const kind: DigestKind = body.kind === "assigned_digest" ? "assigned_digest" : "pending_approval";

    const { data: pending } = await admin
      .from("v_project_checklists_compat")
      .select("id, project_id, item_name, assignee_role, assigned_to")
      .is("archived_at", null)
      .limit(300);

    const { data: submissions } = await admin
      .from("v_checklist_completions_compat")
      .select("checklist_id, approval_status")
      .limit(600);

    const statusMap = new Map<string, string>();
    for (const s of submissions ?? []) statusMap.set(String(s.checklist_id), String(s.approval_status));

    const payloadItems = (pending ?? []).filter((i: any) => {
      const st = statusMap.get(String(i.id)) ?? "pending";
      if (kind === "pending_approval") return st === "submitted";
      return st !== "approved";
    }).slice(0, 120);

    await admin.from("checklist_reminder_log").insert({
      user_id: me.id,
      kind,
      payload: {
        generated_by: me.full_name ?? me.email,
        count: payloadItems.length,
        sample: payloadItems.slice(0, 20),
      },
    });

    return new Response(JSON.stringify({ ok: true, kind, count: payloadItems.length }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
