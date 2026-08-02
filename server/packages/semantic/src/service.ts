import type { JsonValue } from "../../contracts/src/index.js";
import type {
  SemanticPermissionRequirement,
  SemanticQueryCompiler,
  SemanticQueryRequest,
  SemanticReadAccessScope,
  SemanticResultColumn,
} from "./index.js";
import { assertSemanticQueryRuntimeInput } from "./validation.js";

export interface SemanticAccessRequest {
  tenantId: string;
  model: string;
  permission: SemanticPermissionRequirement;
}

/**
 * Existing WS11 permission implementation is adapted through this boundary.
 * Authorization returns the effective read scope, not a boolean, so owner/share/User
 * Permission constraints are compiled into the semantic query instead of being forgotten.
 */
export interface SemanticAccessController {
  authorize(request: SemanticAccessRequest): Promise<SemanticReadAccessScope>;
}

export interface SemanticQueryResult {
  model: string;
  grain: string;
  columns: SemanticResultColumn[];
  result: Array<Record<string, JsonValue>>;
  row_count: number;
}

/** Common read executor contract reused by API, AI, feeds and scheduled/prepared adapters. */
export interface SemanticQueryExecutor {
  run(request: SemanticQueryRequest): Promise<SemanticQueryResult>;
}

export class D1SemanticQueryService implements SemanticQueryExecutor {
  constructor(
    private readonly db: D1Database,
    private readonly compiler: SemanticQueryCompiler,
    private readonly access: SemanticAccessController,
  ) {}

  async run(request: SemanticQueryRequest): Promise<SemanticQueryResult> {
    // HTTP/AI callers are runtime data, not TypeScript. Reject invalid values first.
    assertSemanticQueryRuntimeInput(request);

    // Fetch effective permission + row scope before compiling SQL. The compiler then injects
    // owner/share/User Permission predicates and refuses a model that cannot represent them.
    const permission = this.compiler.compile(request).permission;
    const scope = await this.access.authorize({
      tenantId: request.tenant_id,
      model: request.model,
      permission,
    });
    const compiled = this.compiler.compile(request, scope);

    const rows = await this.db.prepare(compiled.sql).bind(...compiled.params).all<Record<string, JsonValue>>();
    const result = rows.results ?? [];
    return {
      model: compiled.model,
      grain: compiled.grain,
      columns: compiled.columns,
      result,
      row_count: result.length,
    };
  }
}
