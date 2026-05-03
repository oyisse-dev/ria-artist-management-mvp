import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, Field, formatCurrency, Input, LoadingState, PageHeader, Panel, Select } from "../components/ui";
import { createTransaction, listArtists, listProjects, listTransactions } from "../lib/api";
import type { ProjectWithArtist, TransactionWithJoins } from "../lib/api";
import type { Artist } from "../lib/database.types";

export function FinancePage() {
  const [transactions, setTransactions] = useState<TransactionWithJoins[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [projects, setProjects] = useState<ProjectWithArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [txRows, artistRows, projectRows] = await Promise.all([listTransactions(), listArtists(), listProjects()]);
      setTransactions(txRows);
      setArtists(artistRows);
      setProjects(projectRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finance failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);
  const totals = useMemo(() => {
    const income = transactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
    const expense = transactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
    const payout = transactions.reduce((sum, tx) => sum + Number(tx.artist_net_amount ?? 0), 0);
    return { income, expense, net: income - expense, payout };
  }, [transactions]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  return (
    <section>
      <PageHeader title="Finance" eyebrow="Income, expenses, payouts" />
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel><p className="text-sm text-slate-500">Income</p><strong>{formatCurrency(totals.income)}</strong></Panel>
        <Panel><p className="text-sm text-slate-500">Expense</p><strong>{formatCurrency(totals.expense)}</strong></Panel>
        <Panel><p className="text-sm text-slate-500">Net</p><strong>{formatCurrency(totals.net)}</strong></Panel>
        <Panel><p className="text-sm text-slate-500">Artist Payout</p><strong>{formatCurrency(totals.payout)}</strong></Panel>
      </div>
      <Panel className="mb-5"><FinanceForm artists={artists} projects={projects} reload={load} /></Panel>
      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left"><tr><th className="px-4 py-3">Date</th><th>Artist</th><th>Project</th><th>Type</th><th>Category</th><th>Amount</th><th>Payout</th></tr></thead>
          <tbody>{transactions.map((tx) => <tr key={tx.id} className="border-t"><td className="px-4 py-3">{tx.date}</td><td>{tx.artist?.stage_name}</td><td>{tx.project?.title ?? "-"}</td><td>{tx.type}</td><td>{tx.category}</td><td>{formatCurrency(tx.amount)}</td><td>{formatCurrency(tx.artist_net_amount)}</td></tr>)}</tbody>
        </table>
        {transactions.length === 0 && <div className="p-4"><EmptyState>No transactions found.</EmptyState></div>}
      </div>
    </section>
  );
}

function FinanceForm({ artists, projects, reload }: { artists: Artist[]; projects: ProjectWithArtist[]; reload: () => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createTransaction({ artist_id: String(form.get("artist_id")), project_id: String(form.get("project_id") || "") || null, type: String(form.get("type")), category: String(form.get("category")), amount: Number(form.get("amount")), date: String(form.get("date")), description: String(form.get("description")) });
    event.currentTarget.reset();
    await reload();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-6">
      <Field label="Artist"><Select name="artist_id" required>{artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name}</option>)}</Select></Field>
      <Field label="Project"><Select name="project_id"><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</Select></Field>
      <Field label="Type"><Select name="type"><option value="income">Income</option><option value="expense">Expense</option></Select></Field>
      <Field label="Category"><Input name="category" /></Field>
      <Field label="Amount"><Input name="amount" type="number" required /></Field>
      <Field label="Date"><Input name="date" type="date" required /></Field>
      <div className="md:col-span-5"><Input name="description" placeholder="Description" className="w-full" /></div>
      <Button>Add Transaction</Button>
    </form>
  );
}
