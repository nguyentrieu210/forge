#!/usr/bin/env node
import path from "node:path";
import { readJsonc, serverRoot } from "./wrangler-cli.mjs";
import { removeTenantConfig, writeTenantConfig } from "./tenant-wrangler.mjs";

const WORKER_CONFIGS = [
  "apps/gateway-worker/wrangler.jsonc",
  "apps/tenant-worker/wrangler.jsonc",
  "apps/query-worker/wrangler.jsonc",
  "apps/jobs-worker/wrangler.jsonc",
  "apps/control-plane-worker/wrangler.jsonc",
  "apps/social-ingress-worker/wrangler.jsonc",
];

function assertObservability(label, config) {
  const observability = config.observability;
  if (!observability?.enabled) throw new Error(`${label}: observability.enabled must be true`);
  if (!observability.logs?.enabled) throw new Error(`${label}: observability.logs.enabled must be true`);
  if (observability.logs.head_sampling_rate !== 1) {
    throw new Error(`${label}: logs head_sampling_rate must remain 1 for complete error evidence`);
  }
  if (!observability.traces?.enabled) throw new Error(`${label}: observability.traces.enabled must be true`);
  const traceRate = Number(observability.traces.head_sampling_rate);
  if (!(traceRate > 0 && traceRate <= 1)) {
    throw new Error(`${label}: traces head_sampling_rate must be in (0,1]`);
  }
}

for (const relative of WORKER_CONFIGS) {
  assertObservability(relative, readJsonc(path.join(serverRoot, relative)));
}

// Production tenant configs are generated rather than committed per tenant. Guard the
// generator too, otherwise demo can have traces while newly provisioned customers do not.
const generated = writeTenantConfig({
  tenant: "sre-observability-check",
  databaseId: "00000000-0000-0000-0000-000000000000",
});
try {
  assertObservability("tenant-wrangler generated config", readJsonc(generated.configPath));
} finally {
  removeTenantConfig(generated.configPath);
}

console.log(`OBSERVABILITY_CONFIG_PASS workers=${WORKER_CONFIGS.length}+generated-tenant logs=100% traces=enabled`);
