/** @jsxImportSource react */
/**
 * Panel "Định mức có áp được không" + "Định mức thực tế".
 *
 * ── Vì sao panel này tồn tại ─────────────────────────────────────────────────────────────────
 * Bảng cấu phần bên cạnh chỉ vẽ được thứ ĐÃ chụp lên lệnh. Nó không trả lời được câu hỏi
 * "vì sao định mức KHÔNG áp được cho bộ cửa này". Câu trả lời đó nằm ở
 * `alumdoor.sales.preview_bom_requirements` — method đã tính đủ và trả về `reason`,
 * `pending_fields`, `quantity_error`, `uom_warning`, `sales_uom_message`.
 *
 * docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md §2 gọi đúng tên loại hỏng này: luật đã
 * chạy đủ ở server nhưng kết quả không tới người dùng, nên trông như "tính năng chưa làm". Panel
 * này là đường đi của những lý do đó tới màn.
 *
 * ── Vì sao ô "Định mức thực tế" ở đây KHÔNG sửa được ─────────────────────────────────────────
 * `bom_actual_components` là trường của **Sales Order Item** (brief `alumdoor-v2.json`), được
 * mang sang `Production Request Item` rồi chụp vào `Work Order.formula_snapshot`. **Work Order
 * không có ô nào để lưu nó.** Không có method server nào nhận "ghi định mức thực tế cho một
 * Work Order".
 *
 * Nên panel dùng lại `AlumdoorBomActualEditor` ở chế độ **chỉ đọc**: hiện đúng thứ đã chốt và
 * slot nào còn thiếu, kèm đường nhảy về chứng từ nguồn để sửa. Dựng một nút "Lưu" gọi method
 * không tồn tại là điều `skills/forge-ui-change-routing/SKILL.md` §4.6 cấm thẳng.
 */
import { AlertTriangle, ExternalLink, Info, Loader2, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@metaforge/ui";
import {
  AlumdoorBomActualEditor,
  type BomActualComponentRow,
  type BomActualRequirement,
} from "../AlumdoorBomActualEditor.js";
import {
  numberValue,
  quantity,
  text,
  type BomRequirementComponent,
  type BomRequirementPreview,
  type WorkOrderActualComponent,
} from "./model.js";

function normalizeRequirements(rows: BomRequirementPreview["actual_requirements"]): BomActualRequirement[] {
  return (rows ?? [])
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      component_key: text(row.component_key),
      allowed_item_codes: (row.allowed_item_codes ?? []).map((value) => text(value)).filter(Boolean),
      provided_item_codes: (row.provided_item_codes ?? []).map((value) => text(value)).filter(Boolean),
      provided_rows: numberValue(row.provided_rows) ?? 0,
      missing: row.missing === true,
    }))
    .filter((row) => Boolean(row.component_key));
}

function normalizeActualRows(rows: WorkOrderActualComponent[]): BomActualComponentRow[] {
  return rows
    .filter((row): row is WorkOrderActualComponent => Boolean(row))
    .map((row) => {
      const base: BomActualComponentRow = {
        component_key: text(row.component_key),
        item_code: text(row.item_code),
        qty: numberValue(row.qty) ?? 0,
      };
      const sourceRow = numberValue(row.source_row);
      const note = text(row.note);
      return {
        ...base,
        ...(sourceRow === undefined ? {} : { source_row: sourceRow }),
        ...(note ? { note } : {}),
      };
    })
    .filter((row) => Boolean(row.component_key) && Boolean(row.item_code));
}

/**
 * Một dòng cấu kiện đọc theo NGÔN NGỮ XƯỞNG.
 *
 * Câu hỏi thợ hỏi khi cầm tờ lệnh là: *lấy bao nhiêu cây? bao nhiêu lá? cắt mỗi cây dài bao nhiêu?*
 * Bảng nào không trả lời ngay được ba câu đó thì chưa đạt. Trước 24/08/2026 khối này in
 * `row.qty` + `row.uom` — tức TIÊU HAO KHO — nên hai cây ray hiện thành "5,8 Mét" và tấm tôn hiện
 * "8,91 m2": đúng số cho kế toán kho, vô nghĩa với người đứng máy cắt.
 */
interface CauKienDong {
  key: string;
  ten: string;
  /** `undefined` = server KHÔNG nói được số cấu kiện. Phải hiện "?" đỏ, tuyệt đối không lùi về 1. */
  soLuong: number | undefined;
  dvt: string;
  daiMoiCai: string;
  tong: string;
  ghiChu: string;
  phu: string;
}

function docCauKien(row: BomRequirementComponent, index: number): CauKienDong {
  /*
   * SL/ĐVT lấy từ lớp cấu kiện vật lý, KHÔNG lấy từ `qty`/`uom`.
   *
   * `component_count === null` là câu trả lời có nghĩa của server ("đã thử tính, chưa ra") — khác
   * hẳn `undefined` (dòng không có lớp cấu kiện nào). Cả hai đều phải ra "?" chứ không ra 1, vì một
   * dòng lá ghi "1" là nói dối thợ. `numberValue(null)` trả 0 nên bắt buộc chặn `null` trước.
   */
  const soLuong = row.component_count === null ? undefined : numberValue(row.component_count);
  const cutEach = numberValue(row.cut_length_each_m);

  /*
   * Cột "Tổng" là chỗ DUY NHẤT Kg/Mét/m² được xuất hiện. `stock_consumption_qty` là số chuẩn;
   * `qty`/`uom` chỉ là projection tương thích ngược của CHÍNH đại lượng đó (xem chú thích
   * `sales-production-core.ts:371-375`), nên lùi về nó không phải là đoán — là đọc cùng một con số
   * dưới tên cũ. Dòng chưa map Quy tắc BOM chỉ còn `qty`, bỏ luôn thì mất cả số dự trù.
   */
  const tongSo = numberValue(row.stock_consumption_qty) ?? numberValue(row.qty ?? undefined);
  const tongDvt = text(row.stock_consumption_uom) || text(row.uom) || text(row.stock_uom);

  /*
   * Ghi chú gộp cả ba nguồn lý do. `bom_rule_warning` ("Chưa map Quy tắc BOM cho X" —
   * `bom-rule-sales-preview.ts:459`) là CẢNH BÁO THIẾU CẤU HÌNH, không phải `note` kỹ thuật nội bộ,
   * nên nó phải ra màn. Khi không có số mà cũng không có lý do nào thì vẫn phải nói ra rằng "không
   * biết" — im lặng ở đây là đúng kiểu hỏng mà audit 21/08 gọi tên.
   */
  const lyDo = [
    text(row.component_count_error),
    text(row.bom_rule_warning),
    text(row.quantity_error),
  ].filter(Boolean);
  if (soLuong === undefined && !lyDo.length) {
    lyDo.push("Server không trả về số cấu kiện cho dòng này — chưa có Quy tắc BOM khớp hoặc thiếu kích thước.");
  }

  const phu = [text(row.color), text(row.source_rule)].filter(Boolean).join(" · ");

  return {
    key: `${text(row.component_key)}-live-${index}`,
    ten: text(row.item_code) || text(row.component_key) || `dòng ${index + 1}`,
    soLuong,
    dvt: text(row.component_count_uom),
    daiMoiCai: cutEach === undefined ? "—" : `${quantity(cutEach)} m`,
    tong: tongSo === undefined ? "—" : `${quantity(tongSo)} ${tongDvt}`.trim(),
    ghiChu: lyDo.join(" · "),
    phu,
  };
}

export interface AlumdoorWorkOrderBomPanelProps {
  preview: BomRequirementPreview | null;
  previewError: string;
  previewPending: boolean;
  onRefresh: () => void;
  /** `bom_actual_components` đọc từ `Work Order.formula_snapshot`. */
  actualComponents: WorkOrderActualComponent[];
  /** Lỗi khi đọc ảnh chụp công thức trên lệnh. */
  snapshotError: string;
  /** Chứng từ được phép sửa định mức thực tế (Đơn bán / Yêu cầu sản xuất). */
  sourceLabel: string;
  sourcePath: string;
  onNavigate: (path: string) => void;
}

export function AlumdoorWorkOrderBomPanel(props: AlumdoorWorkOrderBomPanelProps) {
  const preview = props.preview;
  const requirements = normalizeRequirements(preview?.actual_requirements);
  const actualRows = normalizeActualRows(props.actualComponents);
  const components = preview?.components ?? [];
  const flagged = components.filter((row) =>
    text(row.quantity_error) || text(row.uom_warning) || text(row.sales_uom_message) || row.sales_uom_missing === true);
  const notApplicable = preview !== null && preview.bom_applicable === false;

  return (
    <div className="space-y-3" data-section="work-order-v2-bom">
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-medium">Định mức áp cho bộ cửa này</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Kết quả tính lại trực tiếp từ `alumdoor.sales.preview_bom_requirements` theo đúng số đo đã chốt
              trên lệnh. Đây là chỗ nói ra LÝ DO khi định mức không áp được.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={props.previewPending} onClick={props.onRefresh}>
            {props.previewPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Tính lại
          </Button>
        </div>

        {props.previewError ? (
          <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
            <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
            {props.previewError}
          </div>
        ) : null}

        {preview === null && !props.previewError ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            {props.previewPending ? "Đang tính định mức…" : "Chưa tính. Bấm “Tính lại” để hỏi server."}
          </div>
        ) : null}

        {preview !== null ? (
          <div className="space-y-2.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={notApplicable ? "destructive" : "outline"}>
                {notApplicable ? "Định mức KHÔNG áp được" : "Định mức áp được"}
              </Badge>
              {text(preview.bom_no) ? (
                <Badge variant="outline" className="font-mono text-[10px]">BOM {text(preview.bom_no)}</Badge>
              ) : null}
              {text(preview.bom_template) ? (
                <Badge variant="outline" className="font-mono text-[10px]">Mẫu {text(preview.bom_template)}</Badge>
              ) : null}
              {text(preview.bom_template_code) ? (
                <Badge variant="outline" className="font-mono text-[10px]">{text(preview.bom_template_code)}</Badge>
              ) : null}
              {preview.static_bom === true ? <Badge variant="outline">BOM tĩnh</Badge> : null}
              {preview.actual_complete === false ? (
                <Badge variant="destructive">Thiếu vật tư BOM thực tế</Badge>
              ) : null}
            </div>

            {text(preview.reason) ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
                <div className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <span>{text(preview.reason)}</span>
                </div>
              </div>
            ) : null}

            {(preview.pending_fields ?? []).length ? (
              <div className="text-xs">
                <span className="text-muted-foreground">Còn thiếu đầu vào: </span>
                {(preview.pending_fields ?? []).map((field) => (
                  <Badge key={text(field)} variant="outline" className="ml-1 font-mono text-[10px]">{text(field)}</Badge>
                ))}
              </div>
            ) : null}

            {(preview.missing_actual_component_keys ?? []).length ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
                <div className="font-medium text-destructive">Slot vật tư thực tế còn trống</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(preview.missing_actual_component_keys ?? []).map((key) => (
                    <Badge key={text(key)} variant="destructive" className="font-mono text-[10px]">{text(key)}</Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {flagged.length ? (
              <div className="rounded-md border p-2.5 text-xs">
                <div className="font-medium">{flagged.length} cấu phần có cảnh báo từ máy tính định mức</div>
                <ul className="mt-1.5 space-y-1.5">
                  {flagged.map((row, index) => (
                    <li key={`${text(row.component_key)}-${index}`} className="flex flex-wrap items-baseline gap-1.5">
                      <span className="font-mono text-[11px] font-medium">
                        {text(row.item_code) || text(row.component_key) || `dòng ${index + 1}`}
                      </span>
                      {text(row.quantity_error) ? (
                        <span className="text-destructive">{text(row.quantity_error)}</span>
                      ) : null}
                      {text(row.uom_warning) ? (
                        <span className="text-muted-foreground">{text(row.uom_warning)}</span>
                      ) : null}
                      {text(row.sales_uom_message) ? (
                        <span className="text-muted-foreground">{text(row.sales_uom_message)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {components.length ? (
              /*
               * Bảng này KHÔNG nằm trong `<details>` gập lại nữa (24/08/2026).
               *
               * "Mấy cây, mấy lá, cắt mỗi cái bao nhiêu" là câu hỏi ĐẦU TIÊN của người đứng máy,
               * không phải chi tiết phụ để bấm ra xem. Giấu nó sau một mũi tên gập là lý do khối cũ
               * bị đọc lướt qua rồi thợ đi hỏi lại bằng miệng.
               */
              <div className="overflow-hidden rounded-md border">
                <div className="border-b bg-muted/30 px-2.5 py-2 text-xs font-medium">
                  {components.length} cấu kiện máy tính định mức xổ ra (đối chiếu với ảnh chụp trên lệnh)
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-44">Cấu kiện</TableHead>
                        <TableHead className="w-16 text-right">SL</TableHead>
                        <TableHead className="w-20">ĐVT</TableHead>
                        <TableHead className="w-28 text-right">Dài mỗi cái</TableHead>
                        <TableHead className="w-28 text-right">Tổng</TableHead>
                        <TableHead className="min-w-48">Ghi chú</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {components.map((row, index) => {
                        const dong = docCauKien(row, index);
                        return (
                          <TableRow key={dong.key} className={dong.soLuong === undefined ? "bg-destructive/5" : undefined}>
                            <TableCell className="align-top">
                              <div className="font-mono text-xs font-medium">{dong.ten}</div>
                              {dong.phu ? (
                                <div className="text-[10px] text-muted-foreground">{dong.phu}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right align-top text-xs font-semibold tabular-nums">
                              {dong.soLuong === undefined
                                ? <span className="text-destructive">?</span>
                                : quantity(dong.soLuong)}
                            </TableCell>
                            <TableCell className="align-top text-xs">{dong.dvt || "—"}</TableCell>
                            <TableCell className="text-right align-top text-xs tabular-nums">{dong.daiMoiCai}</TableCell>
                            {/* Kg · Mét · m² chỉ được đứng ở đây — đây là số cho kho và giá thành, không phải số cho thợ. */}
                            <TableCell className="text-right align-top text-xs tabular-nums text-muted-foreground">
                              {dong.tong}
                            </TableCell>
                            <TableCell className="align-top text-[11px] leading-snug text-destructive">
                              {dong.ghiChu || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t px-2.5 py-1.5 text-[10px] text-muted-foreground">
                  “SL / ĐVT” là SỐ CẤU KIỆN phải cắt (`component_count`). Cột “Tổng” là tiêu hao kho
                  (`stock_consumption_qty`) — số để lĩnh vật tư và tính giá thành, không phải số cây/lá.
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-medium">Định mức thực tế đã chốt</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Vật tư THỰC dùng cho một bộ, chốt trên chứng từ nguồn rồi chụp vào lệnh. Sửa ở đây không có
              chỗ lưu — Work Order không có trường `bom_actual_components`.
            </p>
          </div>
          {props.sourcePath ? (
            <Button type="button" variant="outline" size="sm" onClick={() => props.onNavigate(props.sourcePath)}>
              Sửa tại {props.sourceLabel} <ExternalLink className="size-3.5" />
            </Button>
          ) : null}
        </div>

        {props.snapshotError ? (
          <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
            {props.snapshotError}
          </div>
        ) : null}

        <div className="px-4 py-3">
          {requirements.length ? (
            <AlumdoorBomActualEditor
              requirements={requirements}
              value={actualRows}
              disabled
              onChange={() => {
                /* Chỉ đọc: thẩm quyền ghi định mức thực tế thuộc chứng từ nguồn, không thuộc lệnh sản xuất. */
              }}
            />
          ) : (
            <div className="text-xs text-muted-foreground">
              {actualRows.length
                ? "Máy tính định mức không đòi slot vật tư thực tế nào cho bộ này, nhưng lệnh vẫn có bản chụp bên dưới."
                : "Bộ cửa này không có slot vật tư thực tế nào cần khai."}
            </div>
          )}

          {actualRows.length ? (
            <div className="mt-3 rounded-md border bg-muted/30 p-2.5">
              <div className="text-[11px] font-medium text-muted-foreground">
                Bản chụp trên lệnh (`Work Order.formula_snapshot`)
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px]">
                {actualRows.map((row, index) => (
                  <li key={`${row.component_key}-${row.item_code}-${index}`} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono font-medium">{row.component_key}</span>
                    <span className="font-mono">{row.item_code}</span>
                    <span className="tabular-nums">{quantity(row.qty)} / bộ</span>
                    {row.note ? <span className="text-muted-foreground">· {row.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
