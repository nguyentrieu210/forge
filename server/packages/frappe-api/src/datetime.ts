/**
 * Frappe wire datetimes and the optimistic-concurrency bridge.
 *
 * The kernel guards writes with an integer `version`; Frappe clients guard with
 * the `modified` timestamp they last read and expect HTTP 417 when it no longer
 * matches. A naive `modified_at` passthrough is NOT safe: the aggregate Durable
 * Object can commit two versions inside the same millisecond, producing two
 * distinct versions with an identical `modified_at`. A stale client would then
 * pass the equality check and silently clobber a write.
 *
 * So the wire value encodes both: Frappe's `modified` carries 6 fractional
 * digits (microseconds), and we pack `milliseconds * 1000 + version % 1000`
 * into them. Range is exact — ms is 0..999 and version%1000 is 0..999, giving
 * 0..999999. The value stays a valid Frappe datetime, stays monotonic within a
 * document (version only increases), and differs whenever the version differs.
 *
 * All values are UTC. Frappe stores naive site-local datetimes; we deliberately
 * standardise on UTC and let the client's locale layer format for display.
 */

const FRAPPE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z?$/;

/** ISO-8601 → `YYYY-MM-DD HH:mm:ss.ffffff` (UTC, microseconds zero-padded). */
export function toFrappeDatetime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`Not a datetime: ${iso}`);
  return format(parsed, parsed.getUTCMilliseconds() * 1000);
}

/**
 * The `modified` value a Frappe client must echo back to write this document.
 * Encodes the kernel version so two versions never share one wire value.
 */
export function toFrappeModified(modifiedAt: string, version: number): string {
  const parsed = new Date(modifiedAt);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`Not a datetime: ${modifiedAt}`);
  if (!Number.isInteger(version) || version < 0) throw new TypeError(`Not a version: ${version}`);
  return format(parsed, parsed.getUTCMilliseconds() * 1000 + (version % 1000));
}

/** `YYYY-MM-DD HH:mm:ss[.ffffff]` (or ISO) → ISO-8601 UTC. */
export function fromFrappeDatetime(value: string): string {
  const match = FRAPPE_DATETIME.exec(value.trim());
  if (!match) throw new TypeError(`Not a Frappe datetime: ${value}`);
  const [, year, month, day, hour, minute, second, fraction] = match;
  // Only the leading 3 fractional digits are milliseconds; the rest is our
  // version packing (or Frappe's own microseconds) and is not part of the clock.
  const millis = fraction ? Number(fraction.padEnd(6, "0").slice(0, 3)) : 0;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${String(millis).padStart(3, "0")}Z`;
}

/** `YYYY-MM-DD` in UTC, for Date fields. */
export function toFrappeDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`Not a date: ${iso}`);
  return parsed.toISOString().slice(0, 10);
}

function format(date: Date, micros: number): string {
  const pad = (value: number, width: number): string => String(value).padStart(width, "0");
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`
    + ` ${pad(date.getUTCHours(), 2)}:${pad(date.getUTCMinutes(), 2)}:${pad(date.getUTCSeconds(), 2)}`
    + `.${pad(micros, 6)}`;
}
