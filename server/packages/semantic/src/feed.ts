import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type {
  SemanticFilter,
  SemanticModelRegistry,
  SemanticOrder,
  SemanticQueryRequest,
  SemanticResultColumn,
} from "./index.js";
import type { SemanticQueryExecutor } from "./service.js";

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
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
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

function validateFeed(definition: SemanticSnapshotFeedDefinition, registry: SemanticModelRegistry): void {
  if (!ID.test(definition.id)) throw errors.validation("feed.id must be a stable lowercase id");
  text(definition.label, `Feed ${definition.id} label`, 160);
  if (!ID.test(definition.model)) throw errors.validation(`Feed ${definition.id} model is invalid`);
  ids(definition.dimensions, `Feed ${definition.id} dimensions`, 40);
  ids(definition.metrics, `Feed ${definition.id} metrics`, 40);
  if (definition.dimensions.length === 0 && definition.metrics.length === 0) throw errors.validation(`Feed ${definition.id} must select at least one member`);

  const model = registry.get(definition.model);
  // maxRows+1 is required to prove whether another row exists. Requiring one spare row in
  // the model budget is deliberate: without it `truncated=false` would be a guess at the cap.
  if (!Number.isSafeInteger(definition.maxRows) || definition.maxRows < 1 || definition.maxRows >= model.maxRows || definition.maxRows > 2_000) {
    throw errors.validation(`Feed ${definition.id} maxRows must be 1..min(2000, model.maxRows-1) so truncation can be proven`);
  }

  const dimensions = new Set(model.dimensions.map((item) => item.id));
  const metrics = new Set(model.metrics.map((item) => item.id));
  for (const dimension of definition.dimensions) if (!dimensions.has(dimension)) throw errors.validation(`Feed ${definition.id} uses unknown dimension ${dimension}`);
  for (const metric of definition.metrics) if (!metrics.has(metric)) throw errors.validation(`Feed ${definition.id} uses unknown metric ${metric}`);
  if ((definition.filters?.length ?? 0) > 20) throw errors.validation(`Feed ${definition.id} has too many filters`);
  for (const filter of definition.filters ?? []) if (!dimensions.has(filter.dimension)) throw errors.validation(`Feed ${definition.id} filters unknown dimension ${filter.dimension}`);

  if ((definition.order_by?.length ?? 0) > 8) throw errors.validation(`Feed ${definition.id} has too many order members`);
  const selected = new Set([...definition.dimensions, ...definition.metrics]);
  for (const order of definition.order_by ?? []) if (!selected.has(order.id)) throw errors.validation(`Feed ${definition.id} order member must be selected: ${order.id}`);
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
  constructor(
    private readonly executor: SemanticQueryExecutor,
    private readonly registry: SemanticModelRegistry,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async export(input: {
    tenantId: string;
    sourceVersion: string;
    definition: SemanticSnapshotFeedDefinition;
  }): Promise<SemanticSnapshotFeedBatch> {
    if (!input.tenantId.trim()) throw errors.validation("tenantId is required");
    text(input.sourceVersion, "sourceVersion", 200);
    validateFeed(input.definition, this.registry);
    const definition = input.definition;

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
    if (result.model !== definition.model) throw errors.validation(`Feed ${definition.id} executor returned the wrong semantic model`);
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
