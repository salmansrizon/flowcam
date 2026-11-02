"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BOARD_HEIGHT, BOARD_WIDTH, boardView, parsePresentation, themeById, type Presentation } from "@flowcam/domain";
import { boardRenderer } from "@flowcam/renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { writeLocal } from "../presentation/local";

type Unlocked = { url: string; presentation: Presentation };

/** Read-only Board viewer: the Board with Steps shown one by one. Images from the owner's device are not available here. */
function BoardViewer({ p }: { p: Presentation }) {
  const [b, setB] = useState(0);
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLCanvasElement>(null);
  const board = p.boards[b];
  useEffect(() => {
    const c = ref.current;
    if (!c || !board) return;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(c.width / BOARD_WIDTH, 0, 0, c.width / BOARD_WIDTH, 0, 0);
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    boardRenderer.render(ctx, board, boardView(board, Array(step).fill(-Infinity)), 0, { theme: themeById(p.themeId), images: new Map() });
  }, [board, step, p.themeId]);
  if (!board) return null;
  const go = (nb: number, ns: number) => (setB(nb), setStep(ns));
  const prev = () => (step > 0 ? go(b, step - 1) : b > 0 && go(b - 1, p.boards[b - 1].steps.length));
  const next = () => (step < board.steps.length ? go(b, step + 1) : b < p.boards.length - 1 && go(b + 1, 0));
  return (
    <div className="grid gap-2">
      <canvas ref={ref} width={960} height={Math.round((960 * BOARD_HEIGHT) / BOARD_WIDTH)} aria-label="Board" className="w-full rounded-lg border bg-white" />
      <div className="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" onClick={prev}>Previous</Button>
        <Button size="sm" variant="outline" onClick={next}>Next</Button>
        <span className="text-muted-foreground">Board {b + 1} of {p.boards.length} · Step {step} of {board.steps.length}</span>
      </div>
    </div>
  );
}

/** The public share page body. The video URL and Presentation arrive only from the unlock route. */
export default function SharePage({ id, title, locked, views }: { id: string; title: string; locked: boolean; views: number }) {
  const router = useRouter();
  const [data, setData] = useState<Unlocked | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showBoard, setShowBoard] = useState(false);

  async function unlock(pw?: string) {
    const res = await fetch(`/api/share/${id}/unlock`, { method: "POST", body: JSON.stringify({ password: pw }) });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Could not open this video.");
    setError(null);
    setData({ url: json.url, presentation: parsePresentation(json.presentation) });
  }

  useEffect(() => {
    try {
      const key = `flowcam.viewed.${id}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        void fetch(`/api/share/${id}/view`, { method: "POST" });
      }
    } catch {
      /* storage blocked: count it anyway */
      void fetch(`/api/share/${id}/view`, { method: "POST" });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- unlock sets state only after its fetch
    if (!locked) void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, locked]);

  async function remix() {
    if (!data) return;
    await writeLocal({ ...data.presentation, id: crypto.randomUUID() });
    router.push("/");
  }

  return (
    <main className="mx-auto grid max-w-3xl gap-4 p-4 sm:p-8">
      <h1 className="text-xl font-semibold">{title}</h1>
      {!data && locked && (
        <form className="flex max-w-sm gap-2" onSubmit={(e) => (e.preventDefault(), void unlock(password))}>
          <Input type="password" aria-label="Password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit">Watch</Button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {data && (
        <>
          <video src={data.url} controls aria-label="Shared video" className="w-full rounded-lg bg-black" />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setShowBoard((s) => !s)}>Open Board</Button>
            <Button onClick={() => void remix()}>Remix</Button>
            <span className="text-sm text-muted-foreground">{views} views</span>
          </div>
          {showBoard && <BoardViewer p={data.presentation} />}
        </>
      )}
    </main>
  );
}
