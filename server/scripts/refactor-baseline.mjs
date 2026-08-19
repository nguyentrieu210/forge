#!/usr/bin/env node
// Cổng an toàn cho nhánh refactor.
//
// Cây code này ĐỎ SẴN trước khi refactor (xem qa/refactor-baseline.json). Chạy `npm test`
// rồi nhìn "có đỏ" là vô nghĩa: không phân biệt được lỗi vốn có với lỗi vừa gây ra.
// Script này chụp ảnh tập test đang rớt, rồi sau mỗi bước refactor so lại:
//
//   node scripts/refactor-baseline.mjs --record    # chụp ảnh (chỉ chạy khi đã cố ý đổi mốc)
//   node scripts/refactor-baseline.mjs             # so với ảnh đã chụp; NEW fail => exit 1
//
// Cờ:
//   --build    biên dịch lại dist/ trước khi chạy (bắt buộc sau khi sửa .ts)
//   --json     in kết quả so sánh dạng JSON
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const SERVER_ROOT = path.resolve(import.meta.dirname, "..");
const SNAPSHOT = path.join(SERVER_ROOT, "qa", "refactor-baseline.json");
const REPORTER = "./scripts/refactor-baseline-reporter.mjs";

// Tự liệt kê file test: cmd.exe không bung glob, và node cũng không nhận được
// "tests/*.test.mjs" nguyên văn khi đi qua shell trên Windows.
function testFiles() {
  return readdirSync(path.join(SERVER_ROOT, "tests"))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => `tests/${name}`);
}

const args = new Set(process.argv.slice(2));
const record = args.has("--record");
const asJson = args.has("--json");

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: SERVER_ROOT, ...options });
    let stdout = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", () => {});
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
  });
}

async function collect() {
  const { stdout } = await run(process.execPath, [
    "--test",
    `--test-reporter=${REPORTER}`,
    "--test-reporter-destination=stdout",
    ...testFiles(),
  ]);
  const results = new Map();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let entry;
    try { entry = JSON.parse(trimmed); } catch { continue; }
    const key = `${entry.file}::${entry.name}`;
    // Một test rớt ở bất kỳ lần chạy nào thì tính là rớt.
    results.set(key, (results.get(key) ?? true) && entry.ok);
  }
  return results;
}

function failuresOf(results) {
  return [...results].filter(([, ok]) => !ok).map(([key]) => key).sort();
}

const results = await collect();
const total = results.size;
const failures = failuresOf(results);

if (total === 0) {
  console.error("refactor-baseline: không thu được test nào — kiểm tra lại build dist/ và glob.");
  process.exit(2);
}

if (record) {
  mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  writeFileSync(SNAPSHOT, `${JSON.stringify({
    recorded_at: new Date().toISOString(),
    note: "Tập test ĐỎ SẴN tại gốc nhánh refactor. Chỉ ghi lại khi cố ý dời mốc.",
    total,
    failing: failures,
  }, null, 2)}\n`);
  console.log(`refactor-baseline: đã chụp ${failures.length} test rớt / ${total} test.`);
  process.exit(0);
}

if (!existsSync(SNAPSHOT)) {
  console.error(`refactor-baseline: chưa có ${path.relative(SERVER_ROOT, SNAPSHOT)} — chạy --record trước.`);
  process.exit(2);
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
const known = new Set(snapshot.failing);
const introduced = failures.filter((key) => !known.has(key));
const repaired = [...known].filter((key) => !failures.includes(key) && results.has(key));
const vanished = [...known].filter((key) => !results.has(key));

if (asJson) {
  console.log(JSON.stringify({ total, introduced, repaired, vanished }, null, 2));
} else {
  console.log(`refactor-baseline: ${total} test, ${failures.length} rớt (mốc: ${snapshot.failing.length}).`);
  if (repaired.length) console.log(`  + ${repaired.length} test đã xanh trở lại`);
  if (vanished.length) {
    console.log(`  ! ${vanished.length} test trong mốc không còn tồn tại (đổi tên/xoá?):`);
    for (const key of vanished.slice(0, 10)) console.log(`      ${key}`);
  }
  if (introduced.length) {
    console.log(`  ✖ ${introduced.length} test RỚT MỚI do thay đổi trên nhánh này:`);
    for (const key of introduced) console.log(`      ${key}`);
  }
}

process.exit(introduced.length ? 1 : 0);
