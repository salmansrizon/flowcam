export type CreditLine = { id: number; kind: string; bucket: string; amount: number; note: string | null; created_at: string };
export type CreditsResponse = { balance: number; byBucket: Record<string, number>; lines: CreditLine[] };
