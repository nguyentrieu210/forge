/** @jsxImportSource react */
/**
 * Báo cáo TỔNG HỢP NHẬP XUẤT TỒN — mẫu quen thuộc của kế toán kho Việt Nam
 * (tương đương mẫu S11-DN của TT200 / bảng "Tổng hợp Nhập Xuất Tồn" của MISA):
 *
 *   Mã hàng · Tên hàng · ĐVT · Tồn đầu kỳ (SL, Giá trị) · Nhập trong kỳ · Xuất trong kỳ · Tồn cuối kỳ
 *
 * ── Vì sao KHÔNG tự cộng sổ mà gọi report `Stock Balance` của ERPNext ──────────────────────────
 * Tồn đầu kỳ và giá trị tồn không phải phép cộng trừ đơn giản: giá trị phụ thuộc phương pháp tính
 * giá (FIFO / bình quân gia quyền) và phải khớp với bút toán kế toán đã ghi. ERPNext tính sẵn từ
 * Stock Ledger Entry với đúng phương pháp cấu hình trên từng Item. Tự cộng ở phía trình duyệt sẽ
 * ra một bộ số THỨ HAI lệch với sổ cái — sai kiểu nguy hiểm nhất vì trông vẫn hợp lý.
 * Đây cũng là nguyên tắc #3 của BRD §6: không dựng sổ kho thứ hai.
 *
 * Việc của màn này là phần ERPNext KHÔNG làm: bố cục đúng mẫu VN, gộp tiêu đề hai tầng, tên cột
 * tiếng Việt đúng nghiệp vụ, dòng tổng cộng, và xuất ra file Excel đúng biểu.
 *
 * ── Nhãn cột gốc của ERPNext không dùng được ──────────────────────────────────────────────────
 * Bản dịch máy sẵn có trên site đọc rất tối nghĩa: in_qty = "Trong số lượng", in_val = "Theo giá
 * trị", val_rate = "Tỷ giá định giá", bal_qty = "Số lượng cân đối". Nên màn này đặt lại nhãn theo
 * đúng từ vựng kế toán kho, không lấy `column.label` từ server.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Search } from "lucide-react";
import { useList, useLocaleFormat, useMetaForge, resolveDateRange, PeriodPicker, exportFormXlsx, ymdToDmy } from "@metaforge/views";
import {
  Button, Input, Badge, Skeleton, Checkbox, cn, toast,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@metaforge/ui";

const ALL = "__all__";
const REPORT = "Stock Balance";

/** Một dòng của biểu — đã quy về đúng từ vựng kế toán, không còn tên field của ERPNext. */
interface XntRow {
  ma: string;
  ten: string;
  dvt: string;
  kho: string;
  nhomHang: string;
  dauSl: number; dauGt: number;
  nhapSl: number; nhapGt: number;
  xuatSl: number; xuatGt: number;
  cuoiSl: number; cuoiGt: number;
  /** Tồn đầu + Nhập − Xuất − Tồn cuối. Khác 0 là số liệu có vấn đề — xem chú thích ở chỗ dùng. */
  lech: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

const dmy = ymdToDmy;

export function XuatNhapTonScreen() {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const fmt = useLocaleFormat();

  const macDinh = resolveDateRange("this_month");
  const [from, setFrom] = useState(macDinh.from);
  const [to, setTo] = useState(macDinh.to);
  const [warehouse, setWarehouse] = useState<string>(ALL);
  const [itemGroup, setItemGroup] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [anDongTrong, setAnDongTrong] = useState(true);

  const company = businessContext.company;

  const warehousesQ = useList("Warehouse", {
    fields: ["name"],
    filters: { is_group: 0, disabled: 0, ...(company ? { company } : {}) },
    orderBy: "name asc",
    pageLength: 500,
  });
  const groupsQ = useList("Item Group", {
    fields: ["name"],
    filters: { is_group: 0 },
    orderBy: "name asc",
    pageLength: 500,
  });

  const filters = useMemo(() => {
    const f: Record<string, unknown> = { from_date: from, to_date: to };
    if (company) f.company = company;
    if (warehouse !== ALL) f.warehouse = warehouse;
    if (itemGroup !== ALL) f.item_group = itemGroup;
    // KHÔNG truyền item_code ở đây. Bộ lọc đó của Stock Balance là MultiSelectList: đưa vào một
    // chuỗi thì report sập 500 ("'str' object has no attribute 'nodes_'"). Tìm theo mã/tên làm ở
    // phía trình duyệt bên dưới.
    return f;
  }, [from, to, company, warehouse, itemGroup]);

  const reportQ = useQuery({
    queryKey: [scopeKey, "xnt", JSON.stringify(filters)],
    queryFn: () => adapter.runReport(REPORT, filters),
    enabled: Boolean(from && to),
  });

  const all: XntRow[] = useMemo(() => {
    const res = (reportQ.data?.result ?? []) as Array<Record<string, unknown>>;
    return res.filter((r) => r && typeof r === "object" && !Array.isArray(r)).map((r) => {
      const dauSl = num(r.opening_qty), nhapSl = num(r.in_qty), xuatSl = num(r.out_qty), cuoiSl = num(r.bal_qty);
      return {
        ma: String(r.item_code ?? ""),
        ten: String(r.item_name ?? r.item_code ?? ""),
        dvt: String(r.stock_uom ?? ""),
        kho: String(r.warehouse ?? ""),
        nhomHang: String(r.item_group ?? ""),
        dauSl, dauGt: num(r.opening_val),
        nhapSl, nhapGt: num(r.in_val),
        xuatSl, xuatGt: num(r.out_val),
        cuoiSl, cuoiGt: num(r.bal_val),
        lech: dauSl + nhapSl - xuatSl - cuoiSl,
      };
    });
  }, [reportQ.data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("vi");
    return all.filter((r) => {
      // Dòng không phát sinh VÀ không còn tồn thì không có ý nghĩa trên biểu — nhưng phải để người
      // dùng bật lại được, vì khi đối chiếu số liệu người ta cần thấy đủ mọi mã đã từng phát sinh.
      if (anDongTrong && !r.dauSl && !r.nhapSl && !r.xuatSl && !r.cuoiSl) return false;
      if (!needle) return true;
      return `${r.ma} ${r.ten} ${r.nhomHang}`.toLocaleLowerCase("vi").includes(needle);
    });
  }, [all, q, anDongTrong]);

  /**
   * Dòng TỔNG CỘNG chỉ cộng GIÁ TRỊ, cố ý bỏ trống các cột số lượng.
   *
   * Trong cùng một biểu có nhiều đơn vị tính (site này đang có 10: Cái, Kg, Lít, Mét, Cuộn…).
   * Cộng "500 Cái + 20 Kg + 3 Cuộn = 523" là một con số vô nghĩa nhưng trông rất giống số thật,
   * nên người đọc dễ tin và mang đi đối chiếu. Tiền thì cùng một đơn vị nên cộng được.
   */
  const tong = useMemo(
    () => rows.reduce(
      (a, r) => ({ dau: a.dau + r.dauGt, nhap: a.nhap + r.nhapGt, xuat: a.xuat + r.xuatGt, cuoi: a.cuoi + r.cuoiGt }),
      { dau: 0, nhap: 0, xuat: 0, cuoi: 0 },
    ),
    [rows],
  );

  const soDongLech = useMemo(() => rows.filter((r) => Math.abs(r.lech) > 0.001).length, [rows]);
  const hienCotKho = warehouse === ALL;
  const soCot = hienCotKho ? 13 : 12;

  // Giá trị hiện theo số nguyên: VND không có phần lẻ, để 2 số 0 thừa sau dấu phẩy ở mọi ô làm
  // bảng dày đặc mà không thêm thông tin nào.
  const tien = (v: number) => fmt.number(v, 0);

  async function xuatExcel() {
    try {
      const tenKho = warehouse === ALL ? "Tất cả kho" : warehouse;
      const c0 = hienCotKho ? 5 : 4; // cột đầu tiên của khối số liệu
      await exportFormXlsx({
        filename: `nhap-xuat-ton_${from}_${to}`,
        sheet: "NhapXuatTon",
        unit: `Đơn vị: ${company || "(chưa chọn công ty)"}`,
        title: "BÁO CÁO TỔNG HỢP NHẬP XUẤT TỒN",
        subtitles: [
          `Từ ngày ${dmy(from)} đến ngày ${dmy(to)}`,
          `Kho: ${tenKho}${itemGroup !== ALL ? ` — Nhóm hàng: ${itemGroup}` : ""}`,
        ],
        header: [
          ["STT", "Mã hàng", "Tên hàng", "ĐVT", ...(hienCotKho ? ["Kho"] : []),
            "Tồn đầu kỳ", "", "Nhập trong kỳ", "", "Xuất trong kỳ", "", "Tồn cuối kỳ", ""],
          ["", "", "", "", ...(hienCotKho ? [""] : []),
            "Số lượng", "Giá trị", "Số lượng", "Giá trị", "Số lượng", "Giá trị", "Số lượng", "Giá trị"],
        ],
        headerMerges: [
          // bốn khối số liệu, mỗi khối gộp 2 ô ở hàng tiêu đề trên
          ...[0, 2, 4, 6].map((k) => ({ r: 0, c: c0 + k, colSpan: 2 })),
          // các cột mô tả gộp DỌC qua hai hàng tiêu đề
          ...Array.from({ length: c0 }, (_, k) => ({ r: 0, c: k, rowSpan: 2 })),
        ],
        rows: rows.map((r, i) => [i + 1, r.ma, r.ten, r.dvt, ...(hienCotKho ? [r.kho] : []),
          r.dauSl, r.dauGt, r.nhapSl, r.nhapGt, r.xuatSl, r.xuatGt, r.cuoiSl, r.cuoiGt]),
        // Ô số lượng của dòng tổng để TRỐNG — xem chú thích ở `tong`.
        footer: [["", "TỔNG CỘNG", "", "", ...(hienCotKho ? [""] : []),
          "", tong.dau, "", tong.nhap, "", tong.xuat, "", tong.cuoi]],
        // Cột số phải đủ rộng cho con số DÀI NHẤT — dòng tổng cộng. Giá trị kho cỡ vài trăm tỉ là
        // "521.392.448.737": 15 ký tự. Cột 14 ký tự thì Excel hiện "#####" chứ không hiện số.
        colWidths: [5, 16, 34, 8, ...(hienCotKho ? [22] : []), ...Array.from({ length: 8 }, () => 18)],
      });
      toast.success(`Đã xuất ${rows.length} dòng ra Excel`);
    } catch (e) {
      toast.error(`Không xuất được file: ${(e as Error).message}`);
    }
  }

  const loi = reportQ.error ? adapter.mapError(reportQ.error).message : null;

  return (
    <div className="mf-view-card flex h-full flex-col overflow-hidden">
      {/* ── Thanh lọc ─────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2 border-b bg-card px-3 py-2.5">
        <PeriodPicker
          from={from}
          to={to}
          onChange={(f, t2) => { setFrom(f); setTo(t2); }}
          presets={["this_month", "last_month", "this_quarter", "this_year", "last_year"]}
        />

        <Select value={warehouse} onValueChange={setWarehouse}>
          <SelectTrigger className="h-8 w-auto min-w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả kho</SelectItem>
            {(warehousesQ.data ?? []).map((w) => (
              <SelectItem key={String(w.name)} value={String(w.name)}>{String(w.name)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={itemGroup} onValueChange={setItemGroup}>
          <SelectTrigger className="h-8 w-auto min-w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi nhóm hàng</SelectItem>
            {(groupsQ.data ?? []).map((g) => (
              <SelectItem key={String(g.name)} value={String(g.name)}>{String(g.name)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative w-44">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã hoặc tên hàng…" className="h-8 pl-8" aria-label="Tìm mã hoặc tên hàng" />
        </div>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={anDongTrong} onCheckedChange={(v) => setAnDongTrong(Boolean(v))} />
          Ẩn dòng không phát sinh
        </label>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void reportQ.refetch()} loading={reportQ.isFetching}>
            Tải lại
          </Button>
          <Button size="sm" onClick={() => void xuatExcel()} disabled={rows.length === 0}>
            <Download className="size-4" /> Xuất Excel
          </Button>
        </div>
      </div>

      {/* Không chọn công ty thì báo cáo gộp số liệu của NHIỀU pháp nhân vào một biểu — sai về mặt
          kế toán. Nói rõ thay vì lặng lẽ trả ra một bảng trông vẫn bình thường. */}
      {!company ? (
        <div className="flex items-center gap-2 border-b bg-warning/10 px-3 py-1.5 text-xs text-warning-text">
          <AlertTriangle className="size-3.5 shrink-0" />
          Chưa chọn công ty — biểu đang gộp số liệu của mọi pháp nhân. Chọn công ty ở thanh trên để có biểu nộp được.
        </div>
      ) : null}

      {/* Cân đối phải luôn đúng: Tồn đầu + Nhập − Xuất = Tồn cuối. Lệch nghĩa là sổ kho có vấn đề
          (chứng từ huỷ dở dang, sửa ngày ghi sổ ngược…) — phải báo, không được để người dùng mang
          một biểu sai đi đối chiếu. */}
      {soDongLech > 0 ? (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive-text" role="alert">
          <AlertTriangle className="size-3.5 shrink-0" />
          {soDongLech} dòng không cân đối (Tồn đầu + Nhập − Xuất ≠ Tồn cuối) — đã tô đỏ. Cần kiểm tra lại sổ kho trước khi nộp biểu.
        </div>
      ) : null}

      {/* ── Bảng ─────────────────────────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table unwrapped>
          <TableHeader className="sticky top-0 z-10">
            {/* Tiêu đề HAI TẦNG đúng mẫu: bốn khối Tồn đầu / Nhập / Xuất / Tồn cuối, mỗi khối hai cột. */}
            <TableRow className="hover:bg-transparent">
              <TableHead rowSpan={2} className="w-12 text-right">STT</TableHead>
              <TableHead rowSpan={2}>Mã hàng</TableHead>
              <TableHead rowSpan={2}>Tên hàng</TableHead>
              <TableHead rowSpan={2}>ĐVT</TableHead>
              {hienCotKho ? <TableHead rowSpan={2}>Kho</TableHead> : null}
              <TableHead colSpan={2} className="border-l text-center">Tồn đầu kỳ</TableHead>
              <TableHead colSpan={2} className="border-l text-center">Nhập trong kỳ</TableHead>
              <TableHead colSpan={2} className="border-l text-center">Xuất trong kỳ</TableHead>
              <TableHead colSpan={2} className="border-l text-center">Tồn cuối kỳ</TableHead>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              {["Tồn đầu", "Nhập", "Xuất", "Tồn cuối"].map((k) => [
                <TableHead key={`${k}-sl`} className="border-l text-right text-xs font-normal">Số lượng</TableHead>,
                <TableHead key={`${k}-gt`} className="text-right text-xs font-normal">Giá trị</TableHead>,
              ])}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loi ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={soCot} className="h-32 text-center text-destructive" role="alert">{loi}</TableCell>
              </TableRow>
            ) : reportQ.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: soCot }).map((__, c) => (
                    <TableCell key={c}><Skeleton className="h-4 w-16" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={soCot} className="h-32 text-center text-muted-foreground">
                  {q.trim()
                    ? `Không có mặt hàng nào khớp "${q.trim()}".`
                    : `Không có phát sinh nào từ ${dmy(from)} đến ${dmy(to)} trong phạm vi đang chọn.`}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={`${r.ma}::${r.kho}`} className={cn(Math.abs(r.lech) > 0.001 && "bg-destructive/5")}>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{r.ma}</TableCell>
                  <TableCell className="font-medium">{r.ten}</TableCell>
                  <TableCell className="text-muted-foreground">{r.dvt}</TableCell>
                  {hienCotKho ? <TableCell className="whitespace-nowrap text-muted-foreground">{r.kho}</TableCell> : null}
                  <TableCell className="border-l text-right tabular-nums">{fmt.number(r.dauSl)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{tien(r.dauGt)}</TableCell>
                  <TableCell className={cn("border-l text-right tabular-nums", r.nhapSl > 0 && "text-success-text")}>{fmt.number(r.nhapSl)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{tien(r.nhapGt)}</TableCell>
                  <TableCell className={cn("border-l text-right tabular-nums", r.xuatSl > 0 && "text-warning-text")}>{fmt.number(r.xuatSl)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{tien(r.xuatGt)}</TableCell>
                  <TableCell className="border-l text-right font-semibold tabular-nums">{fmt.number(r.cuoiSl)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{tien(r.cuoiGt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Dòng tổng ────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t bg-card px-3 py-2 text-sm">
        <span className="text-muted-foreground">{rows.length} dòng</span>
        {reportQ.data && rows.length !== all.length ? (
          <Badge variant="secondary" className="font-normal">đã lọc từ {all.length} dòng</Badge>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-4 tabular-nums">
          <span className="text-muted-foreground">Giá trị tồn đầu <b className="text-foreground">{tien(tong.dau)}</b></span>
          <span className="text-muted-foreground">Nhập <b className="text-success-text">{tien(tong.nhap)}</b></span>
          <span className="text-muted-foreground">Xuất <b className="text-warning-text">{tien(tong.xuat)}</b></span>
          <span className="text-muted-foreground">Tồn cuối <b className="text-foreground">{tien(tong.cuoi)}</b></span>
        </span>
      </div>
      <div className="border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        Tổng cộng chỉ tính theo <b>giá trị</b> — số lượng của các đơn vị tính khác nhau (Cái, Kg, Mét…) không cộng chung được.
      </div>
    </div>
  );
}
