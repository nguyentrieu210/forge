import test from "node:test";
import assert from "node:assert/strict";
import { buildPickWaves, normalizeInventoryScan } from "../dist/packages/clouderp-stock/src/index.js";

const Q = 1_000_000;

test("wave partitioning is deterministic within caller-resolved groups", () => {
  const waves = buildPickWaves([
    { line_id: "3", group_key: "ZONE-A", sequence: 3, qty_micros: Q },
    { line_id: "1", group_key: "ZONE-A", sequence: 1, qty_micros: 2 * Q },
    { line_id: "2", group_key: "ZONE-A", sequence: 2, qty_micros: 3 * Q },
    { line_id: "4", group_key: "ZONE-B", sequence: 1, qty_micros: Q },
  ], 2);
  assert.deepEqual(waves.map((x) => [x.wave_key, x.lines.map((y) => y.line_id), x.total_qty_micros]), [
    ["ZONE-A#001", ["1", "2"], 5 * Q],
    ["ZONE-A#002", ["3"], Q],
    ["ZONE-B#001", ["4"], Q],
  ]);
});

test("scanner normalization preserves Unicode identity and validates timestamp", () => {
  const scan = normalizeInventoryScan({ raw: "  Lô-ĐT-01  ", symbology: "QR", scanned_at: "2026-08-03T10:00:00+07:00" });
  assert.equal(scan.value, "Lô-ĐT-01");
  assert.equal(scan.symbology, "QR");
  assert.equal(scan.scanned_at, "2026-08-03T03:00:00.000Z");
});

test("scanner rejects empty, oversized and control-character payloads", () => {
  assert.throws(() => normalizeInventoryScan({ raw: "   " }), /empty/);
  assert.throws(() => normalizeInventoryScan({ raw: "ABCDE" }, 4), /exceeds 4/);
  assert.throws(() => normalizeInventoryScan({ raw: "A\u0000B" }), /control characters/);
});
