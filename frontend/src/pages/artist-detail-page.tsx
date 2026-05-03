import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Field, formatCurrency, Input, LoadingState, PageHeader, Panel, Textarea } from "../components/ui";
import { createContract, createTransaction, getArtist, listContracts, listProjects, listTasks, listTransactions, signedAssetUrl, updateArtist, uploadPrivateFile } from "../lib/api";
import type { Artist, Contract } from "../lib/database.types";
import type { ProjectWithArtist, TaskWithJoins, TransactionWithJoins } from "../lib/api";

export function ArtistDetailPage() {
  const { id = "" } = useParams();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [projects, setProjects] = useState<ProjectWithArtist[]>([]);
  const [tasks, setTasks] = useState<TaskWithJoins[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithJoins[]>([]);
  const [tab, setTab] = useState("details");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [artistRow, contractRows, projectRows, taskRows, txRows] = await Promise.all([
        getArtist(id),
        listContracts(id),
        listProjects({ artistId: id }),
        listTasks(),
        listTransactions(undefined, id)
      ]);
      setArtist(artistRow);
      setContracts(contractRows);
      setProjects(projectRows);
      setTasks(taskRows.filter((task) => task.artist_id === id));
      setTransactions(txRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Artist failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!artist) return <EmptyState>Artist not found.</EmptyState>;

  const income = transactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
  const expense = transactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);

  return (
    <section>
      <PageHeader title={artist.stage_name ?? "Artist"} eyebrow="Artist Profile" />
      <div className="mb-5 flex flex-wrap gap-2">
        {["details", "contracts", "projects", "tasks", "finance"].map((item) => (
          <button key={item} className={`rounded-md px-3 py-2 text-sm capitalize ${tab === item ? "bg-slate-950 text-white" : "bg-white text-slate-700"}`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>

      {tab === "details" && <Details artist={artist} onSaved={setArtist} />}
      {tab === "contracts" && <Contracts artist={artist} contracts={contracts} reload={load} />}
      {tab === "projects" && <Panel><div className="grid gap-3">{projects.map((project) => <Link key={project.id} className="rounded-md border p-3 hover:bg-slate-50" to={`/projects/${project.id}`}>{project.title} · {project.status}</Link>)}{projects.length === 0 && <EmptyState>No projects for this artist.</EmptyState>}</div></Panel>}
      {tab === "tasks" && <Panel><div className="grid gap-3">{tasks.map((task) => <div key={task.id} className="rounded-md border p-3">{task.title} · {task.completed ? "Complete" : "Open"}</div>)}{tasks.length === 0 && <EmptyState>No artist tasks.</EmptyState>}</div></Panel>}
      {tab === "finance" && (
        <Panel>
          <div className="mb-4 grid gap-4 md:grid-cols-3">
            <strong>Income: {formatCurrency(income)}</strong>
            <strong>Expense: {formatCurrency(expense)}</strong>
            <strong>Net: {formatCurrency(income - expense)}</strong>
          </div>
          <TransactionQuickForm artist={artist} reload={load} />
          <div className="mt-4 grid gap-2">
            {transactions.map((tx) => <div key={tx.id} className="rounded-md border p-3 text-sm">{tx.date} · {tx.type} · {tx.category} · {formatCurrency(tx.amount)}</div>)}
          </div>
        </Panel>
      )}
    </section>
  );
}

function Details({ artist, onSaved }: { artist: Artist; onSaved: (artist: Artist) => void }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const saved = await updateArtist(artist.id, {
      stage_name: String(form.get("stage_name") || ""),
      legal_name: String(form.get("legal_name") || ""),
      contact_email: String(form.get("contact_email") || ""),
      phone: String(form.get("phone") || ""),
      bio: String(form.get("bio") || ""),
      commission_rate: Number(form.get("commission_rate") || 20),
      contract_start: String(form.get("contract_start") || "") || null,
      contract_end: String(form.get("contract_end") || "") || null
    });
    onSaved(saved);
    setSaving(false);
  }
  return (
    <Panel>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field label="Stage Name"><Input name="stage_name" defaultValue={artist.stage_name ?? ""} /></Field>
        <Field label="Legal Name"><Input name="legal_name" defaultValue={artist.legal_name ?? ""} /></Field>
        <Field label="Email"><Input name="contact_email" defaultValue={artist.contact_email ?? ""} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={artist.phone ?? ""} /></Field>
        <Field label="Commission %"><Input name="commission_rate" type="number" defaultValue={artist.commission_rate ?? 20} /></Field>
        <Field label="Contract Start"><Input name="contract_start" type="date" defaultValue={artist.contract_start ?? ""} /></Field>
        <Field label="Contract End"><Input name="contract_end" type="date" defaultValue={artist.contract_end ?? ""} /></Field>
        <Field label="Bio"><Textarea name="bio" defaultValue={artist.bio ?? ""} /></Field>
        <div className="md:col-span-2"><Button disabled={saving}>{saving ? "Saving..." : "Save Details"}</Button></div>
      </form>
    </Panel>
  );
}

function Contracts({ artist, contracts, reload }: { artist: Artist; contracts: Contract[]; reload: () => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.name) return;
    const path = await uploadPrivateFile("contracts", artist.id, file, "contracts");
    await createContract({ artist_id: artist.id, title: String(form.get("title") || file.name), file_url: path, signed_date: String(form.get("signed_date") || "") || null, expiry_date: String(form.get("expiry_date") || "") || null });
    await reload();
    event.currentTarget.reset();
  }
  return (
    <Panel>
      <form onSubmit={submit} className="mb-5 grid gap-3 md:grid-cols-4">
        <Field label="Title"><Input name="title" /></Field>
        <Field label="Signed"><Input name="signed_date" type="date" /></Field>
        <Field label="Expiry"><Input name="expiry_date" type="date" /></Field>
        <Field label="File"><Input name="file" type="file" accept="application/pdf,image/*" required /></Field>
        <div className="md:col-span-4"><Button>Upload Contract</Button></div>
      </form>
      <div className="grid gap-2">
        {contracts.map((contract) => <ContractLink key={contract.id} contract={contract} />)}
        {contracts.length === 0 && <EmptyState>No contracts uploaded.</EmptyState>}
      </div>
    </Panel>
  );
}

function ContractLink({ contract }: { contract: Contract }) {
  const [url, setUrl] = useState("");
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span>{contract.title}</span>
      <button className="text-sm text-teal-700" onClick={async () => setUrl(await signedAssetUrl(contract.file_url ?? "", "contracts"))}>Get Link</button>
      {url && <a className="text-sm text-teal-700" href={url} target="_blank" rel="noreferrer">Open</a>}
    </div>
  );
}

function TransactionQuickForm({ artist, reload }: { artist: Artist; reload: () => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createTransaction({ artist_id: artist.id, type: String(form.get("type")), category: String(form.get("category")), amount: Number(form.get("amount")), date: String(form.get("date")), description: String(form.get("description")) });
    await reload();
    event.currentTarget.reset();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-5">
      <Field label="Type"><select name="type" className="min-h-10 rounded-md border px-3"><option value="income">Income</option><option value="expense">Expense</option></select></Field>
      <Field label="Category"><Input name="category" /></Field>
      <Field label="Amount"><Input name="amount" type="number" required /></Field>
      <Field label="Date"><Input name="date" type="date" required /></Field>
      <Field label="Description"><Input name="description" /></Field>
      <div className="md:col-span-5"><Button>Add Transaction</Button></div>
    </form>
  );
}
