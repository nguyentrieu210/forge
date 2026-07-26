import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Doc, DocTypeMeta } from "@metaforge/core";
import {
  ListView, applyClientQuery, useListUrlState, loadHiddenCols, saveHiddenCols,
  type UrlStateBridge,
} from "@metaforge/views";
import { toast } from "@metaforge/ui";

/** Cầu URL ↔ state cho List (dùng chung mock + Live). react-router chỉ ở tầng app. */
export function useUrlBridge(): UrlStateBridge {
  const [sp, setSp] = useSearchParams();
  return useMemo<UrlStateBridge>(
    () => ({
      get: (k) => sp.get(k),
      set: (next) =>
        setSp(
          (prev) => {
            const p = new URLSearchParams(prev);
            for (const [k, v] of Object.entries(next)) v == null ? p.delete(k) : p.set(k, v);
            return p;
          },
          { replace: true },
        ),
    }),
    [sp, setSp],
  );
}

/** List mock (client-side filter/sort/paginate) — chứng minh UI lọc thật cho screenshot. */
export function MockList({
  meta, allRows, onRowClick, onCreate, activeRow,
}: {
  meta: DocTypeMeta;
  allRows: Doc[];
  onRowClick?: (r: Doc) => void;
  onCreate?: () => void;
  activeRow?: string;
}) {
  const bridge = useUrlBridge();
  const [state, patch] = useListUrlState(bridge, meta);
  const [hidden, setHidden] = useState<string[]>(() => loadHiddenCols(meta.name));

  const onToggleColumn = useCallback(
    (field: string) => {
      setHidden((prev) => {
        const next = prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field];
        saveHiddenCols(meta.name, next);
        return next;
      });
    },
    [meta.name],
  );

  const { rows, total } = useMemo(() => applyClientQuery(meta, allRows, state), [meta, allRows, state]);

  return (
    <ListView
      meta={meta}
      rows={rows}
      total={total}
      state={state}
      onStateChange={patch}
      hidden={hidden}
      onToggleColumn={onToggleColumn}
      onRowClick={onRowClick}
      onCreate={onCreate}
      activeRow={activeRow}
      onBulkDelete={(names) => { toast.success(`Đã xoá ${names.length} bản ghi (mock)`); patch({ selected: [] }); }}
      onExport={(names) => toast.info(`Xuất ${names.length} bản ghi (mock)`) }
      title={meta.name}
    />
  );
}
