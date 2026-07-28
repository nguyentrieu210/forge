/** @jsxImportSource react */
/**
 * ChildGrid (M12) — bảng con cho field Table: render row của child DocType,
 * cột = field in_list_view của child, cell = control từ registry (inline edit), thêm/xoá row.
 * Data-driven từ child meta (KHÔNG hardcode).
 */
import { Plus, X } from "lucide-react";
import { resolveField, type DocTypeMeta, type DocField, type Doc } from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import { Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, useT } from "@metaforge/ui";

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
}

function isLayout(ft: string): boolean {
  return ["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect"].includes(ft);
}

function gridColumns(meta: DocTypeMeta): DocField[] {
  const inList = (meta.fields ?? []).filter((f) => f.in_list_view === 1 && !isLayout(f.fieldtype));
  if (inList.length > 0) return inList;
  return (meta.fields ?? []).filter((f) => !isLayout(f.fieldtype)).slice(0, 4);
}

export function ChildGrid(props: ChildGridProps) {
  const t = useT();
  const { childMeta, rows, onChange, registry, services, readOnly, parentDoc, roles } = props;
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
    ];
    const patch: Record<string, unknown> = {};
    await Promise.all(plan.map(async ([src, dests]) => {
      const targets = dests.filter((d) => has(d) && !base[rowIdx]?.[d]);
      if (targets.length === 0) return;
      const v = await services.fetchValue!("Item", itemCode, src).catch(() => undefined);
      if (v === undefined || v === null || v === "") return;
      for (const d of targets) patch[d] = v;
    }));
    if (Object.keys(patch).length === 0) return;
    // Hệ số quy đổi đi kèm đơn vị: để trống thì ERPNext tính thành 0 và số lượng quy đổi ra 0.
    if (patch.uom && has("conversion_factor") && !base[rowIdx]?.conversion_factor) patch.conversion_factor = 1;
    onChange(base.map((r, i) => (i === rowIdx ? { ...r, ...patch } : r)));
  };
  const addRow = () => onChange([...rows, { name: `new-${Date.now()}`, doctype: childMeta.name } as Doc]);
  const delRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  return (
    <div className="mf-grid space-y-2">
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 text-right">#</TableHead>
              {cols.map((c) => (
                <TableHead key={c.fieldname}>
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
                <TableCell className="text-right text-xs text-muted-foreground">{ri + 1}</TableCell>
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
                      />
                    </TableCell>
                  );
                })}
                {!readOnly ? (
                  <TableCell>
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
          </TableBody>
        </Table>
      </div>
      {!readOnly ? (
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus /> {t("grid.add_row")}
        </Button>
      ) : null}
    </div>
  );
}
