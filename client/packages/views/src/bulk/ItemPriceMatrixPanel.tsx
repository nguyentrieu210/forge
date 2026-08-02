/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { Check, Plus, RefreshCw } from "lucide-react";
import { type Doc } from "@metaforge/core";
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from "@metaforge/ui";
import { mapError, type FrappeAdapter } from "@metaforge/adapter-frappe";
import { useList } from "../container/hooks.js";

interface ItemPriceMatrixPanelProps {
  adapter: FrappeAdapter;
  onChanged: () => Promise<unknown> | unknown;
}

interface PriceDraft { uom: string; rate: string; note: string; }

export function ItemPriceMatrixPanel({ adapter, onChanged }: ItemPriceMatrixPanelProps) {
  const itemsQ = useList("Item", { fields: ["name", "item_name"], orderBy: "modified desc", pageLength: 200 });
  const pricesQ = useList("Price List", { fields: ["name", "price_list_name"], orderBy: "modified desc", pageLength: 100 });
  const uomsQ = useList("UOM", { fields: ["name", "uom_name", "disabled"], filters: [["disabled", "=", 0]], orderBy: "uom_name asc", pageLength: 200 });
  const [itemCode, setItemCode] = useState("");
  const [priceList, setPriceList] = useState("");
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const items = itemsQ.data ?? [];
  const priceLists = pricesQ.data ?? [];
  const uoms = uomsQ.data ?? [];
  const activePriceList = priceList || String(priceLists[0]?.name ?? "");
  const ready = !itemsQ.isLoading && !pricesQ.isLoading && !uomsQ.isLoading;
  const selected = useMemo(() => Object.values(drafts).filter((row) => row.uom), [drafts]);

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
      toast.error(`Chưa nhập đơn giá cho ĐVT ${invalid.uom}`);
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
      toast.success(`Đã lưu ${saved} dòng giá theo ĐVT`);
      setDrafts({});
      setOpen(false);
      await onChanged();
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-10" onClick={() => setOpen(true)}>
        <Plus /> Nhập giá nhiều ĐVT
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-[min(94vw,1080px)] max-w-none flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-4">
            <DialogTitle>Nhập giá nhiều ĐVT</DialogTitle>
            <DialogDescription>Chọn một mặt hàng, tick các đơn vị tính cần áp giá rồi nhập giá theo từng dòng.</DialogDescription>
          </DialogHeader>
          {!ready ? <div className="grid gap-2 p-5 md:grid-cols-2"><Skeleton className="h-9" /><Skeleton className="h-9" /></div> : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Mặt hàng</Label>
              <Select value={itemCode} onValueChange={setItemCode}>
                <SelectTrigger><SelectValue placeholder="Chọn mặt hàng" /></SelectTrigger>
                <SelectContent>{items.map((item) => <SelectItem key={String(item.name)} value={String(item.name)}>{String(item.item_name ?? item.name)} · {String(item.name)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
                  <TableCell><Checkbox checked={Boolean(draft)} onCheckedChange={(value) => toggleUom(name, value === true)} aria-label={`Chọn ${name}`} /></TableCell>
                  <TableCell className="font-medium">{String(uom.uom_name ?? name)}</TableCell>
                  <TableCell><Input className="h-8" type="number" min="0" disabled={!draft} value={draft?.rate ?? ""} onChange={(event) => updateDraft(name, { rate: event.target.value })} placeholder="0" /></TableCell>
                  <TableCell><Input className="h-8" disabled={!draft} value={draft?.note ?? ""} onChange={(event) => updateDraft(name, { note: event.target.value })} placeholder="Ghi chú tùy chọn" /></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="size-3.5" /> {selected.length} ĐVT được chọn · dòng trùng sẽ cập nhật, dòng mới sẽ được tạo</div>
            </div>
          )}
          <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Hủy</Button>
            <Button onClick={save} disabled={saving || !itemCode || !activePriceList || !selected.length}>
              {saving ? <RefreshCw className="animate-spin" /> : <Plus />} Lưu bảng giá
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
