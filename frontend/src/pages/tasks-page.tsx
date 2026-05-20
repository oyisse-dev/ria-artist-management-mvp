import { FormEvent, useEffect, useState } from "react";
import { Button, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Panel, SectionTabs, Select, StatCard, StatusPill, Textarea } from "../components/ui";
import { createTask, getErrorMessage, listArtists, listProjects, listTasks, listUsers, updateTask } from "../lib/api";
import type { ProjectWithArtist, TaskWithJoins } from "../lib/api";
import type { Artist, UserProfile } from "../lib/database.types";

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithJoins[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [projects, setProjects] = useState<ProjectWithArtist[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("open");
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [taskRows, artistRows, projectRows, userRows] = await Promise.all([listTasks(), listArtists(), listProjects(), listUsers()]);
      setTasks(taskRows);
      setArtists(artistRows);
      setProjects(projectRows);
      setUsers(userRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tasks failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const openTasks = tasks.filter((task) => !task.completed);
  const overdueTasks = openTasks.filter((task) => task.due_date && new Date(task.due_date) < new Date());
  const visibleTasks = tab === "all" ? tasks : tab === "done" ? tasks.filter((task) => task.completed) : openTasks;

  return (
    <section>
      <PageHeader
        title="Tasks"
        eyebrow="Assignments"
        actions={<Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? "Hide form" : "Create task"}</Button>}
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <StatCard label="Open" value={openTasks.length} />
        <StatCard label="Completed" value={tasks.filter((task) => task.completed).length} />
        <StatCard label="Overdue" value={overdueTasks.length} />
      </div>
      {showCreate && <Panel className="mb-5"><TaskForm artists={artists} projects={projects} users={users} reload={load} /></Panel>}
      <SectionTabs tabs={["open", "all", "done"]} active={tab} onChange={setTab} />
      <div className="grid gap-3">
        {visibleTasks.map((task) => (
          <Panel key={task.id}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-medium">{task.title}</p>
                <p className="text-sm text-slate-500">{task.artist?.stage_name ?? task.project?.title ?? "General"} · Due {task.due_date ?? "not set"} · {task.assignee?.full_name ?? "Unassigned"}</p>
                {task.description && <p className="mt-2 text-sm text-slate-600">{task.description}</p>}
              </div>
              <div className="flex gap-2">
                <StatusPill>{task.completed ? "completed" : "open"}</StatusPill>
                {!task.completed && <Button variant="secondary" onClick={async () => { await updateTask(task.id, { completed: true }); await load(); }}>Mark Complete</Button>}
              </div>
            </div>
          </Panel>
        ))}
        {visibleTasks.length === 0 && <EmptyState>No tasks visible in this view.</EmptyState>}
      </div>
    </section>
  );
}

function TaskForm({ artists, projects, users, reload }: { artists: Artist[]; projects: ProjectWithArtist[]; users: UserProfile[]; reload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await createTask({
        title: String(form.get("title")),
        description: String(form.get("description") || ""),
        due_date: String(form.get("due_date") || "") || null,
        assigned_to: String(form.get("assigned_to") || "") || null,
        artist_id: String(form.get("artist_id") || "") || null,
        project_id: String(form.get("project_id") || "") || null
      });
      event.currentTarget.reset();
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, "Could not create task"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
      <Field label="Title"><Input name="title" required /></Field>
      <Field label="Due Date"><Input name="due_date" type="date" /></Field>
      <Field label="Assignee"><Select name="assigned_to"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name ?? user.email}</option>)}</Select></Field>
      <Field label="Artist"><Select name="artist_id"><option value="">General</option>{artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name}</option>)}</Select></Field>
      <Field label="Project"><Select name="project_id"><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</Select></Field>
      <Field label="Description"><Textarea name="description" /></Field>
      {error && <p className="text-sm text-red-700 md:col-span-4">{error}</p>}
      <div className="flex items-end md:col-span-2"><Button disabled={saving}>{saving ? "Saving..." : "Create Task"}</Button></div>
    </form>
  );
}
