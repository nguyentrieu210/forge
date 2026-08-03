import type { JsonObject } from "../../contracts/src/index.js";

export type MatrixSourceKind = "doctype" | "projection";
export type MatrixReadPermissionAction = "read";
export type MatrixWritePermissionAction = "write" | "create" | "submit";
export type MatrixEditor = "Data" | "Int" | "Float" | "Currency" | "Percent" | "Check" | "Select" | "Link";

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
  editor?: MatrixEditor;
}

export interface MatrixRowAxisPolicy extends MatrixAxisPolicy {
  auxiliaryFields?: MatrixAuxiliaryFieldPolicy[];
}

export interface MatrixColumnAxisPolicy extends MatrixAxisPolicy {
  subtitleField?: string;
}

export interface MatrixNavigatorPolicy extends MatrixAxisPolicy {
  parentField: string;
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
}

export interface MatrixActionRef extends JsonObject {
  action: string;
  permissionDoctype: string;
  permissionAction: MatrixWritePermissionAction;
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
}

export interface MatrixColumnMemberPolicy extends JsonObject {
  create?: MatrixActionRef;
  allowHide?: boolean;
  allowShow?: boolean;
}

export interface MatrixQueryPolicy extends JsonObject {
  pageSize: number;
  searchLimit: number;
  minSearchChars: number;
}

export interface MatrixPresentationPolicy extends JsonObject {
  stickyRowAxis: boolean;
  stickyColumnAxis: boolean;
  focusMode: "inline" | "toggle";
  mobileMode: "scroll" | "step";
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
