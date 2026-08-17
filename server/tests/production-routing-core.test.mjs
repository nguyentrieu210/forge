import test from "node:test";
import assert from "node:assert/strict";
import {
  ProductionRoutingError,
  productionRoutingSnapshot,
  resolveProductionRouting,
} from "../dist/apps-src/alumdoor-worker/src/production-routing-core.js";

function standard(overrides = {}) {
  return {
    name: "STD-CAT-01",
    routing: "RT-CUA-UC-V1",
    sequence: 10,
    department: "DC.PROD",
    door_type: "Cửa Úc",
    operation: "Cắt",
    capacity_basis: "set",
    minutes_per_unit: 10,
    workstation: "WS-CAT-01",
    persons: 1,
    efficiency: 0.9,
    source: "SYNTHETIC-TEST-ONLY",
    revision: "TEST-V1",
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    disabled: 0,
    ...overrides,
  };
}

const context = {
  door_type: "Cửa Úc",
  department: "DC.PROD",
  production_date: "2026-08-18",
  sets: 3,
  area_sqm: 7.5,
};

function routingError(code) {
  return (error) => error instanceof ProductionRoutingError && error.code === code;
}

test("resolve routing nhiều công đoạn theo sequence và cộng đúng set/m2/batch", () => {
  const result = resolveProductionRouting([
    standard({ name: "STD-SON", sequence: 30, operation: "Sơn", capacity_basis: "batch", minutes_per_unit: 40, batch_capacity: 2 }),
    standard({ name: "STD-LAP", sequence: 20, operation: "Lắp", capacity_basis: "m2", minutes_per_unit: 4 }),
    standard({ name: "STD-CAT", sequence: 10, operation: "Cắt", capacity_basis: "set", minutes_per_unit: 10 }),
  ], context);

  assert.equal(result.routing, "RT-CUA-UC-V1");
  assert.deepEqual(result.operation_lines.map((line) => line.operation), ["Cắt", "Lắp", "Sơn"]);
  assert.deepEqual(result.operation_lines.map((line) => line.basis_qty), [3, 7.5, 2]);
  assert.deepEqual(result.operation_lines.map((line) => line.planned_minutes), [30, 30, 80]);
  assert.equal(result.total_planned_minutes, 140);
});

test("operation basis dùng quantity tường minh và mặc định về số bộ khi chưa cấp quantity", () => {
  const standards = [
    standard({ name: "STD-QC", operation: "QC", capacity_basis: "operation", minutes_per_unit: 3 }),
  ];
  const explicit = resolveProductionRouting(standards, {
    ...context,
    operation_quantities: { QC: 5 },
  });
  assert.equal(explicit.operation_lines[0].basis_qty, 5);
  assert.equal(explicit.operation_lines[0].planned_minutes, 15);

  const perSet = resolveProductionRouting(standards, context);
  assert.equal(perSet.operation_lines[0].basis_qty, 3);
  assert.equal(perSet.operation_lines[0].planned_minutes, 9);
});

test("persons và efficiency chỉ snapshot, không âm thầm đổi elapsed minutes", () => {
  const result = resolveProductionRouting([
    standard({ persons: 4, efficiency: 0.5, minutes_per_unit: 12 }),
  ], context);
  assert.equal(result.operation_lines[0].planned_minutes, 36);
  assert.equal(result.operation_lines[0].persons, 4);
  assert.equal(result.operation_lines[0].efficiency, 0.5);
});

test("disabled và effective date không được chọn", () => {
  assert.throws(() => resolveProductionRouting([
    standard({ disabled: 1 }),
    standard({ name: "STD-FUTURE", effective_from: "2026-09-01" }),
  ], context), routingError("NO_ACTIVE_OPERATION_STANDARD"));
});

test("duplicate sequence fail closed thay vì chọn record đầu tiên", () => {
  assert.throws(() => resolveProductionRouting([
    standard({ name: "STD-A", sequence: 10 }),
    standard({ name: "STD-B", sequence: 10, operation: "Cắt khác" }),
  ], context), routingError("DUPLICATE_OPERATION_SEQUENCE"));
});

test("nhiều routing đồng thời fail closed nếu caller không chỉ rõ authority", () => {
  assert.throws(() => resolveProductionRouting([
    standard({ name: "STD-A", routing: "RT-A" }),
    standard({ name: "STD-B", routing: "RT-B" }),
  ], context), routingError("AMBIGUOUS_ROUTING_AUTHORITY"));

  const selected = resolveProductionRouting([
    standard({ name: "STD-A", routing: "RT-A" }),
    standard({ name: "STD-B", routing: "RT-B" }),
  ], { ...context, routing: "RT-B" });
  assert.equal(selected.routing, "RT-B");
  assert.equal(selected.operation_lines[0].standard_name, "STD-B");
});

test("Production Standard legacy thiếu routing/sequence/basis bị chặn thay vì suy diễn", () => {
  assert.throws(() => resolveProductionRouting([
    standard({ routing: undefined }),
  ], context), routingError("MISSING_ROUTING_AUTHORITY"));

  assert.throws(() => resolveProductionRouting([
    standard({ sequence: undefined }),
  ], context), routingError("MISSING_OPERATION_SEQUENCE"));

  assert.throws(() => resolveProductionRouting([
    standard({ capacity_basis: undefined }),
  ], context), routingError("MISSING_CAPACITY_BASIS"));
});

test("không còn magic fallback 180 phút cho Sơn", () => {
  assert.throws(() => resolveProductionRouting([
    standard({ operation: "Sơn phủ", minutes_per_unit: undefined, minutes_per_set: undefined, standard_time: undefined }),
  ], context), routingError("INVALID_STANDARD_MINUTES"));
});

test("batch bắt buộc batch_capacity dương", () => {
  assert.throws(() => resolveProductionRouting([
    standard({ capacity_basis: "batch", batch_capacity: 0 }),
  ], context), routingError("INVALID_BATCH_CAPACITY"));
});

test("snapshot giữ nguyên kế hoạch sau khi master standards bị sửa", () => {
  const standards = [standard({ minutes_per_unit: 10 })];
  const result = resolveProductionRouting(standards, context);
  const snapshot = productionRoutingSnapshot(result);
  standards[0].minutes_per_unit = 999;
  standards[0].operation = "Đã đổi master";

  const parsed = JSON.parse(snapshot);
  assert.equal(parsed.operation_lines[0].operation, "Cắt");
  assert.equal(parsed.operation_lines[0].minutes_per_unit, 10);
  assert.equal(parsed.total_planned_minutes, 30);
});
