#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const API_BASE = "https://api.cloudflare.com/client/v4";

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch, stdin = process.stdin) {
  const args = parseArgs(argv);
  const accountId = requireValue(args.account ?? env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID or --account");
  const token = requireValue(env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN");
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
