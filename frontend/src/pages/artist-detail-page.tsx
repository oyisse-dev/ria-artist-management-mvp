import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchArtistTasks, createTask, updateTask, fetchUsers } from "../lib/api";
import { useAuthStore } from "../context/auth-store";
import { FileUpload } from "../components/file-upload";

type Artist = {
  id: string;
  stage_name: string;
  legal_name?: string;
  contact_email?: string;
  phone?: string;
  bio?: string;
  commission_rate: number;
  contract_start?: string;
  contract_end?: string;
};

type Task = {
  taskId: string; artistId: string; title: string; description?: string;
  dueDate?: string; completed: boolean; assignedTo?: string;
};

type Transaction = {
  id: string; type: string; amount: number; date: string;
  category?: string; notes?: string; commission_amount: number; artist_net_amount: number;
};

type Contract = {
  id: string; title: string; file_url?: string;
  signed_date?: string; expiry_date?: string; created_at: string;
};

type Tab = "overview" | "tasks" | "finance" | "contracts";

export function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canWrite = user?.role === "admin" || user?.role === "manager";

  const [artist, setArtist] = useState<Artist | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);

  // Task modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "", assignedTo: "" });
  const [savingTask, setSavingTask] = useState(false);

  // Transaction modal
  const [showTxModal, setShowTxModal] = useState(false);
  const [txForm, setTxForm] = useState({
    type: "income" as "income" | "expense", amount: "",
    date: new Date().toISOString().slice(0, 10), category: "", notes: "",
  });
  const [savingTx, setSavingTx] = useState(false);

  // Contract modal
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractForm, setContractForm] = useState({ title: "", fileUrl: "", signedDate: "", expiryDate: "" });
  const [savingContract, setSavingContract] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from("artists").select("*").eq("id", id).single(),
      fetchArtistTasks(id),
      supabase.from("transactions").select("*").eq("artist_id", id).order("date", { ascending: false }),
      supabase.from("contracts").select("*").eq("artist_id", id).order("created_at", { ascending: false }),
      fetchUsers(),
    ]).then(([{ data: a }, t, { data: tx }, { data: c }, u]) => {
      setArtist(a);
      setTasks(t as Task[]);
      setTransactions((tx ?? []) as Transaction[]);
      setContracts((c ?? []) as Contract[]);
      setUsers(u);
    }).finally(() => setLoading(false));
  }, [id]);

  const refreshTasks = () => fetchArtistTasks(id!).then((t) => setTasks(t as Task[]));
  const refreshTx = () => supabase.from("transactions").select("*").eq("artist_id", id).order("date", { ascending: false }).then(({ data }) => setTransactions((data ?? []) as Transaction[]));
  const refreshContracts = () => supabase.from("contracts").select("*").eq("artist_id", id).order("created_at", { ascending: false }).then(({ data }) => setContracts((data ?? []) as Contract[]));

  const handleCreateTask = async () => {
    if (!taskForm.title) return;
    setSavingTask(true);
    const { data: { user: u } } = await supabase.auth.getUser();
    await createTask({ artistId: id, title: taskForm.title, description: taskForm.description, dueDate: taskForm.dueDate, assignedTo: taskForm.assignedTo });
    setShowTaskModal(false);
    setTaskForm({ title: "", description: "", dueDate: "", assignedTo: "" });
    await refreshTasks();
    setSavingTask(false);
  };

  const handleToggleTask = async (task: Task) => {
    await updateTask(task.taskId, { completed: !task.completed });
    await refreshTasks();
  };

  const handleCreateTx = async () => {
    if (!txForm.amount) return;
    setSavingTx(true);
    const { data: { user: u } } = await supabase.auth.getUser();
    const amount = Number(txForm.amount);
    const commissionAmount = txForm.type === "income" ? (amount * (artist?.commission_rate ?? 20)) / 100 : 0;
    await supabase.from("transactions").insert({
      artist_id: id, type: txForm.type, amount, date: txForm.date,
      category: txForm.category || null, notes: txForm.notes || null,
      commission_amount: commissionAmount, artist_net_amount: txForm.type === "income" ? amount - commissionAmount : 0,
      created_by: u?.id,
    });
    setShowTxModal(false);
    setTxForm({ type: "income", amount: "", date: new Date().toISOString().slice(0, 10), category: "", notes: "" });
    await refreshTx();
    setSavingTx(false);
  };

  const handleCreateContract = async () => {
    if (!contractForm.title) return;
    setSavingContract(true);
    await supabase.from("contracts").insert({
      artist_id: id, title: contractForm.title,
      file_url: contractForm.fileUrl || null,
      signed_date: contractForm.signedDate || null,
      expiry_date: contractForm.expiryDate || null,
    });
    setShowContractModal(false);
    setContractForm({ title: "", fileUrl: "", signedDate: "", expiryDate: "" });
    await refreshContracts();
    setSavingContract(false);
  };

  const handleDeleteContract = async (contractId: string) => {
    if (!confirm("Delete this contract?")) return;
    await supabase.from("contracts").delete().eq("id", contractId);
    await refreshContracts();
  };

  const txSummary = transactions.reduce(
    (acc, tx) => {
      if (tx.type === "income") { acc.income += tx.amount; acc.commission += tx.commission_amount; acc.net += tx.artist_net_amount; }
      else acc.expense += tx.amount;
      return acc;
    }, { income: 0, expense: 0, commission: 0, net: 0 }
  );

  const userName = (uid?: string) => {
    if (!uid) return "Unassigned";
    const u = users.find((u) => u.id === uid);
    return String(u?.full_name ?? uid);
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading artist…</div>;
  if (!artist) return <div className="p-8 text-sm text-red-500">Artist not found.</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "tasks", label: `Tasks (${tasks.length})` },
    { key: "finance", label: `Finance (${transactions.length})` },
    { key: "contracts", label: `Contracts (${contracts.length})` },
  ];

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate("/artists")}
            className="mb-2 text-xs text-slate-400 hover:text-slate-700">← Back to Artists</button>
          <h2 className="text-2xl font-bold">{artist.stage_name}</h2>
          {artist.legal_name && <p className="text-sm text-slate-500">Legal: {artist.legal_name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
            {artist.commission_rate}% commission
          </span>
          {artist.contract_end && (
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${
              isExpiringSoon(artist.contract_end) ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
            }`}>Contract ends {artist.contract_end}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-5 space-y-3">
            <h3 className="font-semibold text-slate-800">Contact Info</h3>
            <Row label="Email" value={artist.contact_email} />
            <Row label="Phone" value={artist.phone} />
            <Row label="Contract Start" value={artist.contract_start} />
            <Row label="Contract End" value={artist.contract_end} />
          </div>
          {artist.bio && (
            <div className="rounded-xl border bg-white p-5">
              <h3 className="font-semibold text-slate-800 mb-2">Bio</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{artist.bio}</p>
            </div>
          )}
          <div className="rounded-xl border bg-white p-5 space-y-3">
            <h3 className="font-semibold text-slate-800">Financial Summary</h3>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Total Income" value={fmt(txSummary.income)} color="green" />
              <MiniStat label="Commission" value={fmt(txSummary.commission)} color="blue" />
              <MiniStat label="Artist Net" value={fmt(txSummary.net)} color="slate" />
              <MiniStat label="Expenses" value={fmt(txSummary.expense)} color="red" />
            </div>
          </div>
          <div className="rounded-xl border bg-white p-5">
            <h3 className="font-semibold text-slate-800 mb-2">Task Summary</h3>
            <div className="flex gap-6 text-sm">
              <div><p className="text-slate-500">Open</p><p className="text-2xl font-bold text-amber-600">{tasks.filter(t => !t.completed).length}</p></div>
              <div><p className="text-slate-500">Done</p><p className="text-2xl font-bold text-green-600">{tasks.filter(t => t.completed).length}</p></div>
              <div><p className="text-slate-500">Total</p><p className="text-2xl font-bold text-slate-700">{tasks.length}</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Tasks */}
      {tab === "tasks" && (
        <div className="space-y-3">
          {canWrite && (
            <div className="flex justify-end">
              <button onClick={() => setShowTaskModal(true)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
                + New Task
              </button>
            </div>
          )}
          {tasks.length === 0 && <EmptyState text="No tasks for this artist yet." />}
          {tasks.map((task) => (
            <div key={task.taskId} className={`flex items-start gap-3 rounded-xl border bg-white p-4 ${task.completed ? "opacity-60" : ""}`}>
              <button onClick={() => handleToggleTask(task)}
                className={`mt-0.5 h-5 w-5 flex-shrink-0 rounded-full border-2 transition ${task.completed ? "border-green-500 bg-green-500" : "border-slate-300 hover:border-slate-600"}`}>
                {task.completed && <svg className="h-full w-full p-0.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </button>
              <div className="flex-1">
                <p className={`font-medium ${task.completed ? "line-through text-slate-400" : ""}`}>{task.title}</p>
                {task.description && <p className="text-sm text-slate-500 mt-0.5">{task.description}</p>}
                <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-500">
                  {task.assignedTo && <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">→ {userName(task.assignedTo)}</span>}
                  {task.dueDate && <span className={`rounded px-2 py-0.5 ${!task.completed && new Date(task.dueDate) < new Date() ? "bg-red-100 text-red-600 font-medium" : "bg-slate-100"}`}>Due: {task.dueDate}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Finance */}
      {tab === "finance" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Income" value={fmt(txSummary.income)} color="green" />
            <MiniStat label="Expenses" value={fmt(txSummary.expense)} color="red" />
            <MiniStat label="Commission" value={fmt(txSummary.commission)} color="blue" />
            <MiniStat label="Artist Net" value={fmt(txSummary.net)} color="slate" />
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
                  <th className="px-4 py-3">Category</th><th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Commission</th><th className="px-4 py-3">Artist Net</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No transactions yet.</td></tr>}
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{tx.date}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${tx.type === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{tx.type}</span></td>
                    <td className="px-4 py-3 text-slate-600">{tx.category ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{fmt(tx.amount)}</td>
                    <td className="px-4 py-3 text-blue-700">{tx.type === "income" ? fmt(tx.commission_amount) : "—"}</td>
                    <td className="px-4 py-3 text-green-700">{tx.type === "income" ? fmt(tx.artist_net_amount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contracts */}
      {tab === "contracts" && (
        <div className="space-y-3">
          {canWrite && (
            <div className="flex justify-end">
              <button onClick={() => setShowContractModal(true)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
                + Add Contract
              </button>
            </div>
          )}
          {contracts.length === 0 && <EmptyState text="No contracts yet." />}
          {contracts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">{c.title}</p>
                  <div className="mt-1 flex gap-3 text-xs text-slate-500">
                    {c.signed_date && <span>✍️ Signed: {c.signed_date}</span>}
                    {c.expiry_date && (
                      <span className={isExpiringSoon(c.expiry_date) ? "text-amber-600 font-medium" : ""}>
                        {isExpiringSoon(c.expiry_date) ? "⚠️" : "📅"} Expires: {c.expiry_date}
                      </span>
                    )}
                    <span>Added: {new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {c.file_url && (
                  <a href={c.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download
                  </a>
                )}
                {user?.role === "admin" && (
                  <button onClick={() => handleDeleteContract(c.id)}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <Modal title="New Task" onClose={() => setShowTaskModal(false)}
          onSave={handleCreateTask} saving={savingTask} disabled={!taskForm.title} saveLabel="Create Task">
          <Field label="Title *" value={taskForm.title} onChange={(v) => setTaskForm({ ...taskForm, title: v })} />
          <Field label="Description" value={taskForm.description} onChange={(v) => setTaskForm({ ...taskForm, description: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due Date" type="date" value={taskForm.dueDate} onChange={(v) => setTaskForm({ ...taskForm, dueDate: v })} />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Assign To</label>
              <select value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value="">Unassigned</option>
                {users.map((u) => <option key={String(u.id)} value={String(u.id)}>{String(u.full_name)}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Transaction Modal */}
      {showTxModal && (
        <Modal title="Log Transaction" onClose={() => setShowTxModal(false)}
          onSave={handleCreateTx} saving={savingTx} disabled={!txForm.amount} saveLabel="Log">
          <div className="flex gap-2">
            {(["income", "expense"] as const).map((t) => (
              <button key={t} onClick={() => setTxForm({ ...txForm, type: t })}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize ${txForm.type === t ? (t === "income" ? "border-green-500 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700") : "text-slate-500 hover:bg-slate-50"}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (UGX) *" type="number" value={txForm.amount} onChange={(v) => setTxForm({ ...txForm, amount: v })} />
            <Field label="Date" type="date" value={txForm.date} onChange={(v) => setTxForm({ ...txForm, date: v })} />
          </div>
          <Field label="Category" value={txForm.category} onChange={(v) => setTxForm({ ...txForm, category: v })} />
          <Field label="Notes" value={txForm.notes} onChange={(v) => setTxForm({ ...txForm, notes: v })} />
        </Modal>
      )}

      {/* Contract Modal */}
      {showContractModal && (
        <Modal title="Add Contract" onClose={() => setShowContractModal(false)}
          onSave={handleCreateContract} saving={savingContract} disabled={!contractForm.title} saveLabel="Add Contract">
          <Field label="Title *" value={contractForm.title} onChange={(v) => setContractForm({ ...contractForm, title: v })} />
          <FileUpload
            artistId={id!}
            onUploaded={(url, fileName) => {
              setContractForm((f) => ({
                ...f,
                fileUrl: url,
                title: f.title || fileName.replace(/\.[^.]+$/, ""),
              }));
            }}
          />
          {contractForm.fileUrl && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              File uploaded successfully
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Signed Date" type="date" value={contractForm.signedDate} onChange={(v) => setContractForm({ ...contractForm, signedDate: v })} />
            <Field label="Expiry Date" type="date" value={contractForm.expiryDate} onChange={(v) => setContractForm({ ...contractForm, expiryDate: v })} />
          </div>
        </Modal>
      )}
    </section>
  );
}

// ---- Shared UI components ----

function Modal({ title, children, onClose, onSave, saving, disabled, saveLabel }: {
  title: string; children: React.ReactNode; onClose: () => void;
  onSave: () => void; saving: boolean; disabled: boolean; saveLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">{title}</h3>
        <div className="space-y-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={onSave} disabled={saving || disabled}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value ?? "—"}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = { green: "text-green-700 bg-green-50", red: "text-red-600 bg-red-50", blue: "text-blue-700 bg-blue-50", slate: "text-slate-700 bg-slate-100" };
  return (
    <div className="rounded-xl border bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 rounded px-1.5 py-0.5 text-base font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-400">{text}</div>;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(n);
}

function isExpiringSoon(dateStr: string): boolean {
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
}
