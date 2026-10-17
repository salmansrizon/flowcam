# Every cost has two locks: provider spend caps and our own circuit breakers

Each provider bill is limited twice. First by the provider: prepaid OpenRouter credits with automatic top-up off and a monthly limit on the production key, Supabase's spend cap on, and Vercel spend management on. Second by Flowcam: a daily budget per provider tracked in our own database. When AI spending passes its budget, new AI Jobs pause for everyone with an honest message and no Credits are held; when Mux spending passes its budget, new views switch to MP4 on R2 (ADR 0015), covering Mux's lack of a hard cap. Alerts go out at 50%, 80% and 100% of every budget. We rejected alerts alone (a bug or attack can outrun a human overnight) and prepaid-only limits (Mux cannot be prepaid).

## Consequences

- The worst outcome of a runaway bug or attack is a temporary pause, never a surprise bill.
- Budgets must be raised deliberately as the user base grows, or real users will hit pauses.
- An empty OpenRouter balance stops AI; topping it up is a manual, weekly-or-better task until auto top-up is turned on with a cap.
