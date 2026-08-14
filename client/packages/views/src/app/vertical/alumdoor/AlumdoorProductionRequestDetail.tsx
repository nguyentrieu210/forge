/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Factory, Loader2, RefreshCw, Wrench } from "lucide-react";
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from "@metaforge/ui";
import { useMetaForge } from "../../../container/provider.js";

type Json = Record<string, unknown>;
type LineHealth = "MISSING_WORK_ORDER" | "READY" | "IN_PROCESS" | "COMPLETED" | "CANCELLED" | "DUPLICATE_WORK_ORDER";

interface LifecycleLine extends Json {
  request_line_key: string;
  sales_order_row_id: string;
  item_code: string;
  work_order?: string;
  work_order_status?: string;
  health: LineHealth;
  duplicates?: string[];
}
interface LifecycleResult extends Json {
  schema_version: 1;
  production_request: string;
  sales_order: string;
  stored_state: string;
  derived_state: string;
  state_drift: boolean;
  expected_line_count: number;
  active_work_order_count: number;
  completed_work_order_count: number;
  lines: LifecycleLine[];
  warnings: string[];
}
interface CreateProductionResult extends Json {
  production_request?: string;
  sales_order?: string;
  work_orders?: string[];
  created?: string[];
  existing?: string[];
  lines?: number;
  idempotent?: boolean;
  message?: string;
}
export interface AlumdoorProductionRequestDetailProps { name: string; onNavigate: (path: string) => void; }

const healthLabel: Record<LineHealth, string> = {
  MISSING_WORK_ORDER: "Thiếu lệnh", READY: "Sẵn sàng", IN_PROCESS: "Đang sản xuất",
  COMPLETED: "Hoàn thành", CANCELLED: "Đã huỷ", DUPLICATE_WORK_ORDER: "Trùng lệnh",
};

export function AlumdoorProductionRequestDetail({ name, onNavigate }: AlumdoorProductionRequestDetailProps) {
  const { adapter } = useMetaForge();
  const [document, setDocument] = useState<Json | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [docResult, lifecycleResult] = await Promise.all([
        adapter.getDoc("Production Request", name),
        adapter.callPost<LifecycleResult>("alumdoor.production_request.lifecycle", { production_request: name }),
      ]);
      setDocument(docResult.doc as Json);
      setLifecycle(lifecycleResult);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setBusy(false); }
  }, [adapter, name]);

  useEffect(() => { void load(); }, [load]);

  const detailByKey = useMemo(() => {
    const map = new Map<string, Json>();
    const rows = Array.isArray(document?.items) ? document.items : [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const record = row as Json;
      const key = text(record.request_line_key);
      if (key) map.set(key, record);
    }
    return map;
  }, [document]);

  const missingCount = lifecycle?.lines.filter((line) => line.health === "MISSING_WORK_ORDER").length ?? 0;
  const cancelledCount = lifecycle?.lines.filter((line) => line.health === "CANCELLED").length ?? 0;
  const hasDuplicate = lifecycle?.lines.some((line) => line.health === "DUPLICATE_WORK_ORDER") ?? false;
  const hasOrphan = lifecycle?.warnings.some((warning) => warning.startsWith("ORPHAN_WORK_ORDER_LINE_KEY:")) ?? false;
  const sourceWarehouse = text(document?.source_warehouse);
  const targetWarehouse = text(document?.target_warehouse);
  const canCreateMissing = missingCount > 0 && !hasDuplicate && !hasOrphan && Boolean(sourceWarehouse && targetWarehouse && lifecycle?.sales_order);

  const createMissingWorkOrders = async () => {
    if (!lifecycle || !canCreateMissing) return;
    setActionBusy(true);
    try {
      const result = await adapter.callPost<CreateProductionResult>("alumdoor.sales.create_production", {
        sales_order: lifecycle.sales_order,
        source_warehouse: sourceWarehouse,
        target_warehouse: targetWarehouse,
      });
      toast.success(text(result.message) || (result.idempotent ? "Các Work Order đã tồn tại." : `Đã tạo ${result.created?.length ?? 0} Work Order.`));
      await load();
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setActionBusy(false);
    }
  };

  if (!lifecycle && busy) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Đang đọc trạng thái sản xuất…</div>;

  return <div className="h-full overflow-auto bg-background p-4 sm:p-5" data-surface="alumdoor-production-request-detail">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Yêu cầu sản xuất {name}</h2>{lifecycle && <Badge variant="outline">{lifecycle.derived_state}</Badge>}{lifecycle?.state_drift && <Badge variant="destructive">Lệch trạng thái lưu</Badge>}</div>
        <p className="mt-1 text-sm text-muted-foreground">{lifecycle?.sales_order ? <>Theo đơn bán <button type="button" className="font-medium text-primary hover:underline" onClick={() => onNavigate(`/app/${encodeURIComponent("Sales Order")}/${encodeURIComponent(lifecycle.sales_order)}`)}>{lifecycle.sales_order}</button></> : "Đọc vòng đời từ dòng yêu cầu và Work Order liên kết."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {missingCount > 0 && <Button size="sm" onClick={() => void createMissingWorkOrders()} disabled={!canCreateMissing || actionBusy} title={!sourceWarehouse || !targetWarehouse ? "Yêu cầu sản xuất thiếu kho nguồn/kho thành phẩm." : hasDuplicate || hasOrphan ? "Cần xử lý lineage trùng/orphan trước." : undefined}>{actionBusy ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />} Tạo bù {missingCount} Work Order</Button>}
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy || actionBusy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Làm mới</Button>
      </div>
    </div>

    {lifecycle && <div className="mb-4 grid gap-3 sm:grid-cols-3"><Metric label="Dòng phải sản xuất" value={lifecycle.expected_line_count} /><Metric label="Lệnh đang hiệu lực" value={lifecycle.active_work_order_count} /><Metric label="Lệnh hoàn thành" value={lifecycle.completed_work_order_count} /></div>}

    {lifecycle?.warnings?.length ? <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3"><div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="size-4" /> Cần xử lý trước khi coi yêu cầu đã hội tụ</div><div className="mt-2 flex flex-wrap gap-2">{lifecycle.warnings.map((warning) => <Badge key={warning} variant="outline" className="font-mono text-[11px]">{warning}</Badge>)}</div></div> : lifecycle ? <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm"><CheckCircle2 className="size-4" /> Không phát hiện thiếu/trùng/orphan Work Order trong phạm vi yêu cầu.</div> : null}

    {cancelledCount > 0 && <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">{cancelledCount} Work Order đã huỷ.</span> Không tự tái tạo: authority hiện tại coi bản ghi đã huỷ vẫn là lineage tồn tại; cần xử lý bằng luồng amend/release riêng thay vì tạo trùng.</div>}

    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-medium">Các bộ / dòng sản xuất</h3><p className="text-xs text-muted-foreground">Khóa dòng yêu cầu là lineage authority; không ghép theo mã hàng.</p></div><Factory className="size-5 text-muted-foreground" /></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Dòng</TableHead><TableHead>Mặt hàng</TableHead><TableHead>Kích thước / bộ</TableHead><TableHead>BOM / bộ phận</TableHead><TableHead>Work Order</TableHead><TableHead>Trạng thái</TableHead></TableRow></TableHeader><TableBody>
        {(lifecycle?.lines ?? []).map((line) => { const detail = detailByKey.get(line.request_line_key) ?? {}; return <TableRow key={line.request_line_key}>
          <TableCell><div className="font-mono text-xs">{line.request_line_key}</div><div className="mt-1 text-xs text-muted-foreground">SO: {line.sales_order_row_id || "—"}</div></TableCell>
          <TableCell className="font-medium">{line.item_code}</TableCell>
          <TableCell>{dimensionText(detail)}<div className="text-xs text-muted-foreground">{text(detail.set_no) ? `Bộ ${text(detail.set_no)}` : text(detail.set_count) ? `${text(detail.set_count)} bộ` : ""}</div></TableCell>
          <TableCell>{text(detail.bom_no) || "—"}<div className="text-xs text-muted-foreground">{text(detail.department) || ""}</div></TableCell>
          <TableCell>{line.work_order ? <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onNavigate(`/app/${encodeURIComponent("Work Order")}/${encodeURIComponent(line.work_order!)}`)}>{line.work_order}<ExternalLink className="size-3.5" /></Button> : line.duplicates?.length ? <div className="space-y-1">{line.duplicates.map((workOrder) => <button key={workOrder} type="button" className="block text-xs text-primary hover:underline" onClick={() => onNavigate(`/app/${encodeURIComponent("Work Order")}/${encodeURIComponent(workOrder)}`)}>{workOrder}</button>)}</div> : "—"}</TableCell>
          <TableCell><HealthBadge health={line.health} status={line.work_order_status} /></TableCell>
        </TableRow>; })}
        {!lifecycle?.lines?.length && <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">Yêu cầu chưa có dòng lineage hợp lệ.</TableCell></TableRow>}
      </TableBody></Table></div>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}</div></div>; }
function HealthBadge({ health, status }: { health: LineHealth; status?: string }) { const destructive = health === "MISSING_WORK_ORDER" || health === "DUPLICATE_WORK_ORDER"; return <div><Badge variant={destructive ? "destructive" : "outline"}>{healthLabel[health]}</Badge>{status && <div className="mt-1 text-xs text-muted-foreground">{status}</div>}</div>; }
function dimensionText(row: Json): string { const width = numberText(row.width_m); const height = numberText(row.height_m); if (width && height) return `${width} × ${height} m`; return width || height || "—"; }
function numberText(value: unknown): string { const number = Number(value); return Number.isFinite(number) && number > 0 ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(number) : ""; }
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : ""; }
