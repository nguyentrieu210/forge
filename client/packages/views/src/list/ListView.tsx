/** @jsxImportSource react */
/**
 * ListView (M04) — data-table CONTROLLED (state ở container/URL). Data-driven từ meta:
 * checkbox + STT + ảnh/tiêu đề(link) + cột in_list_view (status→badge, số→phải, ngày→format)
 * + sort header + selection + BulkActionBar + SummaryRow + pagination "X–Y / Z" + states VN.
 * Không fetch, không URL — chỉ nhận props + phát onStateChange. Toàn bộ UI qua @metaforge/ui.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, ArrowDown, ChevronsUpDown, ChevronDown, ChevronLeft, ChevronRight, Trash2, Download, Inbox, SearchX, AlertCircle, RefreshCw, Camera, Loader2 } from "lucide-react";
import type { DocTypeMeta, Doc, BoundFormatters } from "@metaforge/core";
import {
  Button, Badge, Checkbox, Skeleton, Separator, FileButton, cn, useT,
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@metaforge/ui";
import { deriveColumns, imageField, type ListColumn } from "./columns.js";
import { renderCell, RowAvatar, formatValue } from "./cells.js";
import { deriveStandardFilters, type ListState } from "./filters.js";
import { ListToolbar } from "./ListToolbar.js";
import { applyColumnOrder, clearColumnOrder, loadColumnOrder, moveColumn, saveColumnOrder } from "./column-order.js";
import { clampWidth, loadColumnWidths, saveColumnWidths, type ColumnWidths } from "./column-width.js";
import { usePullToRefresh } from "./pull-to-refresh.js";

export interface ListViewProps {
  meta: DocTypeMeta;
  rows: Doc[];
  total?: number;
  loading?: boolean;
  error?: string | null;
  state: ListState;
  onStateChange: (patch: Partial<ListState>) => void;
  hidden?: string[];
  onToggleColumn?: (fieldname: string) => void;
  onRowClick?: (row: Doc) => void;
  onCreate?: () => void;
  onRefresh?: () => void;
  onBulkDelete?: (names: string[]) => void;
  onExport?: (names: string[]) => void;
  title?: string;
  /** record đang mở ở cột giữa (split view) → highlight dòng. */
  activeRow?: string;
  /** bộ formatter locale (từ useLocaleFormat) — số/tiền/ngày theo boot sysdefaults. */
  fmt?: BoundFormatters;
  /** role user hiện tại — lọc cột KHÔNG đọc được (permlevel/masked_fields), P1-PERM-01. */
  roles?: string[];
  /** doctype::name → title đã resolve cho Link cells. */
  displayValues?: Record<string, string>;
  searchLink?: (doctype: string, text: string) => Promise<Array<{ value: string; description?: string }>>;
  /** Sửa nhanh một field ngay trên danh sách (Select). Không truyền ⇒ danh sách chỉ đọc. */
  onInlineUpdate?: (name: string, patch: Record<string, unknown>) => Promise<void>;
  /** Đổi ảnh của một dòng ngay từ avatar. Không truyền ⇒ avatar chỉ hiển thị. */
  onUploadImage?: (name: string, file: File) => Promise<void>;
}

const PAGE_SIZES = [20, 50, 100];

/**
 * Ô ĐẦU HÀNG đóng băng bên trái (như Excel): ô tick + số thứ tự nằm CHUNG MỘT cột.
 *
 * Vì sao gộp làm một thay vì hai cột dính cạnh nhau: cột thứ hai phải khai `left` bằng đúng bề
 * rộng cột thứ nhất — một CON SỐ PHỎNG ĐOÁN. Bề rộng thật còn phụ thuộc padding, cỡ chữ và thuật
 * toán dàn bảng, nên lệch vài pixel là hai cột hở ra hoặc đè lên nhau, và khi cuộn ngang thì
 * "nhảy". Gộp lại thì chỉ còn một mốc `left: 0` — không có gì để sai.
 *
 * Bảng kho thường 10+ cột nên phải cuộn ngang. Cuộn tới cột thứ tám mà ô tick và số thứ tự đã
 * trôi mất thì không biết đang ở dòng nào, cũng không tick chọn được.
 *
 * `bg-inherit` chứ không màu cố định: hàng đang chọn/đang mở có nền riêng; đặt màu cứng thì ô này
 * lạc tông giữa hàng được tô sáng.
 */
const STICKY_LEAD = "sticky left-0 z-20 bg-inherit shadow-[inset_-1px_0_0_var(--border)]";

/**
 * Bề rộng ô dính — khai ở HAI nơi và phải khớp nhau, nếu không vạch ngăn cách xê dịch.
 *
 * `LEAD_W` đặt trên `<col>`: có tác dụng ở `table-layout: fixed`.
 * `LEAD_INNER_W` ép bề rộng NỘI DUNG bên trong ô: có tác dụng ở `table-layout: auto`, nơi `<col>`
 * chỉ là gợi ý còn bề rộng thật co theo nội dung. Trước đây nội dung tự do nên ô co còn 62px ở
 * chế độ auto trong khi `<col>` khai 68px ⇒ vạch ngăn cách nhảy 6px ngay khi người dùng chạm vào
 * cột đầu tiên (chạm là bảng đổi sang fixed — xem seedWidths).
 *
 * 4.25rem = 68px; trừ padding `px-2` hai bên (16px) còn 3.25rem = 52px cho nội dung.
 */
const LEAD_W = "w-[4.25rem]";
const LEAD_INNER_W = "w-[3.25rem]";

export function ListView(props: ListViewProps) {
  const t = useT();
  const { meta, rows, state, onStateChange, onRowClick } = props;
  const hidden = props.hidden ?? [];
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

  // Độ giãn dòng — mật độ dữ liệu dày (vd danh sách hàng nghìn dòng) muốn dòng thấp hơn để thấy
  // nhiều hơn cùng lúc. Lưu 1 lựa chọn chung toàn app (không theo từng doctype) qua localStorage.
  const [density, setDensityState] = useState<"comfortable" | "compact">(() => {
    try { return localStorage.getItem("mf-list-density") === "compact" ? "compact" : "comfortable"; } catch { return "comfortable"; }
  });
  const setDensity = (d: "comfortable" | "compact") => {
    setDensityState(d);
    try { localStorage.setItem("mf-list-density", d); } catch { /* private mode */ }
  };
  const compact = density === "compact";

  // Thứ tự cột do người dùng kéo-thả (localStorage theo doctype). Đổi doctype ⇒ nạp lại đúng bộ của
  // doctype đó (ListView KHÔNG remount khi chỉ đổi meta nên phải đồng bộ bằng effect).
  const [colOrder, setColOrder] = useState<string[]>(() => loadColumnOrder(meta.name));
  useEffect(() => { setColOrder(loadColumnOrder(meta.name)); }, [meta.name]);

  // Bề rộng cột người dùng tự kéo — cùng cơ chế lưu theo doctype như thứ tự cột.
  const [colWidths, setColWidths] = useState<ColumnWidths>(() => loadColumnWidths(meta.name));
  useEffect(() => { setColWidths(loadColumnWidths(meta.name)); }, [meta.name]);
  const resizeColumn = (fieldname: string, px: number) => {
    setColWidths((prev) => {
      const next = { ...prev, [fieldname]: clampWidth(px) };
      saveColumnWidths(meta.name, next);
      return next;
    });
  };

  /**
   * ĐO bề rộng thật của MỌI cột ngay trước lần kéo đầu tiên.
   *
   * Vì sao bắt buộc: bảng mặc định chạy `table-layout: auto`, mà ở chế độ đó CSS cho phép trình
   * duyệt BỎ QUA width/min-width/max-width đặt trên ô — nó tự tính lại theo nội dung. Đây chính là
   * lý do kéo cột không hề nhúc nhích dù giá trị đã lưu đúng.
   *
   * Cách chữa là chuyển sang `table-layout: fixed`. Nhưng nếu chuyển khi chỉ MỘT cột có số đo thì
   * các cột còn lại (width auto) bị chia đều phần dư — cả bảng nhảy dựng lên ngay lúc người dùng
   * mới chạm vào một cột. Nên đo và chốt hiện trạng trước, rồi mới chuyển; người dùng chỉ thấy
   * đúng cái cột mình đang kéo thay đổi.
   */
  const headRowRef = useRef<HTMLTableRowElement>(null);
  const seedWidths = () => {
    const row = headRowRef.current;
    if (!row) return;
    const measured: ColumnWidths = {};
    row.querySelectorAll<HTMLTableCellElement>("th[data-col]").forEach((th) => {
      const f = th.dataset.col;
      // CỐ Ý bỏ qua cột tiêu đề: nó là cột CO GIÃN, giữ bề rộng tự động để hút hết chỗ thừa cho
      // bảng luôn phủ kín màn hình (xem chú thích ở <colgroup>). Đo và chốt cứng nó thì mọi cột
      // đều có số đo, không còn cột nào co giãn, và chỗ thừa dồn sang cột đệm — bảng hụt một
      // khoảng trắng to bên phải.
      if (f && f !== titleField) measured[f] = clampWidth(th.getBoundingClientRect().width);
    });
    setColWidths((prev) => {
      // Giá trị người dùng đã đặt trước đó THẮNG số vừa đo.
      const next = { ...measured, ...prev };
      saveColumnWidths(meta.name, next);
      return next;
    });
  };
  /**
   * Bấm đúp vào tay nắm ⇒ TỰ CĂN cột vừa khít nội dung (thói quen từ Excel).
   *
   * Đo `scrollWidth` của từng ô trong cột — ở table-layout:fixed nội dung bị cắt nên scrollWidth
   * chính là bề rộng THẬT mà nội dung cần. Chỉ đo các dòng ĐANG hiển thị (bảng có ảo hoá, dòng
   * ngoài viewport không tồn tại trong DOM) — đủ đúng cho việc căn theo thứ đang nhìn.
   */
  const autoFitColumn = (fieldname: string) => {
    const root = scrollRef.current;
    const head = headRowRef.current?.querySelector<HTMLElement>(`th[data-col="${CSS.escape(fieldname)}"]`);
    if (!root) return;
    let max = 0;
    // tiêu đề cũng phải vừa, nếu không tên cột bị cắt mất
    if (head) max = Math.max(max, head.scrollWidth);
    root.querySelectorAll<HTMLElement>(`td[data-col="${CSS.escape(fieldname)}"]`).forEach((td) => {
      max = Math.max(max, td.scrollWidth);
    });
    if (max <= 0) return;
    seedWidths();
    resizeColumn(fieldname, max + 26); // + padding hai bên và một chút thở
  };

  const hasWidths = Object.keys(colWidths).length > 0;

  const derivedColumns = useMemo(() => deriveColumns(meta, { roles: props.roles }), [meta, props.roles]);
  const allColumns = useMemo(() => applyColumnOrder(derivedColumns, colOrder), [derivedColumns, colOrder]);
  const columns = useMemo(() => allColumns.filter((c) => c.isTitle || !hiddenSet.has(c.fieldname)), [allColumns, hiddenSet]);

  /**
   * Cột TIÊU ĐỀ là cột CO GIÃN của bảng — nó nhận hết phần bề ngang còn thừa để bảng luôn phủ kín
   * màn hình. `titleFlex` = cột đó đang thật sự co giãn (người dùng CHƯA tự kéo riêng nó).
   */
  const titleField = useMemo(() => columns.find((c) => c.isTitle)?.fieldname, [columns]);
  const titleFlex = !titleField || colWidths[titleField] === undefined;

  // Kéo-thả header đổi thứ tự cột. Tính trên allColumns (gồm cả cột đang ẨN) để cột ẩn không bị mất
  // vị trí rồi nhảy xuống cuối khi bật hiện lại.
  const dragColRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const dropColumn = (target: string) => {
    const from = dragColRef.current;
    dragColRef.current = null;
    setDragOverCol(null);
    if (!from || from === target) return;
    const next = moveColumn(allColumns.map((c) => c.fieldname), from, target);
    setColOrder(next);
    saveColumnOrder(meta.name, next);
  };
  const moveColumnByKeyboard = (fieldname: string, offset: -1 | 1) => {
    const order = allColumns.map((c) => c.fieldname);
    const index = order.indexOf(fieldname);
    const target = order[index + offset];
    if (index < 0 || !target) return;
    const next = moveColumn(order, fieldname, target);
    setColOrder(next);
    saveColumnOrder(meta.name, next);
  };
  const resetColumnOrder = () => { clearColumnOrder(meta.name); setColOrder([]); };

  // Gom nhóm — CHỈ trên các dòng của TRANG hiện tại (server trả từng trang; gom "toàn bộ dataset"
  // sẽ cần aggregate phía server, việc khác hẳn). Nhãn nhóm nói rõ điều này để không hiểu nhầm là
  // tổng toàn bộ. Cột gom được = Select/Link/Check/trạng thái (giá trị rời rạc, hữu hạn).
  const [groupBy, setGroupByState] = useState<string>(() => {
    try { return localStorage.getItem(`mf-group-by:${meta.name}`) ?? ""; } catch { return ""; }
  });
  useEffect(() => {
    try { setGroupByState(localStorage.getItem(`mf-group-by:${meta.name}`) ?? ""); } catch { setGroupByState(""); }
  }, [meta.name]);
  const setGroupBy = (f: string) => {
    setGroupByState(f);
    setCollapsedGroups(new Set());
    try {
      if (f) localStorage.setItem(`mf-group-by:${meta.name}`, f);
      else localStorage.removeItem(`mf-group-by:${meta.name}`);
    } catch { /* private mode */ }
  };
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const groupableColumns = useMemo(
    () => allColumns.filter((c) => c.isStatus || c.fieldtype === "Select" || c.fieldtype === "Link" || c.fieldtype === "Check"),
    [allColumns],
  );
  const groupCol = groupBy ? allColumns.find((c) => c.fieldname === groupBy) : undefined;
  const groups = useMemo(() => {
    if (!groupCol) return null;
    const map = new Map<string, Array<{ row: Doc; index: number }>>();
    rows.forEach((row, index) => {
      const key = String(row[groupCol.fieldname] ?? "");
      let bucket = map.get(key);
      if (!bucket) { bucket = []; map.set(key, bucket); }
      bucket.push({ row, index });
    });
    // Giữ thứ tự xuất hiện ⇒ nhóm vẫn theo đúng sort người dùng đang chọn.
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  }, [rows, groupCol]);
  const standardFilters = useMemo(() => deriveStandardFilters(meta), [meta]);
  const imgField = useMemo(() => imageField(meta), [meta]);

  const total = props.total ?? rows.length;
  const pageStart = (state.page - 1) * state.pageSize;
  const selectedSet = new Set(state.selected);
  const pageNames = rows.map((r) => String(r.name));
  const allPageSelected = pageNames.length > 0 && pageNames.every((n) => selectedSet.has(n));

  function toggleRow(name: string) {
    const next = new Set(state.selected);
    next.has(name) ? next.delete(name) : next.add(name);
    onStateChange({ selected: [...next] });
  }
  function toggleAllPage() {
    const next = new Set(state.selected);
    if (allPageSelected) pageNames.forEach((n) => next.delete(n));
    else pageNames.forEach((n) => next.add(n));
    onStateChange({ selected: [...next] });
  }
  function toggleSort(field: string) {
    const [f, dir] = state.sort.split(":");
    const nextDir = f === field && dir === "asc" ? "desc" : f === field && dir === "desc" ? "" : "asc";
    onStateChange({ sort: nextDir ? `${field}:${nextDir}` : "" });
  }
  function toggleColumn(fieldname: string) {
    props.onToggleColumn?.(fieldname);
  }

  const sortField = state.sort.split(":")[0];
  const sortDir = state.sort.split(":")[1];
  const numericCols = columns.filter((c) => c.align === "right" && !c.isStatus);
  const totalCols = columns.length + 2; // ô đầu (tick+STT) + cột dữ liệu + cột đệm

  // ── Windowing (ảo hoá tbody) ────────────────────────────────────────────────
  // Khi NHIỀU dòng (>50) ta chỉ render các dòng trong viewport để nghìn dòng/trang
  // vẫn mượt. Giữ nguyên bảng ui: chèn 2 dòng "đệm" (spacer) có chiều cao = khoảng
  // trống phía trên/dưới nên thanh cuộn thật, header sticky & cột vẫn thẳng hàng.
  // Khi ≤50 dòng thì render thường để states/summary/skeleton không đổi.
  const scrollRef = useRef<HTMLDivElement>(null);
  const showRows = !props.error && !props.loading && rows.length > 0;
  // Đang gom nhóm thì KHÔNG ảo hoá: virtualizer đánh index phẳng liên tục, chèn dòng tiêu đề nhóm
  // vào giữa sẽ lệch chiều cao/vị trí. Trang tối đa 100 dòng nên render thẳng vẫn mượt.
  const virtualized = showRows && rows.length > 50 && !groups;
  const rowVirtualizer = useVirtualizer({
    count: virtualized ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (compact ? 32 : 40), // ước lượng cao 1 dòng (px); đo thực tế qua measureElement
    overscan: 8,
  });
  const pull = usePullToRefresh(scrollRef, props.onRefresh);
  const virtualItems = rowVirtualizer.getVirtualItems();
  const padTop = virtualItems.length ? virtualItems[0]!.start : 0;
  const padBottom = virtualItems.length ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1]!.end : 0;

  // Render 1 dòng dữ liệu — dùng chung cho bản thường & bản ảo hoá.
  // index = vị trí trong trang (0-based) → STT tuyệt đối = pageStart + index + 1.
  const renderDataRow = (row: Doc, index: number, measureRef?: (el: HTMLTableRowElement | null) => void) => {
    const name = String(row.name);
    const selected = selectedSet.has(name);
    const isActive = props.activeRow === name;
    return (
      <TableRow
        key={name}
        ref={measureRef}
        data-index={index}
        data-state={selected ? "selected" : undefined}
        className={cn(
          // `bg-card` để ô dính (bg-inherit) có nền che nội dung trôi qua bên dưới khi cuộn ngang.
          "cursor-pointer bg-card",
          // Run3: hàng đang mở = viền trái 2px primary + nền soft + đậm hơn (Frappe/Linear)
          isActive && "bg-accent font-medium shadow-[inset_2px_0_0_var(--primary)] hover:bg-accent",
        )}
        onClick={() => onRowClick?.(row)}
        onKeyDown={(event) => {
          if (!onRowClick || event.key !== "Enter") return;
          event.preventDefault();
          onRowClick(row);
        }}
        tabIndex={onRowClick ? 0 : undefined}
        aria-label={onRowClick ? `${t("common.open", "Mở")} ${name}` : undefined}
      >
        <TableCell className={cn("px-2", STICKY_LEAD, compact && "py-1")}>
          <span className={cn("flex items-center gap-1.5", LEAD_INNER_W)}>
            {/* stopPropagation chỉ ở CHECKBOX: bấm vào số thứ tự vẫn mở bản ghi như bấm cả hàng. */}
            <span onClick={(e) => e.stopPropagation()}>
              <Checkbox checked={selected} onCheckedChange={() => toggleRow(name)} aria-label={`${t("list.select_row")} ${name}`} />
            </span>
            <span className="flex-1 text-right text-xs tabular-nums text-muted-foreground">{pageStart + index + 1}</span>
          </span>
        </TableCell>
        {columns.map((c) => (
          <TableCell key={c.fieldname} data-col={c.fieldname} // Bề rộng do <colgroup> quyết định — không đặt w-full/w-px ở ô nữa, hai nguồn tranh nhau
                    // thì trình duyệt chọn theo luật riêng và kết quả không đoán được.
                    className={cn(c.align === "right" && "text-right", c.align === "center" && "text-center", compact && "py-1", !c.isTitle && "whitespace-nowrap")}>
            {c.isTitle
                    ? <TitleCell row={row} col={c} imgField={imgField} displayValues={props.displayValues} onUploadImage={props.onUploadImage} />
                    : c.fieldtype === "Link" && c.options
                      ? <LinkCell doctype={c.options} value={row[c.fieldname]} displayValues={props.displayValues} />
                      : c.inlineEditable && props.onInlineUpdate
                        ? <InlineSelectCell row={row} col={c} onUpdate={props.onInlineUpdate} />
                        : renderCell(row[c.fieldname], c, props.fmt)}
          </TableCell>
        ))}
        <TableCell aria-hidden className="p-0" />
      </TableRow>
    );
  };

  return (
    <div className="mf-list-view flex h-full flex-col overflow-hidden rounded-lg border bg-card">
      <ListToolbar
        doctype={meta.name}
        title={props.title ?? meta.name}
        state={state}
        onChange={onStateChange}
        standardFilters={standardFilters}
        columns={allColumns}
        hidden={hidden}
        onToggleColumn={toggleColumn}
        onCreate={props.onCreate}
        onRefresh={props.onRefresh}
        searchLink={props.searchLink}
        density={density}
        onDensityChange={setDensity}
        onResetColumnOrder={colOrder.length > 0 ? resetColumnOrder : undefined}
        groupBy={groupBy}
        groupableColumns={groupableColumns}
        onGroupByChange={setGroupBy}
      />

      {state.selected.length > 0 ? (
        <BulkActionBar
          count={state.selected.length}
          onClear={() => onStateChange({ selected: [] })}
          onDelete={props.onBulkDelete ? () => props.onBulkDelete!(state.selected) : undefined}
          onExport={props.onExport ? () => props.onExport!(state.selected) : undefined}
        />
      ) : null}

      {/* overscroll-contain: chặn trang phía sau cùng cuộn/nảy khi kéo hết danh sách (mobile). */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {pull.distance > 0 || pull.refreshing ? (
          <div
            className="flex items-center justify-center gap-2 overflow-hidden text-xs text-muted-foreground"
            style={{ height: pull.distance }}
            aria-live="polite"
          >
            <RefreshCw className={cn("size-4", pull.refreshing && "animate-spin")} />
            {pull.refreshing ? t("list.refreshing") : pull.armed ? t("list.release_to_refresh") : t("list.pull_to_refresh")}
          </div>
        ) : null}
        <div className="mf-list-mobile divide-y md:hidden">
          {props.error ? (
            <EmptyState
              icon={<AlertCircle className="text-destructive" />}
              title={t("common.error_generic")}
              desc={props.error}
              action={props.onRefresh ? <Button size="sm" onClick={props.onRefresh}><RefreshCw /> {t("common.retry", "Thử lại")}</Button> : undefined}
            />
          ) : props.loading ? (
            <div className="space-y-2 p-3">{Array.from({ length: Math.min(state.pageSize, 6) }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-lg" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyView state={state} onCreate={props.onCreate} onClear={() => onStateChange({ q: "", filters: {}, routeFilters: [], dateRange: undefined, page: 1 })} />
          ) : rows.map((row, index) => {
            const name = String(row.name);
            const selected = selectedSet.has(name);
            const titleCol = columns.find((column) => column.isTitle) ?? columns[0];
            const detailCols = columns.filter((column) => column.fieldname !== titleCol?.fieldname).slice(0, 4);
            return (
              <article
                key={name}
                className={cn("bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", props.activeRow === name && "bg-accent shadow-[inset_3px_0_0_var(--primary)]")}
                onClick={() => onRowClick?.(row)}
                onKeyDown={(event) => { if (onRowClick && event.key === "Enter") { event.preventDefault(); onRowClick(row); } }}
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick ? `${t("common.open", "Mở")} ${name}` : undefined}
              >
                <div className="flex items-start gap-3">
                  <span className="pt-1" onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={selected} onCheckedChange={() => toggleRow(name)} aria-label={`${t("list.select_row")} ${name}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {titleCol ? <TitleCell row={row} col={titleCol} imgField={imgField} displayValues={props.displayValues} onUploadImage={props.onUploadImage} /> : <span className="font-medium">{name}</span>}
                    {detailCols.length ? <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      {detailCols.map((column) => <div key={column.fieldname} className="min-w-0"><dt className="truncate text-muted-foreground">{column.label}</dt><dd className="mt-0.5 truncate font-medium">{column.fieldtype === "Link" && column.options ? <LinkCell doctype={column.options} value={row[column.fieldname]} displayValues={props.displayValues} /> : renderCell(row[column.fieldname], column, props.fmt)}</dd></div>)}
                    </dl> : null}
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">#{pageStart + index + 1}</span>
                </div>
              </article>
            );
          })}
        </div>
        {/* unwrapped: ListView đã tự có khung cuộn (`scrollRef`) để làm header dính + ảo hoá dòng;
            để Table bọc thêm một `overflow-auto` nữa sẽ thành 2 vùng cuộn lồng nhau (2 thanh cuộn,
            và `sticky` của thead neo vào khung TRONG nên không dính theo khung ngoài). */}
        {/* `fixed` chỉ bật SAU khi có số đo — xem seedWidths(). Ở `auto`, bề rộng đặt trên ô bị
            trình duyệt bỏ qua nên kéo cột không có tác dụng gì. */}
        <Table
          unwrapped
          style={hasWidths ? { tableLayout: "fixed" } : undefined}
          // Ở table-layout:fixed, nội dung dài KHÔNG nới ô ra nữa mà TRÀN đè lên cột bên
          // cạnh. Phải tự cắt, nếu không kéo cột hẹp lại là chữ chồng lên nhau.
          className={cn("max-md:hidden", hasWidths && "[&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:whitespace-nowrap")}
        >
          {/*
            colgroup — cách DUY NHẤT ép cứng bề rộng cột ở cả `table-layout: auto` lẫn `fixed`.
            Đặt width bằng class trên <th> chỉ là GỢI Ý: ở chế độ auto trình duyệt được phép tính
            lại theo nội dung, nên cột tick và cột STT vẫn phình ra theo bảng.
            Hai cột này không chứa dữ liệu người dùng nên không có gì để nới — chốt cứng luôn.
          */}
          <colgroup>
            {/* Một cột duy nhất cho ô đầu (tick + STT). w-[4.25rem] vừa đủ cho ô tick 16px,
                khoảng cách 6px, số 2 chữ số và padding hai bên. */}
            <col className={LEAD_W} />
            {columns.map((c) => (
              <col
                key={c.fieldname}
                style={
                  colWidths[c.fieldname]
                    ? { width: colWidths[c.fieldname] }
                    // Cột TIÊU ĐỀ là chỗ "nuốt" phần bề ngang còn thừa, nhưng cách nuốt khác nhau
                    // theo chế độ dàn bảng:
                    //   auto  → `width: 100%` (ở auto, cột không khai gì sẽ co theo nội dung nên
                    //           phải nói rõ cột nào giành phần thừa; nếu không trình duyệt chia
                    //           đều cho mọi cột, kể cả cột đã khai cứng như ô dính).
                    //   fixed → để TRỐNG (auto). Ở fixed, phần thừa dồn hết vào cột nào không khai
                    //           bề rộng; khai `100%` ở đây lại thành 100% bề ngang bảng, cộng với
                    //           các cột khác là vượt quá và trình duyệt co tất cả lại.
                    : c.isTitle && !hasWidths ? { width: "100%" } : undefined
                }
              />
            ))}
            {/*
              CỘT ĐỆM — lưới an toàn cho ô dính, và chỉ bật khi thật sự cần.

              Ở `table-layout: fixed`, khi TỔNG bề rộng các cột nhỏ hơn bề ngang bảng thì trình
              duyệt đem phần dư chia cho MỌI cột — kể cả cột đã khai cứng. Đo được: kéo hẹp hết các
              cột thì ô dính tự phồng từ 68px lên 185px, vạch ngăn cách chạy theo. Nhưng nếu CÒN
              một cột để bề rộng tự động thì phần dư dồn hết vào đúng cột đó.

              Bình thường cột nhận phần dư đó phải là cột TIÊU ĐỀ (`titleFlex`) — chỗ thừa biến
              thành chỗ đọc tên hàng, và bảng phủ kín màn hình. Khi ấy cột đệm phải rộng 0, nếu
              không trình duyệt thấy HAI cột tự động và chia đôi phần dư, để lại một mảng trắng to
              bên phải (đúng lỗi đã gặp).

              Chỉ khi người dùng tự kéo luôn cả cột tiêu đề thì mới không còn cột co giãn nào; lúc
              đó cột đệm mới nhận phần dư để ô dính khỏi phồng. Khoảng trắng bên phải khi ấy là hệ
              quả trực tiếp của việc người dùng tự chốt bề rộng mọi cột — giống hệt Excel.
            */}
            <col className={titleFlex ? "w-0" : undefined} />
          </colgroup>
          <TableHeader className="sticky top-0 z-10">
            <TableRow ref={headRowRef} className="hover:bg-transparent">
              {/* Cột tick và cột STT CỐ ĐỊNH, không kéo được: chúng không chứa dữ liệu người dùng
                  nên không có gì để nới rộng. `w-10`/`w-12` là đủ — dưới table-layout:fixed thì
                  width từ class được tôn trọng, không cần inline style. */}
              <TableHead className={cn("bg-card px-2", STICKY_LEAD, "z-30", compact && "h-7")}>
                <span className={cn("flex items-center gap-1.5", LEAD_INNER_W)}>
                  <Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} aria-label={t("list.select_all_page")} />
                  <span className="flex-1 text-right tabular-nums">#</span>
                </span>
              </TableHead>
              {columns.map((c) => (
                <SortHeader
                  key={c.fieldname}
                  col={c}
                  active={sortField === c.fieldname}
                  dir={sortDir}
                  onClick={() => toggleSort(c.fieldname)}
                  compact={compact}
                  dragOver={dragOverCol === c.fieldname}
                  onDragStart={() => { dragColRef.current = c.fieldname; }}
                  onDragOverCol={() => setDragOverCol(c.fieldname)}
                  onDragLeaveCol={() => setDragOverCol((f) => (f === c.fieldname ? null : f))}
                  onDropCol={() => dropColumn(c.fieldname)}
                  width={colWidths[c.fieldname]}
                  onResizeStart={seedWidths}
                  onAutoFit={() => autoFitColumn(c.fieldname)}
                  onResize={(px) => resizeColumn(c.fieldname, px)}
                  onMoveLeft={() => moveColumnByKeyboard(c.fieldname, -1)}
                  onMoveRight={() => moveColumnByKeyboard(c.fieldname, 1)}
                />
              ))}
              {/* ô của cột đệm — xem chú thích ở <colgroup> */}
              <TableHead aria-hidden className={cn("bg-card p-0", compact && "h-7")} />
            </TableRow>
          </TableHeader>

          <TableBody>
            {props.error ? (
              <StateRow span={totalCols}>
                <EmptyState icon={<AlertCircle className="text-destructive" />} title={t("common.error_generic")} desc={props.error} action={props.onRefresh ? <Button size="sm" onClick={props.onRefresh}><RefreshCw /> {t("common.retry", "Thử lại")}</Button> : undefined} />
              </StateRow>
            ) : props.loading ? (
              <SkeletonRows cols={totalCols} rows={Math.min(state.pageSize, 8)} />
            ) : rows.length === 0 ? (
              <StateRow span={totalCols}>
                <EmptyView state={state} onCreate={props.onCreate} onClear={() => onStateChange({ q: "", filters: {}, routeFilters: [], dateRange: undefined, page: 1 })} />
              </StateRow>
            ) : virtualized ? (
              <>
                {/* dòng đệm TRÊN: chiếm chỗ các dòng phía trên viewport */}
                {padTop > 0 ? (
                  <TableRow className="hover:bg-transparent" aria-hidden>
                    <TableCell colSpan={totalCols} className="p-0" style={{ height: padTop }} />
                  </TableRow>
                ) : null}
                {virtualItems.map((vi) => renderDataRow(rows[vi.index]!, vi.index, rowVirtualizer.measureElement))}
                {/* dòng đệm DƯỚI */}
                {padBottom > 0 ? (
                  <TableRow className="hover:bg-transparent" aria-hidden>
                    <TableCell colSpan={totalCols} className="p-0" style={{ height: padBottom }} />
                  </TableRow>
                ) : null}
              </>
            ) : groups ? (
              groups.map((g) => {
                const collapsed = collapsedGroups.has(g.key);
                return (
                  <Fragment key={g.key || "__blank__"}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={totalCols} className={cn("py-1.5", compact && "py-1")}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1.5 px-1.5 font-medium"
                          aria-expanded={!collapsed}
                          onClick={() => setCollapsedGroups((prev) => {
                            const next = new Set(prev);
                            next.has(g.key) ? next.delete(g.key) : next.add(g.key);
                            return next;
                          })}
                        >
                          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          <span className="truncate">{groupLabel(g.key, groupCol!, props.displayValues, t)}</span>
                          <Badge variant="secondary" className="ml-1 font-normal">{g.items.length}</Badge>
                        </Button>
                      </TableCell>
                    </TableRow>
                    {collapsed ? null : g.items.map((it) => renderDataRow(it.row, it.index))}
                  </Fragment>
                );
              })
            ) : (
              rows.map((row, i) => renderDataRow(row, i))
            )}
          </TableBody>

          {numericCols.length > 0 && rows.length > 0 ? (
            <TableFooter>
              {/* Hàng tổng cũng phải có ĐÚNG số ô như các hàng khác, nếu không cột lệch hẳn một
                  nhịp và mọi con số tổng rơi sai cột. */}
              <TableRow className="bg-card hover:bg-transparent">
                <TableCell className={cn("px-2 text-right text-xs text-muted-foreground", STICKY_LEAD)} title="Tổng hợp trên trang hiện tại">Σ trang</TableCell>
                {columns.map((c) => (
                  <TableCell key={c.fieldname} className={cn(c.align === "right" && "text-right tabular-nums")}>
                    {c.align === "right" && !c.isStatus ? formatValue(aggregateColumn(rows, c), c) : null}
                  </TableCell>
                ))}
                <TableCell aria-hidden className="p-0" />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>

      <PaginationBar
        total={total}
        page={state.page}
        pageSize={state.pageSize}
        shown={rows.length}
        loading={props.loading}
        onPage={(page) => onStateChange({ page })}
        onPageSize={(pageSize) => onStateChange({ pageSize })}
      />
    </div>
  );
}

// ── Title cell (avatar + link) ────────────────────────────────────────────────
function TitleCell({ row, col, imgField, displayValues, onUploadImage }: { row: Doc; col: ListColumn; imgField?: string; displayValues?: Record<string, string>; onUploadImage?: (name: string, file: File) => Promise<void> }) {
  const t = useT();
  const raw = col.fieldname === "name" ? String(row.name) : String(row[col.fieldname] ?? row.name ?? "");
  const text = col.fieldtype === "Link" && col.options ? (displayValues?.[`${col.options}::${raw}`] ?? raw) : raw;
  const src = imgField ? (row[imgField] as string | undefined) : undefined;
  // Nhiều doctype có title_field TRÙNG NHAU giữa các bản ghi — vd Warehouse: `warehouse_name` của
  // "Nhận hàng APH - APH" và "Nhận hàng VH - VH" đều chỉ là "Nhận hàng", nên danh sách trông như
  // một bản ghi lặp lại 4 lần. Hiện thêm mã thật (`name`) ở dòng phụ khi nó khác tiêu đề.
  const id = String(row.name ?? "");
  const showId = Boolean(id) && id !== text;
  return (
    <div className="flex items-center gap-2.5">
      {imgField ? (
        onUploadImage
          ? <AvatarUpload name={id} src={src} alt={text} onUpload={onUploadImage} />
          : <RowAvatar src={src} alt={text} />
      ) : null}
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground hover:text-primary hover:underline">{text || t("list.untitled", "(không tên)")}</span>
        {showId ? <span className="truncate text-[11px] text-muted-foreground">{id}</span> : null}
      </span>
    </div>
  );
}


function LinkCell({ doctype, value, displayValues }: { doctype: string; value: unknown; displayValues?: Record<string, string> }) {
  if (value == null || value === "") return <span className="text-muted-foreground/60">—</span>;
  const name = String(value);
  const label = displayValues?.[`${doctype}::${name}`] ?? name;
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium">{label}</span>
      {label !== name ? <span className="block truncate text-[11px] text-muted-foreground">{name}</span> : null}
    </span>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────
function SortHeader({
  col, active, dir, onClick, compact, dragOver, onDragStart, onDragOverCol, onDragLeaveCol, onDropCol,
  width, onResize, onResizeStart, onAutoFit, onMoveLeft, onMoveRight,
}: {
  col: ListColumn; active: boolean; dir?: string; onClick: () => void; compact?: boolean;
  dragOver?: boolean;
  onDragStart?: () => void;
  onDragOverCol?: () => void;
  onDragLeaveCol?: () => void;
  onDropCol?: () => void;
  /** bề rộng người dùng đã kéo (px); không có ⇒ để bảng tự tính. */
  width?: number;
  onResize?: (px: number) => void;
  /** gọi TRƯỚC khi bắt đầu kéo — để ListView chốt bề rộng hiện tại của mọi cột. */
  onResizeStart?: () => void;
  /** bấm đúp tay nắm ⇒ tự căn vừa nội dung (như Excel). */
  onAutoFit?: () => void;
  /** Alt + mũi tên đổi thứ tự cột mà không cần chuột. */
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  const thRef = useRef<HTMLTableCellElement>(null);
  /**
   * Đang kéo giãn ⇒ TẮT `draggable` của ô tiêu đề.
   *
   * TableHead bật `draggable` để đổi THỨ TỰ cột. Khi bấm vào tay nắm rồi rê, trình duyệt khởi động
   * kéo-thả GỐC của HTML từ ô tiêu đề đó và nuốt luôn chuỗi pointer event — cột không giãn được
   * chút nào, mà lại hiện bóng "đang kéo cột đi chỗ khác". `preventDefault` trên pointerdown KHÔNG
   * chặn được `dragstart`; cách chắc chắn là gỡ hẳn thuộc tính draggable trong lúc kéo giãn.
   */
  const [resizing, setResizing] = useState(false);

  /**
   * Kéo mép phải để đổi bề rộng cột.
   *
   * Dùng Pointer Events (không phải mouse): một API chạy chung cho chuột, bút và cảm ứng, và
   * `setPointerCapture` giữ được luồng sự kiện kể cả khi con trỏ vọt ra ngoài phần tử — kéo nhanh
   * mà không capture thì cột "kẹt" giữa chừng vì trình duyệt gửi sự kiện cho phần tử khác.
   */
  const startResize = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!onResize) return;
    // Chặn nổi bọt lên TableHead: nếu không, trình duyệt hiểu là bắt đầu KÉO-THẢ ĐỔI THỨ TỰ CỘT
    // (TableHead có draggable) và người dùng vừa đổi bề rộng vừa vô tình đổi luôn vị trí cột.
    e.preventDefault();
    e.stopPropagation();
    // Đo & chốt hiện trạng TRƯỚC, rồi mới lấy mốc — nếu không, việc chuyển sang table-layout:fixed
    // xảy ra giữa chừng và số đo mốc thành ra của bố cục cũ.
    onResizeStart?.();
    const startX = e.clientX;
    const startW = thRef.current?.getBoundingClientRect().width ?? 0;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setResizing(true);
    const move = (ev: PointerEvent) => onResize(startW + (ev.clientX - startX));
    const up = () => {
      setResizing(false);
      try { el.releasePointerCapture(e.pointerId); } catch { /* con trỏ đã nhả */ }
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up); // nhả chuột ngoài cửa sổ / cắm rút thiết bị
  };

  return (
    <TableHead
      ref={thRef}
      data-col={col.fieldname}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
      draggable={Boolean(onDropCol) && !resizing}
      onDragStart={(e) => {
        // setData bắt buộc để Firefox chịu bắt đầu kéo; giá trị thực đọc qua ref (an toàn hơn với
        // dữ liệu người dùng có thể kéo từ ngoài trình duyệt vào).
        e.dataTransfer.setData("text/plain", col.fieldname);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragOver={(e) => { if (!onDropCol) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOverCol?.(); }}
      onDragLeave={() => onDragLeaveCol?.()}
      onDrop={(e) => { if (!onDropCol) return; e.preventDefault(); onDropCol(); }}
      className={cn(
        col.align === "right" && "text-right",
        col.align === "center" && "text-center",
        compact && "h-7",
        // Cột tiêu đề nuốt hết phần dư, các cột khác co sát nội dung. Trước đây mọi cột chia đều
        // bề ngang nên bảng ít cột bị kéo dãn, chữ nằm rời rạc cách nhau cả gang tay.
        // Bề rộng do người dùng đặt thì THẮNG các lớp co/giãn tự động ở trên.
        "whitespace-nowrap",
        "group/th relative",
        onDropCol && "cursor-grab active:cursor-grabbing",
        dragOver && "bg-accent shadow-[inset_2px_0_0_var(--primary)]",
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        onKeyDown={(event) => {
          if (!event.altKey) return;
          if (event.key === "ArrowLeft") { event.preventDefault(); onMoveLeft?.(); }
          if (event.key === "ArrowRight") { event.preventDefault(); onMoveRight?.(); }
        }}
        title="Sắp xếp; Alt + ←/→ để đổi vị trí cột"
        className={cn("-ml-2 h-7 max-w-full gap-1 truncate px-2 font-medium data-[active=true]:text-foreground", col.align === "right" && "ml-0")}
        data-active={active}
      >
        <span className="truncate">{col.label}</span>
        <Icon className={cn("size-3.5 shrink-0", active ? "opacity-100" : "opacity-40")} />
      </Button>
      {onResize ? (
        <span
          onPointerDown={startResize}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onAutoFit?.(); }}
          onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
          draggable={false}
          // Vùng BẮT rộng 12px (mép 1px gần như không trúng được bằng chuột), nhưng phần NHÌN THẤY
          // chỉ là một vạch mảnh — to hơn sẽ thành đường kẻ dày chia cắt bảng, rối mắt.
          className="group/grip absolute right-0 top-0 z-20 flex h-full w-3 translate-x-1/2 cursor-col-resize touch-none items-center justify-center"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Đổi bề rộng cột ${col.label}`}
          aria-valuemin={72}
          aria-valuemax={720}
          aria-valuenow={Math.round(width ?? thRef.current?.getBoundingClientRect().width ?? 0)}
          tabIndex={0}
          onKeyDown={(event) => {
            if (!onResize) return;
            const current = width ?? thRef.current?.getBoundingClientRect().width ?? 120;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              onResizeStart?.();
              onResize(current + (event.key === "ArrowRight" ? 12 : -12));
            } else if (event.key === "Enter") {
              event.preventDefault();
              onAutoFit?.();
            }
          }}
        >
          {/* Ba trạng thái:
              - bình thường: vạch xám luôn thấy ⇒ người dùng BIẾT là kéo được (trước đây ẩn hẳn
                nên không ai đoán ra có tính năng này)
              - rê vào cột: vạch đậm và cao lên
              - rê đúng tay nắm: vạch dày, màu chủ đạo, cao hết ô + hiện bảng hướng dẫn */}
          <span
            className={cn(
              "w-px rounded-full transition-all",
              "h-4 bg-border",
              "group-hover/th:h-5 group-hover/th:bg-muted-foreground/60",
              "group-hover/grip:h-full group-hover/grip:w-[3px] group-hover/grip:bg-primary",
              resizing && "h-full w-[3px] bg-primary",
            )}
          />
          {/* Hướng dẫn bật lên khi rê vào tay nắm. Kéo-để-đổi-rộng thì đoán được, nhưng
              BẤM ĐÚP để tự căn thì không ai đoán ra nếu không nói. */}
          {!resizing ? (
            <span className="pointer-events-none absolute top-full z-30 mt-1 hidden whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[11px] leading-tight text-popover-foreground shadow-md group-hover/grip:block">
              Kéo để đổi bề rộng
              <span className="block text-muted-foreground">Bấm đúp: tự căn vừa nội dung</span>
            </span>
          ) : null}
        </span>
      ) : null}
    </TableHead>
  );
}

// ── Bulk bar ──────────────────────────────────────────────────────────────────
function BulkActionBar({ count, onClear, onDelete, onExport }: { count: number; onClear: () => void; onDelete?: () => void; onExport?: () => void }) {
  const t = useT();
  return (
    <div className="mf-bulk-bar flex items-center gap-2 border-b bg-accent/50 px-3 py-2 text-sm">
      <Badge variant="secondary">{count} {t("list.selected_count")}</Badge>
      <Separator orientation="vertical" className="h-5" />
      {onExport ? (
        <Button variant="ghost" size="sm" onClick={onExport}>
          <Download /> {t("list.export")}
        </Button>
      ) : null}
      {onDelete ? (
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 /> {t("common.delete")}
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={onClear}>
        {t("list.clear_selection")}
      </Button>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function PaginationBar({
  total, page, pageSize, shown, loading, onPage, onPageSize,
}: { total: number; page: number; pageSize: number; shown: number; loading?: boolean; onPage: (p: number) => void; onPageSize: (s: number) => void }) {
  const t = useT();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + shown;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center gap-3 border-t bg-card px-3 py-2 text-sm">
      <span className="tabular-nums text-muted-foreground">
        {loading ? t("common.loading") : <><span className="font-medium text-foreground">{from}–{to}</span> / {total}</>}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">{t("list.rows_per_page", "Dòng mỗi trang")}</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[4.5rem]" aria-label={t("list.rows_per_page", "Dòng mỗi trang")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("list.prev_page", "Trang trước")}>
            <ChevronLeft />
          </Button>
          <span className="min-w-[4.5rem] text-center tabular-nums text-muted-foreground">{page} / {pageCount}</span>
          <Button variant="outline" size="icon-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label={t("list.next_page", "Trang sau")}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── States ────────────────────────────────────────────────────────────────────
function StateRow({ span, children }: { span: number; children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={span} className="h-64 p-0">{children}</TableCell>
    </TableRow>
  );
}

function EmptyView({ state, onCreate, onClear }: { state: ListState; onCreate?: () => void; onClear?: () => void }) {
  const t = useT();
  if (state.q.trim()) return <EmptyState icon={<SearchX />} title={t("list.no_results")} desc={`${t("list.no_results_for")} "${state.q}".`} action={onClear ? <Button size="sm" variant="outline" onClick={onClear}>{t("list.clear_filters")}</Button> : undefined} />;
  if (Object.values(state.filters).some(Boolean) || state.routeFilters.length > 0 || state.dateRange) return <EmptyState icon={<SearchX />} title={t("list.no_filter_match")} desc={t("list.no_filter_match_hint")} action={onClear ? <Button size="sm" variant="outline" onClick={onClear}>{t("list.clear_filters")}</Button> : undefined} />;
  return (
    <EmptyState
      icon={<Inbox />}
      title={t("list.empty_title")}
      desc={t("list.empty_hint")}
      action={onCreate ? <Button size="sm" onClick={onCreate}>{t("common.create")}</Button> : undefined}
    />
  );
}

function EmptyState({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="mf-empty-state flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="mf-empty-state-icon grid size-11 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon}</div>
      <div className="font-medium">{title}</div>
      {desc ? <div className="max-w-sm text-sm text-muted-foreground">{desc}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

function SkeletonRows({ cols, rows }: { cols: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r} className="hover:bg-transparent">
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className={cn("h-4", c === 0 ? "w-4" : c === 2 ? "w-40" : "w-16")} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function aggregateColumn(rows: Doc[], column: ListColumn): number {
  const total = rows.reduce((acc, row) => acc + (Number(row[column.fieldname]) || 0), 0);
  return column.fieldtype === "Percent" && rows.length ? total / rows.length : total;
}

/** Nhãn hiển thị của 1 nhóm — Link thì đổi sang title đã resolve, Check thì Có/Không, rỗng thì "(trống)". */
function groupLabel(
  key: string,
  col: ListColumn,
  displayValues: Record<string, string> | undefined,
  t: (k: string, f?: string) => string,
): string {
  if (col.fieldtype === "Check") return key === "1" ? t("cell.yes") : t("cell.no");
  if (key === "") return t("list.group_blank");
  if (col.fieldtype === "Link" && col.options) return displayValues?.[`${col.options}::${key}`] ?? key;
  return key;
}


/**
 * Đổi ảnh của một dòng NGAY TỪ avatar trên danh sách.
 *
 * Vì sao: khai ảnh cho 40 mặt hàng theo đường cũ là mở form → tìm ô Ảnh → chọn tệp → lưu → quay
 * lại danh sách, nhân 40 lần. Bấm thẳng vào avatar rút còn hai thao tác.
 */
function AvatarUpload({ name, src, alt, onUpload }: {
  name: string;
  src?: string;
  alt: string;
  onUpload: (name: string, file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <FileButton
      accept="image/*"
      disabled={busy}
      variant="ghost"
      // Chặn nổi bọt lên HÀNG (hàng có onClick mở bản ghi) nhưng KHÔNG preventDefault —
      // FileButton chỉ bỏ qua việc mở hộp chọn tệp khi sự kiện bị preventDefault.
      onClick={(e) => e.stopPropagation()}
      title="Bấm để đổi ảnh"
      className="group/av relative size-7 shrink-0 p-0 hover:bg-transparent"
      onFiles={async (files) => {
        const f = files?.[0];
        if (!f) return;
        setBusy(true);
        try { await onUpload(name, f); } finally { setBusy(false); }
      }}
    >
      <RowAvatar src={src} alt={alt} />
      <span className="absolute inset-0 grid place-items-center rounded-md bg-black/45 opacity-0 transition-opacity group-hover/av:opacity-100">
        {busy ? <Loader2 className="size-3.5 animate-spin text-white" /> : <Camera className="size-3.5 text-white" />}
      </span>
    </FileButton>
  );
}

/**
 * Sửa nhanh một field Select ngay trên danh sách.
 *
 * Chỉ mở cho Select KHÔNG read-only và KHÔNG phải `status`/`workflow_state` (xem ListColumn):
 * trạng thái chứng từ do ERPNext tự tính từ docstatus và tiến độ giao nhận — ghi đè tay sẽ làm
 * trạng thái nói một đằng, sổ kho một nẻo.
 */
function InlineSelectCell({ row, col, onUpdate }: {
  row: Doc;
  col: ListColumn;
  onUpdate: (name: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const value = String(row[col.fieldname] ?? "");
  const options = (col.options ?? "").split(String.fromCharCode(10)).filter(Boolean);
  const labelOf = (o: string) => col.optionLabels?.[o] ?? o;

  if (!options.length) return renderCell(row[col.fieldname], col);

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Select
        value={value || undefined}
        disabled={busy}
        onValueChange={async (v) => {
          if (v === value) return;
          setBusy(true);
          try { await onUpdate(String(row.name), { [col.fieldname]: v }); } finally { setBusy(false); }
        }}
      >
        <SelectTrigger className="h-7 w-auto min-w-[7rem] border-transparent px-2 text-[13px] hover:border-input">
          {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{labelOf(o)}</SelectItem>)}
        </SelectContent>
      </Select>
    </span>
  );
}
