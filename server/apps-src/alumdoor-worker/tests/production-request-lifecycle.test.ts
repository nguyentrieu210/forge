import { describe, expect, it } from "vitest";
import "./production-request-lifecycle-api.test.js";
import { deriveProductionRequestLifecycle } from "../src/production-request-lifecycle.js";

const request = (state = "Đã tạo lệnh") => ({
  name: "PR-1",
  sales_order: "SO-1",
  request_state: state,
  items: [
    { request_line_key: "SET-1", sales_order_row_id: "SO-ROW-1", item_code: "DOOR-A" },
    { request_line_key: "SET-2", sales_order_row_id: "SO-ROW-1", item_code: "DOOR-A" },
  ],
});

const wo = (name: string, key: string, status = "Not Started", docstatus = 1) => ({
  name,
  production_request: "PR-1",
  production_request_line_key: key,
  status,
  docstatus,
});

describe("Production Request lifecycle", () => {
  it("derives Đã tạo lệnh when every physical set has exactly one ready Work Order", () => {
    const result = deriveProductionRequestLifecycle(request(), [wo("WO-1", "SET-1"), wo("WO-2", "SET-2")]);
    expect(result.derived_state).toBe("Đã tạo lệnh");
    expect(result.state_drift).toBe(false);
    expect(result.active_work_order_count).toBe(2);
  });

  it("derives Đang tạo lệnh when a set is missing its Work Order", () => {
    const result = deriveProductionRequestLifecycle(request(), [wo("WO-1", "SET-1")]);
    expect(result.derived_state).toBe("Đang tạo lệnh");
    expect(result.state_drift).toBe(true);
    expect(result.lines.find((line) => line.request_line_key === "SET-2")?.health).toBe("MISSING_WORK_ORDER");
  });

  it("fails lifecycle health on duplicate active Work Orders for one set", () => {
    const result = deriveProductionRequestLifecycle(request(), [
      wo("WO-1", "SET-1"),
      wo("WO-1-DUP", "SET-1"),
      wo("WO-2", "SET-2"),
    ]);
    expect(result.derived_state).toBe("Đang tạo lệnh");
    expect(result.lines.find((line) => line.request_line_key === "SET-1")?.health).toBe("DUPLICATE_WORK_ORDER");
    expect(result.warnings).toContain("DUPLICATE_ACTIVE_WORK_ORDER:SET-1");
  });

  it("derives Đang sản xuất and Hoàn thành from Work Order evidence", () => {
    const running = deriveProductionRequestLifecycle(request(), [wo("WO-1", "SET-1", "In Process"), wo("WO-2", "SET-2")]);
    expect(running.derived_state).toBe("Đang sản xuất");

    const completed = deriveProductionRequestLifecycle(request("Đang sản xuất"), [
      wo("WO-1", "SET-1", "Completed"),
      wo("WO-2", "SET-2", "Completed"),
    ]);
    expect(completed.derived_state).toBe("Hoàn thành");
    expect(completed.state_drift).toBe(true);
  });

  it("reports Work Orders whose line key is outside the Production Request", () => {
    const result = deriveProductionRequestLifecycle(request(), [
      wo("WO-1", "SET-1"),
      wo("WO-2", "SET-2"),
      wo("WO-X", "SET-X"),
    ]);
    expect(result.warnings).toContain("ORPHAN_WORK_ORDER_LINE_KEY:SET-X");
  });
});
