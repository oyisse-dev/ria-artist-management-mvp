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

  if (!isAdmin) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Team</h2>
        <p className="text-sm text-slate-500">Admin access required.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Team Management</h2>
        <p className="text-xs text-slate-500">Add users via Supabase Auth → invite them here.</p>
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
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {team.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No team members yet.</td></tr>
              )}
              {team.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{member.full_name}</td>
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
                      <span className="text-xs text-slate-400">You</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium mb-1">To invite a new team member:</p>
        <ol className="list-decimal ml-4 space-y-1 text-xs text-slate-500">
          <li>Go to Supabase Dashboard → Authentication → Users → Invite user</li>
          <li>They'll receive an email to set their password</li>
          <li>Once they log in, they'll appear here and you can assign their role</li>
        </ol>
      </div>
    </section>
  );
}

function roleColor(role: string): string {
  if (role === "admin") return "bg-purple-100 text-purple-700";
  if (role === "manager") return "bg-blue-100 text-blue-700";
  if (role === "finance") return "bg-green-100 text-green-700";
  return "bg-slate-100 text-slate-600";
}
