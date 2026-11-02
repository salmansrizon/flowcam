import type { Presentation } from "@flowcam/domain";
import { TEMPLATES, templateBoard } from "../authoring/templates";
import { listPresentations } from "../presentation/store";

const KEY = "flowcam.onboarding";
// "card": sample made, call to action showing. "choose": visitor moved on, offer Start from. "done": finished or skipped.
export type OnboardingState = "card" | "choose" | "done";

export function getState(): OnboardingState | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "card" || v === "choose" || v === "done" ? v : null;
  } catch {
    return null;
  }
}
const listeners = new Set<() => void>();
export const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export function setState(s: OnboardingState) {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* private mode: onboarding just repeats */
  }
  listeners.forEach((l) => l());
}

/** Builds a Presentation from a Template (titled with its name). */
export function fromTemplate(templateId: string): Presentation | null {
  const t = TEMPLATES.find((x) => x.id === templateId);
  return t ? { version: 1, id: crypto.randomUUID(), title: t.name, themeId: "paper", boards: [templateBoard(t)] } : null;
}

/** A sample Presentation for a first visit (no local Presentations and onboarding not finished), else null. */
export async function firstVisitSample(): Promise<Presentation | null> {
  if (getState() === "done" || (await listPresentations()).length > 0) return null;
  const sample = fromTemplate(TEMPLATES[0].id);
  if (!sample) return null;
  setState("card");
  return { ...sample, title: "Welcome to Flowcam: your first Presentation" };
}
