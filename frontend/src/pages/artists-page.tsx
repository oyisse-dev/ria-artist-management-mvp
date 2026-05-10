import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Panel } from "../components/ui";
import { createArtist, getErrorMessage, listArtists } from "../lib/api";
import type { Artist } from "../lib/database.types";

export function ArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    listArtists().then(setArtists).catch((err) => setError(getErrorMessage(err, "Artists failed to load"))).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <PageHeader title="Artists" eyebrow="Roster" actions={<Button onClick={() => setOpen(!open)}>Add Artist</Button>} />
      {open && <ArtistForm onCreated={(artist) => { setArtists((rows) => [artist, ...rows]); setOpen(false); }} />}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-4 py-3">Stage Name</th>
              <th className="px-4 py-3">Legal Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Commission</th>
              <th className="px-4 py-3">Contract End</th>
            </tr>
          </thead>
          <tbody>
            {artists.map((artist) => (
              <tr key={artist.id} className="border-t border-slate-200">
                <td className="px-4 py-3"><Link className="font-medium text-teal-700" to={`/artists/${artist.id}`}>{artist.stage_name}</Link></td>
                <td className="px-4 py-3">{artist.legal_name ?? "-"}</td>
                <td className="px-4 py-3">{artist.contact_email ?? artist.phone ?? "-"}</td>
                <td className="px-4 py-3">{artist.commission_rate ?? 20}%</td>
                <td className="px-4 py-3">{artist.contract_end ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {artists.length === 0 && <div className="p-4"><EmptyState>No artists found.</EmptyState></div>}
      </div>
    </section>
  );
}

function ArtistForm({ onCreated }: { onCreated: (artist: Artist) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const artist = await createArtist({
        stage_name: String(form.get("stage_name") || ""),
        legal_name: String(form.get("legal_name") || ""),
        contact_email: String(form.get("contact_email") || ""),
        phone: String(form.get("phone") || ""),
        commission_rate: Number(form.get("commission_rate") || 20),
        contract_start: String(form.get("contract_start") || "") || null,
        contract_end: String(form.get("contract_end") || "") || null
      });
      onCreated(artist);
    } catch (err) {
      setError(getErrorMessage(err, "Could not create artist"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel className="mb-5">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-3">
        <Field label="Stage Name"><Input name="stage_name" required /></Field>
        <Field label="Legal Name"><Input name="legal_name" /></Field>
        <Field label="Email"><Input name="contact_email" type="email" /></Field>
        <Field label="Phone"><Input name="phone" /></Field>
        <Field label="Commission %"><Input name="commission_rate" type="number" defaultValue={20} /></Field>
        <Field label="Contract Start"><Input name="contract_start" type="date" /></Field>
        <Field label="Contract End"><Input name="contract_end" type="date" /></Field>
        {error && <p className="text-sm text-red-700 md:col-span-3">{error}</p>}
        <div className="flex items-end md:col-span-3"><Button disabled={saving}>{saving ? "Saving..." : "Save Artist"}</Button></div>
      </form>
    </Panel>
  );
}
