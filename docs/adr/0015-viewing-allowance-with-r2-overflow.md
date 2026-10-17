# Share Link viewing allowance, with overflow served from Cloudflare R2

Each Pro user's Share Links get a Viewing Allowance of 10,000 watched minutes a month on Mux. Beyond it, their links keep working but play a plain MP4 copy served from Cloudflare R2, whose outbound transfer is free, and the user is emailed that their video is popular. We rejected absorbing unlimited Mux delivery (about $400 per 100,000 five-minute views), pausing links over the cap (it punishes the most successful users and breaks ADR 0005's promise), and falling back to Supabase Storage, whose transfer charges make a 5-minute 1080p view cost about $0.0135, nearly three times Mux's $0.005.

## Consequences

- R2 joins the stack, but only for overflow copies; Supabase Storage remains the main file store (ADR 0006).
- Over-cap viewers lose adaptive streaming, which matters only on slow connections.
- The share page must switch source per Share Link when its owner passes the allowance.
