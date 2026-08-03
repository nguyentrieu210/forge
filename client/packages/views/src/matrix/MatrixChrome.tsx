/** @jsxImportSource react */
import { useState, type ReactNode } from "react";
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, Columns3, Maximize2, Minimize2,
  PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Search,
} from "lucide-react";
import {
  Badge, Button, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Skeleton, cn, useT,
} from "@metaforge/ui";
import type { MatrixActionSpec, MatrixMember, MatrixNavigatorNode, MatrixViewModel } from "./types.js";

export function NavigatorPanel(props: {
  model: MatrixViewModel;
  nodes: MatrixNavigatorNode[];
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (nodeId: string) => void;
  onCollapse?: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const searching = Boolean(props.query.trim());
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const renderNode = (node: MatrixNavigatorNode, depth: number): ReactNode => {
    const children = node.children ?? [];
    const open = searching || expanded.has(node.id);
    const selected = props.model.navigator?.selectedId === node.id;
    return (
      <div key={node.id}>
        <div className="flex items-center gap-1" style={{ paddingLeft: `${Math.max(0, depth) * 12}px` }}>
          {children.length ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => toggle(node.id)}
              aria-label={open ? t("matrix.collapse", "Thu gọn") : t("matrix.expand", "Mở rộng")}
              aria-expanded={open}
            >
              {open ? <ChevronDown /> : <ChevronRight />}
            </Button>
          ) : <span className="size-8 shrink-0" aria-hidden="true" />}
          <Button
            type="button"
            variant="ghost"
            disabled={node.disabled}
            onClick={() => { if (node.selectable !== false) props.onSelect(node.id); }}
            className={cn("h-auto min-w-0 flex-1 justify-start px-2 py-2 text-left font-normal", selected && "bg-primary/10 font-medium text-primary")}
            aria-current={selected ? "page" : undefined}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{node.label}</span>
              {node.subtitle ? <span className="block truncate text-xs text-muted-foreground">{node.subtitle}</span> : null}
            </span>
            {node.badge ? <Badge variant="secondary" className="ml-2 shrink-0">{node.badge}</Badge> : null}
          </Button>
        </div>
        {open ? children.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    );
  };

  return (
    <aside className="mf-matrix-navigator flex h-full min-h-0 flex-col bg-card" aria-label={props.model.navigator?.label ?? t("matrix.navigator", "Danh mục")}>
      <div className="shrink-0 space-y-2 border-b p-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{props.model.navigator?.label ?? t("matrix.navigator", "Danh mục")}</span>
          {props.model.navigator?.searchPending ? <RefreshCw className="ml-auto size-4 animate-spin text-muted-foreground" aria-label={t("common.loading", "Đang tải")} /> : null}
          {props.onCollapse ? (
            <Button type="button" variant="ghost" size="icon-sm" className={cn(!props.model.navigator?.searchPending && "ml-auto")} onClick={props.onCollapse} aria-label={t("matrix.hide_navigator", "Ẩn danh mục")}>
              <PanelLeftClose />
            </Button>
          ) : null}
        </div>
        <SearchInput
          value={props.query}
          onChange={props.onQueryChange}
          placeholder={props.model.navigator?.searchPlaceholder ?? t("matrix.search_navigator", "Tìm trong danh mục...")}
          ariaLabel={t("matrix.search_navigator", "Tìm trong danh mục")}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-2">
        {props.nodes.length ? props.nodes.map((node) => renderNode(node, 0)) : (
          <p className="p-4 text-sm text-muted-foreground">{t("matrix.no_navigator_match", "Không tìm thấy mục phù hợp.")}</p>
        )}
      </div>
    </aside>
  );
}

export function MatrixHeader(props: {
  model: MatrixViewModel;
  rowQuery: string;
  columnQuery: string;
  onRowQueryChange: (value: string) => void;
  onColumnQueryChange: (value: string) => void;
  renderedColumnCount: number;
  visibleColumnCount: number;
  totalColumnCount: number;
  navigatorCollapsed: boolean;
  onOpenNavigator: () => void;
  focusMode: boolean;
  allowFocusMode: boolean;
  onToggleFocus: () => void;
  onOpenColumns: () => void;
  onAction: (action: MatrixActionSpec | undefined) => void;
}) {
  const t = useT();
  const actions = props.model.capabilities;
  const state = props.model.state ?? {};
  return (
    <header className="mf-matrix-header shrink-0 border-b bg-card/95 p-3 backdrop-blur">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {props.navigatorCollapsed ? (
              <Button type="button" variant="ghost" size="icon-sm" onClick={props.onOpenNavigator} aria-label={t("matrix.show_navigator", "Hiện danh mục")}>
                <PanelLeftOpen />
              </Button>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{props.model.title ?? t("matrix.title", "Ma trận")}</h2>
              {props.model.subtitle ? <p className="truncate text-xs text-muted-foreground">{props.model.subtitle}</p> : null}
            </div>
            {state.dirty ? <Badge variant="secondary" className="shrink-0">{t("matrix.unsaved", "Chưa lưu")}</Badge> : null}
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
          {actions?.addRow && !actions.addRow.hidden ? <ActionButton action={actions.addRow} onClick={() => props.onAction(actions.addRow)} icon={<Plus />} /> : null}
          {actions?.createColumn && !actions.createColumn.hidden ? <ActionButton action={actions.createColumn} onClick={() => props.onAction(actions.createColumn)} icon={<Plus />} /> : null}
          <Button type="button" size="sm" variant="outline" onClick={props.onOpenColumns}>
            <Columns3 /> {t("matrix.columns", "Cột")} ({props.visibleColumnCount}/{props.totalColumnCount})
          </Button>
          {props.allowFocusMode ? (
            <Button type="button" size="sm" variant="outline" onClick={props.onToggleFocus}>
              {props.focusMode ? <Minimize2 /> : <Maximize2 />} {props.focusMode ? t("matrix.exit_focus", "Thu nhỏ") : t("matrix.focus", "Tập trung")}
            </Button>
          ) : null}
          {actions?.discard && !actions.discard.hidden && state.dirty ? <ActionButton action={actions.discard} onClick={() => props.onAction(actions.discard)} /> : null}
          {actions?.save && !actions.save.hidden ? (
            <ActionButton
              action={{ ...actions.save, disabled: actions.save.disabled || state.saving || Boolean(state.conflict) }}
              onClick={() => props.onAction(actions.save)}
              icon={state.saving ? <RefreshCw className="animate-spin" /> : <Check />}
            />
          ) : null}
        </div>
      </div>
      {(props.model.rowAxis.searchable || props.model.columnAxis.searchable) ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {props.model.rowAxis.searchable ? (
            <SearchInput
              value={props.rowQuery}
              onChange={props.onRowQueryChange}
              placeholder={props.model.rowAxis.searchPlaceholder ?? `${t("common.search", "Tìm")} ${props.model.rowAxis.label.toLocaleLowerCase()}...`}
              ariaLabel={`${t("common.search", "Tìm")} ${props.model.rowAxis.label}`}
            />
          ) : <span />}
          {props.model.columnAxis.searchable ? (
            <SearchInput
              value={props.columnQuery}
              onChange={props.onColumnQueryChange}
              placeholder={props.model.columnAxis.searchPlaceholder ?? `${t("common.search", "Tìm")} ${props.model.columnAxis.label.toLocaleLowerCase()}...`}
              ariaLabel={`${t("common.search", "Tìm")} ${props.model.columnAxis.label}`}
            />
          ) : null}
        </div>
      ) : null}
      {props.visibleColumnCount > props.renderedColumnCount ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("matrix.windowed_columns", "Đang hiển thị một cửa sổ cột để giới hạn chi phí render.")} {props.renderedColumnCount}/{props.visibleColumnCount}
        </p>
      ) : null}
    </header>
  );
}

function ActionButton(props: { action: MatrixActionSpec; onClick: () => void; icon?: ReactNode }) {
  return (
    <Button type="button" size="sm" variant={props.action.variant ?? "outline"} disabled={props.action.disabled} onClick={props.onClick} title={props.action.description}>
      {props.icon}{props.action.label}
    </Button>
  );
}

function SearchInput(props: { value: string; onChange: (value: string) => void; placeholder: string; ariaLabel: string }) {
  return (
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} aria-label={props.ariaLabel} className="pl-8" />
    </div>
  );
}

export function StatusBanners(props: { model: MatrixViewModel; onAction: (action: MatrixActionSpec | undefined) => void }) {
  const t = useT();
  const state = props.model.state ?? {};
  if (!state.error && !state.conflict) return null;
  return (
    <div className="shrink-0 space-y-2 px-3 pt-3">
      {state.conflict ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1"><strong>{t("matrix.conflict", "Dữ liệu đã thay đổi ở nơi khác.")}</strong> {state.conflict}</div>
          {props.model.capabilities?.reload && !props.model.capabilities.reload.hidden ? <ActionButton action={props.model.capabilities.reload} onClick={() => props.onAction(props.model.capabilities?.reload)} icon={<RefreshCw />} /> : null}
        </div>
      ) : null}
      {state.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">{state.error}</div>
          {props.model.capabilities?.reload && !props.model.capabilities.reload.hidden ? <ActionButton action={props.model.capabilities.reload} onClick={() => props.onAction(props.model.capabilities?.reload)} icon={<RefreshCw />} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function MatrixLoading() {
  return (
    <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-2">
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40 md:col-span-2" />
    </div>
  );
}

export function MatrixEmpty(props: { model: MatrixViewModel; hasRows: boolean; hasColumns: boolean }) {
  const t = useT();
  const message = props.model.state?.emptyMessage
    ?? (!props.hasRows ? t("matrix.no_rows", "Không có dòng phù hợp.") : !props.hasColumns ? t("matrix.no_columns", "Không có cột phù hợp.") : t("matrix.empty", "Chưa có dữ liệu ma trận."));
  return <div className="grid min-h-48 flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">{message}</div>;
}

export function ColumnVisibilityDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: MatrixMember[];
  hidden: Set<string>;
  onVisibleChange: (column: MatrixMember, visible: boolean) => void;
}) {
  const t = useT();
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>{t("matrix.column_visibility", "Hiện / ẩn cột")}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-auto p-2">
          {props.columns.map((column) => {
            const visible = !props.hidden.has(column.id);
            return (
              <label key={column.id} className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 hover:bg-muted">
                <Checkbox checked={visible} onCheckedChange={(checked) => props.onVisibleChange(column, checked === true)} aria-label={`${visible ? t("matrix.hide_column", "Ẩn") : t("matrix.show_column", "Hiện")} ${column.label}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{column.label}</span>
                  {column.subtitle ? <span className="block truncate text-xs text-muted-foreground">{column.subtitle}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
