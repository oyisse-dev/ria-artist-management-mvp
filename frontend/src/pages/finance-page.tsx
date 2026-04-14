export function FinancePage() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Finance</h2>
      <div className="rounded-xl border bg-white p-6">
        <p className="text-sm text-slate-600">
          Finance endpoints are ready in the backend:
          <code className="ml-2 rounded bg-slate-100 px-2 py-1">POST /transactions</code>
          <code className="ml-2 rounded bg-slate-100 px-2 py-1">
            GET /artists/:id/transactions
          </code>
        </p>
      </div>
    </section>
  );
}
