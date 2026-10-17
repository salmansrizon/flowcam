# Flowcam

Flowcam is a studio for explainer creators and online teachers: build a hand-drawn Presentation, present it step by step while your camera, voice and screen are recorded, and polish the result into a professional video. It runs on the web first, with macOS and Windows apps to follow.

**Status:** design agreed, no code yet. Everything below is the plan to build from.

## Start here

| Read | What it gives you |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | The full spec: users, features per release, flows, interface, pricing, architecture, scaling, economics, risks |
| [CONTEXT.md](CONTEXT.md) | The glossary. Use these words in code, UI and conversation (a *Board*, not a "slide"; a *Step*, not a "frame") |
| [docs/adr/](docs/adr/) | Architecture decision records: why each hard-to-reverse choice was made |
| [docs/OPEN-ITEMS.md](docs/OPEN-ITEMS.md) | What is still unresolved or waiting on an action, with deadlines |

## Decisions at a glance

| Area | Decision | ADR |
|---|---|---|
| Foundation | New monorepo; Excaliflow's hand-drawn renderer ported in (Apache-2.0, keep attribution) | 0001 |
| Recording | A Presentation is recorded as a timestamped data log and re-rendered at export, not captured as pixels | 0002 |
| Platforms | Web first; Electron desktop apps add native Screen capture | 0003, 0004 |
| Plans | Free is local-only; cloud features and AI are Pro | 0005, 0008 |
| Stack | Next.js on Vercel, Supabase (Postgres, Auth, Storage), Mux, OpenRouter, Lemon Squeezy | 0006, 0014 |
| AI | Our own model route per AI Job, priced in Credits with an append-only ledger | 0007, 0011 |
| Uploads and jobs | Upload after recording; AI Jobs on a Supabase queue | 0009, 0010 |
| Presentations | A deck of Boards with Focus Steps | 0012 |
| Editor | Match Cap's editor features in our own code; reuse only Cap's MIT capture crates | 0013 |
| Video costs | Viewing Allowance, idle links cooled to R2, spend ceilings | 0015–0017 |
| Interface | Framework-free Board renderer inside a React + Tailwind + shadcn/ui interface | 0018 |
| Desktop | Direct download, signed and notarised, auto-updated from R2 | 0019 |

## Planned layout

Nothing here exists yet; this is the agreed shape for the monorepo.

```text
apps/web        Next.js web app and API (Vercel)
apps/desktop    Electron shell for macOS and Windows
packages/board  Framework-free Board renderer (ported from Excaliflow)
packages/ui     React components (Tailwind + shadcn/ui)
native/capture  Rust screen and camera capture module (desktop only)
supabase/       Database migrations and policies
docs/           Spec, glossary, ADRs, open items
```

## Infrastructure

| Service | Project | Notes |
|---|---|---|
| GitHub | [`salmansrizon/flowcam`](https://github.com/salmansrizon/flowcam) | Created. Public, no open-source licence (all rights reserved; see ADR 0013) |
| Vercel | `flowcam` (`prj_eDQNeNk7BY7wMbIu5WrgNpnKnwlW`) in team `salmansrizons-projects` | Created: Next.js, root directory `apps/web`, functions in Singapore (`sin1`). **Not yet linked to GitHub** |
| Supabase | `flowcam`, Singapore (`ap-southeast-1`), org `salmansrizon's Org` | **Not yet created**: the free plan's two-project limit is full |

### Remaining setup steps

1. **Supabase:** pause one of your other free projects in the Supabase dashboard (paused projects keep their data), then create `flowcam` in Singapore. Move to Supabase Pro before the first paying user (OPEN-ITEMS item 3).
2. **Vercel ↔ GitHub:** in Vercel, open Account Settings › Authentication and add a GitHub Login Connection, then connect `salmansrizon/flowcam` to the `flowcam` project (Settings › Git). Pushes to `main` will then deploy once `apps/web` exists.
3. **Environment variables:** after Supabase exists, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the Vercel project; keep the service-role key and `OPENROUTER_API_KEY` as sensitive variables only.

Secrets never go in this repo: keep them in Vercel environment variables and a local `.env` (git-ignored).

## Licence

No licence is granted. The source is visible for reference only; all rights reserved. Code ported from [Excaliflow](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/advanced_llm_apps/excaliflow) remains under its Apache-2.0 licence, with its notice kept.
