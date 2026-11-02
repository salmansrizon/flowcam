"use client";

import { useState, useSyncExternalStore } from "react";
import type { Presentation } from "@flowcam/domain";
import { X } from "lucide-react";
import { TEMPLATES } from "../authoring/templates";
import { newPresentation } from "../presentation/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fromTemplate, getState, setState, subscribe } from "./sample";

/** The first-visit "Try presenting" card and, once the visitor has moved on, the "Start from" choice. */
export function FirstVisit({ onPick }: { onPick: (p: Presentation) => void }) {
  const state = useSyncExternalStore(subscribe, getState, () => null); // localStorage, so null during server render
  const [templates, setTemplates] = useState(false);
  const to = setState;
  const pick = (p: Presentation) => {
    to("done");
    onPick(p);
  };

  return (
    <>
      {state === "card" && (
        <aside aria-label="First Presentation" className="fixed bottom-20left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-xl border bg-background p-4 shadow-lg">
          <div>
            <p className="font-medium">Your first Presentation is ready</p>
            <p className="text-sm text-muted-foreground">Present it and see how Flowcam reveals each Step.</p>
          </div>
          <Button asChild onClick={() => setState("choose")}>
            <a href="/record">Try presenting</a>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => to("choose")}><X /></Button>
        </aside>
      )}
      <Dialog open={state === "choose"} onOpenChange={(o) => !o && to("done")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start from</DialogTitle>
            <DialogDescription>Pick a starting point for your next Presentation.</DialogDescription>
          </DialogHeader>
          {templates ? (
            <div className="grid max-h-72 gap-2 overflow-y-auto">
              {TEMPLATES.map((t) => (
                <Button key={t.id} variant="outline" className="justify-start" onClick={() => pick(fromTemplate(t.id)!)}>{t.name}</Button>
              ))}
            </div>
          ) : (
            <div className="grid gap-2">
              <Button variant="outline" onClick={() => setTemplates(true)}>Template</Button>
              <Button variant="outline" disabled>Generate from a topic <span className="text-xs text-muted-foreground">Coming soon: needs AI Credits</span></Button>
              <Button variant="outline" onClick={() => pick(newPresentation())}>Blank</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
