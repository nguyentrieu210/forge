/** @jsxImportSource react */
/**
 * KanbanView (M06, presentational) — board theo field Select/workflow_state.
 * Cột = board.columns; card nhóm theo doc[field_name]. Chuyển cột → onMove (container
 * gọi adapter.kanban.moveCard = update_order_for_single_card, §12). Kéo-thả dnd-kit = PHA 6.
 * Luật "chip lý do khi đổi cột" (M06) do container áp qua onMove (mở dialog trước khi gọi).
 */
import type { DocTypeMeta, Doc } from "@metaforge/core";
import { cn, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@metaforge/ui";

const BLANK_COLUMN = "__mf_blank_column__";

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
    if (!byColumn.has(col)) byColumn.set(col, []);
    byColumn.get(col)!.push(row);
  }
  const effectiveColumns = [...columns, ...[...byColumn.keys()].filter((column) => !columns.includes(column))];

  return (
    <div className="mf-kanban">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{rows.length} thẻ · {effectiveColumns.length} cột</span>
        {effectiveColumns.length > columns.length ? <Badge variant="outline">Có trạng thái ngoài cấu hình</Badge> : null}
      </div>
      <div className="mf-kanban-board flex gap-3 overflow-x-auto pb-2" tabIndex={0} aria-label="Bảng Kanban, cuộn ngang để xem thêm cột">
      {effectiveColumns.map((col) => {
        const cards = byColumn.get(col) ?? [];
        const unexpected = !columns.includes(col);
        return (
          <section key={col || "__blank__"} className={cn("mf-kanban-column flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40", unexpected && "border-amber-500/40")} aria-label={col || "Chưa phân loại"}>
            <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
              <span className="truncate">{col || "Chưa phân loại"}</span>
              {unexpected ? <Badge variant="outline" className="border-amber-500/40 text-[10px]">Ngoài cấu hình</Badge> : null}
              <Badge variant="secondary" className="ml-auto">{cards.length}</Badge>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {cards.map((row) => (
                <div
                  key={String(row.name)}
                  className={cn("mf-kanban-card rounded-md border bg-card p-2.5 shadow-sm", onCardClick && "cursor-pointer hover:border-primary/40")}
                  onClick={onCardClick ? () => onCardClick(row) : undefined}
                  onKeyDown={onCardClick ? (event) => { if (event.key === "Enter") { event.preventDefault(); onCardClick(row); } } : undefined}
                  tabIndex={onCardClick ? 0 : undefined}
                  role={onCardClick ? "button" : undefined}
                  aria-label={onCardClick ? `Mở ${String(row[titleField] ?? row.name)}` : undefined}
                >
                  <div className="text-sm font-medium">{String(row[titleField] ?? row.name)}</div>
                  {onMove ? (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <Select value={col || BLANK_COLUMN} onValueChange={(v) => { const target = v === BLANK_COLUMN ? "" : v; if (target !== col) onMove(row, target); }}>
                        <SelectTrigger className="h-7 text-xs" aria-label={`Chuyển ${String(row[titleField] ?? row.name)} sang cột`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {effectiveColumns.map((c) => <SelectItem key={c || "__blank__"} value={c || BLANK_COLUMN}>{c || "Chưa phân loại"}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              ))}
              {cards.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">—</div> : null}
            </div>
          </section>
        );
      })}
      </div>
    </div>
  );
}
