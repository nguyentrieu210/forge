/** @jsxImportSource react */
import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import type { DocField } from "@metaforge/core";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import { Button, Input } from "@metaforge/ui";
import {
  DataEditor,
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type Item,
  type ProvideEditorCallback,
  type ProvideEditorComponent,
  type TextCell,
} from "../../../../../../vendor/glide-data-grid/forge-bundle/index.js";
import "../../../../../../vendor/glide-data-grid/forge-bundle/index.css";

type Json = Record<string, unknown>;

export interface SalesGridChoice {
  value: string;
  label: string;
}

export interface SalesGridRow {
  key: string;
  itemCode: string;
  itemLabel?: string;
  availability?: string;
  salesOption: string;
  salesOptionLabel: string;
  salesOptionChoices: SalesGridChoice[];
  priceId: string;
  priceLabel: string;
  priceChoices: SalesGridChoice[];
  uom: string;
  uomChoices: SalesGridChoice[];
  quantity?: number;
  quantityField?: "qty" | "set_count";
  quantityEditable: boolean;
  discountLabel: string;
  adjustmentLabel: string;
  amountLabel: string;
  loading?: boolean;
  error?: string;
  pricingError?: string;
  docValues: Json;
}

export interface AlumdoorSalesLinesGridProps {
  rows: SalesGridRow[];
  selectedKey?: string;
  onSelectedKeyChange: (key: string) => void;
  onChange: (
    key: string,
    field: "item_code" | "sales_option" | "item_price" | "uom" | "qty" | "set_count",
    value: unknown,
  ) => void;
  onAdd: () => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  parentDocValues: Json;
  childDoctype: string;
  itemField?: DocField;
  salesOptionField?: DocField;
}

const COLUMN_IDS = ["item", "sales_option", "price", "uom", "qty", "discount", "adjustment", "amount"] as const;

const INITIAL_COLUMNS: GridColumn[] = [
  { id: "item", title: "Mặt hàng", width: 300, grow: 2 },
  { id: "sales_option", title: "Cách bán", width: 190, grow: 1 },
  { id: "price", title: "Đơn giá", width: 180 },
  { id: "uom", title: "ĐVT", width: 90 },
  { id: "qty", title: "SL tính giá", width: 115 },
  { id: "discount", title: "Chiết khấu", width: 120 },
  { id: "adjustment", title: "Phụ thu", width: 120 },
  { id: "amount", title: "Thành tiền", width: 150 },
];

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function selectField(fieldname: string, label: string, choices: SalesGridChoice[]): DocField {
  const values = choices.map((choice) => choice.value).filter(Boolean);
  return {
    fieldname,
    label,
    fieldtype: "Select",
    options: ["", ...values].join("\n"),
    optionLabels: Object.fromEntries(choices.map((choice) => [choice.value, choice.label])),
  } as DocField;
}

function GridForgeEditor(props: {
  value: TextCell;
  onFinishedEditing: (value?: TextCell, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void;
  field: DocField;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  parentDoctype: string;
  docValues: Json;
  choices?: SalesGridChoice[];
}) {
  if (props.field.fieldtype === "Link") {
    return (
      <GridLinkEditor
        value={props.value}
        onFinishedEditing={props.onFinishedEditing}
        field={props.field}
        services={props.services}
        parentDoctype={props.parentDoctype}
        docValues={props.docValues}
        choices={props.choices}
      />
    );
  }
  const Control = props.registry.resolve(props.field.fieldtype);
  if (!Control) return null;
  return (
    <div className="min-w-[220px] rounded-md border bg-card p-1 shadow-xl">
      <Control
        field={props.field}
        id={`glide-editor-${props.field.fieldname}`}
        value={props.value.data}
        onChange={(next) => {
          const data = text(next);
          props.onFinishedEditing({ ...props.value, data, displayData: data });
        }}
        services={props.services}
        parentDoctype={props.parentDoctype}
        docValues={props.docValues}
        roles={props.roles}
        compact
      />
    </div>
  );
}

function GridLinkEditor(props: {
  value: TextCell;
  onFinishedEditing: (value?: TextCell) => void;
  field: DocField;
  services: FieldServices;
  parentDoctype: string;
  docValues: Json;
  choices?: SalesGridChoice[];
}) {
  const target = text(props.field.options);
  const [query, setQuery] = useState(text(props.value.data));
  const [options, setOptions] = useState<SalesGridChoice[]>(props.choices ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (props.choices) {
      setOptions(props.choices);
      return;
    }
    if (!target || !props.services.searchLink) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void props.services.searchLink!(target, query, {
        referenceDoctype: props.parentDoctype,
        pageLength: 20,
      }).then((rows) => {
        if (!active) return;
        setOptions(rows.map((row) => ({ value: row.value, label: row.description || row.value })));
      }).catch(() => {
        if (active) setOptions([]);
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [props.choices, props.parentDoctype, props.services, query, target]);

  const choose = (choice: SalesGridChoice) => {
    props.onFinishedEditing({
      ...props.value,
      data: choice.value,
      displayData: choice.label,
      copyData: choice.value,
    });
  };

  return (
    <div className="relative min-w-[260px] rounded-md border bg-card p-1.5 shadow-xl" onPointerDown={(event) => event.stopPropagation()}>
      <Input
        autoFocus
        value={query}
        className="h-8 text-xs"
        placeholder={text(props.field.label) || "Tìm kiếm…"}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onFinishedEditing();
          if (event.key === "Enter" && options[0]) choose(options[0]);
        }}
      />
      <div className="mt-1 max-h-52 overflow-y-auto rounded border bg-popover p-1">
        {loading ? <div className="px-2 py-1.5 text-xs text-muted-foreground">Đang tìm…</div> : null}
        {!loading && options.length === 0 ? <div className="px-2 py-1.5 text-xs text-muted-foreground">Không có kết quả</div> : null}
        {options.map((choice) => (
          <button
            key={choice.value}
            type="button"
            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(choice)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function textCell(
  data: string,
  displayData = data,
  readonly = false,
  align: "left" | "right" | "center" = "left",
  allowOverlay = !readonly,
): TextCell {
  return {
    kind: GridCellKind.Text,
    data,
    displayData,
    allowOverlay,
    readonly,
    contentAlign: align,
    copyData: displayData,
    activationBehaviorOverride: !readonly && allowOverlay ? "single-click" : undefined,
  };
}

function selectorDisplay(label: string, choices: readonly SalesGridChoice[]): string {
  return choices.length ? `${label}  ▾` : label;
}

type GlideEditorProps = Parameters<ProvideEditorComponent<GridCell>>[0];

type LinkEditorState = {
  key: string;
  column: "item" | "sales_option";
};

export function AlumdoorSalesLinesGrid(props: AlumdoorSalesLinesGridProps) {
  const [columns, setColumns] = useState<readonly GridColumn[]>(INITIAL_COLUMNS);
  const [linkEditor, setLinkEditor] = useState<LinkEditorState | undefined>();
  const selectedIndex = Math.max(0, props.rows.findIndex((row) => row.key === props.selectedKey));
  const selected = props.rows[selectedIndex];
  const linkEditorRowIndex = props.rows.findIndex((row) => row.key === linkEditor?.key);
  const linkEditorRow = linkEditorRowIndex >= 0 ? props.rows[linkEditorRowIndex] : undefined;
  const linkEditorColumnIndex = linkEditor ? COLUMN_IDS.indexOf(linkEditor.column) : -1;
  const linkEditorField = linkEditor?.column === "item" ? props.itemField : props.salesOptionField;
  const linkEditorLeft = 42 + columns
    .slice(0, Math.max(0, linkEditorColumnIndex))
    .reduce((total, column) => total + column.width, 0);

  const getCellContent = useCallback((cell: Item): GridCell => {
    const [columnIndex, rowIndex] = cell;
    const row = props.rows[rowIndex];
    const column = COLUMN_IDS[columnIndex];
    if (!row || !column) return textCell("", "", true);

    switch (column) {
      case "item":
        return textCell(
          row.itemCode,
          `${row.itemLabel || row.itemCode || "Chọn mặt hàng…"}  ▾`,
          !props.itemField,
          "left",
          false,
        );
      case "sales_option":
        return textCell(
          row.salesOption,
          selectorDisplay(row.salesOptionLabel || (row.salesOptionChoices.length ? "Chọn cách bán…" : "Tiêu chuẩn"), row.salesOptionChoices),
          !props.salesOptionField,
          "left",
          false,
        );
      case "price":
        // Item Price is an authoritative server projection. The operator chooses
        // Sales Option/UOM and the commercial resolver decides the exact price record.
        return textCell(
          row.priceId,
          row.pricingError ? "Lỗi đơn giá" : row.priceLabel || (row.loading ? "Đang tính…" : "—"),
          true,
          "right",
        );
      case "uom":
        return textCell(row.uom, selectorDisplay(row.uom || "—", row.uomChoices.length > 1 ? row.uomChoices : []), row.uomChoices.length <= 1, "center");
      case "qty":
        return {
          kind: GridCellKind.Number,
          data: row.quantity,
          displayData: row.quantity == null ? "—" : row.quantity.toLocaleString("vi-VN", { maximumFractionDigits: 6 }),
          allowOverlay: row.quantityEditable,
          readonly: !row.quantityEditable,
          allowNegative: false,
          thousandSeparator: true,
          contentAlign: "right",
          copyData: row.quantity == null ? "" : String(row.quantity),
        };
      case "discount":
        return textCell(row.discountLabel, row.discountLabel || "—", true, "right");
      case "adjustment":
        return textCell(row.adjustmentLabel, row.adjustmentLabel || "—", true, "right");
      case "amount":
        return textCell(row.amountLabel, row.amountLabel || "—", true, "right");
    }
  }, [props.itemField, props.rows, props.salesOptionField]);

  const provideEditor = useCallback<ProvideEditorCallback<GridCell>>((cell) => {
    const location = cell.location;
    if (!location || cell.kind !== GridCellKind.Text) return undefined;
    const [columnIndex, rowIndex] = location;
    const row = props.rows[rowIndex];
    const column = COLUMN_IDS[columnIndex];
    if (!row || !column || column === "item" || column === "sales_option" || column === "price") return undefined;

    const choices = column === "uom"
        ? row.uomChoices
        : [];
    if (!choices.length) return undefined;
    return (editorProps: GlideEditorProps) => (
      <GridForgeEditor
        {...editorProps}
        value={editorProps.value as TextCell}
        field={selectField("uom", "ĐVT", choices)}
        registry={props.registry}
        services={props.services}
        roles={props.roles}
        parentDoctype={props.childDoctype}
        docValues={row.docValues}
      />
    );
  }, [props.childDoctype, props.registry, props.roles, props.rows, props.services]);

  const onCellEdited = useCallback((cell: Item, newValue: EditableGridCell) => {
    const [columnIndex, rowIndex] = cell;
    const row = props.rows[rowIndex];
    const column = COLUMN_IDS[columnIndex];
    if (!row || !column) return;
    props.onSelectedKeyChange(row.key);

    if (column === "qty" && newValue.kind === GridCellKind.Number && row.quantityEditable && row.quantityField) {
      props.onChange(row.key, row.quantityField, newValue.data);
      return;
    }
    if (newValue.kind !== GridCellKind.Text) return;
    if (column === "item") props.onChange(row.key, "item_code", newValue.data);
    else if (column === "sales_option") props.onChange(row.key, "sales_option", newValue.data);
    else if (column === "uom") props.onChange(row.key, "uom", newValue.data);
  }, [props]);

  const gridHeight = Math.min(430, Math.max(118, 36 + props.rows.length * 38 + 4));
  const status = selected?.pricingError || selected?.error || selected?.availability || "";

  return (
    <div className="relative overflow-visible rounded-lg border bg-card" data-surface="alumdoor-sales-lines-glide-grid">
      <div className="flex min-h-10 items-center justify-between gap-2 border-b px-2.5 py-1.5">
        <div className="min-w-0">
          <div className="text-xs font-semibold">Bảng sản phẩm</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {status || "Chọn mặt hàng / cách bán / ĐVT; đơn giá, CK, phụ thu và thành tiền do hệ thống tính"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {selected?.loading ? <Loader2 className="mr-1 size-3.5 animate-spin text-muted-foreground" /> : null}
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={props.onAdd}>
            <Plus className="mr-1 size-3.5" /> Thêm
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Nhân dòng" disabled={!selected} onClick={() => selected && props.onDuplicate(selected.key)}>
            <Copy className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Xoá dòng" disabled={!selected || props.rows.length <= 1} onClick={() => selected && props.onDelete(selected.key)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="relative overflow-visible rounded-b-lg">
        <DataEditor
          columns={columns}
          rows={props.rows.length}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          provideEditor={provideEditor}
          onCellClicked={(cell) => {
            const row = props.rows[cell[1]];
            if (!row) return;
            props.onSelectedKeyChange(row.key);
            const column = COLUMN_IDS[cell[0]];
            if (column === "item" && props.itemField) {
              setLinkEditor({ key: row.key, column });
            } else if (column === "sales_option" && props.salesOptionField) {
              setLinkEditor({ key: row.key, column });
            } else {
              setLinkEditor(undefined);
            }
          }}
          rowMarkers="clickable-number"
          rowHeight={38}
          headerHeight={34}
          height={gridHeight}
          width="100%"
          freezeColumns={1}
          rangeSelect="cell"
          rowSelect="single"
          columnSelect="none"
          minColumnWidth={70}
          maxColumnWidth={520}
          overscrollX={80}
          scaleToRem
          theme={{
            baseFontStyle: "0.75rem",
            headerFontStyle: "600 0.72rem",
            editorFontSize: "0.78rem",
            cellHorizontalPadding: 8,
            cellVerticalPadding: 4,
          }}
          onColumnResize={(column: GridColumn, newSize: number) => {
            setColumns((current) => current.map((entry) => (
              entry.id === column.id ? { ...entry, width: newSize } : entry
            )));
          }}
        />
      </div>

      {linkEditor && linkEditorRow && linkEditorField ? (
        <div
          className="absolute z-[90] max-w-[calc(100%-3rem)]"
          style={{
            left: Math.max(42, linkEditorLeft),
            top: 74 + linkEditorRowIndex * 38,
          }}
          data-surface="alumdoor-grid-link-editor"
        >
          <GridLinkEditor
            value={textCell(
              linkEditor.column === "item" ? linkEditorRow.itemCode : linkEditorRow.salesOption,
            )}
            onFinishedEditing={(value) => {
              if (value) {
                props.onChange(
                  linkEditorRow.key,
                  linkEditor.column === "item" ? "item_code" : "sales_option",
                  value.data,
                );
              }
              setLinkEditor(undefined);
            }}
            field={linkEditorField}
            services={props.services}
            parentDoctype={props.childDoctype}
            docValues={{ ...linkEditorRow.docValues, item_code: linkEditorRow.itemCode }}
            choices={linkEditor.column === "sales_option" ? linkEditorRow.salesOptionChoices : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
