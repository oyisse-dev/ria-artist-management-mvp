import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Role, UserProfile } from "../lib/database.types";

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: UserProfile | null;
  role: Role | null;
  authMessage: string | null;
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

function profileIsActive(profile: UserProfile | null) {
  return profile?.is_active !== false;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  loading: true,
  session: null,
  profile: null,
  role: null,
  authMessage: null,
  initialize: async () => {
    set({ loading: true });
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const profile = session?.user ? await loadProfile(session.user.id).catch(() => null) : null;
    if (session && profile && !profileIsActive(profile)) {
      await supabase.auth.signOut();
      set({ session: null, profile: null, role: null, authMessage: "Your account is inactive. Ask an admin to reactivate it.", loading: false });
      return;
    }
    set({ session, profile, role: profileIsActive(profile) ? profile?.role ?? null : null, authMessage: null, loading: false });

    supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextProfile = nextSession?.user ? await loadProfile(nextSession.user.id).catch(() => null) : null;
      if (nextSession && nextProfile && !profileIsActive(nextProfile)) {
        await supabase.auth.signOut();
        set({ session: null, profile: null, role: null, authMessage: "Your account is inactive. Ask an admin to reactivate it.", loading: false });
        return;
      }
      set({ session: nextSession, profile: nextProfile, role: profileIsActive(nextProfile) ? nextProfile?.role ?? null : null, loading: false });
    });
  },
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = data.user ? await loadProfile(data.user.id) : null;
    if (profile && !profileIsActive(profile)) {
      await supabase.auth.signOut();
      set({ session: null, profile: null, role: null, authMessage: "Your account is inactive. Ask an admin to reactivate it." });
      throw new Error("Your account is inactive. Ask an admin to reactivate it.");
    }
    set({ session: data.session, profile, role: profile?.role ?? null, authMessage: null });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null, role: null });
  },
  refreshProfile: async () => {
    const { session } = get();
    if (!session?.user) return;
    const profile = await loadProfile(session.user.id);
    set({ profile, role: profileIsActive(profile) ? profile.role ?? null : null });
  }
}));
