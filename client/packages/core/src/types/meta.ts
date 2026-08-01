import type { Fieldtype } from "./fieldtype.js";

export interface DocField {
  fieldname: string;
  label?: string;
  fieldtype: Fieldtype;
  options?: string;
  optionLabels?: Record<string, string>;
  reqd?: 0 | 1;
  read_only?: 0 | 1;
  hidden?: 0 | 1;
  list_only?: 0 | 1;
  default?: string | null;
  depends_on?: string;
  mandatory_depends_on?: string;
  read_only_depends_on?: string;
  fetch_from?: string;
  in_list_view?: 0 | 1;
  in_standard_filter?: 0 | 1;
  permlevel?: number;
  precision?: string;
  form_width?: "full" | "half" | "third";
  valueSource?: "user" | "default" | "link" | "formula" | "system" | "workflow";
  editMode?: "editable" | "readonly" | "set_once" | "immutable_after_submit" | "hidden";
  surface?: "quick" | "expanded" | "internal";
  serverEnforced?: boolean;
  dirtyGuard?: "preserve_user_value";
  [k: string]: unknown;
}

export interface DocPerm {
  role: string;
  permlevel: number;
  read?: 0 | 1;
  write?: 0 | 1;
  create?: 0 | 1;
  delete?: 0 | 1;
  submit?: 0 | 1;
  cancel?: 0 | 1;
  amend?: 0 | 1;
  if_owner?: 0 | 1;
  [ptype: string]: unknown;
}

export interface RuntimeAssets {
  __js?: string;
  __list_js?: string;
  __calendar_js?: string;
  __tree_js?: string;
  __dashboard?: unknown;
  __kanban_column_fields?: string[];
  __workflow_docs?: unknown;
  __print_formats?: unknown;
  [k: string]: unknown;
}

export type BulkCommitStrategy = "document_update";

export interface DocTypeView {
  enabled: boolean;
  fields?: string[];
  columns?: string[];
  stageField?: string;
  startField?: string;
  endField?: string;
  editableFields?: string[];
  commitStrategy?: BulkCommitStrategy;
  allowPaste?: boolean;
  allowFillDown?: boolean;
  pageSize?: number;
  reasonRequiredOn?: string[];
  [k: string]: unknown;
}

export interface DocTypeViewPolicy {
  list: DocTypeView;
  form: DocTypeView;
  quickEntry?: DocTypeView;
  bulk?: DocTypeView;
  kanban?: DocTypeView;
  calendar?: DocTypeView;
  gantt?: DocTypeView;
  chart?: DocTypeView;
  mobile?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface DocTypeMeta extends RuntimeAssets {
  name: string;
  kind?: "transaction" | "master" | "child_table" | "single" | "tree" | "virtual" | "system";
  label?: string;
  module?: string;
  issingle?: 0 | 1;
  istable?: 0 | 1;
  is_submittable?: 0 | 1;
  is_tree?: 0 | 1;
  autoname?: string;
  title_field?: string;
  image_field?: string;
  track_changes?: 0 | 1;
  fields: DocField[];
  viewPolicy?: DocTypeViewPolicy;
  permissions: DocPerm[];
  masked_fields?: string[];
}
