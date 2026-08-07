import type { DocField, DocTypeMeta } from "../types/meta.js";

/**
 * MetaForm 4.0 presentation contract.
 *
 * This contract is deliberately bounded: metadata declares layout, visual semantics and bindings
 * to named server projections. It never carries arbitrary executable business code. Money, stock,
 * tax, payroll and compound mutations remain authoritative on the server.
 */
export type OperationalFormPresentation = "full" | "workspace";
export type OperationalDensity = "comfortable" | "compact";
export type OperationalTone = "neutral" | "brand";
export type SmartGridStripe = "none" | "alternating";
export type SmartGridStripeScope = "record";
export type SmartGridCellRole =
  | "operator_input"
  | "optional_input"
  | "auto"
  | "formula"
  | "readonly"
  | "warning"
  | "result"
  | "money";

export interface OperationalHeaderPolicy {
  tone?: OperationalTone;
  /** Existing canonical fields promoted into the workspace context header. */
  keyFields?: string[];
  statusField?: string;
}

export interface OperationalSummaryItem {
  field: string;
  label?: string;
  emphasis?: "normal" | "strong" | "grand";
}

export interface OperationalSummaryPolicy {
  enabled?: boolean;
  position?: "bottom-right" | "footer";
  items: OperationalSummaryItem[];
}

export interface OperationalFormPolicy {
  presentation?: OperationalFormPresentation;
  density?: OperationalDensity;
  fullWidth?: boolean;
  header?: OperationalHeaderPolicy;
  summary?: OperationalSummaryPolicy;
}

export interface SmartGridColumnGroup {
  key: string;
  label: string;
  fields: string[];
  tone?: "neutral" | "brand" | "input" | "commercial" | "result";
}

/**
 * One document row may occupy more than one visual table row. The secondary row is presentation
 * only: it reads/writes the same child document object and therefore never duplicates business
 * records merely to achieve an Excel-like layout.
 */
export interface SmartGridSecondaryRow {
  when?: string;
  label?: string;
  labelColumn?: string;
  fields: string[];
}

/**
 * Named server projection. `inputs` are explicit bindings, never expressions:
 *   row.item_code / parent.customer / parent.company
 * `constants` are literal JSON values.
 * `outputs` map response paths to existing child fields.
 */
export interface SmartGridProjectionPolicy {
  key?: string;
  method: string;
  watch: string[];
  inputs: Record<string, string>;
  constants?: Record<string, unknown>;
  outputs: Record<string, string>;
  debounceMs?: number;
}

export interface SmartGridPolicy {
  density?: OperationalDensity;
  headerTone?: OperationalTone;
  autoBorders?: boolean;
  stripe?: SmartGridStripe;
  stripeScope?: SmartGridStripeScope;
  frozenColumns?: number;
  columnGroups?: SmartGridColumnGroup[];
  secondaryRow?: SmartGridSecondaryRow;
  projections?: SmartGridProjectionPolicy[];
}

export interface OperationalViewPolicy {
  form?: OperationalFormPolicy;
  grid?: SmartGridPolicy;
}

const CELL_ROLES = new Set<SmartGridCellRole>([
  "operator_input", "optional_input", "auto", "formula", "readonly", "warning", "result", "money",
]);

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Server validation is authoritative; this client guard only prevents malformed legacy metadata from crashing a renderer. */
export function operationalViewPolicy(meta: DocTypeMeta): OperationalViewPolicy | undefined {
  const raw = object(meta.viewPolicy?.operational);
  if (!raw) return undefined;
  const form = object(raw.form) as OperationalFormPolicy | undefined;
  const grid = object(raw.grid) as SmartGridPolicy | undefined;
  return form || grid ? { ...(form ? { form } : {}), ...(grid ? { grid } : {}) } : undefined;
}

export function smartGridCellRole(field: DocField): SmartGridCellRole | undefined {
  const value = field.cellRole;
  return typeof value === "string" && CELL_ROLES.has(value as SmartGridCellRole)
    ? value as SmartGridCellRole
    : undefined;
}

/** Read a dotted response path without executing metadata as code. */
export function readProjectionOutput(source: unknown, path: string): unknown {
  if (!path) return undefined;
  let current: unknown = source;
  for (const part of path.split(".")) {
    if (!part || !current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Resolve an explicit row/parent binding. Arbitrary expressions are intentionally unsupported. */
export function readProjectionBinding(binding: string, row: Record<string, unknown>, parent?: Record<string, unknown>): unknown {
  const [scope, ...parts] = binding.split(".");
  if ((scope !== "row" && scope !== "parent") || !parts.length) return undefined;
  let current: unknown = scope === "row" ? row : (parent ?? {});
  for (const part of parts) {
    if (!part || !current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
