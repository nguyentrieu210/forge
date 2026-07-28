/** @jsxImportSource react */
/**
 * ChildGrid (M12) — bảng con cho field Table: render row của child DocType,
 * cột = field in_list_view của child, cell = control từ registry (inline edit), thêm/xoá row.
 * Data-driven từ child meta (KHÔNG hardcode).
 */
import { useState } from "react";
import { Maximize2, Plus, X } from "lucide-react";
import { resolveField, type DocTypeMeta, type DocField, type Doc } from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, useT,
} from "@metaforge/ui";

export interface ChildGridProps {
  childMeta: DocTypeMeta;
  rows: Doc[];
  onChange: (rows: Doc[]) => void;
  registry: ControlRegistry;
  services?: FieldServices;
  readOnly?: boolean;
  /** doc CHA (giá trị form) — ngữ cảnh resolve depends_on/eval của field con (parent.*). */
  parentDoc?: Record<string, unknown>;
  /** role user — resolve permlevel/quyền ghi field con (P1-06 canonical). */
  roles?: string[];
  /**
   * Giá trị mồi cho DÒNG MỚI, lấy từ bối cảnh đang chọn (vd kho hiện tại).
   *
   * `blankDoc` chỉ gieo bối cảnh cho chứng từ CHA, nên dòng bảng con không nhận được gì —
   * thủ kho phải chọn lại đúng một cái kho cho từng dòng, mỗi lần. Chỉ mồi ô đang TRỐNG và
   * chỉ những field bảng con thật sự có.
   */
  rowDefaults?: Record<string, unknown>;
}

function isLayout(ft: string): boolean {
  return ["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect"].includes(ft);
}

function gridColumns(meta: DocTypeMeta): DocField[] {
  const inList = (meta.fields ?? []).filter((f) => f.in_list_view === 1 && !isLayout(f.fieldtype));
  if (inList.length > 0) return inList;
  return (meta.fields ?? []).filter((f) => !isLayout(f.fieldtype)).slice(0, 4);
}

/**
 * Bề rộng TỐI THIỂU của một cột, theo kiểu field.
 *
 * Không có nó thì bảng chia đều bề ngang cho mọi cột: một dòng đơn mua bảy cột làm ô "Mã
 * hàng" hẹp bằng ô "Số lượng", nên tên hàng bị cắt và cái ô chọn liên kết thì gần như
 * không bấm nổi. Đây là lý do bảng con "quá chật, không hiện đủ".
 *
 * Đi kèm với việc cho bảng CUỘN NGANG: trước đây khung ngoài là `overflow-hidden`, tức là
 * phần vượt bị CẮT — không có thanh cuộn, và cũng không có dấu hiệu nào cho biết còn cột
 * phía sau. Người dùng chỉ thấy bảng thiếu cột.
 */
function columnWidth(field: DocField): string {
  const fieldtype = field.fieldtype;
  /**
   * Cột SỐ hẹp lại theo NHÃN, không cấp đồng loạt một bề rộng.
   *
   * Nhãn ngắn ("SL") thì cột chỉ cần chứa con số; nhãn dài ("Đã có hoá đơn (%)") thì tiêu
   * đề mới là thứ quyết định bề rộng. Cấp đều 7,5rem cho mọi cột số làm cột "SL" rộng bằng
   * cột "Thành tiền" trong khi nó chứa "20" — và chỗ thừa đó lấy đi của cột mã hàng.
   */
  if (["Currency", "Float", "Int", "Percent"].includes(fieldtype)) {
    const label = (field.label ?? field.fieldname).length;
    if (fieldtype === "Currency") return label <= 12 ? "min-w-[7.5rem]" : "min-w-[9rem]";
    return label <= 4 ? "min-w-[4.5rem]" : label <= 10 ? "min-w-[6rem]" : "min-w-[8rem]";
  }
  if (fieldtype === "Check") return "min-w-[4rem]";
  if (["Date", "Time"].includes(fieldtype)) return "min-w-[9rem]";
  if (fieldtype === "Datetime") return "min-w-[11rem]";
  if (fieldtype === "Select") {
    /**
     * Bề rộng theo LỰA CHỌN DÀI NHẤT, không theo một hằng số chung.
     *
     * Cột ĐVT chỉ chứa "Cái", "Cây", "Kg" — cấp cho nó 9rem như cột trạng thái là lấy mất
     * chỗ của cột mã hàng ngay bên cạnh, mà mã hàng mới là cột cần đọc. Đo từ chính dữ
     * liệu thay vì đoán thì cột nào cũng vừa đúng phần nó cần.
     */
    const longest = (field.options ?? "").split("\n").reduce((max, option) => Math.max(max, option.trim().length), 0);
    if (longest <= 6) return "min-w-[5.5rem]";
    if (longest <= 12) return "min-w-[8rem]";
    return "min-w-[11rem]";
  }
  if (["Small Text", "Text", "Long Text"].includes(fieldtype)) return "min-w-[12rem]";
  return "min-w-[11rem]";
}

export function ChildGrid(props: ChildGridProps) {
  const t = useT();
  const { childMeta, rows, onChange, registry, services, readOnly, parentDoc, roles, rowDefaults } = props;
  const [detailRow, setDetailRow] = useState<number | null>(null);
  const cols = gridColumns(childMeta);

  /**
   * Các field dòng TỰ TÍNH được, tính ngay khi gõ.
   *
   * Server vẫn là nơi quyết định con số cuối cùng (`calculateSalesTotals` tính lại toàn bộ
   * khi lưu, theo đơn vị nhỏ nhất). Nhưng nếu ô "Thành tiền" trống suốt lúc nhập thì người
   * bán không soát được gì cho tới khi bấm lưu — mà một dòng sai đơn giá chỉ lộ ra ở tổng
   * đơn, lúc đã muộn. Nên tính ở client để NHÌN, và vẫn để server tính lại để TIN.
   *
   * Quy ước theo tên field, cùng lối với `fillItemDefaults` ngay dưới: dòng nào có đủ
   * `qty` và `rate` và có ô `amount` thì `amount = qty × rate`. Không có đủ ba thì không
   * làm gì — không đoán, không ghi đè field người dùng tự nhập.
   */
  const COMPUTED_FROM = new Set(["qty", "rate"]);
  const withComputed = (row: Doc): Doc => {
    const has = (f: string) => (childMeta.fields ?? []).some((x) => x.fieldname === f);
    if (!has("amount") || !has("qty") || !has("rate")) return row;
    const qty = Number(row.qty);
    const rate = Number(row.rate);
    if (!Number.isFinite(qty) || !Number.isFinite(rate)) return row;
    return { ...row, amount: qty * rate };
  };

  const setCell = (rowIdx: number, fieldname: string, value: unknown) => {
    const next = rows.map((r, i) => {
      if (i !== rowIdx) return r;
      const updated = { ...r, [fieldname]: value };
      return COMPUTED_FROM.has(fieldname) ? withComputed(updated) : updated;
    });
    onChange(next);
    if (fieldname === "item_code" && value) void fillItemDefaults(rowIdx, String(value), next);
  };

  /**
   * Chọn mặt hàng xong thì tự điền ĐƠN VỊ TÍNH, tên và mô tả từ chính bản ghi Item.
   *
   * Trên ERPNext Desk việc này do client script gọi `get_item_details` làm; ta không chạy client
   * script của Frappe nên phải tự làm, nếu không thủ kho chọn hàng xong vẫn phải tự gõ đơn vị cho
   * TỪNG dòng — và gõ sai đơn vị thì số tồn sai theo (10 thùng ghi thành 10 cái).
   *
   * Nguyên tắc: CHỈ điền vào ô đang TRỐNG. Người dùng đã tự sửa đơn vị (mua theo thùng nhưng nhập
   * kho theo cái) thì không được đạp lên lựa chọn của họ.
   */
  const fillItemDefaults = async (rowIdx: number, itemCode: string, base: Doc[]) => {
    if (!services?.fetchValue) return;
    const has = (f: string) => (childMeta.fields ?? []).some((x) => x.fieldname === f);
    // nguồn trên Item → các ô đích trên dòng bảng con
    const plan: Array<[string, string[]]> = [
      ["stock_uom", ["uom", "stock_uom"]],
      ["item_name", ["item_name"]],
      ["description", ["description"]],
      /**
       * ĐƠN GIÁ mồi từ giá chuẩn của mặt hàng.
       *
       * `valuation_rate` là "giá vốn chuẩn" trên hồ sơ hàng hoá — con số gần nhất với "giá
       * mình vẫn mua". Mồi vào ô đang trống thôi: người nhập luôn được quyền gõ đè, vì giá
       * NCC đổi theo ngày và tờ hoá đơn trên tay mới là giá thật.
       */
      ["valuation_rate", ["rate"]],
      /**
       * KHO MẶC ĐỊNH của chính mặt hàng — nan nhôm về kho nhôm, mô tơ về kho phụ kiện.
       *
       * Cụ thể hơn bối cảnh đang chọn, nên nó được phép ghi đè giá trị mà `rowDefaults` vừa
       * mồi (xem điều kiện dưới). Cái nó KHÔNG bao giờ ghi đè là kho người dùng tự chọn.
       */
      ["default_warehouse", ["warehouse"]],
    ];
    const patch: Record<string, unknown> = {};
    await Promise.all(plan.map(async ([src, dests]) => {
      const targets = dests.filter((d) => {
        if (!has(d)) return false;
        const current = base[rowIdx]?.[d];
        if (!current) return true;
        // Giá trị do bối cảnh mồi vào thì mặc định của MẶT HÀNG được quyền thay.
        return rowDefaults?.[d] !== undefined && current === rowDefaults[d];
      });
      if (targets.length === 0) return;
      const v = await services.fetchValue!("Item", itemCode, src).catch(() => undefined);
      if (v === undefined || v === null || v === "") return;
      for (const d of targets) patch[d] = v;
    }));
    if (Object.keys(patch).length === 0) return;
    // Hệ số quy đổi đi kèm đơn vị: để trống thì ERPNext tính thành 0 và số lượng quy đổi ra 0.
    if (patch.uom && has("conversion_factor") && !base[rowIdx]?.conversion_factor) patch.conversion_factor = 1;
    const merged = base.map((r, i) => (i === rowIdx ? { ...r, ...patch } : r));
    // Đơn giá vừa mồi xong thì thành tiền phải theo ngay, không đợi người dùng chạm vào ô.
    onChange(merged.map((r, i) => (i === rowIdx ? withComputed(r) : r)));
  };
  /**
   * Dòng mới mang sẵn giá trị mặc định của field và của BỐI CẢNH đang chọn.
   *
   * Trước đây dòng mới hoàn toàn trắng, nên thủ kho phải chọn lại đúng một cái kho cho từng
   * dòng, mỗi lần lập phiếu. Mặc định của field (`default` trong metadata) cũng bị bỏ qua ở
   * bảng con dù form cha vẫn dùng — hai chỗ cùng một khái niệm mà hành xử khác nhau.
   */
  const addRow = () => {
    const seed: Doc = { name: `new-${Date.now()}`, doctype: childMeta.name } as Doc;
    for (const field of childMeta.fields ?? []) {
      if (isLayout(field.fieldtype)) continue;
      if (field.default != null && field.default !== "") seed[field.fieldname] = field.default;
    }
    for (const [fieldname, value] of Object.entries(rowDefaults ?? {})) {
      if (value == null || value === "") continue;
      if (!(childMeta.fields ?? []).some((f) => f.fieldname === fieldname)) continue;
      if (seed[fieldname] == null || seed[fieldname] === "") seed[fieldname] = value;
    }
    onChange([...rows, seed]);
  };
  const delRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  /**
   * Dòng TỔNG dưới chân bảng — cách MISA hiển thị chi tiết chứng từ.
   *
   * Tổng của cột tiền phải nhìn thấy NGAY dưới bảng, không phải đợi lưu rồi mới hiện ở ô
   * tổng của chứng từ. Người lập phiếu soát bằng cách so con số này với tờ hoá đơn trên
   * tay; bắt họ lưu trước rồi mới biết là bắt sửa sau khi đã ghi.
   *
   * Chỉ cộng cột SỐ, và chỉ khi có ít nhất một dòng — một hàng "Tổng: 0" dưới bảng rỗng là
   * nhiễu. Server vẫn tính lại toàn bộ khi lưu; đây là con số để NHÌN.
   */
  const numericColumns = cols.filter((c) => ["Currency", "Float", "Int", "Percent"].includes(c.fieldtype));
  const totals = new Map<string, number>();
  for (const column of numericColumns) {
    let sum = 0;
    let seen = false;
    for (const row of rows) {
      const value = Number(row[column.fieldname]);
      if (Number.isFinite(value)) { sum += value; seen = true; }
    }
    if (seen) totals.set(column.fieldname, sum);
  }

  return (
    <div className="mf-grid space-y-2">
      {/* CUỘN NGANG, không cắt. `overflow-hidden` trước đây giấu mất các cột phía sau mà
          không để lại dấu hiệu nào — bảng chỉ đơn giản là thiếu cột. Cột "#" GHIM lại bên
          trái khi cuộn, cách MISA làm, để không lạc dòng khi kéo sang phải. */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-10 w-10 bg-card text-right">#</TableHead>
              {cols.map((c) => (
                <TableHead key={c.fieldname} className={`${columnWidth(c)} whitespace-nowrap`}>
                  {c.label ?? c.fieldname}
                  {c.reqd ? <span className="mf-required ml-0.5 text-destructive">*</span> : null}
                </TableHead>
              ))}
              {!readOnly ? <TableHead className="w-10" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={String(row.name ?? ri)} className="hover:bg-transparent">
                <TableCell className="sticky left-0 z-10 bg-card text-right text-xs text-muted-foreground">{ri + 1}</TableCell>
                {cols.map((c) => {
                  const Control = registry.resolve(c.fieldtype) ?? FallbackControl;
                  // P1-06 canonical: trạng thái field con theo depends_on/read_only_depends_on/docstatus,
                  // eval trong ngữ cảnh row (doc) + doc cha (parent). assumeWritable: quyền ghi bảng con
                  // KẾ THỪA từ cha (DocType con permissions rỗng) — grid đã gate bằng readOnly field cha
                  // (H1). Vẫn tôn trọng read_only/read_only_depends_on/docstatus + masked_fields server.
                  const rf = resolveField(c, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
                  if (!rf.visible) {
                    return <TableCell key={c.fieldname} className="align-top text-center text-xs text-muted-foreground">—</TableCell>;
                  }
                  return (
                    <TableCell key={c.fieldname} className="align-top">
                      <Control
                        field={c}
                        value={row[c.fieldname]}
                        onChange={(v: unknown) => setCell(ri, c.fieldname, v)}
                        readOnly={readOnly || rf.readOnly}
                        masked={rf.masked}
                        services={services}
                        docname={String(row.name ?? "")}
                        linkTarget={c.fieldtype === "Link" ? c.options : undefined}
                        parentDoctype={childMeta.name}
                        docValues={row}
                        roles={roles}
                        compact
                      />
                    </TableCell>
                  );
                })}
                {!readOnly ? (
                  <TableCell className="whitespace-nowrap">
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => setDetailRow(ri)} aria-label="Chi tiết dòng" title="Chi tiết dòng">
                      <Maximize2 />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => delRow(ri)} aria-label={t("grid.remove_row")}>
                      <X />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="h-16 text-center text-muted-foreground" colSpan={cols.length + 2}>
                  {t("grid.empty")}
                </TableCell>
              </TableRow>
            ) : null}
            {rows.length > 0 && totals.size > 0 ? (
              <TableRow className="border-t-2 bg-muted/40 font-medium hover:bg-muted/40">
                <TableCell className="sticky left-0 z-10 bg-muted/40 text-right text-xs text-muted-foreground">Σ</TableCell>
                {cols.map((c) => (
                  <TableCell key={c.fieldname} className="whitespace-nowrap text-right tabular-nums">
                    {totals.has(c.fieldname)
                      ? (services?.fmt?.number
                          ? services.fmt.number(totals.get(c.fieldname)!)
                          : totals.get(c.fieldname)!.toLocaleString("vi-VN"))
                      : null}
                  </TableCell>
                ))}
                {!readOnly ? <TableCell /> : null}
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {!readOnly ? (
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus /> {t("grid.add_row")}
        </Button>
      ) : null}

      {/*
        CHI TIẾT DÒNG — mọi field của dòng, kể cả field không làm cột.
        Đây là thứ khiến việc rút gọn cột trở nên AN TOÀN: bảng chỉ giữ vài cột người ta
        nhìn mỗi ngày, còn field ít dùng (hệ số quy đổi, ghi chú dòng, kho riêng của dòng)
        vẫn tới được — thay vì biến mất khỏi giao diện cùng với cột của nó. Bỏ một cột mà
        không có chỗ này là xoá field khỏi tầm với của người dùng.
      */}
      <Dialog open={detailRow != null} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
        <DialogContent className="max-h-[85vh] w-[min(94vw,640px)] max-w-none overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dòng {detailRow != null ? detailRow + 1 : ""} — {childMeta.label ?? childMeta.name}</DialogTitle>
          </DialogHeader>
          {detailRow != null && rows[detailRow] ? (
            <div className="grid gap-3">
              {(childMeta.fields ?? []).filter((f) => !isLayout(f.fieldtype)).map((f) => {
                const row = rows[detailRow]!;
                const rf = resolveField(f, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
                if (!rf.visible) return null;
                const Control = registry.resolve(f.fieldtype) ?? FallbackControl;
                return (
                  <div key={f.fieldname} className="grid gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`detail-${f.fieldname}`}>
                      {f.label ?? f.fieldname}
                      {f.reqd ? <span className="mf-required ml-0.5 text-destructive">*</span> : null}
                    </label>
                    <Control
                      field={f}
                      value={row[f.fieldname]}
                      onChange={(v: unknown) => setCell(detailRow, f.fieldname, v)}
                      readOnly={readOnly || rf.readOnly}
                      masked={rf.masked}
                      services={services}
                      docname={String(row.name ?? "")}
                      linkTarget={f.fieldtype === "Link" ? f.options : undefined}
                      parentDoctype={childMeta.name}
                      docValues={row}
                      roles={roles}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
