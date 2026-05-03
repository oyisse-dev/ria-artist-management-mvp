import { FormEvent, useEffect, useState } from "react";
import { Button, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Panel, Select, StatusPill, Textarea } from "../components/ui";
import { createTask, listArtists, listProjects, listTasks, listUsers, updateTask } from "../lib/api";
import type { ProjectWithArtist, TaskWithJoins } from "../lib/api";
import type { Artist, UserProfile } from "../lib/database.types";

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithJoins[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [projects, setProjects] = useState<ProjectWithArtist[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <section>
      <PageHeader title="Tasks" eyebrow="Assignments" />
      <Panel className="mb-5"><TaskForm artists={artists} projects={projects} users={users} reload={load} /></Panel>
      <div className="grid gap-3">
        {tasks.map((task) => (
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
        {tasks.length === 0 && <EmptyState>No tasks visible.</EmptyState>}
      </div>
    </section>
  );
}

function TaskForm({ artists, projects, users, reload }: { artists: Artist[]; projects: ProjectWithArtist[]; users: UserProfile[]; reload: () => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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
  }
  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
      <Field label="Title"><Input name="title" required /></Field>
      <Field label="Due Date"><Input name="due_date" type="date" /></Field>
      <Field label="Assignee"><Select name="assigned_to"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name ?? user.email}</option>)}</Select></Field>
      <Field label="Artist"><Select name="artist_id"><option value="">General</option>{artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name}</option>)}</Select></Field>
      <Field label="Project"><Select name="project_id"><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</Select></Field>
      <Field label="Description"><Textarea name="description" /></Field>
      <div className="flex items-end md:col-span-2"><Button>Create Task</Button></div>
    </form>
  );
}
