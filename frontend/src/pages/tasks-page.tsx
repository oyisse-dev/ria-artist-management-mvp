import { useEffect, useState } from "react";
import { fetchMyTasks } from "../lib/api";

export function TasksPage() {
  const [tasks, setTasks] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetchMyTasks().then(setTasks).catch(() => setTasks([]));
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">My Tasks</h2>
      <div className="grid gap-3">
        {tasks.map((task) => (
          <div key={String(task.taskId)} className="rounded-xl border bg-white p-4">
            <p className="font-medium">{String(task.title ?? "")}</p>
            <p className="text-sm text-slate-500">Due: {String(task.dueDate ?? "Not set")}</p>
            <p className="text-xs text-slate-600">
              Status: {task.completed ? "Completed" : "Open"}
            </p>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-slate-500">No assigned tasks.</p>}
      </div>
    </section>
  );
}
