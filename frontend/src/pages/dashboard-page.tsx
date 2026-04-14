import { useEffect, useState } from "react";
import { fetchDashboard } from "../lib/api";

export function DashboardPage() {
  const [data, setData] = useState<null | {
    pendingTasks: number;
    totalIncome: number;
    totalExpense: number;
    net: number;
  }>(null);

  useEffect(() => {
    fetchDashboard()
      .then((result) => {
        setData({
          pendingTasks: result.pendingTasks,
          totalIncome: result.totalIncome,
          totalExpense: result.totalExpense,
          net: result.net
        });
      })
      .catch(() => setData(null));
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Dashboard</h2>
      {!data && <p className="text-sm text-slate-500">Connect Cognito + API env vars to load live data.</p>}
      {data && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card label="Pending Tasks" value={String(data.pendingTasks)} />
          <Card label="Income" value={formatCurrency(data.totalIncome)} />
          <Card label="Expense" value={formatCurrency(data.totalExpense)} />
          <Card label="Net" value={formatCurrency(data.net)} />
        </div>
      )}
    </section>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0
  }).format(amount);
}
