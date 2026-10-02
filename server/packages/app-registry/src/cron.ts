import { errors } from "../../core/src/index.js";

export interface CronClock {
  minute: number;
  hour: number;
  day: number;
  month: number;
  weekday: number;
}

interface CronField {
  values: ReadonlySet<number>;
  wildcard: boolean;
}

interface ParsedCron {
  minute: CronField;
  hour: CronField;
  day: CronField;
  month: CronField;
  weekday: CronField;
}

/**
 * Bounded Frappe-compatible cron subset for app manifests.
 *
 * Frappe delegates to croniter. Forge deliberately accepts only the portable five-field
 * numeric grammar: *, lists, ranges and steps. croniter extensions such as L/# and named
 * months/days are rejected at install time rather than silently interpreted differently.
 */
export function validateCronExpression(expression: string): string {
  parseCron(expression);
  return expression.trim().replace(/\s+/g, " ");
}

export function cronMatches(expression: string, clock: CronClock): boolean {
  const parsed = parseCron(expression);
  if (!parsed.minute.values.has(clock.minute)) return false;
  if (!parsed.hour.values.has(clock.hour)) return false;
  if (!parsed.month.values.has(clock.month)) return false;

  const dayMatch = parsed.day.values.has(clock.day);
  const weekdayMatch = parsed.weekday.values.has(clock.weekday === 0 ? 0 : clock.weekday);
  // Vixie/croniter semantics: when both day-of-month and day-of-week are restricted,
  // either one may match. When one is *, the other is authoritative.
  if (parsed.day.wildcard && parsed.weekday.wildcard) return true;
  if (parsed.day.wildcard) return weekdayMatch;
  if (parsed.weekday.wildcard) return dayMatch;
  return dayMatch || weekdayMatch;
}

function parseCron(expression: string): ParsedCron {
  const raw = expression.trim().replace(/\s+/g, " ");
  const fields = raw.split(" ");
  if (fields.length !== 5) {
    throw errors.validation(`Cron expression must have exactly five fields: ${expression}`);
  }
  return {
    minute: parseField(fields[0]!, 0, 59, "minute"),
    hour: parseField(fields[1]!, 0, 23, "hour"),
    day: parseField(fields[2]!, 1, 31, "day-of-month"),
    month: parseField(fields[3]!, 1, 12, "month"),
    weekday: parseField(fields[4]!, 0, 7, "day-of-week", true),
  };
}

function parseField(raw: string, min: number, max: number, label: string, sundaySeven = false): CronField {
  if (!raw || /[^0-9*,\/-]/.test(raw)) {
    throw errors.validation(`Unsupported cron ${label}: ${raw}`);
  }
  const values = new Set<number>();
  for (const item of raw.split(",")) {
    if (!item) throw errors.validation(`Invalid cron ${label}: ${raw}`);
    const slash = item.split("/");
    if (slash.length > 2) throw errors.validation(`Invalid cron ${label}: ${raw}`);
    const base = slash[0]!;
    const step = slash.length === 2 ? integer(slash[1]!, 1, max - min + 1, label) : 1;

    let start: number;
    let end: number;
    if (base === "*") {
      start = min;
      end = max;
    } else if (base.includes("-")) {
      const range = base.split("-");
      if (range.length !== 2) throw errors.validation(`Invalid cron ${label}: ${raw}`);
      start = integer(range[0]!, min, max, label);
      end = integer(range[1]!, min, max, label);
      if (end < start) throw errors.validation(`Cron ${label} range must be ascending: ${base}`);
    } else {
      start = integer(base, min, max, label);
      // croniter treats N/step as N-max, not as the single value N.
      end = slash.length === 2 ? max : start;
    }

    for (let value = start; value <= end; value += step) {
      values.add(sundaySeven && value === 7 ? 0 : value);
    }
  }
  if (!values.size) throw errors.validation(`Cron ${label} has no values: ${raw}`);
  return { values, wildcard: raw === "*" };
}

function integer(raw: string, min: number, max: number, label: string): number {
  if (!/^\d+$/.test(raw)) throw errors.validation(`Invalid cron ${label}: ${raw}`);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw errors.validation(`Cron ${label} must be between ${min} and ${max}: ${raw}`);
  }
  return value;
}
