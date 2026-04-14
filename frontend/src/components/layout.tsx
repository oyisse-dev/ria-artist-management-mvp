import { Link, Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../context/auth-store";

const nav = [
  { to: "/", label: "Dashboard" },
  { to: "/artists", label: "Artists" },
  { to: "/tasks", label: "Tasks" },
  { to: "/finance", label: "Finance" },
  { to: "/team", label: "Team", adminOnly: true },
];

export function AppLayout() {
  const { user, loading, signOut } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight text-slate-900">🎵 RIA</span>
            <span className="hidden text-sm text-slate-400 sm:block">Artist Management</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            {nav
              .filter((item) => !item.adminOnly || user.role === "admin")
              .map((item) => {
                const active = item.to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.to);
                return (
                  <Link key={item.to} to={item.to}
                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}>
                    {item.label}
                  </Link>
                );
              })}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-xs font-medium text-slate-700">{user.fullName ?? user.email}</span>
              <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${roleColor(user.role ?? "")}`}>
                {user.role}
              </span>
            </div>
            <button onClick={() => signOut()}
              className="rounded-lg border px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function roleColor(role: string): string {
  if (role === "admin") return "bg-purple-100 text-purple-700";
  if (role === "manager") return "bg-blue-100 text-blue-700";
  if (role === "finance") return "bg-green-100 text-green-700";
  return "bg-slate-100 text-slate-500";
}
