#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const API_BASE = "https://api.cloudflare.com/client/v4";

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
  stdin = process.stdin,
  storedToken = readStoredWranglerToken,
) {
  const args = parseArgs(argv);
  const accountId = requireValue(args.account ?? env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID or --account");
  // `wrangler login` (the default auth path) stores an OAuth token and never sets
  // CLOUDFLARE_API_TOKEN, so requiring the env var alone made this script unusable
  // for exactly the people most likely to reach for it. The API accepts either as a
  // bearer credential, so an explicit API token still wins and the OAuth token is
  // only a fallback.
  const token = requireValue(
    env.CLOUDFLARE_API_TOKEN ?? storedToken(env),
    "CLOUDFLARE_API_TOKEN (or a `wrangler login` session)",
  );
  const namespace = requireValue(args.namespace ?? env.CLOUDFLARE_DISPATCH_NAMESPACE, "--namespace or CLOUDFLARE_DISPATCH_NAMESPACE");
  const script = requireValue(args.script, "--script");
  const base = `${API_BASE}/accounts/${encodeURIComponent(accountId)}/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(script)}/secrets`;

  if (args.command === "list") {
    const result = await request(fetchImpl, base, token, { method: "GET" });
    const names = Array.isArray(result) ? result.map((item) => item?.name).filter((x) => typeof x === "string") : [];
    process.stdout.write(`${JSON.stringify({ ok: true, script, namespace, secrets: names.sort() })}\n`);
    return;
  }

  if (args.command !== "put") throw new Error("Usage: manage-dispatch-secrets.mjs put|list --namespace <ns> --script <name> [--name <binding>] [--from-env <ENV>|--from-file <path>|--stdin]");
  const name = requireBindingName(args.name);
  const text = await readSecret(args, env, stdin);
  if (!text) throw new Error("Secret value must not be empty");
  await request(fetchImpl, base, token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, text, type: "secret_text" }),
  });
  // Never echo the value or a response object that may include it.
  process.stdout.write(`${JSON.stringify({ ok: true, script, namespace, secret: name })}\n`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith("--")) throw new Error(`Unexpected argument ${token}`);
    const key = token.slice(2).replaceAll("-", "_");
    if (key === "stdin") { args.stdin = true; continue; }
    const value = rest[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    args[key] = value;
  }
  return args;
}

async function readSecret(args, env, stdin) {
  const sources = [Boolean(args.from_env), Boolean(args.from_file), Boolean(args.stdin)].filter(Boolean).length;
  if (sources !== 1) throw new Error("Choose exactly one of --from-env, --from-file or --stdin");
  if (args.from_env) return String(requireValue(env[args.from_env], args.from_env)).trimEnd();
  if (args.from_file) return (await readFile(args.from_file, "utf8")).trimEnd();
  const chunks = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trimEnd();
}

async function request(fetchImpl, url, token, init) {
  const headers = new Headers(init.headers ?? {});
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept", "application/json");
  const response = await fetchImpl(url, { ...init, headers });
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || body?.success === false) {
    const errors = Array.isArray(body?.errors) ? body.errors.map((x) => x?.message).filter(Boolean).join("; ") : "";
    throw new Error(`Cloudflare API request failed (${response.status})${errors ? `: ${errors}` : ""}`);
  }
  return body?.result ?? body;
}

/**
 * The OAuth token `wrangler login` left behind, or undefined.
 *
 * Injected as a parameter of `main` so tests never touch a real developer's
 * credentials, and returns undefined rather than throwing on every miss — an absent
 * session is a normal state, reported once by `requireValue`.
 *
 * An expired token IS reported, because letting it through produces an opaque
 * "Cloudflare API request failed (401)" that reads like a permissions problem.
 */
export function readStoredWranglerToken(env = process.env) {
  const candidates = [
    env.WRANGLER_HOME && path.join(env.WRANGLER_HOME, "config", "default.toml"),
    env.XDG_CONFIG_HOME && path.join(env.XDG_CONFIG_HOME, ".wrangler", "config", "default.toml"),
    // Wrangler's Windows default: %APPDATA%\xdg.config\.wrangler\…
    env.APPDATA && path.join(env.APPDATA, "xdg.config", ".wrangler", "config", "default.toml"),
    path.join(homedir(), ".config", ".wrangler", "config", "default.toml"),
    path.join(homedir(), ".wrangler", "config", "default.toml"),
  ].filter(Boolean);

  for (const file of candidates) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const token = text.match(/^\s*oauth_token\s*=\s*"([^"]+)"/m)?.[1];
    if (!token) continue;
    const expiry = text.match(/^\s*expiration_time\s*=\s*"([^"]+)"/m)?.[1];
    if (expiry && Date.parse(expiry) < Date.now()) {
      throw new Error(
        `the stored wrangler session expired at ${expiry} — run any wrangler command (or \`wrangler login\`) to refresh it, or set CLOUDFLARE_API_TOKEN`,
      );
    }
    return token;
  }
  return undefined;
}

function requireValue(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function requireBindingName(value) {
  const name = requireValue(value, "--name");
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new Error("--name must be an uppercase Worker binding identifier");
  return name;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
