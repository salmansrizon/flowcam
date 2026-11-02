import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShare, isPlayable } from "@/modules/share/links";
import SharePage from "@/modules/share/SharePage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared video · Flowcam", robots: { index: false } };

export default async function Page({ params }: PageProps<"/s/[id]">) {
  const link = await getShare((await params).id);
  if (!link) notFound();
  if (!(await isPlayable(link))) return <main className="p-8 text-center">This video is no longer available.</main>;
  return <SharePage id={link.id} title={link.title} locked={!!link.password_hash} views={link.views} />;
}
