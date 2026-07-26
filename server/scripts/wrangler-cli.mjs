/**
 * Shared plumbing for the scripts that drive wrangler against REMOTE resources.
 *
 * Extracted rather than duplicated because the Windows spawn rule below is easy to
 * get wrong and hard to notice: it fails only for arguments containing SQL, and only
 * on one platform.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const serverRoot = path.resolve(import.meta.dirname, "..");

/** Wrangler's own entry script — see `wrangler()` for why not `npx`. */
const WRANGLER_BIN = path.join(serverRoot, "node_modules", "wrangler", "bin", "wrangler.js");

export function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/**
 * Runs wrangler and returns stdout, failing loudly rather than continuing past an error.
 *
 * Invokes wrangler's entry script with this Node, NOT `npx` through a shell. On
 * Windows a `.cmd` shim can only be spawned with `shell: true`, and a shell re-parses
 * the arguments — which tears a multi-line `--command` SQL string apart into
 * "Unknown arguments: TABLE, IF, NOT, EXISTS". Spawning the .js keeps every argument
 * intact on both platforms.
 */
export function wrangler(args, { capture = true, input } = {}) {
  const result = spawnSync(process.execPath, [WRANGLER_BIN, ...args], {
    cwd: serverRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    // `secret put` reads the value from stdin. Passing it here rather than as an argv
    // element keeps it out of the process list on a shared machine.
    ...(input === undefined ? {} : { input }),
  });
  if (result.error) fail(`could not start wrangler (${WRANGLER_BIN}): ${result.error.message}`);
  if (result.status !== 0) {
    const detail = capture ? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() : "(output above)";
    fail(`wrangler ${args.join(" ")} exited ${result.status}\n\n${detail}`);
  }
  return result.stdout ?? "";
}

/**
 * Reads a wrangler config. `.jsonc` permits comments, so they are stripped — but only
 * outside string literals, or a `//` inside a URL would eat the rest of the line.
 */
export function readJsonc(file) {
  const text = readFileSync(file, "utf8");
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        out += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    out += char;
  }
  try {
    return JSON.parse(out);
  } catch (error) {
    return fail(`${path.relative(serverRoot, file)} is not valid JSON(C): ${error.message}`);
  }
}

/** The first D1 binding of a wrangler config, so a script cannot drift from the worker. */
export function d1BindingOf(configPath) {
  const config = readJsonc(configPath);
  const database = config.d1_databases?.[0];
  const shown = path.relative(serverRoot, configPath);
  if (!database?.database_name) fail(`${shown} declares no d1_databases[0].database_name`);
  return {
    name: database.database_name,
    id: database.database_id,
    migrationsDir: database.migrations_dir
      ? path.resolve(path.dirname(configPath), database.migrations_dir)
      : null,
    configArg: shown,
  };
}

/** Runs one SQL statement against the remote database and returns its rows. */
export function d1Query(database, sql) {
  const out = wrangler([
    "d1", "execute", database.name,
    "--config", database.configArg,
    "--remote", "--json", "--command", sql,
  ]);
  const start = out.indexOf("[");
  if (start === -1) return fail(`could not parse wrangler --json output:\n${out}`);
  try {
    return JSON.parse(out.slice(start))[0].results;
  } catch (error) {
    return fail(`could not parse wrangler --json output: ${error.message}\n${out}`);
  }
}

/** SQL single-quote escaping, for the literals these scripts build. */
export function quote(value) {
  return String(value).replace(/'/g, "''");
}
