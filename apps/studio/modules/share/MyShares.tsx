"use client";

import { useCallback, useEffect, useState } from "react";
import { TopBar } from "@/components/studio/TopBar";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/client";

type Row = { id: string; title: string; created_at: string; views: number; status: string; password_hash?: never };

/** The owner's Share Links, read through row-level security (owners select their own). */
export default function MyShares() {
  const [rows, setRows] = useState<Row[] | "out" | null>(null);
  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    if (!(await sb.auth.getUser()).data.user) return setRows("out");
    const { data } = await sb.from("share_links").select("id,title,created_at,views,status").is("deleted_at", null).order("created_at", { ascending: false });
    setRows((data as Row[]) ?? []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sets state only after awaiting the fetch
  useEffect(() => void load(), [load]);

  const link = (id: string) => `${location.origin}/s/${id}`;
  async function setPassword(id: string) {
    const pw = prompt("New password (leave empty to remove it)");
    if (pw === null) return;
    await fetch(`/api/share/${id}`, { method: "PATCH", body: JSON.stringify({ password: pw }) });
  }
  async function remove(id: string) {
    if (!confirm("Delete this Share Link? The video is removed.")) return;
    await fetch(`/api/share/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <TopBar>
        <h1 className="text-sm font-medium">My Share Links</h1>
      </TopBar>
      <div className="mx-auto grid w-full max-w-3xl gap-3 p-4">
        {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {rows === "out" && <p>Sign in to see your Share Links.</p>}
        {Array.isArray(rows) && rows.length === 0 && <p className="text-sm text-muted-foreground">No Share Links yet. Share from the Export screen.</p>}
        {Array.isArray(rows) &&
          rows.map((r) => (
            <div key={r.id} data-testid="share-row" className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <a href={`/s/${r.id}`} className="block truncate font-medium hover:underline">{r.title}</a>
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()} · <span data-testid="views">{r.views}</span> views · {r.status}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(link(r.id))}>Copy link</Button>
              <Button size="sm" variant="outline" onClick={() => void setPassword(r.id)}>Password</Button>
              <Button size="sm" variant="outline" onClick={() => void remove(r.id)}>Delete</Button>
            </div>
          ))}
      </div>
    </main>
  );
}
