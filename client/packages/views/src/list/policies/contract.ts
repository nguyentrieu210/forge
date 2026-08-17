import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import type { Doc, DocTypeMeta, ListOpts } from "@metaforge/core";
import type { ListColumn } from "../columns.js";
import type { ListState } from "../filters.js";

export interface ListPolicySearchResolution { values: string[]; }

export interface ListRuntimePolicy {
  extraFilterFields?: string[];
  centerContent?: boolean;
  preferenceScopeSuffix?: string;
  columns?: (meta: DocTypeMeta, derived: ListColumn[]) => ListColumn[];
  rows?: (rows: Doc[]) => Doc[];
  resolveSearch?: (adapter: FrappeAdapter, doctype: string, term: string) => Promise<ListPolicySearchResolution>;
  buildQuery?: (meta: DocTypeMeta, state: ListState, baseColumns: ListColumn[], searchResolution: ListPolicySearchResolution | null) => ListOpts;
  canApprove?: (row: Doc) => boolean;
  warningRow?: (row: Doc) => boolean;
  approve?: (adapter: FrappeAdapter, doctype: string, name: string) => Promise<void>;
}
