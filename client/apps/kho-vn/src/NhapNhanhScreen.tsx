/** @jsxImportSource react */
/**
 * NHẬP HÀNG NHANH — màn nhập kiểu bán lẻ (KiotViet), không phải form ERPNext.
 *
 * Vì sao làm riêng thay vì dùng form Purchase Receipt chuẩn:
 * form gốc của ERPNext có ~80 trường trải trên 6 tab (thuế, điều khoản thanh toán, tỷ giá,
 * bút toán, landed cost…). Thủ kho nhập 20 dòng hàng/ngày không cần và không hiểu phần lớn
 * trong số đó. Ở đây rút còn đúng 4 thứ người nhập hàng thật sự phải khai:
 *
 *      quét mã  →  số lượng  →  đơn giá  →  nhà cung cấp
 *
 * Mọi thứ còn lại (công ty, kho nhận, tiền tệ, đơn vị tính, tài khoản kế toán) lấy từ NGỮ CẢNH
 * đang chọn trên thanh trên hoặc để ERPNext tự điền mặc định phía server. Người dùng KHÔNG bị
 * hỏi lại những gì hệ thống đã biết.
 *
 * Chứng từ tạo ra vẫn là `Purchase Receipt` chuẩn — không có sổ kho thứ hai (BRD §6 #3/#4).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PackagePlus, Search, Trash2, X, Info, ScanLine } from "lucide-react";
import { useList, useLocaleFormat, useMetaForge } from "@metaforge/views";
import { LinkCombobox } from "@metaforge/controls";
import { Button, Input, Badge, Separator, toast, cn, useT } from "@metaforge/ui";
import type { Doc } from "@metaforge/core";
import { CameraScanButton } from "./CameraScanner.js";

/** Một dòng hàng trong giỏ. Giữ tối thiểu — phần còn lại server tự suy. */
interface CartLine {
  itemCode: string;
  itemName: string;
  uom: string;
  qty: number;
  rate: number;
}

/**
 * Ô nhập SỐ TIỀN có phân cách hàng nghìn ngay trong lúc gõ.
 *
 * Vì sao không dùng `<Input type="number">`: nó không cho hiện dấu phân cách, nên người nhập
 * phải tự đếm số 0. Gõ nhầm 500000 thành 5000000 là sai gấp 10 lần đơn giá — loại lỗi rất khó
 * phát hiện khi nhìn một dãy số trần.
 *
 * Cách làm: giữ giá trị THẬT ở dạng số trong state cha, ô chỉ hiển thị bản đã định dạng. Mỗi lần
 * gõ thì bóc hết ký tự không phải chữ số rồi parse lại — nên dán "1.234.567" hay "1,234,567" hay
 * "1 234 567" đều ra cùng một số.
 */
const GROUP = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function MoneyInput({ value, onChange, className, ariaLabel }: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  ariaLabel: string;
}) {
  // Khi ô đang có focus, hiển thị theo đúng những gì người dùng gõ (đã nhóm lại) thay vì ép
  // định dạng liên tục — ép liên tục sẽ nhảy con trỏ về cuối sau mỗi phím.
  const shown = value ? GROUP.format(value) : "";
  return (
    <Input
      inputMode="numeric"
      value={shown}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onChange(digits ? Number(digits) : 0);
      }}
      className={className}
      aria-label={ariaLabel}
    />
  );
}

/** Debounce thuần, không kéo thêm thư viện. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function NhapNhanhScreen() {
  const t = useT();
  const fmt = useLocaleFormat();
  const { adapter, businessContext, services } = useMetaForge();

  const [term, setTerm] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [hilite, setHilite] = useState(0);
  const scanRef = useRef<HTMLInputElement>(null);

  const debounced = useDebounced(term, 220);

  // Công ty / kho lấy từ ngữ cảnh đang chọn — KHÔNG hỏi lại người dùng.
  const company = String(businessContext?.company ?? "");
  const warehouse = String(businessContext?.warehouse ?? "");

  // ── tra hàng ──────────────────────────────────────────────────────────────
  const itemQ = useList(
    "Item",
    {
      fields: ["name", "item_name", "stock_uom", "item_code"],
      orFilters: debounced
        ? { item_code: ["like", `%${debounced}%`], item_name: ["like", `%${debounced}%`] }
        : undefined,
      filters: { disabled: 0, is_stock_item: 1 },
      orderBy: "modified desc",
      pageLength: 8,
    },
    debounced.length >= 1,
  );

  const matches = itemQ.data ?? [];

  useEffect(() => { setHilite(0); }, [debounced]);

  // ── giỏ hàng ──────────────────────────────────────────────────────────────
  const addLine = useCallback((d: Doc) => {
    const code = String(d.name);
    setLines((prev) => {
      // Quét trùng mã ⇒ CỘNG DỒN số lượng, không đẻ dòng mới. Đây là hành vi người quét
      // mong đợi: quét 5 lần một mã nghĩa là 5 cái, không phải 5 dòng mỗi dòng 1 cái.
      const at = prev.findIndex((l) => l.itemCode === code);
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at]!, qty: next[at]!.qty + 1 };
        return next;
      }
      return [...prev, {
        itemCode: code,
        itemName: String(d.item_name ?? code),
        uom: String(d.stock_uom ?? ""),
        qty: 1,
        rate: 0,
      }];
    });
    setTerm("");
    scanRef.current?.focus();
  }, []);

  const patch = useCallback((i: number, p: Partial<CartLine>) => {
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...p } : l)));
  }, []);
  const drop = useCallback((i: number) => setLines((prev) => prev.filter((_, k) => k !== i)), []);

  const totalQty = useMemo(() => lines.reduce((s, l) => s + (l.qty || 0), 0), [lines]);
  const totalAmt = useMemo(() => lines.reduce((s, l) => s + (l.qty || 0) * (l.rate || 0), 0), [lines]);

  // ── lưu ───────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!lines.length) { toast.error(t("nhap.err_empty")); return; }
    if (!supplier) { toast.error(t("nhap.err_supplier")); scanRef.current?.blur(); return; }
    if (lines.some((l) => !l.qty || l.qty <= 0)) { toast.error(t("nhap.err_qty")); return; }

    setSaving(true);
    try {
      const doc = await adapter.createDoc("Purchase Receipt", {
        supplier,
        company: company || undefined,
        set_warehouse: warehouse || undefined,
        // Ghi dấu để phân biệt chứng từ tạo từ màn nhanh khi cần truy vết.
        remarks: note || undefined,
        items: lines.map((l) => ({
          item_code: l.itemCode,
          qty: l.qty,
          rate: l.rate,
          warehouse: warehouse || undefined,
        })),
      } as Partial<Doc>);

      toast.success(`${t("nhap.saved")} ${String(doc.name)}`);
      setLines([]); setNote(""); setTerm("");
      scanRef.current?.focus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [lines, supplier, company, warehouse, note, adapter, t]);

  // F9 = lưu (thói quen từ phần mềm bán hàng VN). Đặt ở window để bấm được ở bất kỳ ô nào.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9") { e.preventDefault(); void save(); }
      if (e.key === "F3") { e.preventDefault(); scanRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const onScanKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHilite((h) => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHilite((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const pick = matches[hilite];
      if (pick) addLine(pick);
    } else if (e.key === "Escape") { setTerm(""); }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[68rem] flex-col gap-3 p-3 md:p-4">
      {/* ── Ngữ cảnh: cho biết đang nhập vào ĐÂU, không bắt chọn lại ── */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-medium">{t("nhap.title")}</span>
        {company ? <Badge variant="secondary">{company}</Badge> : null}
        {warehouse ? <Badge variant="secondary">{warehouse}</Badge> : null}
        <span className="ml-auto hidden text-muted-foreground md:inline">
          {t("nhap.hint_keys")}
        </span>
      </div>

      {/* ── Ô quét: to, tự focus, là thao tác CHÍNH của màn này ── */}
      <div className="flex gap-2">
      <div className="relative flex-1">
        <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={scanRef}
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={onScanKey}
          placeholder={t("nhap.scan_placeholder")}
          className="h-12 pl-11 text-base"
        />
        {itemQ.isFetching ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}

        {/* gợi ý */}
        {term && matches.length > 0 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
            {matches.map((m, i) => (
              <Button
                key={String(m.name)}
                variant="ghost"
                onClick={() => addLine(m)}
                onMouseEnter={() => setHilite(i)}
                className={cn(
                  "h-auto w-full justify-start rounded-none px-3 py-2 text-left font-normal",
                  i === hilite && "bg-accent",
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="truncate">{String(m.item_name ?? m.name)}</span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{String(m.name)}</span>
                </span>
              </Button>
            ))}
          </div>
        ) : null}
        {term && !itemQ.isFetching && matches.length === 0 ? (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-[13px] text-muted-foreground shadow-md">
            {t("nhap.no_match")}
          </div>
        ) : null}
      </div>
        {/* Quét bằng camera điện thoại — cho người không có máy quét cầm tay. Mã quét được đổ
            thẳng vào ô tìm, đi đúng luồng như gõ tay hay máy quét bắn vào. */}
        <CameraScanButton className="h-12 w-12" onScan={(code) => { setTerm(code); scanRef.current?.focus(); }} />
      </div>

      {/* ── Giỏ hàng ── */}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        {lines.length === 0 ? (
          <div className="flex h-full min-h-[9rem] flex-col items-center justify-center gap-2 p-6 text-center">
            <PackagePlus className="size-8 text-muted-foreground/50" />
            <p className="text-[13px] font-medium">{t("nhap.empty_title")}</p>
            {/* Hướng dẫn ngay trong màn — người mới không phải đi hỏi ai. */}
            <p className="max-w-sm text-xs text-muted-foreground">{t("nhap.empty_help")}</p>
          </div>
        ) : (
          <div className="divide-y">
            {/* tiêu đề cột: chỉ hiện trên màn rộng, điện thoại dùng bố cục thẻ */}
            <div className="hidden items-center gap-2 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground md:flex">
              <span className="flex-1">{t("nhap.col_item")}</span>
              <span className="w-24 text-right">{t("nhap.col_qty")}</span>
              <span className="w-28 text-right">{t("nhap.col_rate")}</span>
              <span className="w-28 text-right">{t("nhap.col_amount")}</span>
              <span className="w-8" />
            </div>
            {lines.map((l, i) => (
              <div key={l.itemCode} className="flex flex-col gap-2 px-3 py-2 md:flex-row md:items-center md:gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{l.itemName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{l.itemCode}{l.uom ? ` · ${l.uom}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={String(l.qty)}
                      onChange={(e) => patch(i, { qty: Number(e.target.value) })}
                      className="h-9 w-20 text-right md:h-8"
                      aria-label={t("nhap.col_qty")}
                    />
                    {/* Đơn vị tính hiện NGAY CẠNH số lượng: "10" một mình không nói lên điều gì —
                        10 thùng khác hẳn 10 cái. Đây là chỗ người nhập cần thấy nó nhất. */}
                    <span className="w-10 shrink-0 text-xs text-muted-foreground">{l.uom}</span>
                  </span>
                  <MoneyInput
                    value={l.rate}
                    onChange={(n) => patch(i, { rate: n })}
                    className="h-9 w-28 text-right md:h-8"
                    ariaLabel={t("nhap.col_rate")}
                  />
                  <span className="w-28 shrink-0 text-right text-[13px] font-medium tabular-nums">
                    {fmt.currency((l.qty || 0) * (l.rate || 0))}
                  </span>
                  <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => drop(i)} aria-label={t("nhap.remove")}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Chân: NCC + tổng + lưu ── */}
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {/*
            Dùng ĐÚNG control Link của engine, không tự chế ô tìm kiếm riêng.
            Bản tự chế trước đó mất sạch: "+ Tạo mới nhà cung cấp" ngay tại chỗ, danh sách vừa
            dùng gần đây, lọc theo quyền + User Permission phía server, chống race khi gõ nhanh,
            và cả bản vá cuộn danh sách vừa làm. Màn nghiệp vụ tự viết vẫn phải xài chung control.
          */}
          <div className="min-w-0 flex-1">
            <LinkCombobox
              id="nhap-ncc"
              value={supplier}
              target="Supplier"
              search={services?.searchLink}
              resolveDisplay={services?.resolveDisplay}
              quickCreate={services?.quickCreate}
              onChange={setSupplier}
            />
          </div>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("nhap.note_placeholder")}
            className="h-9 md:max-w-[16rem]"
          />
        </div>

        <Separator />

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-muted-foreground">
            {t("nhap.total_lines")} <b className="text-foreground tabular-nums">{lines.length}</b>
            {"  ·  "}
            {t("nhap.total_qty")} <b className="text-foreground tabular-nums">{fmt.number(totalQty)}</b>
          </span>
          <span className="ml-auto text-base font-semibold tabular-nums">{fmt.currency(totalAmt)}</span>
          <Button onClick={() => void save()} disabled={saving || !lines.length} className="h-10 min-w-[9rem]">
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {saving ? t("nhap.saving") : t("nhap.save")}
          </Button>
        </div>

        {/* Nói rõ chuyện gì xảy ra khi bấm Lưu — tránh việc người dùng sợ không dám bấm. */}
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("nhap.save_help")}
        </p>
      </div>
    </div>
  );
}
