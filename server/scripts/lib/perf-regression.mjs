const finite = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be finite`);
  return number;
};

export function normalizeLoadEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') throw new Error('evidence must be an object');
  if (evidence.format !== 'forge-http-load-smoke/v1') throw new Error('unsupported load evidence format');
  const summary = evidence.summary;
  if (!summary || typeof summary !== 'object') throw new Error('evidence.summary is required');
  const latency = summary.latency_ms;
  if (!latency || typeof latency !== 'object') throw new Error('evidence.summary.latency_ms is required');
  return {
    p50_ms: finite(latency.p50, 'latency p50'),
    p95_ms: finite(latency.p95, 'latency p95'),
    p99_ms: finite(latency.p99, 'latency p99'),
    error_rate: finite(summary.error_rate, 'error_rate'),
    requests_per_second: finite(summary.requests_per_second, 'requests_per_second'),
    total: finite(summary.total, 'total'),
  };
}

function thresholdCheck(name, actual, limit, comparator = '<=') {
  if (limit === undefined || limit === null) return null;
  const expected = finite(limit, `${name} limit`);
  const pass = comparator === '>=' ? actual >= expected : actual <= expected;
  return { name, actual, comparator, expected, pass };
}

function pctRegression(current, baseline) {
  if (baseline === 0) return current === 0 ? 0 : Number.POSITIVE_INFINITY;
  return ((current - baseline) / baseline) * 100;
}

function pctDrop(current, baseline) {
  if (baseline === 0) return current === 0 ? 0 : Number.NEGATIVE_INFINITY;
  return ((baseline - current) / baseline) * 100;
}

export function evaluatePerfRegression({ currentEvidence, baselineEvidence = null, policy = {} }) {
  const current = normalizeLoadEvidence(currentEvidence);
  const baseline = baselineEvidence ? normalizeLoadEvidence(baselineEvidence) : null;
  const checks = [
    thresholdCheck('p95_ms', current.p95_ms, policy.max_p95_ms),
    thresholdCheck('p99_ms', current.p99_ms, policy.max_p99_ms),
    thresholdCheck('error_rate', current.error_rate, policy.max_error_rate),
    thresholdCheck('requests_per_second', current.requests_per_second, policy.min_requests_per_second, '>='),
  ].filter(Boolean);

  if (baseline) {
    if (policy.max_p95_regression_pct !== undefined) {
      const actual = pctRegression(current.p95_ms, baseline.p95_ms);
      checks.push(thresholdCheck('p95_regression_pct', actual, policy.max_p95_regression_pct));
    }
    if (policy.max_p99_regression_pct !== undefined) {
      const actual = pctRegression(current.p99_ms, baseline.p99_ms);
      checks.push(thresholdCheck('p99_regression_pct', actual, policy.max_p99_regression_pct));
    }
    if (policy.max_error_rate_delta !== undefined) {
      const actual = current.error_rate - baseline.error_rate;
      checks.push(thresholdCheck('error_rate_delta', actual, policy.max_error_rate_delta));
    }
    if (policy.max_rps_drop_pct !== undefined) {
      const actual = pctDrop(current.requests_per_second, baseline.requests_per_second);
      checks.push(thresholdCheck('rps_drop_pct', actual, policy.max_rps_drop_pct));
    }
  }

  return {
    format: 'forge-perf-regression/v1',
    current,
    baseline,
    policy,
    checks,
    pass: checks.every((check) => check.pass),
  };
}
