/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import { ArrowLeft } from "lucide-react";
import { Button, ResizableHandle, ResizablePanel, ResizablePanelGroup, cn, useT } from "@metaforge/ui";
import { useMetaForgeOptional } from "../container/provider.js";
import { useBreakpoint } from "../detail/SplitView.js";
import { clampColumnWindow, filterMatrixMembers, filterNavigatorNodes } from "./model.js";
import type {
  MatrixActionContext,
  MatrixActionSpec,
  MatrixCoordinate,
  MatrixMember,
  MatrixSearchContext,
  MatrixSearchScope,
  MatrixViewModel,
  MatrixViewportWindow,
} from "./types.js";
import {
  ColumnVisibilityDialog,
  MatrixEmpty,
  MatrixHeader,
  MatrixLoading,
  NavigatorPanel,
  StatusBanners,
} from "./MatrixChrome.js";
import { MatrixMobileCards, MatrixTable } from "./MatrixGrid.js";

export interface MatrixRendererProps {
  model: MatrixViewModel;
  registry?: ControlRegistry;
  services?: FieldServices;
  roles?: string[];
  onSearch?: (query: string, context: MatrixSearchContext) => void | Promise<void>;
  onNavigatorSelect?: (nodeId: string) => void | Promise<void>;
  onCellChange?: (coordinate: MatrixCoordinate, value: unknown) => void | Promise<void>;
  onCellToggle?: (coordinate: MatrixCoordinate, enabled: boolean) => void | Promise<void>;
  onAuxFieldChange?: (rowId: string, fieldId: string, value: unknown) => void | Promise<void>;
  onColumnVisibilityChange?: (columnId: string, visible: boolean) => void | Promise<void>;
  onAction?: (actionId: string, context: MatrixActionContext) => void | Promise<void>;
  /** Called when row virtualization / column windowing changes the rendered data envelope. */
  onViewportWindowChange?: (window: MatrixViewportWindow) => void;
  /** Async is allowed so apps may use their own confirmation surface instead of window.confirm. */
  confirmDiscard?: (message: string) => boolean | Promise<boolean>;
  className?: string;
}

export function MatrixRenderer(props: MatrixRendererProps) {
  const t = useT();
  const breakpoint = useBreakpoint();
  const provider = useMetaForgeOptional();
  const registry = props.registry ?? provider?.registry;
  const services = props.services ?? provider?.services;
  const roles = props.roles ?? provider?.roles;
  const { model } = props;
  const state = model.state ?? {};
  const presentation = model.presentation ?? {};
  const dirty = Boolean(state.dirty);
  const globallyLocked = Boolean(state.conflict || state.loading || state.saving);

  const [navigatorQuery, setNavigatorQuery] = useState(model.navigator?.searchValue ?? "");
  const [rowQuery, setRowQuery] = useState(model.rowAxis.searchValue ?? "");
  const [columnQuery, setColumnQuery] = useState(model.columnAxis.searchValue ?? "");
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [mobileStep, setMobileStep] = useState<"navigator" | "matrix">(() => model.navigator ? "navigator" : "matrix");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    () => new Set(model.columnAxis.members.filter((member) => member.hidden).map((member) => member.id)),
  );
  const [focusedCell, setFocusedCell] = useState<MatrixCoordinate | null>(null);

  useEffect(() => { if (model.navigator?.searchValue !== undefined) setNavigatorQuery(model.navigator.searchValue); }, [model.navigator?.searchValue]);
  useEffect(() => { if (model.rowAxis.searchValue !== undefined) setRowQuery(model.rowAxis.searchValue); }, [model.rowAxis.searchValue]);
  useEffect(() => { if (model.columnAxis.searchValue !== undefined) setColumnQuery(model.columnAxis.searchValue); }, [model.columnAxis.searchValue]);

  const hiddenSignature = model.columnAxis.members.map((member) => `${member.id}:${member.hidden ? 1 : 0}`).join("|");
  useEffect(() => {
    setHiddenColumns(new Set(model.columnAxis.members.filter((member) => member.hidden).map((member) => member.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenSignature]);

  useDebouncedSearch("navigator", navigatorQuery, props.onSearch, presentation.searchDebounceMs ?? 250);
  useDebouncedSearch("rows", rowQuery, props.onSearch, presentation.searchDebounceMs ?? 250);
  useDebouncedSearch("columns", columnQuery, props.onSearch, presentation.searchDebounceMs ?? 250);

  useEffect(() => {
    if (!dirty || typeof window === "undefined") return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const navigatorNodes = useMemo(
    () => filterNavigatorNodes(model.navigator?.nodes ?? [], navigatorQuery),
    [model.navigator?.nodes, navigatorQuery],
  );
  const filteredRows = useMemo(
    () => filterMatrixMembers(model.rowAxis.members, rowQuery),
    [model.rowAxis.members, rowQuery],
  );
  const filteredColumns = useMemo(
    () => filterMatrixMembers(model.columnAxis.members.filter((member) => !hiddenColumns.has(member.id)), columnQuery),
    [model.columnAxis.members, hiddenColumns, columnQuery],
  );
  const columnWindow = clampColumnWindow(
    filteredColumns.length,
    presentation.columnWindow?.start ?? 0,
    presentation.columnWindow?.end ?? filteredColumns.length,
  );
  const renderedColumns = filteredColumns.slice(columnWindow.start, columnWindow.end);
  const auxiliaryFields = model.auxiliaryFields ?? [];

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualized = breakpoint !== "mobile" && filteredRows.length > (presentation.virtualizeRowsAbove ?? 60);
  const rowVirtualizer = useVirtualizer({
    count: virtualized ? filteredRows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => presentation.estimatedRowHeight ?? 52,
    overscan: presentation.overscan ?? 8,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const padTop = virtualRows.length ? virtualRows[0]!.start : 0;
  const padBottom = virtualRows.length ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1]!.end : 0;
  const rowStart = virtualized && virtualRows.length ? virtualRows[0]!.index : 0;
  const rowEnd = virtualized && virtualRows.length ? virtualRows[virtualRows.length - 1]!.index + 1 : filteredRows.length;

  useEffect(() => {
    props.onViewportWindowChange?.({
      rowStart,
      rowEnd,
      columnStart: columnWindow.start,
      columnEnd: columnWindow.end,
    });
  }, [props.onViewportWindowChange, rowStart, rowEnd, columnWindow.start, columnWindow.end]);

  useEffect(() => {
    if (!filteredRows.length || !renderedColumns.length) {
      setFocusedCell(null);
      return;
    }
    if (focusedCell
      && filteredRows.some((row) => row.id === focusedCell.rowId)
      && renderedColumns.some((column) => column.id === focusedCell.columnId)) return;
    setFocusedCell({ rowId: filteredRows[0]!.id, columnId: renderedColumns[0]!.id });
  }, [filteredRows, renderedColumns, focusedCell]);

  const guardDirty = async (): Promise<boolean> => {
    if (!dirty) return true;
    const message = t("matrix.unsaved_guard", "Bạn có thay đổi chưa lưu. Rời vùng này sẽ có thể mất các thay đổi đó.");
    if (props.confirmDiscard) return Boolean(await props.confirmDiscard(message));
    return typeof window === "undefined" ? false : window.confirm(message);
  };

  const selectNavigator = async (nodeId: string) => {
    if (!(await guardDirty())) return;
    await props.onNavigatorSelect?.(nodeId);
    if (breakpoint === "mobile") setMobileStep("matrix");
  };

  const invokeAction = async (action: MatrixActionSpec | undefined, context: MatrixActionContext = {}) => {
    if (!action || action.disabled || action.hidden) return;
    await props.onAction?.(action.id, context);
  };

  const setColumnVisible = async (column: MatrixMember, visible: boolean) => {
    setHiddenColumns((current) => {
      const next = new Set(current);
      if (visible) next.delete(column.id);
      else next.add(column.id);
      return next;
    });
    await props.onColumnVisibilityChange?.(column.id, visible);
  };

  const showNavigator = Boolean(model.navigator && presentation.navigator !== "hidden");
  const navigatorVisible = showNavigator && !navigatorCollapsed && !focusMode;
  const allowFocusMode = presentation.allowFocusMode !== false;

  const navigator = showNavigator ? (
    <NavigatorPanel
      model={model}
      nodes={navigatorNodes}
      query={navigatorQuery}
      onQueryChange={setNavigatorQuery}
      onSelect={(nodeId) => void selectNavigator(nodeId)}
      onCollapse={presentation.navigator === "collapsible" || presentation.navigator === undefined ? () => setNavigatorCollapsed(true) : undefined}
    />
  ) : null;

  const matrixBody = (
    <div className="mf-matrix-main flex h-full min-h-0 min-w-0 flex-1 flex-col bg-card">
      <MatrixHeader
        model={model}
        rowQuery={rowQuery}
        columnQuery={columnQuery}
        onRowQueryChange={setRowQuery}
        onColumnQueryChange={setColumnQuery}
        renderedColumnCount={renderedColumns.length}
        visibleColumnCount={filteredColumns.length}
        totalColumnCount={model.columnAxis.members.length}
        navigatorCollapsed={showNavigator && !navigatorVisible}
        onOpenNavigator={() => { setNavigatorCollapsed(false); setFocusMode(false); }}
        focusMode={focusMode}
        allowFocusMode={allowFocusMode && breakpoint !== "mobile"}
        onToggleFocus={() => setFocusMode((value) => !value)}
        onOpenColumns={() => setColumnsOpen(true)}
        onAction={(action) => void invokeAction(action)}
      />

      <StatusBanners model={model} onAction={(action) => void invokeAction(action)} />

      {state.loading && !filteredRows.length ? (
        <MatrixLoading />
      ) : !filteredRows.length || !renderedColumns.length ? (
        <MatrixEmpty model={model} hasRows={filteredRows.length > 0} hasColumns={renderedColumns.length > 0} />
      ) : breakpoint === "mobile" ? (
        <MatrixMobileCards
          model={model}
          rows={filteredRows}
          columns={renderedColumns}
          auxiliaryFields={auxiliaryFields}
          registry={registry}
          services={services}
          roles={roles}
          locked={globallyLocked}
          onCellChange={props.onCellChange}
          onCellToggle={props.onCellToggle}
          onAuxFieldChange={props.onAuxFieldChange}
          onRemoveRow={model.capabilities?.removeRow ? (rowId) => void invokeAction(model.capabilities?.removeRow, { rowId }) : undefined}
        />
      ) : (
        <MatrixTable
          model={model}
          rows={filteredRows}
          columns={renderedColumns}
          auxiliaryFields={auxiliaryFields}
          registry={registry}
          services={services}
          roles={roles}
          locked={globallyLocked}
          scrollRef={scrollRef}
          virtualized={virtualized}
          virtualRows={virtualRows}
          padTop={padTop}
          padBottom={padBottom}
          measureRow={virtualized ? rowVirtualizer.measureElement : undefined}
          focusedCell={focusedCell}
          onFocusedCellChange={setFocusedCell}
          onCellChange={props.onCellChange}
          onCellToggle={props.onCellToggle}
          onAuxFieldChange={props.onAuxFieldChange}
          onRemoveRow={model.capabilities?.removeRow ? (rowId) => void invokeAction(model.capabilities?.removeRow, { rowId }) : undefined}
          onEnsureRowVisible={(index) => { if (virtualized) rowVirtualizer.scrollToIndex(index, { align: "auto" }); }}
        />
      )}

      <ColumnVisibilityDialog
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        columns={model.columnAxis.members}
        hidden={hiddenColumns}
        onVisibleChange={(column, visible) => void setColumnVisible(column, visible)}
      />
    </div>
  );

  if (breakpoint === "mobile" && showNavigator && presentation.mobileMode !== "stack") {
    return (
      <div className={cn("mf-matrix-view flex h-full min-h-0 flex-col overflow-hidden bg-card", props.className)} aria-label={model.ariaLabel ?? model.title ?? t("matrix.title", "Ma trận")}>
        {mobileStep === "navigator" ? navigator : (
          <>
            <div className="flex shrink-0 items-center border-b bg-card px-2 py-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => { void guardDirty().then((ok) => { if (ok) setMobileStep("navigator"); }); }}>
                <ArrowLeft /> {model.navigator?.label ?? t("matrix.navigator", "Danh mục")}
              </Button>
            </div>
            <div className="min-h-0 flex-1">{matrixBody}</div>
          </>
        )}
      </div>
    );
  }

  if (breakpoint === "mobile" || !navigatorVisible) {
    return (
      <div className={cn("mf-matrix-view h-full min-h-0 min-w-0 overflow-hidden", props.className)} aria-label={model.ariaLabel ?? model.title ?? t("matrix.title", "Ma trận")}>
        {breakpoint === "mobile" && presentation.mobileMode === "stack" && navigator ? (
          <div className="flex h-full min-h-0 flex-col overflow-auto">
            <div className="min-h-72 shrink-0 border-b">{navigator}</div>
            <div className="min-h-[32rem] flex-1">{matrixBody}</div>
          </div>
        ) : matrixBody}
      </div>
    );
  }

  if (breakpoint === "desktop") {
    return (
      <div className={cn("mf-matrix-view h-full min-h-0 min-w-0 overflow-hidden", props.className)} aria-label={model.ariaLabel ?? model.title ?? t("matrix.title", "Ma trận")}>
        <ResizablePanelGroup direction="horizontal" autoSaveId={`mf-matrix:${model.id}:v1`} className="h-full">
          <ResizablePanel defaultSize={26} minSize={18} maxSize={38} className="min-w-0">{navigator}</ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={74} minSize={50} className="min-w-0">{matrixBody}</ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );
  }

  return (
    <div className={cn("mf-matrix-view flex h-full min-h-0 min-w-0 overflow-hidden", props.className)} aria-label={model.ariaLabel ?? model.title ?? t("matrix.title", "Ma trận")}>
      <div className="w-[clamp(15rem,31vw,20rem)] shrink-0 border-r">{navigator}</div>
      <div className="min-w-0 flex-1">{matrixBody}</div>
    </div>
  );
}

function useDebouncedSearch(
  scope: MatrixSearchScope,
  query: string,
  handler: MatrixRendererProps["onSearch"],
  debounceMs: number,
) {
  useEffect(() => {
    if (!handler) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      Promise.resolve(handler(query, { scope, signal: controller.signal })).catch((error: unknown) => {
        if (!controller.signal.aborted) console.error(`Matrix ${scope} search failed`, error);
      });
    }, Math.max(0, debounceMs));
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [scope, query, handler, debounceMs]);
}
