import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const fixturePath = path.join(process.cwd(), "qa/matrix/second-reference-fixtures.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const required = new Set(["supplier-item", "item-warehouse-reorder", "item-group-account", "user-role"]);
const seen = new Set();
let failed = false;

function fail(message) {
  console.error(`Matrix second-reference check failed: ${message}`);
  failed = true;
}

for (const reference of fixture.references ?? []) {
  const id = String(reference.id ?? "");
  if (!id) { fail("reference without id"); continue; }
  if (seen.has(id)) fail(`duplicate reference id ${id}`);
  seen.add(id);

  const a = reference.axisA?.members ?? [];
  const b = reference.axisB?.members ?? [];
  const aKeys = new Set(a.map((row) => String(row.key ?? "")));
  const bKeys = new Set(b.map((row) => String(row.key ?? "")));
  if (!a.length || aKeys.size !== a.length || aKeys.has("")) fail(`${id}: axisA keys must be non-empty and unique`);
  if (!b.length || bKeys.size !== b.length || bKeys.has("")) fail(`${id}: axisB keys must be non-empty and unique`);

  const cellKeys = new Set();
  for (const cell of reference.cells ?? []) {
    const ca = String(cell.a ?? "");
    const cb = String(cell.b ?? "");
    if (!aKeys.has(ca)) fail(`${id}: cell references unknown axisA member ${ca}`);
    if (!bKeys.has(cb)) fail(`${id}: cell references unknown axisB member ${cb}`);
    const key = `${ca}\u001f${cb}`;
    if (cellKeys.has(key)) fail(`${id}: duplicate cell ${ca} x ${cb}`);
    cellKeys.add(key);
  }

  if (reference.acceptance?.requiresRendererBusinessConditional !== false) {
    fail(`${id}: shared renderer must not require a business-name conditional`);
  }
  const authority = String(reference.acceptance?.writeAuthority ?? "");
  if (!authority || authority === "document_update") fail(`${id}: write authority must be an explicit domain/security action`);

  if (reference.status === "ready-for-integration") {
    const cartesian = a.length * b.length;
    if (cartesian > 1 && cellKeys.size >= cartesian) fail(`${id}: fixture must prove sparse-cell behavior, not a fully materialized matrix`);
  }
}

for (const id of required) if (!seen.has(id)) fail(`missing required second reference ${id}`);
const userRole = (fixture.references ?? []).find((reference) => reference.id === "user-role");
if (userRole?.status !== "deferred-ws11-security-review") fail("user-role must remain deferred until WS11 security review");

for (const envelope of fixture.performanceEnvelopes ?? []) {
  const product = Number(envelope.axisA) * Number(envelope.axisB);
  if (!Number.isFinite(product) || product <= 0) fail(`${envelope.id}: invalid axis sizes`);
  if (!Number.isFinite(Number(envelope.sparseCells)) || Number(envelope.sparseCells) <= 0) fail(`${envelope.id}: invalid sparse cell count`);
  if (Number(envelope.sparseCells) >= product) fail(`${envelope.id}: performance fixture is not sparse`);
  if ((envelope.assertions ?? []).some((value) => /\b(ms|milliseconds?|seconds?|sla)\b/i.test(String(value)))) {
    fail(`${envelope.id}: do not encode fake latency/SLA claims before measurement`);
  }
}

if (failed) process.exitCode = 1;
else console.log(`Matrix second-reference fixtures OK; validated ${seen.size} reference(s) and ${(fixture.performanceEnvelopes ?? []).length} performance envelope(s).`);
