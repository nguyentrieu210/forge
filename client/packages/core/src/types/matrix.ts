export type MatrixSourceKind = "doctype" | "projection";
export type MatrixReadPermissionAction = "read";
export type MatrixWritePermissionAction = "write" | "create" | "submit";
export type MatrixEditor = "Data" | "Int" | "Float" | "Currency" | "Percent" | "Check" | "Select" | "Link";
export type MatrixValueValidation = "positive" | "non_negative";

/** Same scalar control vocabulary as AppAction inputs. */
export type MatrixActionInputFieldtype =
  | "Data" | "Small Text" | "Text" | "Int" | "Float" | "Currency" | "Percent"
  | "Check" | "Select" | "Link" | "Date" | "Datetime" | "Time"
  | "Attach" | "Attach Image";

export interface MatrixActionInputField {
  fieldname: string;
  label: string;
  fieldtype: MatrixActionInputFieldtype;
  options?: string;
  required?: boolean;
  default?: string;
  description?: string;
}

/** Repeatable member-action input, semantically aligned with AppAction input_tables. */
export interface MatrixActionInputTable {
  fieldname: string;
  label: string;
  description?: string;
  columns: MatrixActionInputField[];
  minRows: number;
  maxRows: number;
  allowPaste: boolean;
}

export interface MatrixSourceRef {
  kind: MatrixSourceKind;
  name: string;
  permissionDoctype: string;
  permissionAction: MatrixReadPermissionAction;
}

export interface MatrixAxisPolicy {
  source: MatrixSourceRef;
  keyField: string;
  labelField: string;
  searchFields?: string[];
  filterFields?: string[];
}

export interface MatrixAuxiliaryFieldPolicy {
  field: string;
  label?: string;
  editor?: MatrixEditor;
  readOnlyWhenField?: string;
  validation?: MatrixValueValidation;
}

export interface MatrixRowAxisPolicy extends MatrixAxisPolicy {
  primaryField?: string;
  auxiliaryFields?: MatrixAuxiliaryFieldPolicy[];
}

export interface MatrixColumnAxisPolicy extends MatrixAxisPolicy {
  subtitleField?: string;
  disabledField?: string;
  selectedFirst?: boolean;
}

export interface MatrixNavigatorPolicy extends MatrixAxisPolicy {
  parentField: string;
  secondaryLabelField?: string;
}

export interface MatrixCellIdentityPolicy {
  rowField: string;
  columnField: string;
  recordField?: string;
}

export interface MatrixCellEnabledPolicy {
  field: string;
  when: "truthy" | "falsy";
}

export interface MatrixCellPolicy {
  source: MatrixSourceRef;
  identity: MatrixCellIdentityPolicy;
  valueField: string;
  editor: MatrixEditor;
  enabled?: MatrixCellEnabledPolicy;
  versionField?: string;
  validation?: MatrixValueValidation;
  disabledColumnReadOnly?: boolean;
}

/**
 * Named domain action offered by a Matrix capability.
 *
 * Input fields/tables intentionally reuse the AppAction control vocabulary so the runtime
 * can render them through the same control registry instead of growing domain dialogs.
 */
export interface MatrixActionRef {
  action: string;
  permissionDoctype: string;
  permissionAction: MatrixWritePermissionAction;
  label?: string;
  description?: string;
  confirm?: string;
  fields?: MatrixActionInputField[];
  inputTables?: MatrixActionInputTable[];
}

export type MatrixWriteRef =
  | {
      strategy: "document_update";
      permissionDoctype: string;
      permissionAction: "write";
    }
  | {
      strategy: "action";
      action: string;
      permissionDoctype: string;
      permissionAction: MatrixWritePermissionAction;
    };

export interface MatrixRowMemberPolicy {
  create?: MatrixActionRef;
  remove?: MatrixActionRef;
  primaryRemovable?: boolean;
}

export interface MatrixColumnMemberPolicy {
  create?: MatrixActionRef;
  allowHide?: boolean;
  allowHideAll?: boolean;
  allowShow?: boolean;
  allowShowAll?: boolean;
}

export interface MatrixQueryPolicy {
  pageSize: number;
  searchLimit: number;
  minSearchChars: number;
  searchMode?: "contains" | "prefix" | "token_contains";
  accentInsensitive?: boolean;
}

export interface MatrixPresentationPolicy {
  stickyRowAxis: boolean;
  stickyColumnAxis: boolean;
  focusMode: "inline" | "toggle";
  mobileMode: "scroll" | "step";
  navigatorResizable?: boolean;
  navigatorCollapsible?: boolean;
  showDirtyIndicator?: boolean;
  unsavedChangeGuard?: boolean;
}

export type MatrixDirtyPolicy = "warn" | "block";
export type MatrixConflictPolicy = "reject" | "prompt_reload";

export interface MatrixViewDisabledPolicy {
  enabled: false;
}

export interface MatrixViewEnabledPolicy {
  enabled: true;
  navigator?: MatrixNavigatorPolicy;
  rowAxis: MatrixRowAxisPolicy;
  columnAxis: MatrixColumnAxisPolicy;
  cell: MatrixCellPolicy;
  write?: MatrixWriteRef;
  rowMembers?: MatrixRowMemberPolicy;
  columnMembers?: MatrixColumnMemberPolicy;
  query: MatrixQueryPolicy;
  presentation: MatrixPresentationPolicy;
  dirtyPolicy: MatrixDirtyPolicy;
  conflictPolicy: MatrixConflictPolicy;
}

export type MatrixViewPolicy = MatrixViewDisabledPolicy | MatrixViewEnabledPolicy;
