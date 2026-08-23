import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

test("sales child preview derives geometry visibility from Geometry Profile runtime", () => {
  const source = read("server/apps-src/alumdoor-worker/src/ui-child-preview.ts");
  assert.match(source, /readGeometryProfileRuntime/);
  assert.match(source, /runtime_fieldname/);
  assert.match(source, /sequence/);
  assert.match(source, /dealer_width_basis/);
  assert.match(source, /retail_width_basis/);
  assert.doesNotMatch(source, /function customerWidthField/);
  assert.doesNotMatch(source, /function salesWidthField/);
  assert.doesNotMatch(source, /function usesMeshHeight/);
});

test("sales client no longer decides ray-vs-plastic width from door/customer names", () => {
  const source = read("client/packages/vertical-alumdoor/src/sales-order-v2/model.ts");
  const start = source.indexOf("export function salesWidthInputField");
  assert.ok(start >= 0);
  const end = source.indexOf("\n}\n", start);
  const fn = source.slice(start, end + 2);
  assert.match(fn, /fieldOverride/);
  assert.doesNotMatch(fn, /Cửa|cua |Lẻ|Đại lý|customerGroup\) ===/);
});

test("geometry runtime keeps a stable schema even while row values are empty", () => {
  const source = read("server/apps-src/alumdoor-worker/src/ui-child-preview.ts");
  assert.match(source, /applyGeometryRuntimeOverrides/);
  assert.match(source, /visible/);
  assert.match(source, /required/);
  assert.match(source, /editable/);
  assert.match(source, /CALCULATED/);
});

test("non-geometry sales rules remain explicitly outside Geometry Profile authority", () => {
  const source = read("server/apps-src/alumdoor-worker/src/ui-child-preview.ts");
  assert.match(source, /has_butterfly_bracket/);
  assert.match(source, /ray_type/);
  assert.match(source, /deriveLinearSalesBasis/);
});
