const nodes = [
  { id: "topic", x: 90, y: 10, t: "Your topic" },
  { id: "board", x: 90, y: 80, t: "AI drafts the Board" },
  { id: "steps", x: 90, y: 150, t: "Steps + script" },
  { id: "present", x: 0, y: 225, t: "Present on camera" },
  { id: "narrate", x: 180, y: 225, t: "Narrate" },
  { id: "share", x: 90, y: 300, t: "Share link" },
];
const paths = [
  "M160 48V80", "M160 118V150", "M160 188V206Q160 214 140 214H90Q70 214 70 225",
  "M160 206Q160 214 180 214H230Q250 214 250 225", "M70 263Q70 290 110 290H120Q160 290 160 300",
  "M250 263Q250 290 210 290H200Q160 290 160 300",
];

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
        <div className="tile p-4 sm:p-6">
          <svg viewBox="0 0 320 350" className="mx-auto w-full max-w-sm" aria-hidden>
            {paths.map((d) => (
              <path key={d} d={d} fill="none" stroke="var(--flow)" strokeWidth="2.5" strokeLinecap="round" className="flowing" />
            ))}
            {nodes.map((n) => (
              <g key={n.id}>
                <rect x={n.x} y={n.y} width={140} height={38} rx={12} fill="var(--sky-50)" stroke="var(--line)" strokeWidth="1.5" />
                <circle cx={n.x + 16} cy={n.y + 19} r={5} fill="var(--flow)" />
                <text x={n.x + 28} y={n.y + 23} fontSize="10.5" fontWeight="700" fill="var(--ink)">{n.t}</text>
              </g>
            ))}
          </svg>
          <p className="sr-only">Flow: your topic leads to an AI-drafted Board, then Steps and a script. From there you either present on camera or narrate, and both lead to a share link.</p>
        </div>
      </div>
    </section>
  );
}
