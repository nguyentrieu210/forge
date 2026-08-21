/** @jsxImportSource react */
/**
 * WORKBENCH PHIẾU SẢN XUẤT (Work Order).
 *
 * Lấy `sales-order-v2/AlumdoorSalesOrderWorkbenchComplete.tsx` làm khuôn kiến trúc: một màn gom
 * đủ vòng đời của chứng từ, mọi con số đến từ server, mọi lỗi hiện nguyên văn.
 *
 * ── Ranh giới thẩm quyền (skills/forge-ui-change-routing/SKILL.md §4.8) ──────────────────────
 * Client CHỈ điều phối và trình bày. Định mức, tồn kho, tiến độ và chuyển trạng thái đều là
 * thẩm quyền server:
 *
 *  - Ghi sổ / huỷ lệnh    → `adapter.submit` / `adapter.cancel` (controller nền tảng)
 *  - Định mức của lệnh    → `Work Order.required_items` do controller chụp lúc lưu
 *  - Tiến độ cấp/tiêu hao → `metaforge.manufacturing.get_work_order_lifecycle`
 *  - Định mức áp được?    → `alumdoor.sales.preview_bom_requirements`
 *  - Cắt nhôm             → `alumdoor.cut.propose|draft|apply|reverse|return`
 *  - Tải xưởng            → `alumdoor.capacity.preview`
 *  - Cấp vật tư / nhập TP → `AlumdoorManufacturingStockEntryCreate` (dùng lại nguyên bản)
 *
 * §4.6: KHÔNG nút nào ở đây tự đặt trạng thái, và KHÔNG nút nào gọi method chưa tồn tại. Chỗ
 * nào nghiệp vụ cần mà server chưa có method thì màn nói thẳng là chưa có, không dựng nút giả.
 *
 * ── Hai thứ màn này phải NÓI RA, không được im lặng ──────────────────────────────────────────
 *  1. Cấu phần định mức không giải được sang Item thật (AGENTS.md — 207/230 mã lệch, 88 mã phải
 *     người quyết). Xem `AlumdoorWorkOrderComponentTable`.
 *  2. Lý do định mức KHÔNG áp được cho bộ cửa này. Xem `AlumdoorWorkOrderBomPanel`.
 *     (docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md §2 — "luật đang ngủ im lặng".)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ExternalLink,
  Factory,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Send,
  XCircle,
} from "lucide-react";
import {
  mapError,
  serializeCreateDocument,
  type Doc,
  type DocTypeMeta,
  type Filters,
} from "@metaforge/core";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TooltipProvider,
  toast,
} from "@metaforge/ui";
import { RuntimeLoadingState } from "@metaforge/views";
import { useMetaForge } from "@metaforge/views/provider";
import { AlumdoorManufacturingStockEntryCreate } from "../AlumdoorManufacturingStockEntryCreate.js";
import {
  beginSalesOrderDocumentPreview,
  canApplySalesOrderDocumentPreview,
  createSalesOrderPreviewClock,
  finishSalesOrderDocumentPreview,
  markSalesOrderDocumentChanged,
} from "../sales-order-v2/preview-coordinator.js";
import { AlumdoorWorkOrderBomPanel } from "./AlumdoorWorkOrderBomPanel.js";
import { AlumdoorWorkOrderCapacityPanel } from "./AlumdoorWorkOrderCapacityPanel.js";
import { AlumdoorWorkOrderComponentTable } from "./AlumdoorWorkOrderComponentTable.js";
import { AlumdoorWorkOrderCutPanel } from "./AlumdoorWorkOrderCutPanel.js";
import {
  AlumdoorWorkOrderField,
  metaFieldOr,
  metaFieldRequired,
  WorkOrderReadonlyField,
} from "./AlumdoorWorkOrderField.js";
import {
  buildComponentRows,
  documentPath,
  lifecycleWarningLabel,
  lineageLabel,
  manufacturingStockEntryPath,
  minutesLabel,
  numberValue,
  parseFormulaSnapshot,
  percentOf,
  quantity,
  releaseAuthorityLabel,
  stageLabel,
  stockKey,
  text,
  today,
  unresolvedComponents,
  type BomComponentSource,
  type BomRequirementPreview,
  type ItemFacts,
  type Json,
  type ParsedFormulaSnapshot,
  type WorkOrderCaps,
  type WorkOrderComponentRow,
  type WorkOrderLifecycle,
  type WorkOrderRequiredItem,
} from "./model.js";

/**
 * Chữ ký props GIỮ NGUYÊN của `AlumdoorWorkOrderDetail`.
 * Đây là điều kiện để `workspace-extension.tsx` không phải sửa một dòng nào.
 */
export interface AlumdoorWorkOrderDetailProps {
  name: string;
  onNavigate: (path: string) => void;
}

type StockEntryPurpose = "Material Transfer" | "Manufacture";

interface StockEntrySummary {
  name: string;
  purpose: string;
  posting_at: string;
  docstatus: number;
  finished_good_item: string;
  finished_good_qty: number | undefined;
}

/** Đọc một mảng bản ghi con ra khỏi payload `unknown` mà không cần `as`. */
function recordRows(value: unknown): Json[] {
  return Array.isArray(value)
    ? value.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

/** Ô nhập trên đầu phiếu chỉ gửi lên server giá trị đúng kiểu mà metadata khai. */
function fieldValueForServer(fieldtype: string, value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (fieldtype === "Float" || fieldtype === "Int" || fieldtype === "Currency" || fieldtype === "Percent") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

export function AlumdoorWorkOrderWorkbench({ name, onNavigate }: AlumdoorWorkOrderDetailProps) {
  const { adapter, registry, services, roles } = useMetaForge();

  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [header, setHeader] = useState<Json>({});
  const [sourceModified, setSourceModified] = useState("");
  const [docstatus, setDocstatus] = useState(0);
  const [caps, setCaps] = useState<WorkOrderCaps>({});
  const [lifecycle, setLifecycle] = useState<WorkOrderLifecycle | null>(null);
  const [requiredItems, setRequiredItems] = useState<WorkOrderRequiredItem[]>([]);

  const [bomComponents, setBomComponents] = useState<BomComponentSource[]>([]);
  const [bomColor, setBomColor] = useState("");
  const [bomError, setBomError] = useState("");

  const [itemFacts, setItemFacts] = useState<Map<string, ItemFacts>>(() => new Map());
  const [catalogRead, setCatalogRead] = useState(false);
  const [catalogError, setCatalogError] = useState("");

  const [stock, setStock] = useState<Map<string, number>>(() => new Map());
  const [stockError, setStockError] = useState("");

  const [bomPreview, setBomPreview] = useState<BomRequirementPreview | null>(null);
  const [bomPreviewError, setBomPreviewError] = useState("");
  const [bomPreviewPending, setBomPreviewPending] = useState(0);

  const [stockEntries, setStockEntries] = useState<StockEntrySummary[]>([]);
  const [stockEntryError, setStockEntryError] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatal, setFatal] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [stockEntryPurpose, setStockEntryPurpose] = useState<StockEntryPurpose | null>(null);
  const [tab, setTab] = useState("dinh-muc");

  /**
   * Chống preview về muộn đè lên trạng thái mới — dùng lại nguyên đồng hồ của làn bán hàng
   * (`sales-order-v2/preview-coordinator.ts`, chỉ đọc). Không viết lại cơ chế thứ hai.
   */
  const previewClock = useRef(createSalesOrderPreviewClock());

  const snapshot = useMemo(
    () => parseFormulaSnapshot(header.formula_snapshot),
    [header.formula_snapshot],
  );

  /* ── Đọc tồn: report `Stock Balance` của nền tảng, KHÔNG tự cộng sổ ─────────────────────── */
  const loadStock = useCallback(async (warehouses: string[], company: string) => {
    const targets = [...new Set(warehouses.filter(Boolean))].slice(0, 5);
    if (!targets.length) {
      setStock(new Map());
      setStockError("Lệnh chưa khai kho vật tư nên không có kho nào để đọc tồn.");
      return;
    }
    const day = today();
    const errors: string[] = [];
    const next = new Map<string, number>();
    await Promise.all(targets.map(async (warehouse) => {
      try {
        const filters: Filters = {
          from_date: day,
          to_date: day,
          warehouse,
          ...(company ? { company } : {}),
        };
        const report = await adapter.runReport("Stock Balance", filters);
        for (const row of recordRows(report.result)) {
          const code = text(row.item_code);
          if (!code) continue;
          const balance = numberValue(row.bal_qty);
          if (balance === undefined) continue;
          next.set(stockKey(code, text(row.warehouse) || warehouse), balance);
        }
      } catch (error) {
        errors.push(`${warehouse}: ${mapError(error).message}`);
      }
    }));
    setStock(next);
    setStockError(errors.join(" · "));
  }, [adapter]);

  /* ── Đọc danh mục Item để đối chiếu mã cấu phần ────────────────────────────────────────── */
  const loadCatalog = useCallback(async (codes: string[]) => {
    const wanted = [...new Set(codes.filter(Boolean))];
    if (!wanted.length) {
      setItemFacts(new Map());
      setCatalogRead(true);
      setCatalogError("");
      return;
    }
    try {
      const rows = await adapter.getList("Item", {
        fields: [
          "name", "item_name", "item_group", "stock_uom",
          "material_specification", "measurement_profile", "disabled",
        ],
        filters: [["name", "in", wanted]],
        pageLength: Math.max(wanted.length, 20),
      });
      const next = new Map<string, ItemFacts>();
      for (const row of rows) {
        const code = text(row.name);
        if (!code) continue;
        next.set(code, {
          name: code,
          item_name: text(row.item_name),
          item_group: text(row.item_group),
          stock_uom: text(row.stock_uom),
          material_specification: text(row.material_specification),
          measurement_profile: text(row.measurement_profile),
          disabled: row.disabled,
        });
      }
      setItemFacts(next);
      setCatalogRead(true);
      setCatalogError("");
    } catch (error) {
      // KHÔNG được coi "đọc hỏng" là "mã hợp lệ". `catalogRead=false` giữ mọi dòng ở trạng thái
      // UNKNOWN thay vì nhuộm cả bảng thành hợp lệ.
      setItemFacts(new Map());
      setCatalogRead(false);
      setCatalogError(mapError(error).message);
    }
  }, [adapter]);

  /* ── Đọc các phiếu kho đã sinh ra từ lệnh ──────────────────────────────────────────────── */
  const loadStockEntries = useCallback(async () => {
    try {
      const rows = await adapter.getList("Stock Entry", {
        fields: ["name", "purpose", "posting_at", "docstatus", "finished_good_item", "finished_good_qty"],
        filters: [["work_order", "=", name]],
        orderBy: "posting_at desc",
        pageLength: 100,
      });
      setStockEntries(rows.map((row) => ({
        name: text(row.name),
        purpose: text(row.purpose),
        posting_at: text(row.posting_at),
        docstatus: numberValue(row.docstatus) ?? 0,
        finished_good_item: text(row.finished_good_item),
        finished_good_qty: numberValue(row.finished_good_qty),
      })));
      setStockEntryError("");
    } catch (error) {
      setStockEntries([]);
      setStockEntryError(mapError(error).message);
    }
  }, [adapter, name]);

  /* ── Hỏi server: định mức có áp được cho bộ cửa này không, và nếu không thì VÌ SAO ─────── */
  const refreshBomPreview = useCallback(async (values: Json, parsed: ParsedFormulaSnapshot) => {
    const itemCode = text(values.production_item);
    if (!itemCode) {
      setBomPreview(null);
      setBomPreviewError("Lệnh chưa chọn thành phẩm nên không hỏi được định mức.");
      return;
    }
    const revision = beginSalesOrderDocumentPreview(previewClock.current);
    setBomPreviewPending((current) => current + 1);
    try {
      const snap = parsed.snapshot;
      const leaf = snap?.leaf;
      const args: Json = {
        item_code: itemCode,
        ...(text(values.color) ? { color: text(values.color) } : {}),
        ...(text(snap?.sales_mode) ? { sales_mode: text(snap?.sales_mode) } : {}),
        ...(numberValue(values.width_m) === undefined ? {} : { width_m: numberValue(values.width_m) }),
        ...(numberValue(values.height_m) === undefined ? {} : { height_m: numberValue(values.height_m) }),
        ...(numberValue(snap?.mesh_height_m) === undefined ? {} : { mesh_height_m: numberValue(snap?.mesh_height_m) }),
        ...(numberValue(values.cut_width_m) === undefined ? {} : { cut_width_m: numberValue(values.cut_width_m) }),
        ...(numberValue(snap?.billable_area_sqm) === undefined
          ? {}
          : { billable_area_sqm: numberValue(snap?.billable_area_sqm) }),
        ...(numberValue(values.leaf_count) === undefined ? {} : { leaf_count: numberValue(values.leaf_count) }),
        ...(numberValue(leaf?.single_layer_leaf_count) === undefined
          ? {}
          : { single_layer_leaf_count: numberValue(leaf?.single_layer_leaf_count) }),
        ...(numberValue(leaf?.double_layer_leaf_count) === undefined
          ? {}
          : { double_layer_leaf_count: numberValue(leaf?.double_layer_leaf_count) }),
        ...(numberValue(values.estimated_weight_kg) === undefined
          ? {}
          : { estimated_weight_kg: numberValue(values.estimated_weight_kg) }),
        ...(text(values.motor_model) ? { motor_model: text(values.motor_model) } : {}),
        paint_required: values.paint_required === 1 || values.paint_required === true ? 1 : 0,
        ...(text(values.planned_end_date) ? { delivery_date: text(values.planned_end_date) } : {}),
        ...(snap?.bom_actual_components === undefined ? {} : { bom_actual_components: snap.bom_actual_components }),
      };
      const result = await adapter.callPost<BomRequirementPreview>("alumdoor.sales.preview_bom_requirements", args);
      if (!canApplySalesOrderDocumentPreview(previewClock.current, revision)) return;
      setBomPreview(result);
      setBomPreviewError("");
    } catch (error) {
      if (!canApplySalesOrderDocumentPreview(previewClock.current, revision)) return;
      setBomPreview(null);
      setBomPreviewError(mapError(error).message);
    } finally {
      finishSalesOrderDocumentPreview(previewClock.current);
      setBomPreviewPending((current) => Math.max(0, current - 1));
    }
  }, [adapter]);

  /* ── Nạp toàn bộ màn ───────────────────────────────────────────────────────────────────── */
  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const workOrderMeta = await adapter.getMeta("Work Order");
      setMeta(workOrderMeta);

      const [docResult, lifecycleResult, capabilities] = await Promise.all([
        adapter.getDoc("Work Order", name),
        adapter.callPost<WorkOrderLifecycle>(
          "metaforge.manufacturing.get_work_order_lifecycle",
          { work_order: name },
        ).catch((error: unknown) => {
          // Vòng đời hỏng KHÔNG được làm sập cả màn: đầu phiếu và bảng định mức vẫn đọc được.
          toast.error(`Không đọc được vòng đời lệnh: ${mapError(error).message}`);
          return null;
        }),
        adapter.getCapabilities("Work Order", name).catch((): WorkOrderCaps => ({})),
      ]);

      const document = docResult.doc;
      const values: Json = { ...document };
      delete values.required_items;
      setHeader(values);
      setSourceModified(text(document.modified));
      setDocstatus(numberValue(document.docstatus) ?? 0);
      setLifecycle(lifecycleResult);
      setCaps(capabilities);
      setDirty(false);

      const required: WorkOrderRequiredItem[] = recordRows(document.required_items).map((row) => ({
        row_id: text(row.row_id),
        item_code: text(row.item_code),
        source_warehouse: text(row.source_warehouse),
        required_qty: text(row.required_qty),
      }));
      setRequiredItems(required);

      const bomName = text(document.bom_no);
      let bomRows: BomComponentSource[] = [];
      if (bomName) {
        try {
          const bom = (await adapter.getDoc("Bill of Materials", bomName)).doc;
          setBomColor(text(bom.color));
          bomRows = recordRows(bom.items).map((row) => ({
            row_id: text(row.row_id),
            item_code: text(row.item_code),
            qty: numberValue(row.qty),
            uom: text(row.uom),
            qty_basis: text(row.qty_basis),
            source_warehouse: text(row.source_warehouse),
            color: text(row.color),
            note: text(row.note),
            source_note: text(row.source_note),
          }));
          setBomComponents(bomRows);
          setBomError("");
        } catch (error) {
          setBomComponents([]);
          setBomColor("");
          setBomError(mapError(error).message);
        }
      } else {
        setBomComponents([]);
        setBomColor("");
        setBomError(
          "Lệnh chưa chọn định mức. Nền tảng đọc vật tư cần từ đó, nên lệnh sẽ bị từ chối lúc ghi sổ.",
        );
      }

      const codes = [
        ...bomRows.map((row) => text(row.item_code)),
        ...required.map((row) => text(row.item_code)),
      ].filter(Boolean);
      const warehouses = [
        text(document.source_warehouse),
        ...bomRows.map((row) => text(row.source_warehouse)),
        ...required.map((row) => text(row.source_warehouse)),
      ];

      markSalesOrderDocumentChanged(previewClock.current);
      await Promise.all([
        loadCatalog(codes),
        loadStock(warehouses, text(document.company)),
        loadStockEntries(),
        refreshBomPreview(values, parseFormulaSnapshot(document.formula_snapshot)),
      ]);
      setFatal("");
    } catch (error) {
      setFatal(mapError(error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [adapter, loadCatalog, loadStock, loadStockEntries, name, refreshBomPreview]);

  useEffect(() => { void load(); }, [load, loadAttempt]);

  /* ── Ghi: lưu nháp · ghi sổ · huỷ. Ba việc, cả ba đều là thẩm quyền nền tảng ───────────── */
  const setHeaderField = useCallback((fieldname: string, value: unknown) => {
    setHeader((current) => ({ ...current, [fieldname]: value }));
    setDirty(true);
  }, []);

  const persist = useCallback(async (): Promise<Doc | null> => {
    if (!meta) return null;
    const payload: Json = {};
    for (const field of meta.fields ?? []) {
      if (field.read_only) continue;
      const value = fieldValueForServer(String(field.fieldtype), header[field.fieldname]);
      if (value !== undefined) payload[field.fieldname] = value;
    }
    const serialized = serializeCreateDocument(meta, payload) as Partial<Doc>;
    const saved = await adapter.updateDoc("Work Order", name, serialized, sourceModified);
    setSourceModified(text(saved.modified));
    setDocstatus(numberValue(saved.docstatus) ?? 0);
    setDirty(false);
    return saved;
  }, [adapter, header, meta, name, sourceModified]);

  const saveDraft = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await persist();
      if (!saved) return;
      toast.success(`Đã lưu nháp ${name}.`);
      await load(true);
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSaving(false);
    }
  }, [load, name, persist]);

  const submitWorkOrder = useCallback(async () => {
    setSubmitting(true);
    try {
      const saved = dirty ? await persist() : (await adapter.getDoc("Work Order", name)).doc;
      if (!saved) return;
      await adapter.submit(saved);
      toast.success(`Đã ghi sổ lệnh sản xuất ${name}.`);
      await load(true);
    } catch (error) {
      // Nền tảng kiểm mọi mã cấu phần khi ghi sổ, nên đây chính là chỗ những mã chưa quyết sẽ nổ.
      // Hiện NGUYÊN VĂN để người đọc biết mã nào, không diễn giải lại.
      toast.error(mapError(error).message);
    } finally {
      setSubmitting(false);
    }
  }, [adapter, dirty, load, name, persist]);

  const cancelWorkOrder = useCallback(async () => {
    setSubmitting(true);
    try {
      await adapter.cancel("Work Order", name);
      setConfirmCancel(false);
      toast.success(`Đã huỷ lệnh sản xuất ${name}.`);
      await load(true);
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSubmitting(false);
    }
  }, [adapter, load, name]);

  /* ── Dẫn xuất cho trình bày ────────────────────────────────────────────────────────────── */
  const componentRows: WorkOrderComponentRow[] = useMemo(() => buildComponentRows({
    bomComponents,
    bomColor,
    requiredItems,
    progressRows: lifecycle?.material_rows ?? [],
    items: itemFacts,
    catalogRead,
    stock,
    defaultWarehouse: text(header.source_warehouse),
  }), [bomColor, bomComponents, catalogRead, header.source_warehouse, itemFacts, lifecycle, requiredItems, stock]);

  const unresolved = useMemo(() => unresolvedComponents(componentRows), [componentRows]);
  const submitted = docstatus === 1;
  const busy = saving || submitting || refreshing;
  const formReadOnly = docstatus !== 0 || !caps.write || busy;
  const canSave = docstatus === 0 && Boolean(caps.write) && !busy;
  const canSubmit = docstatus === 0 && Boolean(caps.submit) && !busy;
  const canCancelDoc = Boolean(lifecycle?.actions?.can_cancel_work_order) && Boolean(caps.cancel) && !busy;
  const progress = percentOf(lifecycle?.produced_qty, lifecycle?.target_qty);
  const missingRequiredSnapshot = submitted && requiredItems.length === 0;

  const quantityHints = useMemo(() => {
    const hints: Array<{ label: string; value: number }> = [];
    const qty = numberValue(header.qty);
    if (qty !== undefined) hints.push({ label: "SL lệnh", value: qty });
    const area = numberValue(snapshot.snapshot?.billable_area_sqm);
    if (area !== undefined) hints.push({ label: "Diện tích tính tiền (m²)", value: area });
    const leaves = numberValue(header.leaf_count);
    if (leaves !== undefined) hints.push({ label: "Số lá", value: leaves });
    return hints;
  }, [header.leaf_count, header.qty, snapshot]);

  const sourceDocument = useMemo(() => {
    const request = text(lifecycle?.production_request) || text(header.production_request);
    if (request) return { label: `Yêu cầu sản xuất ${request}`, path: documentPath("Production Request", request) };
    const order = text(lifecycle?.sales_order) || text(header.against_sales_order);
    if (order) return { label: `Đơn bán ${order}`, path: documentPath("Sales Order", order) };
    return { label: "", path: "" };
  }, [header.against_sales_order, header.production_request, lifecycle]);

  const headerControl = (
    fieldname: string,
    label: string,
    fieldtype: DocTypeMeta["fields"][number]["fieldtype"],
    options?: string,
  ) => {
    const field = metaFieldOr(meta, fieldname, label, fieldtype, options);
    return (
      <AlumdoorWorkOrderField
        id={`work-order-v2-header-${fieldname}`}
        field={field}
        label={label}
        value={header[fieldname]}
        onChange={(value) => setHeaderField(fieldname, fieldValueForServer(String(field.fieldtype), value))}
        registry={registry}
        services={services}
        parentDoctype="Work Order"
        docValues={header}
        roles={roles}
        required={metaFieldRequired(meta, fieldname)}
        readOnly={formReadOnly}
      />
    );
  };

  if (loading) {
    return <RuntimeLoadingState className="h-full" label="Đang mở phiếu sản xuất…" />;
  }
  if (fatal) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <div className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{fatal}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setFatal(""); setLoadAttempt((value) => value + 1); }}
          >
            <RefreshCw className="size-3.5" /> Thử lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-work-order-v2">
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="w-full space-y-3 px-3 py-3">

            {/* ── Thanh đầu: định danh, trạng thái, hành động ───────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">Phiếu sản xuất {name}</h2>
                  <Badge variant={docstatus === 2 ? "destructive" : "outline"}>
                    {stageLabel(lifecycle?.stage)
                      || (docstatus === 0 ? "Nháp" : docstatus === 2 ? "Đã huỷ" : "Đã ghi sổ")}
                  </Badge>
                  {text(lifecycle?.canonical_status) ? (
                    <Badge variant="outline" className="text-[10px]">{text(lifecycle?.canonical_status)}</Badge>
                  ) : null}
                  {dirty ? <Badge variant="outline" className="text-[10px]">Chưa lưu</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {text(header.production_item) || text(lifecycle?.production_item) || "—"}
                  {" · nguồn phát hành "}
                  {releaseAuthorityLabel(lifecycle?.release_authority) || "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canSave ? (
                  <Button type="button" variant="outline" size="sm" disabled={!dirty} onClick={() => void saveDraft()}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu nháp
                  </Button>
                ) : null}
                {canSubmit ? (
                  <Button type="button" size="sm" onClick={() => void submitWorkOrder()}>
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Ghi sổ
                  </Button>
                ) : null}
                {canCancelDoc ? (
                  <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmCancel(true)}>
                    <XCircle className="size-4" /> Huỷ
                  </Button>
                ) : null}
                {sourceDocument.path ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => onNavigate(sourceDocument.path)}>
                    {sourceDocument.label} <ExternalLink className="size-3.5" />
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load(true)}>
                  {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Làm mới
                </Button>
              </div>
            </div>

            {/* ── Cảnh báo mức chứng từ ────────────────────────────────────────────────── */}
            {unresolved.length ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
                {unresolved.length} mã cấu phần trên định mức không khớp Item nào. Nền tảng kiểm mã lúc ghi sổ nên
                lệnh này sẽ bị TỪ CHỐI cho tới khi những mã đó được người có thẩm quyền quyết — xem tab “Định mức”.
              </div>
            ) : null}
            {(lifecycle?.warnings ?? []).length ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="size-3.5" /> Cảnh báo bằng chứng
                </div>
                <ul className="mt-1 space-y-0.5">
                  {(lifecycle?.warnings ?? []).map((warning) => (
                    <li key={text(warning)}>{lifecycleWarningLabel(warning)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {snapshot.parseError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />{snapshot.parseError}
              </div>
            ) : null}

            {/* ── Đầu phiếu ────────────────────────────────────────────────────────────── */}
            <section className="rounded-lg border bg-card p-2.5" data-section="work-order-v2-header">
              {formReadOnly ? (
                <div className="mb-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  {docstatus === 0
                    ? "Tài khoản không có quyền sửa lệnh này."
                    : "Lệnh đã ghi sổ/huỷ — đầu phiếu chỉ còn để đọc. Mọi thay đổi phải đi qua chứng từ nguồn."}
                </div>
              ) : null}
              <div className="grid gap-x-2 gap-y-2 md:grid-cols-2 xl:grid-cols-4">
                {headerControl("production_item", "Thành phẩm", "Link", "Item")}
                {headerControl("bom_no", "Định mức áp dụng", "Link", "Bill of Materials")}
                {headerControl("qty", "Số lượng cần sản xuất", "Float")}
                {headerControl("color", "Màu / mã sơn", "Link", "Item Color")}
                {headerControl("source_warehouse", "Kho nguyên vật liệu", "Link", "Warehouse")}
                {headerControl("target_warehouse", "Kho nhập thành phẩm", "Link", "Warehouse")}
                {headerControl("planned_start_date", "Ngày bắt đầu", "Date")}
                {headerControl("planned_end_date", "Ngày hẹn giao", "Date")}
                {headerControl("width_m", "Rộng (m)", "Float")}
                {headerControl("height_m", "Cao (m)", "Float")}
                {headerControl("motor_model", "Mô tơ", "Link", "Item")}
                {headerControl("against_sales_order", "Theo đơn hàng", "Link", "Sales Order")}
              </div>
              <div className="mt-2 grid gap-x-2 gap-y-2 border-t pt-2 md:grid-cols-3 xl:grid-cols-6">
                <WorkOrderReadonlyField label="Loại cửa" value={header.door_type} />
                <WorkOrderReadonlyField label="Loại ray" value={header.ray_type} />
                <WorkOrderReadonlyField label="Rộng cắt lá (m)" value={header.cut_width_m} />
                <WorkOrderReadonlyField label="Số lá" value={header.leaf_count} />
                <WorkOrderReadonlyField label="Kg dự toán" value={header.estimated_weight_kg} />
                <WorkOrderReadonlyField
                  label="Công thức đã chụp"
                  value={header.formula_policy}
                  hint={text(header.formula_version) ? `phiên bản ${text(header.formula_version)}` : ""}
                />
              </div>
            </section>

            {/* ── Tiến độ ──────────────────────────────────────────────────────────────── */}
            <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Tiến độ thành phẩm</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">
                      {quantity(lifecycle?.produced_qty ?? 0)} / {quantity(lifecycle?.target_qty ?? header.qty)}
                    </div>
                  </div>
                  <Factory className="size-5 text-muted-foreground" />
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{progress}%</span>
                  <span>Còn {quantity(lifecycle?.remaining_qty ?? 0)}</span>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="text-xs text-muted-foreground">Nguồn phát hành</div>
                <div className="mt-1 truncate font-medium" title={lineageLabel(lifecycle)}>{lineageLabel(lifecycle)}</div>
                <div className="mt-3 text-xs text-muted-foreground">Cách bán đã chốt</div>
                <div className="mt-1 font-medium">{text(snapshot.snapshot?.sales_mode) || "—"}</div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="text-xs text-muted-foreground">Phút dự toán</div>
                <div className="mt-1 font-medium">{minutesLabel(header.estimated_minutes)}</div>
                <div className="mt-3 text-xs text-muted-foreground">Cấu phần chưa giải được mã</div>
                <div className={`mt-1 font-medium ${unresolved.length ? "text-destructive" : ""}`}>
                  {catalogRead ? `${unresolved.length} / ${componentRows.length}` : "chưa đối chiếu được"}
                </div>
              </div>
            </div>

            {/* ── Bốn khu làm việc ─────────────────────────────────────────────────────── */}
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="dinh-muc">Định mức &amp; cấu phần</TabsTrigger>
                <TabsTrigger value="vat-tu">Cấp vật tư · nhập thành phẩm</TabsTrigger>
                <TabsTrigger value="cat">Cắt nhôm</TabsTrigger>
                <TabsTrigger value="nang-luc">Năng lực xưởng</TabsTrigger>
              </TabsList>

              <TabsContent value="dinh-muc" className="space-y-3">
                <AlumdoorWorkOrderComponentTable
                  rows={componentRows}
                  bomName={text(header.bom_no)}
                  bomError={bomError}
                  catalogError={catalogError}
                  stockError={stockError}
                  submitted={submitted}
                  missingRequiredSnapshot={missingRequiredSnapshot}
                  onNavigate={onNavigate}
                />
                <AlumdoorWorkOrderBomPanel
                  preview={bomPreview}
                  previewError={bomPreviewError}
                  previewPending={bomPreviewPending > 0}
                  onRefresh={() => {
                    markSalesOrderDocumentChanged(previewClock.current);
                    void refreshBomPreview(header, snapshot);
                  }}
                  actualComponents={snapshot.snapshot?.bom_actual_components ?? []}
                  snapshotError={snapshot.parseError}
                  sourceLabel={sourceDocument.label}
                  sourcePath={sourceDocument.path}
                  onNavigate={onNavigate}
                />
              </TabsContent>

              <TabsContent value="vat-tu" className="space-y-3">
                <section className="rounded-xl border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!lifecycle?.actions?.can_issue_materials || busy}
                      onClick={() => setStockEntryPurpose("Material Transfer")}
                    >
                      <Boxes className="size-4" /> Cấp vật tư
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!lifecycle?.actions?.can_manufacture || busy}
                      onClick={() => setStockEntryPurpose("Manufacture")}
                    >
                      <Factory className="size-4" /> Nhập thành phẩm
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigate(manufacturingStockEntryPath(name, "Material Transfer"))}
                    >
                      Mở màn riêng <ExternalLink className="size-3.5" />
                    </Button>
                    <div className="ml-auto text-xs text-muted-foreground">
                      Hai nút chỉ mở khi vòng đời server cho phép; ghi sổ vẫn do Stock Entry quyết.
                    </div>
                  </div>
                </section>

                <section className="overflow-hidden rounded-xl border bg-card">
                  <div className="border-b px-4 py-3">
                    <h3 className="font-medium">Phiếu kho đã sinh từ lệnh này</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Lọc theo `Stock Entry.work_order`. Phiếu đã huỷ vẫn hiện để giữ vết kiểm toán.
                    </p>
                  </div>
                  {stockEntryError ? (
                    <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
                      <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />{stockEntryError}
                    </div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Phiếu kho</TableHead>
                          <TableHead>Loại</TableHead>
                          <TableHead>Thời điểm</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead>Thành phẩm</TableHead>
                          <TableHead className="text-right">SL thành phẩm</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stockEntries.map((entry) => (
                          <TableRow key={entry.name}>
                            <TableCell className="font-mono text-xs">{entry.name}</TableCell>
                            <TableCell className="text-xs">{entry.purpose || "—"}</TableCell>
                            <TableCell className="text-xs">{entry.posting_at || "—"}</TableCell>
                            <TableCell className="text-xs">
                              {entry.docstatus === 1 ? "Đã ghi sổ" : entry.docstatus === 2 ? "Đã huỷ" : "Nháp"}
                            </TableCell>
                            <TableCell className="text-xs">{entry.finished_good_item || "—"}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {entry.finished_good_qty === undefined ? "—" : quantity(entry.finished_good_qty)}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Mở phiếu kho ${entry.name}`}
                                onClick={() => onNavigate(documentPath("Stock Entry", entry.name))}
                              >
                                <ExternalLink className="size-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {!stockEntries.length ? (
                          <TableRow>
                            <TableCell colSpan={7} className="h-20 text-center text-xs text-muted-foreground">
                              <FileText className="mx-auto mb-1 size-4" />
                              Chưa có phiếu kho nào gắn với lệnh này.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="cat">
                <AlumdoorWorkOrderCutPanel
                  workOrder={name}
                  componentItemCodes={componentRows
                    .filter((row) => row.resolution === "RESOLVED" || row.resolution === "DISABLED_ITEM")
                    .map((row) => row.item_code)
                    .filter(Boolean)}
                  defaults={{
                    warehouse: text(header.source_warehouse),
                    cut_width_m: numberValue(header.cut_width_m),
                    sheets: numberValue(header.leaf_count),
                    cutting_policy: text(header.formula_policy),
                    target_color: text(header.color),
                    so_reference: text(header.against_sales_order),
                  }}
                  submitted={submitted}
                  onNavigate={onNavigate}
                />
              </TabsContent>

              <TabsContent value="nang-luc">
                <AlumdoorWorkOrderCapacityPanel
                  workOrder={name}
                  doorType={text(header.door_type)}
                  color={text(header.color)}
                  plannedStartDate={text(header.planned_start_date)}
                  plannedEndDate={text(header.planned_end_date)}
                  quantityHints={quantityHints}
                  estimatedMinutes={numberValue(header.estimated_minutes)}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Dùng lại NGUYÊN BẢN màn phiếu kho sản xuất — đúng component mà `workspace-extension.tsx`
          mở qua bridge `f_work_order` + `f_purpose`, chỉ khác là mở tại chỗ thay vì đổi route. */}
      <Dialog open={stockEntryPurpose !== null} onOpenChange={(open) => { if (!open) setStockEntryPurpose(null); }}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>
              {stockEntryPurpose === "Manufacture" ? "Nhập thành phẩm" : "Cấp vật tư"} · {name}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            {stockEntryPurpose ? (
              <AlumdoorManufacturingStockEntryCreate
                key={`work-order-v2-stock-entry/${name}/${stockEntryPurpose}`}
                workOrder={name}
                purpose={stockEntryPurpose}
                onCreated={(created) => {
                  setStockEntryPurpose(null);
                  toast.success(`Đã lập phiếu kho ${created}.`);
                  void load(true);
                }}
                onCancel={() => setStockEntryPurpose(null)}
                onNavigate={onNavigate}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Huỷ phiếu sản xuất ${name}?`}
        description="Server chỉ cho huỷ khi vòng đời hiện tại còn cho phép. Không xoá lineage; chứng từ chuyển sang trạng thái huỷ để giữ audit."
        cancelLabel="Không huỷ"
        confirmLabel={submitting ? "Đang huỷ…" : "Xác nhận huỷ"}
        destructive
        onConfirm={() => { void cancelWorkOrder(); }}
      />
    </TooltipProvider>
  );
}
