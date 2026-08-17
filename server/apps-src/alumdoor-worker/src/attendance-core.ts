/**
 * Pure AlumDoor attendance rules.
 *
 * This module deliberately knows nothing about a browser, D1, or document writes.  The
 * transaction command supplies the real server timestamp and persists the result; keeping
 * this calculation pure makes every edge of the three-shift policy directly testable.
 */

export const ATTENDANCE_TIMEZONE = "Asia/Ho_Chi_Minh";

export const SEGMENT_CODES = ["SHIFT1", "SHIFT2", "SHIFT3"] as const;
export type AttendanceSegmentCode = typeof SEGMENT_CODES[number];

export type AttendanceSegmentStatus = "empty" | "open" | "complete" | "missing_in" | "missing_out" | "corrected";
export type AttendanceState = "open" | "complete" | "exception";

export interface AttendanceSegmentWindow {
  code: AttendanceSegmentCode;
  /** Inclusive, measured from 00:00 in the configured timezone. A SHIFT3 end before start wraps to the next day. */
  scanStartMinute: number;
  /** Inclusive. For SHIFT3, a value below scanStartMinute means the next local day. */
  scanEndMinute: number;
  /** Inclusive work-time boundary. */
  workStartMinute: number;
  /** Exclusive work-time boundary. For SHIFT3, a value below/equal start means the next local day. */
  workEndMinute: number;
}

/**
 * The policy approved for the first AlumDoor slice. These values are scan windows, not
 * payroll categories. Whether a segment is regular work comes from Shift Assignment.
 */
export const DEFAULT_ATTENDANCE_WINDOWS: readonly AttendanceSegmentWindow[] = [
  { code: "SHIFT1", scanStartMinute: 5 * 60 + 30, scanEndMinute: 12 * 60 + 29, workStartMinute: 7 * 60, workEndMinute: 11 * 60 + 30 },
  { code: "SHIFT2", scanStartMinute: 12 * 60 + 30, scanEndMinute: 17 * 60 + 29, workStartMinute: 13 * 60, workEndMinute: 17 * 60 },
  { code: "SHIFT3", scanStartMinute: 17 * 60 + 30, scanEndMinute: 23 * 60 + 59, workStartMinute: 17 * 60 + 30, workEndMinute: 24 * 60 },
];

export interface SegmentSnapshot {
  code: AttendanceSegmentCode;
  status: AttendanceSegmentStatus;
  actualIn?: string;
  actualOut?: string;
}

export interface CalculatedSegment extends SegmentSnapshot {
  actualMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
}

export interface AttendanceCalculation {
  workDate: string;
  state: AttendanceState;
  exceptionCode: "MISSING_IN" | "MISSING_OUT" | null;
  regularMinutes: number;
  overtimeMinutes: number;
  payableWorkFractionBp: number;
  segments: CalculatedSegment[];
}

export class AttendanceRuleError extends Error {
  constructor(
    readonly code: "ATTENDANCE_OUTSIDE_WINDOW" | "ATTENDANCE_SEGMENT_COMPLETE" | "CROSS_DAY" | "INVALID_SEGMENT_PAIR",
    message: string,
  ) {
    super(message);
    this.name = "AttendanceRuleError";
  }
}

interface LocalTime {
  date: string;
  secondsOfDay: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const found = formatters.get(timeZone);
  if (found) return found;
  const created = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatters.set(timeZone, created);
  return created;
}

function asInstant(value: string | Date): Date {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", "Thời điểm chấm công không hợp lệ.");
  return instant;
}

function localTime(value: string | Date, timeZone: string): LocalTime {
  const parts = formatter(timeZone).formatToParts(asInstant(value));
  const read = (name: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((item) => item.type === name)?.value;
    const parsed = Number(part);
    if (!Number.isInteger(parsed)) throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", "Không đọc được giờ chấm công theo múi giờ chính sách.");
    return parsed;
  };
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  const minute = read("minute");
  const second = read("second");
  return {
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    secondsOfDay: hour * 3600 + minute * 60 + second,
  };
}

function windowFor(code: AttendanceSegmentCode, windows: readonly AttendanceSegmentWindow[]): AttendanceSegmentWindow {
  const found = windows.find((candidate) => candidate.code === code);
  if (!found) throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", `Thiếu cấu hình ${code}.`);
  return found;
}

function normalizedWindow(window: AttendanceSegmentWindow): AttendanceSegmentWindow {
  if (window.code !== "SHIFT3") return window;
  return {
    ...window,
    scanEndMinute: window.scanEndMinute < window.scanStartMinute ? window.scanEndMinute + 24 * 60 : window.scanEndMinute,
    workEndMinute: window.workEndMinute <= window.workStartMinute ? window.workEndMinute + 24 * 60 : window.workEndMinute,
  };
}

function isSegmentCode(value: string): value is AttendanceSegmentCode {
  return (SEGMENT_CODES as readonly string[]).includes(value);
}

function addLocalDays(value: string, days: number): string {
  const timestamp = Date.parse(`${value}T00:00:00Z`) + days * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function logicalSeconds(local: LocalTime, workDate: string, window: AttendanceSegmentWindow): number {
  if (local.date === workDate) return local.secondsOfDay;
  if (window.workEndMinute > 24 * 60 && local.date === addLocalDays(workDate, 1)) return local.secondsOfDay + 86_400;
  throw new AttendanceRuleError("CROSS_DAY", "Thời điểm chấm công nằm ngoài ngày làm việc/ca đã cấu hình.");
}

function overlapWholeMinutes(fromSeconds: number, toSeconds: number, startMinute: number, endMinute: number): number {
  const start = Math.max(fromSeconds, startMinute * 60);
  const end = Math.min(toSeconds, endMinute * 60);
  return Math.max(0, Math.floor((end - start) / 60));
}

function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

/** Returns the policy segment that may be scanned at this server timestamp. */
export function segmentForServerTime(
  serverTime: string | Date,
  timeZone = ATTENDANCE_TIMEZONE,
  windows = DEFAULT_ATTENDANCE_WINDOWS,
): { code: AttendanceSegmentCode; workDate: string } {
  const local = localTime(serverTime, timeZone);
  for (const configured of windows) {
    const window = normalizedWindow(configured);
    const seconds = local.secondsOfDay;
    if (seconds >= window.scanStartMinute * 60 && seconds <= window.scanEndMinute * 60 + 59) {
      return { code: window.code, workDate: local.date };
    }
    const nextDaySeconds = seconds + 86_400;
    if (window.scanEndMinute > 24 * 60
      && nextDaySeconds >= window.scanStartMinute * 60
      && nextDaySeconds <= window.scanEndMinute * 60 + 59) {
      return { code: window.code, workDate: addLocalDays(local.date, -1) };
    }
  }
  throw new AttendanceRuleError("ATTENDANCE_OUTSIDE_WINDOW", "Hiện không nằm trong giờ quét của ca.");
}

/**
 * A segment alternates independently. An unfinished Ca 1 can never make the first scan
 * of Ca 2 look like an OUT; that is the important distinction from a whole-day toggle.
 */
export function nextSegmentLogType(segment: Pick<SegmentSnapshot, "status">): "IN" | "OUT" {
  if (segment.status === "empty") return "IN";
  if (segment.status === "open") return "OUT";
  throw new AttendanceRuleError("ATTENDANCE_SEGMENT_COMPLETE", "Ca này đã chấm đủ; hãy gửi yêu cầu sửa nếu cần.");
}

export function applySegmentScan(
  segment: SegmentSnapshot,
  serverTime: string | Date,
): { logType: "IN" | "OUT"; segment: SegmentSnapshot } {
  const logType = nextSegmentLogType(segment);
  const at = asInstant(serverTime).toISOString();
  if (logType === "IN") {
    const { actualOut: _discardedOut, ...withoutOut } = segment;
    return { logType, segment: { ...withoutOut, status: "open", actualIn: at } };
  }
  return { logType, segment: { ...segment, status: "complete", actualOut: at } };
}

/**
 * Recomputes the day from immutable scan/correction evidence.
 *
 * Segment names are scan windows only. A segment is regular work only when it overlaps the
 * employee's submitted Shift Assignment; every other worked minute is a raw OT candidate.
 * Payroll still requires a submitted Overtime Request before any raw OT candidate is paid.
 */
export function calculateAttendance(input: {
  workDate: string;
  segments: readonly SegmentSnapshot[];
  timeZone?: string;
  windows?: readonly AttendanceSegmentWindow[];
  /** Number of regular minutes scheduled by the active Shift Assignment. */
  regularDailyCapMinutes?: number;
  /** Policy segments that overlap the active Shift Type. Defaults to all for legacy callers. */
  regularSegmentCodes?: readonly AttendanceSegmentCode[];
}): AttendanceCalculation {
  const timeZone = input.timeZone ?? ATTENDANCE_TIMEZONE;
  const windows = input.windows ?? DEFAULT_ATTENDANCE_WINDOWS;
  const regularDailyCapMinutes = input.regularDailyCapMinutes ?? 480;
  if (!Number.isInteger(regularDailyCapMinutes) || regularDailyCapMinutes <= 0 || regularDailyCapMinutes > 24 * 60) {
    throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", "Giới hạn phút công thường trong ngày không hợp lệ.");
  }
  const regularSegmentCodes = new Set(input.regularSegmentCodes ?? SEGMENT_CODES);
  if ([...regularSegmentCodes].some((code) => !isSegmentCode(code))) {
    throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", "Danh sách đoạn ca làm thường không hợp lệ.");
  }
  const byCode = new Map(input.segments.map((segment) => [segment.code, segment]));
  const calculated: CalculatedSegment[] = [];

  for (const code of SEGMENT_CODES) {
    const raw = byCode.get(code) ?? { code, status: "empty" as const };
    const window = normalizedWindow(windowFor(code, windows));
    let actualMinutes = 0;

    if (raw.actualIn || raw.actualOut) {
      if (!raw.actualIn || !raw.actualOut) {
        calculated.push({ ...raw, actualMinutes: 0, regularMinutes: 0, overtimeMinutes: 0 });
        continue;
      }
      const inLocal = localTime(raw.actualIn, timeZone);
      const outLocal = localTime(raw.actualOut, timeZone);
      const inSeconds = logicalSeconds(inLocal, input.workDate, window);
      const outSeconds = logicalSeconds(outLocal, input.workDate, window);
      if (outSeconds <= inSeconds) {
        throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", "Giờ ra phải sau giờ vào trong ca làm việc.");
      }
      actualMinutes = overlapWholeMinutes(inSeconds, outSeconds, window.workStartMinute, window.workEndMinute);
    }
    calculated.push({ ...raw, actualMinutes, regularMinutes: 0, overtimeMinutes: 0 });
  }

  let remainingRegularMinutes = regularDailyCapMinutes;
  for (const segment of calculated) {
    if (!regularSegmentCodes.has(segment.code)) {
      segment.overtimeMinutes = segment.actualMinutes;
      continue;
    }
    segment.regularMinutes = Math.min(segment.actualMinutes, remainingRegularMinutes);
    segment.overtimeMinutes = segment.actualMinutes - segment.regularMinutes;
    remainingRegularMinutes -= segment.regularMinutes;
  }

  const regularMinutes = calculated.reduce((total, segment) => total + segment.regularMinutes, 0);
  const overtimeMinutes = calculated.reduce((total, segment) => total + segment.overtimeMinutes, 0);
  const exceptionCode = calculated.some((segment) => segment.status === "missing_in")
    ? "MISSING_IN"
    : calculated.some((segment) => segment.status === "missing_out" || segment.status === "open")
      ? "MISSING_OUT"
      : null;
  const hasCompletedSegment = calculated.some((segment) => segment.status === "complete" || segment.status === "corrected");
  const state: AttendanceState = exceptionCode ? "exception" : hasCompletedSegment ? "complete" : "open";

  return {
    workDate: input.workDate,
    state,
    exceptionCode,
    regularMinutes,
    overtimeMinutes,
    payableWorkFractionBp: Math.min(10_000, roundHalfUp(regularMinutes * 10_000, regularDailyCapMinutes)),
    segments: calculated,
  };
}

/** Verifies custom policy data before it becomes an approved version. */
export function assertAttendanceWindows(windows: readonly AttendanceSegmentWindow[]): void {
  if (windows.length !== SEGMENT_CODES.length) {
    throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", "Chính sách phải có đúng ba ca.");
  }
  for (const code of SEGMENT_CODES) {
    const configured = windowFor(code, windows);
    const values = [configured.scanStartMinute, configured.scanEndMinute, configured.workStartMinute, configured.workEndMinute];
    const rawBoundsValid = values.every((value) => Number.isInteger(value) && value >= 0 && value <= 24 * 60);
    if (!rawBoundsValid) throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", `Cấu hình ${code} không hợp lệ.`);
    if (code !== "SHIFT3" && (configured.scanEndMinute < configured.scanStartMinute || configured.workEndMinute <= configured.workStartMinute)) {
      throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", `Cấu hình ${code} không hợp lệ.`);
    }
    const segment = normalizedWindow(configured);
    if (segment.scanEndMinute < segment.scanStartMinute
      || segment.workEndMinute <= segment.workStartMinute
      || segment.scanEndMinute > 2 * 24 * 60
      || segment.workEndMinute > 2 * 24 * 60) {
      throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", `Cấu hình ${code} không hợp lệ.`);
    }
  }
}

/** Parses persisted segment code defensively at the application boundary. */
export function asSegmentCode(value: unknown): AttendanceSegmentCode {
  const code = String(value ?? "").trim();
  if (!isSegmentCode(code)) throw new AttendanceRuleError("INVALID_SEGMENT_PAIR", "Mã ca không hợp lệ.");
  return code;
}
