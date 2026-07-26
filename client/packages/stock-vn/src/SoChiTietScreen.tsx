/** @jsxImportSource react */
/**
 * SỔ CHI TIẾT VẬT TƯ (mẫu S10-DN) và THẺ KHO (mẫu S12-DN) — hai biểu theo dõi MỘT mặt hàng tại
 * MỘT kho qua thời gian. Cùng một nguồn số liệu, khác nhau ở chỗ:
 *
 *   Sổ chi tiết vật tư — của KẾ TOÁN: có đơn giá và thành tiền.
 *   Thẻ kho            — của THỦ KHO: chỉ số lượng, không có tiền (thủ kho không theo dõi giá trị).
 *
 * Nên làm một màn với công tắc chuyển, không phải hai màn chép qua chép lại.
 *
 * ── Nguồn số liệu ─────────────────────────────────────────────────────────────────────────────
 * Report `Stock Ledger` của ERPNext. Cột `qty_after_transaction` và `stock_value` là tồn LUỸ KẾ do
 * chính ERPNext tính khi ghi sổ — lấy thẳng chứ không tự cộng dồn ở trình duyệt. Tự cộng thì chỉ
 * cần một chứng từ bị sửa ngày ghi sổ về quá khứ là toàn bộ cột tồn lệch so với sổ cái.
 *
 * ── Vì sao BẮT BUỘC chọn cả mặt hàng lẫn kho ──────────────────────────────────────────────────
 * Đo trên site thật: chỉ khi lọc đủ CẢ HAI thì ERPNext mới chèn dòng SỐ DƯ ĐẦU KỲ vào đầu kết
 * quả. Thiếu một trong hai là mất dòng đó, và một cuốn sổ không có số dư đầu kỳ thì cột tồn bắt
 * đầu từ đâu cũng sai. Bản thân hai biểu này cũng luôn lập cho từng mặt hàng tại từng kho.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { useList, useLocaleFormat, useMetaForge, resolveDateRange, PeriodPicker, exportFormXlsx, ymdToDmy } from "@metaforge/views";
import {
  Button, Input, Badge, Skeleton, cn, toast,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@metaforge/ui";

const CHUA_CHON = "";
const ITEM_CAP = 500;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const dmy = ymdToDmy;

interface Dong {
  ngay: string;
  soCt: string;
  loaiCt: string;
  nhapSl: number; nhapTt: number;
  xuatSl: number; xuatTt: number;
  tonSl: number; tonTt: number;
  donGia: number;
}

export function SoChiTietScreen() {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const fmt = useLocaleFormat();

  const macDinh = resolveDateRange("this_month");
  const [from, setFrom] = useState(macDinh.from);
  const [to, setTo] = useState(macDinh.to);
  const [item, setItem] = useState(CHUA_CHON);
  const [warehouse, setWarehouse] = useState(CHUA_CHON);
  const [q, setQ] = useState("");
  const [theKho, setTheKho] = useState(false);

  const company = businessContext.company;

  /**
   * Nạp danh mục rồi LỌC Ở TRÌNH DUYỆT theo cả mã lẫn tên.
   * Lọc phía máy chủ bằng `like` chỉ chạy trên MỘT cột: gõ "NVL-001" thì không khớp tên hàng, gõ
   * "thép" thì không khớp mã — người dùng gõ đúng thứ mình nhớ mà máy báo không tìm thấy.
   */
  const itemsQ = useList("Item", {
    fields: ["name", "item_name", "stock_uom"],
    filters: { disabled: 0 },
    orderBy: "modified desc",
    pageLength: ITEM_CAP,
  });
  const items = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("vi");
    const all = (itemsQ.data ?? []).map((d) => ({
      ma: String(d.name), ten: String(d.item_name ?? d.name), dvt: String(d.stock_uom ?? ""),
    }));
    if (!needle) return all;
    return all.filter((x) => `${x.ma} ${x.ten}`.toLocaleLowerCase("vi").includes(needle));
  }, [itemsQ.data, q]);

  const warehousesQ = useList("Warehouse", {
    fields: ["name"],
    filters: { is_group: 0, disabled: 0, ...(company ? { company } : {}) },
    orderBy: "name asc",
    pageLength: 500,
  });

  const duFilter = Boolean(item && warehouse && from && to);
  const filters = useMemo(() => ({
    from_date: from,
    to_date: to,
    // MẢNG, không phải chuỗi: bộ lọc này là MultiSelectList, truyền chuỗi làm report sập 500
    // ("'str' object has no attribute 'nodes_'").
    item_code: [item],
    warehouse,
    ...(company ? { company } : {}),
  }), [from, to, item, warehouse, company]);

  const soQ = useQuery({
    queryKey: [scopeKey, "so-chi-tiet", JSON.stringify(filters)],
    queryFn: () => adapter.runReport("Stock Ledger", filters),
    enabled: duFilter,
  });

  const dvt = useMemo(() => items.find((x) => x.ma === item)?.dvt ?? "", [items, item]);

  const { dauKy, dong, cong, cuoiKy } = useMemo(() => {
    const res = (soQ.data?.result ?? []) as Array<Record<string, unknown>>;
    let dauSl = 0, dauTt = 0;
    const ds: Dong[] = [];
    for (const r of res) {
      if (!r || typeof r !== "object" || Array.isArray(r)) continue;
      // Dòng SỐ DƯ ĐẦU KỲ do ERPNext chèn: KHÔNG có ngày và số chứng từ, chỉ mang tồn luỹ kế.
      // Vẽ nó như một dòng phát sinh bình thường sẽ thành một bút toán ma trong sổ.
      if (!r.date && !r.voucher_no) {
        dauSl = num(r.qty_after_transaction);
        dauTt = num(r.stock_value);
        continue;
      }
      const chenh = num(r.stock_value_difference);
      const nhapSl = num(r.in_qty), xuatSl = Math.abs(num(r.out_qty));
      ds.push({
        ngay: String(r.date ?? ""),
        soCt: String(r.voucher_no ?? ""),
        loaiCt: String(r.voucher_type ?? ""),
        nhapSl, nhapTt: chenh > 0 ? chenh : 0,
        xuatSl, xuatTt: chenh < 0 ? -chenh : 0,
        tonSl: num(r.qty_after_transaction),
        tonTt: num(r.stock_value),
        // Nhập: giá thực nhập. Xuất: giá xuất thực tế = giá trị xuất / số lượng xuất (KHÔNG lấy
        // valuation_rate — đó là đơn giá bình quân SAU giao dịch, không phải giá của lần xuất này).
        donGia: nhapSl > 0 ? num(r.incoming_rate) : xuatSl > 0 ? (chenh < 0 ? -chenh / xuatSl : 0) : num(r.valuation_rate),
      });
    }
    const c = ds.reduce((a, x) => ({
      nhapSl: a.nhapSl + x.nhapSl, nhapTt: a.nhapTt + x.nhapTt,
      xuatSl: a.xuatSl + x.xuatSl, xuatTt: a.xuatTt + x.xuatTt,
    }), { nhapSl: 0, nhapTt: 0, xuatSl: 0, xuatTt: 0 });
    const last = ds.at(-1);
    return {
      dauKy: { sl: dauSl, tt: dauTt },
      dong: ds,
      cong: c,
      cuoiKy: last ? { sl: last.tonSl, tt: last.tonTt } : { sl: dauSl, tt: dauTt },
    };
  }, [soQ.data]);

  const tien = (v: number) => fmt.number(v, 0);
  const soCot = theKho ? 6 : 10;

  async function xuatExcel() {
    try {
      await exportFormXlsx({
        filename: `${theKho ? "the-kho" : "so-chi-tiet"}_${item}_${from}_${to}`,
        sheet: theKho ? "TheKho" : "SoChiTiet",
        unit: `Đơn vị: ${company || "(chưa chọn công ty)"}`,
        title: theKho ? "THẺ KHO" : "SỔ CHI TIẾT VẬT TƯ",
        subtitles: [
          `Từ ngày ${dmy(from)} đến ngày ${dmy(to)}`,
          `Mặt hàng: ${item} — ${items.find((x) => x.ma === item)?.ten ?? ""}`,
          `Kho: ${warehouse}${dvt ? ` — ĐVT: ${dvt}` : ""}`,
        ],
        header: [theKho
          ? ["Ngày", "Số chứng từ", "Loại phiếu", "Nhập", "Xuất", "Tồn"]
          : ["Ngày", "Số chứng từ", "Loại phiếu", "Đơn giá", "Nhập SL", "Nhập thành tiền", "Xuất SL", "Xuất thành tiền", "Tồn SL", "Tồn giá trị"]],
        rows: [
          theKho
            ? ["", "Số dư đầu kỳ", "", "", "", dauKy.sl]
            : ["", "Số dư đầu kỳ", "", "", "", "", "", "", dauKy.sl, dauKy.tt],
          ...dong.map((d) => theKho
            ? [dmy(d.ngay), d.soCt, d.loaiCt, d.nhapSl || "", d.xuatSl || "", d.tonSl]
            : [dmy(d.ngay), d.soCt, d.loaiCt, d.donGia, d.nhapSl || "", d.nhapTt || "", d.xuatSl || "", d.xuatTt || "", d.tonSl, d.tonTt]),
        ],
        footer: [
          theKho
            ? ["", "Cộng phát sinh", "", cong.nhapSl, cong.xuatSl, ""]
            : ["", "Cộng phát sinh", "", "", cong.nhapSl, cong.nhapTt, cong.xuatSl, cong.xuatTt, "", ""],
          theKho
            ? ["", "Số dư cuối kỳ", "", "", "", cuoiKy.sl]
            : ["", "Số dư cuối kỳ", "", "", "", "", "", "", cuoiKy.sl, cuoiKy.tt],
        ],
        colWidths: theKho
          ? [12, 22, 18, 14, 14, 14]
          : [12, 22, 18, ...Array.from({ length: 7 }, () => 18)],
      });
      toast.success(`Đã xuất ${dong.length} dòng ra Excel`);
    } catch (e) {
      toast.error(`Không xuất được file: ${(e as Error).message}`);
    }
  }

  const loi = soQ.error ? adapter.mapError(soQ.error).message : null;
  const capItem = (itemsQ.data?.length ?? 0) >= ITEM_CAP;

  return (
    <div className="mf-view-card flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-end gap-2 border-b bg-card px-3 py-2.5">
        <div className="flex rounded-md border p-0.5">
          <Button size="sm" variant={theKho ? "ghost" : "secondary"} className="h-7" onClick={() => setTheKho(false)}>
            Sổ chi tiết vật tư
          </Button>
          <Button size="sm" variant={theKho ? "secondary" : "ghost"} className="h-7" onClick={() => setTheKho(true)}>
            Thẻ kho
          </Button>
        </div>

        <div className="relative w-40">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lọc mặt hàng…" className="h-8 pl-8" aria-label="Lọc mặt hàng" />
        </div>

        <Select value={item} onValueChange={setItem}>
          <SelectTrigger className="h-8 w-auto min-w-56"><SelectValue placeholder="Chọn mặt hàng…" /></SelectTrigger>
          <SelectContent>
            {items.map((x) => (
              <SelectItem key={x.ma} value={x.ma}>{x.ma} — {x.ten}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={warehouse} onValueChange={setWarehouse}>
          <SelectTrigger className="h-8 w-auto min-w-48"><SelectValue placeholder="Chọn kho…" /></SelectTrigger>
          <SelectContent>
            {(warehousesQ.data ?? []).map((w) => (
              <SelectItem key={String(w.name)} value={String(w.name)}>{String(w.name)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <PeriodPicker from={from} to={to} onChange={(f, t2) => { setFrom(f); setTo(t2); }} />

        <div className="ml-auto flex items-center gap-2">
          {capItem ? <Badge variant="warning" className="font-normal">Danh mục hiện {ITEM_CAP} mặt hàng gần nhất — gõ để lọc</Badge> : null}
          <Button size="sm" onClick={() => void xuatExcel()} disabled={!duFilter || (dong.length === 0 && !dauKy.sl)}>
            <Download className="size-4" /> Xuất Excel
          </Button>
        </div>
      </div>

      {!duFilter ? (
        <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
          <div className="max-w-md space-y-1">
            <p className="font-medium text-foreground">Chọn mặt hàng và kho để lập sổ</p>
            <p>
              Hai biểu này luôn lập cho <b>một mặt hàng tại một kho</b>. Đủ cả hai thì sổ mới có dòng
              số dư đầu kỳ để cột tồn bắt đầu đúng chỗ.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            <Table unwrapped>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead rowSpan={2} className="w-24">Ngày</TableHead>
                  <TableHead rowSpan={2}>Số chứng từ</TableHead>
                  <TableHead rowSpan={2}>Loại phiếu</TableHead>
                  {theKho ? null : <TableHead rowSpan={2} className="border-l text-right">Đơn giá</TableHead>}
                  <TableHead colSpan={theKho ? 1 : 2} className="border-l text-center">Nhập</TableHead>
                  <TableHead colSpan={theKho ? 1 : 2} className="border-l text-center">Xuất</TableHead>
                  <TableHead colSpan={theKho ? 1 : 2} className="border-l text-center">Tồn</TableHead>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  {(theKho ? ["Nhập", "Xuất", "Tồn"] : ["Nhập", "Xuất", "Tồn"]).map((k) =>
                    theKho ? (
                      <TableHead key={k} className="border-l text-right text-xs font-normal">{dvt || "SL"}</TableHead>
                    ) : (
                      [
                        <TableHead key={`${k}-sl`} className="border-l text-right text-xs font-normal">Số lượng</TableHead>,
                        <TableHead key={`${k}-tt`} className="text-right text-xs font-normal">Thành tiền</TableHead>,
                      ]
                    ),
                  )}
                </TableRow>
              </TableHeader>

              <TableBody>
                {loi ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={soCot} className="h-32 text-center text-destructive" role="alert">{loi}</TableCell>
                  </TableRow>
                ) : soQ.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      {Array.from({ length: soCot }).map((__, c) => (
                        <TableCell key={c}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={theKho ? 3 : 4} className="font-medium">Số dư đầu kỳ</TableCell>
                      {theKho ? (
                        <>
                          <TableCell className="border-l" />
                          <TableCell className="border-l" />
                          <TableCell className="border-l text-right font-semibold tabular-nums">{fmt.number(dauKy.sl)}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="border-l" /><TableCell />
                          <TableCell className="border-l" /><TableCell />
                          <TableCell className="border-l text-right font-semibold tabular-nums">{fmt.number(dauKy.sl)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{tien(dauKy.tt)}</TableCell>
                        </>
                      )}
                    </TableRow>

                    {dong.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={soCot} className="h-24 text-center text-muted-foreground">
                          Không có phát sinh từ {dmy(from)} đến {dmy(to)}.
                        </TableCell>
                      </TableRow>
                    ) : dong.map((d, i) => (
                      <TableRow key={`${d.soCt}-${i}`}>
                        <TableCell className="whitespace-nowrap text-xs">{dmy(d.ngay)}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{d.soCt}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{d.loaiCt}</TableCell>
                        {theKho ? null : <TableCell className="border-l text-right tabular-nums text-muted-foreground">{d.donGia ? tien(d.donGia) : "—"}</TableCell>}
                        <TableCell className={cn("border-l text-right tabular-nums", d.nhapSl > 0 && "text-success-text")}>{d.nhapSl ? fmt.number(d.nhapSl) : "—"}</TableCell>
                        {theKho ? null : <TableCell className="text-right tabular-nums text-muted-foreground">{d.nhapTt ? tien(d.nhapTt) : "—"}</TableCell>}
                        <TableCell className={cn("border-l text-right tabular-nums", d.xuatSl > 0 && "text-warning-text")}>{d.xuatSl ? fmt.number(d.xuatSl) : "—"}</TableCell>
                        {theKho ? null : <TableCell className="text-right tabular-nums text-muted-foreground">{d.xuatTt ? tien(d.xuatTt) : "—"}</TableCell>}
                        <TableCell className="border-l text-right font-semibold tabular-nums">{fmt.number(d.tonSl)}</TableCell>
                        {theKho ? null : <TableCell className="text-right font-medium tabular-nums">{tien(d.tonTt)}</TableCell>}
                      </TableRow>
                    ))}

                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={theKho ? 3 : 4} className="font-medium">Cộng phát sinh trong kỳ</TableCell>
                      <TableCell className="border-l text-right font-semibold tabular-nums text-success-text">{fmt.number(cong.nhapSl)}</TableCell>
                      {theKho ? null : <TableCell className="text-right font-medium tabular-nums">{tien(cong.nhapTt)}</TableCell>}
                      <TableCell className="border-l text-right font-semibold tabular-nums text-warning-text">{fmt.number(cong.xuatSl)}</TableCell>
                      {theKho ? null : <TableCell className="text-right font-medium tabular-nums">{tien(cong.xuatTt)}</TableCell>}
                      <TableCell className="border-l" />
                      {theKho ? null : <TableCell />}
                    </TableRow>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableCell colSpan={theKho ? 3 : 4} className="font-medium">Số dư cuối kỳ</TableCell>
                      {theKho ? (
                        <>
                          <TableCell className="border-l" />
                          <TableCell className="border-l" />
                          <TableCell className="border-l text-right font-semibold tabular-nums">{fmt.number(cuoiKy.sl)}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="border-l" /><TableCell />
                          <TableCell className="border-l" /><TableCell />
                          <TableCell className="border-l text-right font-semibold tabular-nums">{fmt.number(cuoiKy.sl)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{tien(cuoiKy.tt)}</TableCell>
                        </>
                      )}
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
            {theKho
              ? "Thẻ kho là biểu của thủ kho nên CHỈ theo dõi số lượng — muốn xem giá trị thì chuyển sang Sổ chi tiết vật tư."
              : "Cột Tồn là số luỹ kế do ERPNext ghi tại thời điểm ghi sổ, không phải cộng dồn lại trên màn hình."}
          </div>
        </>
      )}
    </div>
  );
}
