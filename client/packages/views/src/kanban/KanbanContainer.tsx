/** @jsxImportSource react */
/**
 * KanbanContainer — nối KanbanView vào backend thật. Trước đây KanbanView chỉ tồn tại trong mock demo
 * (apps/demo/src/App.tsx), chưa app live nào wiring — đổi cột qua Select trong KanbanView chưa từng
 * gọi API thật. field_name/columns nhận qua PROP tường minh (không tự suy từ doctype "Kanban Board"
 * — tránh đoán field/schema doctype đó khi chưa xác nhận LIVE trên site cụ thể).
 */
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast, useT } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import { useMeta, useList } from "../container/hooks.js";
import { KanbanView } from "./KanbanView.js";
import type { Doc } from "@metaforge/core";

export interface KanbanContainerProps {
  doctype: string;
  /** field quyết định cột (thường Select hoặc workflow_state). */
  fieldName: string;
  columns: string[];
  titleField?: string;
  onCardClick?: (row: Doc) => void;
  pageLength?: number;
}

export function KanbanContainer(props: KanbanContainerProps) {
  const t = useT();
  const { doctype, fieldName, columns, pageLength = 200 } = props;
  const { adapter, scopeKey } = useMetaForge();
  const qc = useQueryClient();
  const metaQ = useMeta(doctype);
  const titleField = props.titleField ?? metaQ.data?.title_field;
  const fields = useMemo(() => {
    const base = new Set(["name", fieldName, "modified"]);
    if (titleField) base.add(titleField);
    return [...base];
  }, [fieldName, titleField]);
  const listQ = useList(doctype, { fields, pageLength }, Boolean(metaQ.data));

  const onMove = async (row: Doc, toColumn: string) => {
    try {
      await adapter.updateDoc(doctype, String(row.name), { [fieldName]: toColumn }, String(row.modified ?? ""));
      toast.success(t("kanban.moved"));
      void qc.invalidateQueries({ queryKey: [scopeKey, "list", doctype] });
      void qc.invalidateQueries({ queryKey: [scopeKey, "list-view", doctype] });
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    }
  };

  if (metaQ.isLoading || listQ.isLoading) return <div className="grid h-40 place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (metaQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(metaQ.error).message}</div>;
  if (listQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(listQ.error).message}</div>;
  if (!metaQ.data) return null;

  return (
    <KanbanView
      meta={metaQ.data}
      fieldName={fieldName}
      columns={columns}
      rows={listQ.data ?? []}
      titleField={titleField}
      onCardClick={props.onCardClick}
      onMove={onMove}
    />
  );
}
