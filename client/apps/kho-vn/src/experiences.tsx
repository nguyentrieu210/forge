/** @jsxImportSource react */
/**
 * Màn cho công nhân kho (App-mode, touch-first) — người đứng giữa kho cầm điện thoại/máy quét,
 * không phải người ngồi bàn với chuột. Nút to, quét mã là thao tác chính, một tay dùng được.
 *
 * 1. Quét tra tồn ....... chỉ ĐỌC. Quét mã vật tư → còn bao nhiêu, ở kho nào (WMS-001, WMS-011).
 * 2. Chuyển kho nhanh ... GHI. Quét mã + chọn kho đi/đến + số lượng → tạo Stock Entry chuẩn (WMS-007).
 *
 * Không có sổ kho riêng: màn 2 tạo đúng `Stock Entry` loại "Material Transfer" của ERPNext
 * (BRD §6 nguyên tắc #3/#4).
 */
import { useMemo, useState } from "react";
import { PackageSearch, Loader2 } from "lucide-react";
import { useList, useLocaleFormat, useMetaForge } from "@metaforge/views";
import { MobileShell, ScanField, QtyStepper, BigButton, TouchCard } from "@metaforge/shell";
import { Badge, Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, toast, cn } from "@metaforge/ui";
import type { Doc } from "@metaforge/core";

/** Kho lá đang bật — dùng chung cho cả 2 màn. */
function useLeafWarehouses() {
  return useList("Warehouse", {
    fields: ["name"],
    filters: { is_group: 0, disabled: 0 },
    orderBy: "name asc",
    pageLength: 500,
  });
}

/** Tra tồn của một mã vật tư trên mọi kho. */
function useItemStock(itemCode: string) {
  return useList(
    "Bin",
    {
      fields: ["name", "item_code", "warehouse", "actual_qty", "reserved_qty", "stock_uom"],
      filters: { item_code: itemCode, actual_qty: [">", 0] },
      orderBy: "warehouse asc",
      pageLength: 100,
    },
    Boolean(itemCode),
  );
}

function available(d: Doc): number {
  return Math.max(0, (Number(d.actual_qty) || 0) - (Number(d.reserved_qty) || 0));
}

// ── 1. Quét tra tồn ─────────────────────────────────────────────────────────
export function TraTonExperience({ onBack }: { onBack: () => void }) {
  const fmt = useLocaleFormat();
  const { adapter } = useMetaForge();
  const [scan, setScan] = useState("");
  // `applied` tách khỏi `scan`: chỉ gọi server khi người dùng bấm Tra/Enter, không phải mỗi ký tự.
  // Máy quét mã vạch gõ rất nhanh rồi tự Enter — gọi theo từng ký tự sẽ bắn hàng chục request thừa.
  const [applied, setApplied] = useState("");
  const stockQ = useItemStock(applied);

  const rows = stockQ.data ?? [];
  const total = useMemo(() => rows.reduce((s, r) => s + available(r), 0), [rows]);

  return (
    <MobileShell
      title="Quét tra tồn"
      subtitle={applied || "Quét mã vật tư để xem tồn"}
      onBack={onBack}
    >
      <div className="space-y-3 p-3">
        <ScanField
          value={scan}
          onChange={setScan}
          placeholder="Quét hoặc nhập mã vật tư…"
          onEnter={(v) => setApplied(v.trim())}
        />
        <BigButton onClick={() => setApplied(scan.trim())} disabled={!scan.trim()}>
          Tra tồn
        </BigButton>

        {!applied ? null : stockQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Đang tra…
          </div>
        ) : stockQ.error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
            {adapter.mapError(stockQ.error).message}
          </div>
        ) : rows.length === 0 ? (
          <div className="grid place-items-center gap-2 py-10 text-center text-muted-foreground">
            <PackageSearch className="size-8" />
            <div>Không còn tồn cho mã <b className="text-foreground">{applied}</b>.</div>
            <div className="text-xs">Kiểm tra lại mã, hoặc hàng đã xuất hết.</div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 text-sm">
              <span className="text-muted-foreground">{rows.length} kho có hàng</span>
              <span className="tabular-nums">Tổng khả dụng <b>{fmt.number(total)}</b></span>
            </div>
            <div className="space-y-2">
              {rows.map((r) => {
                const avail = available(r);
                const reserved = Number(r.reserved_qty) || 0;
                return (
                  <TouchCard key={String(r.name)}>
                    <span className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{String(r.warehouse)}</span>
                        {reserved > 0 ? (
                          <span className="block text-xs text-warning-text">
                            Đang giữ {fmt.number(reserved)} {String(r.stock_uom ?? "")}
                          </span>
                        ) : null}
                      </span>
                      <span className={cn("shrink-0 text-lg font-bold tabular-nums", avail === 0 && "text-destructive-text")}>
                        {fmt.number(avail)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{String(r.stock_uom ?? "")}</span>
                    </span>
                  </TouchCard>
                );
              })}
            </div>
          </>
        )}
      </div>
    </MobileShell>
  );
}

// ── 2. Chuyển kho nhanh ─────────────────────────────────────────────────────
export function ChuyenKhoNhanhExperience({ onBack }: { onBack: () => void }) {
  const fmt = useLocaleFormat();
  const { adapter, businessContext } = useMetaForge();
  const warehousesQ = useLeafWarehouses();
  const [scan, setScan] = useState("");
  const [item, setItem] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  const stockQ = useItemStock(item);
  const stockAtSource = useMemo(
    () => (stockQ.data ?? []).find((r) => String(r.warehouse) === from),
    [stockQ.data, from],
  );
  const maxQty = stockAtSource ? available(stockAtSource) : 0;
  const uom = String(stockAtSource?.stock_uom ?? "");

  // WMS-011: không cho lấy vượt tồn khả dụng — chặn ngay tại nút, không để server từ chối sau khi
  // công nhân đã nhập xong (đứng giữa kho, làm lại từ đầu rất mất công).
  const overQty = qty > maxQty;
  const canSubmit = Boolean(item && from && to && from !== to && qty > 0 && !overQty && !saving);

  async function submit() {
    setSaving(true);
    try {
      const doc = await adapter.createDoc("Stock Entry", {
        // Loại chuyển kho chuẩn của ERPNext; `purpose` để cũ hơn vẫn hiểu.
        stock_entry_type: "Material Transfer",
        purpose: "Material Transfer",
        ...(businessContext.company ? { company: businessContext.company } : {}),
        from_warehouse: from,
        to_warehouse: to,
        items: [{ item_code: item, qty, s_warehouse: from, t_warehouse: to }],
      } as Partial<Doc>);
      // Cố ý để DRAFT, không submit thẳng: WMS-008 yêu cầu hai người xác nhận giao/nhận, nên
      // công nhân chỉ lập phiếu, người có quyền mới duyệt.
      toast.success(`Đã tạo phiếu chuyển ${String(doc.name)} (nháp — chờ duyệt)`);
      setScan(""); setItem(""); setQty(1);
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileShell
      title="Chuyển kho nhanh"
      subtitle={item || "Quét mã vật tư cần chuyển"}
      onBack={onBack}
      bottomBar={
        <BigButton onClick={() => void submit()} disabled={!canSubmit} variant="success">
          {saving ? "Đang tạo phiếu…" : "Tạo phiếu chuyển"}
        </BigButton>
      }
    >
      <div className="space-y-4 p-3">
        <div className="space-y-2">
          <ScanField value={scan} onChange={setScan} placeholder="Quét mã vật tư…" onEnter={(v) => setItem(v.trim())} />
          <Button variant="outline" className="w-full" onClick={() => setItem(scan.trim())} disabled={!scan.trim()}>
            Chọn mã này
          </Button>
        </div>

        {item ? (
          <>
            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kho đi</div>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Chọn kho lấy hàng" /></SelectTrigger>
                <SelectContent>
                  {(stockQ.data ?? []).map((r) => (
                    <SelectItem key={String(r.name)} value={String(r.warehouse)}>
                      {String(r.warehouse)} — còn {fmt.number(available(r))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Chỉ liệt kê kho ĐANG CÓ HÀNG của mã này: chọn kho rỗng rồi mới biết không lấy được
                  là kiểu lỗi làm mất thời gian nhất ở hiện trường. */}
              {stockQ.data && stockQ.data.length === 0 ? (
                <div className="text-xs text-destructive-text">Mã này hiện không còn tồn ở kho nào.</div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kho đến</div>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Chọn kho nhận hàng" /></SelectTrigger>
                <SelectContent>
                  {(warehousesQ.data ?? [])
                    .filter((w) => String(w.name) !== from)
                    .map((w) => <SelectItem key={String(w.name)} value={String(w.name)}>{String(w.name)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Số lượng</div>
                {from ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Khả dụng tại kho đi: <b className="text-foreground">{fmt.number(maxQty)}</b> {uom}
                  </div>
                ) : null}
              </div>
              <QtyStepper value={qty} onChange={setQty} min={0} />
            </div>

            {overQty ? (
              <Badge variant="destructive" className="w-full justify-center py-2">
                Vượt tồn khả dụng ({fmt.number(maxQty)} {uom})
              </Badge>
            ) : null}
            {from && to && from === to ? (
              <Badge variant="warning" className="w-full justify-center py-2">Kho đi và kho đến phải khác nhau</Badge>
            ) : null}
          </>
        ) : null}
      </div>
    </MobileShell>
  );
}
