import { FormEvent, useEffect, useState } from "react";
import { Button, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Panel, Select } from "../components/ui";
import { getErrorMessage, inviteUser, listUsers } from "../lib/api";
import type { UserProfile } from "../lib/database.types";

export function TeamPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    listUsers().then(setUsers).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setFormError("");
    setSaving(true);
    try {
      await inviteUser({ email: String(form.get("email")), fullName: String(form.get("fullName")), role: String(form.get("role")) });
      setMessage("Invite sent.");
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, "Could not send invite"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  return (
    <section>
      <PageHeader title="Team" eyebrow="Admin" />
      <Panel className="mb-5">
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
          <Field label="Full Name"><Input name="fullName" /></Field>
          <Field label="Email"><Input name="email" type="email" required /></Field>
          <Field label="Role"><Select name="role"><option value="manager">Manager</option><option value="finance">Finance</option><option value="admin">Admin</option></Select></Field>
          <div className="flex items-end"><Button disabled={saving}>{saving ? "Sending..." : "Invite User"}</Button></div>
        </form>
        {message && <p className="mt-3 text-sm text-teal-700">{message}</p>}
        {formError && <p className="mt-3 text-sm text-red-700">{formError}</p>}
      </Panel>
      <Panel>
        <div className="grid gap-2">
          {users.map((user) => <div key={user.id} className="rounded-md border p-3 text-sm">{user.full_name ?? user.email} · {user.email} · {user.role}</div>)}
          {users.length === 0 && <EmptyState>No team members found.</EmptyState>}
        </div>
      </Panel>
    </section>
  );
}
