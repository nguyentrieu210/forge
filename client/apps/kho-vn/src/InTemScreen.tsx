/** @jsxImportSource react */
/**
 * IN TEM mã vạch / QR cho mặt hàng.
 *
 * Đây là thứ mọi kho đều cần mà app trước đó không có: hàng về, dán tem, từ đó mới quét được.
 * Không có tem thì toàn bộ luồng "quét là xong" ở màn Nhập hàng nhanh vô nghĩa.
 *
 * In bằng CSS @media print, không sinh PDF phía máy chủ: không phải cài thêm gì trên VPS, và in
 * được ra cả máy in tem chuyên dụng lẫn máy in A4 thường (chọn số tem mỗi hàng cho khớp khổ giấy).
 */
import { useMemo, useState } from "react";
import { Printer, Search } from "lucide-react";
import { useList } from "@metaforge/views";
import { Button, Input, Checkbox, Label, Separator, cn } from "@metaforge/ui";
import { QrCode, Barcode128 } from "./qr.js";

/** Khổ tem: quyết định bao nhiêu tem một hàng khi in. */
const LAYOUTS = [
  { key: "3", label: "3 tem / hàng (A4)", cols: 3 },
  { key: "4", label: "4 tem / hàng (A4)", cols: 4 },
  { key: "2", label: "2 tem / hàng (tem lớn)", cols: 2 },
  { key: "1", label: "1 tem / hàng (máy in tem)", cols: 1 },
] as const;

export function InTemScreen() {
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [cols, setCols] = useState(3);
  const [showQr, setShowQr] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);

  const itemsQ = useList("Item", {
    fields: ["name", "item_name", "stock_uom"],
    orFilters: term ? { item_code: ["like", `%${term}%`], item_name: ["like", `%${term}%`] } : undefined,
    filters: { disabled: 0 },
    orderBy: "modified desc",
    pageLength: 40,
  });

  const rows = itemsQ.data ?? [];

  /** Danh sách tem thật sự sẽ in — nhân bản theo số lượng đã chọn cho từng mã. */
  const labels = useMemo(() => {
    const out: Array<{ code: string; name: string; uom: string }> = [];
    for (const r of rows) {
      const n = picked[String(r.name)] ?? 0;
      for (let i = 0; i < n; i++) {
        out.push({ code: String(r.name), name: String(r.item_name ?? r.name), uom: String(r.stock_uom ?? "") });
      }
    }
    return out;
  }, [rows, picked]);

  const totalPicked = labels.length;

  return (
    <div className="flex h-full flex-col gap-3 p-3 md:p-4">
      {/* ── Thanh điều khiển: ẨN khi in ── */}
      <div className="mf-noprint flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Tìm mặt hàng…" className="h-9 pl-9" />
          </div>
          <div className="flex items-center gap-1.5">
            {LAYOUTS.map((l) => (
              <Button
                key={l.key}
                variant={cols === l.cols ? "default" : "outline"}
                size="sm"
                onClick={() => setCols(l.cols)}
              >
                {l.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2">
            <Checkbox id="qr" checked={showQr} onCheckedChange={(v) => setShowQr(Boolean(v))} />
            <Label htmlFor="qr" className="cursor-pointer text-[13px] font-normal">Mã QR</Label>
          </span>
          <span className="flex items-center gap-2">
            <Checkbox id="bc" checked={showBarcode} onCheckedChange={(v) => setShowBarcode(Boolean(v))} />
            {/* Nhiều kho vẫn dùng máy quét laser đời cũ chỉ đọc mã một chiều — in cả hai thì tem
                dùng được với mọi máy đang có sẵn, không phải mua máy mới. */}
            <Label htmlFor="bc" className="cursor-pointer text-[13px] font-normal">Mã vạch (máy quét cũ)</Label>
          </span>
          <span className="ml-auto text-[13px] text-muted-foreground">
            Sẽ in <b className="text-foreground">{totalPicked}</b> tem
          </span>
          <Button onClick={() => window.print()} disabled={!totalPicked}>
            <Printer className="mr-1.5 size-4" /> In
          </Button>
        </div>

        <Separator />

        {/* ── Chọn hàng + số tem ── */}
        <div className="max-h-[16rem] overflow-auto rounded-md border">
          {rows.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-muted-foreground">
              {itemsQ.isLoading ? "Đang tải…" : "Không có mặt hàng nào."}
            </p>
          ) : (
            <div className="divide-y">
              {rows.map((r) => {
                const code = String(r.name);
                const n = picked[code] ?? 0;
                return (
                  <div key={code} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{String(r.item_name ?? code)}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{code}</span>
                    </span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={String(n)}
                      onChange={(e) => setPicked((p) => ({ ...p, [code]: Math.max(0, Number(e.target.value) || 0) }))}
                      className="h-8 w-20 text-right"
                      aria-label={`Số tem cho ${code}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Bản in ── */}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border p-3 mf-print-area">
        {totalPicked === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">
            Nhập số lượng tem ở danh sách trên để xem trước bản in.
          </p>
        ) : (
          <div
            className={cn("grid gap-2")}
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {labels.map((l, i) => (
              <div key={`${l.code}-${i}`} className="flex break-inside-avoid flex-col items-center gap-1 rounded border border-dashed p-2 text-center">
                <span className="line-clamp-2 text-[11px] font-medium leading-tight">{l.name}</span>
                {showQr ? <QrCode value={l.code} size={cols >= 4 ? 56 : 72} /> : null}
                {showBarcode ? <Barcode128 value={l.code} width={cols >= 4 ? 110 : 150} height={30} /> : null}
                <span className="font-mono text-[10px]">{l.code}</span>
                {l.uom ? <span className="text-[10px] text-muted-foreground">ĐVT: {l.uom}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
