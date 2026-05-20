import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchArtists, createArtist, updateArtist, deleteArtist } from "../lib/api";
import { useAuthStore } from "../context/auth-store";

type Artist = {
  artistId: string;
  stageName: string;
  legalName?: string;
  contactEmail?: string;
  phone?: string;
  commissionRate: number;
  contractStart?: string;
  contractEnd?: string;
};

const EMPTY_FORM = {
  stageName: "", legalName: "", contactEmail: "", phone: "",
  commissionRate: 20, contractStart: "", contractEnd: "", bio: "",
};

export function ArtistsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const canWrite = user?.role === "admin" || user?.role === "manager";

  const navigate = useNavigate();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Artist | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    const timeout = setTimeout(() => {
      setError("Request is taking too long. Please refresh if this persists.");
      setLoading(false);
    }, 20000);

    fetchArtists()
      .then((data) => {
        setArtists(data as Artist[]);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load artists");
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (a: Artist) => {
    setEditing(a);
    setForm({
      stageName: a.stageName,
      legalName: a.legalName ?? "",
      contactEmail: a.contactEmail ?? "",
      phone: a.phone ?? "",
      commissionRate: a.commissionRate,
      contractStart: a.contractStart ?? "",
      contractEnd: a.contractEnd ?? "",
      bio: "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        stageName: form.stageName,
        legalName: form.legalName || undefined,
        contactEmail: form.contactEmail || undefined,
        phone: form.phone || undefined,
        commissionRate: Number(form.commissionRate),
        contractStart: form.contractStart || undefined,
        contractEnd: form.contractEnd || undefined,
        bio: form.bio || undefined,
      };
      if (editing) {
        await updateArtist(editing.artistId, payload);
      } else {
        await createArtist(payload);
      }
      setShowModal(false);
      load();
    } catch {
      setError("Failed to save artist");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this artist? This cannot be undone.")) return;
    await deleteArtist(id);
    load();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Artists</h2>
        {canWrite && (
          <button onClick={openCreate}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            + Add Artist
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Stage Name</th>
                <th className="px-4 py-3">Legal Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Contract End</th>
                {canWrite && <th className="px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {artists.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No artists yet. Add your first artist!</td></tr>
              )}
              {artists.map((a) => (
                <tr key={a.artistId} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/artists/${a.artistId}`)}>
                  <td className="px-4 py-3 font-medium">{a.stageName}</td>
                  <td className="px-4 py-3 text-slate-600">{a.legalName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.contactEmail ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.phone ?? "—"}</td>
                  <td className="px-4 py-3">{a.commissionRate}%</td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.contractEnd ? (
                      <span className={isExpiringSoon(a.contractEnd) ? "text-amber-600 font-medium" : ""}>
                        {a.contractEnd}
                      </span>
                    ) : "—"}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(a); }}
                          className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Edit</button>
                        {isAdmin && (
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(a.artistId); }}
                            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">{editing ? "Edit Artist" : "Add Artist"}</h3>
            <div className="space-y-3">
              <Field label="Stage Name *" value={form.stageName}
                onChange={(v) => setForm({ ...form, stageName: v })} />
              <Field label="Legal Name" value={form.legalName}
                onChange={(v) => setForm({ ...form, legalName: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" type="email" value={form.contactEmail}
                  onChange={(v) => setForm({ ...form, contactEmail: v })} />
                <Field label="Phone" value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })} />
              </div>
              <Field label="Commission Rate (%)" type="number" value={String(form.commissionRate)}
                onChange={(v) => setForm({ ...form, commissionRate: Number(v) })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contract Start" type="date" value={form.contractStart}
                  onChange={(v) => setForm({ ...form, contractStart: v })} />
                <Field label="Contract End" type="date" value={form.contractEnd}
                  onChange={(v) => setForm({ ...form, contractEnd: v })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Bio</label>
                <textarea value={form.bio} rows={3}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)}
                className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.stageName}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                {saving ? "Saving…" : editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
    </div>
  );
}

function isExpiringSoon(dateStr: string): boolean {
  const d = new Date(dateStr);
  const diff = d.getTime() - Date.now();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000; // within 30 days
}
