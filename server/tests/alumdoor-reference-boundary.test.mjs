import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../apps-src/alumdoor-worker/src/", import.meta.url));

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && /\.(?:ts|mts|js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files.sort();
}

function importSpecifiers(source) {
  return [
    ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);
}

test("Alumdoor app Worker stays behind the public platform boundary", async () => {
  const files = await sourceFiles(sourceRoot);
  assert.ok(files.length >= 10, "expected the reference vertical worker source tree");

  const nonRelative = [];
  const directPackagePaths = [];
  let combined = "";

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const display = relative(sourceRoot, file).replaceAll("\\", "/");
    combined += `\n/* ${display} */\n${source}`;

    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        nonRelative.push(`${display}: ${specifier}`);
      }
      if (specifier.includes("/packages/") || specifier.startsWith("@metaforge/") || specifier.startsWith("@cloudforge/")) {
        directPackagePaths.push(`${display}: ${specifier}`);
      }
    }
  }

  assert.deepEqual(
    nonRelative,
    [],
    `Alumdoor Worker must compose Forge through public HTTP/callback contracts, not shared implementation imports:\n${nonRelative.join("\n")}`,
  );
  assert.deepEqual(
    directPackagePaths,
    [],
    `Alumdoor Worker imported shared implementation packages directly:\n${directPackagePaths.join("\n")}`,
  );

  assert.match(combined, /x-cloudforge-callback/i, "worker must receive a Forge callback surface");
  assert.match(combined, /x-cloudforge-identity/i, "worker must preserve caller identity across the callback");
  assert.match(combined, /\bPLATFORM\??:\s*Fetcher\b/, "worker must use the injected platform Fetcher binding when available");
  assert.doesNotMatch(combined, /\bD1Database(?:Session)?\b/, "vertical worker must not bind tenant D1 directly");
});

test("Alumdoor reference contract keeps ledger ownership outside the vertical", async () => {
  const contract = await readFile(new URL("../../docs/ALUMDOOR-REFERENCE-VERTICAL-CONTRACT.md", import.meta.url), "utf8");
  for (const invariant of [
    "Stock Ledger",
    "Payment Ledger",
    "allocation tables",
    "must never keep a competing payable balance",
    "shared runtime/kernel does not gain a new Alumdoor special-case",
  ]) {
    assert.match(contract, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
