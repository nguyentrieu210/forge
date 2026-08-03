import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const surfacePath = fileURLToPath(new URL("../src/data-surface/v3.ts", import.meta.url));
const workspacePath = fileURLToPath(new URL("../src/app/DoctypeWorkspace.tsx", import.meta.url));
const surface = readFileSync(surfacePath, "utf8");
const workspace = readFileSync(workspacePath, "utf8");

test("V3 data surface covers the canonical everyday business surfaces", () => {
  for (const marker of [
    "mf-list-view",
    "mf-list-toolbar",
    "mf-list-scroll",
    "mf-list-mobile",
    "mf-bulk-bar",
    "mf-form-view",
    "mf-form-header",
    "mf-form-section",
    "mf-form-footer",
    "mf-split",
    "mf-context-panel",
    "mf-context-tabs",
  ]) {
    assert.match(surface, new RegExp(marker), `missing V3 presentation seam for ${marker}`);
  }
});

test("V3 data surface stays generic and presentation-only", () => {
  for (const literal of ["Alumdoor", "Purchase Order", "Sales Invoice", "Item Price", "Warehouse Cash"]) {
    assert.equal(surface.includes(literal), false, `generic V3 surface leaked domain literal: ${literal}`);
  }
  for (const authoritySmell of ["fetch(", "adapter.", "onSave", "onSubmit", "useMutation", "DocumentKernel", "docstatus"]) {
    assert.equal(surface.includes(authoritySmell), false, `presentation helper contains authority smell: ${authoritySmell}`);
  }
});

test("DoctypeWorkspace activates V3 without replacing canonical renderers", () => {
  assert.match(workspace, /className=\{V3_DATA_SURFACE_CLASS\}/);
  assert.match(workspace, /data-ui-version="v3"/);
  assert.match(workspace, /<ListContainer/);
  assert.match(workspace, /<FormContainer/);
  assert.match(workspace, /<ContextContainer/);
  assert.match(workspace, /<NewFormContainer/);
  assert.match(workspace, /<BulkGridContainer/);
});

test("V3 quick entry preserves dirty-close guard and reduced-motion behavior", () => {
  assert.match(workspace, /onInteractOutside=\{\(event\) => \{ event\.preventDefault\(\); setCloseRequest/);
  assert.match(workspace, /onEscapeKeyDown=\{\(event\) => \{ event\.preventDefault\(\); setCloseRequest/);
  assert.match(surface, /motion-reduce:/);
  assert.match(surface, /V3_QUICK_ENTRY_DIALOG_CLASS/);
});
