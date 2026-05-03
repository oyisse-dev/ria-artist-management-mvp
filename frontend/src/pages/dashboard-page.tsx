import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listBookings, listProjects, listTasks, listTransactions } from "../lib/api";
import type { BookingWithJoins, ProjectWithArtist, TaskWithJoins, TransactionWithJoins } from "../lib/api";
import { EmptyState, ErrorState, formatCurrency, LoadingState, PageHeader, Panel, StatusPill } from "../components/ui";

export function DashboardPage() {
  const [projects, setProjects] = useState<ProjectWithArtist[]>([]);
  const [tasks, setTasks] = useState<TaskWithJoins[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithJoins[]>([]);
  const [bookings, setBookings] = useState<BookingWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([listProjects(), listTasks(), listTransactions(), listBookings()])
      .then(([projectRows, taskRows, txRows, bookingRows]) => {
        setProjects(projectRows);
        setTasks(taskRows);
        setTransactions(txRows);
        setBookings(bookingRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Dashboard failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const finance = useMemo(() => {
    const income = transactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
    const expense = transactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
    return { income, expense, net: income - expense };
  }, [transactions]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <PageHeader title="Dashboard" eyebrow="Operations" />
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Active Projects" value={projects.filter((p) => p.status !== "completed").length} />
        <Metric label="Open Tasks" value={tasks.filter((task) => !task.completed).length} />
        <Metric label="Upcoming Bookings" value={bookings.filter((booking) => booking.status !== "completed").length} />
        <Metric label="Net" value={formatCurrency(finance.net)} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel>
          <h3 className="font-semibold">Projects Needing Attention</h3>
          <div className="mt-3 grid gap-3">
            {projects.slice(0, 6).map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`} className="flex items-center justify-between rounded-md border border-slate-200 p-3 hover:bg-slate-50">
                <div>
                  <p className="font-medium">{project.title}</p>
                  <p className="text-sm text-slate-500">{project.artist?.stage_name ?? "No artist"} · {project.target_date ?? "No target date"}</p>
                </div>
                <div className="text-right">
                  <StatusPill>{project.status.replaceAll("_", " ")}</StatusPill>
                  <p className="mt-1 text-sm text-slate-500">{project.progress ?? 0}%</p>
                </div>
              </Link>
            ))}
            {projects.length === 0 && <EmptyState>No projects visible for your role yet.</EmptyState>}
          </div>
        </Panel>
        <Panel>
          <h3 className="font-semibold">Due Soon</h3>
          <div className="mt-3 grid gap-3">
            {tasks.filter((task) => !task.completed).slice(0, 7).map((task) => (
              <div key={task.id} className="rounded-md border border-slate-200 p-3">
                <p className="font-medium">{task.title}</p>
                <p className="text-sm text-slate-500">{task.artist?.stage_name ?? task.project?.title ?? "General"} · {task.due_date ?? "No due date"}</p>
              </div>
            ))}
            {tasks.length === 0 && <EmptyState>No tasks assigned.</EmptyState>}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Panel>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Panel>
  );
}
