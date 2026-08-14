/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Factory, Loader2, RefreshCw, Save } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@metaforge/ui";
import type { Doc } from "@metaforge/core";
import { useMetaForge } from "../../../container/provider.js";

type Json = Record<string, unknown>;

interface PlanRowState {
  selected: boolean;
  qty: string;
  bom: string;
}

export interface AlumdoorProductionPlanCreateProps {
  closeRequest?: number;
  onCreated: (name: string) => void;
  onCancel: () => void;
}

export function AlumdoorProductionPlanCreate(props: AlumdoorProductionPlanCreateProps) {
  const { adapter, businessContext } = useMetaForge();
  const [companies, setCompanies] = useState<Doc[]>([]);
  const [company, setCompany] = useState("");
  const [postingDate, setPostingDate] = useState(today());
  const [orders, setOrders] = useState<Doc[]>([]);
  const [orderName, setOrderName] = useState("");
  const [orderDoc, setOrderDoc] = useState<Doc | null>(null);
  const [bomByItem, setBomByItem] = useState<Record<string, Doc[]>>({});
  const [rows, setRows] = useState<Record<string, PlanRowState>>({});
  const [canCreate, setCanCreate] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [saving, setSaving] = useState(false);
  const closeSeen = useRef(props.closeRequest ?? 0);

  useEffect(() => {
    if ((props.closeRequest ?? 0) === closeSeen.current) return;
    closeSeen.current = props.closeRequest ?? 0;
    props.onCancel();
  }, [props.closeRequest, props.onCancel]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [companyRows, caps] = await Promise.all([
          adapter.getList("Company", {
            fields: ["name", "company_name"],
            orderBy: "name asc",
            pageLength: 100,
          }),
          adapter.getCapabilities("Production Plan"),
        ]);
        if (!active) return;
        setCompanies(companyRows);
        setCanCreate(Boolean(caps.create));
        setCanSubmit(Boolean(caps.submit));
        const contextCompany = text((businessContext as Json | undefined)?.company);
        const initial = companyRows.some((row) => text(row.name) === contextCompany)
          ? contextCompany
          : text(companyRows[0]?.name);
        setCompany(initial);
      } catch (error) {
        if (active) toast.error(adapter.mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, businessContext]);

  const loadOrders = useCallback(async (targetCompany: string) => {
    if (!targetCompany) { setOrders([]); return; }
    try {
      const result = await adapter.getList("Sales Order", {
        fields: ["name", "customer", "transaction_date", "delivery_date", "status", "docstatus"],
        filters: { company: targetCompany, docstatus: 1 },
        orderBy: "transaction_date desc",
        pageLength: 100,
      });
      setOrders(result.filter((row) => !["Closed", "Cancelled"].includes(text(row.status))));
    } catch (error) {
      setOrders([]);
      toast.error(adapter.mapError(error).message);
    }
  }, [adapter]);

  useEffect(() => {
    setOrderName("");
    setOrderDoc(null);
    setRows({});
    setBomByItem({});
    void loadOrders(company);
  }, [company, loadOrders]);

  const loadOrder = useCallback(async (name: string) => {
    if (!name || !company) return;
    setLoadingOrder(true);
    try {
      const result = await adapter.getDoc("Sales Order", name);
      const doc = result.doc;
      const itemRows = childRows(doc.items);
      const itemCodes = [...new Set(itemRows.filter((row) => !hasSelectablePackageProvenance(row)).map((row) => text(row.item_code)).filter(Boolean))];
      const bomEntries = await Promise.all(itemCodes.map(async (itemCode) => {
        const boms = await adapter.getList("Bill of Materials", {
          fields: ["name", "item", "revision", "bom_status", "effective_from", "effective_to", "modified", "docstatus"],
          filters: { company, item: itemCode, docstatus: 1 },
          orderBy: "revision desc",
          pageLength: 100,
        });
        return [itemCode, activeBoms(boms, postingDate)] as const;
      }));
      const nextBoms = Object.fromEntries(bomEntries);
      const nextRows: Record<string, PlanRowState> = {};
      for (const row of itemRows) {
        const rowId = rowIdentity(row);
        if (!rowId) continue;
        const candidates = nextBoms[text(row.item_code)] ?? [];
        nextRows[rowId] = {
          selected: false,
          qty: quantityText(row.qty),
          bom: candidates.length === 1 ? text(candidates[0]?.name) : "",
        };
      }
      setOrderDoc(doc);
      setBomByItem(nextBoms);
      setRows(nextRows);
    } catch (error) {
      setOrderDoc(null);
      setRows({});
      setBomByItem({});
      toast.error(adapter.mapError(error).message);
    } finally {
      setLoadingOrder(false);
    }
  }, [adapter, company, postingDate]);

  useEffect(() => {
    if (orderName) void loadOrder(orderName);
  }, [orderName, postingDate, loadOrder]);

  const salesRows = useMemo(() => childRows(orderDoc?.items), [orderDoc]);
  const selectedCount = useMemo(() => Object.values(rows).filter((row) => row.selected).length, [rows]);

  const patchRow = (rowId: string, patch: Partial<PlanRowState>) => {
    setRows((current) => ({ ...current, [rowId]: { ...(current[rowId] ?? { selected: false, qty: "", bom: "" }), ...patch } }));
  };

  const save = async (submitNow: boolean) => {
    if (!canCreate || !company || !orderDoc) return;
    const selected = salesRows.filter((line) => rows[rowIdentity(line)]?.selected);
    if (!selected.length) { toast.error("Chọn ít nhất một dòng đơn bán để lập kế hoạch sản xuất."); return; }

    const items: Json[] = [];
    for (const line of selected) {
      const rowId = rowIdentity(line);
      const state = rows[rowId];
      if (!state) continue;
      if (hasSelectablePackageProvenance(line)) {
        toast.error(`Dòng ${rowId} thuộc cụm Tách món chưa có physical obligation authority.`);
        return;
      }
      if (!state.bom) { toast.error(`Dòng ${rowId} chưa chọn BOM.`); return; }
      const qty = Number(state.qty);
      const orderedQty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) { toast.error(`Dòng ${rowId} có số lượng kế hoạch không hợp lệ.`); return; }
      if (Number.isFinite(orderedQty) && qty > orderedQty + 1e-9) { toast.error(`Dòng ${rowId} vượt số lượng đơn bán.`); return; }
      items.push({
        item_code: text(line.item_code),
        bom_no: state.bom,
        planned_qty: state.qty,
        ...(text(line.warehouse) ? { warehouse: text(line.warehouse) } : {}),
        sales_order: text(orderDoc.name),
        sales_order_row_id: rowId,
      });
    }

    setSaving(true);
    try {
      const created = await adapter.createDoc("Production Plan", {
        company,
        posting_at: `${postingDate}T00:00:00.000Z`,
        items,
      });
      const finalDoc = submitNow ? await adapter.submit(created) : created;
      toast.success(submitNow ? "Đã tạo và ghi sổ kế hoạch sản xuất." : "Đã lưu kế hoạch sản xuất nháp.");
      props.onCreated(String(finalDoc.name));
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="grid h-40 place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Đang tải kế hoạch sản xuất…</div>;

  return <div className="flex h-full min-h-0 flex-col" data-surface="alumdoor-production-plan-create">
    <div className="shrink-0 border-b bg-card px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Công ty" className="min-w-56 flex-1">
          <Select value={company} onValueChange={setCompany}><SelectTrigger><SelectValue placeholder="Chọn công ty" /></SelectTrigger><SelectContent>{companies.map((row) => <SelectItem key={text(row.name)} value={text(row.name)}>{text(row.company_name) || text(row.name)}</SelectItem>)}</SelectContent></Select>
        </Field>
        <Field label="Ngày kế hoạch" className="w-44"><Input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} /></Field>
        <Field label="Đơn bán đã ghi sổ" className="min-w-72 flex-[1.4]">
          <Select value={orderName} onValueChange={setOrderName}><SelectTrigger><SelectValue placeholder="Chọn Sales Order" /></SelectTrigger><SelectContent>{orders.map((row) => <SelectItem key={text(row.name)} value={text(row.name)}>{text(row.name)} · {text(row.customer)} · {text(row.transaction_date)}</SelectItem>)}</SelectContent></Select>
        </Field>
        <Button variant="outline" onClick={() => void loadOrders(company)} disabled={!company}><RefreshCw className="size-4" /> Nạp lại</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Exact Sales Order row</Badge><span>Server sẽ tự khóa version + snapshot + checksum khi lưu/submit; màn này không tự quyết lineage.</span>
      </div>
    </div>

    <div className="min-h-0 flex-1 overflow-auto p-4">
      {loadingOrder ? <div className="grid h-40 place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Đang đọc dòng đơn bán và BOM…</div> : !orderDoc ? <div className="grid h-40 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">Chọn một đơn bán đã ghi sổ để lập kế hoạch.</div> : <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><div><h3 className="font-medium">Nhu cầu theo đơn {text(orderDoc.name)}</h3><p className="text-xs text-muted-foreground">Số lượng hiển thị là số lượng đơn bán, chưa phải ATP/net requirement. Cumulative planned quantity được server kiểm lại khi submit.</p></div><Badge variant="outline">Đã chọn {selectedCount}</Badge></div>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-10" /><TableHead>Dòng SO</TableHead><TableHead>Mặt hàng</TableHead><TableHead className="text-right">SL đơn</TableHead><TableHead>BOM</TableHead><TableHead className="w-36">SL kế hoạch</TableHead><TableHead>Trạng thái</TableHead></TableRow></TableHeader><TableBody>
          {salesRows.map((line) => {
            const rowId = rowIdentity(line);
            const state = rows[rowId];
            const packaged = hasSelectablePackageProvenance(line);
            const candidates = bomByItem[text(line.item_code)] ?? [];
            const blocked = packaged || candidates.length === 0;
            return <TableRow key={rowId || text(line.item_code)}>
              <TableCell><Checkbox checked={Boolean(state?.selected)} disabled={blocked} onCheckedChange={(checked) => patchRow(rowId, { selected: checked === true })} /></TableCell>
              <TableCell className="font-mono text-xs">{rowId || "—"}</TableCell>
              <TableCell><div className="font-medium">{text(line.item_code)}</div>{text(line.item_name) && <div className="text-xs text-muted-foreground">{text(line.item_name)}</div>}</TableCell>
              <TableCell className="text-right tabular-nums">{quantityText(line.qty)} {text(line.uom)}</TableCell>
              <TableCell>{packaged ? <span className="text-xs text-destructive">Chưa resolve physical obligation</span> : candidates.length ? <Select value={state?.bom ?? ""} onValueChange={(value) => patchRow(rowId, { bom: value })}><SelectTrigger className="min-w-48"><SelectValue placeholder={candidates.length > 1 ? "Chọn BOM" : "BOM"} /></SelectTrigger><SelectContent>{candidates.map((bom) => <SelectItem key={text(bom.name)} value={text(bom.name)}>{text(bom.name)}{text(bom.revision) ? ` · rev ${text(bom.revision)}` : ""}</SelectItem>)}</SelectContent></Select> : <span className="text-xs text-destructive">Không có BOM active</span>}</TableCell>
              <TableCell><Input inputMode="decimal" value={state?.qty ?? ""} disabled={blocked} onChange={(event) => patchRow(rowId, { qty: event.target.value })} /></TableCell>
              <TableCell>{packaged ? <Badge variant="destructive">Tách món bị khóa</Badge> : candidates.length === 0 ? <Badge variant="destructive">Thiếu BOM</Badge> : candidates.length === 1 ? <Badge variant="outline">READY</Badge> : <Badge variant="outline">Chọn BOM</Badge>}</TableCell>
            </TableRow>;
          })}
          {!salesRows.length && <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">Đơn bán không có dòng hàng.</TableCell></TableRow>}
        </TableBody></Table></div>
      </div>}

      {salesRows.some(hasSelectablePackageProvenance) && <div className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><div className="font-medium">Có dòng Tách món SELECTABLE chưa được phép phát demand sản xuất.</div><div className="mt-1 text-xs text-muted-foreground">Dòng cha residual và child thương mại chưa đủ bằng chứng để suy ra nghĩa vụ vật lý. Hệ thống khóa thay vì tạo Work Order trùng/sai.</div></div></div>}
    </div>

    <div className="shrink-0 border-t bg-card px-5 py-3"><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={props.onCancel} disabled={saving}>Huỷ</Button><Button variant="outline" onClick={() => void save(false)} disabled={saving || !canCreate || selectedCount === 0}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu nháp</Button><Button onClick={() => void save(true)} disabled={saving || !canCreate || !canSubmit || selectedCount === 0}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Factory className="size-4" />} Lưu & ghi sổ</Button></div></div>
  </div>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={className}><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>; }
function childRows(value: unknown): Json[] { return Array.isArray(value) ? value.filter((row): row is Json => Boolean(row && typeof row === "object" && !Array.isArray(row))) : []; }
function rowIdentity(row: Json): string { return text(row.row_id) || text(row.name); }
function hasSelectablePackageProvenance(row: Json): boolean { return Boolean(text(row.sales_package_group_key) || text(row.sales_package_parent_key)); }
function activeBoms(rows: Doc[], postingDate: string): Doc[] { return rows.filter((row) => { const status = text(row.bom_status) || "Active"; if (status !== "Active") return false; const from = text(row.effective_from); const to = text(row.effective_to); return (!from || from <= postingDate) && (!to || to >= postingDate); }); }
function quantityText(value: unknown): string { const number = Number(value); return Number.isFinite(number) ? String(number) : text(value); }
function today(): string { const date = new Date(); const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : ""; }
