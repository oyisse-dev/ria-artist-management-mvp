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
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  loading: true,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();
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
        loading: false
      });
    } else {
      set({ loading: false });
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
          }
        });
      } else {
        set({ accessToken: null, user: null });
      }
    });
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const { data: profile } = await supabase
      .from("users")
      .select("role, full_name")
      .eq("id", data.user.id)
      .single();

    set({
      accessToken: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: profile?.role as Role,
        fullName: profile?.full_name
      }
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ accessToken: null, user: null });
  }
}));
