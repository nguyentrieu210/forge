import type { JsonObject } from "../../contracts/src/index.js";

export type MatrixSourceKind = "doctype" | "projection";
export type MatrixReadPermissionAction = "read";
export type MatrixWritePermissionAction = "write" | "create" | "submit";
export type MatrixEditor = "Data" | "Int" | "Float" | "Currency" | "Percent" | "Check" | "Select" | "Link";
export type MatrixValueValidation = "positive" | "non_negative";
export type MatrixActionInputFieldtype =
  | "Data" | "Small Text" | "Text" | "Int" | "Float" | "Currency" | "Percent"
  | "Check" | "Select" | "Link" | "Date" | "Datetime" | "Time"
  | "Attach" | "Attach Image";

export interface MatrixActionInputField extends JsonObject {
  fieldname: string;
  label: string;
  fieldtype: MatrixActionInputFieldtype;
  options?: string;
  required?: boolean;
  default?: string;
  description?: string;
}

export interface MatrixActionInputTable extends JsonObject {
  fieldname: string;
  label: string;
  description?: string;
  columns: MatrixActionInputField[];
  minRows: number;
  maxRows: number;
  allowPaste: boolean;
}

export interface MatrixSourceRef extends JsonObject {
  kind: MatrixSourceKind;
  name: string;
  permissionDoctype: string;
  permissionAction: MatrixReadPermissionAction;
}

export interface MatrixAxisPolicy extends JsonObject {
  source: MatrixSourceRef;
  keyField: string;
  labelField: string;
  searchFields?: string[];
  filterFields?: string[];
}

export interface MatrixAuxiliaryFieldPolicy extends JsonObject {
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

export interface MatrixCellIdentityPolicy extends JsonObject {
  rowField: string;
  columnField: string;
  recordField?: string;
}

export interface MatrixCellEnabledPolicy extends JsonObject {
  field: string;
  when: "truthy" | "falsy";
}

export interface MatrixCellPolicy extends JsonObject {
  source: MatrixSourceRef;
  identity: MatrixCellIdentityPolicy;
  valueField: string;
  editor: MatrixEditor;
  enabled?: MatrixCellEnabledPolicy;
  versionField?: string;
  validation?: MatrixValueValidation;
  disabledColumnReadOnly?: boolean;
}

export interface MatrixActionRef extends JsonObject {
  action: string;
  permissionDoctype: string;
  permissionAction: MatrixWritePermissionAction;
  label?: string;
  description?: string;
  confirm?: string;
  fields?: MatrixActionInputField[];
  inputTables?: MatrixActionInputTable[];
}

export interface MatrixDocumentUpdateRef extends JsonObject {
  strategy: "document_update";
  permissionDoctype: string;
  permissionAction: "write";
}

export interface MatrixNamedActionWriteRef extends JsonObject {
  strategy: "action";
  action: string;
  permissionDoctype: string;
  permissionAction: MatrixWritePermissionAction;
}

export type MatrixWriteRef = MatrixDocumentUpdateRef | MatrixNamedActionWriteRef;

export interface MatrixRowMemberPolicy extends JsonObject {
  create?: MatrixActionRef;
  remove?: MatrixActionRef;
  primaryRemovable?: boolean;
}

export interface MatrixColumnMemberPolicy extends JsonObject {
  create?: MatrixActionRef;
  allowHide?: boolean;
  allowHideAll?: boolean;
  allowShow?: boolean;
  allowShowAll?: boolean;
}

export interface MatrixQueryPolicy extends JsonObject {
  pageSize: number;
  searchLimit: number;
  minSearchChars: number;
  searchMode?: "contains" | "prefix" | "token_contains";
  accentInsensitive?: boolean;
}

export interface MatrixPresentationPolicy extends JsonObject {
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

export interface MatrixViewDisabledPolicy extends JsonObject {
  enabled: false;
}

export interface MatrixViewEnabledPolicy extends JsonObject {
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
