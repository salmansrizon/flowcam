# Lemon Squeezy as merchant of record at launch, behind a billing module

The business is based in Bangladesh, where Stripe is not available to businesses, so launch billing uses Lemon Squeezy: a merchant of record that collects and remits sales tax and VAT worldwide, handles fraud and disputes, and pays out to Bangladeshi bank accounts, for 5% + 50¢ per transaction, plus 1.5% for international transactions, 0.5% for subscriptions and 1% per payout outside the US. It covers every billing feature in the design (monthly and yearly subscriptions, a separate Founding Price, a 7-day Trial with a card, one-off Top-ups). We rejected forming a US company to use Stripe from day one because of setup cost, yearly US filings and launch delay; it remains the planned move once revenue justifies it, using Stripe Managed Payments as the merchant of record.

## Consequences

- All payment-provider calls live in one billing module; Plans, Trials and the Credit Ledger live in our own database, so switching to Stripe later means replacing that module and migrating subscribers, not redesigning.
- Fees are about 60–85¢ per subscriber per month higher than plain Stripe would have been.
- This supersedes "payments go through Stripe" in ADR 0006.
