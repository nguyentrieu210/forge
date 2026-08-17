import { describe, expect, it } from "vitest";
import type { CanonicalDocument, JsonObject } from "../../../packages/contracts/src/index.js";
import { moveOpenAttendanceIntervalForLite } from "../../../apps/tenant-worker/src/attendance-scan-lite-coordinator.js";

function day(segments: JsonObject[]): CanonicalDocument<JsonObject> {
  return {
    tenant_id: "tenant",
    doctype: "AlumDoor Attendance Day",
    name: "AAD-20260817-EMP",
    owner: "system",
    docstatus: 0,
    status: "open",
    version: 1,
    created_at: "2026-08-17T01:00:00.000Z",
    modified_at: "2026-08-17T01:00:00.000Z",
    data: { segments },
    children: [],
  };
}

describe("AlumDoor Lite scan interval handoff", () => {
  it("moves an open SHIFT1 IN to SHIFT3 so an 18:00 scan closes the same interval", () => {
    const projected = moveOpenAttendanceIntervalForLite(day([
      { row_id: "SHIFT1", segment_code: "SHIFT1", state: "open", actual_in: "2026-08-17T01:00:00.000Z", in_checkin: "CHK-IN" },
      { row_id: "SHIFT2", segment_code: "SHIFT2", state: "empty" },
      { row_id: "SHIFT3", segment_code: "SHIFT3", state: "empty" },
    ]), "SHIFT3");

    const rows = projected.data.segments as JsonObject[];
    expect(rows[0]).toEqual({ row_id: "SHIFT1", segment_code: "SHIFT1", state: "empty" });
    expect(rows[2]).toMatchObject({
      row_id: "SHIFT3",
      segment_code: "SHIFT3",
      state: "open",
      actual_in: "2026-08-17T01:00:00.000Z",
      in_checkin: "CHK-IN",
    });
  });

  it("does not move an open interval when the next scan is in the same policy window", () => {
    const original = day([
      { row_id: "SHIFT1", segment_code: "SHIFT1", state: "open", actual_in: "2026-08-17T01:00:00.000Z" },
      { row_id: "SHIFT2", segment_code: "SHIFT2", state: "empty" },
      { row_id: "SHIFT3", segment_code: "SHIFT3", state: "empty" },
    ]);
    expect(moveOpenAttendanceIntervalForLite(original, "SHIFT1")).toBe(original);
  });

  it("rejects multiple simultaneous open IN intervals instead of guessing", () => {
    expect(() => moveOpenAttendanceIntervalForLite(day([
      { row_id: "SHIFT1", segment_code: "SHIFT1", state: "open", actual_in: "2026-08-17T01:00:00.000Z" },
      { row_id: "SHIFT2", segment_code: "SHIFT2", state: "open", actual_in: "2026-08-17T05:30:00.000Z" },
      { row_id: "SHIFT3", segment_code: "SHIFT3", state: "empty" },
    ]), "SHIFT3")).toThrow(/multiple open IN intervals/i);
  });
});
