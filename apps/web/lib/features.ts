// Single source of truth for feature copy: the home page, the feature grid and
// every /features/[slug] page read from this list.

export type Release = "At launch" | "Soon after launch" | "Desktop apps";

export type Feature = {
  slug: string;
  title: string; // short name, used in cards and nav
  headline: string; // one-line promise for the feature page hero
  summary: string; // one or two sentences for cards
  points: { title: string; body: string }[]; // 3-4 specifics for the feature page
  bestFor: string;
  release: Release;
};

export const features: Feature[] = [
  {
    slug: "step-by-step-presentations",
    title: "Step-by-step Presentations",
    headline: "Your diagram builds itself, one click at a time",
    summary:
      "Draw a hand-drawn Board and Flowcam turns it into Steps: each click reveals, draws on or highlights the next part while you talk.",
    points: [
      { title: "Steps from your drawing", body: "Every shape becomes a Step in the order you drew it. Reorder, merge or change the effect in the Steps panel." },
      { title: "Reveal, draw-on, morph, highlight", body: "Arrows draw themselves on, boxes appear, layouts morph, and Focus zooms into the part you're explaining." },
      { title: "A deck of Boards", body: "Group Boards into a Presentation with transitions between them, like slides that move." },
    ],
    bestFor: "Lessons, system design walkthroughs, explainers",
    release: "At launch",
  },
  {
    slug: "animated-flows",
    title: "Animated flows",
    headline: "Arrows that show data moving",
    summary:
      "Switch on a Flow and comets, pulses or dashed streams travel along an arrow, so viewers see how things connect.",
    points: [
      { title: "Static or flowing, per arrow", body: "Keep an arrow still or let it flow. Steps can switch Flows on at the right moment." },
      { title: "Hand-drawn look", body: "Sketchy shapes, handwritten fonts and Themes that change the whole Presentation in one click." },
      { title: "Bring your own images", body: "Paste, upload or drag in screenshots and photos alongside your drawings." },
    ],
    bestFor: "Architectures, pipelines, processes",
    release: "At launch",
  },
  {
    slug: "teleprompter",
    title: "Presenter View and Teleprompter",
    headline: "Read your script while looking into the lens",
    summary:
      "Your script scrolls right under the webcam and your notes sit beside the Board. None of it appears in the video.",
    points: [
      { title: "Teleprompter by the camera", body: "The current Step's script scrolls just below your webcam, so you keep eye contact." },
      { title: "Only you see the controls", body: "Speaker notes, next-Step preview and timer stay off the recording." },
      { title: "Keyboard first", body: "Arrow keys for Steps, I for ink, Space to pause, R to retake the last clip." },
    ],
    bestFor: "Anyone who wants to look confident on camera",
    release: "At launch",
  },
  {
    slug: "fix-after-recording",
    title: "Fix after recording",
    headline: "Found a typo? Fix it without re-recording",
    summary:
      "Flowcam records your Board as editable shapes, not pixels. Correct a label, retime a Step or change the Theme, then export again.",
    points: [
      { title: "Edit the Board, keep the take", body: "Your voice and camera stay; the corrected Board replays in sync." },
      { title: "Retake one clip", body: "Pause between Steps to start a new clip, and redo only the part that went wrong." },
      { title: "Export at any size", body: "Re-render in 1080p or 4K, light or dark, without recording again." },
    ],
    bestFor: "Perfectionists and busy teachers",
    release: "At launch",
  },
  {
    slug: "camera-layouts",
    title: "Smart camera layouts",
    headline: "Your face, never in the way",
    summary:
      "Show yourself in a bubble, side by side or full screen. The bubble moves away from whatever the current Step reveals.",
    points: [
      { title: "Layouts per Step", body: "Start full screen for the intro, switch to a bubble for the diagram, all set in advance." },
      { title: "Auto-placement", body: "The camera bubble steps aside so it never covers what you're explaining." },
      { title: "Polished frame", body: "Backgrounds, padding, shadows and captions on by default." },
    ],
    bestFor: "Creators who care how the video looks",
    release: "At launch",
  },
  {
    slug: "ai-presentations",
    title: "AI Presentations and scripts",
    headline: "From a topic to a ready-to-present Board",
    summary:
      "Type a topic or paste a document. AI drafts the Board, the order of Steps and a script for each one, ready for you to edit.",
    points: [
      { title: "Generate a Presentation", body: "A hand-drawn Board with Steps already in a sensible order." },
      { title: "Scripts per Step", body: "Draft speaker notes for the Teleprompter, or upload your own script and match it to Steps." },
      { title: "Titles and chapters", body: "Share links get a title, summary and chapters automatically." },
    ],
    bestFor: "Getting from idea to first take fast",
    release: "At launch",
  },
  {
    slug: "narrated-videos",
    title: "Narrated videos",
    headline: "Make a video without presenting live",
    summary:
      "Record your voice one Step at a time while reading the Teleprompter, or let an AI voice read your script. Steps advance on their own.",
    points: [
      { title: "Your voice, Step by Step", body: "Record each Step separately, so every retake is perfect." },
      { title: "Or an AI voice", body: "Pick a voice and Flowcam narrates each Step's script." },
      { title: "Edit one line, not the video", body: "Change a script and only that Step is regenerated." },
    ],
    bestFor: "Camera-shy creators and course builders",
    release: "Soon after launch",
  },
  {
    slug: "share-and-remix",
    title: "Share links and Remix",
    headline: "Share a link viewers can explore",
    summary:
      "Send a link to a polished video with chapters. Viewers can open the Board behind it, zoom in and Remix it into their own Flowcam.",
    points: [
      { title: "Instant share page", body: "Chapters, transcript, embed code, optional password and view notifications." },
      { title: "Open the Board", body: "Viewers can pause and explore the diagram itself, crisp at any zoom." },
      { title: "Remix", body: "Students and teammates copy your Board and build on it." },
    ],
    bestFor: "Teachers sharing lessons, teams sharing designs",
    release: "At launch",
  },
  {
    slug: "vertical-videos",
    title: "Vertical and square exports",
    headline: "One recording, every format",
    summary:
      "Export for YouTube, Shorts, Reels and TikTok. Flowcam re-arranges the Board for tall screens instead of cropping it.",
    points: [
      { title: "9:16 and 1:1", body: "Re-laid-out for the format, with automatic Focus on each Step." },
      { title: "Music and titles", body: "Background music that dips while you talk, plus intro and outro cards from your Theme." },
      { title: "Captions that pop", body: "Animated word-by-word caption styles." },
    ],
    bestFor: "Repurposing lessons into short clips",
    release: "Soon after launch",
  },
  {
    slug: "screen-recording",
    title: "Screen recording",
    headline: "Switch from the diagram to the real thing",
    summary:
      "Record your screen with your camera, then polish it with auto-zoom, smooth cursor and keystroke overlays in the Mac and Windows apps.",
    points: [
      { title: "On the web", body: "Basic screen recording with camera and mic, right in the browser." },
      { title: "Mac and Windows apps", body: "Auto-zoom on clicks, cursor smoothing, keystroke overlays and blurred regions." },
      { title: "Same editor", body: "Trim, layouts and captions work the same as for Boards." },
    ],
    bestFor: "Product demos and code walkthroughs",
    release: "Desktop apps",
  },
];

export const featureBySlug = (slug: string) => features.find((f) => f.slug === slug);
