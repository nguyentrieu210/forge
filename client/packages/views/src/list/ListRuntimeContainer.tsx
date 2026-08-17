/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { DocTypeMeta } from "@metaforge/core";
import { Badge, Button, ConfirmDialog, toast } from "@metaforge/ui";
import { ListContainer, type ListContainerProps } from "../container/ListContainer.js";
import { useMeta } from "../container/hooks.js";
import { useMetaForge } from "../container/provider.js";
import { useListUrlState } from "./useListState.js";
import { AdvancedFilterDialog } from "./AdvancedFilterDialog.js";
import { actionSupportsSelection, type ListRuntimeAction, type ListRuntimeActionContext } from "./runtime-actions.js";

const EMPTY_META: DocTypeMeta = { name: "", fields: [], permissions: [] };

export interface ListRuntimeContainerProps extends ListContainerProps {
  /** Optional business actions. Canonical delete/export/approve remain owned by ListContainer. */
  actions?: ListRuntimeAction[];
}

/**
 * Canonical ListContainer plus extension-only surface: advanced operator filters and pluggable
 * selection actions. The actual fetch/sort/page/selection runtime stays in ListContainer/ListView.
 */
export function ListRuntimeContainer({ actions = [], ...props }: ListRuntimeContainerProps) {
  const { adapter } = useMetaForge();
  const metaQ = useMeta(props.doctype);
  const meta = metaQ.data ?? { ...EMPTY_META, name: props.doctype };
  const [state, patch] = useListUrlState(props.bridge, meta);
  const [filterOpen, setFilterOpen] = useState(false);
  const [running, setRunning] = useState<string>();
  const [confirmAction, setConfirmAction] = useState<ListRuntimeAction>();
  const selected = state.selected;

  const context = useMemo<ListRuntimeActionContext>(() => ({
    doctype: props.doctype,
    selected,
    bridge: props.bridge,
    clearSelection: () => patch({ selected: [] }),
  }), [patch, props.bridge, props.doctype, selected]);
  const visibleActions = actions.filter((action) => actionSupportsSelection(action, selected.length));

  const execute = async (action: ListRuntimeAction) => {
    if (action.disabled?.(context) || running) return;
    setRunning(action.id);
    try {
      await action.run(context);
      if (!action.keepSelection) context.clearSelection();
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setRunning(undefined);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-1.5">
        <Button type="button" variant={state.advancedFilters?.rules.length ? "secondary" : "ghost"} size="sm" className="h-7" onClick={() => setFilterOpen(true)}>
          <SlidersHorizontal className="size-3.5" /> Bộ lọc nâng cao
          {state.advancedFilters?.rules.length ? <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1">{state.advancedFilters.rules.length}</Badge> : null}
        </Button>
        {selected.length ? <span className="text-xs text-muted-foreground">Đã chọn {selected.length}</span> : null}
        {visibleActions.length ? <div className="ml-auto flex flex-wrap gap-1.5">
          {visibleActions.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant={action.destructive ? "destructive" : "outline"}
              size="sm"
              className="h-7"
              disabled={Boolean(running) || action.disabled?.(context)}
              onClick={() => action.destructive ? setConfirmAction(action) : void execute(action)}
            >
              {running === action.id ? "Đang xử lý…" : action.label}
            </Button>
          ))}
        </div> : null}
      </div>
      <div className="min-h-0 flex-1">
        <ListContainer {...props} />
      </div>
      <AdvancedFilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        meta={meta}
        value={state.advancedFilters}
        onApply={(advancedFilters) => patch({ advancedFilters, selected: [], page: 1 })}
      />
      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => { if (!open) setConfirmAction(undefined); }}
        title={confirmAction?.confirmTitle ?? confirmAction?.label ?? "Xác nhận thao tác"}
        description={confirmAction?.confirmDescription ?? (selected.length ? `Áp dụng cho ${selected.length} bản ghi đã chọn?` : undefined)}
        confirmLabel={confirmAction?.label ?? "Đồng ý"}
        destructive={confirmAction?.destructive}
        onConfirm={() => {
          const action = confirmAction;
          setConfirmAction(undefined);
          if (action) void execute(action);
        }}
      />
    </div>
  );
}
