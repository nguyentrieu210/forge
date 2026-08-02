import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { SemanticFilter, SemanticOrder, SemanticQueryRequest, SemanticResultColumn } from "./index.js";
import type { SemanticQueryExecutor } from "./ai-query.js";

export interface SemanticSnapshotFeedDefinition {
  id: string;
  label: string;
  model: string;
  dimensions: string[];
  metrics: string[];
  filters?: SemanticFilter[];
  order_by?: SemanticOrder[];
  /** One bounded snapshot batch. Larger/continuous delivery belongs to WS10 connector/CDC. */
  maxRows: number;
}

export interface SemanticSnapshotFeedBatch {
  schemaVersion: 1;
  feed: string;
  model: string;
  tenantId: string;
  sourceVersion: string;
  generatedAt: string;
  columns: SemanticResultColumn[];
  rows: Array<Record<string, JsonValue>>;
  rowCount: number;
  /** True means another delivery mechanism is required; data was never silently cut off. */
  truncated: boolean;
}

const ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER = /^[a-z][a-z0-9_]{0,79}$/;

function text(value: string, field: string, max: number): void {
  if (!value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
}

function ids(values: string[], field: string, max: number): void {
  if (!Array.isArray(values) || values.length > max) throw errors.validation(`${field} has too many entries`);
  const seen = new Set<string>();
  for (const value of values) {
    if (!MEMBER.test(value)) throw errors.validation(`${field} contains invalid member ${value}`);
    if (seen.has(value)) throw errors.validation(`${field} contains duplicate member ${value}`);
    seen.add(value);
  }
}

function validateFeed(definition: SemanticSnapshotFeedDefinition): void {
  if (!ID.test(definition.id)) throw errors.validation("feed.id must be a stable lowercase id");
  text(definition.label, `Feed ${definition.id} label`, 160);
  if (!ID.test(definition.model)) throw errors.validation(`Feed ${definition.id} model is invalid`);
  ids(definition.dimensions, `Feed ${definition.id} dimensions`, 40);
  ids(definition.metrics, `Feed ${definition.id} metrics`, 40);
  if (definition.dimensions.length === 0 && definition.metrics.length === 0) throw errors.validation(`Feed ${definition.id} must select at least one member`);
  if (!Number.isSafeInteger(definition.maxRows) || definition.maxRows < 1 || definition.maxRows > 2_000) {
    throw errors.validation(`Feed ${definition.id} maxRows must be an integer from 1 to 2000`);
  }
  if ((definition.filters?.length ?? 0) > 20) throw errors.validation(`Feed ${definition.id} has too many filters`);
  if ((definition.order_by?.length ?? 0) > 8) throw errors.validation(`Feed ${definition.id} has too many order members`);
}

function assertExactResults(columns: SemanticResultColumn[], rows: Array<Record<string, JsonValue>>): void {
  const exact = columns.filter((column) => column.role === "metric" && column.exact === true);
  for (const column of exact) {
    for (const [index, row] of rows.entries()) {
      const value = row[column.id];
      if (value === null || value === undefined) continue;
      if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        throw errors.validation(`Exact feed metric ${column.id} row ${index} must be a safe integer`);
      }
    }
  }
}

/**
 * Bounded semantic snapshot for BI/export adapters. The executor remains authoritative for
 * tenant + permission. This service never reads raw tables and never claims completeness if
 * the bounded batch fills up.
 */
export class SemanticSnapshotFeedService {
  constructor(private readonly executor: SemanticQueryExecutor, private readonly now: () => string = () => new Date().toISOString()) {}

  async export(input: {
    tenantId: string;
    sourceVersion: string;
    definition: SemanticSnapshotFeedDefinition;
  }): Promise<SemanticSnapshotFeedBatch> {
    if (!input.tenantId.trim()) throw errors.validation("tenantId is required");
    text(input.sourceVersion, "sourceVersion", 200);
    validateFeed(input.definition);
    const definition = input.definition;

    // Request one extra row only to prove truncation; it is never returned to the caller.
    // The semantic model's own maxRows remains authoritative and may refuse this request,
    // in which case the feed definition must be tightened rather than silently weakened.
    const request: SemanticQueryRequest = {
      model: definition.model,
      tenant_id: input.tenantId,
      dimensions: [...definition.dimensions],
      metrics: [...definition.metrics],
      filters: [...(definition.filters ?? [])],
      order_by: [...(definition.order_by ?? [])],
      limit: definition.maxRows + 1,
    };
    const result = await this.executor.run(request);
    const truncated = result.result.length > definition.maxRows;
    const rows = truncated ? result.result.slice(0, definition.maxRows) : result.result;
    assertExactResults(result.columns, rows);

    return {
      schemaVersion: 1,
      feed: definition.id,
      model: result.model,
      tenantId: input.tenantId,
      sourceVersion: input.sourceVersion,
      generatedAt: this.now(),
      columns: result.columns,
      rows,
      rowCount: rows.length,
      truncated,
    };
  }
}
