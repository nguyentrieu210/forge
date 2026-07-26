/**
 * Frappe argument parsing.
 *
 * A Frappe method takes one flat argument bag assembled from the query string
 * AND the body, where the body may be JSON or form-encoded, and where any
 * structured value (filters, fields, a whole document) arrives as a JSON string
 * rather than as real JSON. The client relies on all of that, so the façade
 * accepts every form instead of picking one.
 */

import { errors } from "../../core/src/index.js";
import type { JsonObject, JsonValue } from "../../contracts/src/index.js";

export class FrappeArgs {
  constructor(private readonly values: Map<string, string | JsonValue>) {}

  /** Raw value, whatever form it arrived in. */
  get(name: string): string | JsonValue | undefined {
    return this.values.get(name);
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  /** Trimmed string, or `undefined` when absent/blank. */
  text(name: string): string | undefined {
    const value = this.values.get(name);
    if (value === undefined || value === null) return undefined;
    const text = typeof value === "string" ? value.trim() : String(value);
    return text === "" ? undefined : text;
  }

  /** Trimmed string; throws when absent so a required argument fails closed. */
  requireText(name: string, max = 320): string {
    const value = this.text(name);
    if (!value) throw errors.validation(`${name} is required`);
    if (value.length > max) throw errors.validation(`${name} must be at most ${max} characters`);
    return value;
  }

  /** Frappe booleans arrive as 1/0, "1"/"0", "true"/"false" or real booleans. */
  bool(name: string, fallback = false): boolean {
    const value = this.values.get(name);
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    return ["1", "true", "yes"].includes(String(value).trim().toLowerCase());
  }

  int(name: string, fallback: number): number {
    const value = this.values.get(name);
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw errors.validation(`${name} must be an integer`);
    return parsed;
  }

  /**
   * Structured argument. Accepts a real JSON value or a JSON string — Frappe
   * clients send `filters=[["Item","name","=","X"]]` as a string.
   */
  json<T extends JsonValue>(name: string): T | undefined {
    const value = this.values.get(name);
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") return value as T;
    try {
      return JSON.parse(value) as T;
    } catch {
      throw errors.validation(`${name} must be valid JSON`);
    }
  }

  /** Structured argument constrained to an array. */
  array<T extends JsonValue>(name: string): T[] | undefined {
    const parsed = this.json<JsonValue>(name);
    if (parsed === undefined) return undefined;
    if (!Array.isArray(parsed)) throw errors.validation(`${name} must be a JSON array`);
    return parsed as T[];
  }

  /** Structured argument constrained to an object. */
  object(name: string): JsonObject | undefined {
    const parsed = this.json<JsonValue>(name);
    if (parsed === undefined) return undefined;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw errors.validation(`${name} must be a JSON object`);
    return parsed as JsonObject;
  }
}

const MAX_BODY_BYTES = 2_000_000;

/** Merges query string and body into one argument bag; body wins on collision. */
export async function readFrappeArgs(request: Request, url: URL): Promise<FrappeArgs> {
  const values = new Map<string, string | JsonValue>();
  for (const [key, value] of url.searchParams) values.set(key, value);

  if (request.method === "GET" || request.method === "HEAD" || !request.body) return new FrappeArgs(values);

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const text = await readBounded(request, MAX_BODY_BYTES);
  if (text === "") return new FrappeArgs(values);

  if (contentType.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw errors.validation("Request body is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw errors.validation("Request body must be a JSON object");
    for (const [key, value] of Object.entries(parsed as JsonObject)) values.set(key, value ?? null);
    return new FrappeArgs(values);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    for (const [key, value] of new URLSearchParams(text)) values.set(key, value);
    return new FrappeArgs(values);
  }

  throw errors.validation("Request body must be JSON or form-encoded");
}

/**
 * Streams the body while counting bytes, aborting as soon as the running total
 * exceeds the limit — an absent or understated Content-Length must not be able
 * to force a large allocation.
 */
async function readBounded(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw errors.validation("Request body exceeds size limit");
  const body = request.body;
  if (!body) return "";
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw errors.validation("Request body exceeds size limit");
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}
