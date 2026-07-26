/**
 * Auto Repeat — recreating a document on a schedule.
 *
 * "Repeat this order monthly." Frappe models it per SOURCE DOCUMENT rather than per
 * doctype, and so does this: the thing a user asks for is that THIS order repeats, and
 * it must stop when that order is cancelled.
 *
 * THE RULE THAT MATTERS: the next date advances only AFTER a document is created. A
 * scheduler that advanced first would turn any failure — a validation error, an app
 * validator refusing, a Worker restart — into a silently skipped period. Nobody notices
 * a document that was never created; they notice it a quarter later when the totals are
 * short.
 */

import { errors } from "../../core/src/index.js";
import type { JsonObject } from "../../contracts/src/index.js";

export type RepeatFrequency = "Daily" | "Weekly" | "Monthly" | "Yearly";

const FREQUENCIES = new Set<RepeatFrequency>(["Daily", "Weekly", "Monthly", "Yearly"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface AutoRepeatRule {
  name: string;
  reference_doctype: string;
  reference_name: string;
  frequency: RepeatFrequency;
  start_date: string;
  end_date?: string;
  next_schedule_date: string;
  status: "Active" | "Stopped" | "Completed";
}

export function parseAutoRepeat(value: unknown): AutoRepeatRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("Auto repeat must be an object");
  const input = value as JsonObject;

  const frequency = String(input.frequency ?? "") as RepeatFrequency;
  if (!FREQUENCIES.has(frequency)) throw errors.validation(`frequency must be one of ${[...FREQUENCIES].join(", ")}`);

  const startDate = date(input.start_date, "start_date");
  const endDate = input.end_date === undefined || input.end_date === null || input.end_date === "" ? undefined : date(input.end_date, "end_date");
  // An end before the start would never fire, and would look configured.
  if (endDate && endDate < startDate) throw errors.validation("end_date cannot be before start_date");

  return {
    name: text(input.name, "name", 140),
    reference_doctype: text(input.reference_doctype, "reference_doctype", 160),
    reference_name: text(input.reference_name, "reference_name", 320),
    frequency,
    start_date: startDate,
    ...(endDate ? { end_date: endDate } : {}),
    // A new schedule starts at its start date: the first run is the start, not the one
    // after it.
    next_schedule_date: input.next_schedule_date === undefined ? startDate : date(input.next_schedule_date, "next_schedule_date"),
    status: input.status === "Stopped" || input.status === "Completed" ? input.status : "Active",
  };
}

/**
 * The date after this one.
 *
 * Month and year arithmetic CLAMPS to the end of the target month: a schedule starting
 * on the 31st must not skip February, and adding a month to 31 January in a naive
 * calendar gives 3 March, silently moving the run into the wrong month. Frappe clamps,
 * and a tenant moving data between the two would otherwise see the day drift.
 */
export function nextScheduleDate(current: string, frequency: RepeatFrequency): string {
  if (!DATE.test(current)) throw errors.validation("next_schedule_date must be YYYY-MM-DD");
  const [year, month, day] = current.split("-").map(Number) as [number, number, number];

  if (frequency === "Daily") return shiftDays(current, 1);
  if (frequency === "Weekly") return shiftDays(current, 7);

  const targetYear = frequency === "Yearly" ? year + 1 : month === 12 ? year + 1 : year;
  const targetMonth = frequency === "Yearly" ? month : month === 12 ? 1 : month + 1;
  const lastDay = daysInMonth(targetYear, targetMonth);
  return `${pad(targetYear, 4)}-${pad(targetMonth, 2)}-${pad(Math.min(day, lastDay), 2)}`;
}

/** Schedules due on or before `today`, in date order so the oldest period runs first. */
export function dueSchedules(rules: AutoRepeatRule[], today: string): AutoRepeatRule[] {
  return rules
    .filter((rule) => rule.status === "Active")
    .filter((rule) => rule.next_schedule_date <= today)
    // A schedule whose end has passed is finished, not overdue — running it would create
    // a document for a period the user explicitly bounded.
    .filter((rule) => !rule.end_date || rule.next_schedule_date <= rule.end_date)
    .sort((a, b) => a.next_schedule_date.localeCompare(b.next_schedule_date));
}

/** Whether a schedule has produced everything it ever will. */
export function isCompleted(rule: AutoRepeatRule, nextDate: string): boolean {
  return Boolean(rule.end_date && nextDate > rule.end_date);
}

function shiftDays(current: string, days: number): string {
  const moment = new Date(`${current}T00:00:00.000Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function date(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE.test(value)) throw errors.validation(`${field} must be YYYY-MM-DD`);
  return value;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(`${field} must be a non-empty string up to ${max} characters`);
  }
  return value.trim();
}
