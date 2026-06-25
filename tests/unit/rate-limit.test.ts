import { test } from "node:test";
import assert from "node:assert/strict";
import { check, reset } from "../../apps/control-plane/lib/rate-limit";

/**
 * Sliding-window rate limit on the dashboard login.
 *
 * Each test uses a unique key so state from one test never leaks into
 * another (the limiter is in-process global by design).
 */

test("allows the first N attempts in the window", () => {
  const key = "rl-allows-" + Math.random();
  for (let i = 0; i < 5; i++) {
    const r = check(key, 5, 60_000);
    assert.equal(r.allowed, true, `attempt ${i + 1} should be allowed`);
    assert.equal(r.remaining, 5 - (i + 1));
  }
});

test("denies once the per-window cap is hit", () => {
  const key = "rl-denies-" + Math.random();
  for (let i = 0; i < 5; i++) check(key, 5, 60_000);
  const r = check(key, 5, 60_000);
  assert.equal(r.allowed, false, "the 6th attempt must be denied");
  assert.equal(r.remaining, 0);
  assert.ok(r.retryAfterSec > 0, "retryAfterSec must be a positive integer");
});

test("reset clears the bucket so a successful login isn't penalised", () => {
  const key = "rl-reset-" + Math.random();
  for (let i = 0; i < 5; i++) check(key, 5, 60_000);
  assert.equal(check(key, 5, 60_000).allowed, false);
  reset(key);
  assert.equal(check(key, 5, 60_000).allowed, true, "after reset the next attempt allowed again");
});

test("attempts outside the window age out (sliding window, not fixed)", async () => {
  const key = "rl-window-" + Math.random();
  // Fill the bucket with a 50ms window so old attempts age out fast.
  for (let i = 0; i < 3; i++) check(key, 3, 50);
  assert.equal(check(key, 3, 50).allowed, false);
  await new Promise((r) => setTimeout(r, 70));
  // The first attempts are now outside the window — at least one slot freed.
  assert.equal(check(key, 3, 50).allowed, true);
});

test("different keys are independent", () => {
  const a = "rl-key-a-" + Math.random();
  const b = "rl-key-b-" + Math.random();
  for (let i = 0; i < 5; i++) check(a, 5, 60_000);
  assert.equal(check(a, 5, 60_000).allowed, false);
  assert.equal(check(b, 5, 60_000).allowed, true);
});
