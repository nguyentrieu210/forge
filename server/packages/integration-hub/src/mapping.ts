import type { DomainEvent, JsonObject } from "../../contracts/src/index.js";
import { mapIntegrationPayload, stableJsonStringify, type IntegrationMappingRule } from "./index.js";

export interface IntegrationMappingSpec {
  schema_version: 1;
  mapping_id: string;
  version: number;
  event_pattern: string;
  rules: readonly IntegrationMappingRule[];
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;
const EVENT_PATTERN_RE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:\.\*)?$/;

export function validateMappingSpec(spec: IntegrationMappingSpec): IntegrationMappingSpec {
  if (spec.schema_version !== 1) throw new Error("Unsupported mapping schema_version");
  if (!ID_RE.test(spec.mapping_id)) throw new Error("Invalid mapping_id");
  if (!Number.isSafeInteger(spec.version) || spec.version <= 0 || spec.version > 1_000_000) throw new Error("Invalid mapping version");
  if (!(spec.event_pattern === "*" || (spec.event_pattern.length <= 160 && EVENT_PATTERN_RE.test(spec.event_pattern)))) {
    throw new Error("Invalid mapping event_pattern");
  }
  if (!Array.isArray(spec.rules) || spec.rules.length === 0 || spec.rules.length > 128) throw new Error("Invalid mapping rules");
  // Reuse authoritative mapping validation without needing a real event value to resolve.
  const synthetic: DomainEvent = {
    event_id: "mapping-validation",
    event_type: "mapping.validation",
    tenant_id: "mapping-validation",
    aggregate: { doctype: "Mapping", name: "Validation" },
    aggregate_version: 1,
    actor: "system",
    command_id: "mapping-validation",
    occurred_at: "1970-01-01T00:00:00.000Z",
    schema_version: 1,
    payload: {},
  };
  for (const rule of spec.rules) {
    // Required paths are intentionally made optional for shape validation; missing data
    // is a runtime property of the actual event, not a defect in the spec definition.
    mapIntegrationPayload(synthetic, [{ ...rule, required: false }]);
  }
  return spec;
}

export function applyMappingSpec(event: DomainEvent, spec: IntegrationMappingSpec): JsonObject {
  validateMappingSpec(spec);
  if (!matches(spec.event_pattern, event.event_type)) throw new Error("Mapping spec does not match event type");
  return mapIntegrationPayload(event, spec.rules);
}

export async function mappingFingerprint(spec: IntegrationMappingSpec): Promise<string> {
  validateMappingSpec(spec);
  const canonical: JsonObject = {
    schema_version: spec.schema_version,
    mapping_id: spec.mapping_id,
    version: spec.version,
    event_pattern: spec.event_pattern,
    rules: spec.rules.map((rule) => ({
      source: rule.source,
      target: rule.target,
      required: rule.required === true,
    })),
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJsonStringify(canonical)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function assertMappingUpgrade(current: IntegrationMappingSpec, candidate: IntegrationMappingSpec): void {
  validateMappingSpec(current);
  validateMappingSpec(candidate);
  if (candidate.mapping_id !== current.mapping_id) throw new Error("Mapping upgrade id mismatch");
  if (candidate.version <= current.version) throw new Error("Mapping upgrade version must increase");
}

function matches(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return eventType.startsWith(pattern.slice(0, -1));
  return pattern === eventType;
}
