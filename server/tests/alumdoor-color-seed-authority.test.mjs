import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  ALUMDOOR_COLOR_CATALOG,
  ALUMDOOR_LEGACY_COLOR_MAP,
  ALUMDOOR_SURFACE_FINISH_CATALOG,
} from "../scripts/lib/alumdoor-color-catalog.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const builder = join(repoRoot, "server", "scripts", "build-alumdoor-color-correction.mjs");
const pricingSeed = join(repoRoot, "server", "scripts", "seed-alumdoor-pricing-surcharges-local.mjs");

const LEGACY_TO_CANONICAL = new Map([
  ["GS", "GHI SẦN"],
  ["VK", "VÀNG KEM"],
  ["CF", "CAFÉ"],
  ["XF", "XÁM XINGFA"],
  ["4004", "ĐỎ ĐÔ"],
]);

test("Item Color has one canonical catalogue: 4 surface finishes and 25 colors", () => {
  assert.equal(ALUMDOOR_SURFACE_FINISH_CATALOG.length, 4);
  assert.equal(ALUMDOOR_COLOR_CATALOG.length, 25);
  assert.equal(new Set(ALUMDOOR_COLOR_CATALOG.map((row) => row.code)).size, 25);
});

test("legacy color codes are aliases only and resolve to canonical names", () => {
  const canonicalCodes = new Set(ALUMDOOR_COLOR_CATALOG.map((row) => row.code));
  for (const [legacy, canonical] of LEGACY_TO_CANONICAL) {
    assert.equal(ALUMDOOR_LEGACY_COLOR_MAP.get(legacy), canonical, legacy);
    assert.equal(canonicalCodes.has(legacy), false, `${legacy} must not be a canonical Item Color`);
    assert.equal(canonicalCodes.has(canonical), true, `${canonical} must exist in the canonical catalogue`);
  }
});

test("canonical color seed builder upserts canonical records and only migrates/deletes legacy aliases", () => {
  const dir = mkdtempSync(join(tmpdir(), "alumdoor-color-seed-"));
  const sqlPath = join(dir, "colors.sql");
  try {
    const run = spawnSync(process.execPath, [builder, "--tenant", "alu", "--sql", sqlPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);

    const result = JSON.parse(run.stdout);
    assert.equal(result.canonical_colors, 25);
    const sql = readFileSync(sqlPath, "utf8");

    for (const canonicalCode of ["GHI SẦN", "VÀNG KEM", "CAFÉ", "XÁM XINGFA", "ĐỎ ĐÔ", "VAN_GO"]) {
      assert.ok(sql.includes(`Item Color:${canonicalCode}`), `${canonicalCode} must be upserted`);
    }

    assert.ok(sql.includes("Surface Finish:SON_TINH_DIEN"), "SƠN TĨNH ĐIỆN must be upserted");
    assert.ok(sql.includes("Phụ kiện cần sơn tĩnh điện"), "generated Surface Finish payload must include the canonical accessory scope");
    assert.ok(sql.includes("Surface Finish:SON_VAN_GO"), "SƠN VÂN GỖ must be upserted");
    for (const group of ["Cửa CN Đức", "Cửa tấm liền Úc", "Cửa Siêu Trường", "Cửa Đài Loan"]) {
      assert.ok(sql.includes(group), `generated wood-grain scope must include ${group}`);
    }

    for (const [legacy, canonical] of LEGACY_TO_CANONICAL) {
      assert.equal(sql.includes(`Item Color:${legacy}`), false, `${legacy} must never be inserted as Item Color`);
      assert.ok(sql.includes(`WHEN '${legacy}' THEN '${canonical}'`), `${legacy} must migrate to ${canonical}`);
    }

    assert.ok(sql.includes("DELETE FROM documents"));
    assert.ok(sql.includes("doctype='Item Color'"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pricing surcharge seed does not own Item Color and uses canonical wood-grain groups/id", () => {
  const dir = mkdtempSync(join(tmpdir(), "alumdoor-pricing-seed-"));
  const sqlPath = join(dir, "pricing.sql");
  try {
    const run = spawnSync(process.execPath, [pricingSeed, "alu", sqlPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const sql = readFileSync(sqlPath, "utf8");

    assert.equal(sql.includes("Item Color:VÂN GỖ"), false, "pricing seed must not create or overwrite Item Color");
    assert.equal(sql.includes("'Item Color'"), false, "pricing seed must not write Item Color documents");
    assert.ok(sql.includes("Cửa Siêu Trường"));
    assert.equal(sql.includes("Cửa siêu trường"), false);
    assert.ok(sql.includes("PHỤ THU SƠN VÂN GỖ CỬA"));
    assert.ok(sql.includes("465000"));
    assert.ok(sql.includes('"field":"color","operator":"eq","value":"VAN_GO"'));
    assert.ok(sql.includes("PHỤ THU RAY VÂN GỖ"));
    assert.ok(sql.includes("55000"));
    assert.ok(sql.includes("PHỤ THU RAY MÀU KHÁC"));
    assert.ok(sql.includes("PHỤ THU V4 V5 SƠN TĨNH ĐIỆN"));
    assert.ok(sql.includes("PHỤ THU CỬA ÚC 4-7M2"));
    assert.ok(sql.includes("SET_COUNT"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
