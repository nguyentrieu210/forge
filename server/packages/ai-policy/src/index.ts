import type { JsonObject } from "../../contracts/src/index.js";

export type ForgeAiPurpose = "receipt_ocr" | "context_assistant";
export type ForgeAiSensitivity = "public" | "internal" | "confidential";
export type ForgeAiRequestClass = "interactive" | "extraction" | "batch";

export interface ForgeAiGatewayOptions {
  id: string;
  skipCache?: boolean;
  cacheTtl?: number;
  cacheKey?: string;
  collectLog?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface ForgeAiBinding {
  run(
    model: string,
    input: JsonObject,
    options?: { gateway?: ForgeAiGatewayOptions },
  ): Promise<unknown>;
  aiGatewayLogId?: string;
}

export interface ForgeAiRequest {
  tenantId: string;
  userId?: string;
  app: string;
  purpose: ForgeAiPurpose;
  requestClass: ForgeAiRequestClass;
  sensitivity: ForgeAiSensitivity;
  input: JsonObject;
}

export interface ForgeAiRuntimePolicy {
  gatewayId?: string;
  policyVersion?: string;
}

export interface ForgeAiExecution {
  result: unknown;
  model: string;
  gatewayLogId?: string;
  usedGateway: boolean;
}

export class ForgeAiPolicyError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_context" | "quota_or_rate_limited" | "model_unavailable",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ForgeAiPolicyError";
  }
}

interface PurposePolicy {
  models: readonly string[];
  maxOutputTokens: number;
  cache: "disabled" | "safe-public-only";
  collectGatewayLog: boolean;
}

const PURPOSE_POLICIES: Record<ForgeAiPurpose, PurposePolicy> = {
  receipt_ocr: {
    models: [
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      "@cf/mistralai/mistral-small-3.1-24b-instruct",
      "@cf/meta/llama-3.2-11b-vision-instruct",
    ],
    maxOutputTokens: 2048,
    cache: "disabled",
    collectGatewayLog: false,
  },
  context_assistant: {
    models: [
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/mistralai/mistral-small-3.1-24b-instruct",
      "@cf/ibm-granite/granite-4.0-h-micro",
      "@cf/meta/llama-3.2-3b-instruct",
    ],
    maxOutputTokens: 700,
    cache: "disabled",
    collectGatewayLog: false,
  },
};

const RETIRED_OR_UNAVAILABLE = /\b5028\b|deprecated|no longer available|model(?: is)? unavailable|unsupported model|model not found/i;
const QUOTA_OR_RATE_LIMIT = /\b429\b|rate[ -]?limit|quota|spend[ -]?limit|budget|insufficient credits|usage limit/i;

function sanitizeLabel(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized || fallback).slice(0, 80);
}

async function pseudonym(scope: string, value: string): Promise<string> {
  if (!value) return `${scope}:none`;
  const bytes = new TextEncoder().encode(`${scope}\u0000${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${scope}:${hex}`;
}

/**
 * AI Gateway currently persists at most five custom metadata entries. Keep the allocation
 * stable so apps cannot silently consume the budget with ad-hoc keys.
 *
 * Tenant and user are pseudonymized before they leave Forge. Raw identifiers, prompts,
 * document contents and secrets never belong in Gateway metadata.
 */
export async function buildForgeAiGatewayMetadata(
  request: Pick<ForgeAiRequest, "tenantId" | "userId" | "app" | "purpose" | "requestClass">,
): Promise<Record<string, string>> {
  return {
    tenant: await pseudonym("t", request.tenantId),
    actor: await pseudonym("u", request.userId ?? ""),
    app: sanitizeLabel(request.app, "unknown-app"),
    purpose: request.purpose,
    class: request.requestClass,
  };
}

function boundedInput(input: JsonObject, maxOutputTokens: number): JsonObject {
  const raw = input.max_tokens;
  if (raw === undefined) return { ...input, max_tokens: maxOutputTokens };
  const requested = Number(raw);
  if (!Number.isFinite(requested) || requested <= 0) return { ...input, max_tokens: maxOutputTokens };
  return { ...input, max_tokens: Math.min(Math.floor(requested), maxOutputTokens) };
}

function gatewayOptions(
  policy: PurposePolicy,
  request: ForgeAiRequest,
  runtime: ForgeAiRuntimePolicy,
  metadata: Record<string, string>,
): { gateway: ForgeAiGatewayOptions } | undefined {
  const id = runtime.gatewayId?.trim();
  if (!id) return undefined;

  const sensitive = request.sensitivity !== "public";
  const canCache = policy.cache === "safe-public-only" && !sensitive;
  return {
    gateway: {
      id,
      skipCache: !canCache,
      collectLog: sensitive ? false : policy.collectGatewayLog,
      metadata,
    },
  };
}

/**
 * One provider-neutral execution seam for Forge-hosted AI.
 *
 * Important failure semantics:
 * - model retirement/unavailability may follow the declared fallback graph;
 * - quota/rate/spend failures never fan out to another model, avoiding surprise cost bursts;
 * - arbitrary provider failures are surfaced instead of being hidden by fallback;
 * - this service returns data only and has no business mutation primitive.
 */
export async function runForgeAi(
  binding: ForgeAiBinding,
  request: ForgeAiRequest,
  runtime: ForgeAiRuntimePolicy = {},
): Promise<ForgeAiExecution> {
  if (!request.tenantId.trim() || !request.app.trim()) {
    throw new ForgeAiPolicyError("AI request is missing trusted tenant/app context.", "invalid_context", false);
  }

  const policy = PURPOSE_POLICIES[request.purpose];
  const input = boundedInput(request.input, policy.maxOutputTokens);
  const metadata = await buildForgeAiGatewayMetadata(request);
  const options = gatewayOptions(policy, request, runtime, metadata);

  let lastUnavailable: unknown = null;
  for (const model of policy.models) {
    try {
      const result = options
        ? await binding.run(model, input, options)
        : await binding.run(model, input);
      const gatewayLogId = typeof binding.aiGatewayLogId === "string" && binding.aiGatewayLogId
        ? binding.aiGatewayLogId
        : undefined;
      return {
        result,
        model,
        ...(gatewayLogId ? { gatewayLogId } : {}),
        usedGateway: Boolean(options),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (QUOTA_OR_RATE_LIMIT.test(detail)) {
        throw new ForgeAiPolicyError(`AI quota/rate policy refused the request: ${detail}`, "quota_or_rate_limited", true);
      }
      if (!RETIRED_OR_UNAVAILABLE.test(detail)) throw error;
      lastUnavailable = error;
    }
  }

  const detail = lastUnavailable instanceof Error ? lastUnavailable.message : String(lastUnavailable ?? "");
  throw new ForgeAiPolicyError(
    `No permitted model is currently available (tried ${policy.models.length}). Last error: ${detail}`,
    "model_unavailable",
    true,
  );
}

export const FORGE_AI_POLICY = Object.freeze({
  version: "cf05-v1",
  purposes: Object.freeze({
    receipt_ocr: Object.freeze({ ...PURPOSE_POLICIES.receipt_ocr, models: Object.freeze([...PURPOSE_POLICIES.receipt_ocr.models]) }),
    context_assistant: Object.freeze({ ...PURPOSE_POLICIES.context_assistant, models: Object.freeze([...PURPOSE_POLICIES.context_assistant.models]) }),
  }),
});
