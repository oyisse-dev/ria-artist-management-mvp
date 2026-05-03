import { FormEvent, useEffect, useState } from "react";
import { Button, EmptyState, ErrorState, Field, formatCurrency, Input, LoadingState, PageHeader, Panel, Select, StatusPill, Textarea } from "../components/ui";
import { createBooking, listArtists, listBookings, listProjects, updateBooking } from "../lib/api";
import type { BookingWithJoins, ProjectWithArtist } from "../lib/api";
import type { Artist } from "../lib/database.types";

export function BookingsPage() {
  const [bookings, setBookings] = useState<BookingWithJoins[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [projects, setProjects] = useState<ProjectWithArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [bookingRows, artistRows, projectRows] = await Promise.all([listBookings(), listArtists(), listProjects()]);
      setBookings(bookingRows);
      setArtists(artistRows);
      setProjects(projectRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bookings failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  return (
    <section>
      <PageHeader title="Bookings" eyebrow="Events and riders" />
      <Panel className="mb-5"><BookingForm artists={artists} projects={projects} reload={load} /></Panel>
      <div className="grid gap-3">
        {bookings.map((booking) => (
          <Panel key={booking.id}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-semibold">{booking.event_name}</p>
                <p className="text-sm text-slate-500">{booking.artist?.stage_name} · {booking.venue ?? "Venue TBC"} · {booking.date}</p>
                <p className="mt-1 text-sm text-slate-600">Fee {formatCurrency(booking.fee)} · Deposit {formatCurrency(booking.deposit)} · Balance {formatCurrency(booking.balance)}</p>
              </div>
              <div className="flex gap-2">
                <StatusPill>{booking.status}</StatusPill>
                {["inquiry","confirmed","completed","cancelled"].map((status) => <Button key={status} variant="secondary" onClick={async () => { await updateBooking(booking.id, { status }); await load(); }}>{status}</Button>)}
              </div>
            </div>
          </Panel>
        ))}
        {bookings.length === 0 && <EmptyState>No bookings yet.</EmptyState>}
      </div>
    </section>
  );
}

function BookingForm({ artists, projects, reload }: { artists: Artist[]; projects: ProjectWithArtist[]; reload: () => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const riderText = String(form.get("rider") || "{}");
    let rider: Record<string, unknown> = {};
    try { rider = JSON.parse(riderText); } catch { rider = { notes: riderText }; }
    await createBooking({
      artist_id: String(form.get("artist_id")),
      project_id: String(form.get("project_id") || "") || null,
      event_name: String(form.get("event_name")),
      venue: String(form.get("venue") || ""),
      date: String(form.get("date")),
      fee: Number(form.get("fee") || 0),
      deposit: Number(form.get("deposit") || 0),
      promoter_name: String(form.get("promoter_name") || ""),
      promoter_contact: String(form.get("promoter_contact") || ""),
      rider: rider as unknown as import("../lib/database.types").Json,
      notes: String(form.get("notes") || "")
    });
    event.currentTarget.reset();
    await reload();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
      <Field label="Artist"><Select name="artist_id" required>{artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name}</option>)}</Select></Field>
      <Field label="Project"><Select name="project_id"><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</Select></Field>
      <Field label="Event"><Input name="event_name" required /></Field>
      <Field label="Venue"><Input name="venue" /></Field>
      <Field label="Date"><Input name="date" type="date" required /></Field>
      <Field label="Fee"><Input name="fee" type="number" /></Field>
      <Field label="Deposit"><Input name="deposit" type="number" /></Field>
      <Field label="Promoter"><Input name="promoter_name" /></Field>
      <Field label="Promoter Contact"><Input name="promoter_contact" /></Field>
      <Field label="Rider JSON"><Textarea name="rider" defaultValue={'{"technical":"","hospitality":""}'} /></Field>
      <Field label="Notes"><Textarea name="notes" /></Field>
      <div className="flex items-end"><Button>Create Booking</Button></div>
    </form>
  );
}
