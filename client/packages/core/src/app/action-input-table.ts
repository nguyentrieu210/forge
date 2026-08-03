import type { AppAction, AppActionField } from "./manifest.js";

/** A repeatable AppAction input-table column, rendered through the existing field registry. */
export interface AppActionInputColumn extends AppActionField {}

/** First-class repeatable input transported by AppAction manifests. */
export interface AppActionInputTable {
  fieldname: string;
  label: string;
  description?: string;
  columns: AppActionInputColumn[];
  min_rows: number;
  max_rows: number;
  allow_paste: boolean;
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
