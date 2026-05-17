import { FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../context/auth-store";
import { Button, Field, Input } from "../components/ui";

export function LoginPage() {
  const { session, signIn, authMessage } = useAuthStore();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";

  if (session) return <Navigate to={from} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-950">RIA Artist Management</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in with your team account.</p>
        <div className="mt-6 grid gap-4">
          {authMessage && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{authMessage}</p>}
          <Field label="Email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button disabled={saving}>{saving ? "Signing in..." : "Sign in"}</Button>
        </div>
      </form>
    </main>
  );
}
