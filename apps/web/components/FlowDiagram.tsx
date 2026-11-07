import Link from "next/link";
import { ProductShot } from "./ProductShot";

export function FlowDiagram() {
  return (
    <section className="page-gutter py-16 sm:py-24">
      <div className="container-page grid items-center gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">From a topic to a finished video</h2>
          <p className="mt-5 text-ink-soft">Type a topic and Flowcam drafts a Board, splits it into Steps and writes a script for each one. You edit anything you like.</p>
          <p className="mt-3 text-ink-soft">Then present it on camera or narrate it, and send a share link when you are done.</p>
          <Link href="/waitlist" className="btn-green mt-7">Get notified for Pro</Link>
        </div>
        <ProductShot src="/product/review.jpg" alt="The Review screen: the finished video on a gradient background, ready to export" />
      </div>
    </section>
  );
}
