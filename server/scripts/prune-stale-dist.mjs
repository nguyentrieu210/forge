#!/usr/bin/env node
/**
 * Dọn sản phẩm mồ côi trong `dist/` — vế còn thiếu của biên dịch tăng dần.
 *
 * `tsc --incremental` không xoá `dist/x.js` khi `x.ts` biến mất, và ở repo này thì đó không
 * phải chuyện nhỏ: bộ test chạy TRÊN `dist/`, nên một module đã xoá vẫn import được và vẫn
 * xanh. Đó đúng là kiểu "test trỏ vào code không còn tồn tại" đã ghi trong mốc refactor.
 * Vì thế trước đây mỗi lần chạy test đều phải xoá sạch `dist/` rồi dựng lại 503 file (~14 s).
 *
 * Ở đây rẻ hơn nhiều: đối chiếu từng file sinh ra với file nguồn của nó, xoá cái nào không
 * còn nguồn. Tốn vài chục mili-giây và giữ nguyên tính chất mà `clean` mang lại.
 *
 *   node scripts/prune-stale-dist.mjs [--dry-run]
 */
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const serverRoot = path.resolve(import.meta.dirname, "..");
const dist = path.join(serverRoot, "dist");
const dryRun = process.argv.includes("--dry-run");

/** `dist/apps/x/src/y.js` ← `apps/x/src/y.ts`. Suffix nào cũng quy về đúng một nguồn. */
const SOURCE_SUFFIXES = [
  [".d.ts.map", ".ts"],
  [".d.ts", ".ts"],
  [".js.map", ".ts"],
  [".js", ".ts"],
];

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const removed = [];
for await (const file of walk(dist)) {
  const relative = path.relative(dist, file);
  // `.tsbuildinfo` là sổ ghi của chính tsc, không phải sản phẩm của file nguồn nào.
  if (relative === ".tsbuildinfo") continue;
  const match = SOURCE_SUFFIXES.find(([suffix]) => file.endsWith(suffix));
  if (!match) continue;
  const source = path.join(serverRoot, relative.slice(0, -match[0].length) + match[1]);
  if (await exists(source)) continue;
  // Một số file nguồn là `.json` được `resolveJsonModule` sao chép sang dist.
  if (await exists(source.replace(/\.ts$/, ".json"))) continue;
  removed.push(relative);
  if (!dryRun) await rm(file, { force: true });
}

if (removed.length) {
  console.log(`prune-stale-dist: ${dryRun ? "sẽ xoá" : "đã xoá"} ${removed.length} file mồ côi`);
  for (const file of removed.slice(0, 20)) console.log(`  ${file}`);
  if (removed.length > 20) console.log(`  … và ${removed.length - 20} file nữa`);
}
