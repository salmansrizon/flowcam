# Flowcam

Flowcam is a studio for explainer creators and online teachers: they build a hand-drawn Presentation, then present it step by step while their face, voice and screen are recorded, and polish the result into a professional video.

## Language

### Presentations and Boards

**Presentation**:
An ordered list of Boards that is authored, presented and recorded as one piece.
_Avoid_: Deck, project, lesson, slideshow

**Board**:
One canvas within a Presentation that a user draws on and presents from.
_Avoid_: Slide, whiteboard, diagram, canvas, scene

**Element**:
Anything placed on a Board: a shape, arrow, text, freehand stroke, sticky note, Image or Video.
_Avoid_: Object, node, item

**Image**:
An Element showing a still picture, either brought in by the user (upload, paste, drag-in or URL) or generated with AI.
_Avoid_: Asset, attachment, media

**Video**:
An Element showing a moving clip, uploaded or generated from a picture with AI, that starts playing when its Step reveals it.
_Avoid_: Media, embed, animation

**Theme**:
A named set of colours, fonts, sketch style and background applied to a whole Presentation at once.
_Avoid_: Style, skin, palette

**Template**:
A ready-made Presentation that a user starts from, such as a lesson, an explainer or a system design walkthrough.
_Avoid_: Starter, preset, example

### Animation

**Flow**:
Continuous, looping motion along an arrow; each arrow either has its Flow on or is static.
_Avoid_: Animation, effect

**Step**:
One discrete, presenter-triggered change to a Board, such as revealing, drawing on, morphing or highlighting Elements, switching a Flow on or off, or a Focus.
_Avoid_: Slide, frame, keyframe, build

**Focus**:
A Step that moves the view to zoom in on part of the current Board, or back out.
_Avoid_: Zoom, camera move, pan

**Sequence**:
The ordered list of Steps belonging to a Board.
_Avoid_: Timeline, script, playlist

**Transition**:
The animated change from one Board to the next in a Presentation.
_Avoid_: Slide change, cut, effect

**Keyframe**:
A fine-tuning point inside a Step (timing, easing or motion path for an Element it changes), edited only after recording.
_Avoid_: Step

### Recording

**Authoring**:
Building a Presentation, its Boards and their Sequences before any Recording starts.
_Avoid_: Editing, designing

**Presenting**:
Delivering a Presentation on camera during a Recording: advancing Steps, pointing, drawing Ink and moving between Boards, without changing the Boards themselves.
_Avoid_: Recording mode, live mode, performing

**Presenter View**:
What the user sees while Presenting: the Board being recorded plus aids only they can see, such as the current Script, the next Step and the Clip timer.
_Avoid_: Speaker view, recording UI

**Teleprompter**:
The strip under the webcam in the Presenter View where the current Script scrolls, so the presenter reads while looking at the lens.
_Avoid_: Autocue, prompter, notes

**Ink**:
A temporary mark drawn while Presenting that fades or clears on the next Step and is never saved to the Board.
_Avoid_: Annotation, pen, drawing

**Recording**:
A complete delivery of a Presentation or a Screen, either Presented or Narrated.
_Avoid_: Video, session, take

**Presented Recording**:
A Recording captured live while the user is Presenting, made of an ordered list of Clips.
_Avoid_: Live recording, manual recording

**Narrated Recording**:
A Recording made without Presenting, in which each Step plays its own Narration and the Steps advance when their Narration ends.
_Avoid_: Auto recording, faceless video, AI video

**Narration**:
The audio for one Step of a Narrated Recording: a Voiceover piece generated from its Script, the user's own voice recorded for that Step, or silence for a set time.
_Avoid_: Voice track, audio clip

**Script**:
The words to be spoken for one Step, typed, generated with AI, or taken from an uploaded document split across Steps.
_Avoid_: Notes, transcript, caption

**Transcript**:
The timed words actually spoken in a Presented Recording, produced on the user's device; a Narrated Recording's Scripts serve as its Transcript.
_Avoid_: Script, captions, subtitles

**Voiceover**:
AI-generated speech made from a Script, one piece per Step; editing a Script regenerates only that Step's piece.
_Avoid_: TTS, narration track, dub

**Voice Patch**:
A short Voiceover inserted on the Timeline to replace a spoken line in a Presented Recording.
_Avoid_: Overdub, fix

**Clip**:
One continuous stretch of capture within a Presented Recording, beginning and ending at a pause; its Tracks and Step timings belong to it alone.
_Avoid_: Segment, take, scene

**Cutaway**:
A full-frame moving clip placed between Clips on the Timeline, interrupting the Visual Source; unlike a Video, it is not on a Board.
_Avoid_: B-roll, insert, stock footage

**Retake**:
Re-recording one Clip so the new capture replaces it, with the Presentation resuming from the Step where that Clip began.
_Avoid_: Redo, re-record

**Source**:
An input a Recording captures: the Presentation, a Screen, a Camera or a Microphone.
_Avoid_: Input, device, feed

**Visual Source**:
The Source that fills the main picture of a Recording, either the Presentation or a Screen; a Recording may hold several Visual Source segments over time.
_Avoid_: Main source, canvas

**Screen**:
A Visual Source captured from the user's computer: a full display, one window or a region.
_Avoid_: Desktop, display capture, screen share

**Screen Polish**:
The desktop-only enhancements to a Screen Track: auto-zoom on clicks, cursor smoothing, keystroke overlay and blurred regions.
_Avoid_: Effects, cinematic mode, studio mode

**Track**:
The captured stream of one Source within a Recording, kept separate so it can be edited after recording.
_Avoid_: Layer, channel, stream

**Layout**:
How the Camera and the Visual Source are arranged in the picture: Camera Bubble, side by side, Camera only or Visual Source only.
_Avoid_: Scene, template, composition

**Camera Bubble**:
The Layout in which the Camera appears as a small framed shape over the Visual Source.
_Avoid_: Facecam overlay, PiP, webcam circle

**Auto-placement**:
Moving the Camera Bubble away from the Elements the current Step changes, so it never covers them.
_Avoid_: Smart bubble, auto-layout

**Timeline**:
The post-recording editing view showing a Recording's Clips in order, with each Step as a block pinned to the moment it was advanced.
_Avoid_: Sequence, track list

### Sharing and Sync

**Share Link**:
A web address that lets anyone with it watch a Recording hosted in the cloud.
_Avoid_: Public link, URL, embed

**Viewing Allowance**:
The watched minutes a Pro user's Share Links may use each month on full streaming before switching to a plain video file; links never stop working.
_Avoid_: Bandwidth cap, quota, fair use

**Storage Quota**:
The cloud space a Pro user's Synced Presentations and Recordings may use, 100 GB; when full, new Sync uploads pause and nothing is deleted.
_Avoid_: Storage limit, disk space, allowance

**Cooling**:
Moving an idle Share Link's video from full streaming to a plain video file after 90 days without views; the link keeps working.
_Avoid_: Archiving, expiry, cold storage

**Remix**:
Copying the Presentation behind a Share Link into the viewer's own Flowcam account so they can build on it.
_Avoid_: Fork, clone, duplicate

**Sync**:
Keeping a user's Presentations and Recordings identical across their devices through the cloud, so editing can resume anywhere, including on the web.
_Avoid_: Backup, cloud save

### Plans and Credits

**Plan**:
What a user pays for: Free (local only, watermarked exports up to 1080p) or Pro (cloud features, Screen Polish, unwatermarked 4K exports and a monthly Credit allowance).
_Avoid_: Tier, subscription level, license

**Trial**:
Seven days of Pro, started with a card, that becomes a paid subscription unless cancelled; it includes 200 Credits, and its Share Links stop working if it ends unpaid.
_Avoid_: Free trial, demo, preview

**Founding Price**:
The lower Pro price locked in for as long as they stay subscribed by anyone who subscribes during the launch window.
_Avoid_: Discount, launch offer, early-bird price

**Workspace**:
A team's shared space of Presentations, Recordings and brand settings under one bill, priced per member; planned after launch, which serves individuals only.
_Avoid_: Team, organization, org

**Credit**:
The unit in which paid AI usage is measured; a subscription includes a monthly allowance and each AI Job costs a set number of Credits. They are spent in the order monthly allowance, then Bonus Credits, then Top-ups.
_Avoid_: Token, point, coin

**Bonus Credits**:
Credits given away rather than sold, for example in a launch offer, a referral reward or an apology; they expire 90 days after being granted.
_Avoid_: Free credits, promo credits, gift

**Top-up**:
A one-off purchase of extra Credits that never expire, unlike the monthly allowance.
_Avoid_: Credit pack, refill, add-on

**AI Job**:
One paid AI request of a known kind, such as generating a Presentation, a Script, an Image, a Voiceover or a Video, charged a set number of Credits.
_Avoid_: AI call, generation, prompt

**Quality**:
The user's choice for an AI Job, Standard or Best, which sets its Credit price.
_Avoid_: Model, mode, tier

**Hold**:
Credits set aside when an AI Job is submitted; it becomes a charge if the Job succeeds and is released if it fails.
_Avoid_: Reservation, pending charge, lock

**Credit Ledger**:
The permanent, append-only record of every Credit grant, Hold, charge, release and expiry for a user; their balance is its sum.
_Avoid_: Wallet, balance table, credit history
