import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  fetchProject, fetchProjectChecklist, updateProject, updateChecklistItem,
  submitChecklistCompletion, approveChecklistItem, fetchAuditLog,
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
  const [tab, setTab] = useState<Tab>("checklist");

  // Checklist interaction
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [submitForm, setSubmitForm] = useState<{ notes: string }>({ notes: "" });
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; name: string }[]>([]);

  // Transaction modal
  const [showTxModal, setShowTxModal] = useState(false);
  const [txForm, setTxForm] = useState({ type: "expense" as "income" | "expense", amount: "", date: new Date().toISOString().slice(0, 10), category: "", notes: "" });
  const [savingTx, setSavingTx] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const p = await fetchProject(id);
      const [cl, tx, al, u, assign] = await Promise.all([
        fetchProjectChecklist(id),
        supabase.from("transactions").select("*").eq("project_id", id).order("date", { ascending: false }),
        fetchAuditLog("projects", id),
        fetchUsers(),
        supabase.from("artist_assignments").select("*, users(id, full_name, role)").eq("artist_id", p.artist_id),
      ]);
      setProject(p);
      setChecklist(cl);
      setTransactions(tx.data ?? []);
      setAuditLog(al);
      setTeamMembers(u);
      setAssignments(assign.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const refreshChecklist = async () => {
    if (!id) return;
    const cl = await fetchProjectChecklist(id);
    setChecklist(cl);
  };

  const handleSubmit = async (item: ChecklistItem) => {
    const completion = item.checklist_completions?.[0];
    setSubmittingId(item.id);
    await submitChecklistCompletion(item.id, {
      notes: submitForm.notes,
      fileUrls: uploadedFiles.map((f) => f.url),
      fileNames: uploadedFiles.map((f) => f.name),
    });
    setSubmittingId(null);
    setExpandedItem(null);
    setSubmitForm({ notes: "" });
    setUploadedFiles([]);
    await refreshChecklist();
  };

  const handleApprove = async (item: ChecklistItem, approved: boolean) => {
    const completion = item.checklist_completions?.[0];
    if (!completion) return;
    if (!approved && !rejectReason) { setRejectingId(item.id); return; }
    await approveChecklistItem(completion.id, approved, rejectReason);
    setRejectingId(null);
    setRejectReason("");
    await refreshChecklist();
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
        type: txForm.type, amount, date: txForm.date,
        category: txForm.category || null,
        notes: txForm.notes || null,
        description: txForm.notes || null,
        commission_amount: commissionAmount,
        artist_net_amount: txForm.type === "income" ? amount - commissionAmount : 0,
        created_by: u?.id,
      });
      setShowTxModal(false);
      setTxForm({ type: "expense", amount: "", date: new Date().toISOString().slice(0, 10), category: "", notes: "" });
      const tx = await supabase.from("transactions").select("*").eq("project_id", id).order("date", { ascending: false });
      setTransactions(tx.data ?? []);
    } finally {
      setSavingTx(false);
    }
  };

  const progress = calcProgress(checklist);
  const completedCount = checklist.filter((i) => i.checklist_completions?.[0]?.approval_status === "approved").length;
  const pendingApproval = checklist.filter((i) => i.checklist_completions?.[0]?.approval_status === "submitted").length;

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
            <select value={project.status} onChange={async (e) => {
              const updated = await updateProject(project.id, { status: e.target.value as ProjectStatus });
              setProject(updated);
            }} className="rounded-lg border px-2 py-1 text-xs focus:outline-none">
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Progress bar + stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="col-span-2 rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
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
          {project.budget_estimate && <p className="mt-1 text-xs text-slate-500">Budget: UGX {Number(project.budget_estimate).toLocaleString()}</p>}
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">Pending Approval</p>
          <p className={`mt-1 text-2xl font-bold ${pendingApproval > 0 ? "text-amber-600" : "text-slate-400"}`}>{pendingApproval}</p>
          <p className="text-xs text-slate-500">items need review</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>{t.label}</button>
        ))}
      </div>

      {/* CHECKLIST TAB */}
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



      {/* ASSETS TAB */}
      {tab === "assets" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-5">
            <h3 className="mb-3 font-semibold">Upload Asset</h3>
            <FileUpload artistId={project.artist_id} onUploaded={(url, name) => {
              // Show uploaded asset
              setUploadedFiles((f) => [...f, { url, name }]);
            }} />
          </div>
          {/* Show all files from checklist completions */}
          <div>
            <h3 className="mb-3 font-semibold text-slate-700">All Project Assets</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {checklist.flatMap((item) =>
                (item.checklist_completions?.[0]?.file_names ?? []).map((name, i) => ({
                  name,
                  url: item.checklist_completions![0].file_urls[i],
                  item: item.item_name,
                }))
              ).map((asset, i) => (
                <a key={i} href={asset.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-xl border bg-white p-3 hover:bg-slate-50 transition">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xl">
                    {asset.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? "🖼️" :
                     asset.name.match(/\.(mp3|wav|flac|aac)$/i) ? "🎵" :
                     asset.name.match(/\.(mp4|mov|avi)$/i) ? "🎬" :
                     asset.name.match(/\.pdf$/i) ? "📄" : "📎"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{asset.name}</p>
                    <p className="text-xs text-slate-400 truncate">{asset.item}</p>
                  </div>
                </a>
              ))}
              {checklist.every((i) => !i.checklist_completions?.[0]?.file_names?.length) && (
                <div className="col-span-3 rounded-xl border border-dashed p-8 text-center text-sm text-slate-400">
                  No assets uploaded yet. Submit checklist items with files to see them here.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FINANCE TAB */}
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
              <button onClick={() => setShowTxModal(true)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
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
                    <td className="px-4 py-3 text-slate-500 truncate max-w-xs">{tx.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TEAM TAB */}
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

      {/* AUDIT TAB */}
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
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(log.changed_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-700">{log.users?.full_name ?? "System"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      log.action === "INSERT" ? "bg-green-100 text-green-700" :
                      log.action === "UPDATE" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                    }`}>{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                    {log.action === "UPDATE" && log.new_data
                      ? `Updated: ${Object.keys(log.new_data).filter(k => log.old_data?.[k] !== log.new_data?.[k] && k !== "updated_at").join(", ")}`
                      : log.action === "INSERT" ? `Created "${log.new_data?.title ?? log.new_data?.item_name ?? "record"}"` : "Deleted"}
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
                  <button key={t} onClick={() => setTxForm({ ...txForm, type: t })}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize ${txForm.type === t ? (t === "income" ? "border-green-500 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700") : "text-slate-500 hover:bg-slate-50"}`}>
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
