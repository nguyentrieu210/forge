/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocField, MatrixViewEnabledPolicy } from "@metaforge/core";
import { mapError } from "@metaforge/adapter-frappe";
import { toast } from "@metaforge/ui";
import { useMeta } from "../container/hooks.js";
import { useMetaForge } from "../container/provider.js";
import { MatrixRenderer } from "./MatrixRenderer.js";
import { matrixCellKey } from "./model.js";
import type {
  MatrixAuxField,
  MatrixCell,
  MatrixMember,
  MatrixNavigatorNode,
  MatrixSearchScope,
  MatrixViewModel,
} from "./types.js";

interface MatrixContainerProps {
  doctype: string;
  title?: string;
  onDirtyChange?: (dirty: boolean) => void;
}

type CellDraft = {
  rowId: string;
  columnId: string;
  value: unknown;
  enabled: boolean;
  recordId?: string;
};

type GenericMatrixSnapshot = {
  contract_version: number;
  source: string;
  action?: string;
  subject?: { id: string; label?: string; subtitle?: string; version?: number } | null;
  navigator?: { label?: string; nodes?: MatrixNavigatorNode[]; selected_id?: string };
  rows?: Array<MatrixMember & { values?: Record<string, unknown>; is_primary?: boolean }>;
  columns?: MatrixMember[];
  cells?: Array<{
    row_id: string;
    column_id: string;
    value: unknown;
    enabled?: boolean;
    read_only?: boolean;
    record_id?: string;
    version?: string | number;
    metadata?: Record<string, unknown>;
  }>;
  record_versions?: Record<string, number>;
  capabilities?: { save?: boolean; remove_row?: boolean; create_row?: boolean; create_column?: boolean };
};

export function MatrixContainer(props: MatrixContainerProps) {
  const { adapter, registry, services, roles } = useMetaForge();
  const metaQ = useMeta(props.doctype);
  const policy = metaQ.data?.viewPolicy?.matrix;
  const enabledPolicy = policy?.enabled ? policy as MatrixViewEnabledPolicy : undefined;
  const source = useMemo(() => enabledPolicy ? canonicalSource(enabledPolicy) : undefined, [enabledPolicy]);
  const action = enabledPolicy?.write?.strategy === "action" ? enabledPolicy.write.action : undefined;

  const [snapshot, setSnapshot] = useState<GenericMatrixSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | undefined>();
  const [cellDrafts, setCellDrafts] = useState<Record<string, CellDraft>>({});
  const [auxDrafts, setAuxDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [removedRows, setRemovedRows] = useState<Set<string>>(() => new Set());
  const loadSeq = useRef(0);
  const dirty = Object.keys(cellDrafts).length > 0 || Object.keys(auxDrafts).length > 0 || removedRows.size > 0;

  useEffect(() => { props.onDirtyChange?.(dirty); }, [dirty, props.onDirtyChange]);
  useEffect(() => () => props.onDirtyChange?.(false), [props.onDirtyChange]);

  const load = useCallback(async (input: Record<string, unknown> = {}, keepDraft = false) => {
    if (!source) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(undefined);
    try {
      const next = await adapter.callGet<GenericMatrixSnapshot>("metaforge.matrix.read", {
        source,
        input: JSON.stringify(input),
      });
      if (seq !== loadSeq.current) return;
      setSnapshot(next);
      setConflict(undefined);
      if (!keepDraft) {
        setCellDrafts({});
        setAuxDrafts({});
        setRemovedRows(new Set());
      }
    } catch (cause) {
      if (seq !== loadSeq.current) return;
      setError(mapError(cause).message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [adapter, source]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => (snapshot?.rows ?? []).filter((row) => !removedRows.has(row.id)), [removedRows, snapshot?.rows]);
  const columns = snapshot?.columns ?? [];
  const baseCells = useMemo(() => {
    const map: Record<string, MatrixCell> = {};
    for (const cell of snapshot?.cells ?? []) {
      const key = matrixCellKey(cell.row_id, cell.column_id);
      map[key] = {
        rowId: cell.row_id,
        columnId: cell.column_id,
        value: cell.value,
        enabled: cell.enabled !== false,
        editable: cell.read_only !== true,
        readOnly: cell.read_only === true,
        ...(cell.version !== undefined ? { version: String(cell.version) } : {}),
        metadata: {
          ...(cell.metadata ?? {}),
          ...(cell.record_id ? { record_id: cell.record_id } : {}),
        },
      };
    }
    return map;
  }, [snapshot?.cells]);

  const cells = useMemo(() => {
    const map = { ...baseCells };
    for (const [key, draft] of Object.entries(cellDrafts)) {
      const current = map[key];
      map[key] = {
        rowId: draft.rowId,
        columnId: draft.columnId,
        value: draft.value,
        enabled: draft.enabled,
        editable: current?.editable ?? true,
        readOnly: current?.readOnly,
        version: current?.version,
        metadata: {
          ...(current?.metadata ?? {}),
          ...(draft.recordId ? { record_id: draft.recordId } : {}),
        },
      };
    }
    return map;
  }, [baseCells, cellDrafts]);

  const auxiliaryFields = useMemo<MatrixAuxField[]>(() => {
    if (!enabledPolicy) return [];
    return (enabledPolicy.rowAxis.auxiliaryFields ?? []).map((definition) => {
      const values: Record<string, unknown> = {};
      const readOnlyRows: string[] = [];
      for (const row of rows) {
        const rowValues = rowValuesOf(row);
        values[row.id] = auxDrafts[row.id]?.[definition.field] ?? rowValues[definition.field];
        if (definition.readOnlyWhenField && truthy(rowValues[definition.readOnlyWhenField])) readOnlyRows.push(row.id);
      }
      const field: DocField = {
        fieldname: definition.field,
        label: definition.label ?? definition.field,
        fieldtype: definition.editor ?? "Data",
        ...(definition.editor === "Float" ? { precision: "6" } : {}),
      };
      return { id: definition.field, label: definition.label, field, values, readOnlyRows };
    });
  }, [auxDrafts, enabledPolicy, rows]);

  const model = useMemo<MatrixViewModel | null>(() => {
    if (!enabledPolicy) return null;
    const cellField: DocField = {
      fieldname: enabledPolicy.cell.valueField,
      label: metaQ.data?.label ?? props.title ?? "Giá trị",
      fieldtype: enabledPolicy.cell.editor,
    };
    const presentation = enabledPolicy.presentation;
    const canSave = Boolean(snapshot?.capabilities?.save && action);
    const canRemoveRow = Boolean(snapshot?.capabilities?.remove_row && enabledPolicy.rowMembers?.remove);
    return {
      id: `${props.doctype}:matrix`,
      title: props.title ?? metaQ.data?.label ?? props.doctype,
      subtitle: snapshot?.subject?.subtitle,
      navigator: snapshot?.navigator ? {
        label: snapshot.navigator.label,
        nodes: snapshot.navigator.nodes ?? [],
        selectedId: snapshot.navigator.selected_id,
      } : undefined,
      rowAxis: {
        label: enabledPolicy.rowAxis.labelField || "Dòng",
        members: rows,
        searchable: Boolean(enabledPolicy.rowAxis.searchFields?.length),
      },
      columnAxis: {
        label: enabledPolicy.columnAxis.labelField || "Cột",
        members: columns,
        searchable: Boolean(enabledPolicy.columnAxis.searchFields?.length),
      },
      cellEditor: { field: cellField },
      cellDefaults: { value: null, enabled: false, editable: true },
      cells,
      auxiliaryFields,
      capabilities: {
        ...(canSave ? { save: { id: "save", label: "Lưu thay đổi" } } : {}),
        ...(dirty ? { discard: { id: "discard", label: "Bỏ thay đổi", variant: "ghost" } } : {}),
        reload: { id: "reload", label: "Nạp lại", variant: "outline" },
        ...(canRemoveRow ? { removeRow: { id: "remove-row", label: "Xóa dòng", variant: "ghost" } } : {}),
      },
      state: {
        loading,
        saving,
        dirty,
        error,
        conflict,
        emptyMessage: snapshot?.subject ? "Chưa có dữ liệu ma trận." : "Chọn một đối tượng để xem ma trận.",
      },
      presentation: {
        navigator: enabledPolicy.navigator ? "collapsible" : "hidden",
        mobileMode: presentation.mobileMode === "step" ? "step" : "stack",
        stickyHeaders: presentation.stickyColumnAxis,
        stickyRowAxis: presentation.stickyRowAxis,
        allowFocusMode: presentation.focusMode === "toggle",
        virtualizeRowsAbove: enabledPolicy.query.pageSize,
        searchDebounceMs: 250,
      },
    };
  }, [action, auxiliaryFields, cells, columns, conflict, dirty, enabledPolicy, error, loading, metaQ.data?.label, props.doctype, props.title, rows, saving, snapshot]);

  const changeCell = useCallback((rowId: string, columnId: string, patch: Partial<CellDraft>) => {
    const key = matrixCellKey(rowId, columnId);
    const current = cells[key];
    if (current?.readOnly || current?.editable === false) return;
    setConflict(undefined);
    setCellDrafts((all) => ({
      ...all,
      [key]: {
        rowId,
        columnId,
        value: patch.value ?? all[key]?.value ?? current?.value ?? null,
        enabled: patch.enabled ?? all[key]?.enabled ?? current?.enabled ?? false,
        recordId: all[key]?.recordId ?? text(current?.metadata?.record_id) || undefined,
      },
    }));
  }, [cells]);

  const save = useCallback(async () => {
    if (!snapshot?.subject?.id || !action || !dirty) return;
    setSaving(true);
    setError(undefined);
    setConflict(undefined);
    try {
      await adapter.callPost("metaforge.matrix.action", {
        action,
        input: JSON.stringify({
          request_id: crypto.randomUUID(),
          subject_id: snapshot.subject.id,
          subject_version: snapshot.subject.version,
          record_versions: snapshot.record_versions ?? {},
          row_changes: Object.entries(auxDrafts).map(([rowId, values]) => ({ row_id: rowId, values })),
          row_removals: [...removedRows],
          cells: Object.values(cellDrafts).map((draft) => ({
            row_id: draft.rowId,
            column_id: draft.columnId,
            value: draft.value,
            enabled: draft.enabled,
            ...(draft.recordId ? { record_id: draft.recordId } : {}),
          })),
        }),
      });
      toast.success("Đã lưu thay đổi");
      await load({ selected_id: snapshot.subject.id });
    } catch (cause) {
      const mapped = mapError(cause);
      if (mapped.kind === "conflict") setConflict(mapped.message);
      else setError(mapped.message);
      toast.error(mapped.message);
    } finally {
      setSaving(false);
    }
  }, [action, adapter, auxDrafts, cellDrafts, dirty, load, removedRows, snapshot]);

  if (metaQ.isLoading) return <div className="grid h-40 place-items-center text-sm text-muted-foreground">Đang tải ma trận…</div>;
  if (metaQ.error) return <div className="p-4 text-sm text-destructive">{mapError(metaQ.error).message}</div>;
  if (!enabledPolicy || !source || !model) return <div className="grid h-40 place-items-center p-4 text-sm text-muted-foreground">DocType này chưa khai báo Matrix View.</div>;

  return (
    <MatrixRenderer
      model={model}
      registry={registry}
      services={services}
      roles={roles}
      confirmDiscard={() => window.confirm("Bỏ các thay đổi chưa lưu?")}
      onNavigatorSelect={(id) => { void load({ selected_id: id }); }}
      onSearch={(query, context) => {
        if (dirty || context.signal.aborted) return;
        void load({
          ...(snapshot?.subject?.id ? { selected_id: snapshot.subject.id } : {}),
          search: { scope: context.scope satisfies MatrixSearchScope, query },
        }, true);
      }}
      onCellChange={({ rowId, columnId }, value) => changeCell(rowId, columnId, { value })}
      onCellToggle={({ rowId, columnId }, enabled) => changeCell(rowId, columnId, { enabled })}
      onAuxFieldChange={(rowId, fieldId, value) => {
        setConflict(undefined);
        setAuxDrafts((all) => ({ ...all, [rowId]: { ...(all[rowId] ?? {}), [fieldId]: value } }));
      }}
      onAction={(actionId, context) => {
        if (actionId === "save") void save();
        else if (actionId === "discard") { setCellDrafts({}); setAuxDrafts({}); setRemovedRows(new Set()); setConflict(undefined); }
        else if (actionId === "reload") void load(snapshot?.subject?.id ? { selected_id: snapshot.subject.id } : {});
        else if (actionId === "remove-row" && context.rowId) setRemovedRows((current) => new Set([...current, context.rowId!]));
      }}
    />
  );
}

function canonicalSource(policy: MatrixViewEnabledPolicy): string | undefined {
  const names = new Set([
    policy.navigator?.source.name,
    policy.rowAxis.source.name,
    policy.columnAxis.source.name,
    policy.cell.source.name,
  ].filter((value): value is string => Boolean(value)));
  return names.size === 1 ? [...names][0] : undefined;
}

function rowValuesOf(row: MatrixMember & { values?: Record<string, unknown>; is_primary?: boolean }): Record<string, unknown> {
  return { ...(row.values ?? {}), is_primary: row.is_primary };
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
