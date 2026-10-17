const faqs = [
  ["When does Flowcam launch?", "Soon. We have no date yet. Join the waitlist and we will send one email when it opens."],
  ["How much will it cost?", "Free is $0. Pro is $20/month or $200/year, and the Founding Price is $17/month or $170/year, locked in for as long as you stay subscribed. Prices exclude tax."],
  ["What's free?", "The full editor, Steps, Teleprompter, camera layouts and retakes. You can export MP4 up to 1080p with a small \"Made with Flowcam\" watermark, and you get 50 AI Credits once when you sign up."],
  ["Do I need to install anything?", "No. Flowcam starts as a web app, and you can record without an account on the Free plan."],
  ["Is there a Mac or Windows app?", "Yes, later. You will download the apps from this website. They add screen polish such as auto-zoom, cursor smoothing and a keystroke overlay."],
  ["Where are my recordings stored?", "On the Free plan, your recordings stay on your device. Pro adds sync across devices and 100 GB of cloud storage."],
  ["Can I write in Bangla?", "Yes. Boards can be written in Bangla with handwritten-style fonts, as well as English. The interface is in English."],
  ["Can I import Excalidraw files?", "Yes. You can import Excalidraw files into a Board."],
  ["What happens when I join the waitlist?", "You get one launch email, and you can unsubscribe anytime."],
];

export function FAQ() {
  return (
    <section id="faq" className="page-gutter py-16 sm:py-24">
      <div className="container-page max-w-3xl">
        <p className="eyebrow">FAQ</p>
        <h2 className="mt-2 text-3xl font-extrabold text-ink sm:text-4xl">Questions, answered</h2>
        <div className="mt-8 grid gap-3">
          {faqs.map(([q, a]) => (
            <details key={q} className="tile group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-ink [&::-webkit-details-marker]:hidden">
                {q}
                <span aria-hidden="true" className="text-xl text-green transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-ink-soft">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
