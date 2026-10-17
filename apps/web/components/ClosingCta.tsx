import { WaitlistForm } from "./WaitlistForm";

export function ClosingCta() {
  return (
    <section className="page-gutter py-16 sm:py-24">
      <div className="container-page">
        <div className="rounded-[2rem] border border-line bg-gradient-to-b from-sky-100 to-sky-200 px-6 py-14 text-center sm:px-12">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold text-ink sm:text-5xl">Be first to make videos with Flowcam</h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-soft">
            Join the waitlist and get the Founding Price: Pro at $17/month, locked in for as long as you stay subscribed.
          </p>
          <div className="mx-auto mt-8 flex max-w-md justify-center">
            <WaitlistForm source="home" />
          </div>
        </div>
      </div>
    </section>
  );
}
