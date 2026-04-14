import { useEffect, useState } from "react";
import { useAuthStore } from "../context/auth-store";
import { supabase } from "../lib/supabase";

type TeamUser = {
  id: string;
  full_name: string;
  role: string;
  email?: string;
  created_at: string;
};

export function TeamPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const [team, setTeam] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", fullName: "", role: "manager" });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ success?: string; error?: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("users").select("*").order("full_name");
    setTeam((data ?? []) as TeamUser[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRoleChange = async (id: string, newRole: string) => {
    setUpdatingId(id);
    await supabase.from("users").update({ role: newRole }).eq("id", id);
    await load();
    setUpdatingId(null);
  };

  const handleInvite = async () => {
    if (!inviteForm.email) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: inviteForm.email,
            fullName: inviteForm.fullName || inviteForm.email,
            role: inviteForm.role,
          }),
        }
      );
      const data = await res.json();
      if (data.error) {
        setInviteResult({ error: data.error });
      } else {
        setInviteResult({ success: `Invite sent to ${inviteForm.email}!` });
        setInviteForm({ email: "", fullName: "", role: "manager" });
        await load();
      }
    } catch {
      setInviteResult({ error: "Failed to send invite. Try again." });
    } finally {
      setInviting(false);
    }
  };

  if (!isAdmin) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Team</h2>
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {team.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{member.full_name}</td>
                  <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${roleColor(member.role)}`}>{member.role}</span></td>
                  <td className="px-4 py-3 text-slate-500">{new Date(member.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Team Management</h2>
        <button onClick={() => { setShowInvite(true); setInviteResult(null); }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          + Invite Member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {(["admin", "manager", "finance"] as const).map((role) => (
          <div key={role} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-slate-500 capitalize">{role}s</p>
            <p className={`mt-1 text-2xl font-bold ${roleColor(role).split(" ")[0].replace("bg-", "text-").replace("100", "700")}`}>
              {team.filter((m) => m.role === role).length}
            </p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {team.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No team members yet.</td></tr>
              )}
              {team.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                        {member.full_name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="font-medium">{member.full_name}</span>
                      {member.id === user?.id && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">You</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{member.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${roleColor(member.role)}`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {member.id !== user?.id ? (
                      <select
                        value={member.role}
                        disabled={updatingId === member.id}
                        onChange={(e) => handleRoleChange(member.id, e.target.value)}
                        className="rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50">
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="finance">Finance</option>
                      </select>
                    ) : (
                      <span className="text-xs text-slate-400">Cannot change own role</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold">Invite Team Member</h3>
            <p className="mb-4 text-sm text-slate-500">They'll receive an email to set up their account.</p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Email *</label>
                <input type="email" value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="colleague@example.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Full Name</label>
                <input type="text" value={inviteForm.fullName}
                  onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                  placeholder="John Doe"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["manager", "finance", "admin"] as const).map((r) => (
                    <button key={r} onClick={() => setInviteForm({ ...inviteForm, role: r })}
                      className={`rounded-lg border py-2 text-sm font-medium capitalize transition ${
                        inviteForm.role === r ? `${roleColor(r)} border-transparent` : "text-slate-500 hover:bg-slate-50"
                      }`}>{r}</button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  {inviteForm.role === "admin" && "Full access — can manage team, delete records"}
                  {inviteForm.role === "manager" && "Can manage artists, tasks, and log transactions"}
                  {inviteForm.role === "finance" && "Read-only access + can log transactions"}
                </p>
              </div>

              {inviteResult?.success && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {inviteResult.success}
                </div>
              )}
              {inviteResult?.error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{inviteResult.error}</div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setShowInvite(false); setInviteResult(null); }}
                className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                {inviteResult?.success ? "Close" : "Cancel"}
              </button>
              {!inviteResult?.success && (
                <button onClick={handleInvite} disabled={inviting || !inviteForm.email}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                  {inviting ? "Sending…" : "Send Invite"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function roleColor(role: string): string {
  if (role === "admin") return "bg-purple-100 text-purple-700";
  if (role === "manager") return "bg-blue-100 text-blue-700";
  if (role === "finance") return "bg-green-100 text-green-700";
  return "bg-slate-100 text-slate-600";
}
