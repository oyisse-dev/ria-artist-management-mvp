import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchProjects, createProject, deleteProject, updateProject,
  type Project, type ProjectType, type ProjectStatus,
  STATUS_LABELS, STATUS_COLORS,
} from "../lib/projects-api";
import { fetchArtists } from "../lib/api";
import { useAuthStore } from "../context/auth-store";

const TYPE_ICONS: Record<ProjectType, string> = {
  release: "🎵", tour: "🎤", campaign: "📣",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as ProjectStatus[];

const EMPTY_FORM = {
  artistId: "", type: "release" as ProjectType, title: "", targetDate: "",
  budgetEstimate: "", description: "",
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canWrite = user?.role === "admin" || user?.role === "manager";
  const isAdmin = user?.role === "admin";

  const [projects, setProjects] = useState<Project[]>([]);
  const [artists, setArtists] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [filterArtist, setFilterArtist] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([fetchProjects(), fetchArtists()]);
      setProjects(p);
      setArtists(a);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.artistId || !form.title) return;
    setSaving(true);
    setError(null);
    try {
      const p = await createProject({
        artistId: form.artistId,
        type: form.type,
        title: form.title,
        target_date: form.targetDate || undefined,
        budget_estimate: form.budgetEstimate ? Number(form.budgetEstimate) : undefined,
        description: form.description || undefined,
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
      navigate(`/projects/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await deleteProject(id);
    load();
  };

  const handleStatusChange = async (id: string, status: ProjectStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    await updateProject(id, { status });
    load();
  };

  const filtered = projects.filter((p) => {
    if (filterArtist && p.artist_id !== filterArtist) return false;
    if (filterType && p.type !== filterType) return false;
    return true;
  });

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Projects</h2>
          <p className="text-sm text-slate-500">Releases, tours & campaigns</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border bg-white p-1">
            {(["list", "kanban"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                  view === v ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                }`}>{v}</button>
            ))}
          </div>
          {canWrite && (
            <button onClick={() => setShowModal(true)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              + New Project
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={filterArtist} onChange={(e) => setFilterArtist(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All Artists</option>
          {artists.map((a) => <option key={String(a.artistId)} value={String(a.artistId)}>{String(a.stageName)}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All Types</option>
          <option value="release">🎵 Release</option>
          <option value="tour">🎤 Tour</option>
          <option value="campaign">📣 Campaign</option>
        </select>
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
          <span>{filtered.length} project{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
        <>
          {/* LIST VIEW */}
          {view === "list" && (
            <div className="space-y-2">
              {filtered.length === 0 && (
                <div className="rounded-xl border bg-white p-10 text-center text-slate-400">
                  No projects yet. Create your first release, tour, or campaign!
                </div>
              )}
              {filtered.map((p) => (
                <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                  className="flex cursor-pointer items-center gap-4 rounded-xl border bg-white p-4 hover:bg-slate-50 transition">
                  <div className="text-2xl">{TYPE_ICONS[p.type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{p.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>🎵 {p.artists?.stage_name ?? "—"}</span>
                      {p.target_date && <span>📅 Target: {p.target_date}</span>}
                      {p.budget_estimate && <span>💰 Budget: UGX {Number(p.budget_estimate).toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={p.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleStatusChange(p.id, e.target.value as ProjectStatus, e as unknown as React.MouseEvent)}
                      className="rounded-lg border px-2 py-1 text-xs focus:outline-none">
                      {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                    {isAdmin && (
                      <button onClick={(e) => handleDelete(p.id, e)}
                        className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* KANBAN VIEW */}
          {view === "kanban" && (
            <div className="overflow-x-auto">
              <div className="flex gap-3 pb-4" style={{ minWidth: `${ALL_STATUSES.length * 220}px` }}>
                {ALL_STATUSES.map((status) => {
                  const cols = filtered.filter((p) => p.status === status);
                  return (
                    <div key={status} className="w-52 flex-shrink-0">
                      <div className="mb-2 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
                          {STATUS_LABELS[status]}
                        </span>
                        <span className="text-xs text-slate-400">{cols.length}</span>
                      </div>
                      <div className="space-y-2">
                        {cols.map((p) => (
                          <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                            className="cursor-pointer rounded-xl border bg-white p-3 shadow-sm hover:shadow-md transition">
                            <div className="flex items-start gap-2">
                              <span className="text-lg">{TYPE_ICONS[p.type]}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold leading-tight truncate">{p.title}</p>
                                <p className="text-xs text-slate-500 mt-0.5 truncate">{p.artists?.stage_name}</p>
                              </div>
                            </div>
                            {p.target_date && (
                              <p className="mt-2 text-xs text-slate-400">📅 {p.target_date}</p>
                            )}
                          </div>
                        ))}
                        {cols.length === 0 && (
                          <div className="rounded-xl border border-dashed p-4 text-center text-xs text-slate-300">Empty</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">New Project</h3>
            {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="space-y-3">
              {/* Type selector */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Project Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["release", "tour", "campaign"] as const).map((t) => (
                    <button key={t} onClick={() => setForm({ ...form, type: t })}
                      className={`rounded-lg border py-3 text-sm font-medium transition ${
                        form.type === t ? "border-slate-900 bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
                      }`}>
                      {TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
                {form.type === "release" && (
                  <p className="mt-1.5 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                    ✅ Release Plan checklist (23 items) will be auto-created
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Artist *</label>
                <select value={form.artistId} onChange={(e) => setForm({ ...form, artistId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">Select artist…</option>
                  {artists.map((a) => <option key={String(a.artistId)} value={String(a.artistId)}>{String(a.stageName)}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Project Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={form.type === "release" ? "e.g. Debut Single – Fire" : form.type === "tour" ? "e.g. East Africa Tour 2025" : "e.g. Album Launch Campaign"}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Target Date</label>
                  <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Budget (UGX)</label>
                  <input type="number" value={form.budgetEstimate} onChange={(e) => setForm({ ...form, budgetEstimate: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                <textarea value={form.description} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)}
                className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.artistId || !form.title}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                {saving ? "Creating…" : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
