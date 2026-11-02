import { describe, expect, it } from "vitest";
import { foundingOpen, money, parsePricing, proPriceCents } from "./pricing";

const row = { currency: "USD", list_monthly_cents: 2000, list_yearly_cents: 20000, founding_monthly_cents: 1700, founding_yearly_cents: 17000, founding_until: null, founding_max_subscribers: 500, trial_days: 7, trial_credits: 200, monthly_credits: 1000, topup_cents: 1000, topup_credits: 1000 };

describe("parsePricing", () => {
  it("accepts the seeded row", () => {
    const p = parsePricing(row)!;
    expect(p.foundingMonthlyCents).toBe(1700);
    expect(foundingOpen(p)).toBe(true);
    expect(money(p.listMonthlyCents, p.currency)).toBe("$20");
  });
  it("closes the Founding window once founding_until has passed", () => {
    expect(foundingOpen(parsePricing({ ...row, founding_until: "2020-01-01T00:00:00Z" })!)).toBe(false);
    expect(foundingOpen(parsePricing({ ...row, founding_until: "2999-01-01T00:00:00Z" })!)).toBe(true);
  });
  it("reads the Top-up fields and rejects a missing or zero Top-up", () => {
    expect(parsePricing(row)).toMatchObject({ topupCents: 1000, topupCredits: 1000 });
    expect(parsePricing({ ...row, topup_credits: undefined })).toBeNull();
    expect(parsePricing({ ...row, topup_cents: 0 })).toBeNull();
  });
  it("charges the Founding Price while open and the list price after", () => {
    const open = parsePricing(row)!;
    const closed = parsePricing({ ...row, founding_until: "2020-01-01T00:00:00Z" })!;
    expect([proPriceCents(open, "month"), proPriceCents(open, "year")]).toEqual([1700, 17000]);
    expect([proPriceCents(closed, "month"), proPriceCents(closed, "year")]).toEqual([2000, 20000]);
  });
  it.each([
    ["missing row", null],
    ["not an object", "x"],
    ["missing field", { ...row, trial_days: undefined }],
    ["string number", { ...row, list_monthly_cents: "2000" }],
    ["fractional", { ...row, list_monthly_cents: 20.5 }],
    ["zero price", { ...row, founding_monthly_cents: 0 }],
    ["negative credits", { ...row, trial_credits: -1 }],
    ["bad currency", { ...row, currency: "usd" }],
    ["bad date", { ...row, founding_until: "soon" }],
    ["non-string date", { ...row, founding_until: 5 }],
  ])("rejects %s", (_n, v) => expect(parsePricing(v)).toBeNull());
});
