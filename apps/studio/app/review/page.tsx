import type { Metadata } from "next";
import Review from "@/modules/editing/Review";

export const metadata: Metadata = {
  title: "Review · Flowcam Studio",
};

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const { recording, edit } = await searchParams;
  if (typeof recording !== "string") return <main style={{ padding: 32 }}>No Recording chosen.</main>;
  return <Review recordingId={recording} edit={edit === "1"} />;
}
