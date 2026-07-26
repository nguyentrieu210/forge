/** @jsxImportSource react */
/**
 * Màn "Tồn kho" — BRD §10 WMS-001 (tồn theo Company/kho/Item) và WMS-011 (không pick vượt khả dụng).
 *
 * Nguồn dữ liệu: DocType `Bin` chuẩn của ERPNext — đây CHÍNH LÀ bảng tồn theo Item × Warehouse mà
 * Stock Ledger cập nhật, nên không vi phạm §6 nguyên tắc #3 ("không tạo stock ledger thứ hai"):
 * màn này chỉ ĐỌC, không có đường nào ghi tồn.
 *
 * Vì sao không dùng list generic của DocType `Bin`: cột mặc định của Bin là tên field kỹ thuật và
 * thiếu đúng con số thủ kho cần — "còn lấy được bao nhiêu". Khả dụng = tồn thực tế − đang giữ, phải
 * tự tính, không có sẵn thành field.
 */
import { useMemo, useState } from "react";
import { Search, Warehouse as WarehouseIcon } from "lucide-react";
import { withAppBase } from "@metaforge/core";
import { useList, useLocaleFormat, useMetaForge } from "@metaforge/views";
import {
  Button, Input, Badge, Skeleton, cn,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@metaforge/ui";

/** Field của Bin — đều là field lõi ERPNext, ổn định qua nhiều phiên bản. */
const BIN_FIELDS = ["name", "item_code", "warehouse", "actual_qty", "reserved_qty", "stock_uom"];
const PAGE_LENGTH = 200;

const ALL_WAREHOUSES = "__all__";

interface BinRow {
  item_code: string;
  warehouse: string;
  actual: number;
  reserved: number;
  available: number;
  uom: string;
}

/**
 * Ảnh thu nhỏ của mặt hàng. Không có ảnh thì hiện chữ cái đầu trên nền xám — KHÔNG để ô trống,
 * vì hàng loạt ô trống làm bảng nhìn như đang lỗi tải ảnh.
 */
function ItemThumb({ src, alt }: { src?: string; alt: string }) {
  // Ghép BASE app vào đường dẫn Frappe trả về — xem withAppBase.
  src = src ? withAppBase(src, import.meta.env.BASE_URL) : src;
  if (src) {
    return <img src={src} alt={alt} className="size-8 shrink-0 rounded-md border object-cover" loading="lazy" />;
  }
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
      {(alt || "?").trim().charAt(0).toLocaleUpperCase("vi")}
    </span>
  );
}

export function TonKhoScreen() {
  const { adapter } = useMetaForge();
  const fmt = useLocaleFormat();
  const [warehouse, setWarehouse] = useState<string>(ALL_WAREHOUSES);
  const [q, setQ] = useState("");

  // Danh sách kho để lọc. `is_group: 0` — chỉ kho lá mới chứa hàng (WMS-001: tồn theo Warehouse leaf);
  // kho nhóm chỉ là nút cây, chọn vào sẽ luôn ra 0 và làm người dùng tưởng mất hàng.
  const warehousesQ = useList("Warehouse", {
    fields: ["name"],
    filters: { is_group: 0, disabled: 0 },
    orderBy: "name asc",
    pageLength: 500,
  });

  // Chỉ lấy dòng CÒN HÀNG: Bin tồn tại vĩnh viễn cho mọi cặp Item×Warehouse từng phát sinh, nên
  // không lọc thì màn hình đầy dòng 0 và người dùng phải tự bới tìm thứ thật sự còn.
  const binsQ = useList("Bin", {
    fields: BIN_FIELDS,
    filters: {
      actual_qty: [">", 0],
      ...(warehouse !== ALL_WAREHOUSES ? { warehouse } : {}),
    },
    orderBy: "item_code asc",
    pageLength: PAGE_LENGTH,
  });

  /**
   * Bin chỉ có MÃ vật tư, không có tên/nhóm/ảnh — nên bảng tồn kho trước đây là một cột mã trần
   * kiểu "TP-SS400-3", người dùng phải tự thuộc lòng mã mới biết đang nhìn hàng gì.
   * Nạp thêm bản ghi Item cho đúng các mã đang hiện trên trang này (không phải toàn bộ danh mục).
   */
  const codes = useMemo(
    () => [...new Set((binsQ.data ?? []).map((d) => String(d.item_code ?? "")).filter(Boolean))],
    [binsQ.data],
  );
  const itemsQ = useList(
    "Item",
    {
      fields: ["name", "item_name", "item_group", "image"],
      filters: codes.length ? { name: ["in", codes] } : undefined,
      pageLength: PAGE_LENGTH,
    },
    codes.length > 0,
  );
  const itemInfo = useMemo(() => {
    const m = new Map<string, { name: string; group: string; image: string }>();
    for (const d of itemsQ.data ?? []) {
      m.set(String(d.name), {
        name: String(d.item_name ?? d.name),
        group: String(d.item_group ?? ""),
        image: String(d.image ?? ""),
      });
    }
    return m;
  }, [itemsQ.data]);

  const rows: BinRow[] = useMemo(() => {
    const raw = (binsQ.data ?? []).map((d) => {
      const actual = Number(d.actual_qty) || 0;
      const reserved = Number(d.reserved_qty) || 0;
      return {
        item_code: String(d.item_code ?? ""),
        warehouse: String(d.warehouse ?? ""),
        actual,
        reserved,
        // WMS-011: đây là con số quyết định được phép lấy bao nhiêu. Chặn âm — reserved có thể lớn
        // hơn actual trong lúc chứng từ đang dở dang, hiện số âm sẽ gây hiểu nhầm là kho đang thiếu.
        available: Math.max(0, actual - reserved),
        uom: String(d.stock_uom ?? ""),
      };
    });
    const needle = q.trim().toLocaleLowerCase("vi");
    if (!needle) return raw;
    // Tìm theo CẢ mã lẫn TÊN hàng: người dùng nhớ "thép tấm" chứ hiếm khi nhớ "TP-SS400-3".
    return raw.filter((r) => {
      const info = itemInfo.get(r.item_code);
      const hay = `${r.item_code} ${info?.name ?? ""} ${info?.group ?? ""}`.toLocaleLowerCase("vi");
      return hay.includes(needle);
    });
  }, [binsQ.data, q, itemInfo]);

  const totals = useMemo(
    () => rows.reduce((acc, r) => ({ actual: acc.actual + r.actual, available: acc.available + r.available }), { actual: 0, available: 0 }),
    [rows],
  );

  const error = binsQ.error ?? warehousesQ.error;
  const atCap = (binsQ.data?.length ?? 0) >= PAGE_LENGTH;

  return (
    <div className="mf-view-card flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2.5">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã vật tư…"
            className="pl-8"
            aria-label="Tìm mã vật tư"
          />
        </div>

        <Select value={warehouse} onValueChange={setWarehouse}>
          <SelectTrigger className="w-auto min-w-56 gap-2">
            <WarehouseIcon className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_WAREHOUSES}>Tất cả kho</SelectItem>
            {(warehousesQ.data ?? []).map((w) => (
              <SelectItem key={String(w.name)} value={String(w.name)}>{String(w.name)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {atCap ? (
            <Badge variant="warning" className="font-normal">
              Hiện {PAGE_LENGTH} dòng đầu — lọc theo kho để xem đủ
            </Badge>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void binsQ.refetch()} loading={binsQ.isFetching}>
            Tải lại
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table unwrapped>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead>Vật tư</TableHead>
              <TableHead>Nhóm hàng</TableHead>
              <TableHead>Kho</TableHead>
              <TableHead className="text-right">Tồn thực tế</TableHead>
              <TableHead className="text-right">Đang giữ</TableHead>
              <TableHead className="text-right">Khả dụng</TableHead>
              <TableHead>ĐVT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-32 text-center text-destructive" role="alert">
                  {adapter.mapError(error).message}
                </TableCell>
              </TableRow>
            ) : binsQ.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 7 }).map((__, c) => (
                    <TableCell key={c}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {q.trim() ? `Không có vật tư nào khớp "${q.trim()}".` : "Chưa có hàng tồn trong phạm vi đang chọn."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={`${r.item_code}::${r.warehouse}`}>
                  {/* Ảnh + TÊN hàng, mã xuống dòng phụ. Trước đây chỉ có mã trần nên phải thuộc
                      lòng mã mới biết đang nhìn hàng gì. */}
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <ItemThumb src={itemInfo.get(r.item_code)?.image} alt={itemInfo.get(r.item_code)?.name ?? r.item_code} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{itemInfo.get(r.item_code)?.name ?? r.item_code}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">{r.item_code}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{itemInfo.get(r.item_code)?.group || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.warehouse}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.number(r.actual)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.reserved > 0 && "text-warning-text")}>
                    {r.reserved > 0 ? fmt.number(r.reserved) : "—"}
                  </TableCell>
                  {/* Khả dụng = 0 nghĩa là còn hàng vật lý nhưng đã bị giữ hết cho đơn khác — phải
                      nhìn ra ngay, nếu không thủ kho sẽ hứa giao rồi mới phát hiện không lấy được. */}
                  <TableCell className={cn("text-right font-semibold tabular-nums", r.available === 0 && "text-destructive-text")}>
                    {fmt.number(r.available)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.uom}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t bg-card px-3 py-2 text-sm">
        <span className="text-muted-foreground">{rows.length} dòng</span>
        <span className="ml-auto flex items-center gap-4 tabular-nums">
          <span className="text-muted-foreground">Tổng tồn <b className="text-foreground">{fmt.number(totals.actual)}</b></span>
          <span className="text-muted-foreground">Tổng khả dụng <b className="text-foreground">{fmt.number(totals.available)}</b></span>
        </span>
      </div>
    </div>
  );
}
