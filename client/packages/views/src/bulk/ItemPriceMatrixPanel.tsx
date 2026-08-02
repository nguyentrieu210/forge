/** @jsxImportSource react */
/** Workspace mở rộng: Nhóm hàng → Mặt hàng → ĐVT × Bảng giá. */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronRight, FolderTree, Package, Plus, RefreshCw, Settings2 } from "lucide-react";
import type { Doc } from "@metaforge/core";
import { mapError, type FrappeAdapter } from "@metaforge/adapter-frappe";
import { Badge, Button, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label, Skeleton, toast } from "@metaforge/ui";
import { useDoc, useList } from "../container/hooks.js";

interface ItemPriceMatrixPanelProps { adapter: FrappeAdapter; onChanged: () => Promise<unknown> | unknown; }
type PriceDraft = { rate: string; enabled: boolean; name?: string; modified?: string };
type MobileStep = "groups" | "items" | "prices";

const text = (value: unknown) => String(value ?? "");
const priceKey = (priceList: string, uom: string) => `${priceList}\u001f${uom}`;
const numberValue = (value: string) => Number(value.replace(/\s/g, "").replace(/,/g, "."));

export function ItemPriceMatrixPanel({ adapter, onChanged }: ItemPriceMatrixPanelProps) {
  const pricesQ = useList("Price List", { fields: ["name", "price_list_name", "effective_date", "disabled", "modified"], orderBy: "effective_date desc, modified desc", pageLength: 200 });
  const groupsQ = useList("Item Group", { fields: ["name", "item_group_name", "parent_item_group", "is_group", "lft"], orderBy: "lft asc", pageLength: 500 });
  const itemsQ = useList("Item", { fields: ["name", "item_name", "item_group", "stock_uom", "default_sales_uom", "disabled"], orderBy: "item_name asc", pageLength: 500 });
  const uomsQ = useList("UOM", { fields: ["name", "uom_name", "disabled"], filters: [["disabled", "=", 0]], orderBy: "uom_name asc", pageLength: 200 });
  const [group, setGroup] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [mobileStep, setMobileStep] = useState<MobileStep>("groups");
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [initialDrafts, setInitialDrafts] = useState<Record<string, PriceDraft>>({});
  const [conversionDrafts, setConversionDrafts] = useState<Record<string, string>>({});
  const [initialConversions, setInitialConversions] = useState<Record<string, string>>({});
  const [addedUoms, setAddedUoms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [uomOpen, setUomOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");

  const prices = pricesQ.data ?? [];
  const groups = groupsQ.data ?? [];
  const items = itemsQ.data ?? [];
  const selectedItemQ = useDoc("Item", itemCode);
  const currentPricesQ = useList("Item Price", {
    fields: ["name", "price_list", "uom", "rate", "disabled", "modified"],
    filters: [["item_code", "=", itemCode]], pageLength: 1000,
  }, Boolean(itemCode));

  useEffect(() => { if (!group && groups[0]) setGroup(text(groups[0].name)); }, [group, groups]);

  const selectedGroups = useMemo(() => {
    const result = new Set<string>();
    const visit = (name: string) => {
      if (!name || result.has(name)) return;
      result.add(name);
      groups.filter((row) => text(row.parent_item_group) === name).forEach((row) => visit(text(row.name)));
    };
    visit(group);
    return result;
  }, [group, groups]);
  const groupItems = useMemo(() => items.filter((item) => selectedGroups.has(text(item.item_group)) && !Number(item.disabled)), [items, selectedGroups]);
  useEffect(() => { if (itemCode && !groupItems.some((item) => text(item.name) === itemCode)) setItemCode(""); }, [itemCode, groupItems]);

  const itemDoc = selectedItemQ.data?.doc;
  const stockUom = text(itemDoc?.stock_uom);
  const conversionRows = useMemo(() => Array.isArray(itemDoc?.uom_conversions) ? itemDoc.uom_conversions as Doc[] : [], [itemDoc?.uom_conversions]);
  const configuredUomNames = useMemo(() => {
    const names = new Set<string>([stockUom, text(itemDoc?.default_purchase_uom), text(itemDoc?.default_sales_uom), ...conversionRows.map((row) => text(row.uom)), ...addedUoms].filter(Boolean));
    return [...names];
  }, [addedUoms, conversionRows, itemDoc?.default_purchase_uom, itemDoc?.default_sales_uom, stockUom]);
  const configuredUoms = useMemo(() => configuredUomNames.map((name) => (uomsQ.data ?? []).find((row) => text(row.name) === name) ?? { name, uom_name: name }), [configuredUomNames, uomsQ.data]);
  const unconfiguredUoms = useMemo(() => (uomsQ.data ?? []).filter((row) => !configuredUomNames.includes(text(row.name))), [configuredUomNames, uomsQ.data]);

  useEffect(() => {
    if (!itemCode || !itemDoc) { setConversionDrafts({}); setInitialConversions({}); setAddedUoms([]); return; }
    const values: Record<string, string> = { [stockUom]: "1" };
    conversionRows.forEach((row) => { values[text(row.uom)] = text(row.conversion_factor); });
    setConversionDrafts(values); setInitialConversions(values); setAddedUoms([]);
  }, [conversionRows, itemCode, itemDoc, stockUom]);

  useEffect(() => {
    if (!itemCode || currentPricesQ.isLoading) { setDrafts({}); setInitialDrafts({}); return; }
    const existing = new Map((currentPricesQ.data ?? []).map((row) => [priceKey(text(row.price_list), text(row.uom)), row]));
    const next: Record<string, PriceDraft> = {};
    for (const uom of configuredUomNames) for (const price of prices) {
      const key = priceKey(text(price.name), uom); const row = existing.get(key);
      next[key] = { rate: row ? text(row.rate) : "", enabled: Boolean(row && !Number(row.disabled)), name: row ? text(row.name) : undefined, modified: row ? text(row.modified) : undefined };
    }
    setDrafts(next); setInitialDrafts(next);
  }, [configuredUomNames, currentPricesQ.data, currentPricesQ.isLoading, itemCode, prices]);

  const setPriceDraft = (priceList: string, uom: string, patch: Partial<PriceDraft>) => setDrafts((all) => {
    const key = priceKey(priceList, uom); return { ...all, [key]: { rate: "", enabled: false, ...all[key], ...patch } };
  });
  const addUom = (uom: string) => {
    setAddedUoms((all) => all.includes(uom) ? all : [...all, uom]);
    setConversionDrafts((all) => ({ ...all, [uom]: all[uom] ?? "" }));
    setUomOpen(false);
  };

  const save = async () => {
    if (!itemCode || !itemDoc) return;
    const enabled = Object.entries(drafts).find(([, draft]) => draft.enabled && (!draft.rate.trim() || !Number.isFinite(numberValue(draft.rate)) || numberValue(draft.rate) < 0));
    const badConversion = configuredUomNames.find((uom) => uom !== stockUom && (!conversionDrafts[uom] || !Number.isFinite(numberValue(conversionDrafts[uom])) || numberValue(conversionDrafts[uom]) <= 0));
    if (enabled) { toast.error("Giá đang áp dụng phải là số không âm."); return; }
    if (badConversion) { toast.error(`Chưa nhập hệ số quy đổi hợp lệ cho ${badConversion}.`); return; }
    setSaving(true);
    try {
      if (JSON.stringify(conversionDrafts) !== JSON.stringify(initialConversions) || addedUoms.length) {
        const rowMap = new Map(conversionRows.map((row) => [text(row.uom), row]));
        const updatedRows = configuredUomNames.filter((uom) => uom !== stockUom).map((uom) => ({ ...rowMap.get(uom), uom, conversion_factor: numberValue(conversionDrafts[uom] ?? "") }));
        await adapter.updateDoc("Item", itemCode, { uom_conversions: updatedRows }, text(itemDoc.modified));
      }
      for (const [key, draft] of Object.entries(drafts)) {
        const before = initialDrafts[key];
        if (before && before.rate === draft.rate && before.enabled === draft.enabled) continue;
        const [priceList, uom] = key.split("\u001f");
        if (!priceList || !uom) continue;
        const payload = { rate: draft.rate.trim() ? numberValue(draft.rate) : 0, disabled: draft.enabled ? 0 : 1 };
        if (draft.name) await adapter.updateDoc("Item Price", draft.name, payload, draft.modified ?? "");
        else if (draft.enabled) await adapter.createDoc("Item Price", { item_code: itemCode, price_list: priceList, uom, currency: "VND", ...payload });
      }
      toast.success("Đã lưu ĐVT, quy đổi và bảng giá");
      await selectedItemQ.refetch(); await currentPricesQ.refetch(); await onChanged();
    } catch (error) { toast.error(mapError(error).message); } finally { setSaving(false); }
  };

  const createPriceList = async () => {
    if (!newName.trim() || !effectiveDate) return;
    try {
      await adapter.createDoc("Price List", { price_list_name: newName.trim(), effective_date: effectiveDate, currency: "VND" });
      await pricesQ.refetch(); setCreateOpen(false); setNewName(""); setEffectiveDate(""); toast.success("Đã tạo bảng giá mới");
    } catch (error) { toast.error(mapError(error).message); }
  };

  const loading = pricesQ.isLoading || groupsQ.isLoading || itemsQ.isLoading || uomsQ.isLoading;
  if (loading) return <div className="grid h-full gap-3 p-4 xl:grid-cols-[18rem_22rem_minmax(0,1fr)]"><Skeleton className="h-full" /><Skeleton className="h-full" /><Skeleton className="h-full" /></div>;

  const groupPanel = <div className="space-y-1 p-3">{groups.map((row) => <button key={text(row.name)} type="button" onClick={() => { setGroup(text(row.name)); setItemCode(""); setMobileStep("items"); }} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${group === text(row.name) ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}><ChevronRight className={`size-4 ${Number(row.is_group) ? "" : "opacity-30"}`} />{text(row.item_group_name || row.name)}</button>)}</div>;
  const itemPanel = <div className="divide-y">{groupItems.map((item) => <button key={text(item.name)} type="button" onClick={() => { setItemCode(text(item.name)); setMobileStep("prices"); }} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${itemCode === text(item.name) ? "bg-primary/5 ring-1 ring-inset ring-primary/40" : "hover:bg-muted/50"}`}><span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted"><Package className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{text(item.item_name || item.name)}</span><span className="block truncate text-xs text-muted-foreground">{text(item.name)} · ĐVT tồn: {text(item.stock_uom)}</span></span></button>)}{!groupItems.length ? <p className="p-5 text-sm text-muted-foreground">Nhóm này chưa có mặt hàng.</p> : null}</div>;
  const matrixPanel = itemCode ? <div className="flex h-full min-h-0 flex-col"><div className="flex shrink-0 flex-wrap items-start gap-3 border-b p-4"><div><h3 className="font-semibold">{text(itemDoc?.item_name || itemCode)}</h3><p className="text-xs text-muted-foreground">ĐVT tồn kho: {stockUom || "—"}</p></div><Button className="ml-auto" size="sm" variant="outline" onClick={() => setUomOpen(true)}><Settings2 /> Thêm ĐVT</Button><Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? <RefreshCw className="animate-spin" /> : <Check />} Lưu thay đổi</Button></div><div className="min-h-0 flex-1 overflow-auto"><table className="w-max min-w-full border-collapse text-sm"><thead className="sticky top-0 z-10 bg-muted/95"><tr><th className="sticky left-0 z-20 min-w-32 border-b border-r bg-muted px-3 py-2 text-left">ĐVT</th><th className="sticky left-32 z-20 min-w-44 border-b border-r bg-muted px-3 py-2 text-left">Quy đổi</th>{prices.map((price) => <th key={text(price.name)} className="min-w-48 border-b border-r px-3 py-2 text-left"><a className="font-medium text-primary hover:underline" href={`/app/Price%20List/${encodeURIComponent(text(price.name))}`}>{text(price.price_list_name || price.name)}</a><span className="mt-0.5 block text-xs font-normal text-muted-foreground"><CalendarDays className="mr-1 inline size-3" />{text(price.effective_date) || "Chưa đặt ngày"}{Number(price.disabled) ? " · Ngừng dùng" : ""}</span></th>)}</tr></thead><tbody>{configuredUoms.map((uom) => { const uomName = text(uom.name); return <tr key={uomName}><td className="sticky left-0 z-[2] border-b border-r bg-card px-3 py-3 font-medium">{text(uom.uom_name || uomName)}{uomName === stockUom ? <Badge className="ml-2" variant="secondary">Tồn</Badge> : null}</td><td className="sticky left-32 z-[2] border-b border-r bg-card px-3 py-2"><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">1 {uomName} =</span><Input className="h-8 w-20" type="number" min="0.000001" step="any" disabled={uomName === stockUom} value={uomName === stockUom ? "1" : conversionDrafts[uomName] ?? ""} onChange={(event) => setConversionDrafts((all) => ({ ...all, [uomName]: event.target.value }))} /><span className="text-xs text-muted-foreground">{stockUom}</span></div></td>{prices.map((price) => { const listName = text(price.name); const draft = drafts[priceKey(listName, uomName)] ?? { rate: "", enabled: false }; return <td key={listName} className="border-b border-r px-3 py-2"><div className="flex items-center gap-2"><Checkbox checked={draft.enabled} onCheckedChange={(value) => setPriceDraft(listName, uomName, { enabled: value === true })} aria-label={`Áp dụng ${uomName} cho ${listName}`} /><Input className="h-8 w-28" type="number" min="0" disabled={!draft.enabled || Number(price.disabled) === 1} value={draft.rate} onChange={(event) => setPriceDraft(listName, uomName, { rate: event.target.value })} placeholder="0" /><span className="text-xs text-muted-foreground">đ</span></div></td>; })}</tr>; })}</tbody></table>{!prices.length ? <div className="grid h-40 place-items-center text-sm text-muted-foreground">Chưa có Bảng giá. Hãy tạo Bảng giá đầu tiên.</div> : null}</div></div> : <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">Chọn một mặt hàng để nhập giá.</div>;

  return <section className="flex h-full min-h-0 flex-col bg-background"><header className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-card px-4 py-3"><div><h2 className="text-base font-semibold">Quản lý bảng giá</h2><p className="text-xs text-muted-foreground">Mỗi Bảng giá là một cột; ĐVT và quy đổi dùng chung dữ liệu Mặt hàng.</p></div><Button className="ml-auto" size="sm" onClick={() => setCreateOpen(true)}><Plus /> Tạo bảng giá</Button></header>
    <div className="hidden min-h-0 flex-1 xl:grid xl:grid-cols-[18rem_22rem_minmax(0,1fr)]"><aside className="min-h-0 overflow-auto border-r bg-card"><div className="flex items-center gap-2 border-b px-4 py-3 font-semibold"><FolderTree className="size-4" /> Nhóm hàng</div>{groupPanel}</aside><aside className="min-h-0 overflow-auto border-r bg-card"><div className="border-b px-4 py-3"><h3 className="font-semibold">Mặt hàng</h3><p className="text-xs text-muted-foreground">{groupItems.length} mặt hàng</p></div>{itemPanel}</aside><main className="min-h-0 overflow-hidden">{matrixPanel}</main></div>
    <div className="min-h-0 flex-1 xl:hidden">{mobileStep === "groups" ? <div className="h-full overflow-auto"><div className="border-b px-4 py-3 font-semibold">Chọn nhóm hàng</div>{groupPanel}</div> : null}{mobileStep === "items" ? <div className="h-full overflow-auto"><Button variant="ghost" size="sm" className="m-2" onClick={() => setMobileStep("groups")}><ArrowLeft /> Nhóm hàng</Button>{itemPanel}</div> : null}{mobileStep === "prices" ? <div className="flex h-full min-h-0 flex-col"><Button variant="ghost" size="sm" className="m-2 self-start" onClick={() => setMobileStep("items")}><ArrowLeft /> Mặt hàng</Button><div className="min-h-0 flex-1">{matrixPanel}</div></div> : null}</div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Tạo bảng giá</DialogTitle></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-1.5"><Label>Tên bảng giá</Label><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ví dụ: Giá đại lý tháng 8" /></div><div className="grid gap-1.5"><Label>Ngày áp dụng</Label><Input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button><Button onClick={() => void createPriceList()} disabled={!newName.trim() || !effectiveDate}>Tạo bảng giá</Button></div></DialogContent></Dialog>
    <Dialog open={uomOpen} onOpenChange={setUomOpen}><DialogContent><DialogHeader><DialogTitle>Thêm ĐVT áp dụng</DialogTitle></DialogHeader><div className="max-h-80 space-y-1 overflow-auto">{unconfiguredUoms.map((uom) => <button type="button" key={text(uom.name)} onClick={() => addUom(text(uom.name))} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"><span>{text(uom.uom_name || uom.name)}</span><Plus className="size-4" /></button>)}{!unconfiguredUoms.length ? <p className="p-4 text-sm text-muted-foreground">Tất cả ĐVT đang hoạt động đã được thêm.</p> : null}</div></DialogContent></Dialog>
  </section>;
}
