import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("CFMAX-06 routes binary PDF through canonical authorised Print Format rendering", () => {
  const source = read("apps/tenant-worker/src/index-cf6.ts");
  const permissionPath = source.indexOf("frappe.www.printview.get_html_and_style");
  const browserCall = source.indexOf('quickAction("pdf"');

  assert.ok(permissionPath >= 0, "PDF must reuse the canonical print-view route");
  assert.ok(browserCall > permissionPath, "Browser Run must only execute after canonical print authorisation/rendering");
  assert.match(source, /Content-Security-Policy/);
  assert.match(source, /default-src 'none'/);
  assert.match(source, /MAX_RENDER_HTML_BYTES = 4_000_000/);
  assert.match(source, /quickAction\("pdf", \{\s*html,/s, "Browser Run must receive authorised HTML, not a caller supplied URL");
  assert.doesNotMatch(source, /quickAction\("pdf", \{\s*url:/s, "CF6 must not expose arbitrary URL rendering");
  assert.doesNotMatch(source, /env\.FILES\.(put|delete)/, "representative PDF download must not create a competing retained artifact");
  assert.match(source, /cache-control", "private, no-store"/);
  assert.match(source, /x-cloudforge-render-engine", "cloudflare-browser-run"/);
});

test("CFMAX-06 tenant configs bind Browser Run and use the render/export entrypoint", () => {
  const template = read("apps/tenant-worker/wrangler.jsonc");
  const generated = read("scripts/tenant-wrangler.mjs");
  const bindings = read("apps/tenant-worker/worker-configuration.d.ts");

  assert.match(template, /"main": "src\/index-cf6\.ts"/);
  assert.match(template, /"browser": \{ "binding": "BROWSER" \}/);
  assert.match(generated, /main: "src\/index-cf6\.ts"/);
  assert.match(generated, /browser: \{ binding: "BROWSER" \}/);
  assert.match(bindings, /BROWSER: BrowserRun/);
  assert.match(bindings, /import\("\.\/src\/index-cf6"\)/);
});

test("CFMAX-06 client downloads the server-rendered blob instead of rasterising print HTML", () => {
  const container = read("../client/packages/views/src/print/PrintContainer.tsx");

  assert.match(container, /adapter\.downloadPdf\(doctype, name, selectedFormat\)/);
  assert.doesNotMatch(container, /from "\.\/downloadPdf\.js"/);
  assert.doesNotMatch(container, /downloadPrintPdf\(printQ\.data/);
});
