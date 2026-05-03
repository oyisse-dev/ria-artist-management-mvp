import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusPill } from "../components/ui";
import { listBookings, listProjectChecklist, listProjects, listTasks } from "../lib/api";

interface CalendarItem {
  date: string;
  label: string;
  type: string;
  href: string;
}

export function CalendarPage() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [mode, setMode] = useState<"month" | "week" | "list">("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [projects, tasks, bookings] = await Promise.all([listProjects(), listTasks(), listBookings()]);
        const checklistGroups = await Promise.all(projects.map((project) => listProjectChecklist(project.id).catch(() => [])));
        const calendarItems: CalendarItem[] = [
          ...projects.filter((p) => p.target_date).map((p) => ({ date: p.target_date!, label: p.title, type: "project", href: `/projects/${p.id}` })),
          ...tasks.filter((t) => t.due_date).map((t) => ({ date: t.due_date!, label: t.title ?? "Task", type: "task", href: "/tasks" })),
          ...bookings.map((b) => ({ date: b.date, label: b.event_name, type: "booking", href: "/bookings" })),
          ...checklistGroups.flat().filter((c) => c.due_date).map((c) => ({ date: c.due_date!, label: c.item_name, type: "checklist", href: `/projects/${c.project_id}` }))
        ].sort((a, b) => a.date.localeCompare(b.date));
        setItems(calendarItems);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Calendar failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const visible = useMemo(() => {
    if (mode === "list") return items;
    const now = new Date();
    const days = mode === "week" ? 7 : 31;
    const limit = new Date(now);
    limit.setDate(now.getDate() + days);
    return items.filter((item) => new Date(item.date) >= new Date(now.toDateString()) && new Date(item.date) <= limit);
  }, [items, mode]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <PageHeader title="Calendar" eyebrow="Deadlines and bookings" actions={<div className="flex gap-2">{["month","week","list"].map((item) => <button key={item} className={`rounded-md px-3 py-2 text-sm capitalize ${mode === item ? "bg-slate-950 text-white" : "bg-white"}`} onClick={() => setMode(item as typeof mode)}>{item}</button>)}</div>} />
      <Panel>
        <div className="grid gap-2">
          {visible.map((item, index) => (
            <Link key={`${item.type}-${item.date}-${index}`} to={item.href} className="flex items-center justify-between rounded-md border border-slate-200 p-3 hover:bg-slate-50">
              <div><p className="font-medium">{item.label}</p><p className="text-sm text-slate-500">{item.date}</p></div>
              <StatusPill>{item.type}</StatusPill>
            </Link>
          ))}
          {visible.length === 0 && <EmptyState>No calendar items in this range.</EmptyState>}
        </div>
      </Panel>
    </section>
  );
}
