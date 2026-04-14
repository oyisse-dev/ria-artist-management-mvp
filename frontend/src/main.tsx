import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/layout";
import { DashboardPage } from "./pages/dashboard-page";
import { ArtistsPage } from "./pages/artists-page";
import { TasksPage } from "./pages/tasks-page";
import { FinancePage } from "./pages/finance-page";
import { TeamPage } from "./pages/team-page";
import { LoginPage } from "./pages/login-page";
import { useAuthStore } from "./context/auth-store";
import "./styles.css";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "artists", element: <ArtistsPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "finance", element: <FinancePage /> },
      { path: "team", element: <TeamPage /> },
    ]
  }
]);

function App() {
  const { initialize } = useAuthStore();
  useEffect(() => { initialize(); }, [initialize]);
  return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
