import { create } from "zustand";
import { supabase } from "../lib/supabase";

type Role = "admin" | "manager" | "finance";

interface AuthState {
  accessToken: string | null;
  user: {
    id: string;
    email?: string;
    role?: Role;
    fullName?: string;
  } | null;
  loading: boolean;
  initialized: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  loading: true,
  initialized: false,
  authError: null,

  initialize: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        set({ loading: false, initialized: true, authError: error.message });
        return;
      }

      if (session) {
        const { data: profile } = await supabase
          .from("users")
          .select("role, full_name")
          .eq("id", session.user.id)
          .single();

        set({
          accessToken: session.access_token,
          user: {
            id: session.user.id,
            email: session.user.email,
            role: profile?.role as Role,
            fullName: profile?.full_name
          },
          loading: false,
          initialized: true,
          authError: null,
        });
      } else {
        set({ loading: false, initialized: true, authError: null });
      }
    } catch (e) {
      set({ loading: false, initialized: true, authError: e instanceof Error ? e.message : "Session init failed" });
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const { data: profile } = await supabase
          .from("users")
          .select("role, full_name")
          .eq("id", session.user.id)
          .single();

        set({
          accessToken: session.access_token,
          user: {
            id: session.user.id,
            email: session.user.email,
            role: profile?.role as Role,
            fullName: profile?.full_name
          },
          authError: null,
        });
      } else {
        set({ accessToken: null, user: null });
      }
    });
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const session = data.session;
    const authUser = data.user;

    if (!session || !authUser) {
      throw new Error("Sign in succeeded but session was not established. Please retry.");
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role, full_name")
      .eq("id", authUser.id)
      .single();

    set({
      accessToken: session.access_token,
      user: {
        id: authUser.id,
        email: authUser.email,
        role: profile?.role as Role,
        fullName: profile?.full_name
      },
      authError: null,
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ accessToken: null, user: null });
  }
}));
