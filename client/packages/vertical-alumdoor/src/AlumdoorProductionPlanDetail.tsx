/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Factory, Loader2, PackageSearch, RefreshCw, ShoppingCart } from "lucide-react";
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from "@metaforge/ui";
import type { Doc } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";

type Json = Record<string, unknown>;

interface MrpSourceTrace extends Json {
  root_row_id: string;
  root_item_code: string;
  parent_item_code: string;
  bom_no: string;
  bom_revision: number;
  bom_row_id: string;
  path: string[];
}
interface MrpRequirement extends Json {
  requirement_type: "Purchase" | "Manufacture";
  item_code: string;
  warehouse?: string;
  schedule_date?: string;
  gross_qty: string;
  gross_qty_micros: number;
  source_count: number;
  sources: MrpSourceTrace[];
}
interface MrpPlannedOutput extends Json {
  row_id: string;
  item_code: string;
  bom_no: string;
  bom_revision: number;
  warehouse?: string;
  schedule_date?: string;
  planned_qty: string;
  planned_qty_micros: number;
}
interface MrpExplosionResult extends Json {
  schema_version: 1;
  company: string;
  production_plan: string;
  planning_date: string;
  netting_mode: "gross_only";
  planned_outputs: MrpPlannedOutput[];
  manufacture_requirements: MrpRequirement[];
  purchase_requirements: MrpRequirement[];
  warnings: string[];
}
interface MrpRequestResult extends Json {
  schema_version: 1;
  production_plan?: string;
  doctype?: string;
  name?: string;
  material_request_type: "Purchase" | "Manufacture";
  fingerprint?: string;
  replayed: boolean;
  created: boolean;
  docstatus?: number;
  draft?: boolean;
  reason?: string;
}

export interface AlumdoorProductionPlanDetailProps { name: string; onNavigate: (path: string) => void; }

export function AlumdoorProductionPlanDetail({ name, onNavigate }: AlumdoorProductionPlanDetailProps) {
  const { adapter } = useMetaForge();
  const [document, setDocument] = useState<Json | null>(null);
  const [mrp, setMrp] = useState<MrpExplosionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState<"Purchase" | "Manufacture" | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const docResult = await adapter.getDoc("Production Plan", name);
      setDocument(docResult.doc as Json);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setBusy(false);
    }
  }, [adapter, name]);

  useEffect(() => { void load(); }, [load]);

  const docstatus = integer(document?.docstatus);
  const submitted = docstatus === 1;
  const items = useMemo(() => {
    const rows = Array.isArray(document?.items) ? document.items : [];
    return rows.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row));
  }, [document]);

  const runPreview = async () => {
    setPreviewBusy(true);
    try {
      const result = await adapter.callPost<MrpExplosionResult>("metaforge.manufacturing.preview_production_plan_mrp", {
        production_plan: name,
      });
      setMrp(result);
      if (!result.warnings.length) toast.success("Đã nổ nhu cầu vật tư (MRP) — không có cảnh báo.");
      else toast.error(`Đã nổ nhu cầu vật tư — có ${result.warnings.length} cảnh báo cần xem.`);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setPreviewBusy(false);
    }
  };

  const submitPlan = async () => {
    if (!document || submitted) return;
    setSubmitBusy(true);
    try {
      await adapter.submit(document as unknown as Doc);
      toast.success(`Đã submit kế hoạch sản xuất ${name}.`);
      await load();
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSubmitBusy(false);
    }
  };

  const createMaterialRequest = async (type: "Purchase" | "Manufacture") => {
    if (!submitted) return;
    setCreateBusy(type);
    try {
      const result = await adapter.callPost<MrpRequestResult>("metaforge.manufacturing.create_mrp_material_request", {
        production_plan: name,
        material_request_type: type,
      });
      if (!result.created && !result.replayed) {
        toast.error(result.reason === "NO_REQUIREMENTS" ? `Không có nhu cầu ${requestTypeLabel(type)} nào để tạo Yêu cầu vật tư.` : "Không tạo được Yêu cầu vật tư.");
        return;
      }
      toast.success(result.replayed
        ? `Yêu cầu vật tư ${result.name} (${requestTypeLabel(type)}) đã tồn tại — dùng lại bản đã tạo.`
        : `Đã tạo Yêu cầu vật tư ${result.name} (${requestTypeLabel(type)}).`);
      if (result.name) onNavigate(`/app/${encodeURIComponent("Material Request")}/${encodeURIComponent(result.name)}`);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setCreateBusy(null);
    }
  };

  if (!document && busy) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Đang đọc kế hoạch sản xuất…</div>;

  const purchaseCount = mrp?.purchase_requirements.length ?? 0;
  const manufactureCount = mrp?.manufacture_requirements.length ?? 0;

  return <div className="h-full overflow-auto bg-background p-4 sm:p-5" data-surface="alumdoor-production-plan-detail">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Kế hoạch sản xuất {name}</h2><Badge variant={submitted ? "outline" : "destructive"}>{docstatusLabel(docstatus)}</Badge></div>
        <p className="mt-1 text-sm text-muted-foreground">{text(document?.company) || "—"} · {items.length} dòng kế hoạch</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!submitted && <Button size="sm" variant="outline" onClick={() => void submitPlan()} disabled={submitBusy || !items.length} title={!items.length ? "Kế hoạch chưa có dòng nào." : undefined}>{submitBusy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Gửi kế hoạch</Button>}
        <Button size="sm" onClick={() => void runPreview()} disabled={previewBusy}>{previewBusy ? <Loader2 className="size-4 animate-spin" /> : <PackageSearch className="size-4" />} Xem trước nhu cầu vật tư (MRP)</Button>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Làm mới</Button>
      </div>
    </div>

    {!submitted && <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><AlertTriangle className="size-4 shrink-0" /> Kế hoạch chưa submit — có thể xem trước MRP nhưng chưa thể tạo Yêu cầu vật tư (yêu cầu docstatus = 1).</div>}

    <div className="mb-4 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-medium">Dòng kế hoạch</h3><p className="text-xs text-muted-foreground">Đọc trực tiếp từ Production Plan.</p></div><ClipboardList className="size-5 text-muted-foreground" /></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Dòng</TableHead><TableHead>Mặt hàng</TableHead><TableHead>BOM</TableHead><TableHead>SL kế hoạch</TableHead><TableHead>Kho</TableHead></TableRow></TableHeader><TableBody>
        {items.map((row, index) => <TableRow key={text(row.row_id) || `${name}-${index}`}>
          <TableCell className="font-mono text-xs">{text(row.row_id) || index + 1}</TableCell>
          <TableCell className="font-medium">{text(row.item_code) || "—"}</TableCell>
          <TableCell>{text(row.bom_no) ? <button type="button" className="font-medium text-primary hover:underline" onClick={() => onNavigate(`/app/${encodeURIComponent("Bill of Materials")}/${encodeURIComponent(text(row.bom_no))}`)}>{text(row.bom_no)}</button> : "—"}</TableCell>
          <TableCell>{numberText(row.planned_qty) || "—"}</TableCell>
          <TableCell className="text-muted-foreground">{text(row.warehouse) || "—"}</TableCell>
        </TableRow>)}
        {!items.length && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Kế hoạch chưa có dòng nào.</TableCell></TableRow>}
      </TableBody></Table></div>
    </div>

    {mrp && <>
      {mrp.warnings.length > 0 && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3"><div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="size-4" /> Cảnh báo khi nổ nhu cầu</div><div className="mt-2 flex flex-wrap gap-2">{mrp.warnings.map((warning) => <Badge key={warning} variant="outline" className="font-mono text-[11px]">{warning}</Badge>)}</div></div>}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Sản lượng kế hoạch" value={mrp.planned_outputs.length} />
        <Metric label="Nhu cầu mua ngoài" value={purchaseCount} />
        <Metric label="Nhu cầu tự sản xuất" value={manufactureCount} />
      </div>

      <RequirementTable
        title="Nhu cầu mua ngoài (Purchase)"
        icon={<ShoppingCart className="size-5 text-muted-foreground" />}
        requirements={mrp.purchase_requirements}
        actionLabel="Tạo Yêu cầu vật tư — Mua"
        actionBusy={createBusy === "Purchase"}
        actionDisabled={!submitted || purchaseCount === 0}
        actionDisabledReason={!submitted ? "Cần submit kế hoạch trước." : purchaseCount === 0 ? "Không có nhu cầu mua ngoài." : undefined}
        onAction={() => void createMaterialRequest("Purchase")}
      />
      <RequirementTable
        title="Nhu cầu tự sản xuất (Manufacture)"
        icon={<Factory className="size-5 text-muted-foreground" />}
        requirements={mrp.manufacture_requirements}
        actionLabel="Tạo Yêu cầu vật tư — Sản xuất"
        actionBusy={createBusy === "Manufacture"}
        actionDisabled={!submitted || manufactureCount === 0}
        actionDisabledReason={!submitted ? "Cần submit kế hoạch trước." : manufactureCount === 0 ? "Không có nhu cầu tự sản xuất." : undefined}
        onAction={() => void createMaterialRequest("Manufacture")}
      />

      <p className="mt-2 text-xs text-muted-foreground">Chế độ tính: {mrp.netting_mode === "gross_only" ? "Gross (chưa trừ tồn kho / cung mở)" : mrp.netting_mode} · Ngày kế hoạch {mrp.planning_date || "—"}.</p>
    </>}
  </div>;
}

function RequirementTable({ title, icon, requirements, actionLabel, actionBusy, actionDisabled, actionDisabledReason, onAction }: {
  title: string; icon: ReactNode; requirements: MrpRequirement[]; actionLabel: string;
  actionBusy: boolean; actionDisabled: boolean; actionDisabledReason?: string; onAction: () => void;
}) {
  return <div className="mb-4 overflow-hidden rounded-xl border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
      <div className="flex items-center gap-2">{icon}<h3 className="font-medium">{title}</h3><Badge variant="outline">{requirements.length}</Badge></div>
      <Button size="sm" variant="outline" onClick={onAction} disabled={actionDisabled || actionBusy} title={actionDisabledReason}>{actionBusy ? <Loader2 className="size-4 animate-spin" /> : null} {actionLabel}</Button>
    </div>
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Mặt hàng</TableHead><TableHead>Kho</TableHead><TableHead>SL cần</TableHead><TableHead>Số nguồn</TableHead><TableHead>Ngày cần</TableHead></TableRow></TableHeader><TableBody>
      {requirements.map((requirement, index) => <TableRow key={`${requirement.item_code}-${index}`}>
        <TableCell className="font-medium">{requirement.item_code}</TableCell>
        <TableCell className="text-muted-foreground">{requirement.warehouse || "—"}</TableCell>
        <TableCell>{numberText(requirement.gross_qty) || requirement.gross_qty}</TableCell>
        <TableCell>{requirement.source_count}</TableCell>
        <TableCell className="text-muted-foreground">{requirement.schedule_date || "—"}</TableCell>
      </TableRow>)}
      {!requirements.length && <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">Không có nhu cầu.</TableCell></TableRow>}
    </TableBody></Table></div>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}</div></div>; }
function docstatusLabel(docstatus: number): string { return docstatus === 1 ? "Đã submit" : docstatus === 2 ? "Đã huỷ" : "Nháp"; }
function requestTypeLabel(type: "Purchase" | "Manufacture"): string { return type === "Purchase" ? "Mua" : "Sản xuất"; }
function integer(value: unknown): number { const parsed = typeof value === "number" ? value : Number(value); return Number.isSafeInteger(parsed) ? parsed : 0; }
function numberText(value: unknown): string { const number = Number(value); return Number.isFinite(number) && number !== 0 ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(number) : ""; }
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : ""; }
