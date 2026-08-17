import { describe, expect, it } from "vitest";
import { splitLiteAttendanceByAssignedShift } from "../../../packages/clouderp-erpnext/src/alumdoor-attendance-lite.js";

const TZ = "Asia/Ho_Chi_Minh";

describe("AlumDoor Lite assigned-shift minute buckets", () => {
  it("keeps a full 08:00-17:00 shift at 480 paid minutes and makes 17:00-18:00 automatic OT", () => {
    const result = splitLiteAttendanceByAssignedShift({
      workDate: "2026-08-17",
      timeZone: TZ,
      shiftStart: "08:00:00",
      shiftEnd: "17:00:00",
      scheduledMinutes: 480,
      segments: [
        { actual_in: "2026-08-17T01:00:00Z", actual_out: "2026-08-17T04:30:00Z" },
        { actual_in: "2026-08-17T05:30:00Z", actual_out: "2026-08-17T11:00:00Z" },
      ],
    });

    expect(result.regularMinutes).toBe(480);
    expect(result.overtimeMinutes).toBe(60);
    expect(result.payableWorkFractionBp).toBe(10_000);
  });

  it("classifies both early and late work outside 08:00-17:00 as OT without double counting", () => {
    const result = splitLiteAttendanceByAssignedShift({
      workDate: "2026-08-17",
      timeZone: TZ,
      shiftStart: "08:00",
      shiftEnd: "17:00",
      scheduledMinutes: 480,
      segments: [
        { actual_in: "2026-08-17T00:30:00Z", actual_out: "2026-08-17T11:00:00Z" },
      ],
    });

    expect(result.regularMinutes).toBe(480);
    expect(result.overtimeMinutes).toBe(90);
  });

  it("keeps assigned 22:00-06:00 as normal work and makes only 06:00-07:00 OT", () => {
    const result = splitLiteAttendanceByAssignedShift({
      workDate: "2026-08-17",
      timeZone: TZ,
      shiftStart: "22:00",
      shiftEnd: "06:00",
      scheduledMinutes: 480,
      segments: [
        { actual_in: "2026-08-17T15:00:00Z", actual_out: "2026-08-18T00:00:00Z" },
      ],
    });

    expect(result.regularMinutes).toBe(480);
    expect(result.overtimeMinutes).toBe(60);
    expect(result.payableWorkFractionBp).toBe(10_000);
  });

  it("merges overlapping evidence so one minute is never paid twice", () => {
    const result = splitLiteAttendanceByAssignedShift({
      workDate: "2026-08-17",
      timeZone: TZ,
      shiftStart: "08:00",
      shiftEnd: "17:00",
      scheduledMinutes: 480,
      segments: [
        { actual_in: "2026-08-17T01:00:00Z", actual_out: "2026-08-17T10:30:00Z" },
        { actual_in: "2026-08-17T10:00:00Z", actual_out: "2026-08-17T11:00:00Z" },
      ],
    });

    expect(result.regularMinutes).toBe(480);
    expect(result.overtimeMinutes).toBe(60);
  });
});
