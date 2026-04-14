import { useEffect, useState } from "react";
import { fetchDashboard } from "../lib/api";

type DashData = {
  pendingTasks: number;
  totalArtists: number;
  totalIncome: number;
  totalExpense: number;
  net: number;
  recentTransactions: Array<Record<string, unknown>>;
};

export function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch(() => setError("Could not load dashboard. Check your API URL config."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading dashboard…</p>;
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!data) return null;

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">Dashboard</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Artists" value={String(data.totalArtists)} color="blue" />
        <StatCard label="Pending Tasks" value={String(data.pendingTasks)} color="amber" />
        <StatCard label="Total Income" value={formatUGX(data.totalIncome)} color="green" />
        <StatCard label="Net" value={formatUGX(data.net)} color={data.net >= 0 ? "green" : "red"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Income vs Expenses</h3>
          <div className="flex gap-8">
            <div>
              <p className="text-xs text-slate-500">Income</p>
              <p className="text-xl font-semibold text-green-600">{formatUGX(data.totalIncome)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Expenses</p>
              <p className="text-xl font-semibold text-red-500">{formatUGX(data.totalExpense)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Recent Transactions</h3>
          {data.recentTransactions.length === 0 ? (
            <p className="text-sm text-slate-400">No transactions yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recentTransactions.slice(0, 5).map((tx, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div>
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${
                      tx.type === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {String(tx.type)}
                    </span>
                    <span className="text-slate-600">{String(tx.category ?? "—")}</span>
                  </div>
                  <span className="font-medium">{formatUGX(Number(tx.amount))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 inline-block rounded-lg px-2 py-1 text-2xl font-bold ${colors[color]}`}>
        {value}
      </p>
    </div>
  );
}

function formatUGX(amount: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency", currency: "UGX", maximumFractionDigits: 0,
  }).format(amount);
}
