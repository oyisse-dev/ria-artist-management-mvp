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
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: me } = await admin
      .from("users")
      .select("id, role, full_name, email")
      .eq("id", authData.user.id)
      .single();

    if (!me || !["admin", "manager"].includes(me.role)) {
      return new Response(JSON.stringify({ error: "Forbidden", role: me?.role ?? null }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const kind: DigestKind = body.kind === "assigned_digest" ? "assigned_digest" : "pending_approval";

    const { data: pending, error: pendingErr } = await admin
      .from("project_checklists")
      .select("id, project_id, item_name, assignee_role, assigned_to, archived_at, due_date")
      .is("archived_at", null)
      .limit(1000);

    if (pendingErr) throw pendingErr;

    const { data: submissions, error: subErr } = await admin
      .from("checklist_completions")
      .select("checklist_id, approval_status")
      .limit(2000);

    if (subErr) throw subErr;

    const statusMap = new Map<string, string>();
    for (const submission of submissions ?? []) {
      statusMap.set(String(submission.checklist_id), String(submission.approval_status));
    }

    const items = (pending ?? [])
      .filter((item: any) => {
        const status = statusMap.get(String(item.id)) ?? "pending";
        return kind === "pending_approval" ? status === "submitted" : status !== "approved";
      })
      .slice(0, 120)
      .map((item: any) => ({
        id: item.id,
        project_id: item.project_id,
        item_name: item.item_name,
        assignee_role: item.assignee_role ?? null,
        assigned_to: item.assigned_to ?? null,
        status: statusMap.get(String(item.id)) ?? "pending",
        due_date: item.due_date ?? null,
      }));

    return new Response(JSON.stringify({ ok: true, kind, count: items.length, items }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
