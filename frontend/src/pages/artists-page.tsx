import { useEffect, useState } from "react";
import { fetchArtists } from "../lib/api";

export function ArtistsPage() {
  const [artists, setArtists] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetchArtists().then(setArtists).catch(() => setArtists([]));
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Artists</h2>
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-4 py-3">Stage Name</th>
              <th className="px-4 py-3">Legal Name</th>
              <th className="px-4 py-3">Commission</th>
            </tr>
          </thead>
          <tbody>
            {artists.map((artist) => (
              <tr key={String(artist.artistId)} className="border-t">
                <td className="px-4 py-3">{String(artist.stageName ?? "")}</td>
                <td className="px-4 py-3">{String(artist.legalName ?? "-")}</td>
                <td className="px-4 py-3">{String(artist.commissionRate ?? 0)}%</td>
              </tr>
            ))}
            {artists.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={3}>
                  No artists found yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
