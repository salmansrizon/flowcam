"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BOARD_WIDTH, boardView, themeById, type Presentation } from "@flowcam/domain";
import { boardRenderer } from "@flowcam/renderer";
import { Copy, Download, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { TopBar } from "@/components/studio/TopBar";
import { Panel } from "@/components/studio/Panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/client";
import { TEMPLATES, templateBoard } from "../authoring/templates";
import { decodeImages, imageIdsOf } from "../presentation/assets";
import { deletePresentation, listPresentations, newPresentation, savePresentation, type LocalEntry } from "../presentation/store";
import { readLocalById, setCurrent, writeLocal, writeMeta } from "../presentation/local";
import { digest, downloadImages } from "../sync/sync";
import { cloudOnly, copyTitle, type CloudEntry } from "./list";

type Cloud = { sb: ReturnType<typeof supabaseBrowser>; uid: string; rows: CloudEntry[] };

/** The user's own cloud Presentations when signed in as Pro; null otherwise (RLS limits rows to the owner). */
async function loadCloud(): Promise<Cloud | null> {
  try {
    const sb = supabaseBrowser();
    const uid = (await sb.auth.getSession()).data.session?.user.id;
    if (!uid) return null;
    // The database's own Pro rule (is_pro), so the library and Sync cannot disagree.
    const { data: pro } = await sb.rpc("is_pro");
    if (pro !== true) return null;
    const { data, error } = await sb.from("presentations").select("id,version,data,updated_at").is("deleted_at", null);
    if (error) return null;
    return { sb, uid, rows: data.map((r) => ({ id: r.id, version: r.version, updatedAt: r.updated_at, data: r.data as Presentation })) };
  } catch {
    return null; // offline or signed out: the library is still fully usable locally
  }
}

/** A live drawing of the first Board, made with the same renderer as the editor. */
function Thumb({ p }: { p: Presentation }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const board = p.boards[0];
    decodeImages(imageIdsOf(p)).then((images) => {
      const c = ref.current;
      if (!live || !c || !board) return;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(c.width / BOARD_WIDTH, 0, 0, c.width / BOARD_WIDTH, 0, 0);
      const revealedAt = new Map(board.elements.map((e) => [e.id, -Infinity]));
      boardRenderer.render(ctx, board, { ...boardView(board, []), revealedAt }, 0, { theme: themeById(p.themeId), images });
    });
    return () => void (live = false);
  }, [p]);
  return <canvas ref={ref} width={320} height={180} aria-hidden className="block aspect-video w-full rounded-md border" />;
}

const when = (ms: number) => new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function Library() {
  const router = useRouter();
  const [entries, setEntries] = useState<LocalEntry[] | null>(null);
  const [pres, setPres] = useState<Record<string, Presentation>>({});
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<LocalEntry | null>(null);

  const refresh = useCallback(
    () =>
      listPresentations().then(async (list) => {
        const loaded = await Promise.all(list.map((e) => readLocalById(e.id)));
        setPres(Object.fromEntries(loaded.flatMap((p) => (p ? [[p.id, p]] : []))));
        setEntries(list);
      }),
    [],
  );

  useEffect(() => {
    refresh().catch((e) => setError(`Could not read your Presentations: ${e.message}`));
    loadCloud().then(setCloud);
  }, [refresh]);

  const run = (f: () => Promise<void>) => f().then(refresh).catch((e) => setError(e.message));
  const cloudVersion = (id: string) => cloud?.rows.find((r) => r.id === id)?.version;

  async function create(p: Presentation) {
    await savePresentation(p); // becomes the open one
    router.push("/");
  }
  const open = async (id: string) => {
    await setCurrent(id);
    router.push("/");
  };
  async function rename(id: string, title: string) {
    setRenaming(null);
    const p = pres[id];
    if (!p || !title.trim() || title.trim() === p.title) return;
    await writeLocal({ ...p, title: title.trim() }, { makeCurrent: false });
    // Tell Sync the cloud copy is behind; opening the Presentation pushes it.
    const v = cloudVersion(id);
    if (v !== undefined) await writeMeta({ id, baseVersion: v, dirty: true });
  }
  const duplicate = async (id: string) => {
    const p = pres[id];
    if (p) await writeLocal({ ...p, id: crypto.randomUUID(), title: copyTitle(p.title) }, { makeCurrent: false });
  };
  async function remove(id: string) {
    setToDelete(null);
    await deletePresentation(id);
    if (cloud && cloudVersion(id) !== undefined) {
      const { error } = await cloud.sb.rpc("delete_presentation", { p_id: id });
      if (error) throw new Error(`Deleted here, but not from the cloud: ${error.message}`);
      setCloud({ ...cloud, rows: cloud.rows.filter((r) => r.id !== id) });
    }
  }
  async function download(c: CloudEntry) {
    await downloadImages(cloud!, c.data);
    await writeLocal(c.data, { makeCurrent: false });
    await writeMeta({ id: c.id, baseVersion: c.version, dirty: false, hash: await digest(c.data) });
  }

  const remote = cloudOnly(cloud?.rows ?? [], entries?.map((e) => e.id) ?? []);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm"><Plus /> New</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => run(() => create(newPresentation()))}>Blank</DropdownMenuItem>
              {TEMPLATES.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => run(() => create({ ...newPresentation(), title: t.name, boards: [templateBoard(t)] }))}>
                  {t.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <h1 className="text-sm font-medium">Presentations</h1>
      </TopBar>
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {entries?.length === 0 && remote.length === 0 && (
          <Panel className="p-8 text-center">
            <p className="font-medium">No Presentations yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Start with a blank Board or a Template, using New above.</p>
          </Panel>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Presentations">
          {entries?.map((e) => (
            <li key={e.id} data-testid="presentation-card">
              <Panel className="space-y-3 p-3">
                {pres[e.id] ? <Thumb p={pres[e.id]} /> : <div className="aspect-video rounded-md border bg-muted" />}
                <div className="min-w-0">
                  {renaming === e.id ? (
                    <Input
                      autoFocus
                      aria-label="Rename Presentation"
                      defaultValue={e.title}
                      onBlur={(ev) => run(() => rename(e.id, ev.target.value))}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") ev.currentTarget.blur();
                        if (ev.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <h2 className="truncate font-medium">{e.title}</h2>
                  )}
                  <p className="text-xs text-muted-foreground">Edited {when(e.updatedAt)}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" onClick={() => run(() => open(e.id))}><FolderOpen /> Open</Button>
                  <Button size="sm" variant="outline" onClick={() => setRenaming(e.id)}><Pencil /> Rename</Button>
                  <Button size="sm" variant="outline" onClick={() => run(() => duplicate(e.id))}><Copy /> Duplicate</Button>
                  <Button size="sm" variant="outline" onClick={() => setToDelete(e)}><Trash2 /> Delete</Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
        {remote.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">In your cloud, not on this device</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {remote.map((c) => (
                <li key={c.id} data-testid="cloud-card">
                  <Panel className="space-y-3 p-3">
                    <Thumb p={c.data} />
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{c.data.title}</h3>
                      <p className="text-xs text-muted-foreground">Edited {when(Date.parse(c.updatedAt))}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => run(() => download(c))}><Download /> Download</Button>
                  </Panel>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this Presentation?</DialogTitle>
            <DialogDescription>
              “{toDelete?.title}” will be removed from this device{toDelete && cloudVersion(toDelete.id) !== undefined ? " and from your cloud" : ""}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => toDelete && run(() => remove(toDelete.id))}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
