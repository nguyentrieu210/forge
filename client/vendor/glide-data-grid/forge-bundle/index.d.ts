import type * as React from "react";

/**
 * Type facade for the self-contained Glide runtime bundle vendored by Forge.
 *
 * The runtime bundle is generated from Glide Data Grid v6.0.4-alpha24, but the
 * upstream dist/ declaration tree is intentionally not checked into this repo.
 * Keep this facade limited to the public surface consumed by Forge so the
 * production TypeScript build validates the same API that the generated JS
 * bundle exposes at runtime.
 */
export enum GridCellKind {
  Uri = "uri",
  Text = "text",
  Image = "image",
  RowID = "row-id",
  Number = "number",
  Bubble = "bubble",
  Boolean = "boolean",
  Loading = "loading",
  Markdown = "markdown",
  Drilldown = "drilldown",
  Protected = "protected",
  Custom = "custom",
}

export type Item = readonly [col: number, row: number];

export interface BaseGridColumn {
  readonly title: string;
  readonly group?: string;
  readonly grow?: number;
  readonly style?: "normal" | "highlight";
}

export interface SizedGridColumn extends BaseGridColumn {
  readonly width: number;
  readonly id?: string;
}

export interface AutoGridColumn extends BaseGridColumn {
  readonly id: string;
  readonly width?: number;
}

export type GridColumn = SizedGridColumn | AutoGridColumn;
export type CellActivationBehavior = "double-click" | "single-click" | "second-click";

export interface BaseGridCell {
  readonly allowOverlay: boolean;
  readonly lastUpdated?: number;
  readonly style?: "normal" | "faded";
  readonly span?: readonly [start: number, end: number];
  readonly contentAlign?: "left" | "right" | "center";
  readonly copyData?: string;
  readonly activationBehaviorOverride?: CellActivationBehavior;
}

export interface TextCell extends BaseGridCell {
  readonly kind: GridCellKind.Text;
  readonly displayData: string;
  readonly data: string;
  readonly readonly?: boolean;
  readonly allowWrapping?: boolean;
}

export interface NumberCell extends BaseGridCell {
  readonly kind: GridCellKind.Number;
  readonly displayData: string;
  readonly data: number | undefined;
  readonly readonly?: boolean;
  readonly fixedDecimals?: number;
  readonly allowNegative?: boolean;
  readonly thousandSeparator?: boolean | string;
  readonly decimalSeparator?: string;
}

export type GridCell = TextCell | NumberCell;
export type EditableGridCell = TextCell | NumberCell;
export type SelectionRange = number | readonly [number, number];

export interface ForgeGlideTheme {
  readonly baseFontStyle?: string;
  readonly headerFontStyle?: string;
  readonly editorFontSize?: string;
  readonly cellHorizontalPadding?: number;
  readonly cellVerticalPadding?: number;
  readonly [key: string]: string | number | boolean | undefined;
}

export interface ProvideEditorProps<T extends GridCell> {
  readonly onChange: (newValue: T) => void;
  readonly onFinishedEditing: (
    newValue?: T,
    movement?: readonly [-1 | 0 | 1, -1 | 0 | 1],
  ) => void;
  readonly isHighlighted: boolean;
  readonly value: T;
  readonly initialValue?: string;
  readonly validatedSelection?: SelectionRange;
  readonly forceEditMode: boolean;
  readonly isValid?: boolean;
  readonly target?: { x: number; y: number; width: number; height: number };
  readonly theme?: ForgeGlideTheme;
  readonly portalElementRef?: React.RefObject<HTMLElement>;
}

// Use a plain call signature rather than React.FunctionComponent here. Forge derives
// the editor prop type with Parameters<ProvideEditorComponent<...>>; React 19's
// FunctionComponent compatibility signature widens that derivation to unknown under
// the repository's TS version, even though Glide invokes editors as normal functions.
export type ProvideEditorComponent<T extends GridCell> = (props: ProvideEditorProps<T>) => React.ReactNode;
export type ProvideEditorCallbackResult<T extends GridCell> =
  | (ProvideEditorComponent<T> & { disablePadding?: boolean; disableStyling?: boolean })
  | { editor: ProvideEditorComponent<T>; disablePadding?: boolean; disableStyling?: boolean }
  | undefined;
export type ProvideEditorCallback<T extends GridCell> = (
  cell: T & { location?: Item; activation?: unknown },
) => ProvideEditorCallbackResult<T>;

export interface DataEditorProps {
  columns: readonly GridColumn[];
  rows: number;
  getCellContent: (cell: Item) => GridCell;
  onCellEdited?: (cell: Item, newValue: EditableGridCell) => void;
  provideEditor?: ProvideEditorCallback<GridCell>;
  onCellClicked?: (cell: Item, event?: unknown) => void;
  rowMarkers?: string;
  rowHeight?: number;
  headerHeight?: number;
  height?: number | string;
  width?: number | string;
  freezeColumns?: number;
  rangeSelect?: string;
  rowSelect?: string;
  columnSelect?: string;
  minColumnWidth?: number;
  maxColumnWidth?: number;
  overscrollX?: number;
  scaleToRem?: boolean;
  theme?: ForgeGlideTheme;
  onColumnResize?: (column: GridColumn, newSize: number) => void;
}

export declare const DataEditor: React.ComponentType<DataEditorProps>;
