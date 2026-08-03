import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DocField } from "@metaforge/core";
import { createDefaultRegistry } from "@metaforge/controls";
import { I18nProvider } from "@metaforge/ui";
import {
  MatrixRenderer,
  matrixCellKey,
  type MatrixCell,
  type MatrixViewModel,
} from "../../../packages/views/src/matrix/index.js";
import "@metaforge/ui/styles.css";
import "../src/styles.css";

const VALUE_FIELD = {
  fieldname: "value",
  label: "Giá trị",
  fieldtype: "Float",
  precision: "2",
} as DocField;

const registry = createDefaultRegistry();

const NOTE_FIELD = {
  fieldname: "note",
  label: "Ghi chú",
  fieldtype: "Data",
} as DocField;

const rows = Array.from({ length: 84 }, (_, index) => ({
  id: `row-${index + 1}`,
  label: `Dòng ${String(index + 1).padStart(2, "0")}`,
  subtitle: index % 5 === 0 ? "Nhóm ưu tiên" : undefined,
  searchText: index % 2 === 0 ? "chan" : "le",
}));

const columns = Array.from({ length: 16 }, (_, index) => ({
  id: `column-${index + 1}`,
  label: `Cột ${index + 1}`,
  subtitle: index % 3 === 0 ? "Có chú thích" : undefined,
}));

const initialCells = Object.fromEntries(rows.flatMap((row, rowIndex) => columns.flatMap((column, columnIndex) => {
  if ((rowIndex + columnIndex) % 4 !== 0) return [];
  const cell: MatrixCell = {
    rowId: row.id,
    columnId: column.id,
    value: rowIndex * 10 + columnIndex,
    enabled: (rowIndex + columnIndex) % 3 !== 0,
    editable: true,
  };
  return [[matrixCellKey(row.id, column.id), cell]];
})));

function App() {
  const [cells, setCells] = useState<Record<string, MatrixCell>>(initialCells);
  const [notes, setNotes] = useState<Record<string, unknown>>(() => Object.fromEntries(rows.map((row, index) => [row.id, index % 7 === 0 ? "Cần kiểm tra" : ""])));
  const [selected, setSelected] = useState("leaf-a1");
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<string | undefined>();
  const [message, setMessage] = useState("ready");

  const model = useMemo<MatrixViewModel>(() => ({
    id: "matrix-runtime-harness",
    title: "Matrix Runtime Harness",
    subtitle: "Fixture trung lập để kiểm desktop, tablet, mobile, sparse cells và keyboard.",
    navigator: {
      label: "Danh mục",
      selectedId: selected,
      nodes: [
        { id: "group-a", label: "Nhóm A", children: [
          { id: "leaf-a1", label: "Mục A1", selectable: true },
          { id: "leaf-a2", label: "Mục A2", selectable: true },
        ] },
        { id: "group-b", label: "Nhóm B", children: [
          { id: "leaf-b1", label: "Mục B1", selectable: true },
        ] },
      ],
    },
    rowAxis: { label: "Dòng", members: rows, searchable: true },
    columnAxis: { label: "Cột", members: columns, searchable: true },
    cellEditor: { field: VALUE_FIELD },
    cellDefaults: { value: null, enabled: false, editable: true },
    cells,
    auxiliaryFields: [{ id: "note", field: NOTE_FIELD, label: "Ghi chú", values: notes }],
    capabilities: {
      addRow: { id: "add-row", label: "Thêm dòng" },
      removeRow: { id: "remove-row", label: "Xóa dòng", variant: "ghost" },
      createColumn: { id: "create-column", label: "Thêm cột" },
      discard: { id: "discard", label: "Bỏ thay đổi", variant: "ghost" },
      reload: { id: "reload", label: "Nạp lại" },
      save: { id: "save", label: "Lưu", variant: "default" },
    },
    state: { dirty, conflict },
    presentation: {
      navigator: "collapsible",
      mobileMode: "step",
      stickyHeaders: true,
      stickyRowAxis: true,
      virtualizeRowsAbove: 50,
      columnWindow: { start: 0, end: 10 },
    },
  }), [cells, notes, selected, dirty, conflict]);

  return (
    <I18nProvider initial="vi">
      <main className="h-dvh bg-background p-2">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <button type="button" className="rounded border px-2 py-1" onClick={() => setConflict((value) => value ? undefined : "Fixture conflict: dữ liệu nguồn đã đổi.")}>Toggle conflict</button>
          <span data-testid="matrix-status">{message}</span>
        </div>
        <div className="h-[calc(100dvh-3rem)] overflow-hidden rounded-lg border">
          <MatrixRenderer
            model={model}
            registry={registry}
            confirmDiscard={() => true}
            onNavigatorSelect={(id) => { setSelected(id); setMessage(`navigator:${id}`); }}
            onCellChange={({ rowId, columnId }, value) => {
              const key = matrixCellKey(rowId, columnId);
              setCells((current) => ({ ...current, [key]: { rowId, columnId, value, enabled: current[key]?.enabled ?? false, editable: true } }));
              setDirty(true);
              setMessage(`cell:${rowId}:${columnId}`);
            }}
            onCellToggle={({ rowId, columnId }, enabled) => {
              const key = matrixCellKey(rowId, columnId);
              setCells((current) => ({ ...current, [key]: { rowId, columnId, value: current[key]?.value ?? null, enabled, editable: true } }));
              setDirty(true);
              setMessage(`toggle:${rowId}:${columnId}:${enabled}`);
            }}
            onAuxFieldChange={(rowId, fieldId, value) => {
              setNotes((current) => ({ ...current, [rowId]: value }));
              setDirty(true);
              setMessage(`aux:${rowId}:${fieldId}`);
            }}
            onColumnVisibilityChange={(columnId, visible) => setMessage(`column:${columnId}:${visible}`)}
            onViewportWindowChange={(window) => document.body.setAttribute("data-matrix-window", JSON.stringify(window))}
            onAction={(actionId, context) => {
              setMessage(`action:${actionId}:${context.rowId ?? ""}`);
              if (actionId === "save" || actionId === "discard" || actionId === "reload") {
                setDirty(false);
                setConflict(undefined);
              }
            }}
          />
        </div>
      </main>
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
