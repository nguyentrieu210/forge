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

/** 32 bytes ≈ 256 bits, base64url so it survives any transport unquoted. */
const generate = () => randomBytes(32).toString("base64url");

const INTERNAL_AUTH_SECRET = generate();
const JWT_SECRET = generate();
const SESSION_SECRET = generate();
const INTERNAL_SERVICE_TOKEN = generate();
const CONTROL_TOKEN = generate();

/** Secrets for a Worker deployed normally — `wrangler secret put` reads the value from stdin. */
const PLAIN = [
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

console.log("\n  CONTROL_TOKEN (shown once, not stored anywhere):\n");
console.log(`    ${CONTROL_TOKEN}\n`);
console.log("  Needed for `PUT /v1/routes/<route_key>` on the control plane. Store it now.");
console.log("  Every outstanding session cookie was just invalidated by the new SESSION_SECRET.");
