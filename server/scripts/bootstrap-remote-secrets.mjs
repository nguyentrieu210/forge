#!/usr/bin/env node
/**
 * Generates every platform secret and installs it on the deployed Workers.
 *
 *   node scripts/bootstrap-remote-secrets.mjs --account <id> \
 *     [--namespace cloudforge-production] [--tenant-script cloudforge-tenant-demo]
 *
 * Run AFTER `wrangler deploy`: a secret cannot be attached to a Worker that does
 * not exist yet.
 *
 * Values are generated here, held in memory, and pushed straight to Cloudflare. None
 * is written to a file, so there is nothing to forget to delete — with one exception:
 * CONTROL_TOKEN is printed once, because it is the only credential a human needs
 * afterwards (the Control Plane API has no other way in).
 *
 * WHICH SECRET GOES WHERE MATTERS. Three of these are shared between two Workers and
 * are worthless unless both hold the SAME value:
 *
 *   INTERNAL_AUTH_SECRET    gateway  + tenant   the gateway signs the trusted
 *                                              identity, the tenant verifies it
 *   JWT_SECRET              gateway  + query    both verify the same bearer tokens
 *   INTERNAL_SERVICE_TOKEN  jobs     + tenant   jobs authenticates its event callback
 *   SESSION_SECRET          tenant             signs Frappe `sid` cookies
 *   CONTROL_TOKEN           control-plane      guards route provisioning
 *
 * A mismatch does not fail at deploy time. It fails later as an authentication error
 * on every request, which reads like a code fault — so this script is the only
 * supported way to set them.
 *
 * RE-RUNNING ROTATES EVERYTHING. That is safe but not free: a new SESSION_SECRET
 * invalidates every outstanding `sid` cookie, so all users are logged out.
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fail, serverRoot, wrangler } from "./wrangler-cli.mjs";
import { main as dispatchSecret, readStoredWranglerToken } from "./manage-dispatch-secrets.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const account = argOf("account", process.env.CLOUDFLARE_ACCOUNT_ID);
if (!account) fail("bootstrap-remote-secrets: --account <id> (or CLOUDFLARE_ACCOUNT_ID) is required");
const namespace = argOf("namespace", "cloudforge-production");
const tenantScript = argOf("tenant-script", "cloudforge-tenant-demo");
/** Set the tenant Worker's secrets only, leaving the shared platform Workers alone. */
const tenantOnly = args.includes("--tenant-only");

/** 32 bytes ≈ 256 bits, base64url so it survives any transport unquoted. */
const generate = () => randomBytes(32).toString("base64url");

/**
 * Existing value if the operator supplied one, otherwise a fresh one.
 *
 * THIS IS WHAT MAKES A SECOND TENANT POSSIBLE. Three of these are shared and are
 * worthless unless every holder has the SAME value, but a Cloudflare secret is
 * write-only — it can never be read back. So a tenant added later cannot discover what
 * the gateway is using: either the operator supplies it, or the whole platform has to
 * be rotated (logging every user out) just to add one customer.
 *
 * Generated values are therefore printed once at the end. Storing them is not
 * optional; it is the difference between adding a tenant and re-keying the platform.
 */
const reused = new Set();
function secret(name) {
  const supplied = process.env[`FORGE_${name}`];
  if (supplied) {
    reused.add(name);
    return supplied.trim();
  }
  return generate();
}

const INTERNAL_AUTH_SECRET = secret("INTERNAL_AUTH_SECRET");
const JWT_SECRET = secret("JWT_SECRET");
const INTERNAL_SERVICE_TOKEN = secret("INTERNAL_SERVICE_TOKEN");
const CONTROL_TOKEN = secret("CONTROL_TOKEN");
// Never reused across tenants: it signs one tenant's session cookies, and sharing it
// would let a cookie minted for one customer be presented to another.
const SESSION_SECRET = generate();

/** Secrets for a Worker deployed normally — `wrangler secret put` reads the value from stdin. */
const PLAIN = tenantOnly ? [] : [
  ["gateway-worker", { INTERNAL_AUTH_SECRET, JWT_SECRET }],
  ["query-worker", { JWT_SECRET }],
  ["jobs-worker", { INTERNAL_SERVICE_TOKEN }],
  ["control-plane-worker", { CONTROL_TOKEN }],
];

/**
 * The tenant Worker lives inside a dispatch namespace, where `wrangler secret put`
 * cannot reach it — the command has no --dispatch-namespace option. Those go through
 * the Workers for Platforms secrets endpoint instead.
 */
const DISPATCH = { INTERNAL_AUTH_SECRET, SESSION_SECRET, INTERNAL_SERVICE_TOKEN };

console.log(`account   ${account}`);
console.log(`namespace ${namespace}`);
console.log(`tenant    ${tenantScript}\n`);

for (const [app, secrets] of PLAIN) {
  const config = path.join("apps", app, "wrangler.jsonc");
  for (const [name, value] of Object.entries(secrets)) {
    process.stdout.write(`${app.padEnd(22)} ${name.padEnd(24)} … `);
    // Passed on stdin, never as an argv element: argv is visible in the process
    // list of a shared machine.
    wrangler(["secret", "put", name, "--config", config], { input: value });
    console.log("ok");
  }
}

if (!process.env.CLOUDFLARE_API_TOKEN && !readStoredWranglerToken(process.env)) {
  fail("no Cloudflare credential found for the Workers for Platforms API — run `wrangler login` or set CLOUDFLARE_API_TOKEN");
}

for (const [name, value] of Object.entries(DISPATCH)) {
  process.stdout.write(`${tenantScript.padEnd(22)} ${name.padEnd(24)} … `);
  await dispatchSecret(
    ["put", "--account", account, "--namespace", namespace, "--script", tenantScript, "--name", name, "--stdin"],
    process.env,
    fetch,
    // A one-shot stream, so the value stays out of argv here too.
    (async function* () { yield value; })(),
  );
}

const generated = Object.entries({ INTERNAL_AUTH_SECRET, JWT_SECRET, INTERNAL_SERVICE_TOKEN, CONTROL_TOKEN })
  .filter(([name]) => !reused.has(name));

console.log("\n  Reused from the environment (unchanged):");
console.log(`    ${[...reused].join(", ") || "(none — every value below is new)"}\n`);

if (generated.length) {
  console.log("  GENERATED — shown once, stored nowhere. Save these NOW:\n");
  for (const [name, value] of generated) console.log(`    FORGE_${name}=${value}`);
  console.log(`\n  Pass them back as FORGE_* environment variables when adding the next tenant.`);
  console.log("  Without them a new tenant forces a full platform re-key, which logs every user out.");
}

console.log(`\n  SESSION_SECRET for ${tenantScript} is always fresh — that tenant's users are logged out.`);
if (!reused.has("INTERNAL_AUTH_SECRET")) {
  console.log("  INTERNAL_AUTH_SECRET changed, so EVERY other tenant Worker must be given the new");
  console.log("  value too, or the gateway's signed identity will not verify against them.");
}
