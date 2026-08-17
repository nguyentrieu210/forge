import { describe, expect, it } from "vitest";
import {
  assertAttendanceWindows,
  calculateAttendance,
  segmentForServerTime,
  type AttendanceSegmentWindow,
} from "../src/attendance-core.js";

const overnightWindows: readonly AttendanceSegmentWindow[] = [
  { code: "SHIFT1", scanStartMinute: 330, scanEndMinute: 749, workStartMinute: 420, workEndMinute: 690 },
  { code: "SHIFT2", scanStartMinute: 750, scanEndMinute: 1049, workStartMinute: 780, workEndMinute: 1020 },
  // 22:00 -> 06:00 next day. Raw end values remain time-of-day minutes, exactly as policy metadata stores them.
  { code: "SHIFT3", scanStartMinute: 1320, scanEndMinute: 360, workStartMinute: 1320, workEndMinute: 360 },
];

describe("AlumDoor overnight attendance", () => {
  it("accepts a SHIFT3 policy whose end time wraps to the next local day", () => {
    expect(() => assertAttendanceWindows(overnightWindows)).not.toThrow();
  });

  it("maps an early-morning SHIFT3 scan back to the previous work date", () => {
    // 2026-08-17T22:00Z = 05:00 on 2026-08-18 in Asia/Ho_Chi_Minh.
    expect(segmentForServerTime("2026-08-17T22:00:00Z", "Asia/Ho_Chi_Minh", overnightWindows)).toEqual({
      code: "SHIFT3",
      workDate: "2026-08-17",
    });
  });

  it("treats an assigned 22:00 to 06:00 SHIFT3 as regular work, not overtime", () => {
    const calculated = calculateAttendance({
      workDate: "2026-08-17",
      windows: overnightWindows,
      regularDailyCapMinutes: 480,
      regularSegmentCodes: ["SHIFT3"],
      segments: [
        { code: "SHIFT1", status: "empty" },
        { code: "SHIFT2", status: "empty" },
        {
          code: "SHIFT3",
          status: "complete",
          // Vietnam local: 22:00 Aug 17 -> 06:00 Aug 18.
          actualIn: "2026-08-17T15:00:00Z",
          actualOut: "2026-08-17T23:00:00Z",
        },
      ],
    });

    expect(calculated.state).toBe("complete");
    expect(calculated.segments.find((segment) => segment.code === "SHIFT3")?.actualMinutes).toBe(480);
    expect(calculated.regularMinutes).toBe(480);
    expect(calculated.overtimeMinutes).toBe(0);
    expect(calculated.payableWorkFractionBp).toBe(10_000);
  });

  it("keeps worked minutes outside the assigned shift as raw overtime candidates", () => {
    const calculated = calculateAttendance({
      workDate: "2026-08-17",
      windows: overnightWindows,
      regularDailyCapMinutes: 480,
      regularSegmentCodes: ["SHIFT1", "SHIFT2"],
      segments: [
        { code: "SHIFT1", status: "empty" },
        { code: "SHIFT2", status: "empty" },
        {
          code: "SHIFT3",
          status: "complete",
          actualIn: "2026-08-17T15:00:00Z",
          actualOut: "2026-08-17T16:00:00Z",
        },
      ],
    });

    expect(calculated.regularMinutes).toBe(0);
    expect(calculated.overtimeMinutes).toBe(60);
  });

  it("still rejects evidence more than one local day away from the work date", () => {
    expect(() => calculateAttendance({
      workDate: "2026-08-17",
      windows: overnightWindows,
      regularSegmentCodes: ["SHIFT3"],
      segments: [
        { code: "SHIFT1", status: "empty" },
        { code: "SHIFT2", status: "empty" },
        {
          code: "SHIFT3",
          status: "complete",
          actualIn: "2026-08-17T15:00:00Z",
          actualOut: "2026-08-19T23:00:00Z",
        },
      ],
    })).toThrow(/ngoài ngày làm việc\/ca đã cấu hình/u);
  });
});
