export function percentile(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const q = Math.min(1, Math.max(0, Number(quantile)));
  const index = Math.ceil(q * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function assertLoadPlan({ url, method = "GET", requests, concurrency, allowRemote = false, confirmHost }) {
  const target = new URL(url);
  const normalizedMethod = String(method).toUpperCase();
  if (!new Set(["GET", "HEAD"]).has(normalizedMethod)) {
    throw new Error("load smoke permits GET/HEAD only");
  }
  const total = Number(requests);
  const parallel = Number(concurrency);
  if (!Number.isInteger(total) || total < 1 || total > 10_000) throw new Error("requests must be an integer in [1,10000]");
  if (!Number.isInteger(parallel) || parallel < 1 || parallel > 50) throw new Error("concurrency must be an integer in [1,50]");
  if (parallel > total) throw new Error("concurrency cannot exceed requests");

  const local = new Set(["localhost", "127.0.0.1", "::1"]).has(target.hostname);
  if (!local) {
    if (!allowRemote) throw new Error("remote load smoke requires --allow-remote");
    if (confirmHost !== target.hostname) throw new Error(`remote load smoke requires --confirm-host ${target.hostname}`);
    if (total > 500) throw new Error("remote load smoke is capped at 500 requests");
    if (parallel > 10) throw new Error("remote load smoke is capped at concurrency 10");
  }

  return {
    url: target.toString(),
    method: normalizedMethod,
    requests: total,
    concurrency: parallel,
    remote: !local,
  };
}

export function summarizeLoad({ latencies, statuses, errors, durationMs }) {
  const total = latencies.length + errors.length;
  const ok = [...statuses.entries()]
    .filter(([status]) => status >= 200 && status < 400)
    .reduce((sum, [, count]) => sum + count, 0);
  const errorCount = total - ok;
  return {
    total,
    ok,
    errors: errorCount,
    error_rate: total ? errorCount / total : 1,
    duration_ms: Math.round(durationMs),
    requests_per_second: durationMs > 0 ? Number((total / (durationMs / 1000)).toFixed(2)) : 0,
    latency_ms: {
      min: latencies.length ? Math.round(Math.min(...latencies)) : 0,
      p50: Math.round(percentile(latencies, 0.50)),
      p95: Math.round(percentile(latencies, 0.95)),
      p99: Math.round(percentile(latencies, 0.99)),
      max: latencies.length ? Math.round(Math.max(...latencies)) : 0,
    },
    statuses: Object.fromEntries([...statuses.entries()].sort((a, b) => a[0] - b[0])),
    network_errors: errors,
  };
}
