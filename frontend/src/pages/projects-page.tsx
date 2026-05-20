import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Panel, Select, StatCard, StatusPill, Textarea, formatCurrency } from "../components/ui";
import { createProject, getErrorMessage, listArtists, listProjects } from "../lib/api";
import { useAuthStore } from "../context/auth-store";
import type { ProjectWithArtist } from "../lib/api";
import type { Artist } from "../lib/database.types";

export function ProjectsPage() {
  const { role } = useAuthStore();
  const [projects, setProjects] = useState<ProjectWithArtist[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [artistId, setArtistId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [projectRows, artistRows] = await Promise.all([listProjects(), listArtists()]);
      setProjects(projectRows);
      setArtists(artistRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Projects failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => projects.filter((project) => (!status || project.status === status) && (!type || project.type === type) && (!artistId || project.artist_id === artistId)), [projects, status, type, artistId]);

  const canCreate = role === "admin" || role === "manager";

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <PageHeader title="Projects" eyebrow="Releases, tours, campaigns" actions={canCreate ? <Button onClick={() => setOpen(!open)}>Create Project</Button> : undefined} />
      {open && <ProjectForm artists={artists} onCreated={async () => { setOpen(false); await load(); }} />}
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <StatCard label="Total" value={projects.length} />
        <StatCard label="Active" value={projects.filter((project) => project.status !== "completed").length} />
        <StatCard label="At Risk" value={projects.filter((project) => (project.progress ?? 0) < 35 && project.status !== "completed").length} />
        <StatCard label="Completed" value={projects.filter((project) => project.status === "completed").length} />
      </div>
      <Panel className="mb-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Status"><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All</option>{["planning","pre_production","recording","mix_master","asset_collection","qc","distribution","live","completed"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select></Field>
          <Field label="Type"><Select value={type} onChange={(event) => setType(event.target.value)}><option value="">All</option><option value="release">Release</option><option value="tour">Tour</option><option value="campaign">Campaign</option></Select></Field>
          <Field label="Artist"><Select value={artistId} onChange={(event) => setArtistId(event.target.value)}><option value="">All</option>{artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name}</option>)}</Select></Field>
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((project) => (
          <Link key={project.id} to={`/projects/${project.id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-500">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{project.title}</p>
                <p className="text-sm text-slate-500">{project.artist?.stage_name ?? "No artist"} · {project.type}</p>
              </div>
              <StatusPill>{project.status.replaceAll("_", " ")}</StatusPill>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-teal-600" style={{ width: `${project.progress ?? 0}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-sm text-slate-600">
              <span>{project.progress ?? 0}% complete</span>
              <span>{project.target_date ?? "No target"}</span>
            </div>
            {(project.progress ?? 0) < 35 && project.status !== "completed" && (
              <p className="mt-2 text-xs font-medium text-amber-700">Needs attention</p>
            )}
            <p className="mt-3 text-sm text-slate-500">Budget {formatCurrency(project.budget_estimate)} · Actual {formatCurrency(project.actual_cost)}</p>
          </Link>
        ))}
        {filtered.length === 0 && <EmptyState>No projects match these filters.</EmptyState>}
      </div>
    </section>
  );
}

function ProjectForm({ artists, onCreated }: { artists: Artist[]; onCreated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await createProject({
        artist_id: String(form.get("artist_id")),
        title: String(form.get("title")),
        type: String(form.get("type")),
        target_date: String(form.get("target_date") || "") || null,
        budget_estimate: Number(form.get("budget_estimate") || 0),
        description: String(form.get("description") || "")
      });
      await onCreated();
    } catch (err) {
      setError(getErrorMessage(err, "Could not create project"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Panel className="mb-5">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-3">
        <Field label="Artist"><Select name="artist_id" required>{artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name}</option>)}</Select></Field>
        <Field label="Title"><Input name="title" required /></Field>
        <Field label="Type"><Select name="type"><option value="release">Release</option><option value="tour">Tour</option><option value="campaign">Campaign</option></Select></Field>
        <Field label="Target Date"><Input name="target_date" type="date" /></Field>
        <Field label="Budget Estimate"><Input name="budget_estimate" type="number" /></Field>
        <Field label="Description"><Textarea name="description" /></Field>
        {error && <p className="text-sm text-red-700 md:col-span-3">{error}</p>}
        <div className="md:col-span-3"><Button disabled={saving}>{saving ? "Creating..." : "Create Project"}</Button></div>
      </form>
    </Panel>
  );
}
