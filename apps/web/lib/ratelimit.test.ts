import assert from "node:assert/strict";
import { test } from "node:test";

import { checkRateLimit, _resetRateLimits } from "./ratelimit";

test("in-memory limiter allows up to the limit then blocks within the window", async () => {
  _resetRateLimits();
  const key = `t:${Math.random()}`;
  for (let i = 0; i < 5; i++) {
    assert.equal(await checkRateLimit(key, 5, 60_000), true, `attempt ${i + 1} allowed`);
  }
  assert.equal(await checkRateLimit(key, 5, 60_000), false, "6th attempt blocked");
});

test("the window resets, allowing again after it elapses", async () => {
  _resetRateLimits();
  const key = `t:${Math.random()}`;
  assert.equal(await checkRateLimit(key, 1, 10), true, "first allowed");
  assert.equal(await checkRateLimit(key, 1, 10), false, "second blocked in-window");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(await checkRateLimit(key, 1, 10), true, "allowed after window reset");
});

test("distinct keys have independent budgets", async () => {
  _resetRateLimits();
  assert.equal(await checkRateLimit("a", 1, 60_000), true);
  assert.equal(await checkRateLimit("a", 1, 60_000), false);
  assert.equal(await checkRateLimit("b", 1, 60_000), true, "key b unaffected by key a");
});
