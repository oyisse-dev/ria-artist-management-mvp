import { create } from "zustand";

type Role = "Admin" | "Manager" | "Finance";

interface AuthState {
  accessToken: string | null;
  user: {
    id: string;
    email?: string;
    role?: Role;
  } | null;
  setSession: (payload: { accessToken: string; id: string; email?: string; role?: Role }) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setSession: ({ accessToken, id, email, role }) =>
    set({
      accessToken,
      user: { id, email, role }
    }),
  clearSession: () => set({ accessToken: null, user: null })
}));
