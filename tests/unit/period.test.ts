import { test } from "node:test";
import assert from "node:assert/strict";
import { periodBucket, periodTtlSec } from "../../apps/gateway/src/budget/period";

const at = (iso: string) => new Date(iso);

test("monthly bucket is YYYY-MM (UTC)", () => {
  assert.equal(periodBucket("monthly", at("2026-06-15T23:30:00Z")), "2026-06");
  assert.equal(periodBucket("monthly", at("2026-12-01T00:00:00Z")), "2026-12");
});

test("daily bucket is YYYY-MM-DD (UTC)", () => {
  assert.equal(periodBucket("daily", at("2026-06-15T23:30:00Z")), "2026-06-15");
});

test("bucket uses UTC, not local time (boundary)", () => {
  // 2026-06-30T23:30Z is still June in UTC regardless of host timezone.
  assert.equal(periodBucket("monthly", at("2026-06-30T23:30:00Z")), "2026-06");
});

test("daily TTL is shorter than monthly TTL", () => {
  assert.ok(periodTtlSec("daily") < periodTtlSec("monthly"));
  assert.ok(periodTtlSec("daily") >= 86_400, "covers at least a day");
});
