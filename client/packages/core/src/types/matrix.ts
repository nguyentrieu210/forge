export type MatrixSourceKind = "doctype" | "projection";
export type MatrixReadPermissionAction = "read";
export type MatrixWritePermissionAction = "write" | "create" | "submit";
export type MatrixEditor = "Data" | "Int" | "Float" | "Currency" | "Percent" | "Check" | "Select" | "Link";

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
  /** Omitted means display-only. Supplying an editor declares an editable auxiliary field. */
  editor?: MatrixEditor;
}

export interface MatrixRowAxisPolicy extends MatrixAxisPolicy {
  auxiliaryFields?: MatrixAuxiliaryFieldPolicy[];
}

export interface MatrixColumnAxisPolicy extends MatrixAxisPolicy {
  subtitleField?: string;
}

/** Optional tree navigator. Complex multi-source navigation belongs behind a named projection. */
export interface MatrixNavigatorPolicy extends MatrixAxisPolicy {
  parentField: string;
}

export interface MatrixCellIdentityPolicy {
  rowField: string;
  columnField: string;
  /** Stable record identity when the sparse cell source exposes one. */
  recordField?: string;
}

export interface MatrixCellEnabledPolicy {
  field: string;
  /** `falsy` covers common `disabled=0` storage without inventing domain-specific flags. */
  when: "truthy" | "falsy";
}

export interface MatrixCellPolicy {
  source: MatrixSourceRef;
  identity: MatrixCellIdentityPolicy;
  valueField: string;
  editor: MatrixEditor;
  enabled?: MatrixCellEnabledPolicy;
}

export interface MatrixActionRef {
  action: string;
  permissionDoctype: string;
  permissionAction: MatrixWritePermissionAction;
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
}

export interface MatrixColumnMemberPolicy {
  create?: MatrixActionRef;
  allowHide?: boolean;
  allowShow?: boolean;
}

export interface MatrixQueryPolicy {
  /** Bounded by the server validator to 20..500. */
  pageSize: number;
  /** Maximum matches returned by one search, bounded to 1..200. */
  searchLimit: number;
  /** Minimum characters before remote search, bounded to 0..10. */
  minSearchChars: number;
}

export interface MatrixPresentationPolicy {
  stickyRowAxis: boolean;
  stickyColumnAxis: boolean;
  focusMode: "inline" | "toggle";
  mobileMode: "scroll" | "step";
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
  /** Generic document update is only legal for safe master records; compound writes use actions. */
  write?: MatrixWriteRef;
  rowMembers?: MatrixRowMemberPolicy;
  columnMembers?: MatrixColumnMemberPolicy;
  query: MatrixQueryPolicy;
  presentation: MatrixPresentationPolicy;
  dirtyPolicy: MatrixDirtyPolicy;
  conflictPolicy: MatrixConflictPolicy;
}

export type MatrixViewPolicy = MatrixViewDisabledPolicy | MatrixViewEnabledPolicy;
