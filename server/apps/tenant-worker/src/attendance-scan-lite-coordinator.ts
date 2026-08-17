import type { CanonicalDocument, JsonObject } from "../../../packages/contracts/src/index.js";
import { errors } from "../../../packages/core/src/index.js";
import type { MutationStore } from "../../../packages/document-kernel/src/index.js";
import {
  segmentForServerTime,
  type AttendanceSegmentCode,
  type AttendanceSegmentWindow,
} from "../../../apps-src/alumdoor-worker/src/attendance-core.js";
import {
  commitAlumDoorAttendanceScan,
  type AlumDoorAttendanceScanInput,
  type AlumDoorAttendanceScanServices,
} from "./attendance-scan-coordinator.js";

const DAY_DOCTYPE = "AlumDoor Attendance Day";

/**
 * Lite scan seam over the legacy three-window coordinator.
 *
 * The legacy transaction chooses a storage segment from the current scan clock. For Lite,
 * an already-open IN must always be closed by the next scan, even when that OUT happens in
 * another policy window. We therefore move only the open evidence to the current target
 * bucket before the legacy atomic transaction runs. The registered Lite Attendance Day
 * controller then ignores bucket semantics and recomputes regular/OT from the resulting
 * real IN→OUT timestamps against Shift Assignment.
 */
export async function commitAlumDoorLiteAttendanceScan(
  input: AlumDoorAttendanceScanInput,
  services: AlumDoorAttendanceScanServices,
): Promise<JsonObject> {
  const now = services.now?.() ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(now))) throw errors.validation("Attendance scan time is invalid");

  const station = await recordData(services.store, input.tenantId, "AlumDoor QR Station", input.station);
  const policyName = requiredText(station.policy, "QR station policy");
  const policy = await recordData(services.store, input.tenantId, "AlumDoor Attendance Policy", policyName);
  const timezone = requiredText(policy.timezone, "Attendance policy timezone");
  const current = segmentForServerTime(now, timezone, policyWindows(policy));

  const store = new Proxy(services.store, {
    get(target, property, receiver) {
      if (property !== "getDocument") return Reflect.get(target, property, receiver);
      return async <T extends JsonObject>(tenantId: string, doctype: string, name: string): Promise<CanonicalDocument<T> | null> => {
        const document = await target.getDocument<T>(tenantId, doctype, name);
        if (!document || doctype !== DAY_DOCTYPE) return document;
        return moveOpenIntervalToTarget(document, current.code);
      };
    },
  }) as MutationStore;

  return commitAlumDoorAttendanceScan(input, { ...services, store, now: () => now });
}

export function moveOpenAttendanceIntervalForLite(
  document: CanonicalDocument<JsonObject>,
  targetCode: AttendanceSegmentCode,
): CanonicalDocument<JsonObject> {
  return moveOpenIntervalToTarget(document, targetCode);
}

function moveOpenIntervalToTarget<T extends JsonObject>(
  document: CanonicalDocument<T>,
  targetCode: AttendanceSegmentCode,
): CanonicalDocument<T> {
  const sourceRows = Array.isArray(document.data.segments)
    ? document.data.segments.filter((row): row is JsonObject => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  const segments = sourceRows.map((row) => ({ ...row }));
  const open = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => text(segment.actual_in) && !text(segment.actual_out));
  if (open.length === 0) return document;
  if (open.length > 1) throw errors.validation("Attendance day contains multiple open IN intervals");

  const source = open[0]!;
  const sourceCode = requiredText(source.segment.segment_code, "Open attendance segment") as AttendanceSegmentCode;
  if (sourceCode === targetCode) return document;

  const targetIndex = segments.findIndex((segment) => text(segment.segment_code) === targetCode);
  if (targetIndex < 0) throw errors.validation(`Attendance day is missing target segment ${targetCode}`);
  const target = segments[targetIndex]!;
  if (text(target.actual_in) || text(target.actual_out)) {
    throw errors.lifecycle(`Attendance segment ${targetCode} already contains scan evidence`);
  }

  segments[targetIndex] = {
    ...target,
    state: "open",
    actual_in: requiredText(source.segment.actual_in, "Open attendance IN"),
    ...(text(source.segment.in_checkin) ? { in_checkin: text(source.segment.in_checkin) } : {}),
  };
  segments[source.index] = {
    row_id: text(source.segment.row_id) || sourceCode,
    segment_code: sourceCode,
    state: "empty",
  };

  return {
    ...document,
    data: { ...document.data, segments } as T,
  };
}

function policyWindows(policy: JsonObject): AttendanceSegmentWindow[] {
  const shift1Start = integer(policy.shift1_start_minute, 420);
  const shift1End = integer(policy.shift1_end_minute, 690);
  const shift2Start = integer(policy.shift2_start_minute, 780);
  const shift2End = integer(policy.shift2_end_minute, 1020);
  const shift3Start = integer(policy.shift3_start_minute, 1050);
  const shift3End = integer(policy.shift3_latest_out_minute, 1439) + 1;
  return [
    { code: "SHIFT1", scanStartMinute: shift1Start - 90, scanEndMinute: shift1End + 59, workStartMinute: shift1Start, workEndMinute: shift1End },
    { code: "SHIFT2", scanStartMinute: shift2Start - 30, scanEndMinute: shift2End + 29, workStartMinute: shift2Start, workEndMinute: shift2End },
    { code: "SHIFT3", scanStartMinute: shift3Start, scanEndMinute: shift3End - 1, workStartMinute: shift3Start, workEndMinute: shift3End },
  ];
}

async function recordData(store: MutationStore, tenantId: string, doctype: string, nameValue: unknown): Promise<JsonObject> {
  const name = requiredText(nameValue, doctype);
  const document = await store.getDocument<JsonObject>(tenantId, doctype, name);
  if (document && document.docstatus !== 2) return document.data;
  const master = await store.getMasterRecordData(tenantId, doctype, name);
  if (master) return master;
  throw errors.reference(`${doctype} ${name} does not exist`);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw errors.validation(`${field} is required`);
  return result;
}

function integer(value: unknown, fallback: number): number {
  const parsed = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed)) throw errors.validation("Attendance policy minute value is invalid");
  return parsed;
}
