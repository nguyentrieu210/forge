#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { assertProbeTarget, evaluateHealthSnapshot } from "./lib/sre-health.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const baseArg = argOf("base", "http://127.0.0.1:8787");
const expectedReleaseSha = argOf("expected-release-sha")?.trim();
const timeoutMs = Number(argOf("timeout-ms", "5000"));
const output = argOf("output")?.trim();
const allowRemote = args.includes("--allow-remote");
const confirmHost = argOf("confirm-host")?.trim();
if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new Error("timeout-ms must be in [100,30000]");
if (expectedReleaseSha && !/^[0-9a-f]{7,64}$/i.test(expectedReleaseSha)) throw new Error("expected release SHA has invalid format");

const target = assertProbeTarget(baseArg, { allowRemote, confirmHost });
const startedAt = Date.now();
const [health, root, guestBoot, release] = await Promise.all([
  probe(`${target.base}/health`, timeoutMs, true),
  probe(`${target.base}/`, timeoutMs, false),
  probe(`${target.base}/api/method/metaforge.api.get_boot`, timeoutMs, true),
  probe(`${target.base}/release.json`, timeoutMs, true),
]);

const evaluation = evaluateHealthSnapshot({
  healthStatus: health.status,
  healthBody: health.body,
  rootStatus: root.status,
  guestBootStatus: guestBoot.status,
  releaseStatus: release.status,
  releaseBody: release.body,
  expectedReleaseSha,
});
const evidence = {
  format: "forge-sre-health-snapshot/v1",
  observed_at: new Date().toISOString(),
  duration_ms: Date.now() - startedAt,
  target,
  expected_release_sha: expectedReleaseSha ?? null,
  checks: {
    health: { status: health.status, ok: health.body?.ok === true },
    root: { status: root.status },
    guest_boot: { status: guestBoot.status },
    release: {
      status: release.status,
      release_sha: evaluation.release_sha,
      bundle_hash: evaluation.bundle_hash,
    },
  },
  result: evaluation,
};
console.log(JSON.stringify(evidence, null, 2));
if (output) {
  const targetPath = path.resolve(output);
  writeFileSync(targetPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`evidence ${targetPath}`);
}
if (!evaluation.ok) process.exitCode = 1;

async function probe(url, timeout, parseJson) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "cache-control": "no-cache", "user-agent": "forge-sre-health/1" },
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    if (parseJson && text) {
      try { body = JSON.parse(text); } catch { body = null; }
    }
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: null, error: error instanceof Error ? error.name : "UnknownError" };
  } finally {
    clearTimeout(timer);
  }
}
