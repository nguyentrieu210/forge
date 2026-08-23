/** @jsxImportSource react */
/**
 * Bảng CẤU PHẦN THEO ĐỊNH MỨC của một phiếu sản xuất.
 *
 * Đây là chỗ trả lời câu hỏi duy nhất mà thợ và thủ kho hỏi khi cầm tờ lệnh:
 * **cần những gì, đang có bao nhiêu, còn thiếu bao nhiêu, và có mã nào không lĩnh được không.**
 *
 * ── Vì sao có cột trạng thái mã ──────────────────────────────────────────────────────────────
 * `AGENTS.md` mục "Chỗ đang đỏ": bảng ĐM còn viết mã cấu phần theo hệ mã CŨ trong khi danh mục
 * Item đã đổi mã, nên **207/230 mã cấu phần không khớp Item nào**, trong đó **88 mã phải người
 * quyết**. Một bảng cấu phần lặng lẽ bỏ qua những dòng đó là đúng kiểu hỏng tệ nhất của repo này
 * (docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md §2): luật chạy đủ ở server, kết quả
 * không tới người dùng.
 *
 * Nên bảng này:
 *  - GIỮ NGUYÊN mã ghi trên định mức, kể cả khi mã đó không giải được;
 *  - đánh dấu ngay TẠI DÒNG bằng trạng thái `NO_ITEM` và nói hệ quả (ghi sổ sẽ bị từ chối);
 *  - **KHÔNG đoán, không tự map, không "gần đúng"**. Đoán mã hàng là đoán xem một dòng định mức
 *    nói về vật tư nào — sai là ra sai vật tư trong BOM mà không có gì báo.
 *
 * ── Vì sao "Tồn" và "Thiếu" có thể là "—" ────────────────────────────────────────────────────
 * Tồn đọc từ report `Stock Balance` của nền tảng. Đọc không được thì hiện "—" kèm lý do, TUYỆT
 * ĐỐI không rơi về 0: một ô 0 trông y hệt "kho hết hàng" và người đọc sẽ đi mua thừa.
 */
import { AlertTriangle, Ban, CircleHelp, ExternalLink, HelpCircle, PackageSearch } from "lucide-react";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metaforge/ui";
import {
  componentShortage,
  documentPath,
  optionalQuantity,
  quantity,
  text,
  unresolvedComponents,
  type ComponentResolution,
  type WorkOrderComponentRow,
} from "./model.js";

const RESOLUTION_TEXT: Record<ComponentResolution, { label: string; hint: string }> = {
  RESOLVED: { label: "", hint: "" },
  DISABLED_ITEM: {
    label: "Item ngừng kinh doanh",
    hint: "Mã có trong danh mục nhưng đã đánh dấu Ngừng kinh doanh. Vẫn còn tồn thì cấp được, nhưng không mua thêm được nữa.",
  },
  NO_ITEM: {
    label: "Không khớp Item nào",
    hint: "Mã này viết trên định mức nhưng KHÔNG có mặt hàng nào mang mã đó trong danh mục. Nền tảng sẽ TỪ CHỐI ghi sổ lệnh sản xuất cho tới khi mã được người có thẩm quyền quyết. Màn này cố ý không đoán hộ.",
  },
  UNKNOWN: {
    label: "Chưa đối chiếu được danh mục",
    hint: "Chưa đọc được danh mục Item nên chưa kết luận được mã này đúng hay sai. Đây KHÔNG phải là “mã hợp lệ”.",
  },
};

function ResolutionBadge({ resolution }: { resolution: ComponentResolution }) {
  if (resolution === "RESOLVED") return null;
  const info = RESOLUTION_TEXT[resolution];
  const variant = resolution === "NO_ITEM" ? "destructive" : "outline";
  const Icon = resolution === "NO_ITEM" ? Ban : resolution === "DISABLED_ITEM" ? AlertTriangle : CircleHelp;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={variant} className="mt-1 gap-1 whitespace-nowrap text-[10px]">
          <Icon className="size-3" /> {info.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 text-xs leading-relaxed">{info.hint}</TooltipContent>
    </Tooltip>
  );
}

export interface AlumdoorWorkOrderComponentTableProps {
  rows: WorkOrderComponentRow[];
  /** Tên `Bill of Materials` đang áp — để bấm nhảy sang xem định mức gốc. */
  bomName: string;
  /** Lỗi khi đọc BOM (nguyên văn từ server). */
  bomError: string;
  /** Lỗi khi đọc danh mục Item (nguyên văn từ server). */
  catalogError: string;
  /** Lỗi khi đọc report tồn kho (nguyên văn từ server). */
  stockError: string;
  /** Lệnh đã ghi sổ chưa — quyết định các cột tiến độ có ý nghĩa hay không. */
  submitted: boolean;
  /** Lệnh đã ghi sổ nhưng không có `required_items` (dữ liệu đời cũ). */
  missingRequiredSnapshot: boolean;
  onNavigate: (path: string) => void;
}

export function AlumdoorWorkOrderComponentTable(props: AlumdoorWorkOrderComponentTableProps) {
  const unresolved = unresolvedComponents(props.rows);
  const disabledItems = props.rows.filter((row) => row.resolution === "DISABLED_ITEM");
  const shortRows = props.rows.filter((row) => {
    const gap = componentShortage(row);
    return gap !== undefined && gap > 0;
  });

  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-section="work-order-v2-components">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-medium">Cấu phần theo định mức</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Số “Cần” do controller nền tảng chụp sẵn lên lệnh khi lưu (`Work Order.required_items`);
            React không nhân định mức và không cộng sổ kho.
          </p>
        </div>
        {props.bomName ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => props.onNavigate(documentPath("Bill of Materials", props.bomName))}
          >
            Định mức {props.bomName} <ExternalLink className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {props.bomError ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
          Không đọc được định mức gốc: {props.bomError}
        </div>
      ) : null}
      {props.catalogError ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
          Không đối chiếu được danh mục Item: {props.catalogError} — cột trạng thái mã đang để “chưa đối chiếu được”, không được đọc là hợp lệ.
        </div>
      ) : null}
      {props.stockError ? (
        <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <PackageSearch className="mr-1 inline size-3.5 align-[-2px]" />
          Không đọc được tồn kho: {props.stockError} — hai cột “Tồn” và “Thiếu” để trống, KHÔNG hiển thị 0.
        </div>
      ) : null}
      {props.missingRequiredSnapshot ? (
        <div className="border-b border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs">
          <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
          Lệnh này không có ảnh chụp định mức trên chứng từ nên không có số “cần bao nhiêu”. Bảng dưới chỉ đang
          liệt kê định mức HIỆN TẠI của BOM — định mức có thể đã đổi kể từ lúc lệnh được lập.
        </div>
      ) : null}
      {unresolved.length ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-destructive">
            <Ban className="size-3.5" /> {unresolved.length} mã cấu phần không khớp Item nào trong danh mục
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {unresolved.map((row) => (
              <Badge key={row.key} variant="destructive" className="font-mono text-[10px]">
                {row.item_code || `(dòng ${row.row_id} không ghi mã)`}
              </Badge>
            ))}
          </div>
          <p className="mt-1.5 text-muted-foreground">
            Nền tảng kiểm mã cấu phần lúc ghi sổ lệnh, nên lệnh sẽ bị từ chối cho tới khi những mã này được
            người có thẩm quyền quyết. Màn này cố ý KHÔNG tự map sang mã gần giống.
          </p>
        </div>
      ) : null}
      {disabledItems.length ? (
        <div className="border-b bg-amber-500/5 px-4 py-2 text-xs">
          <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
          {disabledItems.length} cấu phần trỏ vào mặt hàng đã Ngừng kinh doanh: {disabledItems.map((row) => row.item_code).join(", ")}.
        </div>
      ) : null}
      {shortRows.length ? (
        <div className="border-b bg-muted/40 px-4 py-2 text-xs">
          <PackageSearch className="mr-1 inline size-3.5 align-[-2px]" />
          {shortRows.length} cấu phần đang thiếu so với tồn ở kho vật tư của lệnh.
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-right">#</TableHead>
              <TableHead className="min-w-56">Mã cấu phần</TableHead>
              <TableHead className="min-w-40">Tên hàng</TableHead>
              <TableHead className="min-w-28">Màu</TableHead>
              <TableHead className="min-w-36">Quy cách</TableHead>
              {/*
                24/08/2026: đổi nhãn cho hết mơ hồ. Hai cột này nói về TIÊU HAO KHO (Mét · Kg · m²)
                chứ không phải số cấu kiện phải cắt — "ĐVT định mức" và "Cần" trống nghĩa nên người
                đọc tưởng đây là "cần mấy cây". Số cây/lá nằm ở bảng BOM của panel bên cạnh
                (`AlumdoorWorkOrderBomPanel.tsx`), cố ý KHÔNG ghép vào đây: bảng này ghép 3 nguồn
                theo `row_id`, còn preview chỉ khoá được theo `item_code` — ghép sai rất dễ.
              */}
              <TableHead className="min-w-24">ĐVT kho</TableHead>
              <TableHead className="text-right">Cần (kho)</TableHead>
              <TableHead className="text-right">Đã cấp</TableHead>
              <TableHead className="text-right">Đã dùng</TableHead>
              <TableHead className="text-right">Còn cấp</TableHead>
              <TableHead className="text-right">Tồn</TableHead>
              <TableHead className="text-right">Thiếu</TableHead>
              <TableHead className="min-w-36">Kho xuất</TableHead>
              <TableHead className="min-w-40">Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.map((row) => {
              const gap = componentShortage(row);
              const missing = gap !== undefined && gap > 0;
              return (
                <TableRow
                  key={row.key}
                  className={row.resolution === "NO_ITEM" ? "bg-destructive/5" : undefined}
                >
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{row.order}</TableCell>
                  <TableCell className="align-top">
                    <div className="font-mono text-xs font-medium">{row.item_code || "(không ghi mã)"}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.row_id}</div>
                    <ResolutionBadge resolution={row.resolution} />
                    {row.only_in === "BOM" ? (
                      <Badge variant="outline" className="mt-1 text-[10px]">Chỉ có ở BOM hiện tại</Badge>
                    ) : null}
                    {row.only_in === "WORK_ORDER" ? (
                      <Badge variant="outline" className="mt-1 text-[10px]">Chỉ có trên ảnh chụp của lệnh</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top text-xs">{text(row.item?.item_name) || "—"}</TableCell>
                  <TableCell className="align-top text-xs">
                    {row.color || "—"}
                    {row.color_from === "bom" && row.color ? (
                      <div className="text-[10px] text-muted-foreground">theo màu của định mức</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top text-xs">
                    {text(row.item?.material_specification) || "—"}
                    {text(row.item?.measurement_profile) ? (
                      <div className="text-[10px] text-muted-foreground">{text(row.item?.measurement_profile)}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top text-xs">
                    {row.bom_uom || text(row.item?.stock_uom) || "—"}
                    {row.qty_basis && row.qty_basis !== "Cố định" ? (
                      <div className="text-[10px] text-muted-foreground">nhân theo {row.qty_basis}</div>
                    ) : null}
                    {row.bom_qty !== undefined ? (
                      <div className="text-[10px] text-muted-foreground">ĐM gốc {quantity(row.bom_qty)}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right align-top text-xs font-medium tabular-nums">
                    {optionalQuantity(row.required_qty)}
                  </TableCell>
                  <TableCell className="text-right align-top text-xs tabular-nums">
                    {props.submitted ? optionalQuantity(row.issued_qty) : "—"}
                  </TableCell>
                  <TableCell className="text-right align-top text-xs tabular-nums">
                    {props.submitted ? optionalQuantity(row.consumed_qty) : "—"}
                  </TableCell>
                  <TableCell className="text-right align-top text-xs tabular-nums">
                    {props.submitted ? optionalQuantity(row.remaining_to_issue) : "—"}
                  </TableCell>
                  <TableCell className="text-right align-top text-xs tabular-nums">
                    {optionalQuantity(row.stock_qty)}
                  </TableCell>
                  <TableCell
                    className={`text-right align-top text-xs tabular-nums ${missing ? "font-semibold text-destructive" : ""}`}
                  >
                    {optionalQuantity(gap)}
                  </TableCell>
                  <TableCell className="align-top text-xs">{row.source_warehouse || "—"}</TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">{row.note || "—"}</TableCell>
                </TableRow>
              );
            })}
            {!props.rows.length ? (
              <TableRow>
                <TableCell colSpan={14} className="h-28 text-center text-sm text-muted-foreground">
                  <HelpCircle className="mx-auto mb-1 size-4" />
                  Chưa đọc được cấu phần nào. Lệnh chưa chọn định mức, hoặc định mức đang trống, hoặc tài khoản
                  không có quyền đọc `Bill of Materials`.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        “Thiếu” là hiệu số giữa số CÒN PHẢI CẤP của nền tảng và tồn của report `Stock Balance` — một con số
        tham chiếu để đi lĩnh hàng, không phải bút toán kho. Ghi sổ vẫn hoàn toàn do Stock Entry quyết.
      </div>
    </section>
  );
}
