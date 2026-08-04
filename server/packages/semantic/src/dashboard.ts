import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type {
  SemanticFilter,
  SemanticFilterOperator,
  SemanticModelRegistry,
  SemanticQueryRequest,
} from "./index.js";
import type { SemanticInsightRegistry } from "./insights.js";
import type { SemanticAccessController, SemanticQueryExecutor, SemanticQueryResult } from "./service.js";
import { assertSemanticFilterRuntimeInput } from "./validation.js";

export type SemanticDashboardKind = "dashboard" | "executive_cockpit";

export interface SemanticDashboardWidgetDefinition {
  id: string;
  label?: string;
  insight: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SemanticDashboardFilterBinding {
  widget: string;
  dimension: string;
}

export interface SemanticDashboardFilterDefinition {
  id: string;
  label: string;
  operators: SemanticFilterOperator[];
  bindings: SemanticDashboardFilterBinding[];
  required?: boolean;
}

export interface SemanticDashboardDefinition {
  id: string;
  label: string;
  description?: string;
  kind: SemanticDashboardKind;
  widgets: SemanticDashboardWidgetDefinition[];
  filters?: SemanticDashboardFilterDefinition[];
}

export interface SemanticDashboardFilterInput {
  filter: string;
  operator: SemanticFilterOperator;
  value?: JsonValue;
}

export interface SemanticDashboardWidgetPlan {
  widget: string;
  insight: string;
  query: SemanticQueryRequest;
}

export interface SemanticDashboardSummary {
  id: string;
  label: string;
  description?: string;
  kind: SemanticDashboardKind;
  widgets: Array<{
    id: string;
    label?: string;
    insight: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  filters: Array<{
    id: string;
    label: string;
    operators: SemanticFilterOperator[];
    required: boolean;
  }>;
}

export interface SemanticDashboardResult {
  dashboard: string;
  widgets: Array<{
    widget: string;
    insight: string;
    result: SemanticQueryResult;
  }>;
}

const STABLE_ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER_ID = /^[a-z][a-z0-9_]{0,79}$/;
const OPERATORS = new Set<SemanticFilterOperator>(["=", "!=", ">", ">=", "<", "<=", "in", "like", "is_null"]);
const KINDS = new Set<SemanticDashboardKind>(["dashboard", "executive_cockpit"]);

function requireStableId(value: string, field: string): void {
  if (typeof value !== "string" || !STABLE_ID.test(value)) throw errors.validation(`${field} is not a valid stable id`);
}

function requireMemberId(value: string, field: string): void {
  if (typeof value !== "string" || !MEMBER_ID.test(value)) throw errors.validation(`${field} is not a valid member id`);
}

function requireText(value: string, field: string, max: number): void {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
}

function requireInteger(value: number, field: string, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw errors.validation(`${field} must be an integer from ${min} to ${max}`);
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code.toUpperCase();
  return "";
}

function isPermissionError(error: unknown): boolean {
  const code = errorCode(error);
  return code.includes("PERMISSION") || code.includes("FORBIDDEN") || code === "HTTP_403";
}

function rectanglesOverlap(a: SemanticDashboardWidgetDefinition, b: SemanticDashboardWidgetDefinition): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function cloneDefinition(definition: SemanticDashboardDefinition): SemanticDashboardDefinition {
  return structuredClone(definition);
}

/**
 * Trusted dashboard composition over registered semantic insights.
 * Definitions contain semantic IDs and layout only: no SQL, physical fields, routes or tenant identifiers.
 */
export class SemanticDashboardRegistry {
  private readonly dashboards = new Map<string, SemanticDashboardDefinition>();

  constructor(private readonly insights: SemanticInsightRegistry, definitions: SemanticDashboardDefinition[]) {
    if (!Array.isArray(definitions) || definitions.length > 200) throw errors.validation("Semantic dashboard registry must contain at most 200 dashboards");
    for (const definition of definitions) {
      this.validateDefinition(definition);
      if (this.dashboards.has(definition.id)) throw errors.validation(`Duplicate semantic dashboard ${definition.id}`);
      this.dashboards.set(definition.id, cloneDefinition(definition));
    }
  }

  private validateDefinition(definition: SemanticDashboardDefinition): void {
    requireStableId(definition.id, "dashboard.id");
    requireText(definition.label, `Dashboard ${definition.id} label`, 160);
    if (definition.description !== undefined) requireText(definition.description, `Dashboard ${definition.id} description`, 500);
    if (!KINDS.has(definition.kind)) throw errors.validation(`Dashboard ${definition.id} kind is unsupported`);
    if (!Array.isArray(definition.widgets) || definition.widgets.length === 0 || definition.widgets.length > 40) {
      throw errors.validation(`Dashboard ${definition.id} must contain 1-40 widgets`);
    }

    const widgetIds = new Set<string>();
    for (const widget of definition.widgets) {
      requireMemberId(widget.id, `Dashboard ${definition.id} widget id`);
      if (widgetIds.has(widget.id)) throw errors.validation(`Dashboard ${definition.id} has duplicate widget ${widget.id}`);
      widgetIds.add(widget.id);
      if (widget.label !== undefined) requireText(widget.label, `Dashboard ${definition.id} widget ${widget.id} label`, 160);
      requireStableId(widget.insight, `Dashboard ${definition.id} widget ${widget.id} insight`);
      this.insights.get(widget.insight);
      requireInteger(widget.x, `Dashboard ${definition.id} widget ${widget.id} x`, 0, 11);
      requireInteger(widget.y, `Dashboard ${definition.id} widget ${widget.id} y`, 0, 5_000);
      requireInteger(widget.width, `Dashboard ${definition.id} widget ${widget.id} width`, 1, 12);
      requireInteger(widget.height, `Dashboard ${definition.id} widget ${widget.id} height`, 1, 100);
      if (widget.x + widget.width > 12) throw errors.validation(`Dashboard ${definition.id} widget ${widget.id} exceeds the 12-column grid`);
    }

    for (let left = 0; left < definition.widgets.length; left += 1) {
      for (let right = left + 1; right < definition.widgets.length; right += 1) {
        if (rectanglesOverlap(definition.widgets[left], definition.widgets[right])) {
          throw errors.validation(`Dashboard ${definition.id} widgets ${definition.widgets[left].id} and ${definition.widgets[right].id} overlap`);
        }
      }
    }

    if (!Array.isArray(definition.filters ?? []) || (definition.filters?.length ?? 0) > 20) {
      throw errors.validation(`Dashboard ${definition.id} filters must contain at most 20 entries`);
    }
    const filterIds = new Set<string>();
    for (const filter of definition.filters ?? []) {
      requireMemberId(filter.id, `Dashboard ${definition.id} filter id`);
      if (filterIds.has(filter.id)) throw errors.validation(`Dashboard ${definition.id} has duplicate filter ${filter.id}`);
      filterIds.add(filter.id);
      requireText(filter.label, `Dashboard ${definition.id} filter ${filter.id} label`, 160);
      if (!Array.isArray(filter.operators) || filter.operators.length === 0 || filter.operators.length > OPERATORS.size) {
        throw errors.validation(`Dashboard ${definition.id} filter ${filter.id} requires supported operators`);
      }
      const operators = new Set<SemanticFilterOperator>();
      for (const operator of filter.operators) {
        if (!OPERATORS.has(operator)) throw errors.validation(`Dashboard ${definition.id} filter ${filter.id} operator is unsupported`);
        if (operators.has(operator)) throw errors.validation(`Dashboard ${definition.id} filter ${filter.id} repeats operator ${operator}`);
        operators.add(operator);
      }
      if (filter.required !== undefined && typeof filter.required !== "boolean") throw errors.validation(`Dashboard ${definition.id} filter ${filter.id} required must be boolean`);
      if (!Array.isArray(filter.bindings) || filter.bindings.length === 0 || filter.bindings.length > definition.widgets.length) {
        throw errors.validation(`Dashboard ${definition.id} filter ${filter.id} requires 1-${definition.widgets.length} bindings`);
      }
      const boundWidgets = new Set<string>();
      for (const binding of filter.bindings) {
        requireMemberId(binding.widget, `Dashboard ${definition.id} filter ${filter.id} binding widget`);
        requireMemberId(binding.dimension, `Dashboard ${definition.id} filter ${filter.id} binding dimension`);
        if (!widgetIds.has(binding.widget)) throw errors.validation(`Dashboard ${definition.id} filter ${filter.id} targets unknown widget ${binding.widget}`);
        if (boundWidgets.has(binding.widget)) throw errors.validation(`Dashboard ${definition.id} filter ${filter.id} repeats widget ${binding.widget}`);
        boundWidgets.add(binding.widget);
        const widget = definition.widgets.find((candidate) => candidate.id === binding.widget)!;
        const insight = this.insights.get(widget.insight);
        if (!(insight.scopeDimensions ?? []).includes(binding.dimension)) {
          throw errors.validation(`Dashboard ${definition.id} filter ${filter.id} dimension ${binding.dimension} is not an allowed scope dimension on insight ${insight.id}`);
        }
      }
    }
  }

  get(id: string): SemanticDashboardDefinition {
    requireStableId(id, "dashboard id");
    const dashboard = this.dashboards.get(id);
    if (!dashboard) throw errors.validation(`Unknown semantic dashboard ${id}`);
    return cloneDefinition(dashboard);
  }

  list(): SemanticDashboardSummary[] {
    return [...this.dashboards.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((definition) => ({
        id: definition.id,
        label: definition.label,
        ...(definition.description ? { description: definition.description } : {}),
        kind: definition.kind,
        widgets: definition.widgets.map((widget) => ({ ...widget })),
        filters: (definition.filters ?? []).map((filter) => ({
          id: filter.id,
          label: filter.label,
          operators: [...filter.operators],
          required: filter.required === true,
        })),
      }));
  }

  requiredModels(id: string): string[] {
    const dashboard = this.get(id);
    return [...new Set(dashboard.widgets.map((widget) => this.insights.get(widget.insight).model))].sort();
  }

  validateFilters(id: string, inputs: SemanticDashboardFilterInput[] = []): SemanticDashboardFilterInput[] {
    const dashboard = this.get(id);
    if (!Array.isArray(inputs) || inputs.length > 20) throw errors.validation(`Dashboard ${id} runtime filters must contain at most 20 entries`);
    const definitions = new Map((dashboard.filters ?? []).map((filter) => [filter.id, filter]));
    const seen = new Set<string>();
    const normalized: SemanticDashboardFilterInput[] = [];
    for (const input of inputs) {
      requireMemberId(input.filter, `Dashboard ${id} runtime filter`);
      if (seen.has(input.filter)) throw errors.validation(`Dashboard ${id} repeats runtime filter ${input.filter}`);
      seen.add(input.filter);
      const definition = definitions.get(input.filter);
      if (!definition) throw errors.validation(`Dashboard ${id} does not expose filter ${input.filter}`);
      if (!definition.operators.includes(input.operator)) throw errors.validation(`Dashboard ${id} filter ${input.filter} does not allow operator ${input.operator}`);
      const probe: SemanticFilter = { dimension: definition.bindings[0].dimension, operator: input.operator, ...(input.value !== undefined ? { value: input.value } : {}) };
      assertSemanticFilterRuntimeInput(probe, `Dashboard ${id} filter ${input.filter}`);
      normalized.push(structuredClone(input));
    }
    for (const definition of dashboard.filters ?? []) {
      if (definition.required && !seen.has(definition.id)) throw errors.validation(`Dashboard ${id} requires filter ${definition.id}`);
    }
    return normalized;
  }

  materialize(id: string, tenantId: string, inputs: SemanticDashboardFilterInput[] = []): SemanticDashboardWidgetPlan[] {
    requireText(tenantId, "tenantId", 200);
    const dashboard = this.get(id);
    const filters = this.validateFilters(id, inputs);
    const definitions = new Map((dashboard.filters ?? []).map((filter) => [filter.id, filter]));
    return dashboard.widgets.map((widget) => {
      const scope: SemanticFilter[] = [];
      for (const input of filters) {
        const definition = definitions.get(input.filter)!;
        const binding = definition.bindings.find((candidate) => candidate.widget === widget.id);
        if (!binding) continue;
        scope.push({ dimension: binding.dimension, operator: input.operator, ...(input.value !== undefined ? { value: structuredClone(input.value) } : {}) });
      }
      return {
        widget: widget.id,
        insight: widget.insight,
        query: this.insights.query(widget.insight, tenantId, scope),
      };
    });
  }
}

/**
 * Catalog hides a whole dashboard when any widget is not authorized. This avoids revealing
 * executive-cockpit composition through labels while preserving fail-closed semantics.
 */
export class PermissionAwareSemanticDashboardCatalogService {
  constructor(
    private readonly dashboards: SemanticDashboardRegistry,
    private readonly semantic: SemanticModelRegistry,
    private readonly access: SemanticAccessController,
  ) {}

  async list(tenantId: string): Promise<SemanticDashboardSummary[]> {
    requireText(tenantId, "tenantId", 200);
    const visible: SemanticDashboardSummary[] = [];
    for (const dashboard of this.dashboards.list()) {
      try {
        for (const modelId of this.dashboards.requiredModels(dashboard.id)) {
          const model = this.semantic.get(modelId);
          await this.access.authorize({ tenantId, model: model.id, permission: model.permission });
        }
        visible.push(dashboard);
      } catch (error) {
        if (isPermissionError(error)) continue;
        throw error;
      }
    }
    return visible;
  }
}

/**
 * Executes a dashboard only after every referenced model has passed authorization. The
 * executor still rechecks permission/row scope per query; the preflight prevents partial
 * dashboard reads when a later widget would be denied.
 */
export class SemanticDashboardService {
  constructor(
    private readonly dashboards: SemanticDashboardRegistry,
    private readonly semantic: SemanticModelRegistry,
    private readonly access: SemanticAccessController,
    private readonly executor: SemanticQueryExecutor,
  ) {}

  async run(tenantId: string, dashboardId: string, filters: SemanticDashboardFilterInput[] = []): Promise<SemanticDashboardResult> {
    const plans = this.dashboards.materialize(dashboardId, tenantId, filters);
    const models = [...new Set(plans.map((plan) => plan.query.model))];
    for (const modelId of models) {
      const model = this.semantic.get(modelId);
      await this.access.authorize({ tenantId, model: model.id, permission: model.permission });
    }

    const widgets: SemanticDashboardResult["widgets"] = [];
    for (const plan of plans) {
      widgets.push({ widget: plan.widget, insight: plan.insight, result: await this.executor.run(plan.query) });
    }
    return { dashboard: dashboardId, widgets };
  }
}
