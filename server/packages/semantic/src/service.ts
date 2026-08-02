import type { JsonValue } from "../../contracts/src/index.js";
import type {
  CompiledSemanticQuery,
  SemanticPermissionRequirement,
  SemanticQueryCompiler,
  SemanticQueryRequest,
  SemanticResultColumn,
} from "./index.js";

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

export class D1SemanticQueryService {
  constructor(
    private readonly db: D1Database,
    private readonly compiler: SemanticQueryCompiler,
    private readonly access: SemanticAccessController,
  ) {}

  async run(request: SemanticQueryRequest): Promise<SemanticQueryResult> {
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
