import type { JsonValue } from "../../contracts/src/index.js";
import type {
  CompiledSemanticQuery,
  SemanticPermissionRequirement,
  SemanticQueryCompiler,
  SemanticQueryRequest,
  SemanticResultColumn,
} from "./index.js";
import { assertSemanticQueryRuntimeInput } from "./validation.js";

export interface SemanticAccessRequest {
  tenantId: string;
  model: string;
  permission: SemanticPermissionRequirement;
}

/**
 * Adapter boundary for WS11/server permission enforcement.
 *
 * The semantic package deliberately does not invent a second RBAC engine. A caller must
 * provide the existing trusted permission service through this narrow interface, and the
 * query service always awaits it before preparing SQL.
 */
export interface SemanticAccessController {
  assert(request: SemanticAccessRequest): Promise<void>;
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
    // HTTP/AI callers are runtime data, not TypeScript. Reject values D1 cannot safely bind
    // before compilation, authorization side effects, or any database preparation.
    assertSemanticQueryRuntimeInput(request);
    const compiled = this.compiler.compile(request);
    await this.authorize(request, compiled);
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

  private async authorize(request: SemanticQueryRequest, compiled: CompiledSemanticQuery): Promise<void> {
    await this.access.assert({
      tenantId: request.tenant_id,
      model: compiled.model,
      permission: compiled.permission,
    });
  }
}
