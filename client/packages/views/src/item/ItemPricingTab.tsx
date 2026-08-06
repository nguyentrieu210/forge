/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import type { Doc, DocField } from "@metaforge/core";
import { mapError } from "@metaforge/adapter-frappe";
import { NumberControl } from "@metaforge/controls";
import {
  Badge, Button, Checkbox, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast,
} from "@metaforge/ui";
import { Check, ExternalLink, RefreshCw } from "lucide-react";
import { useDoc, useList } from "../container/hooks.js";
import { useMetaForge } from "../container/provider.js";

type PriceDraft = { rate: string; enabled: boolean; name?: string; modified?: string; currency?: string };
type PurchaseHistoryRow = { date: string; supplier: string; rate: number };
type PurchaseHistoryResult = { rows?: PurchaseHistoryRow[]; latest?: PurchaseHistoryRow | null };

const PRICE_FIELD = { fieldname: "rate", label: "Đơn giá", fieldtype: "Currency", precision: "0" } as DocField;
const text = (value: unknown) => String(value ?? "").normalize("NFC").trim();
const priceKey = (priceList: string, uom: string) => `${priceList}\u001f${uom}`;
const numberValue = (value: string) => Number(value.replace(/\s/g, "").replace(/,/g, "."));

export function ItemPricingTab({ itemCode }: { itemCode: string }) {
  const { adapter, services, businessContext, fmt } = useMetaForge();
  const itemQ = useDoc("Item", itemCode);
  const priceListsQ = useList("Price List", {
    fields: ["name", "price_list_name", "effective_date", "disabled", "currency"],
    orderBy: "effective_date desc, modified desc",
    pageLength: 200,
  });
  const itemPricesQ = useList("Item Price", {
    fields: ["name", "price_list", "uom", "rate", "disabled", "currency", "modified"],
    filters: [["item_code", "=", itemCode]],
    pageLength: 1000,
  }, Boolean(itemCode));
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [initialDrafts, setInitialDrafts] = useState<Record<string, PriceDraft>>({});
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PurchaseHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string>();

  const item = itemQ.data?.doc;
  const stockUom = text(item?.stock_uom);
  const conversionRows = useMemo(() => Array.isArray(item?.uom_conversions) ? item!.uom_conversions as Doc[] : [], [item?.uom_conversions]);
  const uoms = useMemo(() => [...new Set([
    stockUom,
    text(item?.default_sales_uom),
    text(item?.default_purchase_uom),
    ...conversionRows.map((row) => text(row.uom)),
  ].filter(Boolean))], [conversionRows, item?.default_purchase_uom, item?.default_sales_uom, stockUom]);
  const priceLists = useMemo(() => (priceListsQ.data ?? []).filter((row) => !Number(row.disabled)), [priceListsQ.data]);
  const company = text((businessContext as Record<string, unknown>).company);
  const businessContextKey = JSON.stringify(businessContext);

  useEffect(() => {
    if (itemPricesQ.isLoading || !uoms.length) return;
    const existing = new Map((itemPricesQ.data ?? []).map((row) => [priceKey(text(row.price_list), text(row.uom) || stockUom), row]));
    const next: Record<string, PriceDraft> = {};
    for (const uom of uoms) for (const list of priceLists) {
      const key = priceKey(text(list.name), uom);
      const row = existing.get(key);
      next[key] = {
        rate: row ? text(row.rate) : "",
        enabled: Boolean(row && !Number(row.disabled)),
        name: row ? text(row.name) : undefined,
        modified: row ? text(row.modified) : undefined,
        currency: row ? text(row.currency) : text(list.currency),
      };
    }
    setDrafts(next);
    setInitialDrafts(next);
  }, [itemPricesQ.data, itemPricesQ.isLoading, priceLists, stockUom, uoms]);

  useEffect(() => {
    if (!itemCode || !company) {
      setHistory([]);
      setHistoryError(company ? undefined : "Chọn Công ty trên thanh ngữ cảnh để xem lịch sử giá mua.");
      return;
    }
    let active = true;
    setHistoryLoading(true);
    setHistoryError(undefined);
    void adapter.callPost<PurchaseHistoryResult>("alumdoor.purchase.item_price_history", {
      ...businessContext,
      item_code: itemCode,
      limit: 50,
    }).then((result) => {
      if (active) setHistory(Array.isArray(result?.rows) ? result.rows : []);
    }).catch((error) => {
      if (active) { setHistory([]); setHistoryError(adapter.mapError(error).message); }
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => { active = false; };
    // Business context identity is normalized to a string so provider object identity cannot loop this read model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, itemCode, company, businessContextKey]);

  const setDraft = (listName: string, uom: string, patch: Partial<PriceDraft>) => {
    const key = priceKey(listName, uom);
    setDrafts((current) => ({
      ...current,
      [key]: { rate: "", enabled: false, ...current[key], ...patch },
    }));
  };

  const savePrices = async () => {
    const invalid = Object.values(drafts).find((draft) => draft.enabled
      && (!draft.rate.trim() || !Number.isFinite(numberValue(draft.rate)) || numberValue(draft.rate) < 0));
    if (invalid) { toast.error("Giá đang áp dụng phải là số không âm."); return; }
    setSaving(true);
    try {
      for (const [key, draft] of Object.entries(drafts)) {
        const before = initialDrafts[key];
        if (before && before.rate === draft.rate && before.enabled === draft.enabled) continue;
        const [priceList, uom] = key.split("\u001f");
        if (!priceList || !uom) continue;
        const payload = {
          rate: draft.rate.trim() ? numberValue(draft.rate) : 0,
          disabled: draft.enabled ? 0 : 1,
        };
        if (draft.name) {
          await adapter.updateDoc("Item Price", draft.name, payload, draft.modified ?? "");
        } else if (draft.enabled) {
          await adapter.createDoc("Item Price", {
            item_code: itemCode,
            price_list: priceList,
            uom,
            currency: draft.currency || text((businessContext as Record<string, unknown>).currency) || "VND",
            ...payload,
          });
        }
      }
      await itemPricesQ.refetch();
      toast.success("Đã lưu bảng giá bán của mặt hàng.");
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  const loading = itemQ.isLoading || priceListsQ.isLoading || itemPricesQ.isLoading;
  const loadError = itemQ.error || priceListsQ.error || itemPricesQ.error;
  if (loading) return <div className="grid gap-3 p-4"><Skeleton className="h-48" /><Skeleton className="h-56" /></div>;
  if (loadError) return <div className="p-4 text-sm text-destructive">{mapError(loadError).message}</div>;

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-auto bg-background p-3 sm:p-4" data-item-pricing-tab>
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Bảng giá bán</h2>
            <p className="text-xs text-muted-foreground">Cùng nguồn Item Price/Bảng giá hiện tại; chỉnh tại đây không tạo hệ giá riêng.</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button type="button" size="sm" variant="outline" asChild>
              <a href="/app/Item%20Price"><ExternalLink /> Quản lý bảng giá</a>
            </Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void savePrices()}>
              {saving ? <RefreshCw className="animate-spin" /> : <Check />} Lưu giá bán
            </Button>
          </div>
        </div>
        {priceLists.length && uoms.length ? (
          <div className="overflow-auto">
            <Table unwrapped className="w-max min-w-full border-collapse text-sm">
              <TableHeader className="sticky top-0 z-10 bg-muted/95">
                <TableRow>
                  <TableHead className="sticky left-0 z-20 min-w-36 border-b border-r bg-muted px-3 py-2">ĐVT</TableHead>
                  {priceLists.map((list) => (
                    <TableHead key={text(list.name)} className="min-w-48 border-b border-r px-3 py-2 text-left">
                      <span className="block font-medium">{text(list.price_list_name || list.name)}</span>
                      <span className="text-xs font-normal text-muted-foreground">{text(list.effective_date) || "Chưa đặt ngày"}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {uoms.map((uom) => (
                  <TableRow key={uom}>
                    <TableCell className="sticky left-0 z-[2] border-b border-r bg-card px-3 py-3 font-medium">
                      {uom}{uom === stockUom ? <Badge className="ml-2" variant="secondary">Tồn</Badge> : null}
                    </TableCell>
                    {priceLists.map((list) => {
                      const listName = text(list.name);
                      const draft = drafts[priceKey(listName, uom)] ?? { rate: "", enabled: false };
                      return (
                        <TableCell key={listName} className="border-b border-r px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={draft.enabled} onCheckedChange={(value) => setDraft(listName, uom, { enabled: value === true })} aria-label={`Áp dụng ${uom} cho ${listName}`} />
                            <div className="w-32">
                              <NumberControl
                                field={PRICE_FIELD}
                                value={draft.rate ? numberValue(draft.rate) : null}
                                readOnly={!draft.enabled}
                                compact
                                services={services}
                                onChange={(value) => setDraft(listName, uom, { rate: value === null || value === undefined ? "" : String(value) })}
                              />
                            </div>
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : <div className="px-4 py-8 text-sm text-muted-foreground">Chưa có Bảng giá hoặc ĐVT để cấu hình.</div>}
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Lịch sử giá mua</h2>
          <p className="text-xs text-muted-foreground">Tự đọc giao dịch mua canonical; không nhập tay và không tạo bảng giá mua.</p>
        </div>
        {historyLoading ? <div className="p-4"><Skeleton className="h-32" /></div> : historyError ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{historyError}</div>
        ) : history.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Ngày mua</TableHead><TableHead>Nhà cung cấp</TableHead><TableHead className="text-right">Đơn giá</TableHead></TableRow></TableHeader>
            <TableBody>{history.map((row, index) => (
              <TableRow key={`${row.date}:${row.supplier}:${row.rate}:${index}`}>
                <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                <TableCell>{row.supplier}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmt.number(Number(row.rate), 0)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        ) : <div className="px-4 py-8 text-sm text-muted-foreground">Chưa có lịch sử mua mặt hàng này.</div>}
      </section>
    </div>
  );
}
