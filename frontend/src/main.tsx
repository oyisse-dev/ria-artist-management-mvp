import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/layout";
import { RequireRole } from "./components/require-role";
import { useAuthStore } from "./context/auth-store";
import { LoginPage } from "./pages/login-page";
import { DashboardPage } from "./pages/dashboard-page";
import { ArtistsPage } from "./pages/artists-page";
import { ArtistDetailPage } from "./pages/artist-detail-page";
import { ProjectsPage } from "./pages/projects-page";
import { ProjectDetailPage } from "./pages/project-detail-page";
import { TasksPage } from "./pages/tasks-page";
import { FinancePage } from "./pages/finance-page";
import { BookingsPage } from "./pages/bookings-page";
import { CalendarPage } from "./pages/calendar-page";
import { TeamPage } from "./pages/team-page";
import "./styles.css";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "artists", element: <RequireRole roles={["admin", "manager"]}><ArtistsPage /></RequireRole> },
      { path: "artists/:id", element: <RequireRole roles={["admin", "manager"]}><ArtistDetailPage /></RequireRole> },
      { path: "projects", element: <RequireRole roles={["admin", "manager", "finance"]}><ProjectsPage /></RequireRole> },
      { path: "projects/:id", element: <RequireRole roles={["admin", "manager", "finance"]}><ProjectDetailPage /></RequireRole> },
      { path: "tasks", element: <RequireRole roles={["admin", "manager"]}><TasksPage /></RequireRole> },
      { path: "finance", element: <RequireRole roles={["admin", "manager", "finance"]}><FinancePage /></RequireRole> },
      { path: "bookings", element: <RequireRole roles={["admin", "manager"]}><BookingsPage /></RequireRole> },
      { path: "calendar", element: <RequireRole roles={["admin", "manager", "finance"]}><CalendarPage /></RequireRole> },
      { path: "team", element: <RequireRole roles={["admin"]}><TeamPage /></RequireRole> }
    ]
  }
]);

function Root() {
  const { initialize, loading } = useAuthStore();
  useEffect(() => {
    initialize();
  }, [initialize]);
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading workspace...</div>;
  return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
