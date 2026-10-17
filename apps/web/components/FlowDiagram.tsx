import { FlowDiagramArt } from "./FlowDiagramArt";

export function FlowDiagram() {
  return (
    <section className="page-gutter py-16 sm:py-24">
      <div className="container-page grid items-center gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">From a topic to a finished video</h2>
          <p className="mt-5 text-ink-soft">Type a topic and Flowcam drafts a Board, splits it into Steps and writes a script for each one. You edit anything you like.</p>
          <p className="mt-3 text-ink-soft">Then present it on camera or narrate it, and send a share link when you are done.</p>
          <a href="#waitlist" className="btn-green mt-7">Join the waitlist</a>
        </div>
        <div className="tile tile-hover p-4 sm:p-6">
          <FlowDiagramArt />
          <p className="sr-only">Flow: your topic leads to an AI-drafted Board, then Steps and a script. From there you either present on camera or narrate, and both lead to a share link.</p>
        </div>
      </div>
    </section>
  );
}
