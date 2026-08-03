import test from "node:test";
import assert from "node:assert/strict";
import { buildCartesianRows, buildWaterfallSegments, chartHasData, compactMetric, summarizeChart } from "../dist/index.js";

test("cartesian rows preserve labels and zero-fill sparse series", () => {
  const rows = buildCartesianRows(["T1", "T2"], [
    { name: "Doanh thu", values: [12, 18] },
    { name: "Chi phí", values: [8] },
  ]);
  assert.deepEqual(rows, [
    { label: "T1", "Doanh thu": 12, "Chi phí": 8 },
    { label: "T2", "Doanh thu": 18, "Chi phí": 0 },
  ]);
});

test("waterfall keeps a deterministic running total", () => {
  const rows = buildWaterfallSegments(["Mở", "Tăng", "Giảm"], [100, 40, -25], "Cuối");
  assert.deepEqual(rows.map((row) => [row.label, row.base, row.positive, row.negative, row.total]), [
    ["Mở", 0, 100, 0, 100],
    ["Tăng", 100, 40, 0, 140],
    ["Giảm", 115, 0, 25, 115],
    ["Cuối", 0, 115, 0, 115],
  ]);
});

test("data truth and accessible summary remain presentation-only", () => {
  const series = [{ name: "Đơn", values: [3, 7] }];
  assert.equal(chartHasData(series), true);
  assert.equal(chartHasData([{ name: "Rỗng", values: [] }]), false);
  assert.equal(summarizeChart(["Hôm qua", "Hôm nay"], series, String), "Hôm nay. Đơn: 7");
  assert.match(compactMetric(1_250_000), /1[,.]3 tr|1[,.]2 tr/);
});
