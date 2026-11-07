import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Flowcam's waitlist collects, why, and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="page-gutter py-16 sm:py-24">
        <article className="container-page max-w-2xl space-y-6 text-ink-soft">
          <h1 className="text-4xl font-extrabold text-ink sm:text-5xl">Privacy</h1>
          <p>This page covers the Flowcam waitlist on this website. It was last updated on 7 November 2026.</p>
          <h2 className="text-2xl font-bold text-ink">What we collect</h2>
          <p>When you join the waitlist we store your email address, the page you joined from, the time you joined, and that you agreed to be emailed. Nothing else.</p>
          <h2 className="text-2xl font-bold text-ink">Why</h2>
          <p>Only to email you when Flowcam Pro launches. We send that email once and record when we sent it, so you never get it twice.</p>
          <h2 className="text-2xl font-bold text-ink">Where it is kept</h2>
          <p>In our database hosted by Supabase. We never sell your email or share it with anyone else. The launch email is sent through an email delivery service that sees only your address.</p>
          <h2 className="text-2xl font-bold text-ink">The Studio</h2>
          <p>The free Studio keeps your Presentations and recordings on your own device. They are not uploaded to us.</p>
          <h2 className="text-2xl font-bold text-ink">Deleting your email</h2>
          <p>
            Email <a href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20waitlist%20email`} className="font-bold text-green underline-offset-4 hover:underline">{CONTACT_EMAIL}</a> from
            the address you signed up with, and we will delete it. Every launch email will also include an unsubscribe link.
          </p>
        </article>
      </main>
      <Footer />
    </>
  );
}
