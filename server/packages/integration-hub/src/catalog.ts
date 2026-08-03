import type { ConnectorAuthKind } from "./index.js";

export type ConnectorCategory =
  | "bank"
  | "einvoice"
  | "tax"
  | "social_insurance"
  | "payment"
  | "shipping"
  | "esign"
  | "email"
  | "sms"
  | "social"
  | "marketplace"
  | "productivity"
  | "generic";

export type ConnectorCapability =
  | "outbound_webhook"
  | "inbound_webhook"
  | "poll"
  | "oauth_flow"
  | "push_events"
  | "pull_records"
  | "push_records"
  | "health_check"
  | "cursor_sync";

export interface ConnectorManifest {
  schema_version: 1;
  connector_key: string;
  version: string;
  provider: string;
  display_name: string;
  category: ConnectorCategory;
  auth_kinds: readonly ConnectorAuthKind[];
  capabilities: readonly ConnectorCapability[];
  /** Version of provider/config semantics, independent from package release version. */
  config_schema_version: number;
  event_patterns?: readonly string[];
  description?: string;
  docs_url?: string;
}

export interface ConnectorCompatibility {
  compatible: boolean;
  reason: "same_version" | "compatible_upgrade" | "connector_changed" | "major_changed" | "config_schema_downgrade";
}

const KEY_RE = /^[a-z][a-z0-9-]{1,79}$/;
const PROVIDER_RE = /^[a-z][a-z0-9_.-]{1,79}$/;
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;
const EVENT_PATTERN_RE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:\.\*)?$/;
const AUTH_KINDS = new Set<ConnectorAuthKind>(["none", "api_key", "oauth2", "service_account"]);
const CATEGORIES = new Set<ConnectorCategory>([
  "bank", "einvoice", "tax", "social_insurance", "payment", "shipping", "esign", "email", "sms",
  "social", "marketplace", "productivity", "generic",
]);
const CAPABILITIES = new Set<ConnectorCapability>([
  "outbound_webhook", "inbound_webhook", "poll", "oauth_flow", "push_events", "pull_records", "push_records",
  "health_check", "cursor_sync",
]);

export function validateConnectorManifest(manifest: ConnectorManifest): ConnectorManifest {
  if (manifest.schema_version !== 1) throw new Error("Unsupported connector manifest schema_version");
  if (!KEY_RE.test(manifest.connector_key)) throw new Error("Invalid connector_key");
  if (!VERSION_RE.test(manifest.version)) throw new Error("Invalid connector version");
  if (!PROVIDER_RE.test(manifest.provider)) throw new Error("Invalid connector provider");
  if (!manifest.display_name.trim() || manifest.display_name.length > 160) throw new Error("Invalid connector display_name");
  if (!CATEGORIES.has(manifest.category)) throw new Error("Invalid connector category");
  if (!Number.isSafeInteger(manifest.config_schema_version) || manifest.config_schema_version <= 0 || manifest.config_schema_version > 1_000_000) {
    throw new Error("Invalid config_schema_version");
  }

  assertUniqueBounded(manifest.auth_kinds, "auth_kinds", 4);
  if (manifest.auth_kinds.length === 0) throw new Error("Connector must declare at least one auth kind");
  for (const authKind of manifest.auth_kinds) if (!AUTH_KINDS.has(authKind)) throw new Error("Invalid connector auth kind");

  assertUniqueBounded(manifest.capabilities, "capabilities", 16);
  if (manifest.capabilities.length === 0) throw new Error("Connector must declare at least one capability");
  for (const capability of manifest.capabilities) if (!CAPABILITIES.has(capability)) throw new Error("Invalid connector capability");

  if (manifest.capabilities.includes("oauth_flow") && !manifest.auth_kinds.includes("oauth2")) {
    throw new Error("oauth_flow capability requires oauth2 auth kind");
  }
  if (manifest.capabilities.includes("cursor_sync")
    && !manifest.capabilities.includes("poll")
    && !manifest.capabilities.includes("pull_records")) {
    throw new Error("cursor_sync requires poll or pull_records capability");
  }

  if ((manifest.event_patterns?.length ?? 0) > 64) throw new Error("Too many connector event patterns");
  const patterns = new Set<string>();
  for (const pattern of manifest.event_patterns ?? []) {
    if (!isValidEventPattern(pattern)) throw new Error(`Invalid connector event pattern: ${pattern}`);
    if (patterns.has(pattern)) throw new Error(`Duplicate connector event pattern: ${pattern}`);
    patterns.add(pattern);
  }

  if (manifest.description !== undefined && (!manifest.description.trim() || manifest.description.length > 2_000)) {
    throw new Error("Invalid connector description");
  }
  if (manifest.docs_url !== undefined) validateDocsUrl(manifest.docs_url);
  return manifest;
}

export function compareConnectorVersions(current: ConnectorManifest, candidate: ConnectorManifest): ConnectorCompatibility {
  validateConnectorManifest(current);
  validateConnectorManifest(candidate);
  if (current.connector_key !== candidate.connector_key) return { compatible: false, reason: "connector_changed" };
  if (current.version === candidate.version && current.config_schema_version === candidate.config_schema_version) {
    return { compatible: true, reason: "same_version" };
  }
  if (majorVersion(current.version) !== majorVersion(candidate.version)) return { compatible: false, reason: "major_changed" };
  if (candidate.config_schema_version < current.config_schema_version) return { compatible: false, reason: "config_schema_downgrade" };
  return { compatible: true, reason: "compatible_upgrade" };
}

export function connectorManifestIdentity(manifest: ConnectorManifest): string {
  validateConnectorManifest(manifest);
  return `${manifest.connector_key}@${manifest.version}#config-v${manifest.config_schema_version}`;
}

export function assertConnectorSupportsAuth(manifest: ConnectorManifest, authKind: ConnectorAuthKind): void {
  validateConnectorManifest(manifest);
  if (!manifest.auth_kinds.includes(authKind)) {
    throw new Error(`Connector ${manifest.connector_key} does not support auth kind ${authKind}`);
  }
}

export function assertConnectorSupportsEvent(manifest: ConnectorManifest, eventType: string): void {
  validateConnectorManifest(manifest);
  if (!eventType || eventType.length > 160) throw new Error("Invalid event type");
  const patterns = manifest.event_patterns ?? [];
  if (patterns.length === 0) return;
  if (!patterns.some((pattern) => patternMatches(pattern, eventType))) {
    throw new Error(`Connector ${manifest.connector_key} does not support event ${eventType}`);
  }
}

function validateDocsUrl(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid connector docs_url"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Connector docs_url must be credential-free HTTPS");
  if (url.href.length > 2_048) throw new Error("Connector docs_url is too long");
}

function assertUniqueBounded(values: readonly string[], field: string, max: number): void {
  if (values.length > max) throw new Error(`Too many ${field}`);
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${field}`);
}

function majorVersion(version: string): number {
  const match = VERSION_RE.exec(version);
  if (!match) throw new Error("Invalid connector version");
  return Number(match[1]);
}

function isValidEventPattern(pattern: string): boolean {
  return pattern === "*" || (pattern.length <= 160 && EVENT_PATTERN_RE.test(pattern));
}

function patternMatches(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return eventType.startsWith(pattern.slice(0, -1));
  return pattern === eventType;
}
