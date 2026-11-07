import Link from "next/link";
import { STUDIO_URL } from "@/lib/site";
import { WaitlistForm } from "./WaitlistForm";

export function ClosingCta() {
  return (
    <section className="page-gutter py-16 sm:py-24">
      <div className="container-page">
        <div id="waitlist" className="scroll-mt-24 rounded-[2rem] border border-line bg-gradient-to-b from-sky-100 to-sky-200 px-6 py-14 text-center sm:px-12">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold text-ink sm:text-5xl">Make your first video today</h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-soft">
            Flowcam is free in your browser. Want Pro? Get one email the day it launches, with the Founding Price: $17/month, locked in for as long as you stay subscribed.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={STUDIO_URL} className="btn-green">Try Flowcam free</a>
            <Link href="/waitlist" className="btn-ghost">See the Pro countdown</Link>
          </div>
          <div className="mx-auto mt-8 flex max-w-md justify-center">
            <WaitlistForm source="home" />
          </div>
        </div>
      </div>
    </section>
  );
}
