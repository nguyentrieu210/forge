import type { ApiErrorBody, JsonObject } from "../../contracts/src/index.js";
import { errors, asCloudForgeError } from "./errors.js";

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const result = new Headers(headers);
  result.set("content-type", "application/json; charset=utf-8");
  result.set("cache-control", "no-store");
  result.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers: result });
}

export function errorResponse(error: unknown, traceId: string): Response {
  const normalized = asCloudForgeError(error);
  if (normalized.status >= 500) {
    // Preserve the raw detail in server logs; the client body carries only the
    // generic message set by asCloudForgeError.
    console.error(JSON.stringify({
      level: "error",
      trace_id: traceId,
      code: normalized.code,
      detail: error instanceof Error ? error.message : String(error),
    }));
  }
  const body: ApiErrorBody = {
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
    trace_id: traceId,
  };
  return jsonResponse(body, normalized.status, { "x-cloudforge-trace-id": traceId });
}

export async function readJson<T extends JsonObject>(request: Request, maxBytes = 1_000_000): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw errors.validation("Request must use application/json");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw errors.validation("JSON request body exceeds size limit");
  const text = await readBoundedText(request, maxBytes);
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("JSON request body must be an object");
    return value as T;
  } catch (error) {
    if (error instanceof SyntaxError) throw errors.validation("Request body is not valid JSON");
    throw error;
  }
}

/**
 * Reads the request body as text while counting bytes incrementally, aborting
 * (and cancelling the stream) as soon as the running total exceeds maxBytes, so
 * an understated/absent Content-Length cannot force a large buffer allocation.
 */
async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  const body = request.body;
  if (!body) return "";
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw errors.validation("JSON request body exceeds size limit");
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return text;
}
