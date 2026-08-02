import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { MigrationDuplicatePolicy, MigrationSourceKind } from "./index.js";

export type MigrationTargetPhase = "master" | "opening" | "transaction";

export interface MigrationSourceDefinition {
  id: string;
  kind: MigrationSourceKind;
  adapter: string;
  options?: JsonObject;
}

export interface MigrationTargetDefinition {
  id: string;
  source_id: string;
  target_doctype: string;
  phase: MigrationTargetPhase;
  depends_on: string[];
  mapping: Record<string, string | null>;
  duplicate_policy: MigrationDuplicatePolicy;
  key_field?: string;
  reconciliation_metrics: string[];
}

export interface MigrationManifest {
  schema_version: 1;
  id: string;
  sources: MigrationSourceDefinition[];
  targets: MigrationTargetDefinition[];
}

const SOURCE_KINDS = new Set<MigrationSourceKind>(["csv", "excel", "api", "sql", "erpnext", "misa", "odoo", "fast", "bravo", "legacy"]);
const DUPLICATE_POLICIES = new Set<MigrationDuplicatePolicy>(["error", "skip", "update"]);
const PHASE_RANK: Readonly<Record<MigrationTargetPhase, number>> = { master: 0, opening: 1, transaction: 2 };
const SECRETISH = /(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|private[_-]?key)/i;

/**
 * Parses a source-controlled migration manifest. Credentials are forbidden by design:
 * manifests may describe connector identity/configuration, while secrets must come from
 * deployment bindings or an operator secret store.
 */
export function parseMigrationManifest(value: unknown): MigrationManifest {
  const root = object(value, "manifest");
  if (root.schema_version !== 1) throw errors.validation("Migration manifest schema_version must be 1");
  const id = identifier(root.id, "manifest.id", 120);
  const sourceValues = array(root.sources, "manifest.sources");
  const targetValues = array(root.targets, "manifest.targets");
  if (!sourceValues.length) throw errors.validation("Migration manifest requires at least one source");
  if (!targetValues.length) throw errors.validation("Migration manifest requires at least one target");

  const sources = sourceValues.map((entry, index) => parseSource(entry, index));
  const sourceIds = uniqueIds(sources.map((source) => source.id), "migration source");
  const targets = targetValues.map((entry, index) => parseTarget(entry, index));
  const targetIds = uniqueIds(targets.map((target) => target.id), "migration target");

  for (const target of targets) {
    if (!sourceIds.has(target.source_id)) throw errors.validation(`Unknown migration source ${target.source_id} for target ${target.id}`);
    for (const dependency of target.depends_on) {
      if (!targetIds.has(dependency)) throw errors.validation(`Unknown migration dependency ${dependency} for target ${target.id}`);
      if (dependency === target.id) throw errors.validation(`Migration target cannot depend on itself: ${target.id}`);
    }
  }
  assertTargetGraph(targets);
  return { schema_version: 1, id, sources, targets };
}

/** Stable topological order, phase first then declaration order among ready peers. */
export function orderMigrationTargets(manifest: MigrationManifest): MigrationTargetDefinition[] {
  const targets = manifest.targets;
  const declaration = new Map(targets.map((target, index) => [target.id, index]));
  const pending = new Map(targets.map((target) => [target.id, target]));
  const completed = new Set<string>();
  const ordered: MigrationTargetDefinition[] = [];
  while (pending.size) {
    const ready = [...pending.values()]
      .filter((target) => target.depends_on.every((dependency) => completed.has(dependency)))
      .sort((left, right) => PHASE_RANK[left.phase] - PHASE_RANK[right.phase]
        || declaration.get(left.id)! - declaration.get(right.id)!);
    if (!ready.length) throw errors.validation("Migration target dependency graph contains a cycle");
    const next = ready[0]!;
    ordered.push(next);
    completed.add(next.id);
    pending.delete(next.id);
  }
  return ordered;
}

function parseSource(value: unknown, index: number): MigrationSourceDefinition {
  const input = object(value, `sources[${index}]`);
  const id = identifier(input.id, `sources[${index}].id`, 120);
  const kind = text(input.kind, `sources[${index}].kind`, 32) as MigrationSourceKind;
  if (!SOURCE_KINDS.has(kind)) throw errors.validation(`Unsupported migration source kind: ${kind}`);
  const adapter = identifier(input.adapter, `sources[${index}].adapter`, 120);
  const options = input.options === undefined ? undefined : object(input.options, `sources[${index}].options`);
  if (options) assertNoSecrets(options, `sources[${index}].options`);
  return { id, kind, adapter, ...(options ? { options: structuredClone(options) } : {}) };
}

function parseTarget(value: unknown, index: number): MigrationTargetDefinition {
  const input = object(value, `targets[${index}]`);
  const id = identifier(input.id, `targets[${index}].id`, 120);
  const sourceId = identifier(input.source_id, `targets[${index}].source_id`, 120);
  const targetDoctype = text(input.target_doctype, `targets[${index}].target_doctype`, 160);
  const phase = text(input.phase, `targets[${index}].phase`, 24) as MigrationTargetPhase;
  if (!(phase in PHASE_RANK)) throw errors.validation(`Unsupported migration target phase: ${phase}`);
  const duplicatePolicy = input.duplicate_policy === undefined ? "error" : text(input.duplicate_policy, `targets[${index}].duplicate_policy`, 24) as MigrationDuplicatePolicy;
  if (!DUPLICATE_POLICIES.has(duplicatePolicy)) throw errors.validation(`Unsupported duplicate policy: ${duplicatePolicy}`);
  const dependsOn = input.depends_on === undefined ? [] : array(input.depends_on, `targets[${index}].depends_on`).map((entry, dependencyIndex) => identifier(entry, `targets[${index}].depends_on[${dependencyIndex}]`, 120));
  const mapping = input.mapping === undefined ? {} : parseMapping(input.mapping, index);
  const reconciliationMetrics = input.reconciliation_metrics === undefined ? [] : array(input.reconciliation_metrics, `targets[${index}].reconciliation_metrics`).map((entry, metricIndex) => identifier(entry, `targets[${index}].reconciliation_metrics[${metricIndex}]`, 160));
  const keyField = input.key_field === undefined ? undefined : identifier(input.key_field, `targets[${index}].key_field`, 160);
  return {
    id,
    source_id: sourceId,
    target_doctype: targetDoctype,
    phase,
    depends_on: [...new Set(dependsOn)],
    mapping,
    duplicate_policy: duplicatePolicy,
    ...(keyField ? { key_field: keyField } : {}),
    reconciliation_metrics: [...new Set(reconciliationMetrics)],
  };
}

function parseMapping(value: unknown, index: number): Record<string, string | null> {
  const input = object(value, `targets[${index}].mapping`);
  const output: Record<string, string | null> = {};
  for (const [source, rawTarget] of Object.entries(input)) {
    const sourceField = text(source, `targets[${index}].mapping source`, 160);
    if (rawTarget === null) { output[sourceField] = null; continue; }
    output[sourceField] = identifier(rawTarget, `targets[${index}].mapping.${sourceField}`, 160);
  }
  return output;
}

function assertTargetGraph(targets: readonly MigrationTargetDefinition[]): void {
  const byId = new Map(targets.map((target) => [target.id, target]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw errors.validation(`Migration target dependency cycle at ${id}`);
    visiting.add(id);
    const target = byId.get(id)!;
    for (const dependencyId of target.depends_on) {
      const dependency = byId.get(dependencyId)!;
      if (PHASE_RANK[dependency.phase] > PHASE_RANK[target.phase]) {
        throw errors.validation(`Migration target ${target.id} cannot depend on later phase ${dependency.id}`);
      }
      visit(dependencyId);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const target of targets) visit(target.id);
}

function assertNoSecrets(value: JsonValue, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecrets(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (SECRETISH.test(key)) throw errors.validation(`Migration manifest must not contain secret field: ${path}.${key}`);
    if (entry !== undefined) assertNoSecrets(entry, `${path}.${key}`);
  }
}

function uniqueIds(ids: readonly string[], label: string): Set<string> {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw errors.validation(`Duplicate ${label} id: ${id}`);
    seen.add(id);
  }
  return seen;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${label} must be an object`);
  return value as JsonObject;
}

function array(value: unknown, label: string): JsonValue[] {
  if (!Array.isArray(value)) throw errors.validation(`${label} must be an array`);
  return value as JsonValue[];
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const result = value.trim();
  if (result.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return result;
}

function identifier(value: unknown, label: string, max: number): string {
  const result = text(value, label, max);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/ -]*$/.test(result)) throw errors.validation(`${label} contains unsupported characters`);
  return result;
}
