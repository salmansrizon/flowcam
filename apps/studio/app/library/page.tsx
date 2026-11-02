import type { Metadata } from "next";
import Library from "@/modules/library/Library";

export const metadata: Metadata = { title: "Presentations · Flowcam Studio" };

export default function LibraryPage() {
  return <Library />;
}
