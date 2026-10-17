# Our own model router per AI Job, not OpenRouter's Auto Router

Each kind of AI Job has its own route on OpenRouter: a cheap default model on its cheapest provider (`:floor`), a stronger model used only when the cheap result fails a validity check (for example a generated Board that does not parse), and a fallback list for outages. A user-visible Quality setting lets "Best" skip straight to the strong model at a higher Credit price. We rejected sending requests to `openrouter/auto` because it picks a different model, and so a different cost, on each call, which breaks fixed Credit prices per AI Job, and it does not cover image, voice or video.

## Consequences

- Every AI Job needs an automatic validity check, because escalation depends on it.
- Titles, summary and chapters are generated in one request; fixed instructions sit at the start of each prompt so prompt caching applies; results are reused when the input is unchanged.
- Image, Voiceover and Video Jobs do not escalate on a validity check: each Quality has one fixed model, plus a fallback list for outages, always on the cheapest provider (routes in PRODUCT.md §6).
- Credit prices must be revisited when the models behind a route change.
