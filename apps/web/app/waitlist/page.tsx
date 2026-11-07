import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WaitlistForm } from "@/components/WaitlistForm";
import { WaitlistHero } from "@/components/WaitlistHero";
import { BoardsScene } from "@/components/BoardsScene";

export const metadata: Metadata = {
  title: "Flowcam Pro waitlist",
  description: "Flowcam Pro is coming: share links with Remix, Sync, 4K export and AI. Get one email the day it launches.",
  alternates: { canonical: "/waitlist" },
};

export default function WaitlistPage() {
  return (
    <>
      <BoardsScene />
      <Nav />
      <main className="page-gutter grid min-h-[calc(100svh-4rem)] place-items-center py-16 sm:py-24">
        <div className="container-page w-full">
          <WaitlistHero form={<WaitlistForm source="waitlist" />} />
        </div>
      </main>
      <Footer />
    </>
  );
}
