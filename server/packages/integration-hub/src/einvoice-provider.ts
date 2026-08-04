import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import {
  assertAllowedWebhookTarget,
  decideDelivery,
  stableJsonStringify,
  type DeliveryDecision,
  type IntegrationRetryPolicy,
} from "./index.js";

export type EInvoiceProviderOperation = "submit" | "status_sync";
export type CanonicalEInvoiceProviderStatus = "Submitted" | "Accepted" | "Rejected" | "Cancelled";

export interface EInvoiceAuthoritySnapshot extends JsonObject {
  schema_version: 1;
  tenant_id: string;
  submission_name: string;
  provider: string;
  company: string;
  source_doctype: "Sales Invoice" | "Credit Note";
  source_name: string;
  source_version: number;
  operation_type: "Original" | "Adjustment" | "Replacement" | "Cancellation";
  posting_at: string;
  payload: JsonObject;
  payload_hash?: string;
  external_reference?: string;
}

export interface EInvoiceProviderRequest {
  method: "GET" | "POST";
  body?: string;
  content_type?: string;
  headers?: Readonly<Record<string, string>>;
}

export interface EInvoiceProviderResult {
  status: CanonicalEInvoiceProviderStatus;
  external_reference?: string;
  tax_authority_reference?: string;
  response_message?: string;
  provider_code?: string;
  evidence?: JsonObject;
}

export interface EInvoiceProviderAdapter {
  readonly provider_key: string;
  buildRequest(input: {
    operation: EInvoiceProviderOperation;
    authority: EInvoiceAuthoritySnapshot;
  }): Promise<EInvoiceProviderRequest> | EInvoiceProviderRequest;
  parseResponse(input: {
    operation: EInvoiceProviderOperation;
    authority: EInvoiceAuthoritySnapshot;
    http_status: number;
    headers: Headers;
    body: string;
  }): Promise<EInvoiceProviderResult> | EInvoiceProviderResult;
}

export interface EInvoiceResolvedCredential {
  /** Ephemeral provider authentication headers. Never persisted in evidence. */
  headers?: Readonly<Record<string, string>>;
}

export interface EInvoiceCredentialResolver {
  resolve(input: { tenant_id: string; provider: string; credential_ref: string }): Promise<EInvoiceResolvedCredential>;
}

export interface EInvoiceRequestSignature {
  /** Ephemeral provider signature headers. Never persisted in evidence. */
  headers?: Readonly<Record<string, string>>;
  /** Safe provider/KMS certificate/signature identifier only; no secret material. */
  signature_reference?: string;
}

export interface EInvoiceRequestSigner {
  sign(input: {
    operation: EInvoiceProviderOperation;
    tenant_id: string;
    provider: string;
    submission_name: string;
    credential_ref: string;
    idempotency_key: string;
    canonical_payload_hash: string;
    request_hash: string;
    body: string;
  }): Promise<EInvoiceRequestSignature>;
}

export interface EInvoiceTransport {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export interface CanonicalEInvoiceEvidencePatch extends JsonObject {
  submission_status: CanonicalEInvoiceProviderStatus;
  payload_hash: string;
  response_evidence_json: string;
  external_reference?: string;
  response_message?: string;
  signature_reference?: string;
  tax_authority_reference?: string;
}

export interface EInvoiceProviderExecutionResult {
  operation: EInvoiceProviderOperation;
  idempotency_key: string;
  canonical_payload_hash: string;
  request_hash: string;
  decision: DeliveryDecision;
  attempt: number;
  http_status?: number;
  transport_error?: boolean;
  evidence_patch?: CanonicalEInvoiceEvidencePatch;
}

const PROTECTED_HEADERS = new Set([
  "content-length",
  "host",
  "cookie",
  "x-cloudforge-einvoice-idempotency-key",
  "x-cloudforge-einvoice-submission",
  "x-cloudforge-einvoice-operation",
]);
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "password", "secret", "client_secret", "access_token", "refresh_token", "api_key", "private_key",
  "service_account_key", "authorization", "cookie", "set_cookie",
]);
const MAX_REQUEST_BYTES = 2_000_000;
const MAX_RESPONSE_BYTES = 512_000;

/**
 * Execute one provider transport operation without mutating Finance authority.
 *
 * The caller must persist `evidence_patch` only through the canonical E-Invoice
 * Submission controller/kernel with normal permission/idempotency checks. This
 * executor never writes documents, GL, tax, stock or provider state directly.
 */
export async function executeEInvoiceProviderOperation(input: {
  operation: EInvoiceProviderOperation;
  authority: EInvoiceAuthoritySnapshot;
  target_url: string;
  allowed_hosts: readonly string[];
  credential_ref: string;
  adapter: EInvoiceProviderAdapter;
  credential_resolver: EInvoiceCredentialResolver;
  signer?: EInvoiceRequestSigner;
  transport: EInvoiceTransport;
  attempt: number;
  retry_policy?: Partial<IntegrationRetryPolicy>;
  now?: Date;
}): Promise<EInvoiceProviderExecutionResult> {
  const authority = validateAuthoritySnapshot(input.authority, input.operation);
  const providerKey = requireText(input.adapter.provider_key, "adapter.provider_key", 160);
  if (providerKey !== authority.provider) throw new Error("E-invoice adapter provider does not match canonical submission provider");
  assertAllowedWebhookTarget(input.target_url, input.allowed_hosts);
  const credentialRef = requireText(input.credential_ref, "credential_ref", 320);
  const attempt = positiveInteger(input.attempt, "attempt", 10_000);

  const request = validateProviderRequest(await input.adapter.buildRequest({ operation: input.operation, authority }));
  const body = request.body ?? "";
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) throw new Error("E-invoice provider request exceeds payload limit");
  const requestHash = await sha256Hex(body);
  const canonicalPayloadHash = input.operation === "submit"
    ? requestHash
    : requireHash(authority.payload_hash, "authority.payload_hash");
  if (input.operation === "submit" && authority.payload_hash && !constantTimeEqual(requireHash(authority.payload_hash, "authority.payload_hash"), canonicalPayloadHash)) {
    throw new Error("Canonical e-invoice payload hash does not match provider submission payload");
  }

  const idempotencyKey = await deriveEInvoiceIdempotencyKey(input.operation, authority, canonicalPayloadHash);
  const credential = await input.credential_resolver.resolve({
    tenant_id: authority.tenant_id,
    provider: authority.provider,
    credential_ref: credentialRef,
  });
  const signature = input.signer
    ? await input.signer.sign({
        operation: input.operation,
        tenant_id: authority.tenant_id,
        provider: authority.provider,
        submission_name: authority.submission_name,
        credential_ref: credentialRef,
        idempotency_key: idempotencyKey,
        canonical_payload_hash: canonicalPayloadHash,
        request_hash: requestHash,
        body,
      })
    : {};

  const headers: Record<string, string> = {
    "x-cloudforge-einvoice-idempotency-key": idempotencyKey,
    "x-cloudforge-einvoice-submission": authority.submission_name,
    "x-cloudforge-einvoice-operation": input.operation,
  };
  if (request.content_type) headers["content-type"] = requireHeaderValue(request.content_type, "content_type", 256);
  mergeProviderHeaders(headers, request.headers, "adapter");
  mergeProviderHeaders(headers, credential.headers, "credential");
  mergeProviderHeaders(headers, signature.headers, "signature");

  try {
    const response = await input.transport.fetch(input.target_url, {
      method: request.method,
      headers,
      ...(request.method === "POST" ? { body } : {}),
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) {
      return {
        operation: input.operation,
        idempotency_key: idempotencyKey,
        canonical_payload_hash: canonicalPayloadHash,
        request_hash: requestHash,
        decision: { action: "dead_letter", retry_after_seconds: null, reason: `redirect_blocked_${response.status}` },
        attempt,
        http_status: response.status,
      };
    }

    const responseBody = await response.text();
    if (new TextEncoder().encode(responseBody).byteLength > MAX_RESPONSE_BYTES) {
      return {
        operation: input.operation,
        idempotency_key: idempotencyKey,
        canonical_payload_hash: canonicalPayloadHash,
        request_hash: requestHash,
        decision: decideDelivery({ attempt, transport_error: true }, input.retry_policy),
        attempt,
        http_status: response.status,
      };
    }
    const decision = decideDelivery({ attempt, http_status: response.status }, input.retry_policy);
    let providerResult: EInvoiceProviderResult;
    try {
      providerResult = validateProviderResult(await input.adapter.parseResponse({
        operation: input.operation,
        authority,
        http_status: response.status,
        headers: response.headers,
        body: responseBody,
      }));
    } catch {
      return {
        operation: input.operation,
        idempotency_key: idempotencyKey,
        canonical_payload_hash: canonicalPayloadHash,
        request_hash: requestHash,
        decision: decision.action === "dead_letter"
          ? decision
          : decideDelivery({ attempt, transport_error: true }, input.retry_policy),
        attempt,
        http_status: response.status,
      };
    }

    const result: EInvoiceProviderExecutionResult = {
      operation: input.operation,
      idempotency_key: idempotencyKey,
      canonical_payload_hash: canonicalPayloadHash,
      request_hash: requestHash,
      decision,
      attempt,
      http_status: response.status,
    };
    if (decision.action !== "retry") {
      result.evidence_patch = await buildCanonicalEvidencePatch({
        operation: input.operation,
        authority,
        provider_result: providerResult,
        canonical_payload_hash: canonicalPayloadHash,
        request_hash: requestHash,
        response_body: responseBody,
        http_status: response.status,
        idempotency_key: idempotencyKey,
        signature_reference: signature.signature_reference,
        observed_at: (input.now ?? new Date()).toISOString(),
      });
    }
    return result;
  } catch {
    return {
      operation: input.operation,
      idempotency_key: idempotencyKey,
      canonical_payload_hash: canonicalPayloadHash,
      request_hash: requestHash,
      decision: decideDelivery({ attempt, transport_error: true }, input.retry_policy),
      attempt,
      transport_error: true,
    };
  }
}

export async function deriveEInvoiceIdempotencyKey(
  operation: EInvoiceProviderOperation,
  authority: EInvoiceAuthoritySnapshot,
  canonicalPayloadHash: string,
): Promise<string> {
  const snapshot = validateAuthoritySnapshot(authority, operation);
  const hash = requireHash(canonicalPayloadHash, "canonical_payload_hash");
  const identity = [
    snapshot.tenant_id,
    snapshot.submission_name,
    snapshot.provider,
    snapshot.source_doctype,
    snapshot.source_name,
    String(snapshot.source_version),
    snapshot.operation_type,
    operation,
    hash,
    operation === "status_sync" ? snapshot.external_reference ?? "" : "",
  ].join("\n");
  return `ein_${(await sha256Hex(identity)).slice(0, 48)}`;
}

export async function buildCanonicalEvidencePatch(input: {
  operation: EInvoiceProviderOperation;
  authority: EInvoiceAuthoritySnapshot;
  provider_result: EInvoiceProviderResult;
  canonical_payload_hash: string;
  request_hash: string;
  response_body: string;
  http_status: number;
  idempotency_key: string;
  signature_reference?: string;
  observed_at: string;
}): Promise<CanonicalEInvoiceEvidencePatch> {
  const authority = validateAuthoritySnapshot(input.authority, input.operation);
  const providerResult = validateProviderResult(input.provider_result);
  const responseHash = await sha256Hex(input.response_body);
  const evidence: JsonObject = {
    schema_version: 1,
    provider: authority.provider,
    operation: input.operation,
    http_status: input.http_status,
    idempotency_key: requireText(input.idempotency_key, "idempotency_key", 160),
    request_hash: requireHash(input.request_hash, "request_hash"),
    response_hash: responseHash,
    observed_at: requireIso(input.observed_at, "observed_at"),
    ...(providerResult.provider_code ? { provider_code: providerResult.provider_code } : {}),
    ...(providerResult.evidence ? { provider_evidence: validateEvidenceObject(providerResult.evidence) } : {}),
  };
  const patch: CanonicalEInvoiceEvidencePatch = {
    submission_status: providerResult.status,
    payload_hash: requireHash(input.canonical_payload_hash, "canonical_payload_hash"),
    response_evidence_json: stableJsonStringify(evidence),
    ...(providerResult.external_reference ? { external_reference: providerResult.external_reference } : {}),
    ...(providerResult.response_message ? { response_message: providerResult.response_message } : {}),
    ...(input.signature_reference ? { signature_reference: requireText(input.signature_reference, "signature_reference", 1_000) } : {}),
    ...(providerResult.tax_authority_reference ? { tax_authority_reference: providerResult.tax_authority_reference } : {}),
  };
  return patch;
}

/**
 * Shared-secret callback primitive for providers that support timestamped HMAC.
 * The secret is supplied ephemerally by the credential boundary and is never
 * returned. Provider adapters with certificate/XML-specific signatures can use a
 * different verifier while preserving the same callback identity semantics.
 */
export async function verifyHmacEInvoiceCallback(input: {
  tenant_id: string;
  provider: string;
  submission_name: string;
  raw_body: string;
  timestamp: string;
  signature: string;
  secret: string;
  now?: Date;
  max_skew_seconds?: number;
}): Promise<{ callback_id: string; payload_hash: string }> {
  const tenantId = requireText(input.tenant_id, "tenant_id", 128);
  const provider = requireText(input.provider, "provider", 160);
  const submission = requireText(input.submission_name, "submission_name", 320);
  const timestamp = requireText(input.timestamp, "timestamp", 80);
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) throw new Error("Invalid callback timestamp");
  const maxSkew = input.max_skew_seconds ?? 300;
  positiveInteger(maxSkew, "max_skew_seconds", 86_400);
  if (Math.abs((input.now ?? new Date()).getTime() - timestampMs) > maxSkew * 1_000) throw new Error("E-invoice callback timestamp is outside the allowed skew");
  const secret = requireSecret(input.secret);
  const expected = await hmacSha256Hex(secret, `${timestamp}.${input.raw_body}`);
  const supplied = input.signature.trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(supplied) || !constantTimeEqual(supplied, expected)) throw new Error("Invalid e-invoice callback signature");
  const payloadHash = await sha256Hex(input.raw_body);
  return {
    callback_id: `eicb_${(await sha256Hex(`${tenantId}\n${provider}\n${submission}\n${timestamp}\n${payloadHash}`)).slice(0, 48)}`,
    payload_hash: payloadHash,
  };
}

export async function signHmacEInvoiceCallback(secret: string, timestamp: string, rawBody: string): Promise<string> {
  requireSecret(secret);
  requireText(timestamp, "timestamp", 80);
  return `sha256=${await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)}`;
}

function validateAuthoritySnapshot(value: EInvoiceAuthoritySnapshot, operation: EInvoiceProviderOperation): EInvoiceAuthoritySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schema_version !== 1) throw new Error("Invalid E-Invoice authority snapshot");
  requireText(value.tenant_id, "tenant_id", 128);
  requireText(value.submission_name, "submission_name", 320);
  requireText(value.provider, "provider", 160);
  requireText(value.company, "company", 320);
  if (value.source_doctype !== "Sales Invoice" && value.source_doctype !== "Credit Note") throw new Error("Invalid source_doctype");
  requireText(value.source_name, "source_name", 320);
  positiveInteger(value.source_version, "source_version", Number.MAX_SAFE_INTEGER);
  if (!["Original", "Adjustment", "Replacement", "Cancellation"].includes(value.operation_type)) throw new Error("Invalid operation_type");
  requireIso(value.posting_at, "posting_at");
  if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) throw new Error("Invalid e-invoice payload");
  if (value.payload_hash !== undefined) requireHash(value.payload_hash, "payload_hash");
  if (value.external_reference !== undefined) requireText(value.external_reference, "external_reference", 1_000);
  if (operation === "status_sync" && !value.payload_hash) throw new Error("Status sync requires canonical payload_hash");
  if (operation === "status_sync" && !value.external_reference) throw new Error("Status sync requires external_reference");
  return value;
}

function validateProviderRequest(value: EInvoiceProviderRequest): EInvoiceProviderRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid e-invoice provider request");
  if (value.method !== "GET" && value.method !== "POST") throw new Error("Unsupported e-invoice provider method");
  if (value.method === "GET" && value.body !== undefined) throw new Error("GET e-invoice provider request must not contain a body");
  if (value.body !== undefined && typeof value.body !== "string") throw new Error("Invalid e-invoice provider request body");
  if (value.content_type !== undefined) requireHeaderValue(value.content_type, "content_type", 256);
  return value;
}

function validateProviderResult(value: EInvoiceProviderResult): EInvoiceProviderResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid e-invoice provider result");
  if (!["Submitted", "Accepted", "Rejected", "Cancelled"].includes(value.status)) throw new Error("Invalid canonical e-invoice provider status");
  if (value.external_reference !== undefined) requireText(value.external_reference, "external_reference", 1_000);
  if (value.tax_authority_reference !== undefined) requireText(value.tax_authority_reference, "tax_authority_reference", 1_000);
  if (value.response_message !== undefined) requireText(value.response_message, "response_message", 2_000);
  if (value.provider_code !== undefined) requireText(value.provider_code, "provider_code", 320);
  if (value.evidence !== undefined) validateEvidenceObject(value.evidence);
  return value;
}

function validateEvidenceObject(value: JsonObject): JsonObject {
  const encoded = stableJsonStringify(value);
  if (encoded.length > 32_768) throw new Error("Provider evidence exceeds size limit");
  walkEvidence(value, "evidence", 0);
  return cloneJsonObject(value);
}

function walkEvidence(value: JsonValue, path: string, depth: number): void {
  if (depth > 12) throw new Error("Provider evidence nesting exceeds limit");
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new Error("Provider evidence array exceeds limit");
    value.forEach((item, index) => walkEvidence(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll("-", "_");
    if (key === "__proto__" || key === "prototype" || key === "constructor") throw new Error(`Unsafe provider evidence key: ${path}.${key}`);
    if (FORBIDDEN_EVIDENCE_KEYS.has(normalized)) throw new Error(`Credential material is forbidden in provider evidence: ${path}.${key}`);
    if (child !== undefined) walkEvidence(child, `${path}.${key}`, depth + 1);
  }
}

function mergeProviderHeaders(target: Record<string, string>, source: Readonly<Record<string, string>> | undefined, sourceName: string): void {
  for (const [rawName, rawValue] of Object.entries(source ?? {})) {
    const name = rawName.trim().toLowerCase();
    const value = requireHeaderValue(rawValue, `${sourceName} header`, 8_192);
    if (!HEADER_NAME_RE.test(name)) throw new Error(`Invalid ${sourceName} header name`);
    if (PROTECTED_HEADERS.has(name) || name.startsWith("x-cloudforge-")) throw new Error(`${sourceName} cannot override protected e-invoice header: ${name}`);
    if (target[name] !== undefined) throw new Error(`Duplicate e-invoice provider header: ${name}`);
    target[name] = value;
  }
}

function requireHeaderValue(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\0]/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
}

function requireIso(value: unknown, field: string): string {
  const text = requireText(value, field, 80);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`Invalid ${field}`);
  return text;
}

function requireHash(value: unknown, field: string): string {
  const text = requireText(value, field, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`Invalid ${field}`);
  return text;
}

function requireSecret(value: string): string {
  if (typeof value !== "string" || value.length < 16 || value.length > 16_384) throw new Error("Invalid e-invoice callback secret");
  return value;
}

function positiveInteger(value: unknown, field: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > max) throw new Error(`Invalid ${field}`);
  return value;
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneJsonValue(value) as JsonObject;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) output[key] = cloneJsonValue(item);
  return output;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
