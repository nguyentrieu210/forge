#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { assertLoadPlan, summarizeLoad } from "./lib/load-smoke.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const url = argOf("url", "http://127.0.0.1:8787/health");
const method = argOf("method", "GET");
const requests = Number(argOf("requests", "100"));
const concurrency = Number(argOf("concurrency", "5"));
const timeoutMs = Number(argOf("timeout-ms", "5000"));
const p95BudgetMs = Number(argOf("p95-ms", "1000"));
const maxErrorRate = Number(argOf("max-error-rate", "0.01"));
const output = argOf("output");
const allowRemote = args.includes("--allow-remote");
const confirmHost = argOf("confirm-host");

if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new Error("timeout-ms must be in [100,30000]");
if (!Number.isFinite(p95BudgetMs) || p95BudgetMs <= 0) throw new Error("p95-ms must be positive");
if (!Number.isFinite(maxErrorRate) || maxErrorRate < 0 || maxErrorRate > 1) throw new Error("max-error-rate must be in [0,1]");

const plan = assertLoadPlan({ url, method, requests, concurrency, allowRemote, confirmHost });
console.log(`target       ${plan.url}`);
console.log(`method       ${plan.method}`);
console.log(`requests     ${plan.requests}`);
console.log(`concurrency  ${plan.concurrency}`);
console.log(`remote       ${plan.remote}`);
console.log(`p95 budget   ${p95BudgetMs} ms`);
console.log(`error budget ${maxErrorRate}`);

const statuses = new Map();
const latencies = [];
const errors = [];
let cursor = 0;
const started = performance.now();

await Promise.all(Array.from({ length: plan.concurrency }, async () => {
  while (true) {
    const current = cursor;
    cursor += 1;
    if (current >= plan.requests) return;
    const requestStarted = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(plan.url, {
        method: plan.method,
        headers: { "cache-control": "no-cache", "user-agent": "forge-sre-load-smoke/1" },
        signal: controller.signal,
      });
      latencies.push(performance.now() - requestStarted);
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      try { await response.body?.cancel(); } catch {}
    } catch (error) {
      errors.push(error instanceof Error ? error.name : String(error));
    } finally {
      clearTimeout(timer);
    }
  }
}));

const summary = summarizeLoad({ latencies, statuses, errors, durationMs: performance.now() - started });
const evidence = {
  format: "forge-http-load-smoke/v1",
  measured_at: new Date().toISOString(),
  plan,
  budgets: { p95_ms: p95BudgetMs, max_error_rate: maxErrorRate, timeout_ms: timeoutMs },
  summary,
  pass: summary.error_rate <= maxErrorRate && summary.latency_ms.p95 <= p95BudgetMs,
};

console.log(JSON.stringify(evidence, null, 2));
if (output) {
  const target = path.resolve(output);
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`evidence ${target}`);
}
if (!evidence.pass) process.exitCode = 1;
