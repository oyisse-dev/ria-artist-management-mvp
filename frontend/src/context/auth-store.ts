import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Role, UserProfile } from "../lib/database.types";

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: UserProfile | null;
  role: Role | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

async function loadProfile(userId: string) {
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  loading: true,
  session: null,
  profile: null,
  role: null,
  initialize: async () => {
    set({ loading: true });
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const profile = session?.user ? await loadProfile(session.user.id).catch(() => null) : null;
    set({ session, profile, role: profile?.role ?? null, loading: false });

    supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextProfile = nextSession?.user ? await loadProfile(nextSession.user.id).catch(() => null) : null;
      set({ session: nextSession, profile: nextProfile, role: nextProfile?.role ?? null, loading: false });
    });
  },
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = data.user ? await loadProfile(data.user.id) : null;
    set({ session: data.session, profile, role: profile?.role ?? null });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null, role: null });
  },
  refreshProfile: async () => {
    const { session } = get();
    if (!session?.user) return;
    const profile = await loadProfile(session.user.id);
    set({ profile, role: profile.role ?? null });
  }
}));
