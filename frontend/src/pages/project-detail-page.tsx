import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  fetchProject, fetchProjectChecklist, updateProject, fetchAuditLog,
  type Project, type ChecklistItem, type ProjectStatus,
  STATUS_LABELS, STATUS_COLORS, calcProgress,
} from "../lib/projects-api";
import { fetchUsers } from "../lib/api";
import { FileUpload } from "../components/file-upload";
import { ReleaseChecklist } from "../components/release-checklist";
import { useAuthStore } from "../context/auth-store";

type Tab = "checklist" | "assets" | "finance" | "team" | "audit";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const canWrite = user?.role === "admin" || user?.role === "manager";

  const [project, setProject] = useState<Project | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [transactions, setTransactions] = useState<Array<Record<string, unknown>>>([]);
  const [auditLog, setAuditLog] = useState<Array<Record<string, unknown>>>([]);
  const [teamMembers, setTeamMembers] = useState<Array<Record<string, unknown>>>([]);
  const [assignments, setAssignments] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [tab, setTab] = useState<Tab>("checklist");

  // Transaction modal
  const [showTxModal, setShowTxModal] = useState(false);
  const [txForm, setTxForm] = useState({
    type: "expense" as "income" | "expense",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    category: "",
    notes: "",
  });
  const [savingTx, setSavingTx] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const p = await fetchProject(id);
      setProject(p); // set early so partial downstream failures don't show "Project not found"

      const results = await Promise.allSettled([
        fetchProjectChecklist(id, { includeArchived: true }),
        supabase.from("transactions").select("*").eq("project_id", id).order("date", { ascending: false }),
        (user?.role === "admin" || user?.role === "manager") ? fetchAuditLog("projects", id) : Promise.resolve([]),
        fetchUsers(),
        supabase.from("artist_assignments").select("*, users(id, full_name, role)").eq("artist_id", p.artist_id),
      ]);

      const sectionErrors: string[] = [];

      const checklistRes = results[0];
      if (checklistRes.status === "fulfilled") setChecklist(checklistRes.value as ChecklistItem[]);
      else sectionErrors.push(`checklist (${checklistRes.reason?.message ?? "query failed"})`);

      const txRes = results[1];
      if (txRes.status === "fulfilled") setTransactions((txRes.value as any).data ?? []);
      else sectionErrors.push("finance");

      const auditRes = results[2];
      if (auditRes.status === "fulfilled") setAuditLog((auditRes.value as any) ?? []);
      else sectionErrors.push("audit");

      const usersRes = results[3];
      if (usersRes.status === "fulfilled") setTeamMembers((usersRes.value as any) ?? []);
      else sectionErrors.push("users");

      const assignRes = results[4];
      if (assignRes.status === "fulfilled") setAssignments((assignRes.value as any).data ?? []);
      else sectionErrors.push("assignments");

      if (sectionErrors.length) {
        setError(`Some sections failed: ${sectionErrors.join(", ")}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load project data";
      setError(msg);
      console.error("Project detail load error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id, refreshNonce]);

  const refreshChecklist = async () => {
    if (!id) return;
    // Hard refresh from server by bumping nonce, avoids stale nested-cache issues
    setRefreshNonce((n) => n + 1);
  };

  const handleTxCreate = async () => {
    if (!project || !txForm.amount) return;
    setSavingTx(true);
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      const amount = Number(txForm.amount);
      const { data: artist } = await supabase.from("artists").select("commission_rate").eq("id", project.artist_id).single();
      const commissionRate = Number(artist?.commission_rate ?? 20);
      const commissionAmount = txForm.type === "income" ? (amount * commissionRate) / 100 : 0;
      await supabase.from("transactions").insert({
        artist_id: project.artist_id,
        project_id: id,
        type: txForm.type,
        amount,
        date: txForm.date,
        category: txForm.category || null,
        notes: txForm.notes || null,
        description: txForm.notes || null,
        commission_amount: commissionAmount,
        artist_net_amount: txForm.type === "income" ? amount - commissionAmount : 0,
        created_by: u?.id,
      });
      setShowTxModal(false);
      setTxForm({
        type: "expense",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        category: "",
        notes: "",
      });
      const tx = await supabase.from("transactions").select("*").eq("project_id", id).order("date", { ascending: false });
      setTransactions(tx.data ?? []);
    } finally {
      setSavingTx(false);
    }
  };

  const getCompletion = (item: any) => {
    const c = item?.checklist_completions;
    if (!c) return undefined;
    return Array.isArray(c) ? c[0] : c;
  };

  const progress = calcProgress(checklist);
  const completedCount = checklist.filter((i: any) => getCompletion(i)?.approval_status === "approved").length;
  const pendingApproval = checklist.filter((i: any) => getCompletion(i)?.approval_status === "submitted").length;
  const rejectedChecklist = checklist.filter((i: any) => getCompletion(i)?.approval_status === "rejected").length;
  const todoChecklist = Math.max(0, checklist.length - completedCount - pendingApproval - rejectedChecklist);

  const milestoneDays = Array.from({ length: 28 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() + idx);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const iso = `${yyyy}-${mm}-${dd}`;

    const dueItems = checklist.filter((item: any) => {
      const offset = item?.due_offset_days;
      if (offset === undefined || offset === null || !project?.target_date) return false;
      const due = new Date(project.target_date);
      due.setDate(due.getDate() + Number(offset));
      const dueIso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
      return dueIso === iso;
    });

    return { iso, count: dueItems.length, items: dueItems };
  });

  const upcomingMilestones = milestoneDays.filter((d) => d.count > 0).slice(0, 5);
  const maxDue = Math.max(1, ...milestoneDays.map((d) => d.count));
  const totalStatus = Math.max(1, checklist.length);
  const approvedPct = Math.round((completedCount / totalStatus) * 100);
  const pendingPct = Math.round((pendingApproval / totalStatus) * 100);
  const rejectedPct = Math.round((rejectedChecklist / totalStatus) * 100);
  const donut = `conic-gradient(#16a34a 0 ${approvedPct}%, #f59e0b ${approvedPct}% ${approvedPct + pendingPct}%, #ef4444 ${approvedPct + pendingPct}% ${approvedPct + pendingPct + rejectedPct}%, #cbd5e1 ${approvedPct + pendingPct + rejectedPct}% 100%)`;

  const txSummary = transactions.reduce((acc: { income: number; expense: number }, tx: any) => {
    if (tx.type === "income") acc.income += Number(tx.amount);
    else acc.expense += Number(tx.amount);
    return acc;
  }, { income: 0, expense: 0 });

  const tabs: { key: Tab; label: string }[] = [
    { key: "checklist", label: `Checklist (${completedCount}/${checklist.length})` },
    { key: "assets", label: "Assets" },
    { key: "finance", label: `Finance (${transactions.length})` },
    { key: "team", label: `Team (${assignments.length})` },
    { key: "audit", label: "Audit" },
  ];

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading project…</div>;
  if (!project) return <div className="p-8 text-sm text-red-500">Project not found.</div>;

  return (
    <section className="space-y-5">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some project sections failed to load: {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate("/projects")} className="mb-2 text-xs text-slate-400 hover:text-slate-700">← Back to Projects</button>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{project.type === "release" ? "🎵" : project.type === "tour" ? "🎤" : "📣"}</span>
            <div>
              <h2 className="text-2xl font-bold">{project.title}</h2>
              <p className="text-sm text-slate-500">{project.artists?.stage_name} · {project.type}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[project.status]}`}>
            {STATUS_LABELS[project.status]}
          </span>
          {canWrite && (
            <select
              value={project.status}
              onChange={async (e) => {
                const updated = await updateProject(project.id, { status: e.target.value as ProjectStatus });
                setProject(updated);
              }}
              className="rounded-lg border px-2 py-1 text-xs focus:outline-none"
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="col-span-2 rounded-xl border bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Progress</p>
            <p className="text-sm font-bold">{progress}%</p>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-900 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{completedCount} of {checklist.length} items approved</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">Target Date</p>
          <p className="mt-1 font-semibold">{project.target_date ?? "—"}</p>
          {project.budget_estimate && (
            <p className="mt-1 text-xs text-slate-500">Budget: UGX {Number(project.budget_estimate).toLocaleString()}</p>
          )}
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">Pending Approval</p>
          <p className={`mt-1 text-2xl font-bold ${pendingApproval > 0 ? "text-amber-600" : "text-slate-400"}`}>{pendingApproval}</p>
          <p className="text-xs text-slate-500">items need review</p>
        </div>
      </div>

      {/* Milestone Analytics */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Checklist Status Mix</p>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-24 w-24 rounded-full" style={{ background: donut }}>
              <div className="absolute inset-3 rounded-full bg-white" />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-700">{progress}%</div>
            </div>
            <div className="space-y-1 text-xs">
              <p><span className="inline-block h-2 w-2 rounded-full bg-green-600" /> <span className="ml-1">Approved: {completedCount}</span></p>
              <p><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> <span className="ml-1">Pending: {pendingApproval}</span></p>
              <p><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> <span className="ml-1">Rejected: {rejectedChecklist}</span></p>
              <p><span className="inline-block h-2 w-2 rounded-full bg-slate-300" /> <span className="ml-1">To Do: {todoChecklist}</span></p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Milestone Timeline (next 28 days)</p>
            <p className="text-xs text-slate-400">Interactive bars · hover for tasks</p>
          </div>
          <div className="space-y-1.5">
            {milestoneDays.map((d) => {
              const width = `${Math.max(2, Math.round((d.count / maxDue) * 100))}%`;
              const label = d.items.map((i: any) => i.item_name).slice(0, 3).join(", ");
              return (
                <div key={d.iso} className="group">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="w-20 shrink-0">{d.iso.slice(5)}</span>
                    <div className="h-2 flex-1 rounded bg-slate-100">
                      <div title={`${d.iso} • ${d.count} due${label ? ` • ${label}` : ""}`} className={`h-2 rounded transition-all ${d.count > 0 ? "bg-slate-700 group-hover:bg-indigo-600" : "bg-slate-200"}`} style={{ width }} />
                    </div>
                    <span className="w-10 text-right">{d.count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 lg:col-span-3">
          <p className="mb-2 text-xs font-medium text-slate-600">Upcoming Milestones</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {upcomingMilestones.length === 0 && <p className="text-xs text-slate-400">No upcoming checklist due dates in next 28 days.</p>}
            {upcomingMilestones.map((m) => (
              <div key={m.iso} className="rounded-lg border p-2 text-xs">
                <p className="font-semibold text-slate-700">{m.iso}</p>
                <p className="text-slate-500">{m.count} due item{m.count > 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "checklist" && (
        <ReleaseChecklist
          checklist={checklist}
          projectId={project.id}
          artistId={project.artist_id}
          targetDate={project.target_date}
          teamMembers={assignments
            .map((a: any) => a.users)
            .filter(Boolean)
            .map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role }))}
          onRefresh={refreshChecklist}
        />
      )}

      {tab === "assets" && (
        <ProjectAssetsTab projectId={project.id} refreshKey={refreshNonce} />
      )}

      {tab === "finance" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-slate-500">Budget</p>
              <p className="mt-1 text-xl font-bold text-slate-700">UGX {Number(project.budget_estimate ?? 0).toLocaleString()}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-slate-500">Actual Spend</p>
              <p className="mt-1 text-xl font-bold text-red-600">UGX {txSummary.expense.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-slate-500">Budget Remaining</p>
              <p className={`mt-1 text-xl font-bold ${(Number(project.budget_estimate ?? 0) - txSummary.expense) >= 0 ? "text-green-600" : "text-red-600"}`}>
                UGX {(Number(project.budget_estimate ?? 0) - txSummary.expense).toLocaleString()}
              </p>
            </div>
          </div>
          {canWrite && (
            <div className="flex justify-end">
              <button onClick={() => setShowTxModal(true)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
                + Log Transaction
              </button>
            </div>
          )}
          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No transactions for this project yet.</td></tr>}
                {transactions.map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{tx.date}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${tx.type === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{tx.type}</span></td>
                    <td className="px-4 py-3 text-slate-600">{tx.category ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">UGX {Number(tx.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-500">{tx.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "team" && (
        <div className="space-y-3">
          {assignments.length === 0 && (
            <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-400">
              No team members assigned to this artist yet. Go to the artist profile to assign team members.
            </div>
          )}
          {assignments.map((a: any) => (
            <div key={a.user_id} className="flex items-center gap-3 rounded-xl border bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600">
                {a.users?.full_name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="font-medium">{a.users?.full_name}</p>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                  a.users?.role === "admin" ? "bg-purple-100 text-purple-700" :
                  a.users?.role === "manager" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                }`}>{a.users?.role}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "audit" && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">Action</th><th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {auditLog.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No audit history yet.</td></tr>}
              {auditLog.map((log: any) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{new Date(log.changed_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-700">{log.users?.full_name ?? "System"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      log.action === "INSERT" ? "bg-green-100 text-green-700" :
                      log.action === "UPDATE" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                    }`}>{log.action}</span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500">
                    {log.action === "UPDATE" && log.new_data
                      ? `Updated: ${Object.keys(log.new_data).filter(k => log.old_data?.[k] !== log.new_data?.[k] && k !== "updated_at").join(", ")}`
                      : log.action === "INSERT" ? `Created \"${log.new_data?.title ?? log.new_data?.item_name ?? "record"}\"` : "Deleted"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Transaction Modal */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Log Project Transaction</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                {(["income", "expense"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTxForm({ ...txForm, type: t })}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize ${
                      txForm.type === t
                        ? t === "income"
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-red-500 bg-red-50 text-red-700"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Amount (UGX) *</label>
                  <input type="number" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
                  <input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
                <input value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
                  placeholder="e.g. Studio, Marketing, Distribution"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                <input value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowTxModal(false)} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleTxCreate} disabled={savingTx || !txForm.amount}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                {savingTx ? "Saving…" : "Log"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ProjectAssetsTab({ projectId, refreshKey }: { projectId: string; refreshKey: number }) {
  const [assets, setAssets] = useState<Array<{ name: string; url: string; item: string }>>([]);

  const loadAssets = async () => {
    const { data, error } = await supabase
      .from("project_checklists")
      .select("item_name, checklist_completions(file_names, file_urls, approval_status)")
      .eq("project_id", projectId);

    if (error) {
      console.error("Load assets error:", error.message);
      setAssets([]);
      return;
    }

    const mapped: Array<{ name: string; url: string; item: string }> = [];
    for (const row of (data ?? []) as any[]) {
      const c = row?.checklist_completions;
      const completion = Array.isArray(c) ? c[0] : c;
      if (completion?.approval_status !== "approved") continue;
      const names = completion?.file_names ?? [];
      const urls = completion?.file_urls ?? [];
      for (let i = 0; i < names.length; i++) {
        if (urls[i]) {
          mapped.push({ name: names[i], url: urls[i], item: row.item_name });
        }
      }
    }
    setAssets(mapped);
  };

  useEffect(() => { loadAssets(); }, [projectId, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5">
        <h3 className="mb-3 font-semibold">Approved Assets</h3>
        <p className="text-sm text-slate-500">Only files from approved checklist items appear here.</p>
      </div>
      <div>
        <h3 className="mb-3 font-semibold text-slate-700">All Approved Project Assets</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset, i) => (
            <a key={i} href={asset.url} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-3 rounded-xl border bg-white p-3 transition hover:bg-slate-50">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xl">
                {asset.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? "🖼️" :
                  asset.name.match(/\.(mp3|wav|flac|aac)$/i) ? "🎵" :
                    asset.name.match(/\.(mp4|mov|avi)$/i) ? "🎬" :
                      asset.name.match(/\.pdf$/i) ? "📄" : "📎"}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{asset.name}</p>
                <p className="truncate text-xs text-slate-400">{asset.item}</p>
              </div>
            </a>
          ))}
          {assets.length === 0 && (
            <div className="col-span-3 rounded-xl border border-dashed p-8 text-center text-sm text-slate-400">
              No assets uploaded yet. Submit checklist items with files to see them here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
