import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Panel, Select, StatusPill } from "../components/ui";
import { assignArtistToUser, getErrorMessage, inviteUser, listArtistAssignments, listArtists, listUsers, removeArtistAssignment, updateUserProfile } from "../lib/api";
import type { ArtistAssignmentWithJoins } from "../lib/api";
import { useAuthStore } from "../context/auth-store";
import type { Artist, Role, UserProfile } from "../lib/database.types";

export function TeamPage() {
  const { profile, refreshProfile } = useAuthStore();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [assignments, setAssignments] = useState<ArtistAssignmentWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [userRows, artistRows, assignmentRows] = await Promise.all([listUsers(), listArtists(), listArtistAssignments()]);
      setUsers(userRows);
      setArtists(artistRows);
      setAssignments(assignmentRows);
    } catch (err) {
      setError(getErrorMessage(err, "Team failed to load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const managers = useMemo(() => users.filter((user) => user.role === "manager" && user.is_active !== false), [users]);
  const assignmentsByUser = useMemo(() => {
    return assignments.reduce<Record<string, ArtistAssignmentWithJoins[]>>((acc, assignment) => {
      acc[assignment.user_id] = [...(acc[assignment.user_id] ?? []), assignment];
      return acc;
    }, {});
  }, [assignments]);
  const supportsActiveStatus = users.some((user) => "is_active" in user);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <PageHeader title="Team" eyebrow="Access control" />
      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-5">
          <InvitePanel reload={load} setMessage={setMessage} />
          <AssignmentPanel artists={artists} managers={managers} assignments={assignments} reload={load} setMessage={setMessage} />
        </div>
        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">People</h3>
              <p className="text-sm text-slate-500">Roles and active access for the workspace.</p>
            </div>
            {message && <span className="text-sm text-teal-700">{message}</span>}
          </div>
          <div className="grid gap-3">
            {users.map((user) => (
              <TeamMemberRow
                key={user.id}
                user={user}
                currentUserId={profile?.id ?? ""}
                assignments={assignmentsByUser[user.id] ?? []}
                supportsActiveStatus={supportsActiveStatus}
                onSaved={async () => {
                  await load();
                  if (user.id === profile?.id) await refreshProfile();
                }}
              />
            ))}
          {users.length === 0 && <EmptyState>No team members found.</EmptyState>}
          {!supportsActiveStatus && users.length > 0 && <p className="text-sm text-amber-700">Active/inactive controls will appear after the team access database migration is applied.</p>}
        </div>
      </Panel>
      </div>
    </section>
  );
}

function InvitePanel({ reload, setMessage }: { reload: () => Promise<void>; setMessage: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setSaving(true);
    try {
      await inviteUser({ email: String(form.get("email")), fullName: String(form.get("fullName")), role: String(form.get("role")) });
      setMessage("Invite sent.");
      event.currentTarget.reset();
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, "Could not send invite"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <h3 className="font-semibold">Invite User</h3>
      <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Full Name"><Input name="fullName" /></Field>
        <Field label="Email"><Input name="email" type="email" required /></Field>
        <Field label="Role"><Select name="role"><option value="manager">Manager</option><option value="finance">Finance</option><option value="admin">Admin</option></Select></Field>
        <div className="flex items-end"><Button disabled={saving}>{saving ? "Sending..." : "Invite User"}</Button></div>
        {error && <p className="text-sm text-red-700 md:col-span-2">{error}</p>}
      </form>
    </Panel>
  );
}

function AssignmentPanel({ artists, managers, assignments, reload, setMessage }: { artists: Artist[]; managers: UserProfile[]; assignments: ArtistAssignmentWithJoins[]; reload: () => Promise<void>; setMessage: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const assignedKeys = new Set(assignments.map((assignment) => `${assignment.user_id}:${assignment.artist_id}`));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const userId = String(form.get("user_id") || "");
    const artistId = String(form.get("artist_id") || "");
    if (!userId || !artistId) return;
    setError("");
    setSaving(true);
    try {
      await assignArtistToUser(artistId, userId);
      setMessage("Artist assigned.");
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, "Could not assign artist"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <h3 className="font-semibold">Manager Assignments</h3>
      <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Field label="Manager">
          <Select name="user_id" required>
            <option value="">Select manager</option>
            {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.full_name ?? manager.email}</option>)}
          </Select>
        </Field>
        <Field label="Artist">
          <Select name="artist_id" required>
            <option value="">Select artist</option>
            {artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name}</option>)}
          </Select>
        </Field>
        <div className="flex items-end"><Button disabled={saving}>{saving ? "Assigning..." : "Assign"}</Button></div>
        {error && <p className="text-sm text-red-700 md:col-span-3">{error}</p>}
      </form>
      <div className="mt-4 grid gap-2">
        {assignments.map((assignment) => (
          <div key={`${assignment.user_id}-${assignment.artist_id}`} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 text-sm md:flex-row md:items-center md:justify-between">
            <span>{assignment.user?.full_name ?? assignment.user?.email ?? "User"} manages {assignment.artist?.stage_name ?? "Artist"}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await removeArtistAssignment(assignment.artist_id, assignment.user_id);
                setMessage("Assignment removed.");
                await reload();
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        {assignments.length === 0 && <EmptyState>No manager assignments yet.</EmptyState>}
        {managers.flatMap((manager) => artists.map((artist) => `${manager.id}:${artist.id}`)).some((key) => !assignedKeys.has(key)) ? null : managers.length > 0 && artists.length > 0 ? <p className="text-sm text-slate-500">All active managers are assigned to all artists.</p> : null}
      </div>
    </Panel>
  );
}

function TeamMemberRow({ user, currentUserId, assignments, supportsActiveStatus, onSaved }: { user: UserProfile; currentUserId: string; assignments: ArtistAssignmentWithJoins[]; supportsActiveStatus: boolean; onSaved: () => Promise<void> }) {
  const [role, setRole] = useState<Role>(user.role ?? "manager");
  const [active, setActive] = useState(user.is_active !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isSelf = user.id === currentUserId;

  async function save() {
    setSaving(true);
    setError("");
    try {
      await updateUserProfile(user.id, supportsActiveStatus ? { role, is_active: active } : { role });
      await onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Could not update user"));
      setRole(user.role ?? "manager");
      setActive(user.is_active !== false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_150px_150px_auto] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{user.full_name ?? user.email ?? "Unnamed user"}</p>
            {supportsActiveStatus && <StatusPill>{user.is_active === false ? "inactive" : "active"}</StatusPill>}
          </div>
          <p className="text-sm text-slate-500">{user.email ?? "No email"}</p>
          {assignments.length > 0 && <p className="mt-1 text-xs text-slate-500">Artists: {assignments.map((assignment) => assignment.artist?.stage_name ?? "Artist").join(", ")}</p>}
        </div>
        <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="finance">Finance</option>
        </Select>
        {supportsActiveStatus ? (
          <Select value={active ? "active" : "inactive"} onChange={(event) => setActive(event.target.value === "active")} disabled={isSelf}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        ) : <span className="text-sm text-slate-500">Active status pending</span>}
        <Button type="button" variant="secondary" disabled={saving || (role === user.role && active === (user.is_active !== false))} onClick={save}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      {isSelf && <p className="mt-2 text-xs text-slate-500">You cannot deactivate your own account.</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
