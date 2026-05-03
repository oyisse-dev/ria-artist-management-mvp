import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { archiveChecklistItem, createTransaction, getProject, listAuditLogs, listProjectAssets, listProjectChecklist, listTransactions, saveChecklistCompletion, signedAssetUrl, updateProject, uploadProjectAsset } from "../lib/api";
import type { ChecklistWithCompletion, ProjectWithArtist, TransactionWithJoins } from "../lib/api";
import type { AuditLog } from "../lib/database.types";
import { Button, EmptyState, ErrorState, Field, formatCurrency, Input, LoadingState, PageHeader, Panel, Select, StatusPill, Textarea } from "../components/ui";

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const [project, setProject] = useState<ProjectWithArtist | null>(null);
  const [checklist, setChecklist] = useState<ChecklistWithCompletion[]>([]);
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
      const [checklistRows, txRows, auditRows, assetRows] = await Promise.all([
        listProjectChecklist(id),
        listTransactions(id),
        listAuditLogs(id),
        listProjectAssets(projectRow)
      ]);
      setProject(projectRow);
      setChecklist(checklistRows);
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
            <p className="mt-2 text-sm text-slate-600">{project.progress ?? 0}% complete</p>
          </div>
          <StatusForm project={project} reload={load} />
        </div>
      </Panel>
      <div className="mb-5 flex flex-wrap gap-2">
        {["checklist", "assets", "marketing", "finance", "team", "audit"].map((item) => (
          <button key={item} className={`rounded-md px-3 py-2 text-sm capitalize ${tab === item ? "bg-slate-950 text-white" : "bg-white"}`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "checklist" && <ChecklistTab checklist={checklist} project={project} reload={load} />}
      {tab === "assets" && <AssetsTab project={project} assets={assets} reload={load} />}
      {tab === "marketing" && <ChecklistTab checklist={checklist.filter((item) => (item.group_name ?? "").toLowerCase().includes("marketing"))} project={project} reload={load} />}
      {tab === "finance" && <FinanceTab project={project} finance={finance} transactions={transactions} reload={load} />}
      {tab === "team" && <TeamTab checklist={checklist} />}
      {tab === "audit" && <AuditTab audit={audit} />}
    </section>
  );
}

function StatusForm({ project, reload }: { project: ProjectWithArtist; reload: () => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await updateProject(project.id, { status: String(form.get("status")), target_date: String(form.get("target_date") || "") || null, budget_estimate: Number(form.get("budget_estimate") || 0) });
    await reload();
  }
  return (
    <form onSubmit={submit} className="grid gap-2">
      <Select name="status" defaultValue={project.status}>{["planning","pre_production","recording","mix_master","asset_collection","qc","distribution","live","completed"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select>
      <Input name="target_date" type="date" defaultValue={project.target_date ?? ""} />
      <Input name="budget_estimate" type="number" defaultValue={project.budget_estimate ?? 0} />
      <Button>Update Project</Button>
    </form>
  );
}

function ChecklistTab({ checklist, project, reload }: { checklist: ChecklistWithCompletion[]; project: ProjectWithArtist; reload: () => Promise<void> }) {
  const groups = checklist.reduce<Record<string, ChecklistWithCompletion[]>>((acc, item) => {
    const key = item.group_name ?? "General";
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});
  return (
    <div className="grid gap-4">
      {Object.entries(groups).map(([group, items]) => (
        <Panel key={group}>
          <h3 className="font-semibold">{group}</h3>
          <div className="mt-3 grid gap-3">
            {items.map((item) => <ChecklistRow key={item.id} item={item} project={project} reload={reload} />)}
          </div>
        </Panel>
      ))}
      {checklist.length === 0 && <EmptyState>No checklist items.</EmptyState>}
    </div>
  );
}

function ChecklistRow({ item, project, reload }: { item: ChecklistWithCompletion; project: ProjectWithArtist; reload: () => Promise<void> }) {
  const status = item.completion?.approval_status ?? "pending";
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const path = await uploadProjectAsset(project, file, "checklist");
    await saveChecklistCompletion(item.id, { file_urls: [...(item.completion?.file_urls ?? []), path], file_names: [...(item.completion?.file_names ?? []), file.name], approval_status: "submitted", completed_at: new Date().toISOString() });
    await reload();
  }
  async function setStatus(next: string) {
    await saveChecklistCompletion(item.id, { approval_status: next, approved_at: next === "approved" ? new Date().toISOString() : null, rejection_comment: next === "rejected" ? "Needs revision" : null });
    await reload();
  }
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-medium">{item.item_name} {item.required && <span className="text-red-600">*</span>}</p>
          <p className="text-sm text-slate-500">{item.assignee_role ?? "Unassigned role"} · Due {item.due_date ?? item.due_offset_days ?? "not set"}</p>
          {item.depends_on && <p className="text-xs text-amber-700">Depends on another checklist item.</p>}
          {item.completion?.file_names?.length ? <p className="mt-1 text-xs text-slate-500">Files: {item.completion.file_names.join(", ")}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill>{status}</StatusPill>
          <Input type="file" onChange={upload} className="max-w-52" />
          <Button variant="secondary" onClick={() => setStatus("submitted")}>Submit</Button>
          <Button variant="secondary" onClick={() => setStatus("approved")}>Approve</Button>
          <Button variant="secondary" onClick={() => setStatus("rejected")}>Reject</Button>
          <Button variant="danger" onClick={async () => { await archiveChecklistItem(item.id); await reload(); }}>Archive</Button>
        </div>
      </div>
    </div>
  );
}

function AssetsTab({ project, assets, reload }: { project: ProjectWithArtist; assets: Array<{ name: string; created_at?: string }>; reload: () => Promise<void> }) {
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    await Promise.all(files.map((file) => uploadProjectAsset(project, file)));
    await reload();
  }
  return (
    <Panel>
      <Field label="Bulk Upload"><Input type="file" multiple onChange={upload} /></Field>
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createTransaction({ artist_id: project.artist_id, project_id: project.id, type: String(form.get("type")), amount: Number(form.get("amount")), category: String(form.get("category")), date: String(form.get("date")), description: String(form.get("description")) });
    await reload();
    event.currentTarget.reset();
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
        <div className="md:col-span-5"><Button>Add Transaction</Button></div>
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
