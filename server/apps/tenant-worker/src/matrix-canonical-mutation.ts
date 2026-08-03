import type { JsonObject } from "../../../packages/contracts/src/index.js";
import { errors } from "../../../packages/core/src/index.js";
import { D1MutationStore } from "../../../packages/document-kernel/src/index.js";
import { toFrappeModified } from "../../../packages/frappe-api/src/index.js";
import type { PricingMatrixRecord } from "../../../packages/clouderp-pricing/src/matrix.js";
import coreWorker from "./index-core.js";
import type { TenantEnv } from "./env.js";

/**
 * Matrix domain mutations deliberately re-enter the canonical Frappe resource path.
 * That path already owns DocType validation, organization security, app validators,
 * permissions, OCC and Document-Kernel/DO serialization. A second direct D1/kernel
 * mutation implementation here would be faster to write and much more expensive to own.
 */
export function createCanonicalMatrixMutations(
  request: Request,
  env: TenantEnv,
  tenantId: string,
) {
  return {
    createDocument: async (input: {
      doctype: string;
      document: JsonObject;
      idempotencyKey: string;
    }): Promise<PricingMatrixRecord> => {
      const response = await callResource(request, env, "POST", input.doctype, undefined, input.document, input.idempotencyKey);
      const payload = await successfulResourcePayload(response, undefined);
      const name = requiredText(payload.name, "created document name");
      return await reloadRecord(env, tenantId, input.doctype, name);
    },
    updateDocument: async (input: {
      doctype: string;
      name: string;
      expectedVersion: number;
      patch: JsonObject;
      idempotencyKey: string;
    }): Promise<PricingMatrixRecord> => {
      const store = new D1MutationStore(env.DB);
      const current = await store.getDocument<JsonObject>(tenantId, input.doctype, input.name);
      if (!current) throw errors.notFound(`${input.doctype} ${input.name} was not found`);
      if (current.version !== input.expectedVersion) throw errors.version(current.version);
      const response = await callResource(
        request,
        env,
        "PUT",
        input.doctype,
        input.name,
        { ...input.patch, modified: toFrappeModified(current.modified_at, current.version) },
        input.idempotencyKey,
      );
      await successfulResourcePayload(response, input.expectedVersion);
      return await reloadRecord(env, tenantId, input.doctype, input.name);
    },
  };
}

async function callResource(
  request: Request,
  env: TenantEnv,
  method: "POST" | "PUT",
  doctype: string,
  name: string | undefined,
  document: JsonObject,
  idempotencyKey: string,
): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = name
    ? `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
    : `/api/resource/${encodeURIComponent(doctype)}`;
  url.search = "";
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  // The canonical Frappe command derives its kernel command_id from payload + version.
  // Keep the domain key on the internal request for tracing; domain replay additionally
  // converges already-applied operations before a retry reaches this mutation port.
  headers.set("x-cloudforge-idempotency-key", idempotencyKey);
  return coreWorker.fetch(new Request(url, { method, headers, body: JSON.stringify(document) }), env);
}

async function successfulResourcePayload(response: Response, expectedVersion: number | undefined): Promise<JsonObject> {
  const payload = await responseJson(response);
  if (response.ok) {
    const data = isObject(payload.data) ? payload.data : payload;
    if (!isObject(data)) throw errors.database("Canonical document mutation returned an invalid payload");
    return data;
  }
  const message = typeof payload.message === "string" && payload.message.trim()
    ? payload.message.trim()
    : "Canonical document mutation failed";
  const excType = typeof payload.exc_type === "string" ? payload.exc_type : "";
  if (excType === "TimestampMismatchError") throw errors.version(expectedVersion === undefined ? 0 : expectedVersion + 1);
  if (excType === "PermissionError") throw errors.permission(message);
  if (excType === "DoesNotExistError") throw errors.notFound(message);
  if (excType === "DuplicateEntryError") throw errors.exists(message);
  if (excType === "LinkValidationError") throw errors.reference(message);
  if (response.status >= 500) throw errors.database("Canonical document mutation failed");
  throw errors.validation(message);
}

async function reloadRecord(env: TenantEnv, tenantId: string, doctype: string, name: string): Promise<PricingMatrixRecord> {
  const document = await new D1MutationStore(env.DB).getDocument<JsonObject>(tenantId, doctype, name);
  if (!document) throw errors.database(`Canonical ${doctype} mutation committed but the document could not be reloaded`);
  return { name: document.name, version: document.version, modifiedAt: document.modified_at, data: { ...document.data } };
}

async function responseJson(response: Response): Promise<JsonObject> {
  try {
    const value = await response.json() as unknown;
    return isObject(value) ? value : {};
  } catch {
    if (response.ok) throw errors.database("Canonical document mutation returned non-JSON data");
    return {};
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.database(`${field} is missing from canonical response`);
  const normalized = String(value).trim();
  if (!normalized) throw errors.database(`${field} is missing from canonical response`);
  return normalized;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
