import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { archiveChecklistItem, createTransaction, getErrorMessage, getProject, listAuditLogs, listProjectAssets, listProjectChecklist, listTransactions, listUsers, saveChecklistCompletion, signedAssetUrl, updateChecklistItem, updateProject, uploadProjectAsset } from "../lib/api";
import type { ChecklistWithCompletion, ProjectWithArtist, TransactionWithJoins } from "../lib/api";
import type { AuditLog, ChecklistCompletion, UserProfile } from "../lib/database.types";
import { Button, EmptyState, ErrorState, Field, formatCurrency, Input, LoadingState, PageHeader, Panel, Select, StatusPill, Textarea } from "../components/ui";
import { useAuthStore } from "../context/auth-store";

export function ProjectDetailPage() {
  const { profile, role } = useAuthStore();
  const { id = "" } = useParams();
  const [project, setProject] = useState<ProjectWithArtist | null>(null);
  const [checklist, setChecklist] = useState<ChecklistWithCompletion[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithJoins[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [assets, setAssets] = useState<Array<{ name: string; id?: string; created_at?: string; metadata?: Record<string, unknown> }>>([]);
  const [tab, setTab] = useState("checklist");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const projectRow = await getProject(id);
      const [checklistRows, userRows, txRows, auditRows, assetRows] = await Promise.all([
        listProjectChecklist(id),
        listUsers(),
        listTransactions(id),
        listAuditLogs(id),
        listProjectAssets(projectRow)
      ]);
      setProject(projectRow);
      setChecklist(checklistRows);
      setUsers(userRows);
      setTransactions(txRows);
      setAudit(auditRows);
      setAssets(assetRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  const finance = useMemo(() => {
    const income = transactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
    const expense = transactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
    return { income, expense, net: income - expense };
  }, [transactions]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!project) return <EmptyState>Project not found.</EmptyState>;

  const canManageProject = role === "admin" || role === "manager";
  const canUseChecklist = role === "admin" || role === "manager";
  const checklistStats = getChecklistStats(checklist);
  const blockedCompletionItems = checklist.filter((item) => item.required && item.completion?.approval_status !== "approved");
  const canCompleteProject = blockedCompletionItems.length === 0;
  const tabCounts: Record<string, number | undefined> = {
    checklist: checklist.length,
    assets: assets.length,
    finance: transactions.length,
    team: checklist.filter((item) => item.assignee || item.assignee_role).length,
    audit: audit.length
  };

  return (
    <section>
      <PageHeader title={project.title} eyebrow={`${project.artist?.stage_name ?? "Artist"} · ${project.type}`} />
      <Panel className="mb-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill>{project.status.replaceAll("_", " ")}</StatusPill>
              <span className="text-sm text-slate-500">Target {project.target_date ?? "not set"}</span>
              <span className="text-sm text-slate-500">Budget {formatCurrency(project.budget_estimate)}</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-teal-600" style={{ width: `${project.progress ?? 0}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span>{project.progress ?? 0}% complete</span>
              <span>{checklistStats.approved}/{checklistStats.total} checklist items approved</span>
              <span>{checklistStats.blocked} blocked</span>
              <span>{checklistStats.overdue} overdue</span>
            </div>
            {!canCompleteProject && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Completion is blocked until {blockedCompletionItems.length} required checklist item{blockedCompletionItems.length === 1 ? "" : "s"} are approved.
              </p>
            )}
          </div>
          {canManageProject ? <StatusForm project={project} reload={load} canComplete={canCompleteProject} /> : <p className="text-sm text-slate-500">Finance has read-only project access.</p>}
        </div>
      </Panel>
      <div className="mb-5 flex flex-wrap gap-2">
        {["checklist", "assets", "marketing", "finance", "team", "audit"].map((item) => (
          <button key={item} className={`rounded-md px-3 py-2 text-sm capitalize ${tab === item ? "bg-slate-950 text-white" : "bg-white"}`} onClick={() => setTab(item)}>
            {item}{tabCounts[item] !== undefined ? ` (${tabCounts[item]})` : ""}
          </button>
        ))}
      </div>
      {tab === "checklist" && <ChecklistTab checklist={checklist} allChecklist={checklist} project={project} users={users} currentUserId={profile?.id ?? ""} reload={load} canEdit={canUseChecklist} />}
      {tab === "assets" && <AssetsTab project={project} assets={assets} reload={load} canUpload={canUseChecklist} />}
      {tab === "marketing" && <ChecklistTab checklist={checklist.filter((item) => (item.group_name ?? "").toLowerCase().includes("marketing"))} allChecklist={checklist} project={project} users={users} currentUserId={profile?.id ?? ""} reload={load} canEdit={canUseChecklist} />}
      {tab === "finance" && <FinanceTab project={project} finance={finance} transactions={transactions} reload={load} />}
      {tab === "team" && <TeamTab checklist={checklist} />}
      {tab === "audit" && <AuditTab audit={audit} />}
    </section>
  );
}

function StatusForm({ project, reload, canComplete }: { project: ProjectWithArtist; reload: () => Promise<void>; canComplete: boolean }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const status = String(form.get("status"));
      if (status === "completed" && !canComplete) {
        setError("Required checklist items must be approved before completion.");
        setSaving(false);
        return;
      }
      await updateProject(project.id, { status, target_date: String(form.get("target_date") || "") || null, budget_estimate: Number(form.get("budget_estimate") || 0) });
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, "Could not update project"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-2">
      <Select name="status" defaultValue={project.status}>{["planning","pre_production","recording","mix_master","asset_collection","qc","distribution","live","completed"].map((item) => <option key={item} value={item} disabled={item === "completed" && !canComplete}>{item.replaceAll("_", " ")}</option>)}</Select>
      <Input name="target_date" type="date" defaultValue={project.target_date ?? ""} />
      <Input name="budget_estimate" type="number" defaultValue={project.budget_estimate ?? 0} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button disabled={saving}>{saving ? "Saving..." : "Update Project"}</Button>
    </form>
  );
}

function ChecklistTab({ checklist, allChecklist, project, users, currentUserId, reload, canEdit }: { checklist: ChecklistWithCompletion[]; allChecklist: ChecklistWithCompletion[]; project: ProjectWithArtist; users: UserProfile[]; currentUserId: string; reload: () => Promise<void>; canEdit: boolean }) {
  const groups = checklist.reduce<Record<string, ChecklistWithCompletion[]>>((acc, item) => {
    const key = item.group_name ?? "General";
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});
  const checklistById = new Map(allChecklist.map((item) => [item.id, item]));
  return (
    <div className="grid gap-4">
      {Object.entries(groups).map(([group, items]) => (
        <Panel key={group}>
          <h3 className="font-semibold">{group}</h3>
          <div className="mt-3 grid gap-3">
            {items.map((item) => <ChecklistRow key={item.id} item={item} dependency={item.depends_on ? checklistById.get(item.depends_on) ?? null : null} project={project} users={users} currentUserId={currentUserId} reload={reload} canEdit={canEdit} />)}
          </div>
        </Panel>
      ))}
      {checklist.length === 0 && <EmptyState>No checklist items.</EmptyState>}
    </div>
  );
}

function ChecklistRow({ item, dependency, project, users, currentUserId, reload, canEdit }: { item: ChecklistWithCompletion; dependency: ChecklistWithCompletion | null; project: ProjectWithArtist; users: UserProfile[]; currentUserId: string; reload: () => Promise<void>; canEdit: boolean }) {
  const status = item.completion?.approval_status ?? "pending";
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectionComment, setRejectionComment] = useState(item.completion?.rejection_comment ?? "");
  const [savingAssignee, setSavingAssignee] = useState(false);
  const isApproved = status === "approved";
  const isSubmitted = status === "submitted";
  const isRejected = status === "rejected";
  const dependencyApproved = !dependency || dependency.completion?.approval_status === "approved";
  const isBlocked = !dependencyApproved;
  const dueState = getDueState(item.due_date);
  const submitLabel = isRejected ? "Resubmit" : "Submit";

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || isBlocked || isApproved) return;
    setError("");
    try {
      const path = await uploadProjectAsset(project, file, "checklist");
      await saveChecklistCompletion(item.id, { file_urls: [...(item.completion?.file_urls ?? []), path], file_names: [...(item.completion?.file_names ?? []), file.name], approval_status: "submitted", completed_at: new Date().toISOString() });
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, "Could not upload checklist file"));
    }
  }
  async function setStatus(next: ChecklistCompletion["approval_status"], comment?: string) {
    if ((next === "submitted" || next === "approved") && isBlocked) {
      setError(`Blocked until "${dependency?.item_name ?? "the dependency"}" is approved.`);
      return;
    }
    setError("");
    try {
      await saveChecklistCompletion(item.id, {
        approval_status: next,
        approver_id: next === "approved" || next === "rejected" ? currentUserId || null : item.completion?.approver_id ?? null,
        approved_at: next === "approved" ? new Date().toISOString() : null,
        completed_at: next === "submitted" ? new Date().toISOString() : item.completion?.completed_at ?? null,
        rejection_comment: next === "rejected" ? comment || "Needs revision" : null
      });
      setRejecting(false);
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, "Could not update checklist item"));
    }
  }
  async function saveAssignment(event: React.ChangeEvent<HTMLSelectElement>) {
    setSavingAssignee(true);
    setError("");
    try {
      await updateChecklistItem(item.id, { assigned_to: event.target.value || null });
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, "Could not update assignee"));
    } finally {
      setSavingAssignee(false);
    }
  }
  return (
    <div className={`rounded-md border p-3 ${isBlocked ? "border-amber-200 bg-amber-50/50" : dueState === "overdue" && !isApproved ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <p className="font-medium">{item.item_name} {item.required && <span className="text-red-600">*</span>}</p>
          <p className="text-sm text-slate-500">{item.assignee?.full_name ?? item.assignee_role ?? "Unassigned"} · Due {formatDueLabel(item.due_date, item.due_offset_days)}</p>
          {dueState !== "none" && !isApproved && <p className={`text-xs ${dueState === "overdue" ? "text-red-700" : "text-amber-700"}`}>{dueState === "overdue" ? "Overdue" : "Due soon"}</p>}
          {isBlocked && <p className="text-xs text-amber-700">Blocked until "{dependency?.item_name ?? "dependency"}" is approved.</p>}
          {item.completion?.file_names?.length ? <p className="mt-1 text-xs text-slate-500">Files: {item.completion.file_names.join(", ")}</p> : null}
          {item.completion?.rejection_comment && <p className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-700">Rejected: {item.completion.rejection_comment}</p>}
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          {canEdit && (
            <div className="mt-3 grid max-w-xl gap-2 sm:grid-cols-[1fr_auto]">
              <Select value={item.assigned_to ?? ""} onChange={saveAssignment} disabled={savingAssignee || isApproved}>
                <option value="">Unassigned</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.full_name ?? user.email ?? "Unnamed user"}</option>)}
              </Select>
              <span className="self-center text-xs text-slate-500">{savingAssignee ? "Saving assignee..." : "Assignee"}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <StatusPill>{status}</StatusPill>
          {canEdit && (
            <>
              {!isApproved && <Input type="file" onChange={upload} className="max-w-52" disabled={isBlocked} />}
              {(status === "pending" || isRejected) && <Button variant="secondary" disabled={isBlocked} onClick={() => setStatus("submitted")}>{submitLabel}</Button>}
              {isSubmitted && <Button variant="secondary" disabled={isBlocked} onClick={() => setStatus("approved")}>Approve</Button>}
              {isSubmitted && <Button variant="secondary" onClick={() => setRejecting((open) => !open)}>Reject</Button>}
              {!isApproved && <Button variant="danger" onClick={async () => { await archiveChecklistItem(item.id); await reload(); }}>Archive</Button>}
            </>
          )}
        </div>
      </div>
      {rejecting && (
        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3">
          <Field label="Rejection Comment"><Textarea value={rejectionComment} onChange={(event) => setRejectionComment(event.target.value)} /></Field>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => setStatus("rejected", rejectionComment)}>Save Rejection</Button>
            <Button variant="secondary" onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssetsTab({ project, assets, reload, canUpload }: { project: ProjectWithArtist; assets: Array<{ name: string; created_at?: string }>; reload: () => Promise<void>; canUpload: boolean }) {
  const [error, setError] = useState("");
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setError("");
    try {
      await Promise.all(files.map((file) => uploadProjectAsset(project, file)));
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, "Could not upload project assets"));
    }
  }
  return (
    <Panel>
      {canUpload ? <Field label="Bulk Upload"><Input type="file" multiple onChange={upload} /></Field> : <p className="text-sm text-slate-500">Finance can view assets but cannot upload new files.</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 grid gap-2">
        {assets.map((asset) => <AssetLink key={asset.name} project={project} name={asset.name} />)}
        {assets.length === 0 && <EmptyState>No project assets uploaded.</EmptyState>}
      </div>
    </Panel>
  );
}

function AssetLink({ project, name }: { project: ProjectWithArtist; name: string }) {
  const [url, setUrl] = useState("");
  const path = `${project.artist_id}/${project.id}/assets/${name}`;
  return <div className="flex justify-between rounded-md border p-3 text-sm"><span>{name}</span>{url ? <a className="text-teal-700" href={url} target="_blank" rel="noreferrer">Open</a> : <button className="text-teal-700" onClick={async () => setUrl(await signedAssetUrl(path))}>Get Link</button>}</div>;
}

function FinanceTab({ project, finance, transactions, reload }: { project: ProjectWithArtist; finance: { income: number; expense: number; net: number }; transactions: TransactionWithJoins[]; reload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await createTransaction({ artist_id: project.artist_id, project_id: project.id, type: String(form.get("type")), amount: Number(form.get("amount")), category: String(form.get("category")), date: String(form.get("date")), description: String(form.get("description")) });
      await reload();
      event.currentTarget.reset();
    } catch (err) {
      setError(getErrorMessage(err, "Could not add transaction"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Panel>
      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <strong>Income {formatCurrency(finance.income)}</strong>
        <strong>Expense {formatCurrency(finance.expense)}</strong>
        <strong>Net {formatCurrency(finance.net)}</strong>
        <strong>Budget {formatCurrency(project.budget_estimate)}</strong>
      </div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-5">
        <Field label="Type"><Select name="type"><option value="income">Income</option><option value="expense">Expense</option></Select></Field>
        <Field label="Category"><Input name="category" /></Field>
        <Field label="Amount"><Input name="amount" type="number" required /></Field>
        <Field label="Date"><Input name="date" type="date" required /></Field>
        <Field label="Description"><Input name="description" /></Field>
        {error && <p className="text-sm text-red-700 md:col-span-5">{error}</p>}
        <div className="md:col-span-5"><Button disabled={saving}>{saving ? "Saving..." : "Add Transaction"}</Button></div>
      </form>
      <div className="mt-4 grid gap-2">{transactions.map((tx) => <div key={tx.id} className="rounded-md border p-3 text-sm">{tx.date} · {tx.type} · {tx.category} · {formatCurrency(tx.amount)}</div>)}</div>
    </Panel>
  );
}

function TeamTab({ checklist }: { checklist: ChecklistWithCompletion[] }) {
  const team = checklist.filter((item) => item.assignee || item.assignee_role);
  return <Panel><div className="grid gap-2">{team.map((item) => <div key={item.id} className="rounded-md border p-3 text-sm">{item.assignee?.full_name ?? item.assignee_role ?? "Unassigned"} · {item.item_name}</div>)}{team.length === 0 && <EmptyState>No team assignments yet.</EmptyState>}</div></Panel>;
}

function AuditTab({ audit }: { audit: AuditLog[] }) {
  return <Panel><div className="grid gap-2">{audit.map((row) => <div key={row.id} className="rounded-md border p-3 text-sm">{row.changed_at} · {row.action} · {row.table_name}</div>)}{audit.length === 0 && <EmptyState>No audit entries for this record.</EmptyState>}</div></Panel>;
}

function getChecklistStats(checklist: ChecklistWithCompletion[]) {
  const checklistById = new Map(checklist.map((item) => [item.id, item]));
  return checklist.reduce(
    (stats, item) => {
      const status = item.completion?.approval_status ?? "pending";
      const dependency = item.depends_on ? checklistById.get(item.depends_on) : null;
      const blocked = dependency ? dependency.completion?.approval_status !== "approved" : false;
      const dueState = getDueState(item.due_date);
      return {
        total: stats.total + 1,
        approved: stats.approved + (status === "approved" ? 1 : 0),
        submitted: stats.submitted + (status === "submitted" ? 1 : 0),
        blocked: stats.blocked + (blocked ? 1 : 0),
        overdue: stats.overdue + (dueState === "overdue" && status !== "approved" ? 1 : 0)
      };
    },
    { total: 0, approved: 0, submitted: 0, blocked: 0, overdue: 0 }
  );
}

function getDueState(date: string | null) {
  if (!date) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "due-soon";
  return "none";
}

function formatDueLabel(date: string | null, offset: number | null) {
  if (date) return date;
  if (typeof offset === "number") return `${offset} day${offset === 1 ? "" : "s"} from project start`;
  return "not set";
}
