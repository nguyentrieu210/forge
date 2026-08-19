#!/usr/bin/env node
// Cổng an toàn phía client, song sinh với server/scripts/refactor-baseline.mjs.
//
// Client cũng ĐỎ SẴN, và `pnpm --dir client test` dừng ngay ở selfcheck đầu tiên nên phần
// sau không bao giờ chạy. Hệ quả: mỗi lần sửa xong lại phải `git stash` để biết một test đỏ
// là lỗi mới hay lỗi vốn có — đúng một lần như thế đã đủ tốn.
//
//   node scripts/refactor-baseline-client.mjs --record   # chốt mốc
//   node scripts/refactor-baseline-client.mjs            # so mốc; RỚT MỚI => exit 1
//   node scripts/refactor-baseline-client.mjs --only <chuỗi>
//
// Chỉ gom các file `tests/*.test.mjs` của workspace client. Selfcheck dạng tsx không nằm
// trong đây: chúng dừng ở lỗi đầu tiên nên không cho ra danh sách so được.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const CLIENT_ROOT = path.resolve(import.meta.dirname, "..");
const SNAPSHOT = path.join(CLIENT_ROOT, "qa", "refactor-baseline-client.json");
// Trên Windows, đường dẫn tuyệt đối không dùng được làm module specifier — phải là file:// URL.
const REPORTER = pathToFileURL(path.join(CLIENT_ROOT, "..", "server", "scripts", "refactor-baseline-reporter.mjs")).href;

const argv = process.argv.slice(2);
const record = argv.includes("--record");
const onlyIndex = argv.indexOf("--only");
const only = onlyIndex >= 0 ? argv[onlyIndex + 1] : undefined;

function testFiles() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (["node_modules", "dist", ".vite", "vendor"].includes(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".test.mjs")) {
        found.push(path.join(dir, entry.name));
      }
    }
  };
  for (const top of ["packages", "apps"]) walk(path.join(CLIENT_ROOT, top));
  return found
    .map((file) => path.relative(CLIENT_ROOT, file).split(path.sep).join("/"))
    .filter((file) => (only ? file.includes(only) : true))
    .sort();
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: CLIENT_ROOT });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", () => resolve(stdout));
  });
}

const files = testFiles();
if (!files.length) {
  console.error("refactor-baseline-client: không thấy file test nào.");
  process.exit(2);
}

const stdout = await run(["--test", `--test-reporter=${REPORTER}`, "--test-reporter-destination=stdout", ...files]);
const results = new Map();
for (const line of stdout.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) continue;
  let entry;
  try { entry = JSON.parse(trimmed); } catch { continue; }
  const key = `${entry.file}::${entry.name}`;
  results.set(key, (results.get(key) ?? true) && entry.ok);
}

const failures = [...results].filter(([, ok]) => !ok).map(([key]) => key).sort();

if (record) {
  if (only) {
    console.error("refactor-baseline-client: --record không đi cùng --only.");
    process.exit(2);
  }
  mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  writeFileSync(SNAPSHOT, `${JSON.stringify({
    recorded_at: new Date().toISOString(),
    note: "Tập test client ĐỎ SẴN. Chỉ ghi lại khi cố ý dời mốc.",
    total: results.size,
    failing: failures,
  }, null, 2)}\n`);
  console.log(`refactor-baseline-client: đã chụp ${failures.length} test rớt / ${results.size} test.`);
  process.exit(0);
}

if (!existsSync(SNAPSHOT)) {
  console.error("refactor-baseline-client: chưa có qa/refactor-baseline-client.json — chạy --record trước.");
  process.exit(2);
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
const scope = (key) => (only ? key.split("::", 1)[0].includes(only) : true);
const known = new Set(snapshot.failing.filter(scope));
const introduced = failures.filter((key) => !known.has(key));
const repaired = [...known].filter((key) => results.has(key) && !failures.includes(key));

console.log(`refactor-baseline-client${only ? ` [--only ${only}]` : ""}: ${results.size} test, ${failures.length} rớt (mốc: ${known.size}).`);
if (repaired.length) console.log(`  + ${repaired.length} test đã xanh trở lại`);
if (introduced.length) {
  console.log(`  ✖ ${introduced.length} test RỚT MỚI:`);
  for (const key of introduced) console.log(`      ${key}`);
}
process.exit(introduced.length ? 1 : 0);
