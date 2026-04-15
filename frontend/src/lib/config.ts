const FALLBACK_SUPABASE_URL = "https://kgvabdmadrzbtvmfpall.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndmFiZG1hZHJ6YnR2bWZwYWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NTY1MDQsImV4cCI6MjA5MTAzMjUwNH0.5Ru5J9ODvKlnOcn01EeM48GCE931P7v0s1l0qmUbBzA";

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  // Single-source-of-truth fallback so preview deployments don't break
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
};

export function configHealth() {
  return {
    supabaseUrlSet: Boolean(config.supabaseUrl),
    supabaseAnonKeySet: Boolean(config.supabaseAnonKey),
    usingFallbackUrl: !import.meta.env.VITE_SUPABASE_URL,
    usingFallbackAnonKey: !import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}
