import { useEffect, useState } from "react";
import { fetchMyTasks, fetchArtists, fetchUsers, createTask, updateTask } from "../lib/api";
import { useAuthStore } from "../context/auth-store";

type Task = {
  taskId: string;
  artistId: string;
  title: string;
  description?: string;
  dueDate?: string;
  completed: boolean;
  assignedTo?: string;
  createdAt: string;
};

const EMPTY_FORM = {
  artistId: "", title: "", description: "", dueDate: "", assignedTo: "",
};

export function TasksPage() {
  const { user } = useAuthStore();
  const canWrite = user?.role === "admin" || user?.role === "manager";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [artists, setArtists] = useState<Array<Record<string, unknown>>>([]);
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "done">("open");

  const load = () => {
    setLoading(true);
    Promise.all([fetchMyTasks(), fetchArtists(), fetchUsers()])
      .then(([t, a, u]) => {
        setTasks(t as Task[]);
        setArtists(a);
        setUsers(u);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (task: Task) => {
    await updateTask(task.taskId, { completed: !task.completed });
    load();
  };

  const handleCreate = async () => {
    if (!form.artistId || !form.title) return;
    setSaving(true);
    try {
      await createTask({
        artistId: form.artistId,
        title: form.title,
        description: form.description || undefined,
        dueDate: form.dueDate || undefined,
        assignedTo: form.assignedTo || undefined,
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
      load();
    } finally {
      setSaving(false);
    }
  };

  const filtered = tasks.filter((t) => {
    if (filter === "open") return !t.completed;
    if (filter === "done") return t.completed;
    return true;
  });

  const artistName = (id: string) =>
    String(artists.find((a) => a.artistId === id)?.stageName ?? id);

  const userName = (id?: string) => {
    if (!id) return "—";
    const u = users.find((u) => u.id === id);
    return String(u?.full_name ?? id);
  };

  const isOverdue = (dueDate?: string) =>
    dueDate && new Date(dueDate) < new Date();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Tasks</h2>
        {canWrite && (
          <button onClick={() => setShowModal(true)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            + New Task
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border bg-white p-1 w-fit">
        {(["open", "all", "done"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition ${
              filter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
            }`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-400">
              No {filter === "open" ? "open " : filter === "done" ? "completed " : ""}tasks.
            </div>
          )}
          {filtered.map((task) => (
            <div key={task.taskId}
              className={`flex items-start gap-3 rounded-xl border bg-white p-4 transition ${
                task.completed ? "opacity-60" : ""
              }`}>
              <button onClick={() => handleToggle(task)}
                className={`mt-0.5 h-5 w-5 flex-shrink-0 rounded-full border-2 transition ${
                  task.completed
                    ? "border-green-500 bg-green-500"
                    : "border-slate-300 hover:border-slate-500"
                }`}>
                {task.completed && (
                  <svg className="h-full w-full p-0.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${task.completed ? "line-through text-slate-400" : ""}`}>
                  {task.title}
                </p>
                {task.description && (
                  <p className="mt-0.5 text-sm text-slate-500">{task.description}</p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded bg-slate-100 px-2 py-0.5">{artistName(task.artistId)}</span>
                  {task.assignedTo && (
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                      → {userName(task.assignedTo)}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className={`rounded px-2 py-0.5 ${
                      !task.completed && isOverdue(task.dueDate)
                        ? "bg-red-100 text-red-600 font-medium"
                        : "bg-slate-100"
                    }`}>
                      Due: {task.dueDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">New Task</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Artist *</label>
                <select value={form.artistId} onChange={(e) => setForm({ ...form, artistId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">Select artist…</option>
                  {artists.map((a) => (
                    <option key={String(a.artistId)} value={String(a.artistId)}>
                      {String(a.stageName)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="e.g. Submit contract to label" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                <textarea value={form.description} rows={2}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Due Date</label>
                  <input type="date" value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Assign To</label>
                  <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={String(u.id)} value={String(u.id)}>{String(u.full_name)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)}
                className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.artistId || !form.title}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                {saving ? "Creating…" : "Create Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
