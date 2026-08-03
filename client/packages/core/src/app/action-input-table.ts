import type { AppAction, AppActionField } from "./manifest.js";

/**
 * One column in a repeatable AppAction input table.
 *
 * The shape intentionally mirrors AppActionField so the shared renderer can resolve the
 * same control registry for scalar inputs and table cells. Authoritative validation remains
 * server-side in the action method/controller.
 */
export interface AppActionInputColumn extends AppActionField {}

/**
 * First-class repeatable input transported by AppAction manifests.
 *
 * `fieldname` is posted to the action method as an array of row objects. Bounds are normalized
 * by the server App Factory/app-registry contract to 1..500 rows and at most 64 columns.
 */
export interface AppActionInputTable {
  fieldname: string;
  label: string;
  description?: string;
  columns: AppActionInputColumn[];
  min_rows: number;
  max_rows: number;
  allow_paste: boolean;
}

/** Rolling-upgrade view while the canonical manifest parser still retains legacy fields. */
export type AppActionWithInputTables = AppAction & {
  input_tables?: AppActionInputTable[];
};

declare module "./manifest.js" {
  interface AppAction {
    /**
     * Repeatable input tables supplied by the server App Factory contract. New clients prefer
     * this first-class metadata; legacy BulkTransaction Text fields remain a temporary fallback.
     */
    input_tables?: AppActionInputTable[];
  }
}

/** Read normalized first-class tables without making callers depend on the rolling bridge type. */
export function appActionInputTables(action: AppAction): readonly AppActionInputTable[] {
  return Array.isArray(action.input_tables) ? action.input_tables : [];
}
