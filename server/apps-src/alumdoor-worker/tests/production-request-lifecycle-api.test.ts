import { describe, expect, it } from "vitest";
import { readProductionRequestLifecycle } from "../src/production-request-lifecycle-api.js";
import type { ProductionPlatformCall } from "../src/sales-production.js";

type Json = Record<string, unknown>;

function caller(): ProductionPlatformCall {
  const call = async (path: string): Promise<Response> => {
    if (path === "resource/Production%20Request/PR-1") {
      return json({ data: {
        name: "PR-1",
        sales_order: "SO-1",
        request_state: "Đã tạo lệnh",
        items: [{ request_line_key: "SET-1", sales_order_row_id: "SO-ROW-1", item_code: "DOOR-A" }],
      } });
    }
    if (path.startsWith("resource/Work%20Order?")) {
      return json({ data: [{
        name: "WO-1", production_request: "PR-1", production_request_line_key: "SET-1",
        status: "In Process", docstatus: 1,
      }] });
    }
    return json({ message: "not found" }, 404);
  };
  return Object.assign(call, { via: "test" }) as ProductionPlatformCall;
}

function json(value: Json, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("Production Request lifecycle reader", () => {
  it("reads only the requested Production Request and its linked Work Orders", async () => {
    const response = await readProductionRequestLifecycle(caller(), { production_request: "PR-1" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message.production_request).toBe("PR-1");
    expect(body.message.derived_state).toBe("Đang sản xuất");
    expect(body.message.lines[0].work_order).toBe("WO-1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("asks for one sentinel row above the accepted Work Order bound", async () => {
    let workOrderPath = "";
    const base = caller();
    const call = Object.assign(async (path: string, init?: RequestInit) => {
      if (path.startsWith("resource/Work%20Order?")) workOrderPath = path;
      return base(path, init);
    }, { via: "test" }) as ProductionPlatformCall;
    const response = await readProductionRequestLifecycle(call, { production_request: "PR-1" });
    expect(response.status).toBe(200);
    expect(workOrderPath).toContain("limit_page_length=501");
  });

  it("fails closed when lifecycle evidence exceeds the bounded read", async () => {
    const call = Object.assign(async (path: string): Promise<Response> => {
      if (path === "resource/Production%20Request/PR-1") {
        return json({ data: {
          name: "PR-1", sales_order: "SO-1", request_state: "Đang tạo lệnh",
          items: [{ request_line_key: "SET-1", sales_order_row_id: "SO-ROW-1", item_code: "DOOR-A" }],
        } });
      }
      if (path.startsWith("resource/Work%20Order?")) {
        return json({ data: Array.from({ length: 501 }, (_, index) => ({
          name: `WO-${index + 1}`,
          production_request: "PR-1",
          production_request_line_key: `SET-${index + 1}`,
          status: "Not Started",
          docstatus: 1,
        })) });
      }
      return json({ message: "not found" }, 404);
    }, { via: "test" }) as ProductionPlatformCall;

    const response = await readProductionRequestLifecycle(call, { production_request: "PR-1" });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("PRODUCTION_REQUEST_LIFECYCLE_EVIDENCE_TRUNCATED");
  });

  it("rejects a missing production_request before any platform read", async () => {
    let calls = 0;
    const call = Object.assign(async () => { calls += 1; return json({}); }, { via: "test" }) as ProductionPlatformCall;
    const response = await readProductionRequestLifecycle(call, {});
    expect(response.status).toBe(422);
    expect(calls).toBe(0);
  });
});
