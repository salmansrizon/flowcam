# Free is local-only; every cloud capability is paid

Free users author, record, edit and export entirely on their own device with no account. Share Links, Sync (including resuming an edit on the web from any device) and AI-assisted editing are paid. Unlike Cap and Loom, which give free users a few short Share Links, we keep the free tier free of cloud storage and bandwidth costs, and lean on the local-first, no-login preference of privacy-minded users.

## Consequences

- A free user sends a video by exporting a file, not a link, so the free tier has no viral loop through shared videos.
- One exception: a free account gets a small one-time Credit grant at sign-up, once its email is verified, so free users can try AI. It needs an account and a server call. Its only cloud footprint is the account, its Credit Ledger lines and transient AI results, which are deleted once downloaded or after 7 days at most (ADR 0010).
- Anyone, signed in or not, can Remix a Share Link's Presentation into their browser's local storage; Pro viewers also get it Synced. This is the free tier's viral loop, and it costs no cloud storage.
- A 7-day Pro Trial (card required, 200 Credits) is the one way a free user gets cloud features before paying. Its Share Links stop working if the Trial ends unpaid, after a clear warning on the Trial screen and an email two days before it ends.
- For anyone who has paid at least once, cancelling never breaks a Share Link: existing links stay live, cloud Boards and Recordings become view-only and downloadable, and new links, Sync and AI stop.
- Web storage can be evicted by the browser, so the free web app must save each Clip as it is recorded and warn users to export anything important.
