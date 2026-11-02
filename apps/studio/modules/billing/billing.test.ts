import { describe, expect, it } from "vitest";
import { parseEvent, periodStart } from "./events";
import { sign, verifySignature } from "./signature";

describe("verifySignature", () => {
  const body = '{"a":1}';
  it("accepts the HMAC-SHA256 hex of the raw body", () => {
    expect(verifySignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
  });
  it.each([
    ["wrong secret", sign(body, "other")],
    ["garbage", "deadbeef"],
    ["empty", ""],
    ["null", null],
  ])("rejects %s", (_n, sig) => expect(verifySignature(body, sig as string | null, "s3cret")).toBe(false));
  it("rejects a changed body and a missing secret", () => {
    expect(verifySignature('{"a":2}', sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifySignature(body, sign(body, "s3cret"), undefined)).toBe(false);
  });
});

const ev = (name: string, data: Record<string, unknown>, custom: Record<string, unknown> = { user_id: "u1" }) => ({ meta: { event_name: name, custom_data: custom }, data });

describe("parseEvent", () => {
  it("maps a subscription_created", () => {
    const e = parseEvent(ev("subscription_created", { id: 7, attributes: { status: "on_trial", customer_id: 9, renews_at: "2030-01-01T00:00:00Z", updated_at: "t1" } }, { user_id: "u1", kind: "trial", interval: "year" }))!;
    expect(e).toMatchObject({ name: "subscription_created", userId: "u1", subscriptionId: "7", customerId: "9", status: "on_trial", kind: "trial", interval: "year", orderId: null });
    expect(e.renewsAt?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });
  it("points a payment event at its subscription, not the invoice", () => {
    expect(parseEvent(ev("subscription_payment_success", { id: "inv1", attributes: { subscription_id: 7 } }))!.subscriptionId).toBe("7");
  });
  it("maps a top-up order", () => {
    expect(parseEvent(ev("order_created", { id: "o1", attributes: { status: "paid" } }, { user_id: "u1", kind: "topup" }))).toMatchObject({ orderId: "o1", kind: "topup", subscriptionId: null });
  });
  it("derives a stable id: same event, same id; a later update differs", () => {
    const a = (u: string) => parseEvent(ev("subscription_updated", { id: 7, attributes: { updated_at: u } }))!.id;
    expect(a("t1")).toBe(a("t1"));
    expect(a("t1")).not.toBe(a("t2"));
  });
  it.each([["no name", { data: { id: 1 } }], ["no id", { meta: { event_name: "x" } }], ["null", null]])("rejects %s", (_n, v) => expect(parseEvent(v)).toBeNull());
  it("ignores bad dates and unknown kinds", () => {
    const e = parseEvent(ev("subscription_updated", { id: 1, attributes: { renews_at: "soon" } }, { kind: "gold" }))!;
    expect([e.renewsAt, e.kind, e.userId]).toEqual([null, null, null]);
  });
});

describe("periodStart", () => {
  it("steps back one interval", () => {
    expect(periodStart(new Date("2030-03-15T00:00:00Z"), "month").toISOString()).toBe("2030-02-15T00:00:00.000Z");
    expect(periodStart(new Date("2030-03-15T00:00:00Z"), "year").toISOString()).toBe("2029-03-15T00:00:00.000Z");
  });
});
