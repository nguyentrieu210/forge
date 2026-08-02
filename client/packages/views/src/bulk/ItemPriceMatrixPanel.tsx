/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Folder, Package, Plus, RefreshCw } from "lucide-react";
import { type Doc } from "@metaforge/core";
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast,
} from "@metaforge/ui";
import { mapError, type FrappeAdapter } from "@metaforge/adapter-frappe";
import { useList } from "../container/hooks.js";

interface ItemPriceMatrixPanelProps {
  adapter: FrappeAdapter;
  onChanged: () => Promise<unknown> | unknown;
}

interface PriceDraft {
  uom: string;
  rate: string;
  note: string;
}

const ALL_ITEMS = "Tất cả mặt hàng";

export function ItemPriceMatrixPanel({ adapter, onChanged }: ItemPriceMatrixPanelProps) {
  const itemsQ = useList("Item", { fields: ["name", "item_name", "item_group"], orderBy: "modified desc", pageLength: 300 });
  const groupsQ = useList("Item Group", { fields: ["name", "parent_item_group", "is_group"], orderBy: "name asc", pageLength: 300 });
  const pricesQ = useList("Price List", { fields: ["name", "price_list_name"], orderBy: "modified desc", pageLength: 100 });
  const uomsQ = useList("UOM", { fields: ["name", "uom_name", "disabled"], filters: [["disabled", "=", 0]], orderBy: "uom_name asc", pageLength: 200 });
  const [itemCode, setItemCode] = useState("");
  const [priceList, setPriceList] = useState("");
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(ALL_ITEMS);
  const [groupSearch, setGroupSearch] = useState("");

  const items = itemsQ.data ?? [];
  const groups = groupsQ.data ?? [];
  const priceLists = pricesQ.data ?? [];
  const uoms = uomsQ.data ?? [];
  const activePriceList = priceList || String(priceLists[0]?.name ?? "");
  const ready = !itemsQ.isLoading && !groupsQ.isLoading && !pricesQ.isLoading && !uomsQ.isLoading;
  const selected = useMemo(() => Object.values(drafts).filter((row) => row.uom), [drafts]);

  const groupRows = useMemo(() => {
    const byParent = new Map<string, Doc[]>();
    for (const group of groups) {
      const parent = String(group.parent_item_group ?? "");
      byParent.set(parent, [...(byParent.get(parent) ?? []), group]);
    }
    const rows: Array<{ group: Doc; depth: number }> = [];
    const visited = new Set<string>();
    const visit = (parent: string, depth: number) => {
      for (const group of byParent.get(parent) ?? []) {
        const name = String(group.name);
        if (visited.has(name)) continue;
        visited.add(name);
        rows.push({ group, depth });
        visit(name, depth + 1);
      }
    };
    visit("", 0);
    for (const group of groups) {
      const name = String(group.name);
      if (!visited.has(name)) rows.push({ group, depth: 0 });
    }
    const query = groupSearch.trim().toLocaleLowerCase("vi");
    return query ? rows.filter(({ group }) => String(group.name).toLocaleLowerCase("vi").includes(query)) : rows;
  }, [groupSearch, groups]);

  const visibleItems = useMemo(() => {
    const query = groupSearch.trim().toLocaleLowerCase("vi");
    return items.filter((item) => {
      const groupMatch = selectedGroup === ALL_ITEMS || String(item.item_group ?? "") === selectedGroup;
      const text = String(item.item_name ?? "") + " " + String(item.name ?? "");
      return groupMatch && (!query || text.toLocaleLowerCase("vi").includes(query));
    });
  }, [groupSearch, items, selectedGroup]);

  const toggleUom = (name: string, checked: boolean) => {
    setDrafts((current) => {
      if (!checked) {
        const next = { ...current };
        delete next[name];
        return next;
      }
      return { ...current, [name]: current[name] ?? { uom: name, rate: "", note: "" } };
    });
  };

  const updateDraft = (uom: string, patch: Partial<PriceDraft>) => {
    setDrafts((current) => ({ ...current, [uom]: { uom, rate: "", note: "", ...current[uom], ...patch } }));
  };

  const save = async () => {
    if (!itemCode || !activePriceList || !selected.length) return;
    const invalid = selected.find((row) => row.rate.trim() === "" || !Number.isFinite(Number(row.rate.replace(/\s/g, "").replace(/,/g, "."))));
    if (invalid) {
      toast.error("Chưa nhập đơn giá cho ĐVT " + invalid.uom);
      return;
    }
    setSaving(true);
    try {
      const existing = await adapter.getList("Item Price", {
        fields: ["name", "uom", "modified"],
        filters: [["item_code", "=", itemCode], ["price_list", "=", activePriceList]],
        pageLength: 200,
      });
      const byUom = new Map(existing.map((row) => [String(row.uom ?? ""), row]));
      let saved = 0;
      for (const row of selected) {
        const rate = Number(row.rate.replace(/\s/g, "").replace(/,/g, "."));
        const old = byUom.get(row.uom);
        if (old) {
          await adapter.updateDoc("Item Price", String(old.name), { rate, note: row.note }, String(old.modified ?? ""));
        } else {
          await adapter.createDoc("Item Price", { item_code: itemCode, price_list: activePriceList, uom: row.uom, rate, currency: "VND", note: row.note });
        }
        saved += 1;
      }
      toast.success("Đã lưu " + saved + " dòng giá theo ĐVT");
      setDrafts({});
      setOpen(false);
      await onChanged();
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  const selectedItem = items.find((item) => String(item.name) === itemCode);

  return (
    <>
      <Button variant="outline" size="sm" className="h-10" onClick={() => setOpen(true)}>
        <Plus /> Bảng giá ngày
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-[min(96vw,1280px)] max-w-none flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-4">
            <DialogTitle>Chi tiết bảng giá ngày</DialogTitle>
            <DialogDescription>Chọn nhóm và mặt hàng bên trái, sau đó tick các ĐVT và nhập giá ở bên phải.</DialogDescription>
          </DialogHeader>
          {!ready ? (
            <div className="grid gap-2 p-5 md:grid-cols-2"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
          ) : (
            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-y-auto border-b bg-muted/20 p-3 lg:border-b-0 lg:border-r">
                <Label htmlFor="price-matrix-item-search">Nhóm hàng / mặt hàng</Label>
                <Input id="price-matrix-item-search" className="mt-1.5 h-9" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="Tìm nhóm hoặc mặt hàng..." />
                <button type="button" className={"mt-3 mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold " + (selectedGroup === ALL_ITEMS ? "bg-primary/10 text-primary" : "hover:bg-muted")} onClick={() => setSelectedGroup(ALL_ITEMS)}>
                  <Folder className="size-4" /> {ALL_ITEMS}
                </button>
                <div className="space-y-0.5">
                  {groupRows.map(({ group, depth }) => {
                    const name = String(group.name);
                    const active = selectedGroup === name;
                    const isGroup = group.is_group === true || group.is_group === 1 || String(group.is_group) === "1";
                    return (
                      <button type="button" key={name} className={"flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-left text-sm " + (active ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted")} style={{ paddingLeft: 12 + depth * 16 }} onClick={() => setSelectedGroup(name)}>
                        {isGroup ? (active ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />) : <span className="w-3.5" />}
                        <Folder className="size-4 text-muted-foreground" /><span className="truncate">{name}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 border-t pt-2">
                  {visibleItems.slice(0, 120).map((item) => {
                    const name = String(item.name);
                    return (
                      <button type="button" key={name} className={"flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm " + (itemCode === name ? "bg-primary text-primary-foreground" : "hover:bg-muted")} onClick={() => setItemCode(name)}>
                        <Package className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0"><span className="block truncate font-medium">{String(item.item_name ?? name)}</span><span className="block truncate text-xs opacity-70">{name}</span></span>
                      </button>
                    );
                  })}
                  {!visibleItems.length ? <p className="px-2 py-4 text-xs text-muted-foreground">Không có mặt hàng trong nhóm này.</p> : null}
                </div>
              </aside>
              <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5"><Label>Mặt hàng đã chọn</Label><div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">{selectedItem ? String(selectedItem.item_name ?? selectedItem.name) : "Chọn mặt hàng ở bên trái"}</div></div>
                  <div className="space-y-1.5">
                    <Label>Bảng giá</Label>
                    <Select value={activePriceList} onValueChange={setPriceList}>
                      <SelectTrigger><SelectValue placeholder="Chọn bảng giá" /></SelectTrigger>
                      <SelectContent>{priceLists.map((item) => <SelectItem key={String(item.name)} value={String(item.name)}>{String(item.price_list_name ?? item.name)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader><TableRow><TableHead className="w-12">Chọn</TableHead><TableHead>ĐVT</TableHead><TableHead className="w-44">Đơn giá (VND)</TableHead><TableHead>Ghi chú</TableHead></TableRow></TableHeader>
                    <TableBody>{uoms.map((uom) => {
                      const name = String(uom.name);
                      const draft = drafts[name];
                      return <TableRow key={name}>
                        <TableCell><Checkbox checked={Boolean(draft)} onCheckedChange={(value) => toggleUom(name, value === true)} aria-label={"Chọn " + name} /></TableCell>
                        <TableCell className="font-medium">{String(uom.uom_name ?? name)}</TableCell>
                        <TableCell><Input className="h-8" type="number" min="0" disabled={!draft} value={draft?.rate ?? ""} onChange={(event) => updateDraft(name, { rate: event.target.value })} placeholder="0" /></TableCell>
                        <TableCell><Input className="h-8" disabled={!draft} value={draft?.note ?? ""} onChange={(event) => updateDraft(name, { note: event.target.value })} placeholder="Ghi chú tùy chọn" /></TableCell>
                      </TableRow>;
                    })}</TableBody>
                  </Table>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="size-3.5" /> {selected.length} ĐVT được chọn · dòng trùng sẽ cập nhật, dòng mới sẽ được tạo</div>
              </div>
            </div>
          )}
          <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Hủy</Button>
            <Button onClick={save} disabled={saving || !itemCode || !activePriceList || !selected.length}>{saving ? <RefreshCw className="animate-spin" /> : <Plus />} Lưu bảng giá</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
