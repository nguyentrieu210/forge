/** @jsxImportSource react */
/**
 * NHẬP HÀNG FIFO — màn tác nghiệp cho `Purchase Receipt`, nối tiếp màn đơn mua.
 *
 * Vị trí trong kiến trúc (`skills/forge-ui-change-routing/SKILL.md` §4.8): đây là
 * "hard-coded operational experience". Client CHỈ điều phối + trình bày. Mọi con số tiền,
 * tồn và phân bổ FIFO đều do server quyết:
 *
 *   alumdoor.purchase.preview_receipt          → phần CÒN PHẢI NHẬN của một đơn mua
 *   alumdoor.ui.preview_child_row              → barem kg/m, kg lý thuyết, thành tiền, kg/m thực
 *   alumdoor.purchase.preview_fifo_receipt     → lớp phân bổ FIFO + công nợ hiện vật (1 dòng)
 *   alumdoor.purchase.preview_bulk_fifo_receipt→ như trên cho NHIỀU dòng / nhiều đơn một lần
 *   alumdoor.purchase.fifo_receipt / bulk_...  → tạo phiếu nhập nháp
 *   alumdoor.purchase.supplier_delivery_dashboard → công nợ phải trả (Payment Ledger)
 *
 * Màn này KHÔNG tự nhân hệ số quy đổi bao giờ. Thiếu hệ số thì nói ra thiếu ở đâu (xem
 * `uom-gap.ts`), và tuyệt đối không báo động cho chỗ trống ĐÚNG LUẬT của hàng cân thực tế.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Plus, RefreshCw, Save, Send, Trash2, Truck } from "lucide-react";
import {
  applyContextPolicy,
  mapError,
  serializeCreateDocument,
  type Doc,
  type DocField,
  type DocTypeMeta,
} from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";
import { Badge, Button, Table, Tabs, TabsContent, TabsList, TabsTrigger, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";
import { salesItemSearchTerms } from "../sales-item-search.js";
import { AlumdoorSalesOrderField, fallbackField } from "../sales-order-v2/AlumdoorSalesOrderField.js";
import {
  beginPurchaseOrderPreview,
  canApplyPurchaseOrderPreview,
  createPurchaseOrderPreviewClock,
  finishPurchaseOrderPreview,
  isPurchaseOrderPersistenceBlocked,
  markPurchaseOrderChanged,
} from "../purchase-preview-coordinator.js";
import {
  RECEIPT_DOCTYPE,
  RECEIPT_ITEM_DOCTYPE,
  blankFromReceiptMeta,
  cleanReceiptLine,
  fieldValueForServer,
  fifoBulkArgs,
  fifoSingleArgs,
  isCatchWeightReceiptLine,
  money,
  newFifoInputLine,
  newReceiptLine,
  nonNegativeNumber,
  nowLocalDatetime,
  numberValue,
  positiveNumber,
  quantity,
  receiptLineKey,
  selectOptions,
  text,
  type FifoInputLine,
  type FifoInsight,
  type Json,
  type ReceiptFieldOverride,
  type ReceiptLine,
  type SupplierPayableView,
} from "./model.js";
import {
  PURCHASE_RECEIPT_METHODS,
  type BulkFifoReceiptResult,
  type ChildRowPreview,
  type FifoReceiptResult,
  type ReceiptFromOrderPreview,
  type SupplierDeliveryDashboard,
} from "./server-contract.js";
import { insightFromBulk, insightFromSingle } from "./fifo-insight.js";
import { mergeUomReadings, readItemUomConversions, type UomConversionReading } from "./uom-gap.js";
import { readDeliveryTolerance, readWeightVariance, type WeightVarianceReading } from "./weight-variance.js";
import { ReceiptLinesTable } from "./ReceiptLinesTable.js";
import {
  DeliveryToleranceNote,
  FifoDebtPanel,
  FifoHistoryPanel,
  FifoLayersPanel,
  FifoOrderBalancePanel,
  UomGapPanel,
} from "./FifoInsightPanels.js";

/** Cùng khuôn với `AlumdoorPurchaseOrderCreateProps` (AlumdoorPurchaseOrderCreateStable.tsx). */
export interface AlumdoorPurchaseReceiptCreateProps {
  name?: string;
  closeRequest?: number;
  onCreated: (name: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

interface ItemIntel {
  item: Json;
  profile: Json | null;
  reading: UomConversionReading;
}

/** Một đơn mua đã nạp vào phiếu — để hiện kết quả TỪNG ĐƠN khi nhận gộp nhiều đơn. */
interface OrderIntake {
  order: string;
  supplier: string;
  outstandingLines: number;
  message: string;
}

function mergePurchaseItemFilters(filters: Record<string, unknown> | Array<unknown> | undefined): Record<string, unknown> | Array<unknown> {
  if (Array.isArray(filters)) return [...filters, ["Item", "is_purchase_item", "=", 1], ["Item", "disabled", "=", 0]];
  return { ...(filters ?? {}), is_purchase_item: 1, disabled: 0 };
}

function asJson(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function asJsonArray(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
}

/**
 * `remainingLines` (index.ts) đánh dấu dòng còn lại bằng `row_id = "R<vị trí dòng đơn mua>"`.
 * Nhờ đó bắt được ĐÚNG dòng đơn mua tương ứng, kể cả khi một đơn có hai dòng cùng mã hàng
 * (hai khổ, hai màu) — cộng gộp theo mã hàng ở client sẽ hiện thiếu dòng đầu và dư dòng sau.
 */
function orderLineIndexOf(rowId: string): number | undefined {
  const match = /^R(\d+)$/.exec(text(rowId));
  if (!match) return undefined;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

export function AlumdoorPurchaseReceiptCreate(props: AlumdoorPurchaseReceiptCreateProps) {
  const { adapter, scopeKey, businessContext, contextPolicies, registry, services, roles } = useMetaForge();
  const queryClient = useQueryClient();

  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [childMeta, setChildMeta] = useState<DocTypeMeta | null>(null);
  const [header, setHeader] = useState<Json>({});
  const headerRef = useRef<Json>({});
  const [rows, setRows] = useState<ReceiptLine[]>([]);
  const rowsRef = useRef<ReceiptLine[]>([]);
  const [orders, setOrders] = useState<OrderIntake[]>([]);
  const [orderPick, setOrderPick] = useState<unknown>("");
  const [fifoRows, setFifoRows] = useState<FifoInputLine[]>(() => [newFifoInputLine(0)]);
  const [insight, setInsight] = useState<FifoInsight | null>(null);
  const [payable, setPayable] = useState<SupplierPayableView>({ loading: false, error: "" });
  const [supplierDoc, setSupplierDoc] = useState<Json | null>(null);

  const [tab, setTab] = useState<"order" | "fifo">("order");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fifoBusy, setFifoBusy] = useState<"" | "preview" | "commit">("");
  const [fatal, setFatal] = useState("");
  const [previewPending, setPreviewPending] = useState(0);
  const [previewError, setPreviewErrorState] = useState("");
  const previewErrorRef = useRef("");
  const [workingName, setWorkingName] = useState(() => text(props.name));
  const [sourceModified, setSourceModified] = useState("");
  const [docstatus, setDocstatus] = useState(0);
  const [canCreate, setCanCreate] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [submitAllowed, setSubmitAllowed] = useState(false);
  const [dirty, setDirty] = useState(false);

  /**
   * Phân bổ cước vận chuyển / thuế nhập khẩu vào các dòng của phiếu ĐÃ GHI SỔ.
   *
   * Nối `planProcurementLandedCost` (`clouderp-core`) qua route
   * `metaforge.api.preview_landed_cost` (`index-core-base.ts`) — trước đây hàm này có đủ
   * công thức nhưng 0 route/UI nào gọi tới (audit vòng 3, ca S1). Chỉ TÍNH VÀ HIỂN THỊ bảng
   * phân bổ, không ghi lại giá vốn tồn kho hay bút toán sổ cái — dùng để đối chiếu / nhập
   * tay vào phiếu điều chỉnh khi cần (xem docstring server).
   */
  const [landedCostOpen, setLandedCostOpen] = useState(false);
  const [landedCostBasis, setLandedCostBasis] = useState<"amount" | "quantity" | "weight">("amount");
  const [landedCostTotal, setLandedCostTotal] = useState("");
  const [landedCostLoading, setLandedCostLoading] = useState(false);
  const [landedCostError, setLandedCostError] = useState("");
  const [landedCostPlan, setLandedCostPlan] = useState<Json | null>(null);

  const closeSeen = useRef(props.closeRequest ?? 0);
  const intelCache = useRef(new Map<string, ItemIntel>());
  const rowPreviewSeq = useRef(new Map<string, number>());
  const previewClock = useRef(createPurchaseOrderPreviewClock());

  const isExisting = Boolean(workingName);
  const formReadOnly = isExisting ? (!canWrite || docstatus !== 0) : !canCreate;
  const interactionBusy = saving || refreshing || Boolean(fifoBusy);
  const previewBlocked = isPurchaseOrderPersistenceBlocked(previewClock.current, previewError);

  const setPreviewError = useCallback((message: string) => {
    previewErrorRef.current = message;
    setPreviewErrorState(message);
  }, []);

  const markChanged = useCallback((makeDirty = true) => {
    const revision = markPurchaseOrderChanged(previewClock.current);
    if (makeDirty) setDirty(true);
    return revision;
  }, []);

  const beginPreview = useCallback(() => {
    const revision = beginPurchaseOrderPreview(previewClock.current);
    setPreviewPending(previewClock.current.pending);
    return revision;
  }, []);

  const finishPreview = useCallback(() => {
    setPreviewPending(finishPurchaseOrderPreview(previewClock.current));
  }, []);

  const setHeaderState = useCallback((next: Json) => {
    headerRef.current = next;
    setHeader(next);
  }, []);

  const replaceRows = useCallback((next: ReceiptLine[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Danh mục nền tảng — ô chọn Mặt hàng dùng lại đúng picker của màn mua     */
  /* ---------------------------------------------------------------------- */

  const receiptServices = useMemo<FieldServices>(() => ({
    ...services,
    searchLink: async (doctype, query, options) => {
      if (!services.searchLink) return [];
      if (doctype !== "Item") return services.searchLink(doctype, query, options);
      const terms = salesItemSearchTerms(text(query));
      const batches = await Promise.allSettled(terms.map((term) => services.searchLink!(doctype, term, {
        ...options,
        filters: mergePurchaseItemFilters(options?.filters),
        pageLength: Math.max(options?.pageLength ?? 10, 100),
      })));
      const merged = new Map<string, { value: string; label?: string; description?: string }>();
      let firstFailure: unknown;
      let fulfilled = 0;
      for (const batch of batches) {
        if (batch.status === "fulfilled") {
          fulfilled += 1;
          for (const option of batch.value) if (option.value && !merged.has(option.value)) merged.set(option.value, option);
        } else if (firstFailure === undefined) firstFailure = batch.reason;
      }
      if (!fulfilled) throw firstFailure ?? new Error("Không tải được danh sách mặt hàng mua.");
      return [...merged.values()].slice(0, 100);
    },
  }), [services]);

  /* ---------------------------------------------------------------------- */
  /* Đọc danh mục cho một mã hàng: Item + Bộ theo dõi + bảng quy đổi ĐVT      */
  /* ---------------------------------------------------------------------- */

  const loadIntel = useCallback(async (itemCode: string): Promise<ItemIntel> => {
    const cached = intelCache.current.get(itemCode);
    if (cached) return cached;
    const { doc } = await adapter.getDoc("Item", itemCode);
    const item = doc as Json;
    const profileName = text(item.measurement_profile);
    const profile = profileName
      ? await adapter.getDoc("Measurement Profile", profileName).then((result) => result.doc as Json).catch(() => null)
      : null;
    const intel: ItemIntel = { item, profile, reading: readItemUomConversions(itemCode, item) };
    intelCache.current.set(itemCode, intel);
    return intel;
  }, [adapter]);

  const hydrateLine = useCallback(async (source: ReceiptLine): Promise<ReceiptLine> => {
    const itemCode = text(source.item_code);
    if (!itemCode) return source;
    const { item, profile } = await loadIntel(itemCode);
    const mode = text(item.inventory_mode) || "Hàng thường";
    const purchaseUom = text(item.default_purchase_uom) || text(item.stock_uom);
    /* 0% là ngưỡng khai THẬT, không phải "chưa khai" — xem `nonNegativeNumber` trong model.ts. */
    const tolerance = nonNegativeNumber(profile?.weight_tolerance_pct);
    const next: ReceiptLine = {
      ...source,
      _itemName: text(item.item_name) || itemCode,
      _itemGroup: text(item.item_group),
      _inventoryMode: mode,
      _stockUom: text(item.stock_uom),
      _defaultPurchaseUom: purchaseUom,
      _defaultSalesUom: text(item.default_sales_uom),
      _catchWeight: mode === "Nhôm cây/lá",
      _weightToleranceKnown: Boolean(profile) && tolerance !== undefined,
      item_name: text(item.item_name) || source.item_name,
      inventory_mode: mode,
      measurement_profile: text(item.measurement_profile) || source.measurement_profile,
      material_specification: text(item.material_specification) || source.material_specification,
      stock_uom: text(item.stock_uom) || source.stock_uom,
    };
    if (tolerance !== undefined) next._weightTolerancePct = tolerance;
    if (purchaseUom && !text(next.uom)) next.uom = purchaseUom;
    return next;
  }, [loadIntel]);

  /**
   * Danh sách field gửi cho `alumdoor.ui.preview_child_row`.
   *
   * Với dòng nhôm ĐÃ CÓ kg thực cân thì CỐ Ý bỏ `qty` ra khỏi danh sách. Lý do: preview hiện
   * dùng CHUNG một nhánh cho `Purchase Order Item` và `Purchase Receipt Item`, nên nó luôn
   * đẩy `qty = theoretical_kg` (kg BAREM — đúng cho đơn ĐẶT). Nhưng luật của phiếu NHẬP là
   * `qty` phải bằng kg THỰC CÂN (`canonicalizeAluminumPurchaseLine`, nhánh
   * `doctype === "Purchase Receipt"`), nếu không server 422 khi lưu.
   * Bỏ `qty` khỏi `child_fields` khiến preview không ghi đè, còn `applyCommonComputed` vẫn
   * lấy `row.qty` (= kg thực cân do màn gửi lên) để tính THÀNH TIỀN. Nhờ vậy tiền vẫn là số
   * server tính, chỉ là tính trên đúng trục số lượng của phiếu nhập.
   * Xem "Dependency Request" trong báo cáo: chỗ đúng để sửa là preview ở server.
   */
  const childFieldsFor = useCallback((line: ReceiptLine, source: DocTypeMeta): string[] => {
    const all = (source.fields ?? []).map((field) => field.fieldname).filter(Boolean);
    if (!isCatchWeightReceiptLine(line)) return all;
    if (positiveNumber(line.actual_weight_kg) === undefined) return all;
    return all.filter((fieldname) => fieldname !== "qty");
  }, []);

  const applyChildPreview = useCallback((line: ReceiptLine, preview: ChildRowPreview, source: DocTypeMeta): ReceiptLine => {
    const fields = new Set((source.fields ?? []).map((field) => field.fieldname));
    const next: ReceiptLine = { ...line };
    for (const fieldname of Array.isArray(preview.clear) ? preview.clear.map(text) : []) {
      if (fields.has(fieldname)) next[fieldname] = undefined;
    }
    for (const [fieldname, value] of Object.entries(asJson(preview.patch))) {
      if (fields.has(fieldname)) next[fieldname] = value;
    }
    const overrides: Record<string, ReceiptFieldOverride> = {};
    for (const [fieldname, value] of Object.entries(asJson(preview.field_overrides))) {
      if (fields.has(fieldname) && value && typeof value === "object" && !Array.isArray(value)) {
        overrides[fieldname] = value as ReceiptFieldOverride;
      }
    }
    next._overrides = overrides;
    return next;
  }, []);

  const resolveChildLine = useCallback(async (source: ReceiptLine, changedField: string): Promise<ReceiptLine> => {
    if (!childMeta || !text(source.item_code)) return source;
    const hydrated = await hydrateLine(source);
    /*
     * Luật phiếu nhập cho hàng cân thực tế: số tính tiền LÀ kg thực cân, không phải kg barem.
     * Đây không phải luật mới của client — là đúng nhánh `doctype === "Purchase Receipt"` của
     * `canonicalizeAluminumPurchaseLine`, và cũng chính là thứ validator server bắt lúc lưu.
     */
    const actualKg = positiveNumber(hydrated.actual_weight_kg);
    const forServer: ReceiptLine = isCatchWeightReceiptLine(hydrated) && actualKg !== undefined
      ? { ...hydrated, qty: actualKg }
      : hydrated;
    const preview = await adapter.callPost<ChildRowPreview>(PURCHASE_RECEIPT_METHODS.previewChildRow, {
      parent_doctype: RECEIPT_DOCTYPE,
      child_doctype: childMeta.name,
      child_fields: childFieldsFor(forServer, childMeta),
      parent: { ...headerRef.current, doctype: RECEIPT_DOCTYPE, items: undefined },
      row: forServer,
      changed_field: changedField,
    });
    const resolved = applyChildPreview(forServer, preview, childMeta);
    if (isCatchWeightReceiptLine(resolved) && actualKg !== undefined) resolved.qty = actualKg;
    return { ...resolved, _loading: false, _error: "" };
  }, [adapter, applyChildPreview, childFieldsFor, childMeta, hydrateLine]);

  /* ---------------------------------------------------------------------- */
  /* Khởi tạo                                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFatal("");
    setPreviewError("");
    previewClock.current = createPurchaseOrderPreviewClock();
    setPreviewPending(0);
    void (async () => {
      try {
        const receiptMeta = await adapter.getMeta(RECEIPT_DOCTYPE);
        const itemsField = receiptMeta.fields.find((field) => field.fieldname === "items" && field.fieldtype === "Table");
        const childDoctype = text(itemsField?.options) || RECEIPT_ITEM_DOCTYPE;
        const routeName = text(props.name);
        const [receiptChildMeta, boot, caps, existingResult] = await Promise.all([
          adapter.getMeta(childDoctype),
          adapter.getBoot(),
          adapter.getCapabilities(RECEIPT_DOCTYPE, routeName || undefined),
          routeName ? adapter.getDoc(RECEIPT_DOCTYPE, routeName) : Promise.resolve(null),
        ]);
        if (!active) return;

        const defaults: Json = {
          ...blankFromReceiptMeta(receiptMeta),
          ...applyContextPolicy(RECEIPT_DOCTYPE, businessContext, contextPolicies).defaults,
        };
        if (!text(defaults.posting_at)) defaults.posting_at = nowLocalDatetime();
        if (!text(defaults.company) && receiptMeta.fields.some((field) => field.fieldname === "company")) defaults.company = "ALUMDOOR";
        if (!text(defaults.currency) && receiptMeta.fields.some((field) => field.fieldname === "currency")) {
          defaults.currency = boot.sysdefaults.currency || "VND";
        }

        const existingDoc = existingResult?.doc as Json | undefined;
        const existingRows = asJsonArray(existingDoc?.items) as ReceiptLine[];
        const initialRows = existingRows.length
          ? await Promise.all(existingRows.map((row) => hydrateLine({ ...row, doctype: text(row.doctype) || receiptChildMeta.name } as ReceiptLine)))
          : [];
        if (!active) return;

        setMeta(receiptMeta);
        setChildMeta(receiptChildMeta);
        setHeaderState(existingDoc ? { ...defaults, ...existingDoc, items: undefined } : defaults);
        rowsRef.current = initialRows;
        setRows(initialRows);
        setWorkingName(text(existingDoc?.name) || routeName);
        setSourceModified(text(existingDoc?.modified));
        setDocstatus(Number(existingDoc?.docstatus) || 0);
        setCanCreate(Boolean(caps.create));
        setCanWrite(Boolean(caps.write));
        setSubmitAllowed(Boolean(caps.submit));
        setDirty(false);
      } catch (error) {
        if (active) setFatal(mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, businessContext, contextPolicies, hydrateLine, props.name, setHeaderState, setPreviewError]);

  const requestClose = useCallback(() => {
    if (dirty && typeof window !== "undefined" && !window.confirm("Phiếu nhập có thay đổi chưa lưu. Bỏ các thay đổi này?")) return;
    props.onCancel();
  }, [dirty, props]);

  useEffect(() => {
    if ((props.closeRequest ?? 0) === closeSeen.current) return;
    closeSeen.current = props.closeRequest ?? 0;
    requestClose();
  }, [props.closeRequest, requestClose]);

  /* Hồ sơ NCC — chỉ để ĐỌC dung sai giao nhận đã khai, không suy diễn thêm. */
  useEffect(() => {
    const supplier = text(header.supplier);
    if (!supplier) {
      setSupplierDoc(null);
      return;
    }
    let active = true;
    void adapter.getDoc("Supplier", supplier)
      .then(({ doc }) => { if (active) setSupplierDoc(doc as Json); })
      .catch(() => { if (active) setSupplierDoc(null); });
    return () => { active = false; };
  }, [adapter, header.supplier]);

  /* ---------------------------------------------------------------------- */
  /* Sửa dòng                                                                */
  /* ---------------------------------------------------------------------- */

  const patchLineFromUser = useCallback((key: string, patch: Partial<ReceiptLine>) => {
    markChanged(true);
    replaceRows(rowsRef.current.map((line, index) => receiptLineKey(line, index) === key
      ? { ...line, ...patch, _loading: false, _error: "" }
      : line));
    setPreviewError("");
  }, [markChanged, replaceRows, setPreviewError]);

  const patchLineInternal = useCallback((key: string, patch: Partial<ReceiptLine>) => {
    replaceRows(rowsRef.current.map((line, index) => receiptLineKey(line, index) === key ? { ...line, ...patch } : line));
  }, [replaceRows]);

  const commitLine = useCallback((key: string, fieldname: string, value: unknown) => {
    const current = rowsRef.current;
    const index = current.findIndex((line, lineIndex) => receiptLineKey(line, lineIndex) === key);
    if (index < 0) return;
    const line = current[index]!;
    const actual = fieldname === "item_code" ? value : (line[fieldname] !== undefined ? line[fieldname] : value);
    const revision = markChanged(true);
    setPreviewError("");

    let changed: ReceiptLine = { ...line, [fieldname]: actual, _loading: true, _error: "" };
    if (fieldname === "item_code") {
      /* Đổi mã hàng thì mọi số suy ra từ mã cũ phải chết theo, kể cả hai trục số lượng. */
      changed = {
        name: line.name,
        doctype: line.doctype,
        item_code: actual,
        warehouse: line.warehouse ?? headerRef.current.warehouse,
        purchase_order: line.purchase_order,
        _loading: Boolean(text(actual)),
        _error: "",
      };
    }
    const next = [...current];
    next[index] = changed;
    replaceRows(next);
    if (!text(changed.item_code)) return;

    const seq = (rowPreviewSeq.current.get(key) ?? 0) + 1;
    rowPreviewSeq.current.set(key, seq);
    beginPreview();
    void resolveChildLine(changed, fieldname)
      .then((resolved) => {
        if (rowPreviewSeq.current.get(key) !== seq || !canApplyPurchaseOrderPreview(previewClock.current, revision)) {
          if (rowPreviewSeq.current.get(key) === seq) patchLineInternal(key, { _loading: false });
          return;
        }
        replaceRows(rowsRef.current.map((row, rowIndex) => receiptLineKey(row, rowIndex) === key ? resolved : row));
      })
      .catch((error) => {
        if (rowPreviewSeq.current.get(key) !== seq) return;
        patchLineInternal(key, { _loading: false, _error: mapError(error).message });
      })
      .finally(() => finishPreview());
  }, [beginPreview, finishPreview, markChanged, patchLineInternal, replaceRows, resolveChildLine, setPreviewError]);

  const addLine = useCallback(() => {
    markChanged(true);
    const blank = newReceiptLine(childMeta, rowsRef.current.length);
    if (text(headerRef.current.warehouse)) blank.warehouse = headerRef.current.warehouse;
    replaceRows([...rowsRef.current, blank]);
  }, [childMeta, markChanged, replaceRows]);

  const deleteLine = useCallback((key: string) => {
    markChanged(true);
    rowPreviewSeq.current.set(key, (rowPreviewSeq.current.get(key) ?? 0) + 1);
    replaceRows(rowsRef.current.filter((line, index) => receiptLineKey(line, index) !== key));
  }, [markChanged, replaceRows]);

  const refreshAll = useCallback(async (showToast = true) => {
    if (!rowsRef.current.some((row) => text(row.item_code))) return;
    const revision = previewClock.current.revision;
    setRefreshing(true);
    setPreviewError("");
    try {
      const resolved = await Promise.all(rowsRef.current.map((row) => text(row.item_code) ? resolveChildLine(row, "manual_refresh") : row));
      if (!canApplyPurchaseOrderPreview(previewClock.current, revision)) return;
      replaceRows(resolved);
      if (showToast) toast.success("Đã tính lại barem, kg/m thực và thành tiền theo số server trả.");
    } catch (error) {
      const message = mapError(error).message;
      setPreviewError(message);
      if (showToast) toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }, [replaceRows, resolveChildLine, setPreviewError]);

  /* ---------------------------------------------------------------------- */
  /* Nạp một ĐƠN MUA — kéo về phần CÒN PHẢI NHẬN                             */
  /* ---------------------------------------------------------------------- */

  const loadPurchaseOrder = useCallback(async (orderName: string) => {
    const order = text(orderName);
    if (!order || !childMeta) return;
    if (orders.some((entry) => entry.order === order)) {
      toast.error(`Đơn mua ${order} đã có trên phiếu này.`);
      return;
    }
    setRefreshing(true);
    setPreviewError("");
    try {
      const warehouse = text(headerRef.current.warehouse);
      const [preview, orderResult] = await Promise.all([
        adapter.callPost<ReceiptFromOrderPreview>(PURCHASE_RECEIPT_METHODS.previewReceiptFromOrder, {
          purchase_order: order,
          ...(warehouse ? { warehouse } : {}),
        }),
        adapter.getDoc("Purchase Order", order),
      ]);
      const orderDoc = orderResult.doc as Json;
      const orderLines = asJsonArray(orderDoc.items);
      const remaining = asJsonArray(preview.items);

      const drafted: ReceiptLine[] = remaining.map((raw, index) => {
        const sourceIndex = orderLineIndexOf(text(raw.row_id));
        const source = sourceIndex !== undefined ? orderLines[sourceIndex] : undefined;
        const ordered = numberValue(source?.qty);
        const outstanding = numberValue(raw.qty);
        const line: ReceiptLine = {
          ...newReceiptLine(childMeta, rowsRef.current.length + index),
          ...raw,
          name: `order-row-${order}-${text(raw.row_id) || index}-${Math.random().toString(36).slice(2, 6)}`,
          doctype: childMeta.name,
          purchase_order: order,
          _sourceOrder: order,
        };
        if (ordered !== undefined) line._orderedQty = ordered;
        if (outstanding !== undefined) line._outstandingQty = outstanding;
        if (ordered !== undefined && outstanding !== undefined) line._receivedQty = ordered - outstanding;
        const orderedBars = numberValue(source?.qty_bar);
        if (orderedBars !== undefined) line._orderedBars = orderedBars;
        if (warehouse) line.warehouse = warehouse;
        /*
         * Số trên đơn là số ĐẶT; số vào kho phải là số ĐẾM ĐƯỢC. Nên hai trục số lượng bắt đầu
         * TRỐNG, thủ kho gõ số thật vào. Không mồi sẵn số đặt để tránh "ghi vào kho một con số
         * chưa ai nhìn thấy" (đúng lý do server chỉ tạo phiếu NHÁP).
         */
        line.qty_bar = undefined;
        line.actual_weight_kg = undefined;
        line.qty = undefined;
        return line;
      });

      const resolved = await Promise.all(drafted.map((line) => resolveChildLine(line, "item_code").catch((error) => ({
        ...line,
        _loading: false,
        _error: mapError(error).message,
      } as ReceiptLine))));

      replaceRows([...rowsRef.current, ...resolved]);
      setOrders((current) => [...current, {
        order,
        supplier: text(preview.supplier) || text(orderDoc.supplier),
        outstandingLines: resolved.length,
        message: text(preview.message),
      }]);
      markChanged(true);

      const nextHeader = { ...headerRef.current };
      if (!text(nextHeader.supplier)) nextHeader.supplier = text(preview.supplier) || text(orderDoc.supplier);
      if (!text(nextHeader.against_purchase_order)) nextHeader.against_purchase_order = order;
      if (!text(nextHeader.company)) nextHeader.company = text(orderDoc.company) || nextHeader.company;
      if (!text(nextHeader.currency)) nextHeader.currency = text(orderDoc.currency) || nextHeader.currency;
      setHeaderState(nextHeader);
      setOrderPick("");

      if (text(preview.message)) toast.error(text(preview.message));
      else toast.success(`Đã kéo ${resolved.length} dòng còn phải nhận từ ${order}.`);
    } catch (error) {
      const message = mapError(error).message;
      setPreviewError(message);
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }, [adapter, childMeta, markChanged, orders, replaceRows, resolveChildLine, setHeaderState, setPreviewError]);

  const removeOrder = useCallback((order: string) => {
    markChanged(true);
    setOrders((current) => current.filter((entry) => entry.order !== order));
    replaceRows(rowsRef.current.filter((line) => text(line._sourceOrder) !== order));
  }, [markChanged, replaceRows]);

  /* ---------------------------------------------------------------------- */
  /* Lệch cân + khoảng trống quy đổi                                         */
  /* ---------------------------------------------------------------------- */

  const variances = useMemo(() => {
    const map = new Map<string, WeightVarianceReading>();
    rows.forEach((line, index) => {
      if (!isCatchWeightReceiptLine(line)) return;
      map.set(receiptLineKey(line, index), readWeightVariance({
        baremKg: positiveNumber(line.theoretical_kg),
        lengthM: positiveNumber(line.length_m),
        bars: positiveNumber(line.qty_bar),
        kgPerM: positiveNumber(line.theoretical_kg_per_m),
        actualKg: positiveNumber(line.actual_weight_kg),
        tolerancePct: line._weightTolerancePct,
        toleranceKnown: Boolean(line._weightToleranceKnown),
      }));
    });
    return map;
  }, [rows]);

  const uomReport = useMemo(() => {
    const codes = new Set<string>();
    for (const line of rows) if (text(line.item_code)) codes.add(text(line.item_code));
    for (const line of fifoRows) if (text(line.item_code)) codes.add(text(line.item_code));
    const readings: UomConversionReading[] = [];
    for (const code of codes) {
      const intel = intelCache.current.get(code);
      if (intel) readings.push(intel.reading);
    }
    return mergeUomReadings(readings);
  }, [rows, fifoRows]);

  const deliveryTolerance = useMemo(() => readDeliveryTolerance({
    serverTolerancePct: insight?.tolerancePct,
    serverToleranceSource: insight?.toleranceSource,
    supplierTolerancePct: numberValue(supplierDoc?.receipt_tolerance_pct),
  }), [insight, supplierDoc]);

  /* ---------------------------------------------------------------------- */
  /* Nhôm FIFO — một dòng hoặc hàng loạt                                      */
  /* ---------------------------------------------------------------------- */

  const patchFifoRow = useCallback((key: string, patch: Partial<FifoInputLine>) => {
    setFifoRows((current) => current.map((line) => line.name === key ? { ...line, ...patch } : line));
    setDirty(true);
  }, []);

  const commitFifoRow = useCallback((key: string, fieldname: string) => {
    if (fieldname !== "item_code") return;
    setFifoRows((current) => current.map((line) => line.name === key ? { ...line, _error: "" } : line));
    const row = fifoRows.find((line) => line.name === key);
    const itemCode = text(row?.item_code);
    if (!itemCode) return;
    void loadIntel(itemCode).then(async (intel) => {
      const specName = text(intel.item.material_specification);
      const spec = specName
        ? await adapter.getDoc("Material Specification", specName).then((result) => result.doc as Json).catch(() => null)
        : null;
      const kgPerM = positiveNumber(spec?.theoretical_kg_per_m);
      const standardLength = positiveNumber(spec?.standard_length_m);
      /* 0% là ngưỡng khai THẬT, không phải "chưa khai" — xem `nonNegativeNumber` trong model.ts. */
      const tolerance = nonNegativeNumber(intel.profile?.weight_tolerance_pct);
      setFifoRows((current) => current.map((line) => {
        if (line.name !== key) return line;
        const next: FifoInputLine = { ...line, _itemName: text(intel.item.item_name) || itemCode };
        if (kgPerM !== undefined) next._kgPerM = kgPerM;
        if (standardLength !== undefined) {
          next._standardLengthM = standardLength;
          /* Chiều dài cây CHUẨN chỉ là gợi ý mặc định; người nhập vẫn sửa được vì mỗi cây một dài. */
          if (positiveNumber(line.length_m) === undefined) next.length_m = standardLength;
        }
        if (tolerance !== undefined) {
          next._weightTolerancePct = tolerance;
          next._weightToleranceKnown = true;
        }
        return next;
      }));
    }).catch((error) => {
      setFifoRows((current) => current.map((line) => line.name === key ? { ...line, _error: mapError(error).message } : line));
    });
  }, [adapter, fifoRows, loadIntel]);

  const addFifoRow = useCallback(() => {
    setFifoRows((current) => [...current, newFifoInputLine(current.length)]);
    setDirty(true);
  }, []);

  const removeFifoRow = useCallback((key: string) => {
    setFifoRows((current) => {
      const next = current.filter((line) => line.name !== key);
      return next.length ? next : [newFifoInputLine(0)];
    });
    setDirty(true);
  }, []);

  const fifoHeaderArgs = useCallback(() => ({
    supplier: text(headerRef.current.supplier),
    warehouse: text(headerRef.current.warehouse),
    supplierInvoiceNo: text(headerRef.current.supplier_invoice_no),
    driver: text(headerRef.current.driver),
    postingAt: text(headerRef.current.posting_at),
  }), []);

  const activeFifoRows = useMemo(() => fifoRows.filter((line) => text(line.item_code)), [fifoRows]);

  const runFifo = useCallback(async (create: boolean) => {
    const headerArgs = fifoHeaderArgs();
    if (!headerArgs.supplier) { toast.error("Cần chọn Nhà cung cấp."); return; }
    if (!headerArgs.warehouse) { toast.error("Cần chọn Kho nhập."); return; }
    const lines = fifoRows.filter((line) => text(line.item_code));
    if (!lines.length) { toast.error("Cần ít nhất một dòng nhôm nhận."); return; }
    const bulk = lines.length > 1;
    if (bulk && !headerArgs.supplierInvoiceNo) {
      toast.error("Nhận nhiều dòng trong một lần bắt buộc có Số phiếu giao NCC để chống tạo phiếu trùng.");
      return;
    }

    setFifoBusy(create ? "commit" : "preview");
    try {
      if (bulk) {
        const method = create ? PURCHASE_RECEIPT_METHODS.bulkFifoReceipt : PURCHASE_RECEIPT_METHODS.previewBulkFifoReceipt;
        const result = await adapter.callPost<BulkFifoReceiptResult>(method, fifoBulkArgs(lines, headerArgs));
        setInsight(insightFromBulk(result, create));
        toast.success(text(result.message) || (create ? "Đã tạo phiếu nhập nháp." : "Đã lấy phân bổ FIFO."));
      } else {
        const method = create ? PURCHASE_RECEIPT_METHODS.fifoReceipt : PURCHASE_RECEIPT_METHODS.previewFifoReceipt;
        const result = await adapter.callPost<FifoReceiptResult>(method, fifoSingleArgs(lines[0]!, headerArgs));
        setInsight(insightFromSingle(result, create));
        toast.success(text(result.message) || (create ? "Đã tạo phiếu nhập nháp." : "Đã lấy phân bổ FIFO."));
      }
      if (create) {
        setDirty(false);
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", RECEIPT_DOCTYPE], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: [scopeKey, "list", RECEIPT_DOCTYPE], refetchType: "active" }),
        ]).catch(() => undefined);
      }
    } catch (error) {
      /* Thông điệp server hiện NGUYÊN VĂN — 422 của FIFO là câu giải thích, không phải mã lỗi. */
      toast.error(mapError(error).message);
      setPreviewError(mapError(error).message);
    } finally {
      setFifoBusy("");
    }
  }, [adapter, fifoHeaderArgs, fifoRows, queryClient, scopeKey, setPreviewError]);

  const loadPayable = useCallback(async () => {
    const supplier = text(headerRef.current.supplier);
    if (!supplier) { toast.error("Cần chọn Nhà cung cấp trước."); return; }
    setPayable({ loading: true, error: "" });
    try {
      const result = await adapter.callPost<SupplierDeliveryDashboard>(
        PURCHASE_RECEIPT_METHODS.supplierDeliveryDashboard,
        { supplier },
      );
      const summary = result.summary ?? {};
      const next: SupplierPayableView = { loading: false, error: "" };
      const billing = result.billing ?? result.payable;
      if (billing) next.payable = billing;
      if (summary.remaining_bars !== undefined) next.remainingBars = summary.remaining_bars;
      if (summary.remaining_meters !== undefined) next.remainingMeters = summary.remaining_meters;
      if (summary.remaining_barem_weight_kg !== undefined) next.remainingBaremKg = summary.remaining_barem_weight_kg;
      if (summary.open_purchase_order_count !== undefined) next.openOrders = summary.open_purchase_order_count;
      if (summary.overdue_purchase_order_count !== undefined) next.overdueOrders = summary.overdue_purchase_order_count;
      if (text(result.generated_at)) next.generatedAt = text(result.generated_at);
      setPayable(next);
    } catch (error) {
      setPayable({ loading: false, error: mapError(error).message });
    }
  }, [adapter]);

  const runLandedCostPreview = useCallback(async () => {
    if (!workingName || docstatus !== 1) return;
    if (!positiveNumber(Number(landedCostTotal))) { setLandedCostError("Nhập tổng cước/thuế cần phân bổ (lớn hơn 0)."); return; }
    setLandedCostLoading(true);
    setLandedCostError("");
    try {
      const result = await adapter.callPost<Json>("metaforge.api.preview_landed_cost", {
        purchase_receipt: workingName,
        basis: landedCostBasis,
        total_cost: landedCostTotal,
      });
      setLandedCostPlan(result);
    } catch (error) {
      setLandedCostError(mapError(error).message);
      setLandedCostPlan(null);
    } finally {
      setLandedCostLoading(false);
    }
  }, [adapter, docstatus, landedCostBasis, landedCostTotal, workingName]);

  /* ---------------------------------------------------------------------- */
  /* Lưu / ghi sổ                                                            */
  /* ---------------------------------------------------------------------- */

  const activeRows = useMemo(() => rows.filter((row) => text(row.item_code)), [rows]);
  const totalAmount = useMemo(
    () => activeRows.reduce((sum, row) => sum + (numberValue(row.amount) ?? 0), 0),
    [activeRows],
  );
  const totalBars = useMemo(
    () => activeRows.reduce((sum, row) => sum + (numberValue(row.qty_bar) ?? 0), 0),
    [activeRows],
  );
  const totalActualKg = useMemo(
    () => activeRows.reduce((sum, row) => sum + (numberValue(row.actual_weight_kg) ?? 0), 0),
    [activeRows],
  );
  /**
   * Tổng SL quy về ĐVT tồn kho — cùng nghĩa với `Purchase Receipt.total_qty` server tính khi
   * lưu (brief `alumdoor-v2.json`). Tính lại phía client ở đây để thủ kho đối chiếu NGAY
   * trong lúc gõ, trước khi bấm lưu — con số cuối cùng vẫn do server chốt.
   */
  const totalQty = useMemo(
    () => activeRows.reduce((sum, row) => sum + (numberValue(row.stock_qty) ?? numberValue(row.qty) ?? 0), 0),
    [activeRows],
  );

  const validate = useCallback((): string | null => {
    if (previewClock.current.pending > 0) return "Phiếu đang tính lại dữ liệu từ server, hãy chờ hoàn tất trước khi lưu.";
    if (text(previewErrorRef.current)) return `Cần xử lý lỗi tính lại trước khi lưu: ${text(previewErrorRef.current)}`;
    if (!text(headerRef.current.supplier)) return "Cần chọn Nhà cung cấp.";
    if (!text(headerRef.current.posting_at)) return "Cần Thời điểm nhập.";
    if (!activeRows.length) return "Cần ít nhất một dòng hàng nhận.";
    if (uomReport.gaps.length) {
      return `Còn ${uomReport.gaps.length} mã hàng thiếu hệ số quy đổi: ${uomReport.gaps[0]!.message} ${uomReport.gaps[0]!.fix_at}`;
    }
    for (const [index, row] of activeRows.entries()) {
      const position = index + 1;
      if (row._loading) return `Dòng ${position} đang tính lại.`;
      if (text(row._error)) return `Dòng ${position}: ${text(row._error)}`;
      if (!text(row.warehouse)) return `Dòng ${position}: cần Kho nhập.`;
      if (numberValue(row.rate) === undefined) return `Dòng ${position}: cần Đơn giá.`;
      const key = receiptLineKey(row, rows.indexOf(row));
      const variance = variances.get(key);
      if (variance?.reasonRequired && !text(row._varianceReason)) {
        return `Dòng ${position}: ${variance.headline}`;
      }
      if (!isCatchWeightReceiptLine(row)) {
        if (positiveNumber(row.qty) === undefined) return `Dòng ${position}: Số lượng phải lớn hơn 0.`;
        continue;
      }
      const bars = positiveNumber(row.qty_bar);
      if (bars === undefined || !Number.isInteger(bars)) return `Dòng ${position}: Số cây/lá phải là số nguyên dương.`;
      if (positiveNumber(row.actual_weight_kg) === undefined) return `Dòng ${position}: phiếu nhập phải có Tổng kg thực cân.`;
      if (positiveNumber(row.length_m) === undefined) return `Dòng ${position}: cần Chiều dài một cây/lá.`;
      if (!["Có", "Không"].includes(text(row.is_stamped))) return `Dòng ${position}: phải chọn Dập Có hoặc Không.`;
    }
    return null;
  }, [activeRows, rows, uomReport, variances]);

  /** Nguyên nhân chênh lệch gấp vào Ghi chú dòng — `Purchase Receipt Item` chưa có trường riêng. */
  const withVarianceNote = useCallback((line: ReceiptLine): ReceiptLine => {
    const reason = text(line._varianceReason);
    if (!reason) return line;
    const token = `Nguyên nhân chênh lệch: ${reason}`;
    const base = text(line.note);
    if (base.includes(token)) return line;
    return { ...line, note: base ? `${base} · ${token}` : token };
  }, []);

  const adoptSaved = useCallback(async (doc: Doc) => {
    const saved = doc as Json;
    const savedName = text(saved.name) || workingName;
    if (savedName) setWorkingName(savedName);
    setSourceModified(text(saved.modified));
    setDocstatus(Number(saved.docstatus) || 0);
    setHeaderState({ ...headerRef.current, ...saved, items: undefined });
    const savedRows = asJsonArray(saved.items) as ReceiptLine[];
    if (savedRows.length) replaceRows(await Promise.all(savedRows.map((row) => hydrateLine(row))));
    setDirty(false);
    if (savedName) {
      void adapter.getCapabilities(RECEIPT_DOCTYPE, savedName).then((caps) => {
        setCanWrite(Boolean(caps.write));
        setSubmitAllowed(Boolean(caps.submit));
      }).catch(() => undefined);
    }
  }, [adapter, hydrateLine, replaceRows, setHeaderState, workingName]);

  const invalidateReceiptQueries = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", RECEIPT_DOCTYPE], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "list", RECEIPT_DOCTYPE], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "count", RECEIPT_DOCTYPE], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "overview"], refetchType: "none" }),
    ]).catch(() => undefined);
  }, [queryClient, scopeKey]);

  const save = useCallback(async (submitAfterSave: boolean) => {
    if (!meta || !childMeta || formReadOnly) return;
    const problem = validate();
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    const saveRevision = markChanged(false);
    try {
      const resolved = await Promise.all(rowsRef.current.map((row) => text(row.item_code) ? resolveChildLine(row, "__save__") : row));
      if (!canApplyPurchaseOrderPreview(previewClock.current, saveRevision)) {
        throw new Error("Dữ liệu đã thay đổi trong lúc chuẩn bị lưu. Hãy lưu lại lần nữa.");
      }
      /* Giữ lại nguyên nhân chênh lệch người dùng đã chọn — preview không trả nó về. */
      const merged = resolved.map((row, index) => {
        const original = rowsRef.current[index];
        const reason = text(original?._varianceReason);
        return reason ? { ...row, _varianceReason: reason } : row;
      });
      replaceRows(merged);

      const document: Json = {};
      for (const field of meta.fields ?? []) {
        if (field.fieldname === "items") continue;
        const value = fieldValueForServer(field.fieldtype, headerRef.current[field.fieldname]);
        if (value !== undefined) document[field.fieldname] = value;
      }
      document.items = merged
        .filter((row) => text(row.item_code))
        .map((row) => cleanReceiptLine(withVarianceNote(row), childMeta, isExisting));

      const payload = serializeCreateDocument(meta, document) as Partial<Doc>;
      const existingName = workingName;
      const saved = existingName
        ? await adapter.updateDoc(RECEIPT_DOCTYPE, existingName, payload, sourceModified)
        : await adapter.createDoc(RECEIPT_DOCTYPE, payload);
      const savedName = text(saved.name) || existingName;

      await adoptSaved(saved);
      invalidateReceiptQueries();

      if (submitAfterSave) {
        try {
          const submitted = await adapter.submit(saved);
          await adoptSaved(submitted);
          invalidateReceiptQueries();
          toast.success(`Đã ghi sổ phiếu nhập ${savedName} — tồn kho đã tăng.`);
        } catch (submitError) {
          toast.error(`Đã lưu nháp ${savedName}, nhưng chưa ghi sổ được: ${mapError(submitError).message}`);
          if (existingName) props.onSaved?.(savedName); else props.onCreated(savedName);
          return;
        }
      } else {
        toast.success(existingName ? `Đã lưu phiếu nhập ${savedName}` : `Đã lưu nháp phiếu nhập ${savedName}`);
      }
      if (existingName) props.onSaved?.(savedName); else props.onCreated(savedName);
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSaving(false);
    }
  }, [adapter, adoptSaved, childMeta, formReadOnly, invalidateReceiptQueries, isExisting, markChanged, meta, props, replaceRows, resolveChildLine, sourceModified, validate, withVarianceNote, workingName]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Đang mở màn nhập hàng FIFO…</span>
      </div>
    );
  }
  if (fatal) return <div className="p-6 text-sm text-destructive">{fatal}</div>;
  if (!meta || !childMeta) return <div className="p-6 text-sm text-muted-foreground">Không đọc được cấu trúc Purchase Receipt.</div>;

  const metaField = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string): DocField =>
    meta.fields.find((field) => field.fieldname === fieldname) ?? fallbackField(fieldname, label, fieldtype, options);

  const headerControl = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string) => {
    const field = metaField(fieldname, label, fieldtype, options);
    return (
      <AlumdoorSalesOrderField
        id={`purchase-receipt-header-${fieldname}`}
        field={field}
        value={header[fieldname]}
        onChange={(value) => {
          markChanged(true);
          setHeaderState({ ...headerRef.current, [fieldname]: fieldValueForServer(field.fieldtype, value) });
          setPreviewError("");
        }}
        registry={registry}
        services={receiptServices}
        parentDoctype={RECEIPT_DOCTYPE}
        docValues={header}
        roles={roles}
        label={label}
        required={Boolean(field.reqd)}
        readOnly={formReadOnly || interactionBusy || Boolean(field.read_only)}
        compact
        className="[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_button]:!h-8"
      />
    );
  };

  const fifoField = (
    line: FifoInputLine,
    fieldname: string,
    label: string,
    fieldtype: DocField["fieldtype"] = "Data",
    options?: string,
  ) => (
    <AlumdoorSalesOrderField
      id={`purchase-receipt-fifo-${line.name}-${fieldname}`}
      field={childMeta.fields.find((field) => field.fieldname === fieldname) ?? fallbackField(fieldname, label, fieldtype, options)}
      value={line[fieldname]}
      onChange={(value) => patchFifoRow(line.name, { [fieldname]: value } as Partial<FifoInputLine>)}
      onCommit={() => commitFifoRow(line.name, fieldname)}
      registry={registry}
      services={receiptServices}
      parentDoctype={RECEIPT_DOCTYPE}
      docValues={line}
      roles={roles}
      label={label}
      hideLabel
      compact
      readOnly={formReadOnly || interactionBusy}
      className="min-w-[110px] [&_.mf-control]:!min-h-7 [&_input]:!h-7 [&_button]:!h-7"
    />
  );

  const saveDisabled = interactionBusy || formReadOnly || previewBlocked || !activeRows.length
    || rows.some((row) => row._loading || text(row._error));
  const stampedOptions = selectOptions(childMeta, "is_stamped", ["Có", "Không"]).join("\n");

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-purchase-receipt-fifo">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="w-full space-y-3 px-3 py-3">
          {formReadOnly ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
              Phiếu đã ghi sổ/khóa hoặc tài khoản không có quyền sửa.
            </div>
          ) : null}

          <section className="rounded-lg border bg-card p-2.5" data-section="purchase-receipt-header">
            <div className="grid gap-x-2 gap-y-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.2fr)_minmax(200px,1fr)_minmax(190px,0.9fr)_minmax(180px,0.85fr)_minmax(160px,0.8fr)]">
              {headerControl("supplier", "Nhà cung cấp", "Link", "Supplier")}
              {headerControl("warehouse", "Kho nhập (áp cho dòng mới)", "Link", "Warehouse")}
              {headerControl("posting_at", "Thời điểm nhập", "Datetime")}
              {headerControl("supplier_invoice_no", "Số phiếu giao NCC", "Data")}
              {headerControl("driver", "Người giao", "Data")}
            </div>
            <div className="mt-2 grid gap-x-2 gap-y-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(300px,1.4fr)]">
              {headerControl("goods_photo", "Ảnh hàng nhận", "Attach Image")}
              {headerControl("supplier_note_photo", "Ảnh phiếu giao NCC", "Attach Image")}
              {headerControl("note", "Ghi chú", "Small Text")}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[10px] text-muted-foreground">
              <span>Công ty: <strong className="font-medium text-foreground">{text(header.company) || "—"}</strong></span>
              <span>Tiền tệ: <strong className="font-medium text-foreground">{text(header.currency) || "VND"}</strong></span>
              <DeliveryToleranceNote reading={deliveryTolerance} />
            </div>
          </section>

          <UomGapPanel gaps={uomReport.gaps} lawful={uomReport.lawful} />

          <Tabs value={tab} onValueChange={(value) => setTab(value === "fifo" ? "fifo" : "order")}>
            <TabsList>
              <TabsTrigger value="order">Nhận theo đơn mua</TabsTrigger>
              <TabsTrigger value="fifo">Nhập nhôm FIFO {activeFifoRows.length ? `(${activeFifoRows.length} dòng)` : ""}</TabsTrigger>
            </TabsList>

            <TabsContent value="order" className="space-y-3">
              <section className="rounded-lg border bg-card p-2.5" data-section="purchase-receipt-order-intake">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[260px] flex-1">
                    <AlumdoorSalesOrderField
                      id="purchase-receipt-order-pick"
                      field={fallbackField(
                        "purchase_order_pick",
                        "Nạp đơn mua đã ghi sổ",
                        "Link",
                        "Purchase Order",
                      )}
                      value={orderPick}
                      onChange={setOrderPick}
                      registry={registry}
                      services={receiptServices}
                      parentDoctype={RECEIPT_DOCTYPE}
                      docValues={header}
                      roles={roles}
                      label="Nạp đơn mua đã ghi sổ"
                      compact
                      readOnly={formReadOnly || interactionBusy}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={formReadOnly || interactionBusy || !text(orderPick)}
                    onClick={() => void loadPurchaseOrder(text(orderPick))}
                  >
                    {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />} Kéo phần còn phải nhận
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    Nạp được NHIỀU đơn vào cùng một phiếu — một chuyến xe của NCC có thể chở hàng của hai đơn.
                  </span>
                </div>
                {orders.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {orders.map((entry) => (
                      <li key={entry.order} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-[11px]">
                        <strong>{entry.order}</strong>
                        <span className="text-muted-foreground">{entry.outstandingLines} dòng còn phải nhận</span>
                        {entry.message ? <span className="text-destructive">{entry.message}</span> : null}
                        <Button type="button" size="sm" variant="ghost" className="h-5 px-1" disabled={formReadOnly || interactionBusy} onClick={() => removeOrder(entry.order)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <ReceiptLinesTable
                lines={rows}
                childMeta={childMeta}
                registry={registry}
                services={receiptServices}
                roles={roles}
                readOnly={formReadOnly || interactionBusy}
                variances={variances}
                onPatch={patchLineFromUser}
                onCommit={commitLine}
                onDelete={deleteLine}
                onAdd={addLine}
              />

              <section className="rounded-lg border bg-card" data-section="purchase-receipt-summary">
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-5">
                  <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Dòng hàng</div><div className="mt-0.5 font-semibold tabular-nums">{activeRows.length}</div></div>
                  <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Tổng SL (ĐVT tồn)</div><div className="mt-0.5 font-semibold tabular-nums">{quantity(totalQty)}</div></div>
                  <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Cây/lá thực đếm</div><div className="mt-0.5 font-semibold tabular-nums">{quantity(totalBars, 0)}</div></div>
                  <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Kg thực cân</div><div className="mt-0.5 font-semibold tabular-nums">{quantity(totalActualKg)} kg</div></div>
                  <div className="bg-card px-3 py-2"><div className="text-[10px] font-semibold text-muted-foreground">Tạm tính</div><div className="mt-0.5 text-lg font-bold tabular-nums text-primary">{money(totalAmount)} ₫</div></div>
                </div>
                <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
                  Tạm tính là TỔNG các thành tiền do server trả về từng dòng; server tính lại toàn bộ khi lưu và khi ghi sổ.
                </div>
              </section>
            </TabsContent>

            <TabsContent value="fifo" className="space-y-3">
              <section className="rounded-lg border bg-card" data-section="purchase-receipt-fifo-input">
                <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs font-semibold">
                  <span>Nhôm nhận — server phân bổ FIFO vào các đơn mua đã ghi sổ</span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    Nhiều dòng trong một lần sẽ đi route hàng loạt và trả kết quả theo TỪNG ĐƠN.
                  </span>
                  <Button type="button" size="sm" variant="outline" className="ml-auto h-7" disabled={formReadOnly || interactionBusy} onClick={addFifoRow}>
                    <Plus className="size-3.5" /> Thêm dòng
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table unwrapped className="w-full border-collapse">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">#</th>
                        <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Mã hàng</th>
                        <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Dài cây (m)</th>
                        <th className="bg-primary/5 px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">SL cây/lá</th>
                        <th className="bg-primary/5 px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Kg thực cân</th>
                        <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Kg barem</th>
                        <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Lệch cân</th>
                        <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Màu</th>
                        <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Dập</th>
                        <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Đơn giá /kg</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {fifoRows.map((line, index) => {
                        const bars = positiveNumber(line.qty_bar);
                        const lengthM = positiveNumber(line.length_m);
                        const reading = readWeightVariance({
                          lengthM,
                          bars,
                          kgPerM: line._kgPerM,
                          actualKg: positiveNumber(line.actual_weight_kg),
                          tolerancePct: line._weightTolerancePct,
                          toleranceKnown: Boolean(line._weightToleranceKnown),
                        });
                        return (
                          <tr key={line.name} className="align-top hover:bg-muted/20">
                            <td className="px-2 py-1 text-[11px] tabular-nums">{index + 1}</td>
                            <td className="px-1.5 py-1">
                              {fifoField(line, "item_code", "Mã hàng", "Link", "Item")}
                              {text(line._itemName) ? <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{text(line._itemName)}</div> : null}
                              {text(line._error) ? <div className="mt-0.5 text-[10px] text-destructive">{text(line._error)}</div> : null}
                            </td>
                            <td className="px-1.5 py-1">{fifoField(line, "length_m", "Dài cây (m)", "Float")}</td>
                            <td className="bg-primary/5 px-1.5 py-1">{fifoField(line, "qty_bar", "SL cây/lá", "Float")}</td>
                            <td className="bg-primary/5 px-1.5 py-1">{fifoField(line, "actual_weight_kg", "Kg thực cân", "Float")}</td>
                            <td className="px-2 py-1 text-[11px] tabular-nums">{quantity(reading.baremKg)}</td>
                            <td className="px-2 py-1 text-[11px]">
                              {reading.measurable
                                ? <span className={reading.overTolerance ? "font-semibold text-destructive" : ""}>{reading.variancePct}% / {reading.tolerancePct}%</span>
                                : <span className="text-[10px] text-muted-foreground">—</span>}
                            </td>
                            <td className="px-1.5 py-1">{fifoField(line, "color", "Màu", "Link", "Item Color")}</td>
                            <td className="px-1.5 py-1">{fifoField(line, "is_stamped", "Dập", "Select", stampedOptions)}</td>
                            <td className="px-1.5 py-1">{fifoField(line, "rate", "Đơn giá /kg", "Currency")}</td>
                            <td className="px-1.5 py-1">
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5" disabled={formReadOnly || interactionBusy} onClick={() => removeFifoRow(line.name)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                  <Button type="button" size="sm" variant="outline" disabled={formReadOnly || interactionBusy || !activeFifoRows.length} onClick={() => void runFifo(false)}>
                    {fifoBusy === "preview" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Xem phân bổ FIFO
                  </Button>
                  <Button type="button" size="sm" disabled={formReadOnly || interactionBusy || !insight} onClick={() => void runFifo(true)}>
                    {fifoBusy === "commit" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Tạo phiếu nhập FIFO (nháp)
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={interactionBusy || !text(header.supplier)} onClick={() => void loadPayable()}>
                    Đọc công nợ NCC
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    Phiếu tạo ra là NHÁP — tồn kho chỉ tăng khi thủ kho kiểm và ghi sổ.
                  </span>
                </div>
              </section>

              {insight?.createdReceipt ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
                  <CheckCircle2 className="size-4 text-primary" />
                  <span>Đã tạo phiếu nhập nháp <strong>{insight.createdReceipt}</strong>{insight.replayed ? " (yêu cầu này đã chạy trước đó, không tạo phiếu trùng)" : ""}.</span>
                  <Button type="button" size="sm" variant="outline" className="ml-auto h-7" onClick={() => props.onCreated(insight.createdReceipt!)}>
                    <ExternalLink className="size-3.5" /> Mở phiếu
                  </Button>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>

          {insight ? (
            <div className="space-y-3">
              {insight.message ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px]">{insight.message}</div>
              ) : null}
              <FifoLayersPanel insight={insight} />
              <FifoOrderBalancePanel insight={insight} />
              <FifoDebtPanel insight={insight} payable={payable} />
              <FifoHistoryPanel insight={insight} />
            </div>
          ) : null}

          {docstatus === 1 ? (
            <section className="rounded-lg border bg-card" data-section="purchase-receipt-landed-cost">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs font-semibold">
                <span>Phân bổ cước/thuế nhập</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  Chỉ tính và hiện bảng phân bổ — KHÔNG tự ghi vào giá vốn tồn kho hay sổ cái.
                </span>
                <Button type="button" size="sm" variant="outline" className="ml-auto h-7" onClick={() => setLandedCostOpen((current) => !current)}>
                  {landedCostOpen ? "Ẩn" : "Tính phân bổ"}
                </Button>
              </div>
              {landedCostOpen ? (
                <div className="space-y-2 px-3 py-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-[11px]">
                      <span className="text-muted-foreground">Tổng cước/thuế (VNĐ)</span>
                      <input
                        type="number"
                        min="0"
                        value={landedCostTotal}
                        onChange={(event) => setLandedCostTotal(event.target.value)}
                        className="h-8 w-40 rounded-md border bg-background px-2 text-[11px]"
                        placeholder="vd: 1500000"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px]">
                      <span className="text-muted-foreground">Cơ sở phân bổ</span>
                      <select
                        value={landedCostBasis}
                        onChange={(event) => setLandedCostBasis(event.target.value as typeof landedCostBasis)}
                        className="h-8 w-48 rounded-md border bg-background px-2 text-[11px]"
                      >
                        <option value="amount">Theo tiền hàng của dòng</option>
                        <option value="quantity">Theo số lượng (ĐVT tồn)</option>
                        <option value="weight">Theo kg thực cân</option>
                      </select>
                    </label>
                    <Button type="button" size="sm" disabled={landedCostLoading} onClick={() => void runLandedCostPreview()}>
                      {landedCostLoading ? <Loader2 className="size-3.5 animate-spin" /> : null} Tính
                    </Button>
                  </div>
                  {landedCostError ? <div className="text-[11px] text-destructive">{landedCostError}</div> : null}
                  {landedCostPlan && Array.isArray(landedCostPlan.allocations) ? (
                    <div className="overflow-x-auto">
                      <Table unwrapped className="w-full border-collapse">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase text-muted-foreground">Dòng</th>
                            <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase text-muted-foreground">Mã hàng</th>
                            <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase text-muted-foreground">Kho</th>
                            <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase text-muted-foreground">Cơ sở</th>
                            <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase text-muted-foreground">Cước/thuế phân bổ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(landedCostPlan.allocations as Json[]).map((row, index) => {
                            const scale = numberValue(landedCostPlan.currency_scale) ?? 0;
                            const allocatedMajor = (numberValue(row.allocated_cost_minor) ?? 0) / (10 ** scale);
                            const basisUnits = numberValue(row.basis_units) ?? 0;
                            const basisDisplay = text(landedCostPlan.basis) === "amount"
                              ? `${money(basisUnits / (10 ** scale))} ${text(landedCostPlan.currency)}`
                              : `${quantity(basisUnits / 1_000_000)} ${text(landedCostPlan.basis) === "weight" ? "kg" : "ĐVT tồn"}`;
                            return (
                              <tr key={String(row.line_key ?? index)}>
                                <td className="px-2 py-1 text-[11px]">{text(row.row_id)}</td>
                                <td className="px-2 py-1 text-[11px]">{text(row.item_code)}</td>
                                <td className="px-2 py-1 text-[11px]">{text(row.warehouse)}</td>
                                <td className="px-2 py-1 text-right text-[11px] tabular-nums">{basisDisplay}</td>
                                <td className="px-2 py-1 text-right text-[11px] font-semibold tabular-nums">{money(allocatedMajor)} ₫</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                      <p className="px-2 py-2 text-[10px] leading-relaxed text-muted-foreground">
                        Dùng bảng này để đối chiếu / nhập tay vào phiếu điều chỉnh giá vốn khi cần — hệ thống
                        chưa tự ghi số này vào giá trị tồn kho hay bút toán sổ cái.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t bg-card px-3 py-1.5 shadow-[0_-4px_14px_rgba(0,0,0,0.035)]">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {docstatus === 1 ? "Đã ghi sổ" : isExisting ? (dirty ? "Nháp có thay đổi chưa lưu" : "Nháp đã đồng bộ") : activeRows.length ? "Phiếu nhập chưa lưu" : "Nạp đơn mua hoặc thêm dòng để bắt đầu"}
            </span>
            <strong className="tabular-nums">Tạm tính: {money(totalAmount)} ₫</strong>
            {uomReport.gaps.length ? (
              <Badge variant="outline" className="gap-1 border-destructive/50 text-[10px] text-destructive">
                <AlertTriangle className="size-3" /> {uomReport.gaps.length} mã thiếu hệ số quy đổi
              </Badge>
            ) : null}
            {previewPending > 0 ? <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> Đang tính lại ({previewPending})</span> : null}
            {text(previewError) ? <span className="text-destructive">{previewError}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={requestClose}>{isExisting ? "Đóng" : "Hủy"}</Button>
            <Button type="button" variant="outline" size="sm" disabled={interactionBusy || previewPending > 0 || !activeRows.length} onClick={() => void refreshAll(true)}>
              {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Tính lại
            </Button>
            {docstatus === 0 ? (
              <Button type="button" variant="outline" size="sm" disabled={saveDisabled} onClick={() => void save(false)}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Lưu nháp
              </Button>
            ) : null}
            {docstatus === 0 && submitAllowed ? (
              <Button type="button" size="sm" disabled={saveDisabled} onClick={() => void save(true)}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Ghi sổ phiếu nhập
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
