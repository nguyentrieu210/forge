import type { AppAction, AppActionField } from "./manifest.js";

export type AppActionInputTableMode = "bulk" | "child-grid-inline";
export type AppActionRowReferenceFormat = "currency" | "number" | "text";

/**
 * Read-only reference shown beside a repeatable action table. It never writes into the row.
 * The app method owns lookup semantics; the runtime only binds declared parent/row fields and
 * formats the returned value. This keeps historical/reference data separate from operator input.
 */
export interface AppActionRowReference {
  method: string;
  parent_field: string;
  row_field: string;
  response_object_field?: string;
  value_field: string;
  label: string;
  empty_text?: string;
  format?: AppActionRowReferenceFormat;
}

/**
 * Generic presentation contract for a repeatable AppAction input.
 *
 * `row_doctype` points at canonical child metadata instead of copying row rules into the
 * action. The runtime can therefore reuse depends_on, read_only_depends_on, Link filters,
 * master-data constraints and field permissions already defined for that child DocType.
 */
export interface AppActionInputTablePresentation {
  mode?: AppActionInputTableMode;
  row_doctype?: string;
  fit_viewport?: boolean;
  emphasize_editable?: boolean;
  /** Optional money precision for this table presentation (for example VND => 0). */
  money_precision?: number;
  /** Existing Print Format to use after a successful commit when save + print is chosen. */
  print_format?: string;
  /** Optional read-only lookup rendered for each distinct row key. */
  row_reference?: AppActionRowReference;
}

/** Summary controls rendered below the rows rather than among ordinary header fields. */
export interface AppActionInputTableSummary {
  /** Numeric row field summed before document-level discount/tax, normally `amount`. */
  subtotal_field: string;
  /** Scalar AppAction field holding an order-level percentage discount. */
  discount_percentage_field?: string;
  /** Scalar AppAction field holding an arbitrary VAT percentage. */
  vat_percentage_field?: string;
}

/** A repeatable AppAction input-table column, rendered through the existing field registry. */
export interface AppActionInputColumn extends AppActionField {
  /** Optional canonical Frappe-style Link filters supplied by action metadata. */
  link_filters?: string;
}

/** First-class repeatable input transported by AppAction manifests. */
export interface AppActionInputTable {
  fieldname: string;
  label: string;
  description?: string;
  columns: AppActionInputColumn[];
  min_rows: number;
  max_rows: number;
  allow_paste: boolean;
  presentation?: AppActionInputTablePresentation;
  summary?: AppActionInputTableSummary;
}

export type AppActionWithInputTables = AppAction & {
  input_tables?: AppActionInputTable[];
};

declare module "./manifest.js" {
  interface AppAction {
    /** New clients prefer this first-class contract over matching legacy BulkTransaction fields. */
    input_tables?: AppActionInputTable[];
  }
}

export function appActionInputTables(action: AppAction): readonly AppActionInputTable[] {
  return Array.isArray(action.input_tables) ? action.input_tables : [];
}