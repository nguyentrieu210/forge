#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { readJsonc, serverRoot } from "./wrangler-cli.mjs";

const repoRoot = path.resolve(serverRoot, "..");
const manifestPath = path.join(serverRoot, "config", "cloudflare-governance.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const jsonOutput = process.argv.includes("--json");

const fail = (message) => {
  throw new Error(`CF08 governance: ${message}`);
};

if (manifest.schema !== "forge-cloudflare-governance/v1") {
  fail(`unsupported manifest schema ${manifest.schema ?? "<missing>"}`);
}
if (!Array.isArray(manifest.config_sources) || manifest.config_sources.length === 0) {
  fail("config_sources must be a non-empty array");
}
if (!Array.isArray(manifest.authority_classes) || manifest.authority_classes.length === 0) {
  fail("authority_classes must be declared");
}

const authorityClasses = new Set(manifest.authority_classes);
const configuredPaths = new Set(manifest.config_sources.map((entry) => normalize(entry.path)));
const discoveredPaths = new Set([
  ...discoverWrangler(path.join(serverRoot, "apps")),
  ...discoverWrangler(path.join(serverRoot, "apps-src")),
  ...discoverWrangler(path.join(repoRoot, "qa", "browser-worker")),
].map((entry) => normalize(path.relative(repoRoot, entry))));

for (const discovered of discoveredPaths) {
  if (!configuredPaths.has(discovered)) fail(`unclassified Wrangler config: ${discovered}`);
}
for (const configured of configuredPaths) {
  if (!discoveredPaths.has(configured)) fail(`manifest references missing Wrangler config: ${configured}`);
}

const inventory = [];
const compatibilityDates = new Set();
let ownerDependencyCount = 0;

for (const entry of manifest.config_sources) {
  validateManifestEntry(entry);
  const absolutePath = path.join(repoRoot, entry.path);
  if (!existsSync(absolutePath)) fail(`missing source ${entry.path}`);

  const source = readFileSync(absolutePath);
  const actualBlobSha = gitBlobSha(source);
  if (actualBlobSha !== entry.expected_blob_sha) {
    fail(`${entry.path}: source drift ${entry.expected_blob_sha} -> ${actualBlobSha}; review the config change and update the governance manifest deliberately`);
  }

  const config = readJsonc(absolutePath);
  if (!config.name) fail(`${entry.path}: Worker name is required`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date ?? "")) {
    fail(`${entry.path}: compatibility_date must be explicitly pinned as YYYY-MM-DD`);
  }
  if (config.compatibility_date !== entry.compatibility_date) {
    fail(`${entry.path}: compatibility_date drift ${entry.compatibility_date} -> ${config.compatibility_date}`);
  }
  compatibilityDates.add(config.compatibility_date);

  assertNoSecretLikeVars(entry.path, config.vars);
  if (entry.observability === "required") assertObservability(entry.path, config);
  if (entry.observability === "owner-dependency") ownerDependencyCount += 1;

  inventory.push({
    source: entry.path,
    source_blob_sha: actualBlobSha,
    environment: entry.declared_environment,
    role: entry.role,
    authority: entry.authority,
    owner: entry.owner,
    tenant_scope: entry.tenant_scope,
    worker: config.name,
    compatibility_date: config.compatibility_date,
    compatibility_flags: config.compatibility_flags ?? [],
    observability: entry.observability,
    resource_inventory: resourceInventory(config),
  });
}

for (const generated of manifest.generated_sources ?? []) {
  if (!authorityClasses.has(generated.authority)) {
    fail(`${generated.path}: unknown generated authority class ${generated.authority}`);
  }
  const absolutePath = path.join(repoRoot, generated.path);
  if (!existsSync(absolutePath)) fail(`missing generated-source authority ${generated.path}`);
  const actualBlobSha = gitBlobSha(readFileSync(absolutePath));
  if (actualBlobSha !== generated.expected_blob_sha) {
    fail(`${generated.path}: generator drift ${generated.expected_blob_sha} -> ${actualBlobSha}; review generated production config semantics before updating the manifest`);
  }
}

const resourceCount = inventory.reduce(
  (sum, worker) => sum + Object.values(worker.resource_inventory).reduce((n, resources) => n + resources.length, 0),
  0,
);

const result = {
  schema: "forge-cloudflare-resource-inventory/v1",
  generated_at: null,
  remote_observation: manifest.remote_observation?.status ?? "unverified",
  source_lock: manifest.source_lock,
  compatibility_date_policy: manifest.compatibility_date_policy,
  summary: {
    committed_configs: inventory.length,
    generated_authorities: (manifest.generated_sources ?? []).length,
    resources: resourceCount,
    compatibility_dates: [...compatibilityDates].sort(),
    owner_dependencies: ownerDependencyCount,
  },
  configs: inventory,
};

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(
    `CLOUDFLARE_GOVERNANCE_PASS configs=${result.summary.committed_configs}` +
    ` generated_authorities=${result.summary.generated_authorities}` +
    ` resources=${result.summary.resources}` +
    ` compatibility_dates=${result.summary.compatibility_dates.join(",")}` +
    ` remote_observation=${result.remote_observation}` +
    ` owner_dependencies=${result.summary.owner_dependencies}`,
  );
}

function validateManifestEntry(entry) {
  for (const key of [
    "path",
    "expected_blob_sha",
    "declared_environment",
    "role",
    "authority",
    "tenant_scope",
    "compatibility_date",
    "observability",
    "owner",
  ]) {
    if (!entry[key]) fail(`config source missing ${key}: ${JSON.stringify(entry)}`);
  }
  if (!authorityClasses.has(entry.authority)) {
    fail(`${entry.path}: unknown authority class ${entry.authority}`);
  }
  if (entry.authority === "dashboard-manual-exception" && !entry.reason) {
    fail(`${entry.path}: dashboard-manual-exception requires an explicit reason`);
  }
  if (!/^[0-9a-f]{40}$/.test(entry.expected_blob_sha)) {
    fail(`${entry.path}: expected_blob_sha must be a Git blob SHA`);
  }
}

function discoverWrangler(root) {
  if (!existsSync(root)) return [];
  const found = [];
  for (const name of readdirSync(root)) {
    const absolute = path.join(root, name);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      found.push(...discoverWrangler(absolute));
      continue;
    }
    if (!/^wrangler(?:\..+)?\.jsonc$/i.test(name)) continue;
    // Production tenant configs are ephemeral artifacts from tenant-wrangler.mjs.
    // They may exist while local verification runs and must never become a second
    // committed configuration authority.
    if (/\.generated\.jsonc$/i.test(name)) continue;
    found.push(absolute);
  }
  return found;
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, "utf8");
  return createHash("sha1").update(header).update(buffer).digest("hex");
}

function normalize(value) {
  return String(value).replaceAll("\\", "/");
}

function assertNoSecretLikeVars(label, vars) {
  if (!vars || typeof vars !== "object") return;
  const secretKey = /(^|_)(SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN|API_TOKEN|CLIENT_SECRET|BEARER_TOKEN)($|_)/i;
  for (const key of Object.keys(vars)) {
    if (secretKey.test(key)) {
      fail(`${label}: secret-like key ${key} must be a Worker secret, not source-controlled vars`);
    }
  }
}

function assertObservability(label, config) {
  const observability = config.observability;
  if (!observability?.enabled) fail(`${label}: observability.enabled must be true`);
  if (!observability.logs?.enabled) fail(`${label}: observability.logs.enabled must be true`);
  if (observability.logs.head_sampling_rate !== 1) {
    fail(`${label}: logs head_sampling_rate must remain 1 for complete error evidence`);
  }
  if (!observability.traces?.enabled) fail(`${label}: observability.traces.enabled must be true`);
  const traceRate = Number(observability.traces.head_sampling_rate);
  if (!(traceRate > 0 && traceRate <= 1)) {
    fail(`${label}: traces head_sampling_rate must be in (0,1]`);
  }
}

function resourceInventory(config) {
  const resources = {
    assets: [],
    browser: [],
    d1: [],
    durable_objects: [],
    kv: [],
    r2: [],
    queue_producers: [],
    queue_consumers: [],
    dispatch_namespaces: [],
    service_bindings: [],
    ai: [],
    routes: [],
    crons: [],
    analytics_engine: [],
    vectorize: [],
    hyperdrive: [],
    workflows: [],
    pipelines: [],
    containers: [],
  };

  if (config.assets?.binding || config.assets?.directory) {
    resources.assets.push({ binding: config.assets.binding ?? null, directory: config.assets.directory ?? null });
  }
  if (config.browser?.binding) resources.browser.push({ binding: config.browser.binding });

  for (const item of config.d1_databases ?? []) {
    resources.d1.push({
      binding: item.binding,
      logical_name: item.database_name ?? null,
      identifier_present: Boolean(item.database_id),
      migrations_dir: item.migrations_dir ?? null,
    });
  }
  for (const item of config.durable_objects?.bindings ?? []) {
    resources.durable_objects.push({ binding: item.name, class_name: item.class_name, script_name: item.script_name ?? null });
  }
  for (const item of config.kv_namespaces ?? []) {
    resources.kv.push({ binding: item.binding, identifier_present: Boolean(item.id) });
  }
  for (const item of config.r2_buckets ?? []) {
    resources.r2.push({ binding: item.binding, logical_name: item.bucket_name ?? null });
  }
  for (const item of config.queues?.producers ?? []) {
    resources.queue_producers.push({ binding: item.binding, logical_name: item.queue ?? null });
  }
  for (const item of config.queues?.consumers ?? []) {
    resources.queue_consumers.push({
      logical_name: item.queue ?? null,
      max_batch_size: item.max_batch_size ?? null,
      max_batch_timeout: item.max_batch_timeout ?? null,
      max_retries: item.max_retries ?? null,
      dead_letter_queue: item.dead_letter_queue ?? null,
      max_concurrency: item.max_concurrency ?? null,
    });
  }
  for (const item of config.dispatch_namespaces ?? []) {
    resources.dispatch_namespaces.push({ binding: item.binding, logical_name: item.namespace ?? null, remote: Boolean(item.remote) });
  }
  for (const item of config.services ?? []) {
    resources.service_bindings.push({ binding: item.binding, logical_name: item.service ?? null, remote: Boolean(item.remote) });
  }
  if (config.ai?.binding) resources.ai.push({ binding: config.ai.binding });
  for (const item of config.routes ?? []) {
    resources.routes.push({ pattern: typeof item === "string" ? item : item.pattern, custom_domain: Boolean(item.custom_domain) });
  }
  for (const cron of config.triggers?.crons ?? []) resources.crons.push({ schedule: cron });

  for (const item of config.analytics_engine_datasets ?? []) {
    resources.analytics_engine.push({ binding: item.binding, dataset: item.dataset ?? null });
  }
  for (const item of config.vectorize ?? []) {
    resources.vectorize.push({ binding: item.binding, index_name: item.index_name ?? null });
  }
  for (const item of config.hyperdrive ?? []) {
    resources.hyperdrive.push({ binding: item.binding, identifier_present: Boolean(item.id) });
  }
  for (const item of config.workflows ?? []) {
    resources.workflows.push({ binding: item.binding, name: item.name ?? null, class_name: item.class_name ?? null });
  }
  for (const item of config.pipelines ?? []) {
    resources.pipelines.push({ binding: item.binding, pipeline: item.pipeline ?? item.pipeline_name ?? null });
  }
  for (const item of config.containers ?? []) {
    resources.containers.push({ binding: item.binding ?? item.name ?? null, class_name: item.class_name ?? null });
  }

  return resources;
}
