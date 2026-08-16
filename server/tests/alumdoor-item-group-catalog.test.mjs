import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALUMDOOR_ITEM_GROUP_CATALOG,
  canonicalAlumdoorItemGroup,
} from "../scripts/lib/alumdoor-item-group-catalog.mjs";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);

// Guard the tree and every active seed/import consumer together so legacy aliases cannot drift back.
const byName = new Map(ALUMDOOR_ITEM_GROUP_CATALOG.map((entry) => [entry.name, entry]));

test("Item Group canonical tree has one root, unique names and valid parents", () => {
  assert.equal(ALUMDOOR_ITEM_GROUP_CATALOG.length, 20);
  assert.equal(byName.size, 20);
  const roots = ALUMDOOR_ITEM_GROUP_CATALOG.filter((entry) => entry.parent === null);
  assert.deepEqual(roots.map((entry) => entry.name), ["Tất cả mặt hàng"]);

  for (const entry of ALUMDOOR_ITEM_GROUP_CATALOG) {
    if (!entry.parent) continue;
    const parent = byName.get(entry.parent);
    assert.ok(parent, `${entry.name}: parent ${entry.parent} must exist`);
    assert.equal(parent.isGroup, true, `${entry.name}: parent ${entry.parent} must be a group node`);
  }
});

test("canonical leaves cover active Alumdoor item builders and STĐ accessory scope", () => {
  const leaves = new Set(
    ALUMDOOR_ITEM_GROUP_CATALOG.filter((entry) => !entry.isGroup).map((entry) => entry.name),
  );
  for (const name of [
    "Cửa CN Đức", "Cửa tấm liền Úc", "Cửa Đài Loan", "Cửa Đài Loan Inox",
    "Cửa Siêu Trường", "Cửa Lưới", "Cửa kéo Đài Loan",
    "Motor", "Bình lưu điện", "Điều khiển & phụ kiện điện", "Linh kiện motor",
    "Nan/lá cửa", "Ray và trục", "Phụ kiện chung", "Phụ kiện CN Đức",
    "Phụ kiện cần sơn tĩnh điện",
  ]) assert.ok(leaves.has(name), `${name} must be a canonical leaf`);
});

test("legacy source labels normalize instead of creating duplicate active groups", () => {
  assert.equal(canonicalAlumdoorItemGroup("Cửa siêu trường"), "Cửa Siêu Trường");
  assert.equal(canonicalAlumdoorItemGroup("Phụ kiện"), "Phụ kiện chung");
  assert.equal(canonicalAlumdoorItemGroup("Mô tơ"), "Motor");
  assert.equal(canonicalAlumdoorItemGroup("Bộ lưu điện"), "Bình lưu điện");
  assert.equal(canonicalAlumdoorItemGroup("Remote và điều khiển"), "Điều khiển & phụ kiện điện");
});

test("local Item Group seed does not disable active aluminium material leaves", () => {
  const sql = readFileSync(resolve(repoRoot, "server/scripts/seed-alumdoor-item-groups-local.sql"), "utf8");
  for (const entry of ALUMDOOR_ITEM_GROUP_CATALOG) assert.ok(sql.includes(`'${entry.name}'`), `${entry.name} missing from local seed`);
  const disabledSection = sql.slice(sql.indexOf("Legacy taxonomy remains recoverable"));
  assert.equal(disabledSection.includes("'Nan/lá cửa'"), false);
  assert.equal(disabledSection.includes("'Ray và trục'"), false);
});

test("obsolete supplement cannot recreate Item Groups under Linh kiện & thiết bị", () => {
  assert.equal(
    existsSync(resolve(repoRoot, "server/imports/alumdoor-item-group-bosung-2026-08-15.sql")),
    false,
  );
});

test("Item import consumers emit canonical group names", () => {
  const itemOnly = readFileSync(resolve(repoRoot, "server/scripts/build-alumdoor-item-only-import.mjs"), "utf8");
  assert.ok(
    itemOnly.includes('if (sourceGroup === "Cửa siêu trường") return "Cửa Siêu Trường";'),
    "item-only import must normalize Cửa siêu trường",
  );
  assert.ok(
    itemOnly.includes('["Cửa Siêu Trường", "Cửa Siêu Trường"]'),
    "door type mapping must use canonical Cửa Siêu Trường key",
  );

  const standardization = readFileSync(resolve(repoRoot, "server/scripts/lib/alumdoor-item-standardization.mjs"), "utf8");
  assert.equal(
    /itemGroup:\s*"Phụ kiện"/.test(standardization),
    false,
    "standardization must emit Phụ kiện chung, not legacy Phụ kiện",
  );
});
