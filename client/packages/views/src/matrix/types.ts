import type { DocField } from "@metaforge/core";

export type MatrixSearchScope = "navigator" | "rows" | "columns";

export interface MatrixSearchContext {
  scope: MatrixSearchScope;
  signal: AbortSignal;
}

export interface MatrixCoordinate {
  rowId: string;
  columnId: string;
}

export interface MatrixMember {
  id: string;
  label: string;
  subtitle?: string;
  searchText?: string;
  disabled?: boolean;
  hidden?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MatrixNavigatorNode {
  id: string;
  label: string;
  subtitle?: string;
  searchText?: string;
  badge?: string;
  selectable?: boolean;
  disabled?: boolean;
  children?: MatrixNavigatorNode[];
}

export interface MatrixCell {
  rowId: string;
  columnId: string;
  value: unknown;
  enabled?: boolean;
  editable?: boolean;
  readOnly?: boolean;
  masked?: boolean;
  loading?: boolean;
  error?: string;
  conflict?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

export interface MatrixCellDefaults {
  value?: unknown;
  enabled?: boolean;
  editable?: boolean;
  readOnly?: boolean;
}

export interface MatrixCellEditor {
  field: DocField;
  linkTarget?: string;
  parentDoctype?: string;
}

export interface MatrixAuxField {
  id: string;
  field: DocField;
  label?: string;
  values: Record<string, unknown>;
  readOnlyRows?: string[];
  maskedRows?: string[];
  errors?: Record<string, string>;
  conflicts?: Record<string, string>;
  linkTargets?: Record<string, string | undefined>;
  parentDoctype?: string;
}

export type MatrixActionVariant = "default" | "outline" | "ghost" | "destructive";

export interface MatrixActionSpec {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  hidden?: boolean;
  variant?: MatrixActionVariant;
}

export interface MatrixCapabilities {
  save?: MatrixActionSpec;
  discard?: MatrixActionSpec;
  reload?: MatrixActionSpec;
  addRow?: MatrixActionSpec;
  removeRow?: MatrixActionSpec;
  createColumn?: MatrixActionSpec;
}

export interface MatrixRuntimeState {
  loading?: boolean;
  saving?: boolean;
  dirty?: boolean;
  error?: string;
  conflict?: string;
  emptyMessage?: string;
}

export interface MatrixNavigatorModel {
  label?: string;
  nodes: MatrixNavigatorNode[];
  selectedId?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  searchPending?: boolean;
}

export interface MatrixAxisModel {
  label: string;
  members: MatrixMember[];
  searchable?: boolean;
  searchValue?: string;
  searchPlaceholder?: string;
}

export interface MatrixColumnWindow {
  /** Inclusive start in the filtered, non-hidden column list. */
  start: number;
  /** Exclusive end in the filtered, non-hidden column list. */
  end: number;
}

export interface MatrixPresentationHints {
  navigator?: "visible" | "collapsible" | "hidden";
  mobileMode?: "step" | "stack";
  stickyHeaders?: boolean;
  stickyRowAxis?: boolean;
  allowFocusMode?: boolean;
  rowHeaderWidth?: number;
  auxiliaryWidth?: number;
  columnWidth?: number;
  virtualizeRowsAbove?: number;
  estimatedRowHeight?: number;
  overscan?: number;
  searchDebounceMs?: number;
  /** Optional server/windowing seam. The renderer never assumes the full column set is resident. */
  columnWindow?: MatrixColumnWindow;
}

export interface MatrixViewModel {
  id: string;
  title?: string;
  subtitle?: string;
  ariaLabel?: string;
  navigator?: MatrixNavigatorModel;
  rowAxis: MatrixAxisModel;
  columnAxis: MatrixAxisModel;
  cellEditor: MatrixCellEditor;
  cellDefaults?: MatrixCellDefaults;
  /** Sparse cell map. Keys MUST be produced by matrixCellKey(rowId, columnId). */
  cells: Record<string, MatrixCell>;
  auxiliaryFields?: MatrixAuxField[];
  capabilities?: MatrixCapabilities;
  state?: MatrixRuntimeState;
  presentation?: MatrixPresentationHints;
}

export interface MatrixActionContext {
  rowId?: string;
  columnId?: string;
  navigatorId?: string;
}

export interface MatrixViewportWindow {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
}
