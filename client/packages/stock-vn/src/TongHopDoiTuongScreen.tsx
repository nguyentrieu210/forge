/** @jsxImportSource react */
/**
 * TỔNG HỢP NHẬP THEO NHÀ CUNG CẤP / TỔNG HỢP XUẤT THEO KHÁCH HÀNG.
 *
 * Câu hỏi biểu này trả lời: kỳ vừa rồi mua của ai bao nhiêu, bán cho ai bao nhiêu, chi tiết tới
 * từng mặt hàng. Kế toán và mua hàng đều cần, và đây là biểu MISA có mà bản trước chưa có.
 *
 * ── Vì sao lấy tiền từ CHỨNG TỪ chứ không từ sổ kho ───────────────────────────────────────────
 * Sổ kho chỉ biết GIÁ VỐN. Với chiều xuất bán, con số người ta hỏi là DOANH THU — hai số hoàn
 * toàn khác nhau. Nên số lượng và thành tiền ở đây đọc từ dòng hàng của chính chứng từ
 * (Purchase Receipt Item / Delivery Note Item), là nơi ghi giá mua và giá bán thật.
 *
 * ── Chỉ tính chứng từ ĐÃ GHI SỔ ───────────────────────────────────────────────────────────────
 * `docstatus = 1`. Phiếu nháp chưa tác động tồn kho và còn sửa được; gộp cả nháp vào thì con số
 * đổi mỗi lần ai đó mở phiếu ra sửa, và không khớp với bất kỳ biểu nào khác.
 */
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useLocaleFormat, useMetaForge, resolveDateRange, PeriodPicker, exportFormXlsx, ymdToDmy } from "@metaforge/views";
import {
  Button, Badge, Skeleton, toast,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@metaforge/ui";

const CAP_CT = 500;   // trần số chứng từ nạp một lần
const CAP_DONG = 3000; // trần số dòng hàng

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const dmy = ymdToDmy;

interface DongHang { ma: string; ten: string; dvt: string; sl: number; tien: number }
interface Nhom { doiTuong: string; soCt: number; tien: number; hang: DongHang[] }

export function TongHopDoiTuongScreen() {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const fmt = useLocaleFormat();
  const macDinh = resolveDateRange("this_month");
  const [from, setFrom] = useState(macDinh.from);
  const [to, setTo] = useState(macDinh.to);
  const [chieu, setChieu] = useState<"nhap" | "xuat">("nhap");

  const company = businessContext.company;
  const laNhap = chieu === "nhap";
  const DT = laNhap ? "Purchase Receipt" : "Delivery Note";
  const CHILD = laNhap ? "Purchase Receipt Item" : "Delivery Note Item";
  const fieldDoiTuong = laNhap ? "supplier" : "customer";
  const nhanDoiTuong = laNhap ? "Nhà cung cấp" : "Khách hàng";

  const q = useQuery({
    queryKey: [scopeKey, "tong-hop-doi-tuong", DT, from, to, company ?? ""],
    enabled: Boolean(from && to),
    queryFn: async () => {
      // 1) chứng từ đã ghi sổ trong kỳ
      const cts = await adapter.getList(DT, {
        fields: ["name", fieldDoiTuong, `${fieldDoiTuong}_name`, "posting_date"],
        filters: {
          docstatus: 1,
          posting_date: ["between", [from, to]],
          ...(company ? { company } : {}),
        } as never,
        orderBy: "posting_date desc",
        pageLength: CAP_CT,
      });
      if (cts.length === 0) return { nhom: [] as Nhom[], soCt: 0, chamTran: false };

      // 2) dòng hàng của đúng những chứng từ đó.
      // Bảng CON không đọc được bằng getList thường — Frappe đòi kèm `parent` để biết bảng con này
      // thuộc doctype nào (nếu không sẽ báo lỗi quyền).
      const rows = await adapter.callGet<Array<Record<string, unknown>>>("frappe.client.get_list", {
        doctype: CHILD,
        parent: DT,
        fields: JSON.stringify(["parent", "item_code", "item_name", "qty", "amount", "uom"]),
        filters: JSON.stringify([["parent", "in", cts.map((c) => String(c.name))]]),
        limit_page_length: CAP_DONG,
      });

      const tenTheoCt = new Map<string, string>();
      for (const c of cts) {
        tenTheoCt.set(String(c.name), String(c[`${fieldDoiTuong}_name`] ?? c[fieldDoiTuong] ?? "(không rõ)"));
      }
      const ctTheoDoiTuong = new Map<string, Set<string>>();
      const gom = new Map<string, Map<string, DongHang>>();
      for (const r of rows ?? []) {
        const ct = String(r.parent ?? "");
        const dt = tenTheoCt.get(ct) ?? "(không rõ)";
        if (!ctTheoDoiTuong.has(dt)) ctTheoDoiTuong.set(dt, new Set());
        ctTheoDoiTuong.get(dt)!.add(ct);
        if (!gom.has(dt)) gom.set(dt, new Map());
        const theoHang = gom.get(dt)!;
        const ma = String(r.item_code ?? "");
        const cu = theoHang.get(ma);
        if (cu) { cu.sl += num(r.qty); cu.tien += num(r.amount); }
        else theoHang.set(ma, { ma, ten: String(r.item_name ?? ma), dvt: String(r.uom ?? ""), sl: num(r.qty), tien: num(r.amount) });
      }

      const nhom: Nhom[] = [...gom.entries()].map(([doiTuong, theoHang]) => {
        const hang = [...theoHang.values()].sort((a, b) => b.tien - a.tien);
        return {
          doiTuong,
          soCt: ctTheoDoiTuong.get(doiTuong)?.size ?? 0,
          tien: hang.reduce((s, h) => s + h.tien, 0),
          hang,
        };
      }).sort((a, b) => b.tien - a.tien); // ai nhiều tiền nhất lên đầu — thứ người ta tìm trước

      return { nhom, soCt: cts.length, chamTran: cts.length >= CAP_CT || (rows?.length ?? 0) >= CAP_DONG };
    },
  });

  const nhom = q.data?.nhom ?? [];
  const tongTien = useMemo(() => nhom.reduce((s, n) => s + n.tien, 0), [nhom]);
  const tien = (v: number) => fmt.number(v, 0);

  async function xuatExcel() {
    try {
      await exportFormXlsx({
        filename: `${laNhap ? "nhap-theo-ncc" : "xuat-theo-kh"}_${from}_${to}`,
        sheet: laNhap ? "NhapTheoNCC" : "XuatTheoKH",
        unit: `Đơn vị: ${company || "(chưa chọn công ty)"}`,
        title: laNhap ? "TỔNG HỢP NHẬP THEO NHÀ CUNG CẤP" : "TỔNG HỢP XUẤT THEO KHÁCH HÀNG",
        subtitles: [`Từ ngày ${dmy(from)} đến ngày ${dmy(to)}`],
        // Đổ PHẲNG, mỗi dòng đủ tên đối tượng — để người dùng còn xoay PivotTable trong Excel.
        // Xuất dạng nhóm lồng nhau thì nhìn giống biểu nhưng Excel không xoay được.
        header: [[nhanDoiTuong, "Số chứng từ", "Mã hàng", "Tên hàng", "ĐVT", "Số lượng", "Thành tiền"]],
        rows: nhom.flatMap((n) => n.hang.map((h) => [n.doiTuong, n.soCt, h.ma, h.ten, h.dvt, h.sl, h.tien])),
        footer: [["TỔNG CỘNG", "", "", "", "", "", tongTien]],
        colWidths: [34, 12, 16, 32, 8, 14, 18],
      });
      toast.success(`Đã xuất ${nhom.length} ${nhanDoiTuong.toLowerCase()}`);
    } catch (e) {
      toast.error(`Không xuất được file: ${(e as Error).message}`);
    }
  }

  const loi = q.error ? adapter.mapError(q.error).message : null;

  return (
    <div className="mf-view-card flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-end gap-2 border-b bg-card px-3 py-2.5">
        <div className="flex rounded-md border p-0.5">
          <Button size="sm" variant={laNhap ? "secondary" : "ghost"} className="h-7" onClick={() => setChieu("nhap")}>
            Nhập theo nhà cung cấp
          </Button>
          <Button size="sm" variant={laNhap ? "ghost" : "secondary"} className="h-7" onClick={() => setChieu("xuat")}>
            Xuất theo khách hàng
          </Button>
        </div>
        <PeriodPicker from={from} to={to} onChange={(f, t2) => { setFrom(f); setTo(t2); }} />
        <div className="ml-auto flex items-center gap-2">
          {q.data?.chamTran ? <Badge variant="warning" className="font-normal">Chạm trần {CAP_CT} chứng từ — thu hẹp kỳ để đủ số</Badge> : null}
          <Button variant="outline" size="sm" onClick={() => void q.refetch()} loading={q.isFetching}>Tải lại</Button>
          <Button size="sm" onClick={() => void xuatExcel()} disabled={nhom.length === 0}>
            <Download className="size-4" /> Xuất Excel
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table unwrapped>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead>{nhanDoiTuong} / Mặt hàng</TableHead>
              <TableHead>ĐVT</TableHead>
              <TableHead className="text-right">Số lượng</TableHead>
              <TableHead className="text-right">Thành tiền</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loi ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="h-32 text-center text-destructive" role="alert">{loi}</TableCell>
              </TableRow>
            ) : q.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 4 }).map((__, c) => <TableCell key={c}><Skeleton className="h-4 w-24" /></TableCell>)}
                </TableRow>
              ))
            ) : nhom.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  Không có phiếu {laNhap ? "nhập" : "xuất"} nào đã ghi sổ từ {dmy(from)} đến {dmy(to)}.
                </TableCell>
              </TableRow>
            ) : (
              nhom.map((n) => (
                // Fragment phải mang key: nhóm gồm 1 dòng tiêu đề + n dòng hàng, không bọc thêm
                // được thẻ nào khác vì <tbody> chỉ nhận <tr>.
                <Fragment key={n.doiTuong}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell className="font-medium">
                      {n.doiTuong}
                      <span className="ml-2 font-normal text-muted-foreground">{n.soCt} phiếu · {n.hang.length} mặt hàng</span>
                    </TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right font-semibold tabular-nums">{tien(n.tien)}</TableCell>
                  </TableRow>
                  {n.hang.map((h) => (
                    <TableRow key={`${n.doiTuong}::${h.ma}`}>
                      <TableCell className="pl-8">
                        <span className="block truncate">{h.ten}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{h.ma}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{h.dvt}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt.number(h.sl)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{tien(h.tien)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t bg-card px-3 py-2 text-sm">
        <span className="text-muted-foreground">{nhom.length} {nhanDoiTuong.toLowerCase()} · {q.data?.soCt ?? 0} phiếu</span>
        <span className="ml-auto tabular-nums text-muted-foreground">
          Tổng {laNhap ? "giá trị nhập" : "doanh thu"} <b className="text-foreground">{tien(tongTien)}</b>
        </span>
      </div>
      <div className="border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        Chỉ tính phiếu <b>đã ghi sổ</b>. Số tiền lấy từ chính chứng từ ({laNhap ? "giá mua" : "giá bán"}), không phải giá vốn trên sổ kho.
      </div>
    </div>
  );
}
