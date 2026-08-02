import { errors } from "../../core/src/index.js";

export interface NetworkAccessDecision {
  configured: boolean;
  allowed: boolean;
  matched_rule: string | null;
}

/**
 * Parses the canonical Security Policy `ip_allowlist_json` field.
 *
 * Empty/null means no network restriction. Once configured, malformed JSON or an invalid
 * IP/CIDR is a policy error and fails closed rather than silently widening access.
 */
export function parseIpAllowlist(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value) as unknown; }
    catch { throw errors.validation("Security Policy IP allowlist is not valid JSON"); }
  }
  if (!Array.isArray(parsed)) throw errors.validation("Security Policy IP allowlist must be an array");
  if (parsed.length > 256) throw errors.validation("Security Policy IP allowlist is too large");
  const rules = parsed.map((entry) => {
    if (typeof entry !== "string" || !entry.trim() || entry.length > 128) {
      throw errors.validation("Security Policy IP allowlist contains an invalid entry");
    }
    return normalizeCidr(entry.trim());
  });
  return [...new Set(rules)];
}

/** Pure evaluator. Empty allowlist intentionally means unrestricted. */
export function evaluateIpAllowlist(clientAddress: string, rules: string[]): NetworkAccessDecision {
  if (rules.length === 0) return { configured: false, allowed: true, matched_rule: null };
  const address = parseIp(clientAddress);
  if (!address) return { configured: true, allowed: false, matched_rule: null };
  for (const rule of rules) {
    const parsed = parseCidr(rule);
    if (!parsed || parsed.version !== address.version) continue;
    if (matchesPrefix(address.bytes, parsed.network, parsed.prefix)) {
      return { configured: true, allowed: true, matched_rule: rule };
    }
  }
  return { configured: true, allowed: false, matched_rule: null };
}

export function assertIpAllowed(clientAddress: string, allowlistJson: unknown): NetworkAccessDecision {
  const rules = parseIpAllowlist(allowlistJson);
  const decision = evaluateIpAllowlist(clientAddress, rules);
  if (!decision.allowed) throw errors.permission("Network access policy denied this request");
  return decision;
}

function normalizeCidr(value: string): string {
  const parsed = parseCidr(value);
  if (!parsed) throw errors.validation(`Security Policy IP allowlist entry is invalid: ${value}`);
  return `${formatIp(parsed.network, parsed.version)}/${parsed.prefix}`;
}

interface ParsedIp {
  version: 4 | 6;
  bytes: Uint8Array;
}

interface ParsedCidr {
  version: 4 | 6;
  network: Uint8Array;
  prefix: number;
}

function parseCidr(value: string): ParsedCidr | null {
  const slash = value.indexOf("/");
  const rawIp = slash >= 0 ? value.slice(0, slash) : value;
  const address = parseIp(rawIp);
  if (!address) return null;
  const max = address.version === 4 ? 32 : 128;
  const prefix = slash >= 0 ? Number(value.slice(slash + 1)) : max;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) return null;
  const network = maskPrefix(address.bytes, prefix);
  return { version: address.version, network, prefix };
}

function parseIp(value: string): ParsedIp | null {
  const text = value.trim();
  const v4 = parseIpv4(text);
  if (v4) return { version: 4, bytes: v4 };
  const v6 = parseIpv6(text);
  return v6 ? { version: 6, bytes: v6 } : null;
}

function parseIpv4(value: string): Uint8Array | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const parsed = Number(part);
    if (parsed < 0 || parsed > 255) return null;
    bytes.push(parsed);
  }
  return Uint8Array.from(bytes);
}

function parseIpv6(value: string): Uint8Array | null {
  if (!value || value.includes("%")) return null;
  let working = value.toLowerCase();
  // IPv4-mapped tail, e.g. ::ffff:192.0.2.1.
  const lastColon = working.lastIndexOf(":");
  if (working.includes(".") && lastColon >= 0) {
    const tail = parseIpv4(working.slice(lastColon + 1));
    if (!tail) return null;
    const hi = ((tail[0]! << 8) | tail[1]!).toString(16);
    const lo = ((tail[2]! << 8) | tail[3]!).toString(16);
    working = `${working.slice(0, lastColon)}:${hi}:${lo}`;
  }

  if ((working.match(/::/g) ?? []).length > 1) return null;
  const compressed = working.includes("::");
  const [leftRaw, rightRaw = ""] = compressed ? working.split("::") : [working, ""];
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if (![...left, ...right].every((part) => /^[0-9a-f]{1,4}$/.test(part))) return null;
  if (!compressed && left.length !== 8) return null;
  if (compressed && left.length + right.length >= 8) return null;
  const zeros = compressed ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array.from({ length: zeros }, () => "0"), ...right];
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  groups.forEach((part, index) => {
    const value = Number.parseInt(part, 16);
    bytes[index * 2] = value >>> 8;
    bytes[index * 2 + 1] = value & 0xff;
  });
  return bytes;
}

function maskPrefix(bytes: Uint8Array, prefix: number): Uint8Array {
  const output = new Uint8Array(bytes);
  let remaining = prefix;
  for (let index = 0; index < output.length; index += 1) {
    if (remaining >= 8) { remaining -= 8; continue; }
    if (remaining <= 0) output[index] = 0;
    else {
      output[index] &= (0xff << (8 - remaining)) & 0xff;
      remaining = 0;
    }
  }
  return output;
}

function matchesPrefix(address: Uint8Array, network: Uint8Array, prefix: number): boolean {
  if (address.length !== network.length) return false;
  const masked = maskPrefix(address, prefix);
  let difference = 0;
  for (let index = 0; index < masked.length; index += 1) difference |= masked[index]! ^ network[index]!;
  return difference === 0;
}

function formatIp(bytes: Uint8Array, version: 4 | 6): string {
  if (version === 4) return [...bytes].join(".");
  const groups: string[] = [];
  for (let index = 0; index < 16; index += 2) {
    groups.push(((bytes[index]! << 8) | bytes[index + 1]!).toString(16));
  }
  // Stable canonical-ish rendering: compress the longest zero run, first run wins.
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < groups.length;) {
    if (groups[start] !== "0") { start += 1; continue; }
    let end = start;
    while (end < groups.length && groups[end] === "0") end += 1;
    if (end - start > bestLength && end - start >= 2) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end;
  }
  if (bestStart < 0) return groups.join(":");
  const left = groups.slice(0, bestStart).join(":");
  const right = groups.slice(bestStart + bestLength).join(":");
  return `${left}::${right}`;
}
