/** @jsxImportSource react */
/**
 * KanbanView (M06, presentational) — board theo field Select/workflow_state.
 * Cột = board.columns; card nhóm theo doc[field_name]. Chuyển cột → onMove (container
 * gọi adapter.kanban.moveCard = update_order_for_single_card, §12). Kéo-thả dnd-kit = PHA 6.
 * Luật "chip lý do khi đổi cột" (M06) do container áp qua onMove (mở dialog trước khi gọi).
 */
import type { DocTypeMeta, Doc } from "@metaforge/core";
import { cn, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@metaforge/ui";

export interface KanbanViewProps {
  meta: DocTypeMeta;
  /** board.field_name — field quyết định cột. */
  fieldName: string;
  /** giá trị cột (board.columns[].column_name). */
  columns: string[];
  rows: Doc[];
  titleField?: string;
  onCardClick?: (row: Doc) => void;
  /** chuyển card sang cột khác (container mở dialog chip lý do rồi gọi adapter). */
  onMove?: (row: Doc, toColumn: string) => void;
}

export function KanbanView(props: KanbanViewProps) {
  const { fieldName, columns, rows, meta, onCardClick, onMove } = props;
  const titleField = props.titleField ?? meta.title_field ?? "name";
  const byColumn = new Map<string, Doc[]>();
  for (const c of columns) byColumn.set(c, []);
  for (const row of rows) {
    const col = String(row[fieldName] ?? "");
    if (byColumn.has(col)) byColumn.get(col)!.push(row);
  }

  return (
    <div className="mf-kanban flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const cards = byColumn.get(col) ?? [];
        return (
          <div key={col} className="mf-kanban-column flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
              <span className="truncate">{col || "—"}</span>
              <Badge variant="secondary" className="ml-auto">{cards.length}</Badge>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {cards.map((row) => (
                <div
                  key={String(row.name)}
                  className={cn("mf-kanban-card rounded-md border bg-card p-2.5 shadow-sm", onCardClick && "cursor-pointer hover:border-primary/40")}
                  onClick={onCardClick ? () => onCardClick(row) : undefined}
                >
                  <div className="text-sm font-medium">{String(row[titleField] ?? row.name)}</div>
                  {onMove ? (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <Select value={col} onValueChange={(v) => { if (v !== col) onMove(row, v); }}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              ))}
              {cards.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">—</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
