import { Link, Outlet, Navigate } from "react-router-dom";
import { useAuthStore } from "../context/auth-store";

const nav = [
  { to: "/", label: "Dashboard" },
  { to: "/artists", label: "Artists" },
  { to: "/tasks", label: "Tasks" },
  { to: "/finance", label: "Finance" }
];

export function AppLayout() {
  const { user, loading, signOut } = useAuthStore();

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
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold">RIA Artist Management</h1>
          <nav className="flex items-center gap-4 text-sm">
            {nav.map((item) => (
              <Link key={item.to} to={item.to} className="rounded px-2 py-1 hover:bg-slate-100">
                {item.label}
              </Link>
            ))}
            <span className="ml-4 text-xs text-slate-500">{user.email}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {user.role}
            </span>
            <button
              onClick={() => signOut()}
              className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
