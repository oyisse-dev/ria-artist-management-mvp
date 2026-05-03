import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { listNotifications, markNotificationRead } from "../lib/api";
import { useAuthStore } from "../context/auth-store";
import type { NotificationItem, Role } from "../lib/database.types";
import { Button } from "./ui";

const nav: Array<{ to: string; label: string; roles: Role[] }> = [
  { to: "/", label: "Dashboard", roles: ["admin", "manager", "finance"] },
  { to: "/artists", label: "Artists", roles: ["admin", "manager"] },
  { to: "/projects", label: "Projects", roles: ["admin", "manager", "finance"] },
  { to: "/tasks", label: "Tasks", roles: ["admin", "manager"] },
  { to: "/finance", label: "Finance", roles: ["admin", "manager", "finance"] },
  { to: "/bookings", label: "Bookings", roles: ["admin", "manager"] },
  { to: "/calendar", label: "Calendar", roles: ["admin", "manager", "finance"] },
  { to: "/team", label: "Team", roles: ["admin"] }
];

export function AppLayout() {
  const location = useLocation();
  const { session, profile, role, signOut } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!session) return;
    listNotifications().then(setNotifications).catch(() => setNotifications([]));
  }, [session]);

  const allowedNav = useMemo(() => nav.filter((item) => role && item.roles.includes(role)), [role]);
  const unread = notifications.filter((item) => !item.read).length;

  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="text-lg font-semibold">RIA Artist Management</Link>
            <button className="relative rounded-md border px-3 py-2 text-sm lg:hidden" onClick={() => setOpen(!open)}>Menu</button>
          </div>
          <nav className={`${open ? "flex" : "hidden"} flex-wrap gap-1 text-sm lg:flex`}>
            {allowedNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-md px-3 py-2 hover:bg-slate-100 ${location.pathname === item.to ? "bg-slate-100 font-medium" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <div className="relative">
              <button className="rounded-md border border-slate-300 px-3 py-2" onClick={() => setOpen(false)}>
                Notifications {unread > 0 && <span className="ml-1 rounded-full bg-teal-700 px-2 py-0.5 text-xs text-white">{unread}</span>}
              </button>
            </div>
            <span className="hidden max-w-48 truncate text-slate-600 md:inline">{profile?.full_name ?? profile?.email}</span>
            <Button variant="secondary" onClick={() => signOut()}>Logout</Button>
          </div>
        </div>
      </header>
      {notifications.length > 0 && (
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 py-2 text-xs">
            {notifications.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                to={item.link ?? "/"}
                onClick={() => markNotificationRead(item.id).catch(() => undefined)}
                className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-slate-700"
              >
                {item.title}
              </Link>
            ))}
          </div>
        </div>
      )}
      <main className="mx-auto max-w-7xl px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
}
