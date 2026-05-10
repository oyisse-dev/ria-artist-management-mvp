import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../context/auth-store";
import type { Role } from "../lib/database.types";
import { PermissionDenied } from "./ui";

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const location = useLocation();
  const { session, role } = useAuthStore();

  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!role || !roles.includes(role)) return <PermissionDenied />;

  return <>{children}</>;
}
