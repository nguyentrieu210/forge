#!/usr/bin/env node
/**
 * Ships an app from a description to a live URL, in one command.
 *
 *   node scripts/forge-app.mjs briefs/crm.json --tenant demo --admin admin@x.vn
 *   node scripts/forge-app.mjs briefs/crm.json --dry-run        # compile + validate only
 *
 * Four steps, all of which used to be manual and two of which did not exist:
 *
 *   1. compile   the brief into a full app package  (scripts/lib/compile-brief.mjs)
 *   2. validate  through the SERVER's own parser, so nothing can fail later for shape
 *   3. install   over HTTP into the tenant — a metadata write, no deploy
 *   4. verify    that the client manifest the runtime will boot from actually resolves
 *
 * Step 4 is not ceremony. An app can install cleanly and still be unopenable: a home route
 * nothing reaches, a context dimension with no master data, nav filtered down to nothing by
 * permissions. Checking it here means "the command succeeded" and "the user can open it"
 * are the same statement.
 *
 * The password is read from FORGE_ADMIN_PASSWORD, never an argument, so it does not land in
 * shell history or in a process listing.
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { compileBrief, BriefError } from "./lib/compile-brief.mjs";
import { readAppSource } from "./lib/read-app-source.mjs";
import { readBriefSource } from "./lib/read-brief-source.mjs";
import { validateBriefSchema } from "./lib/validate-brief-schema.mjs";
import { fail, serverRoot } from "./wrangler-cli.mjs";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const briefPath = args.find((value) => !value.startsWith("--") && !args[args.indexOf(value) - 1]?.startsWith("--"));
const dryRun = args.includes("--dry-run");
const origin = (argOf("origin", process.env.FORGE_ORIGIN) ?? "").replace(/\/$/, "");
const adminUser = argOf("admin", process.env.FORGE_ADMIN_USER);
const adminPassword = process.env.FORGE_ADMIN_PASSWORD;
const outPath = argOf("out");

if (!briefPath) fail("usage: node scripts/forge-app.mjs <brief.json|app-source-dir> [--origin https://…] [--admin user] [--dry-run] [--out package.json]");

// ---- 1. compile ------------------------------------------------------------
/**
 * Two kinds of source, one delivery path.
 *
 * A BRIEF is the short description this tool exists for. An app SOURCE DIRECTORY is the
 * expanded form — full DocType JSON, one file per object — which is what an app becomes
 * once it outgrows what a brief can say (print formats, hooks, hand-tuned metadata).
 *
 * Both ship the same way on purpose. If graduating from a brief meant switching to a
 * different install path, the expanded app would stop getting the checks below, which are
 * the ones that catch "installed cleanly but nobody can open it".
 */
const source = path.resolve(briefPath);
const isDirectory = existsSync(source) && statSync(source).isDirectory();

let pkg;
if (isDirectory) {
  try {
    pkg = await readAppSource(source);
  } catch (error) {
    fail(`${briefPath}: ${error.message}`);
  }
} else {
  let brief;
  try {
    brief = await readBriefSource(source);
  } catch (error) {
    fail(`${briefPath}: ${error.message}`);
  }
  const shapeErrors = await validateBriefSchema(brief);
  if (shapeErrors.length) fail(`BRIEF_SCHEMA_INVALID ${brief.id ?? "?"}:\n  ${shapeErrors.join("\n  ")}`);
  try {
    pkg = compileBrief(brief);
  } catch (error) {
    if (error instanceof BriefError) fail(`BRIEF_INVALID ${brief.id ?? "?"}: ${error.message}`);
    throw error;
  }
}

// ---- 2. validate through the server's parser -------------------------------
let manifest;
try {
  manifest = parseAppManifest(pkg);
} catch (error) {
  // A compiler bug, not an author's mistake — worth saying so, because the two have
  // different fixes and the message alone does not distinguish them.
  fail(`COMPILE_PRODUCED_INVALID_PACKAGE ${pkg.id}: ${error.message}\n  The brief was accepted but the package it produced was not. This is a compiler defect.`);
}

const summary = [
  `app=${manifest.id}@${manifest.version}`,
  `doctypes=${manifest.doctypes.length}`,
  `workflows=${manifest.workflows.length}`,
  `roles=${manifest.roles.length}`,
  `fixtures=${manifest.fixtures.length}`,
  `nav=${manifest.nav.length}`,
].join(" ");
console.log(`1 compiled   ${summary}`);
console.log(`2 validated  through the server's own parser`);

if (outPath) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.resolve(outPath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`  written    ${outPath}`);
}

if (dryRun) {
  console.log(`\nDRY_RUN_PASS ${manifest.id} would install cleanly. Re-run without --dry-run to ship it.`);
  process.exit(0);
}

if (!origin) fail("--origin <https://…> is required to install (the gateway hostname for this tenant)");
if (!adminUser) fail("--admin <user> is required to install");
if (!adminPassword) fail("FORGE_ADMIN_PASSWORD is required in the environment — deliberately not an argument, so it stays out of shell history");

// ---- 3. install ------------------------------------------------------------
/**
 * A cookie session, exactly as a browser holds one.
 *
 * Not a bearer token: this is the same credential path the client uses, so a failure here
 * is a failure the user would also hit. Installing over a token path could succeed while
 * the browser path is broken.
 */
const jar = new Map();
function storeCookies(response) {
  for (const value of response.headers.getSetCookie?.() ?? []) {
    const [pair] = value.split(";");
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}
const cookieHeader = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");

/**
 * The CSRF token, taken from the login response exactly as the browser client does.
 *
 * A cookie session alone is not enough to write: without this header every mutation is
 * refused with a 403, which is the point of the protection. Carrying it here keeps this
 * CLI on the same credential path as a real user rather than on a privileged shortcut.
 */
let csrfToken = "";

async function call(method, body) {
  const response = await fetch(`${origin}/api/method/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(jar.size ? { cookie: cookieHeader() } : {}),
      ...(csrfToken ? { "x-frappe-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  storeCookies(response);
  csrfToken = response.headers.get("x-frappe-csrf-token") ?? csrfToken;
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  if (!response.ok) {
    const detail = parsed?.message ?? parsed?.exception ?? text.slice(0, 400);
    throw new Error(`${method} → HTTP ${response.status}: ${detail}`);
  }
  return parsed?.message ?? parsed;
}

process.stdout.write(`3 installing  ${origin} as ${adminUser} … `);
let result;
try {
  await call("login", { usr: adminUser, pwd: adminPassword });
  result = await call("forge.apps.install", { app: manifest });
} catch (error) {
  console.log("FAILED");
  fail(String(error.message));
}
console.log(`${result.outcome} (${result.doctypes} doctypes, ${result.workflows} workflows, ${result.fixtures} fixtures)`);

// ---- 4. verify the client can boot ----------------------------------------
process.stdout.write(`4 verifying   client manifest resolves … `);
let clientManifest;
try {
  clientManifest = await call("metaforge.api.get_app_manifest", { app: manifest.id });
} catch (error) {
  console.log("FAILED");
  fail(`installed, but the client manifest does not resolve: ${error.message}`);
}

const homeRoute = clientManifest.home?.route ?? (clientManifest.home?.doctype ? `/app/${encodeURIComponent(clientManifest.home.doctype)}` : null);
if (!homeRoute) {
  console.log("FAILED");
  fail("installed, but the client manifest has no reachable home — the app would open to nothing");
}
if (!clientManifest.nav?.length) {
  console.log("FAILED");
  fail(`installed, but ${adminUser} sees no nav entries — check the permissions map in the brief`);
}
console.log(`ok (${clientManifest.nav.length} nav entries, home ${homeRoute})`);

/**
 * Every REQUIRED context dimension must actually have options.
 *
 * This check exists because the app it was written for passed every other one and was
 * still unopenable. A declared dimension whose master data does not exist leaves the shell
 * blocked on "choose a scope" against an empty selector, forever — and the install, the
 * manifest and the nav all look perfect. The brief can fix it by shipping the master
 * records as fixtures, which is why the message says so.
 */
const declared = clientManifest.businessContext?.dimensions ?? [];
if (declared.length) {
  process.stdout.write(`5 verifying   context dimensions have data … `);
  let context;
  try {
    context = await call("metaforge.api.get_business_context", { app_id: manifest.id, dimensions: JSON.stringify(declared) });
  } catch (error) {
    console.log("FAILED");
    fail(`installed, but the context selector does not resolve: ${error.message}`);
  }
  const empty = (context.dimensions ?? []).filter((dimension) => dimension.required && !dimension.enabled);
  if (empty.length) {
    console.log("FAILED");
    fail(`installed, but the app cannot be opened: required dimension(s) ${empty.map((entry) => entry.key).join(", ")} have no master data on this tenant.\n`
      + `  The shell blocks on "choose a scope" against an empty selector, so nobody can get past the first screen.\n`
      + `  Fix it in the brief by shipping the records, then re-run:\n`
      + `    "fixtures": [{ "type": "Company", "name": "Your Co", "data": { "label": "Your Co" } }]`);
  }
  console.log(`ok (${(context.dimensions ?? []).map((entry) => `${entry.key}:${entry.options?.length ?? 0}`).join(" ")})`);
}

console.log(`\nLIVE  ${origin}${homeRoute}`);
console.log(`      ${manifest.name} — open it in a browser and sign in as ${adminUser}.`);
console.log(`\nNo deploy happened. The app is metadata on tenant ${new URL(origin).hostname}; the client bundle was already there.`);
