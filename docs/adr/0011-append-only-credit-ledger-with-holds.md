# Credits are an append-only ledger with Holds

Every Credit movement is a new, never-edited line in a Postgres Credit Ledger: grants (monthly allowance, Bonus Credits, Top-ups), Holds placed when an AI Job is submitted, charges when it succeeds, releases when it fails, and expiries. A user's balance is the sum of their lines, and a Job is refused at submission if its Hold would exceed the unheld balance. We rejected charging only after success, which lets concurrent Jobs drive balances negative, and charging up front with manual refunds, which bills users for failures.

## Consequences

- Placing a Hold must check and write the balance in one transaction, so two simultaneous Jobs cannot both pass.
- Monthly resets and the 90-day Bonus Credit expiry are ledger lines, not updates.
- When a Standard Job escalates to a stronger model (ADR 0007), the user is still charged the Job's fixed price.
