import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/layout";
import { DashboardPage } from "./pages/dashboard-page";
import { ArtistsPage } from "./pages/artists-page";
import { TasksPage } from "./pages/tasks-page";
import { FinancePage } from "./pages/finance-page";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "artists", element: <ArtistsPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "finance", element: <FinancePage /> }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
