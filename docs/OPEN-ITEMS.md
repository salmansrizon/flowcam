# Open items

Questions the design in [PRODUCT.md](PRODUCT.md) leaves unresolved. Each must be closed before the release in its **Deadline** column. When one closes, record the answer here, and write an ADR if it meets the bar in [docs/adr/](adr/).

| # | Item | Type | Deadline | Status |
|---|---|---|---|---|
| 1 | Video generation prices | Fact | v1.2 | **Closed** |
| 2 | Sales tax approach | Decision | v1 (before billing goes live) | **Closed** |
| 3 | Supabase upload limit | Fact + decision | v1 (before first Pro user) | **Closed** |
| 4 | Mediabunny fragmented MP4 | Fact | v1 (before export is built) | **Closed** |
| 5 | Fair-use cap for viral Share Links | Decision | v1 | **Closed** |
| 6 | Conversion rate | Measurement | 60 days after v1 | Measuring from launch |
| 7 | Domain purchase | Action | Before launch | Chosen, not bought |

## 1. Video generation prices

- **Unknown:** what OpenRouter charges per second for picture-to-video models (Wan 2.7, Seedance 2.0 mini, Veo 3.1, Kling v3.0 Pro). Its models API returns `0` for these; prices are only on the model pages.
- **Why it matters:** video is the only AI Job expensive enough to lose money if mispriced. Credit prices (~120 Standard, ~600 Best per 5 seconds) are placeholders.
- **How to close:** read each model's page on openrouter.ai, or run one paid 5-second generation per model and read the cost from the response. Set Credit prices at about 3× cost (ADR 0007).
- **Answer (17 Oct 2026):** OpenRouter publishes video prices in a separate API, `GET /api/v1/videos/models` (field `pricing_skus`). Per second of output, without audio (Video Elements are silent; Narration is separate):

  | Model | Price per second | 5-second clip |
  |---|---|---|
  | `google/veo-3.1-lite` | $0.03 (720p), $0.05 (1080p) | $0.15 / $0.25 |
  | `x-ai/grok-imagine-video-1.5-lite` | $0.03 (720p) + $0.01 per input image | $0.16 |
  | `kwaivgi/kling-v3.0-std` | $0.084 | $0.42 |
  | `alibaba/wan-2.7` | $0.10 | $0.50 |
  | `kwaivgi/kling-v3.0-pro` | $0.112 | $0.56 |
  | `google/veo-3.1` | $0.20 (1080p), $0.40 (4K) | $1.00 / $2.00 |

  **Routes:** Standard is `google/veo-3.1-lite` at 1080p with `grok-imagine-video-1.5-lite` and `kling-v3.0-std` as fallbacks, **75 Credits per 5 seconds**. Best is `google/veo-3.1` at 1080p with `kling-v3.0-pro` as fallback, **300 Credits per 5 seconds**. Failed generations are not billed by OpenRouter.

## 2. Sales tax approach

- **Unknown:** who collects and files sales tax and VAT for worldwide subscribers.
- **Options:**
  - **Stripe Tax** (about 0.5% extra): Stripe calculates the tax, and you register and file in each place that requires it.
  - **Stripe's merchant-of-record offering:** Stripe sells on your behalf and carries the tax liability, for a higher fee.
- **Why it matters:** getting this wrong is a legal liability, not just a cost, and it is hard to change once customers are billed.
- **How to close:** compare the current fees and supported countries on Stripe's pricing page, then decide. A merchant of record is usually right for a solo founder selling worldwide.
- **Answer (17 Oct 2026):** the business is based in Bangladesh, which Stripe does not support for businesses, and Stripe Managed Payments only accepts businesses in the US, Canada, Europe, Australia, Hong Kong, Japan and Singapore. **Decision:** launch with Lemon Squeezy as merchant of record (Bangladesh bank payouts supported; 5% + 50¢ per transaction), with billing behind one module, and move to a US company with Stripe Managed Payments later if revenue justifies it (ADR 0014).

## 3. Supabase upload limit

- **Unknown:** the current per-file upload limit on Supabase's free and Pro plans.
- **Why it matters:** Sync uploads Camera Tracks at about 20 MB per minute (ADR 0009), so a few minutes of footage can exceed a 50 MB limit. Uploads would then fail silently for Pro users.
- **How to close:** check Supabase's storage docs. Then either plan for Supabase Pro (and raise the limit) before the first paying user, or upload Tracks in chunks (resumable uploads).
- **Answer (17 Oct 2026):** the global per-file limit is **50 MB on Free** and **up to 500 GB on Pro** (set in Storage Settings). Supabase also supports **resumable uploads (TUS protocol, 6 MB chunks)**. **Fix:** move to Supabase Pro before the first paying user and set the global limit to 5 GB, and upload all Tracks and exports with resumable uploads, which also survive dropped connections.

## 4. Mediabunny fragmented MP4

- **Unknown:** whether Mediabunny (MPL-2.0) can write fragmented MP4, which export and crash-safe Clip saving rely on (ADR 0002).
- **Why it matters:** if it cannot, the export pipeline needs a different muxer before it is built.
- **How to close:** read Mediabunny's docs, then build a 10-second proof of concept: canvas frames → WebCodecs → Mediabunny → playable fragmented MP4 in Chrome, Firefox and Safari.
- **Answer (17 Oct 2026):** supported. `new Mp4OutputFormat({ fastStart: 'fragmented' })` writes fragmented MP4, with `minimumFragmentDuration` and `onMoof`/`onMdat` callbacks that hand over each fragment as it is written, which suits saving Clips as they record. The 10-second cross-browser proof of concept is still worth doing as the first export task.

## 5. Fair-use cap for viral Share Links

- **Unknown:** how much playback a single Pro user's Share Links may consume.
- **Why it matters:** Mux charges about $0.001 per minute watched after 100,000 free minutes a month. One viral 5-minute video at 100,000 views costs about $400, against $17–20 of revenue from that user.
- **Options:** a monthly watched-minutes allowance per Pro user (for example 10,000 minutes); switching very popular videos to plain MP4 delivery from storage; or charging extra above the cap.
- **How to close:** decide the cap and what happens when it is passed, then state it in the terms of service before launch.
- **Answer (17 Oct 2026):** a Viewing Allowance of 10,000 watched minutes a month per Pro user; beyond it, links keep working from a plain MP4 on Cloudflare R2 (free outbound transfer), and the user gets a "your video is popular" email. Falling back to Supabase Storage was rejected because its transfer fees cost more per view than Mux (ADR 0015). Still to do: state the allowance in the terms of service.

## 6. Conversion rate

- **Unknown:** what share of free users become paying Pro subscribers. The 4% used in PRODUCT.md §8 is a guess, and the research found no published figures.
- **Why it matters:** it decides how many free users are needed to reach any revenue target.
- **How to close:** from launch, track sign-ups, Trials started, Trials converted, and upgrades from each upgrade panel (Share, watermark, 4K, Screen Polish, out of Credits). Review after 60 days and update the economics.
- **Decided (17 Oct 2026):** events go to PostHog (free tier, funnel charts) with cookieless counting for anonymous visitors, identification at sign-up, session recording off, and event names only, never Presentation content. Events: visit, "Try presenting" finished, first Presentation, first Recording, sign-up, Trial started, Trial converted (with the upgrade panel that triggered it), cancelled. Revenue and subscription figures come from Lemon Squeezy webhooks into our database, not from analytics. The item closes when 60 days of data replace the 4% guess.

## 7. Domain purchase

- **Chosen (17 Oct 2026):** **getflowcam.com**, available through Vercel at $11.25 for the first year and $11.25 a year to renew. flowcam.com is taken.
- **Before buying:** search "FlowCam" in the USPTO and WIPO trademark databases. FlowCam is an existing particle-imaging instrument brand (Fluid Imaging Technologies, now Yokogawa), so confirm the name is safe for software or pick the final product name first.
- **How to close:** buy getflowcam.com in Vercel (Domains), or ask Claude to register it once the name is confirmed. Alternatives checked the same day: flowcam.app ($14.99, renews $15), flowcam.dev ($13).

