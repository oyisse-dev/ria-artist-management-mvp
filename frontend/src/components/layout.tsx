import { Link, Outlet } from "react-router-dom";

const nav = [
  { to: "/", label: "Dashboard" },
  { to: "/artists", label: "Artists" },
  { to: "/tasks", label: "Tasks" },
  { to: "/finance", label: "Finance" }
];

export function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold">RIA Artist Management</h1>
          <nav className="flex gap-4 text-sm">
            {nav.map((item) => (
              <Link key={item.to} to={item.to} className="rounded px-2 py-1 hover:bg-slate-100">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
