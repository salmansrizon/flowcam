# Launch stack: Vercel, Supabase (database, auth and storage), Mux, OpenRouter, Lemon Squeezy

The web app and API are Next.js on Vercel, sharing one codebase with the Electron app (ADR 0003). Supabase provides Postgres, Auth and file storage for Boards, Images and raw Tracks; Share Link playback is streamed through Mux; AI calls go through OpenRouter from the server only; payments go through Lemon Squeezy (originally Stripe; see ADR 0014). We chose Supabase Storage over Cloudflare R2 at launch to keep one vendor, one login system and one set of access rules, and over Vercel Blob for the same reason.

## Region

The Supabase project runs in Singapore (`ap-southeast-1`), chosen by the founder, and Vercel Functions are pinned to Singapore (`sin1`) so API calls sit next to the database. This favours users in Asia; users in the US and Europe see roughly 150–250 ms more latency per database round trip. Revisit if most Pro users turn out to be in the US or Europe.

## Considered Options

- Cloudflare R2 for files: free outbound transfer, but a second vendor and access model; deferred.
- Serving Share Link video as MP4 files from storage instead of Mux: cheaper, but no adaptive streaming; rejected.

## Consequences

- Storage is accessed through Supabase's S3-compatible API, so files can move to R2 later if storage transfer costs grow.
- The OpenRouter key never reaches a client; Credits are deducted on the server before each AI call.
