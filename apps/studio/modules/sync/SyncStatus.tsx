"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getServerSnapshot, getSnapshot, resolveConflict, subscribe } from "./sync";

const LABEL = { synced: "Saved to cloud", syncing: "Syncing…", offline: "Offline", conflict: "Conflict" } as const;

/** Small Sync status for the editor, plus the dialog shown when a save was refused as stale. Renders nothing when not syncing. */
export default function SyncStatus() {
  const { state, conflict } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (state === "off") return null;

  async function resolve(choice: "keep-both" | "use-cloud") {
    setBusy(true);
    try {
      await resolveConflict(choice);
      location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <span role="status" aria-label="Sync status" className="text-xs text-muted-foreground">{LABEL[state]}</span>
      <Dialog open={state === "conflict" && !!conflict}>
        <DialogContent showCloseButton={false} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>This Presentation changed in the cloud</DialogTitle>
            <DialogDescription>
              Another device saved a newer version while you edited. Nothing has been overwritten. Keep both to save your version as a copy, or use the cloud version and discard your local edits.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => resolve("use-cloud")}>Use the cloud version</Button>
            <Button disabled={busy} onClick={() => resolve("keep-both")}>Keep both</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
