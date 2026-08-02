import test from "node:test";
import assert from "node:assert/strict";
import { assertLoadPlan, percentile, summarizeLoad } from "../scripts/lib/load-smoke.mjs";

test("percentile is deterministic for small samples", () => {
  assert.equal(percentile([40, 10, 30, 20], 0.5), 20);
  assert.equal(percentile([40, 10, 30, 20], 0.95), 40);
  assert.equal(percentile([], 0.95), 0);
});

test("load plan permits bounded localhost reads", () => {
  assert.deepEqual(assertLoadPlan({
    url: "http://127.0.0.1:8787/health",
    method: "GET",
    requests: 100,
    concurrency: 5,
  }), {
    url: "http://127.0.0.1:8787/health",
    method: "GET",
    requests: 100,
    concurrency: 5,
    remote: false,
  });
});

test("remote load requires explicit host confirmation and remains capped", () => {
  assert.throws(() => assertLoadPlan({
    url: "https://example.com/health", method: "GET", requests: 10, concurrency: 2,
  }), /allow-remote/);
  assert.throws(() => assertLoadPlan({
    url: "https://example.com/health", method: "GET", requests: 10, concurrency: 2,
    allowRemote: true, confirmHost: "other.example.com",
  }), /confirm-host example\.com/);
  assert.throws(() => assertLoadPlan({
    url: "https://example.com/health", method: "GET", requests: 501, concurrency: 2,
    allowRemote: true, confirmHost: "example.com",
  }), /capped at 500/);
  assert.throws(() => assertLoadPlan({
    url: "https://example.com/health", method: "GET", requests: 100, concurrency: 11,
    allowRemote: true, confirmHost: "example.com",
  }), /concurrency 10/);
});

test("load smoke rejects mutating methods", () => {
  assert.throws(() => assertLoadPlan({
    url: "http://localhost:8787/api", method: "POST", requests: 1, concurrency: 1,
  }), /GET\/HEAD only/);
});

test("summary reports status, errors, throughput and tail latency", () => {
  const result = summarizeLoad({
    latencies: [10, 20, 30, 40],
    statuses: new Map([[200, 3], [500, 1]]),
    errors: [],
    durationMs: 1000,
  });
  assert.equal(result.total, 4);
  assert.equal(result.ok, 3);
  assert.equal(result.errors, 1);
  assert.equal(result.error_rate, 0.25);
  assert.equal(result.requests_per_second, 4);
  assert.equal(result.latency_ms.p50, 20);
  assert.equal(result.latency_ms.p95, 40);
  assert.deepEqual(result.statuses, { 200: 3, 500: 1 });
});
