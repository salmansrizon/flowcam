# Idle Share Links cool from Mux to Cloudflare R2

A Share Link with no views for 90 days is removed from Mux and served as a plain MP4 from Cloudflare R2, the same path as Viewing Allowance overflow (ADR 0015). Mux bills about $0.003 per stored minute every month forever, so a Pro user sharing 50 minutes a month would cost about $3.60 a month in storage after two years; on R2 a 5-minute video costs about $0.002 a month. We rejected keeping everything on Mux (margin erodes every year) and expiring old links (breaks ADR 0005's promise that links never break).

## Consequences

- A cooled link plays immediately from R2, without adaptive streaming.
- If a cooled link starts getting regular views again, it is re-uploaded to Mux automatically.
- Mux storage cost per Pro user stays roughly flat instead of growing every month.
