/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Boxes, Factory, Loader2, PackagePlus, Save } from "lucide-react";
import type { Doc } from "@metaforge/core";
import {
  Badge,
  Button,
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
import { useMetaForge } from "../../../container/provider.js";

type Json = Record<string, unknown>;
type Purpose = "Material Transfer" | "Manufacture";

interface MaterialRow extends Json {
  bom_row_id: string;
  item_code: string;
  source_warehouse: string;
  required_qty: string;
  issued_qty: string;
  consumed_qty: string;
  remaining_to_issue: string;
  remaining_to_consume: string;
}
interface WorkOrderLifecycle extends Json {
  work_order: string;
  docstatus: 0 | 1 | 2;
  stage: string;
  production_item: string;
  target_qty: string;
  produced_qty: string;
  remaining_qty: string;
  material_rows: MaterialRow[];
  actions: { can_issue_materials?: boolean; can_manufacture?: boolean };
}
interface RowDraft {
  qty: string;
  bundle: string;
  width_m: string;
  height_m: string;
  qty_bar: string;
}
interface ItemMeta extends Json { name?: string; item_name?: string; inventory_mode?: string; measurement_profile?: string; }
type BundleDoc = Doc;

export interface AlumdoorManufacturingStockEntryCreateProps {
  workOrder: string;
  purpose: Purpose;
  closeRequest?: number;
  onCreated: (name: string) => void;
  onCancel: () => void;
  onNavigate: (path: string) => void;
}

export function AlumdoorManufacturingStockEntryCreate(props: AlumdoorManufacturingStockEntryCreateProps) {
  const { adapter } = useMetaForge();
  const [workOrderDoc, setWorkOrderDoc] = useState<Doc | null>(null);
  const [lifecycle, setLifecycle] = useState<WorkOrderLifecycle | null>(null);
  const [itemMeta, setItemMeta] = useState<Record<string, ItemMeta>>({});
  const [bundles, setBundles] = useState<Record<string, BundleDoc[]>>({});
  const [rows, setRows] = useState<Record<string, RowDraft>>({});
  const [finishedQty, setFinishedQty] = useState("");
  const [finishedBundle, setFinishedBundle] = useState("");
  const [postingDate, setPostingDate] = useState(today());
  const [canCreate, setCanCreate] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const closeSeen = useRef(props.closeRequest ?? 0);

  useEffect(() => {
    if ((props.closeRequest ?? 0) === closeSeen.current) return;
    closeSeen.current = props.closeRequest ?? 0;
    props.onCancel();
  }, [props.closeRequest, props.onCancel]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docResult, lifecycleResult, caps] = await Promise.all([
        adapter.getDoc("Work Order", props.workOrder),
        adapter.callPost<WorkOrderLifecycle>("metaforge.manufacturing.get_work_order_lifecycle", { work_order: props.workOrder }),
        adapter.getCapabilities("Stock Entry"),
      ]);
      const document = docResult.doc;
      setWorkOrderDoc(document);
      setLifecycle(lifecycleResult);
      setCanCreate(Boolean(caps.create));
      setCanSubmit(Boolean(caps.submit));
      setFinishedQty(quantityText(lifecycleResult.remaining_qty));

      const materialRows = lifecycleResult.material_rows ?? [];
      const codes = [...new Set([...materialRows.map((row) => row.item_code), lifecycleResult.production_item].filter(Boolean))];
      const metas = await Promise.all(codes.map(async (code) => {
        const item = (await adapter.getDoc("Item", code)).doc as ItemMeta;
        return [code, item] as const;
      }));
      const metaMap = Object.fromEntries(metas) as Record<string, ItemMeta>;
      setItemMeta(metaMap);

      const nextRows: Record<string, RowDraft> = {};
      const bundleTasks: Array<Promise<readonly [string, BundleDoc[]]>> = [];
      const wip = text(document.wip_warehouse);
      for (const row of materialRows) {
        const source = props.purpose === "Manufacture" ? (wip || row.source_warehouse) : row.source_warehouse;
        const remaining = props.purpose === "Material Transfer" ? row.remaining_to_issue : row.remaining_to_consume;
        nextRows[row.bom_row_id] = { qty: quantityText(remaining), bundle: "", width_m: "", height_m: "", qty_bar: "" };
        if (isDimensioned(metaMap[row.item_code]?.inventory_mode)) {
          bundleTasks.push(loadBundles(adapter, row.item_code, source, "Outward"));
        }
      }
      if (props.purpose === "Manufacture" && isDimensioned(metaMap[lifecycleResult.production_item]?.inventory_mode)) {
        bundleTasks.push(loadBundles(adapter, lifecycleResult.production_item, text(document.target_warehouse), "Inward"));
      }
      setRows(nextRows);
      setBundles(Object.fromEntries(await Promise.all(bundleTasks)) as Record<string, BundleDoc[]>);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setLoading(false);
    }
  }, [adapter, props.purpose, props.workOrder]);

  useEffect(() => { void load(); }, [load]);

  const actionAllowed = props.purpose === "Material Transfer"
    ? Boolean(lifecycle?.actions.can_issue_materials)
    : Boolean(lifecycle?.actions.can_manufacture);
  const wipWarehouse = text(workOrderDoc?.wip_warehouse);
  const targetWarehouse = text(workOrderDoc?.target_warehouse);
  const company = text(workOrderDoc?.company);
  const productionItem = lifecycle?.production_item ?? text(workOrderDoc?.production_item);
  const activeRows = useMemo(() => (lifecycle?.material_rows ?? []).filter((row) => Number(rows[row.bom_row_id]?.qty ?? 0) > 0), [lifecycle, rows]);
  const finishedMeta = itemMeta[productionItem];

  const patchRow = (key: string, patch: Partial<RowDraft>) => setRows((current) => ({
    ...current,
    [key]: { ...(current[key] ?? { qty: "", bundle: "", width_m: "", height_m: "", qty_bar: "" }), ...patch },
  }));

  const save = async (submitNow: boolean) => {
    if (!workOrderDoc || !lifecycle || !canCreate || !actionAllowed) return;
    if (!company) { toast.error("Work Order thiếu công ty."); return; }
    if (props.purpose === "Material Transfer" && !wipWarehouse) { toast.error("Work Order chưa có Kho WIP."); return; }
    if (props.purpose === "Manufacture" && !targetWarehouse) { toast.error("Work Order chưa có Kho thành phẩm."); return; }
    if (activeRows.length === 0) { toast.error("Không có dòng vật tư có số lượng lớn hơn 0."); return; }

    const items: Json[] = [];
    for (const row of activeRows) {
      const draft = rows[row.bom_row_id]!;
      const meta = itemMeta[row.item_code];
      const source = props.purpose === "Manufacture" ? (wipWarehouse || row.source_warehouse) : row.source_warehouse;
      if (!source) { toast.error(`${row.item_code} thiếu kho nguồn.`); return; }
      const validation = validatePhysicalRow(meta, draft, submitNow);
      if (validation) { toast.error(`${row.item_code}: ${validation}`); return; }
      items.push({
        row_id: `MFG-${row.bom_row_id}`,
        item_code: row.item_code,
        qty: draft.qty,
        source_warehouse: source,
        bom_row_id: row.bom_row_id,
        manufacturing_kind: props.purpose === "Material Transfer" ? "Issue" : "Consumption",
        ...(props.purpose === "Material Transfer" ? { target_warehouse: wipWarehouse } : {}),
        ...(draft.bundle ? { serial_and_batch_bundle: draft.bundle } : {}),
        ...(draft.width_m ? { width_m: draft.width_m } : {}),
        ...(draft.height_m ? { height_m: draft.height_m } : {}),
        ...(draft.qty_bar ? { qty_bar: draft.qty_bar } : {}),
      });
    }

    if (props.purpose === "Manufacture") {
      const finished = Number(finishedQty);
      if (!Number.isFinite(finished) || finished <= 0) { toast.error("Số lượng thành phẩm phải lớn hơn 0."); return; }
      if (finished > Number(lifecycle.remaining_qty) + 1e-9) { toast.error("Số lượng thành phẩm vượt số lượng còn lại của Work Order."); return; }
      if (submitNow && isDimensioned(finishedMeta?.inventory_mode) && !finishedBundle) {
        toast.error("Thành phẩm quản lý vật lý phải chọn Inward Bundle trước khi ghi sổ."); return;
      }
      if (submitNow && isFinishedAreaMode(finishedMeta?.inventory_mode)) {
        if (!positive(workOrderDoc.width_m) || !positive(workOrderDoc.height_m) || !positive(workOrderDoc.set_count)) {
          toast.error("Work Order thiếu rộng/cao/số bộ cho identity thành phẩm."); return;
        }
      }
    }

    const document: Json = {
      company,
      posting_at: `${postingDate}T00:00:00.000Z`,
      purpose: props.purpose,
      work_order: props.workOrder,
      items,
      ...(props.purpose === "Material Transfer" ? {
        source_warehouse: text(workOrderDoc.source_warehouse),
        target_warehouse: wipWarehouse,
      } : {
        source_warehouse: wipWarehouse || text(workOrderDoc.source_warehouse),
        target_warehouse: targetWarehouse,
        finished_good_item: productionItem,
        finished_good_qty: finishedQty,
        ...(finishedBundle ? { finished_good_bundle: finishedBundle } : {}),
        ...(text(workOrderDoc.color) ? { finished_good_color: text(workOrderDoc.color) } : {}),
        ...(positive(workOrderDoc.width_m) ? { finished_good_width_m: quantityText(workOrderDoc.width_m) } : {}),
        ...(positive(workOrderDoc.height_m) ? { finished_good_height_m: quantityText(workOrderDoc.height_m) } : {}),
        ...(positive(workOrderDoc.set_count) ? { finished_good_set_count: quantityText(workOrderDoc.set_count) } : {}),
      }),
    };

    setSaving(true);
    try {
      const created = await adapter.createDoc("Stock Entry", document);
      const finalDoc = submitNow ? await adapter.submit(created) : created;
      toast.success(submitNow ? "Đã ghi sổ Stock Entry sản xuất." : "Đã lưu Stock Entry nháp.");
      props.onCreated(String(finalDoc.name));
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="grid h-40 place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Đang dựng phiếu kho từ Work Order…</div>;

  return <div className="flex h-full min-h-0 flex-col" data-surface="alumdoor-manufacturing-stock-entry-create">
    <div className="shrink-0 border-b bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{props.purpose === "Material Transfer" ? "Cấp vật tư vào WIP" : "Nhập thành phẩm"}</h2><Badge variant="outline">{props.workOrder}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{productionItem} · {company || "—"}</p></div>
        <Field label="Ngày ghi sổ" className="w-44"><Input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} /></Field>
      </div>
      {!actionAllowed && <div className="mt-3 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4" /><span>Lifecycle server hiện không cho phép thao tác này. Không tạo chứng từ để lách trạng thái Work Order.</span></div>}
      {props.purpose === "Material Transfer" && !wipWarehouse && <div className="mt-3 text-sm text-destructive">Work Order chưa khai Kho WIP.</div>}
    </div>

    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h3 className="font-medium">Vật tư theo BOM snapshot</h3><p className="text-xs text-muted-foreground">Mặc định lấy số lượng còn phải {props.purpose === "Material Transfer" ? "cấp" : "tiêu hao"}. Server chặn vượt định mức và kiểm BOM checksum khi ghi sổ.</p></div>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Dòng BOM</TableHead><TableHead>Vật tư</TableHead><TableHead>Kho nguồn</TableHead><TableHead className="w-32">Số lượng</TableHead><TableHead className="min-w-56">Bundle vật lý</TableHead><TableHead>Thông số vật lý</TableHead></TableRow></TableHeader><TableBody>
          {(lifecycle?.material_rows ?? []).map((row) => {
            const draft = rows[row.bom_row_id] ?? { qty: "", bundle: "", width_m: "", height_m: "", qty_bar: "" };
            const meta = itemMeta[row.item_code];
            const source = props.purpose === "Manufacture" ? (wipWarehouse || row.source_warehouse) : row.source_warehouse;
            const bundleRows = bundles[bundleKey(row.item_code, source, "Outward")] ?? [];
            return <TableRow key={row.bom_row_id}>
              <TableCell className="font-mono text-xs">{row.bom_row_id}</TableCell>
              <TableCell><div className="font-medium">{row.item_code}</div><div className="text-xs text-muted-foreground">{text(meta?.inventory_mode) || "Hàng thường"}</div></TableCell>
              <TableCell>{source || "—"}{props.purpose === "Material Transfer" && <div className="text-xs text-muted-foreground">→ {wipWarehouse || "chưa có WIP"}</div>}</TableCell>
              <TableCell><Input inputMode="decimal" value={draft.qty} onChange={(event) => patchRow(row.bom_row_id, { qty: event.target.value })} /></TableCell>
              <TableCell>{isDimensioned(meta?.inventory_mode) ? <div className="flex gap-2"><Select value={draft.bundle} onValueChange={(value) => patchRow(row.bom_row_id, { bundle: value })}><SelectTrigger className="min-w-44"><SelectValue placeholder="Chọn Outward Bundle" /></SelectTrigger><SelectContent>{bundleRows.map((bundle) => <SelectItem key={text(bundle.name)} value={text(bundle.name)}>{text(bundle.name)} · {quantityText(bundle.total_qty)}</SelectItem>)}</SelectContent></Select>{bundleRows.length === 0 && <Button variant="outline" size="sm" onClick={() => props.onNavigate(`/app/${encodeURIComponent("Serial and Batch Bundle")}/new`)}><PackagePlus className="size-4" /></Button>}</div> : <span className="text-xs text-muted-foreground">Không bắt buộc</span>}</TableCell>
              <TableCell><PhysicalFields mode={text(meta?.inventory_mode)} draft={draft} onPatch={(patch) => patchRow(row.bom_row_id, patch)} /></TableCell>
            </TableRow>;
          })}
          {!lifecycle?.material_rows?.length && <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">Work Order không có vật tư BOM.</TableCell></TableRow>}
        </TableBody></Table></div>
      </div>

      {props.purpose === "Manufacture" && <div className="mt-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Thành phẩm" className="min-w-52"><div className="h-9 rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">{productionItem}</div></Field>
          <Field label="Số lượng nhập" className="w-40"><Input inputMode="decimal" value={finishedQty} onChange={(event) => setFinishedQty(event.target.value)} /></Field>
          <Field label="Kho thành phẩm" className="min-w-52"><div className="h-9 rounded-md border bg-muted/30 px-3 py-2 text-sm">{targetWarehouse || "—"}</div></Field>
          {isDimensioned(finishedMeta?.inventory_mode) && <Field label="Inward Bundle" className="min-w-64 flex-1"><div className="flex gap-2"><Select value={finishedBundle} onValueChange={setFinishedBundle}><SelectTrigger><SelectValue placeholder="Chọn Inward Bundle thành phẩm" /></SelectTrigger><SelectContent>{(bundles[bundleKey(productionItem, targetWarehouse, "Inward")] ?? []).map((bundle) => <SelectItem key={text(bundle.name)} value={text(bundle.name)}>{text(bundle.name)} · {quantityText(bundle.total_qty)}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={() => props.onNavigate(`/app/${encodeURIComponent("Serial and Batch Bundle")}/new`)}><PackagePlus className="size-4" /></Button></div></Field>}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">Identity thành phẩm lấy rộng/cao/số bộ/màu từ Work Order đã phát hành; bundle cung cấp lineage batch/serial. Không tự sinh batch từ tên mặt hàng.</div>
      </div>}
    </div>

    <div className="shrink-0 border-t bg-card px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs text-muted-foreground">{props.purpose === "Material Transfer" ? <><Boxes className="mr-1 inline size-3.5" />Kho đích: {wipWarehouse || "—"}</> : <><Factory className="mr-1 inline size-3.5" />Còn phải nhập: {quantityText(lifecycle?.remaining_qty)}</>}</div><div className="flex gap-2"><Button variant="outline" onClick={props.onCancel} disabled={saving}>Huỷ</Button><Button variant="outline" onClick={() => void save(false)} disabled={saving || !canCreate || !actionAllowed}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu nháp</Button><Button onClick={() => void save(true)} disabled={saving || !canCreate || !canSubmit || !actionAllowed}>{saving ? <Loader2 className="size-4 animate-spin" /> : props.purpose === "Material Transfer" ? <Boxes className="size-4" /> : <Factory className="size-4" />} Ghi sổ</Button></div></div></div>
  </div>;
}

function PhysicalFields({ mode, draft, onPatch }: { mode: string; draft: RowDraft; onPatch: (patch: Partial<RowDraft>) => void }) {
  const normalized = normalize(mode);
  if (normalized === "hang thuong" || !normalized) return <span className="text-xs text-muted-foreground">—</span>;
  if (normalized === "nhom cay/la") return <div className="w-28"><Input inputMode="decimal" placeholder="Số cây/lá" value={draft.qty_bar} onChange={(event) => onPatch({ qty_bar: event.target.value })} /></div>;
  if (normalized === "tam/kinh" || normalized === "kinh/tam") return <div className="flex gap-1"><Input className="w-24" inputMode="decimal" placeholder="Rộng m" value={draft.width_m} onChange={(event) => onPatch({ width_m: event.target.value })} /><Input className="w-24" inputMode="decimal" placeholder="Cao m" value={draft.height_m} onChange={(event) => onPatch({ height_m: event.target.value })} /></div>;
  if (normalized === "cuon") return <Input className="w-24" inputMode="decimal" placeholder="Khổ m" value={draft.width_m} onChange={(event) => onPatch({ width_m: event.target.value })} />;
  return <span className="text-xs text-muted-foreground">Theo bundle</span>;
}
function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) { return <label className={className}><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>; }
async function loadBundles(adapter: ReturnType<typeof useMetaForge>["adapter"], item: string, warehouse: string, type: "Inward" | "Outward"): Promise<readonly [string, BundleDoc[]]> {
  if (!item || !warehouse) return [bundleKey(item, warehouse, type), []] as const;
  try {
    const rows = await adapter.getList("Serial and Batch Bundle", {
      fields: ["name", "item_code", "warehouse", "type", "posting_at", "total_qty", "docstatus"],
      filters: { item_code: item, warehouse, type, docstatus: 1 },
      orderBy: "posting_at desc",
      pageLength: 100,
    });
    return [bundleKey(item, warehouse, type), rows as BundleDoc[]] as const;
  } catch {
    return [bundleKey(item, warehouse, type), []] as const;
  }
}
function validatePhysicalRow(meta: ItemMeta | undefined, row: RowDraft, submitNow: boolean): string {
  if (!positive(row.qty)) return "số lượng phải lớn hơn 0";
  if (!submitNow) return "";
  const mode = normalize(meta?.inventory_mode);
  if (!mode || mode === "hang thuong") return "";
  if (!row.bundle) return "thiếu Outward Bundle";
  if (mode === "nhom cay/la" && !positive(row.qty_bar)) return "thiếu số cây/lá";
  if ((mode === "tam/kinh" || mode === "kinh/tam") && (!positive(row.width_m) || !positive(row.height_m))) return "thiếu rộng/cao";
  if (mode === "cuon" && !positive(row.width_m)) return "thiếu khổ cuộn";
  return "";
}
function isDimensioned(value: unknown): boolean { const mode = normalize(value); return Boolean(mode && mode !== "hang thuong"); }
function isFinishedAreaMode(value: unknown): boolean { return normalize(value) === "thanh pham theo m2"; }
function bundleKey(item: string, warehouse: string, type: string): string { return `${type}\u0000${warehouse}\u0000${item}`; }
function positive(value: unknown): boolean { const number = Number(value); return Number.isFinite(number) && number > 0; }
function quantityText(value: unknown): string { const number = Number(value); return Number.isFinite(number) ? String(number) : text(value); }
function today(): string { const date = new Date(); const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function normalize(value: unknown): string { return text(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").replaceAll("đ", "d").toLocaleLowerCase("vi"); }
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : ""; }
