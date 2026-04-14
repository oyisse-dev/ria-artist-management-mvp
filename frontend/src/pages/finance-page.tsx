import { useEffect, useState } from "react";
import { fetchArtists, fetchArtistTransactions, createTransaction } from "../lib/api";
import { useAuthStore } from "../context/auth-store";

type Transaction = {
  transactionId: string;
  artistId: string;
  type: "income" | "expense";
  amount: number;
  date: string;
  category?: string;
  notes?: string;
  commissionAmount: number;
  artistNetAmount: number;
};

const CATEGORIES_INCOME = ["Performance Fee", "Royalties", "Sponsorship", "Merchandise", "Other"];
const CATEGORIES_EXPENSE = ["Studio", "Marketing", "Travel", "Equipment", "Management Fee", "Other"];

const EMPTY_FORM = {
  artistId: "", type: "income" as "income" | "expense",
  amount: "", date: new Date().toISOString().slice(0, 10),
  category: "", notes: "",
};

export function FinancePage() {
  const { user } = useAuthStore();
  const canWrite = user?.role === "admin" || user?.role === "finance" || user?.role === "manager";

  const [artists, setArtists] = useState<Array<Record<string, unknown>>>([]);
  const [selectedArtist, setSelectedArtist] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchArtists().then(setArtists);
  }, []);

  useEffect(() => {
    if (!selectedArtist) return;
    setLoading(true);
    fetchArtistTransactions(selectedArtist)
      .then((data) => setTransactions(data as Transaction[]))
      .finally(() => setLoading(false));
  }, [selectedArtist]);

  const handleCreate = async () => {
    if (!form.artistId || !form.amount) return;
    setSaving(true);
    try {
      await createTransaction({
        artistId: form.artistId,
        type: form.type,
        amount: Number(form.amount),
        date: form.date,
        category: form.category || undefined,
        notes: form.notes || undefined,
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
      if (selectedArtist === form.artistId) {
        fetchArtistTransactions(selectedArtist).then((d) => setTransactions(d as Transaction[]));
      }
    } finally {
      setSaving(false);
    }
  };

  const summary = transactions.reduce(
    (acc, tx) => {
      if (tx.type === "income") {
        acc.income += tx.amount;
        acc.commission += tx.commissionAmount;
        acc.artistNet += tx.artistNetAmount;
      } else {
        acc.expense += tx.amount;
      }
      return acc;
    },
    { income: 0, expense: 0, commission: 0, artistNet: 0 }
  );

  const categories = form.type === "income" ? CATEGORIES_INCOME : CATEGORIES_EXPENSE;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Finance</h2>
        {canWrite && (
          <button onClick={() => setShowModal(true)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            + Log Transaction
          </button>
        )}
      </div>

      {/* Artist selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-600">View artist:</label>
        <select value={selectedArtist} onChange={(e) => setSelectedArtist(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">Select an artist…</option>
          {artists.map((a) => (
            <option key={String(a.artistId)} value={String(a.artistId)}>{String(a.stageName)}</option>
          ))}
        </select>
      </div>

      {selectedArtist && !loading && transactions.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total Income" value={formatUGX(summary.income)} color="green" />
          <SummaryCard label="Total Expense" value={formatUGX(summary.expense)} color="red" />
          <SummaryCard label="Commission Earned" value={formatUGX(summary.commission)} color="blue" />
          <SummaryCard label="Artist Net" value={formatUGX(summary.artistNet)} color="slate" />
        </div>
      )}

      {selectedArtist ? (
        loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Commission</th>
                  <th className="px-4 py-3">Artist Net</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No transactions yet.</td></tr>
                )}
                {transactions.map((tx) => (
                  <tr key={tx.transactionId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{tx.date}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        tx.type === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>{tx.type}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{tx.category ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{formatUGX(tx.amount)}</td>
                    <td className="px-4 py-3 text-blue-700">
                      {tx.type === "income" ? formatUGX(tx.commissionAmount) : "—"}
                    </td>
                    <td className="px-4 py-3 text-green-700">
                      {tx.type === "income" ? formatUGX(tx.artistNetAmount) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{tx.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-400">
          Select an artist to view their financial history.
        </div>
      )}

      {/* Log Transaction Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Log Transaction</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Artist *</label>
                <select value={form.artistId} onChange={(e) => setForm({ ...form, artistId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">Select artist…</option>
                  {artists.map((a) => (
                    <option key={String(a.artistId)} value={String(a.artistId)}>{String(a.stageName)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Type *</label>
                <div className="flex gap-2">
                  {(["income", "expense"] as const).map((t) => (
                    <button key={t} onClick={() => setForm({ ...form, type: t, category: "" })}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition ${
                        form.type === t
                          ? t === "income" ? "border-green-500 bg-green-50 text-green-700"
                            : "border-red-500 bg-red-50 text-red-700"
                          : "text-slate-500 hover:bg-slate-50"
                      }`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Amount (UGX) *</label>
                  <input type="number" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    placeholder="0" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Date *</label>
                  <input type="date" value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">Select…</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Optional description" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)}
                className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.artistId || !form.amount}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                {saving ? "Saving…" : "Log Transaction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: "text-green-700 bg-green-50",
    red: "text-red-600 bg-red-50",
    blue: "text-blue-700 bg-blue-50",
    slate: "text-slate-700 bg-slate-50",
  };
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 rounded-lg px-2 py-1 text-lg font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

function formatUGX(amount: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency", currency: "UGX", maximumFractionDigits: 0,
  }).format(amount);
}
