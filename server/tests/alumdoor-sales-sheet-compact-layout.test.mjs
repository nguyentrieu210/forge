import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workspace = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesModeWorkspace.tsx", "utf8");
const css = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetCompact.css", "utf8");

test("Alumdoor sales sheet loads the compact centered presentation wrapper", () => {
  assert.match(workspace, /AlumdoorSalesSheetCompact\.css/);
  assert.match(workspace, /alumdoor-sales-sheet-compact/);
  assert.match(css, /margin-inline:\s*auto/);
  assert.match(css, /text-align:\s*center\s*!important/);
});

test("Alumdoor sales sheet keeps business columns compact", () => {
  assert.match(css, /data-cell\$=\":0\"[\s\S]*?14rem/);
  assert.match(css, /data-cell\$=\":6\"[\s\S]*?4\.5rem/);
  assert.match(css, /data-cell\$=\":7\"[\s\S]*?7\.5rem/);
  assert.match(css, /data-cell\$=\":10\"[\s\S]*?8rem/);
});
