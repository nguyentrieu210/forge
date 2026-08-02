/** @jsxImportSource react */
/** Workspace duy nhất: Bảng giá → Nhóm hàng → Mặt hàng → ĐVT × Bảng giá. */
import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  ArrowLeft, CalendarDays, Check, ChevronDown, ChevronRight, Columns3, Folder,
  Maximize2, Minimize2, Package, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw,
  Search, Settings2, Tags, X,
} from "lucide-react";
import type { Doc, DocField } from "@metaforge/core";
import { mapError, type FrappeAdapter } from "@metaforge/adapter-frappe";
import { LinkCombobox, NumberControl } from "@metaforge/controls";
import {
  Badge, Button, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle,
  Input, Label, ResizableHandle, ResizablePanel, ResizablePanelGroup, Skeleton, toast,
} from "@metaforge/ui";
import { useDoc, useList } from "../container/hooks.js";
import { useMetaForge } from "../container/provider.js";
import { useBreakpoint } from "../detail/SplitView.js";

interface ItemPriceMatrixPanelProps { adapter: FrappeAdapter; onChanged: () => Promise<unknown> | unknown; }
type PriceDraft = { rate: string; enabled: boolean; name?: string; modified?: string; sourceUom?: string };
type MobileStep = "tree" | "prices";

const text = (value: unknown) => String(value ?? "");
const normalize = (value: unknown) => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi");
const smartMatch = (value: unknown, query: string) => {
  const haystack = normalize(value).replace(/[^a-z0-9]+/g, " ");
  const tokens = normalize(query).replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
};
const compareGroups = (left: Doc, right: Doc) => {
  const leftLabel = text(left.item_group_name || left.name);
  const rightLabel = text(right.item_group_name || right.name);
  const leftService = normalize(leftLabel) === "dich vu";
  const rightService = normalize(rightLabel) === "dich vu";
  if (leftService !== rightService) return leftService ? 1 : -1;
  return leftLabel.localeCompare(rightLabel, "vi");
};
const priceKey = (priceList: string, uom: string) => `${priceList}\u001f${uom}`;
const numberValue = (value: string) => Number(value.replace(/\s/g, "").replace(/,/g, "."));
const PRICE_FIELD = { fieldname: "rate", label: "Đơn giá", fieldtype: "Currency", precision: "0" } as DocField;
const CONVERSION_FIELD = { fieldname: "conversion_factor", label: "Hệ số quy đổi", fieldtype: "Float", precision: "2" } as DocField;

export function ItemPriceMatrixPanel({ adapter, onChanged }: ItemPriceMatrixPanelProps) {
  const { services } = useMetaForge();
  const breakpoint = useBreakpoint();
  const pricesQ = useList("Price List", { fields: ["name", "price_list_name", "effective_date", "disabled", "modified"], orderBy: "effective_date desc, modified desc", pageLength: 200 });
  const groupsQ = useList("Item Group", { fields: ["name", "item_group_name", "parent_item_group", "is_group"], orderBy: "item_group_name asc", pageLength: 500 });
  // API chặn mỗi trang ở 200 dù client xin lớn hơn. Nạp nhiều trang cố định để tree/search không
  // âm thầm mất phần cuối danh mục (Alumdoor hiện có 296 Item; các mã TRỤC nằm sau trang đầu).
  const itemFields = ["name", "item_name", "item_group", "stock_uom", "default_sales_uom", "disabled"];
  const itemsQ1 = useList("Item", { fields: itemFields, orderBy: "item_name asc", limitStart: 0, pageLength: 200 });
  const itemsQ2 = useList("Item", { fields: itemFields, orderBy: "item_name asc", limitStart: 200, pageLength: 200 });
  const itemsQ3 = useList("Item", { fields: itemFields, orderBy: "item_name asc", limitStart: 400, pageLength: 200 });
  const uomsQ = useList("UOM", { fields: ["name", "uom_name", "disabled"], orderBy: "uom_name asc", pageLength: 500 });
  const [priceSearch, setPriceSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [selectedPriceList, setSelectedPriceList] = useState("");
  const [expandedPrices, setExpandedPrices] = useState<Set<string>>(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [collapsedSearchPrices, setCollapsedSearchPrices] = useState<Set<string>>(() => new Set());
  const [collapsedSearchGroups, setCollapsedSearchGroups] = useState<Set<string>>(() => new Set());
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [itemCode, setItemCode] = useState("");
  const [mobileStep, setMobileStep] = useState<MobileStep>("tree");
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [initialDrafts, setInitialDrafts] = useState<Record<string, PriceDraft>>({});
  const [conversionDrafts, setConversionDrafts] = useState<Record<string, string>>({});
  const [initialConversions, setInitialConversions] = useState<Record<string, string>>({});
  const [addedUoms, setAddedUoms] = useState<string[]>([]);
  const [removedUoms, setRemovedUoms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [addingUom, setAddingUom] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [hiddenPrices, setHiddenPrices] = useState<Set<string>>(() => new Set());
  const [newName, setNewName] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");

  const prices = pricesQ.data ?? [];
  const groups = groupsQ.data ?? [];
  const items = useMemo(() => {
    const unique = new Map<string, Doc>();
    for (const item of [...(itemsQ1.data ?? []), ...(itemsQ2.data ?? []), ...(itemsQ3.data ?? [])]) {
      if (!Number(item.disabled)) unique.set(text(item.name), item);
    }
    return [...unique.values()];
  }, [itemsQ1.data, itemsQ2.data, itemsQ3.data]);
  const selectedItemQ = useDoc("Item", itemCode);
  const currentPricesQ = useList("Item Price", {
    fields: ["name", "price_list", "uom", "rate", "disabled", "modified"],
    filters: [["item_code", "=", itemCode]], pageLength: 1000,
  }, Boolean(itemCode));

  const groupNames = useMemo(() => new Set(groups.map((row) => text(row.name))), [groups]);
  const rootGroups = useMemo(() => groups.filter((row) => !text(row.parent_item_group) || !groupNames.has(text(row.parent_item_group))).sort(compareGroups), [groupNames, groups]);
  const childrenByGroup = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const row of groups) {
      const parent = text(row.parent_item_group);
      const list = map.get(parent) ?? [];
      list.push(row); map.set(parent, list);
    }
    for (const list of map.values()) list.sort(compareGroups);
    return map;
  }, [groups]);
  const itemsByGroup = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const row of items) {
      const group = text(row.item_group);
      const list = map.get(group) ?? [];
      list.push(row); map.set(group, list);
    }
    return map;
  }, [items]);
  const matchingItems = useMemo(() => {
    const query = normalize(itemSearch.trim());
    return query ? items.filter((row) => smartMatch(`${text(row.name)} ${text(row.item_name)} ${text(row.item_group)} ${text(row.stock_uom)}`, query)) : items;
  }, [itemSearch, items]);
  const matchingNames = useMemo(() => new Set(matchingItems.map((row) => text(row.name))), [matchingItems]);
  const groupsWithMatches = useMemo(() => {
    if (!itemSearch.trim()) return new Set(groups.map((row) => text(row.name)));
    const result = new Set<string>();
    const parentByName = new Map(groups.map((row) => [text(row.name), text(row.parent_item_group)]));
    for (const item of matchingItems) {
      let cursor = text(item.item_group);
      while (cursor && !result.has(cursor)) { result.add(cursor); cursor = parentByName.get(cursor) ?? ""; }
    }
    return result;
  }, [groups, itemSearch, matchingItems]);
  const visiblePrices = useMemo(() => {
    const query = normalize(priceSearch.trim());
    return query ? prices.filter((row) => smartMatch(`${text(row.name)} ${text(row.price_list_name)} ${text(row.effective_date)} ${Number(row.disabled) ? "ngừng dùng" : "đang dùng"}`, query)) : prices;
  }, [priceSearch, prices]);
  const orderedPrices = useMemo(() => selectedPriceList
    ? [...prices].sort((left, right) => Number(text(right.name) === selectedPriceList) - Number(text(left.name) === selectedPriceList))
    : prices, [prices, selectedPriceList]);
  const shownPrices = useMemo(() => orderedPrices.filter((price) => !hiddenPrices.has(text(price.name))), [hiddenPrices, orderedPrices]);

  useEffect(() => { setCollapsedSearchPrices(new Set()); setCollapsedSearchGroups(new Set()); }, [itemSearch]);

  const itemDoc = selectedItemQ.data?.doc;
  const stockUom = text(itemDoc?.stock_uom);
  const legacyUom = text(itemDoc?.default_sales_uom) || stockUom;
  const conversionRows = useMemo(() => Array.isArray(itemDoc?.uom_conversions) ? itemDoc.uom_conversions as Doc[] : [], [itemDoc?.uom_conversions]);
  const configuredUomNames = useMemo(() => [...new Set([
    stockUom, text(itemDoc?.default_purchase_uom), text(itemDoc?.default_sales_uom),
    ...conversionRows.map((row) => text(row.uom)), ...addedUoms,
  ].filter((name) => Boolean(name) && !removedUoms.includes(name)))], [addedUoms, conversionRows, itemDoc?.default_purchase_uom, itemDoc?.default_sales_uom, removedUoms, stockUom]);
  const activeUoms = useMemo(() => (uomsQ.data ?? []).filter((row) => !Number(row.disabled)), [uomsQ.data]);
  const configuredUoms = useMemo(() => configuredUomNames.map((name) => activeUoms.find((row) => text(row.name) === name) ?? { name, uom_name: name }), [activeUoms, configuredUomNames]);

  useEffect(() => {
    if (!itemCode || !itemDoc) { setConversionDrafts({}); setInitialConversions({}); setAddedUoms([]); setRemovedUoms([]); return; }
    const values: Record<string, string> = { [stockUom]: "1" };
    conversionRows.forEach((row) => { values[text(row.uom)] = text(row.conversion_factor); });
    setConversionDrafts(values); setInitialConversions(values); setAddedUoms([]); setRemovedUoms([]);
  }, [conversionRows, itemCode, itemDoc, stockUom]);

  useEffect(() => {
    if (!itemCode || currentPricesQ.isLoading) { setDrafts({}); setInitialDrafts({}); return; }
    const existing = new Map((currentPricesQ.data ?? []).map((row) => [priceKey(text(row.price_list), text(row.uom) || legacyUom), row]));
    const next: Record<string, PriceDraft> = {};
    for (const uom of configuredUomNames) for (const price of prices) {
      const key = priceKey(text(price.name), uom); const row = existing.get(key);
      next[key] = { rate: row ? text(row.rate) : "", enabled: Boolean(row && !Number(row.disabled)), name: row ? text(row.name) : undefined, modified: row ? text(row.modified) : undefined, sourceUom: row ? text(row.uom) : undefined };
    }
    setDrafts(next); setInitialDrafts(next);
  }, [configuredUomNames, currentPricesQ.data, currentPricesQ.isLoading, itemCode, legacyUom, prices]);

  const toggleSet = (setter: Dispatch<SetStateAction<Set<string>>>, key: string) => setter((current) => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next;
  });
  const setPriceDraft = (priceList: string, uom: string, patch: Partial<PriceDraft>) => setDrafts((all) => {
    const key = priceKey(priceList, uom); return { ...all, [key]: { rate: "", enabled: false, ...all[key], ...patch } };
  });
  const addUom = (uom: string) => {
    if (!uom || configuredUomNames.includes(uom)) {
      if (uom) toast.error(`${uom} đã có trong các ĐVT áp dụng.`);
      return;
    }
    setAddedUoms((all) => all.includes(uom) ? all : [...all, uom]);
    setConversionDrafts((all) => ({ ...all, [uom]: all[uom] ?? "" }));
    setAddingUom(false);
    toast.success(`Đã thêm ${uom}. Nhập hệ số quy đổi rồi bấm Lưu thay đổi.`);
  };
  const removeUom = (uom: string) => {
    if (uom === stockUom) return;
    if (addedUoms.includes(uom)) setAddedUoms((all) => all.filter((name) => name !== uom));
    else setRemovedUoms((all) => all.includes(uom) ? all : [...all, uom]);
    setConversionDrafts((all) => { const next = { ...all }; delete next[uom]; return next; });
  };

  const save = async () => {
    if (!itemCode || !itemDoc) return;
    const enabled = Object.entries(drafts).find(([, draft]) => draft.enabled && (!draft.rate.trim() || !Number.isFinite(numberValue(draft.rate)) || numberValue(draft.rate) < 0));
    const badConversion = configuredUomNames.find((uom) => uom !== stockUom && (!conversionDrafts[uom] || !Number.isFinite(numberValue(conversionDrafts[uom])) || numberValue(conversionDrafts[uom]) <= 0));
    if (enabled) { toast.error("Giá đang áp dụng phải là số không âm."); return; }
    if (badConversion) { toast.error(`Chưa nhập hệ số quy đổi hợp lệ cho ${badConversion}.`); return; }
    setSaving(true);
    try {
      if (JSON.stringify(conversionDrafts) !== JSON.stringify(initialConversions) || addedUoms.length || removedUoms.length) {
        const rowMap = new Map(conversionRows.map((row) => [text(row.uom), row]));
        const updatedRows = configuredUomNames.filter((uom) => uom !== stockUom).map((uom) => ({
          ...rowMap.get(uom), uom, conversion_factor: numberValue(conversionDrafts[uom] ?? ""),
        }));
        const itemPatch: Partial<Doc> = { uom_conversions: updatedRows };
        if (removedUoms.includes(text(itemDoc.default_purchase_uom))) itemPatch.default_purchase_uom = "";
        if (removedUoms.includes(text(itemDoc.default_sales_uom))) itemPatch.default_sales_uom = "";
        await adapter.updateDoc("Item", itemCode, itemPatch, text(itemDoc.modified));
      }
      for (const row of currentPricesQ.data ?? []) {
        if (removedUoms.includes(text(row.uom)) && !Number(row.disabled)) {
          await adapter.updateDoc("Item Price", text(row.name), { disabled: 1 }, text(row.modified));
        }
      }
      for (const [key, draft] of Object.entries(drafts)) {
        const before = initialDrafts[key];
        if (before && before.rate === draft.rate && before.enabled === draft.enabled) continue;
        const [priceList, uom] = key.split("\u001f"); if (!priceList || !uom) continue;
        const payload = { rate: draft.rate.trim() ? numberValue(draft.rate) : 0, disabled: draft.enabled ? 0 : 1, ...(!draft.sourceUom ? { uom } : {}) };
        if (draft.name) await adapter.updateDoc("Item Price", draft.name, payload, draft.modified ?? "");
        else if (draft.enabled) await adapter.createDoc("Item Price", { item_code: itemCode, price_list: priceList, uom, currency: "VND", ...payload });
      }
      toast.success("Đã lưu ĐVT, quy đổi và bảng giá");
      setAddedUoms([]); setRemovedUoms([]); await selectedItemQ.refetch(); await currentPricesQ.refetch(); await onChanged();
    } catch (error) { toast.error(mapError(error).message); } finally { setSaving(false); }
  };

  const createPriceList = async () => {
    if (!newName.trim() || !effectiveDate) return;
    try {
      const created = await adapter.createDoc("Price List", { price_list_name: newName.trim(), effective_date: effectiveDate, currency: "VND" });
      const name = text(created.name || newName.trim());
      await pricesQ.refetch(); setSelectedPriceList(name); setExpandedPrices((all) => new Set(all).add(name));
      setCreateOpen(false); setNewName(""); setEffectiveDate(""); toast.success("Đã tạo bảng giá mới");
    } catch (error) { toast.error(mapError(error).message); }
  };

  const selectItem = (priceList: string, item: Doc) => {
    setSelectedPriceList(priceList); setItemCode(text(item.name)); setMobileStep("prices");
  };
  const renderGroup = (priceList: string, row: Doc, depth: number): ReactNode => {
    const name = text(row.name); if (!groupsWithMatches.has(name)) return null;
    const key = `${priceList}\u001f${name}`;
    const searching = Boolean(itemSearch.trim());
    const open = searching ? !collapsedSearchGroups.has(key) : expandedGroups.has(key);
    const childGroups = childrenByGroup.get(name) ?? [];
    const directItems = (itemsByGroup.get(name) ?? []).filter((item) => !itemSearch.trim() || matchingNames.has(text(item.name)));
    const hasChildren = childGroups.some((child) => groupsWithMatches.has(text(child.name))) || directItems.length > 0;
    return <div key={key}>
      <button type="button" onClick={() => hasChildren && toggleSet(searching ? setCollapsedSearchGroups : setExpandedGroups, key)} className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm hover:bg-muted" style={{ paddingLeft: `${12 + depth * 16}px` }}>
        {hasChildren ? (open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />) : <span className="size-4" />}
        <Folder className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{text(row.item_group_name || name)}</span>
      </button>
      {open ? <div>
        {childGroups.map((child) => renderGroup(priceList, child, depth + 1))}
        {directItems.map((item) => <button key={`${priceList}:${text(item.name)}`} type="button" onClick={() => selectItem(priceList, item)} className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm ${itemCode === text(item.name) && selectedPriceList === priceList ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`} style={{ paddingLeft: `${28 + (depth + 1) * 16}px` }}>
          <Package className="size-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate">{text(item.item_name || item.name)}</span><span className="block truncate text-xs text-muted-foreground">{text(item.name)} · {text(item.stock_uom)}</span></span>
        </button>)}
      </div> : null}
    </div>;
  };

  const error = pricesQ.error || groupsQ.error || itemsQ1.error || itemsQ2.error || itemsQ3.error || uomsQ.error;
  const loading = pricesQ.isLoading || groupsQ.isLoading || itemsQ1.isLoading || itemsQ2.isLoading || itemsQ3.isLoading || uomsQ.isLoading;
  if (loading) return <div className="grid h-full gap-3 p-4 xl:grid-cols-[minmax(16rem,30%)_1fr]"><Skeleton className="h-full" /><Skeleton className="h-full" /></div>;
  if (error) return <div className="grid h-full place-items-center p-6 text-sm text-destructive">{mapError(error).message}</div>;

  const treePanel = <aside className="flex h-full min-h-0 flex-col bg-card">
    <div className="space-y-2 border-b p-3">
      <div className="flex items-center gap-2 font-semibold"><Tags className="size-4" /> Bảng giá theo ngày<Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setTreeCollapsed(true)} aria-label="Thu gọn cây bảng giá"><PanelLeftClose /></Button></div>
      <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" value={priceSearch} onChange={(event) => setPriceSearch(event.target.value)} placeholder="Tìm bảng giá..." /></div>
      <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Tìm mã hoặc tên mặt hàng..." /></div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-2">
      {visiblePrices.map((price) => {
        const name = text(price.name); const searching = Boolean(itemSearch.trim()); const open = searching ? !collapsedSearchPrices.has(name) : expandedPrices.has(name);
        return <div key={name} className="mb-1">
          <button type="button" onClick={() => { setSelectedPriceList(name); toggleSet(searching ? setCollapsedSearchPrices : setExpandedPrices, name); }} className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left ${selectedPriceList === name ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
            {open ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{text(price.price_list_name || name)}</span><span className="block text-xs text-muted-foreground"><CalendarDays className="mr-1 inline size-3" />{text(price.effective_date) || "Chưa đặt ngày"}{Number(price.disabled) ? " · Ngừng dùng" : ""}</span></span>
          </button>
          {open ? <div>{rootGroups.map((group) => renderGroup(name, group, 0))}{itemSearch.trim() && !matchingItems.length ? <p className="px-8 py-3 text-xs text-muted-foreground">Không tìm thấy mặt hàng.</p> : null}</div> : null}
        </div>;
      })}
      {!visiblePrices.length ? <p className="p-4 text-sm text-muted-foreground">Không tìm thấy bảng giá.</p> : null}
    </div>
  </aside>;

  const matrixPanel = itemCode ? <div className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 flex-wrap items-start gap-3 border-b p-4"><div><h3 className="font-semibold">{text(itemDoc?.item_name || itemCode)}</h3><p className="text-xs text-muted-foreground">{itemCode} · ĐVT tồn kho: {stockUom || "—"}</p></div><div className="ml-auto flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setColumnsOpen(true)}><Columns3 /> Cột ({shownPrices.length}/{prices.length})</Button><Button size="sm" variant="outline" onClick={() => setFocusMode((value) => !value)}>{focusMode ? <Minimize2 /> : <Maximize2 />} {focusMode ? "Thu nhỏ" : "Phóng to"}</Button><Button size="sm" variant="outline" onClick={() => setAddingUom(true)} disabled={!itemDoc || addingUom}><Settings2 /> Thêm ĐVT</Button><Button size="sm" onClick={() => void save()} disabled={saving || !itemDoc}>{saving ? <RefreshCw className="animate-spin" /> : <Check />} Lưu thay đổi</Button></div></div>
    <div className="min-h-0 flex-1 overflow-auto"><table className="w-max min-w-full border-collapse text-sm"><thead className="sticky top-0 z-10 bg-muted/95"><tr><th className="sticky left-0 z-20 min-w-40 border-b border-r bg-muted px-3 py-2 text-left">ĐVT</th><th className="sticky left-40 z-20 min-w-52 border-b border-r bg-muted px-3 py-2 text-left">Quy đổi</th>{shownPrices.map((price) => <th key={text(price.name)} className={`min-w-48 border-b border-r px-3 py-2 text-left ${selectedPriceList === text(price.name) ? "bg-primary/10" : ""}`}><a className="font-medium text-primary hover:underline" href={`/app/Price%20List/${encodeURIComponent(text(price.name))}`}>{text(price.price_list_name || price.name)}</a><span className="mt-0.5 block text-xs font-normal text-muted-foreground"><CalendarDays className="mr-1 inline size-3" />{text(price.effective_date) || "Chưa đặt ngày"}{Number(price.disabled) ? " · Ngừng dùng" : ""}</span></th>)}<th className="w-16 border-b px-2 py-2 text-center">Xóa</th></tr></thead><tbody>{addingUom ? <tr className="bg-primary/5"><td className="sticky left-0 z-[2] border-b border-r bg-card p-2"><LinkCombobox id="new-item-uom" value="" target="UOM" label="Đơn vị tính" referenceDoctype="Item" compact search={(doctype, query, options) => adapter.searchLink(doctype, query, options)} onChange={addUom} /></td><td className="border-b border-r px-3 py-2 text-xs text-muted-foreground" colSpan={shownPrices.length + 2}>Tìm và chọn ĐVT để thêm dòng, hoặc <button type="button" className="text-primary hover:underline" onClick={() => setAddingUom(false)}>hủy</button>.</td></tr> : null}{configuredUoms.map((uom) => { const uomName = text(uom.name); const isNew = addedUoms.includes(uomName); return <tr key={uomName} className={isNew ? "bg-primary/5" : ""}><td className="sticky left-0 z-[2] border-b border-r bg-card px-3 py-3 font-medium"><span className="block min-w-0 truncate">{text(uom.uom_name || uomName)}{uomName === stockUom ? <Badge className="ml-2" variant="secondary">Tồn</Badge> : null}{isNew ? <Badge className="ml-2">Mới</Badge> : null}</span></td><td className="sticky left-40 z-[2] border-b border-r bg-card px-3 py-2"><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">1 {uomName} =</span><div className="w-28"><NumberControl field={CONVERSION_FIELD} value={uomName === stockUom ? 1 : (conversionDrafts[uomName] ? numberValue(conversionDrafts[uomName]) : null)} readOnly={uomName === stockUom} compact services={services} onChange={(value) => setConversionDrafts((all) => ({ ...all, [uomName]: value === null || value === undefined ? "" : String(value) }))} /></div><span className="text-xs text-muted-foreground">{stockUom}</span></div></td>{shownPrices.map((price) => { const listName = text(price.name); const draft = drafts[priceKey(listName, uomName)] ?? { rate: "", enabled: false }; return <td key={listName} className={`border-b border-r px-3 py-2 ${selectedPriceList === listName ? "bg-primary/5" : ""}`}><div className="flex items-center gap-2"><Checkbox checked={draft.enabled} onCheckedChange={(value) => setPriceDraft(listName, uomName, { enabled: value === true })} aria-label={`Áp dụng ${uomName} cho ${listName}`} /><div className="w-32"><NumberControl field={PRICE_FIELD} value={draft.rate ? numberValue(draft.rate) : null} readOnly={!draft.enabled || Number(price.disabled) === 1} compact services={services} onChange={(value) => setPriceDraft(listName, uomName, { rate: value === null || value === undefined ? "" : String(value) })} /></div><span className="text-xs text-muted-foreground">đ</span></div></td>; })}<td className="border-b px-2 py-2 text-center">{uomName !== stockUom ? <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeUom(uomName)} aria-label={`Xóa dòng ${uomName}`}><X /></Button> : null}</td></tr>; })}</tbody></table>{!shownPrices.length ? <div className="grid h-40 place-items-center text-sm text-muted-foreground">Đang ẩn toàn bộ cột Bảng giá. Bấm Cột để hiện lại.</div> : null}</div>
  </div> : <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">Mở một Bảng giá, mở Nhóm hàng rồi chọn Mặt hàng để nhập giá.</div>;

  return <section className="flex h-full min-h-0 flex-col bg-background">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-card px-4 py-3"><div><h2 className="text-base font-semibold">Quản lý bảng giá</h2><p className="text-xs text-muted-foreground">Bảng giá → Nhóm hàng → Mặt hàng; mỗi bảng giá vẫn là một cột để đối chiếu.</p></div><Button className="ml-auto" size="sm" onClick={() => setCreateOpen(true)}><Plus /> Tạo bảng giá</Button></header>
    <div className="min-h-0 flex-1">{breakpoint === "mobile" ? (mobileStep === "tree" ? treePanel : <div className="flex h-full min-h-0 flex-col"><Button variant="ghost" size="sm" className="m-2 self-start" onClick={() => setMobileStep("tree")}><ArrowLeft /> Cây bảng giá</Button><div className="min-h-0 flex-1">{matrixPanel}</div></div>) : focusMode ? <div className="h-full min-w-0">{matrixPanel}</div> : treeCollapsed ? <div className="flex h-full min-w-0"><div className="flex w-11 shrink-0 justify-center border-r bg-card pt-3"><Button type="button" variant="ghost" size="icon-sm" onClick={() => setTreeCollapsed(false)} aria-label="Mở cây bảng giá"><PanelLeftOpen /></Button></div><div className="min-w-0 flex-1">{matrixPanel}</div></div> : <ResizablePanelGroup direction="horizontal" autoSaveId="mf-item-price-tree:v1"><ResizablePanel defaultSize={28} minSize={20} maxSize={45} className="min-w-0">{treePanel}</ResizablePanel><ResizableHandle withHandle /><ResizablePanel defaultSize={72} minSize={45} className="min-w-0">{matrixPanel}</ResizablePanel></ResizablePanelGroup>}</div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Tạo bảng giá</DialogTitle></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-1.5"><Label>Tên bảng giá</Label><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ví dụ: Giá đại lý tháng 8" /></div><div className="grid gap-1.5"><Label>Ngày áp dụng</Label><Input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button><Button onClick={() => void createPriceList()} disabled={!newName.trim() || !effectiveDate}>Tạo bảng giá</Button></div></DialogContent></Dialog>
    <Dialog open={columnsOpen} onOpenChange={setColumnsOpen}><DialogContent><DialogHeader><DialogTitle>Ẩn/hiện cột Bảng giá</DialogTitle></DialogHeader><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setHiddenPrices(new Set())}>Hiện tất cả</Button><Button size="sm" variant="outline" onClick={() => setHiddenPrices(new Set(prices.map((price) => text(price.name))))}>Ẩn tất cả</Button></div><div className="max-h-80 space-y-1 overflow-auto">{prices.map((price) => { const name = text(price.name); return <label key={name} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"><Checkbox checked={!hiddenPrices.has(name)} onCheckedChange={() => toggleSet(setHiddenPrices, name)} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{text(price.price_list_name || name)}</span><span className="text-xs text-muted-foreground">{text(price.effective_date) || "Chưa đặt ngày"}</span></span></label>; })}</div></DialogContent></Dialog>
  </section>;
}
