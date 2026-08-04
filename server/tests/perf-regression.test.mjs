import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePerfRegression } from '../scripts/lib/perf-regression.mjs';

const ev = (p95, p99, errorRate, rps) => ({
  format: 'forge-http-load-smoke/v1',
  summary: { total: 100, error_rate: errorRate, requests_per_second: rps, latency_ms: { p50: 20, p95, p99 } },
});

test('absolute performance budgets pass and fail deterministically', () => {
  assert.equal(evaluatePerfRegression({ currentEvidence: ev(300, 350, 0, 80), policy: { max_p95_ms: 400, max_p99_ms: 500, max_error_rate: 0.01, min_requests_per_second: 50 } }).pass, true);
  const failed = evaluatePerfRegression({ currentEvidence: ev(450, 700, 0.02, 40), policy: { max_p95_ms: 400, max_p99_ms: 500, max_error_rate: 0.01, min_requests_per_second: 50 } });
  assert.equal(failed.pass, false);
  assert.deepEqual(failed.checks.filter((x) => !x.pass).map((x) => x.name), ['p95_ms', 'p99_ms', 'error_rate', 'requests_per_second']);
});

test('baseline regression budgets cover tail latency error delta and throughput drop', () => {
  const result = evaluatePerfRegression({
    currentEvidence: ev(330, 440, 0.006, 90),
    baselineEvidence: ev(300, 400, 0.005, 100),
    policy: { max_p95_regression_pct: 10, max_p99_regression_pct: 10, max_error_rate_delta: 0.002, max_rps_drop_pct: 10 },
  });
  assert.equal(result.pass, true);
});

test('unsupported evidence fails closed', () => {
  assert.throws(() => evaluatePerfRegression({ currentEvidence: { format: 'other' } }), /unsupported/);
});
