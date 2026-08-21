/** @jsxImportSource react */
/**
 * PHIẾU XUẤT KHO GIAO KHÁCH — workbench tác nghiệp (Delivery Note).
 *
 * Ownership (skill `forge-ui-change-routing` §4.8): đây là "hard-coded operational experience".
 * Client CHỈ điều phối + trình bày. Mọi thẩm quyền tồn / FIFO / tiến độ giao / workflow nằm ở
 * server và được gọi qua đúng các method đã có:
 *
 *   alumdoor.sales.preview_delivery       (sales_order, warehouse)                     → phần còn phải giao của 1 đơn
 *   alumdoor.sales.delivery_from_order    (sales_order, warehouse, install_*, driver…) → phiếu nháp theo 1 đơn
 *   alumdoor.sales.preview_bulk_delivery  (customer, sales_orders[], warehouse, …)     → đã đặt/đã giao/còn lại + FIFO
 *   alumdoor.sales.bulk_delivery          (như trên)                                   → 1 phiếu gộp nhiều đơn, có chống trùng
 *   alumdoor.delivery_batch.preview/.create (delivery_date, warehouse, sales_orders[]) → mẻ giao theo ngày
 *   alumdoor.sales.item_context           (item_code, uom, warehouse, qty)             → tồn theo từng trục + thiếu hàng
 *   alumdoor.ui.preview_document          (doctype, doc, changed_field)                → chuẩn hoá chứng từ trước khi in
 *   alumdoor.reserve.create/.release                                                   → giữ chỗ tồn
 *
 * Bài học chi phối (docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md §2): luật đã chạy đủ
 * ở server nhưng kết quả không tới người dùng là loại hỏng tệ nhất. Vì vậy màn này KHÔNG bao giờ
 * rút gọn thông điệp server thành "có lỗi xảy ra", và luôn nói ra "sửa ở đâu".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  Loader2,
  Package,
  RefreshCw,
  Save,
  Send,
  Truck,
} from "lucide-react";
import {
  applyContextPolicy,
  serializeCreateDocument,
  type Doc,
  type DocField,
  type DocTypeMeta,
  type Filters,
} from "@metaforge/core";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
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
  toast,
} from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";
import { AlumdoorSalesOrderField, fallbackField } from "../sales-order-v2/AlumdoorSalesOrderField.js";
import {
  beginSalesOrderDocumentPreview as beginPreview,
  canApplySalesOrderDocumentPreview as canApplyPreview,
  createSalesOrderPreviewClock as createPreviewClock,
  finishSalesOrderDocumentPreview as finishPreview,
  markSalesOrderDocumentChanged as markChanged,
} from "../sales-order-v2/preview-coordinator.js";
import { AlumdoorDeliveryNoteLineTable, type DeliveryReservationDraft } from "./AlumdoorDeliveryNoteLineTable.js";
import {
  anyLineEdited,
  blankFromMeta,
  deliveryErrorMessage,
  deliveryErrorUomGap,
  hydrateDeliveryLines,
  isoDateOnly,
  lineBlocked,
  lineSourceKey,
  nowLocalDatetime,
  numberValue,
  quantity,
  text,
  type AlumdoorDeliveryNoteCreateProps,
  type DeliveryBatchResult,
  type DeliveryBatchRow,
  type DeliveryInventoryPreview,
  type DeliveryItemContext,
  type DeliveryLine,
  type DeliveryOutstanding,
  type DeliverySourceDocument,
  type Json,
  type PrintDocument,
  type ReservationRow,
} from "./model.js";

interface DeliveryCaps {
  read?: boolean;
  write?: boolean;
  create?: boolean;
  submit?: boolean;
  cancel?: boolean;
}

const RESERVATION_FIELDS = [
  "name", "item_code", "color", "warehouse", "min_length_m", "qty_reserved",
  "source_doctype", "source_name", "expires_at", "state",
] as const;

/**
 * `Item Default` (kho mặc định theo công ty) là DocType `child: true` nhưng brief v2 KHÔNG có
 * doctype nào khai `Table(Item Default)`, nên hiện tại không có đường đi Item → kho mặc định.
 * Hàm này vẫn đọc đúng chỗ chuẩn (`Item.item_defaults`) để ngày brief nối lại thì màn tự ăn,
 * và trả rỗng — chứ không đoán một kho nào đó — khi chưa có.
 */
const itemDefaultWarehouseCache = new Map<string, string>();

export function AlumdoorDeliveryNoteWorkbench(props: AlumdoorDeliveryNoteCreateProps) {
  const { adapter, scopeKey, businessContext, contextPolicies, registry, services, roles } = useMetaForge();
  const queryClient = useQueryClient();

  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [childMeta, setChildMeta] = useState<DocTypeMeta | null>(null);
  const [header, setHeader] = useState<Json>({});
  const headerRef = useRef<Json>({});
  const [lines, setLines] = useState<DeliveryLine[]>([]);
  const linesRef = useRef<DeliveryLine[]>([]);
  const [defaultWarehouse, setDefaultWarehouse] = useState("");
  const [sourceDocuments, setSourceDocuments] = useState<DeliverySourceDocument[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [inventoryPreview, setInventoryPreview] = useState<DeliveryInventoryPreview | null>(null);
  const [planMessage, setPlanMessage] = useState("");
  const [planError, setPlanError] = useState("");
  const [previewNote, setPreviewNote] = useState("");
  const [batchDate, setBatchDate] = useState(() => isoDateOnly(new Date().toISOString()));
  const [batchRows, setBatchRows] = useState<DeliveryBatchRow[]>([]);
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set());
  const [batchResults, setBatchResults] = useState<DeliveryBatchResult[]>([]);
  const [printDocuments, setPrintDocuments] = useState<PrintDocument[]>([]);
  const [caps, setCaps] = useState<DeliveryCaps>({});
  const [docstatus, setDocstatus] = useState(0);
  const [savedName, setSavedName] = useState("");
  const [sourceModified, setSourceModified] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [fatal, setFatal] = useState("");
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const closeSeen = useRef(props.closeRequest ?? 0);
  const previewClock = useRef(createPreviewClock());
  const lineSeq = useRef(new Map<string, number>());

  const documentName = text(props.name);
  const isExisting = Boolean(documentName);
  const multiOrder = selectedOrders.length > 1;
  const formReadOnly = isExisting ? (!caps.write || docstatus !== 0) : !caps.create;

  const setHeaderState = useCallback((next: Json) => {
    headerRef.current = next;
    setHeader(next);
  }, []);

  const replaceLines = useCallback((next: DeliveryLine[], markDirtyFlag = false) => {
    linesRef.current = next;
    setLines(next);
    if (markDirtyFlag) setDirty(true);
  }, []);

  const patchLine = useCallback((key: string, patch: Partial<DeliveryLine>): DeliveryLine[] => {
    const next = linesRef.current.map((line) => line._key === key ? { ...line, ...patch } : line);
    replaceLines(next);
    return next;
  }, [replaceLines]);

  const childFieldSet = useMemo(
    () => new Set((childMeta?.fields ?? []).map((field) => field.fieldname).filter(Boolean)),
    [childMeta],
  );

  /** Chỉ giữ field THẬT của `Delivery Note Item`; mọi khoá `_` và field server phụ trợ bị bỏ. */
  const cleanLine = useCallback((line: DeliveryLine): Json => {
    const result: Json = {};
    for (const [key, value] of Object.entries(line)) {
      if (key.startsWith("_") || value === undefined || value === "") continue;
      if (childFieldSet.has(key) || (isExisting && (key === "name" || key === "doctype"))) result[key] = value;
    }
    return result;
  }, [childFieldSet, isExisting]);

  // ── Nạp metadata + chứng từ hiện có ───────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const noteMeta = await adapter.getMeta("Delivery Note");
        const table = noteMeta.fields.find((field) => field.fieldname === "items" && field.fieldtype === "Table");
        const childDoctype = text(table?.options) || "Delivery Note Item";
        const [itemMeta, boot, capabilities, existing] = await Promise.all([
          adapter.getMeta(childDoctype),
          adapter.getBoot(),
          adapter.getCapabilities("Delivery Note", documentName || undefined),
          documentName ? adapter.getDoc("Delivery Note", documentName) : Promise.resolve(null),
        ]);
        if (!active) return;
        const defaults: Json = {
          ...blankFromMeta(noteMeta),
          ...applyContextPolicy("Delivery Note", businessContext, contextPolicies).defaults,
        };
        if (!text(defaults.posting_at)) defaults.posting_at = nowLocalDatetime();
        if (!text(defaults.currency)) defaults.currency = boot.sysdefaults.currency || "VND";
        const existingDoc = existing?.doc as Json | undefined;
        const initialHeader = existingDoc ? { ...defaults, ...existingDoc, items: undefined } : defaults;
        const existingItems = Array.isArray(existingDoc?.items) ? existingDoc.items as Json[] : [];

        setMeta(noteMeta);
        setChildMeta(itemMeta);
        setCaps(capabilities as DeliveryCaps);
        setDocstatus(Number(existingDoc?.docstatus) || 0);
        setSavedName(text(existingDoc?.name) || documentName);
        setSourceModified(text(existingDoc?.modified));
        setHeaderState(initialHeader);
        const order = text(existingDoc?.against_sales_order);
        if (order) setSelectedOrders([order]);
        replaceLines(hydrateDeliveryLines(existingItems, order));
        setDirty(false);
      } catch (error) {
        if (active) setFatal(deliveryErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, businessContext, contextPolicies, documentName, loadAttempt, replaceLines, setHeaderState]);

  // ── Kho mặc định của từng dòng ────────────────────────────────────────────────────────────
  const itemDefaultWarehouse = useCallback(async (itemCode: string, company: string): Promise<string> => {
    const cacheKey = `${itemCode}\u0000${company}`;
    const cached = itemDefaultWarehouseCache.get(cacheKey);
    if (cached !== undefined) return cached;
    let resolved = "";
    try {
      const { doc } = await adapter.getDoc("Item", itemCode);
      const defaults = (doc as Json).item_defaults;
      if (Array.isArray(defaults)) {
        const rows = defaults.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row));
        const match = rows.find((row) => !company || text(row.company) === company) ?? rows[0];
        resolved = text(match?.default_warehouse);
      }
    } catch {
      // Không đọc được Item thì không đoán kho: dòng sẽ tự nói "chưa có Kho xuất".
    }
    itemDefaultWarehouseCache.set(cacheKey, resolved);
    return resolved;
  }, [adapter]);

  const applyWarehouseDefaults = useCallback(async (source: DeliveryLine[]): Promise<DeliveryLine[]> => {
    const company = text(headerRef.current.company);
    const fallbackWarehouse = text(defaultWarehouse);
    return Promise.all(source.map(async (line) => {
      if (text(line.warehouse)) return line;
      const fromItem = text(line.item_code) ? await itemDefaultWarehouse(text(line.item_code), company) : "";
      if (fromItem) return { ...line, warehouse: fromItem, _warehouseSource: "Item Default" };
      if (fallbackWarehouse) return { ...line, warehouse: fallbackWarehouse, _warehouseSource: "Kho mặc định của phiếu" };
      return line;
    }));
  }, [defaultWarehouse, itemDefaultWarehouse]);

  // ── Tồn theo từng trục cho từng dòng ──────────────────────────────────────────────────────
  const refreshLineContext = useCallback(async (line: DeliveryLine) => {
    const itemCode = text(line.item_code);
    if (!itemCode) return;
    const seq = (lineSeq.current.get(line._key) ?? 0) + 1;
    lineSeq.current.set(line._key, seq);
    patchLine(line._key, { _loading: true, _contextError: "", _contextGap: null });
    try {
      const context = await adapter.callPost<DeliveryItemContext>("alumdoor.sales.item_context", {
        item_code: itemCode,
        uom: text(line.uom) || undefined,
        warehouse: text(line.warehouse) || undefined,
        qty: numberValue(line.qty),
        currency: text(headerRef.current.currency) || "VND",
        include_color_scope: 0,
      });
      if (lineSeq.current.get(line._key) !== seq) return;
      patchLine(line._key, { _context: context, _loading: false, _contextError: "", _contextGap: null });
    } catch (error) {
      if (lineSeq.current.get(line._key) !== seq) return;
      // 422 của worker mang cả lý do lẫn chỗ sửa; nuốt nó là đúng kiểu hỏng mà audit đang chống.
      patchLine(line._key, {
        _loading: false,
        _context: undefined,
        _contextError: deliveryErrorMessage(error),
        _contextGap: deliveryErrorUomGap(error),
      });
    }
  }, [adapter, patchLine]);

  const refreshAllLineContexts = useCallback(async () => {
    await Promise.all(linesRef.current.filter((line) => text(line.item_code)).map((line) => refreshLineContext(line)));
  }, [refreshLineContext]);

  const refreshReservations = useCallback(async () => {
    const codes = [...new Set(linesRef.current.map((line) => text(line.item_code)).filter(Boolean))];
    if (!codes.length) return;
    try {
      const rows = await adapter.getList("Stock Reservation", {
        fields: [...RESERVATION_FIELDS],
        filters: [["state", "=", "Đang giữ"], ["item_code", "in", codes]] as Filters,
        pageLength: 200,
      }) as unknown as ReservationRow[];
      replaceLines(linesRef.current.map((line) => ({
        ...line,
        _reservations: rows.filter((row) => text(row.item_code) === text(line.item_code)
          && (!text(row.warehouse) || !text(line.warehouse) || text(row.warehouse) === text(line.warehouse))),
      })));
    } catch (error) {
      // Không đọc được giữ chỗ thì phải NÓI, vì tồn khả dụng thật có thể thấp hơn cột Tồn.
      setPlanMessage(`Không đọc được phiếu giữ chỗ tồn: ${deliveryErrorMessage(error)}`);
    }
  }, [adapter, replaceLines]);

  // ── Kế hoạch giao: gọi thẳng thẩm quyền server ────────────────────────────────────────────
  const mergePlan = useCallback((plan: Json, replaceFromItems: boolean) => {
    const sourceLines = Array.isArray(plan.source_lines) ? plan.source_lines as DeliveryOutstanding[] : [];
    const outstandingByKey = new Map<string, DeliveryOutstanding>();
    for (const row of sourceLines) outstandingByKey.set(lineSourceKey(row.sales_order, row.sales_order_row_id), row);

    const preview = plan.inventory_preview && typeof plan.inventory_preview === "object" && !Array.isArray(plan.inventory_preview)
      ? plan.inventory_preview as DeliveryInventoryPreview
      : null;
    const fifoByKey = new Map<string, DeliveryInventoryPreview["rows"]>();
    for (const row of preview?.rows ?? []) {
      const key = lineSourceKey(row.sales_order, row.sales_order_row);
      const bucket = fifoByKey.get(key) ?? [];
      bucket.push(row);
      fifoByKey.set(key, bucket);
    }

    const base = replaceFromItems && Array.isArray(plan.items)
      ? hydrateDeliveryLines(plan.items as Json[])
      : linesRef.current;
    const next = base.map((line) => {
      const key = lineSourceKey(line._salesOrder, line.sales_order_row_id);
      return {
        ...line,
        _outstanding: outstandingByKey.get(key) ?? line._outstanding,
        _fifo: fifoByKey.get(key) ?? line._fifo,
      };
    });
    replaceLines(next);
    setInventoryPreview(preview);
    setSourceDocuments(Array.isArray(plan.source_documents) ? plan.source_documents as DeliverySourceDocument[] : []);
    setPlanMessage(text(plan.message));
    return next;
  }, [replaceLines]);

  const run = useCallback(async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    try {
      await task();
    } catch (error) {
      const message = deliveryErrorMessage(error);
      setPlanError(message);
      toast.error(message);
    } finally {
      setBusy("");
    }
  }, []);

  /** Danh sách đơn còn phải giao của khách — `preview_bulk_delivery` với `sales_orders: []`. */
  const loadCustomerOrders = useCallback(() => run("customer-orders", async () => {
    const customer = text(headerRef.current.customer);
    if (!customer) throw new Error("Cần chọn Khách hàng trước khi tải danh sách Đơn bán.");
    setPlanError("");
    const plan = await adapter.callPost<Json>("alumdoor.sales.preview_bulk_delivery", {
      customer,
      warehouse: text(defaultWarehouse),
      posting_at: text(headerRef.current.posting_at) || nowLocalDatetime(),
      install_address: text(headerRef.current.install_address),
      sales_orders: [],
    });
    setSourceDocuments(Array.isArray(plan.source_documents) ? plan.source_documents as DeliverySourceDocument[] : []);
    setPlanMessage(text(plan.message) || "Chọn một hoặc nhiều Đơn bán còn hàng để xem phân bổ.");
  }), [adapter, defaultWarehouse, run]);

  /** Nạp phần còn phải giao + FIFO cho các đơn đang chọn. */
  const loadPlan = useCallback((orders: string[]) => run("plan", async () => {
    if (!orders.length) throw new Error("Cần chọn ít nhất một Đơn bán.");
    setPlanError("");
    setPreviewNote("");
    const revision = markChanged(previewClock.current);
    beginPreview(previewClock.current);
    try {
      let customer = text(headerRef.current.customer);
      let installAddress = text(headerRef.current.install_address);

      if (orders.length === 1) {
        // Một đơn: dòng lấy đúng từ `preview_delivery` — chính là thứ `delivery_from_order` sẽ dựng.
        const single = await adapter.callPost<Json>("alumdoor.sales.preview_delivery", {
          sales_order: orders[0],
          warehouse: text(defaultWarehouse),
        });
        customer = text(single.customer) || customer;
        installAddress = installAddress || text(single.install_address);
        const items = Array.isArray(single.items) ? single.items as Json[] : [];
        const hydrated = await applyWarehouseDefaults(hydrateDeliveryLines(items, text(orders[0])));
        replaceLines(hydrated);
        setHeaderState({
          ...headerRef.current,
          customer: customer || headerRef.current.customer,
          against_sales_order: orders[0],
          install_address: installAddress || headerRef.current.install_address,
        });
        setPlanMessage(text(single.message));
      }

      if (customer) {
        const plan = await adapter.callPost<Json>("alumdoor.sales.preview_bulk_delivery", {
          customer,
          warehouse: text(defaultWarehouse),
          posting_at: text(headerRef.current.posting_at) || nowLocalDatetime(),
          install_address: installAddress,
          sales_orders: orders,
        });
        if (!canApplyPreview(previewClock.current, revision)) return;
        const replaceFromItems = orders.length > 1 && !anyLineEdited(linesRef.current);
        const merged = mergePlan(plan, replaceFromItems);
        if (replaceFromItems) replaceLines(await applyWarehouseDefaults(merged));
        setHeaderState({
          ...headerRef.current,
          customer,
          company: text(plan.company) || headerRef.current.company,
          currency: text(plan.currency) || headerRef.current.currency,
          install_address: text(plan.install_address) || headerRef.current.install_address,
          against_sales_order: orders.length === 1 ? orders[0] : undefined,
          delivery_batch_key: text(plan.delivery_batch_key) || undefined,
        });
      } else {
        setPlanMessage("Đơn bán chưa xác định được Khách hàng nên chưa lấy được số đã giao và lớp FIFO.");
      }

      await refreshAllLineContexts();
      await refreshReservations();
      setDirty(true);
    } finally {
      finishPreview(previewClock.current);
    }
  }), [adapter, applyWarehouseDefaults, defaultWarehouse, mergePlan, refreshAllLineContexts, refreshReservations, replaceLines, run, setHeaderState]);

  /**
   * Mở một phiếu đã có: đọc ngay tồn + giữ chỗ cho từng dòng. Không chờ người dùng bấm, vì
   * đúng lúc mở phiếu mới là lúc thủ kho cần biết dòng nào không đủ hàng.
   */
  const hydratedExisting = useRef(false);
  useEffect(() => {
    if (loading || hydratedExisting.current) return;
    if (!linesRef.current.some((line) => text(line.item_code))) return;
    hydratedExisting.current = true;
    void refreshAllLineContexts().then(() => refreshReservations());
  }, [loading, lines, refreshAllLineContexts, refreshReservations]);

  const toggleOrder = useCallback((order: string, checked: boolean) => {
    setSelectedOrders((current) => {
      const next = checked ? [...new Set([...current, order])] : current.filter((value) => value !== order);
      return next.sort((left, right) => left.localeCompare(right, "vi"));
    });
  }, []);

  // ── Ghi chứng từ ──────────────────────────────────────────────────────────────────────────
  const buildDocument = useCallback((): Json => {
    if (!meta) return {};
    const document: Json = {};
    for (const [fieldname, value] of Object.entries(headerRef.current)) {
      if (!meta.fields.some((field) => field.fieldname === fieldname)) continue;
      if (value === undefined || value === "") continue;
      document[fieldname] = value;
    }
    document.items = linesRef.current.filter((line) => text(line.item_code)).map(cleanLine);
    return document;
  }, [cleanLine, meta]);

  const invalidateLists = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", "Delivery Note"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "list", "Delivery Note"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "count", "Delivery Note"], refetchType: "active" }),
    ]).catch(() => undefined);
  }, [queryClient, scopeKey]);

  const validate = useCallback((): string | null => {
    const current = linesRef.current.filter((line) => text(line.item_code));
    if (!current.length) return "Phiếu chưa có dòng hàng nào.";
    if (!text(headerRef.current.customer)) return "Cần chọn Khách hàng.";
    if (!text(headerRef.current.posting_at)) return "Cần Thời điểm xuất.";
    for (const [index, line] of current.entries()) {
      if (line._loading) return `Dòng ${index + 1} đang đọc tồn, hãy chờ xong rồi lưu.`;
      if (!text(line.warehouse)) return `Dòng ${index + 1}: chưa có Kho xuất.`;
      if (!(numberValue(line.qty) ?? 0)) return `Dòng ${index + 1}: SL giao phải lớn hơn 0.`;
    }
    return null;
  }, []);

  /** Đường "thủ kho chốt số thực giao": giữ nguyên SL và kho từng dòng đang hiện trên màn. */
  const saveDraftFromLines = useCallback(() => run("save", async () => {
    if (!meta) return;
    if (multiOrder) throw new Error("Gộp nhiều Đơn bán phải đi đường “Máy chủ dựng phiếu gộp”; `Delivery Note Item` không có trường Đơn bán nên lưu tay sẽ mất liên kết dòng → đơn.");
    const validationError = validate();
    if (validationError) throw new Error(validationError);
    const payload = serializeCreateDocument(meta, buildDocument()) as Partial<Doc>;
    const saved = isExisting && savedName
      ? await adapter.updateDoc("Delivery Note", savedName, payload, sourceModified)
      : await adapter.createDoc("Delivery Note", payload);
    const name = text(saved.name) || savedName;
    setSavedName(name);
    setSourceModified(text(saved.modified));
    setDocstatus(Number(saved.docstatus) || 0);
    setDirty(false);
    invalidateLists();
    toast.success(isExisting ? `Đã lưu Phiếu xuất ${name}` : `Đã tạo Phiếu xuất nháp ${name}`);
    if (isExisting) props.onSaved?.(name);
    else props.onCreated?.(name);
  }), [adapter, buildDocument, invalidateLists, isExisting, meta, multiOrder, props, run, savedName, sourceModified, validate]);

  /** Đường "máy chủ dựng nguyên phiếu": giữ nguyên thẩm quyền + khoá chống trùng của server. */
  const createOnServer = useCallback(() => run("server-create", async () => {
    if (!selectedOrders.length) throw new Error("Cần chọn Đơn bán nguồn.");
    const warehouse = text(defaultWarehouse);
    if (multiOrder) {
      const result = await adapter.callPost<Json>("alumdoor.sales.bulk_delivery", {
        customer: text(headerRef.current.customer),
        warehouse,
        posting_at: text(headerRef.current.posting_at) || nowLocalDatetime(),
        install_address: text(headerRef.current.install_address),
        sales_orders: selectedOrders,
      });
      const name = text(result.delivery_note) || text(result.name);
      setSavedName(name);
      setDirty(false);
      invalidateLists();
      toast.success(result.replayed === true
        ? `Phiếu gộp đã tồn tại từ trước: ${name} (máy chủ chống trùng theo dấu vân tay kế hoạch).`
        : `Đã tạo phiếu gộp ${name} từ ${selectedOrders.length} Đơn bán.`);
      props.onCreated?.(name);
      return;
    }
    const result = await adapter.callPost<Json>("alumdoor.sales.delivery_from_order", {
      sales_order: selectedOrders[0],
      warehouse,
      install_address: text(headerRef.current.install_address),
      install_date: text(headerRef.current.install_date) || undefined,
      installer: text(headerRef.current.installer) || undefined,
      driver: text(headerRef.current.driver) || undefined,
      vehicle: text(headerRef.current.vehicle) || undefined,
    });
    const name = text(result.delivery_note);
    setSavedName(name);
    setDirty(false);
    invalidateLists();
    toast.success(`Đã tạo phiếu nháp ${name} với ${quantity(result.lines)} dòng.`);
    props.onCreated?.(name);
  }), [adapter, defaultWarehouse, invalidateLists, multiOrder, props, run, selectedOrders]);

  const submitDelivery = useCallback(() => run("submit", async () => {
    if (!savedName) throw new Error("Phải lưu phiếu nháp trước khi ghi sổ.");
    const { doc } = await adapter.getDoc("Delivery Note", savedName);
    const submitted = await adapter.submit(doc);
    setDocstatus(Number(submitted.docstatus) || 1);
    setSourceModified(text(submitted.modified));
    invalidateLists();
    toast.success(`Đã ghi sổ Phiếu xuất ${savedName}. Máy chủ đã tính lại FIFO và chốt tiến độ giao.`);
    props.onSaved?.(savedName);
  }), [adapter, invalidateLists, props, run, savedName]);

  /** In / xem: chuẩn hoá qua `alumdoor.ui.preview_document` rồi mới mở bản in. */
  const previewAndPrint = useCallback(() => run("preview-document", async () => {
    const result = await adapter.callPost<Json>("alumdoor.ui.preview_document", {
      doctype: "Delivery Note",
      doc: buildDocument(),
      changed_field: "items",
    });
    const patch = result.patch && typeof result.patch === "object" && !Array.isArray(result.patch)
      ? result.patch as Json
      : {};
    const clear = Array.isArray(result.clear) ? result.clear.map(text).filter(Boolean) : [];
    if (Object.keys(patch).length || clear.length) {
      const next: Json = { ...headerRef.current, ...patch };
      for (const field of clear) delete next[field];
      setHeaderState(next);
      setPreviewNote(`Máy chủ đã chuẩn hoá ${Object.keys(patch).length} trường trước khi in.`);
    } else {
      // Nói thẳng thay vì im lặng: hiện tại previewDocument chỉ khai luật cho Sales Order và
      // Purchase Order, Delivery Note rơi vào nhánh trả rỗng (ui-document-preview.ts:421).
      setPreviewNote("Máy chủ không trả điều chỉnh nào cho Phiếu xuất kho — alumdoor.ui.preview_document hiện chỉ khai luật cho Đơn bán và Đơn mua.");
    }
    if (savedName) props.onPreviewCreated?.(savedName);
    else toast.message("Phiếu chưa lưu nên chưa mở được bản in. Hãy lưu nháp trước.");
  }), [adapter, buildDocument, props, run, savedName, setHeaderState]);

  // ── Giữ chỗ tồn ───────────────────────────────────────────────────────────────────────────
  const reserveLine = useCallback((key: string, draft: DeliveryReservationDraft) => run("reserve", async () => {
    const line = linesRef.current.find((row) => row._key === key);
    if (!line) return;
    // `Stock Reservation.source_doctype` chỉ nhận Work Order / Sales Order / Cut Order, nên phiếu
    // giữ chỗ được ghi theo Đơn bán nguồn của dòng — không bịa "Delivery Note".
    const result = await adapter.callPost<Json>("alumdoor.reserve.create", {
      item_code: text(line.item_code),
      color: text(line.color) || undefined,
      warehouse: text(line.warehouse),
      min_length_m: draft.min_length_m,
      qty_reserved: draft.qty_reserved,
      source_doctype: "Sales Order",
      source_name: text(line._salesOrder),
      expires_at: draft.expires_at,
    });
    toast.success(text(result.message) || `Đã giữ chỗ ${text(result.reservation)}.`);
    await refreshReservations();
  }), [adapter, refreshReservations, run]);

  const releaseReservation = useCallback((_key: string, reservation: string, reason: string) => run("release", async () => {
    await adapter.callPost<Json>("alumdoor.reserve.release", { reservation, released_reason: reason });
    toast.success(`Đã nhả giữ chỗ ${reservation}.`);
    await refreshReservations();
  }), [adapter, refreshReservations, run]);

  // ── Mẻ giao theo ngày ─────────────────────────────────────────────────────────────────────
  const previewBatch = useCallback(() => run("batch-preview", async () => {
    setPlanError("");
    const result = await adapter.callPost<{ delivery_date?: string; rows?: DeliveryBatchRow[]; ready?: number }>(
      "alumdoor.delivery_batch.preview",
      { delivery_date: batchDate },
    );
    const rows = Array.isArray(result.rows) ? result.rows : [];
    setBatchRows(rows);
    setBatchSelection(new Set(rows.filter((row) => text(row.status) === "Sẵn sàng").map((row) => text(row.sales_order))));
    setBatchResults([]);
    setPrintDocuments([]);
    toast.message(`${rows.length} đơn tới hạn ngày ${text(result.delivery_date) || batchDate}; ${quantity(result.ready)} đơn sẵn sàng.`);
  }), [adapter, batchDate, run]);

  const createBatch = useCallback(() => run("batch-create", async () => {
    const orders = [...batchSelection].filter(Boolean);
    const result = await adapter.callPost<{ delivery_date?: string; results?: DeliveryBatchResult[]; print_documents?: PrintDocument[] }>(
      "alumdoor.delivery_batch.create",
      { delivery_date: batchDate, warehouse: text(defaultWarehouse), ...(orders.length ? { sales_orders: orders } : {}) },
    );
    const results = Array.isArray(result.results) ? result.results : [];
    setBatchResults(results);
    setPrintDocuments(Array.isArray(result.print_documents) ? result.print_documents : []);
    invalidateLists();
    const failed = results.filter((row) => text(row.status) === "Lỗi").length;
    if (failed) toast.error(`${failed}/${results.length} đơn KHÔNG tạo được phiếu — xem lý do từng dòng ở bảng kết quả.`);
    else toast.success(`Đã xử lý ${results.length} đơn cho ngày ${text(result.delivery_date) || batchDate}.`);
    await previewBatch();
  }), [adapter, batchDate, batchSelection, defaultWarehouse, invalidateLists, previewBatch, run]);

  // ── Vòng đời đóng màn ─────────────────────────────────────────────────────────────────────
  const requestClose = useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else props.onCancel?.();
  }, [dirty, props]);

  useEffect(() => {
    if ((props.closeRequest ?? 0) === closeSeen.current) return;
    closeSeen.current = props.closeRequest ?? 0;
    requestClose();
  }, [props.closeRequest, requestClose]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ── Render ────────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Đang mở Phiếu xuất kho…</span>
      </div>
    );
  }
  if (fatal) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <div className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{fatal}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setFatal(""); setLoading(true); setLoadAttempt((value) => value + 1); }}>
            <RefreshCw className="size-3.5" /> Thử kết nối lại
          </Button>
        </div>
      </div>
    );
  }
  if (!meta || !childMeta) {
    return <div className="p-6 text-sm text-muted-foreground">Không đọc được cấu trúc Phiếu xuất kho.</div>;
  }

  const metaField = (fieldname: string) => meta.fields.find((field) => field.fieldname === fieldname);
  const headerField = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string) =>
    metaField(fieldname) ?? fallbackField(fieldname, label, fieldtype, options);

  const headerControl = (
    fieldname: string,
    label: string,
    fieldtype: DocField["fieldtype"] = "Data",
    options?: string,
    readOnly = false,
  ) => (
    <AlumdoorSalesOrderField
      id={`delivery-v2-header-${fieldname}`}
      field={headerField(fieldname, label, fieldtype, options)}
      label={label}
      value={header[fieldname]}
      onChange={(value) => {
        markChanged(previewClock.current);
        setHeaderState({ ...headerRef.current, [fieldname]: value });
        setDirty(true);
      }}
      registry={registry}
      services={services}
      parentDoctype="Delivery Note"
      docValues={header}
      roles={roles}
      required={Boolean(metaField(fieldname)?.reqd)}
      readOnly={formReadOnly || Boolean(busy) || readOnly}
      compact
      className="[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_button]:!h-8"
    />
  );

  const activeLines = lines.filter((line) => text(line.item_code));
  const blockedLines = activeLines.filter(lineBlocked).length;
  const edited = anyLineEdited(lines);
  const working = Boolean(busy);
  /**
   * `delivery_from_order` / `bulk_delivery` chỉ nhận MỘT kho cho cả phiếu (`warehouse || dòng
   * Đơn bán`). Nếu kho đang hiện trên dòng khác kết quả đó thì đường máy chủ sẽ ÂM THẦM ghi kho
   * khác với thứ người dùng vừa chọn — nên chặn và nói ra, thay vì để lệch im lặng.
   */
  const serverBuildKeepsWarehouses = activeLines.every((line) =>
    text(line.warehouse) === (text(defaultWarehouse) || text(line._serverWarehouse)));

  return <>
    <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-delivery-note-v2">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="w-full space-y-3 px-3 py-3">
          {formReadOnly ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
              Phiếu đã ghi sổ/khóa hoặc tài khoản không có quyền sửa. Số liệu chỉ hiển thị theo dữ liệu server.
            </div>
          ) : null}
          {planError ? (
            <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{planError}</span>
              <Button type="button" variant="outline" size="sm" className="h-7" disabled={working} onClick={() => loadPlan(selectedOrders)}>
                Thử lại
              </Button>
            </div>
          ) : null}
          {planMessage ? <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">{planMessage}</div> : null}
          {previewNote ? <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">{previewNote}</div> : null}

          <section className="rounded-lg border bg-card p-2.5" data-section="alumdoor-delivery-v2-header">
            <div className="grid gap-x-2 gap-y-2 md:grid-cols-2 xl:grid-cols-5">
              {headerControl("customer", "Khách hàng", "Link", "Customer")}
              {metaField("issue_purpose") ? headerControl("issue_purpose", "Mục đích xuất", "Select", metaField("issue_purpose")?.options) : null}
              {headerControl("posting_at", "Thời điểm xuất", "Datetime")}
              <AlumdoorSalesOrderField
                id="delivery-v2-header-default-warehouse"
                field={fallbackField("warehouse", "Kho xuất mặc định", "Link", "Warehouse")}
                label="Kho xuất mặc định"
                value={defaultWarehouse}
                onChange={(value) => setDefaultWarehouse(text(value))}
                registry={registry}
                services={services}
                parentDoctype="Delivery Note"
                docValues={header}
                roles={roles}
                readOnly={formReadOnly || working}
                compact
                className="[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_button]:!h-8"
              />
              {metaField("against_sales_order")
                ? headerControl("against_sales_order", "Theo đơn bán", "Link", "Sales Order", multiOrder)
                : null}
            </div>
            <div className="mt-2 grid gap-x-2 gap-y-2 md:grid-cols-2 xl:grid-cols-5">
              {metaField("install_address") ? headerControl("install_address", "Địa chỉ lắp đặt", "Small Text") : null}
              {metaField("install_date") ? headerControl("install_date", "Ngày lắp", "Date") : null}
              {metaField("installer") ? headerControl("installer", "Đội lắp đặt") : null}
              {metaField("driver") ? headerControl("driver", "Người giao / lái xe") : null}
              {metaField("vehicle") ? headerControl("vehicle", "Biển số xe") : null}
            </div>
            <div className="mt-2 grid gap-x-2 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
              {metaField("note") ? headerControl("note", "Ghi chú", "Small Text") : null}
              <div className="text-[11px] text-muted-foreground">
                <div>Công ty: <strong className="text-foreground">{text(header.company) || "—"}</strong></div>
                <div>Tiền tệ: <strong className="text-foreground">{text(header.currency) || "—"}</strong></div>
                <div>Nhóm giá: <strong className="text-foreground">{text(header.customer_group) || "—"}</strong></div>
                {text(header.delivery_batch_key) ? (
                  <div className="mt-0.5 font-mono text-[10px]">Khoá chống trùng: {text(header.delivery_batch_key)}</div>
                ) : null}
              </div>
            </div>
          </section>

          <Tabs defaultValue="order" className="space-y-3">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="order"><Package className="size-4" /> Theo đơn bán</TabsTrigger>
              <TabsTrigger value="batch"><CalendarClock className="size-4" /> Mẻ giao theo ngày</TabsTrigger>
            </TabsList>

            <TabsContent value="order" className="space-y-3">
              <section className="rounded-lg border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                  <span className="text-xs font-medium">Đơn bán còn phải giao</span>
                  <Button type="button" variant="outline" size="sm" className="h-7" disabled={working} onClick={loadCustomerOrders}>
                    {busy === "customer-orders" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Tải đơn của khách
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7"
                    disabled={working || !selectedOrders.length}
                    onClick={() => loadPlan(selectedOrders)}
                  >
                    {busy === "plan" ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />} Nạp phần còn phải giao
                  </Button>
                  {text(header.against_sales_order) && !selectedOrders.length ? (
                    <Button type="button" variant="outline" size="sm" className="h-7" disabled={working}
                      onClick={() => { const order = text(header.against_sales_order); setSelectedOrders([order]); void loadPlan([order]); }}>
                      Nạp đơn đang chọn ở đầu phiếu
                    </Button>
                  ) : null}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    Đang chọn {selectedOrders.length} đơn{multiOrder ? " · sẽ gộp thành MỘT phiếu" : ""}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Đơn bán</TableHead>
                        <TableHead>Ngày đơn / ngày giao</TableHead>
                        <TableHead className="text-right">Dòng còn phải giao</TableHead>
                        <TableHead>Vì sao không chọn được</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sourceDocuments.map((row) => {
                        const order = text(row.sales_order);
                        const disabledReason = text(row.disabled_reason);
                        return (
                          <TableRow key={order}>
                            <TableCell>
                              <Checkbox
                                checked={selectedOrders.includes(order)}
                                disabled={working || Boolean(disabledReason)}
                                onCheckedChange={(value) => toggleOrder(order, value === true)}
                                aria-label={`Chọn ${order}`}
                              />
                            </TableCell>
                            <TableCell className="text-xs font-medium">{order}</TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              {isoDateOnly(row.transaction_date) || "—"} → {isoDateOnly(row.delivery_date) || "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{quantity(row.outstanding_lines)}</TableCell>
                            <TableCell className="text-[11px]">
                              {disabledReason
                                ? <Badge variant="outline" className="text-[10px]">{disabledReason}</Badge>
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!sourceDocuments.length ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-20 text-center text-xs text-muted-foreground">
                            Chọn Khách hàng rồi bấm “Tải đơn của khách”, hoặc chọn thẳng một Đơn bán ở đầu phiếu.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <AlumdoorDeliveryNoteLineTable
                lines={lines}
                childMeta={childMeta}
                registry={registry}
                services={services}
                roles={roles}
                readOnly={formReadOnly}
                multiOrder={multiOrder}
                busy={working}
                onPatch={(key, patch) => { markChanged(previewClock.current); patchLine(key, { ...patch, _edited: true }); setDirty(true); }}
                onCommit={(key, fieldname) => {
                  const line = linesRef.current.find((row) => row._key === key);
                  if (!line) return;
                  if (fieldname === "warehouse") patchLine(key, { _warehouseSource: "Người dùng chọn" });
                  void refreshLineContext(linesRef.current.find((row) => row._key === key) ?? line);
                }}
                onRemove={(key) => { replaceLines(linesRef.current.filter((line) => line._key !== key), true); }}
                onReserve={reserveLine}
                onReleaseReservation={releaseReservation}
              />

              {inventoryPreview ? (
                <section className="rounded-lg border bg-card" data-section="alumdoor-delivery-v2-fifo">
                  <div className="border-b px-3 py-2">
                    <div className="text-xs font-medium">{text(inventoryPreview.title) || "Xem trước lớp tồn FIFO"}</div>
                    <div className="text-[11px] text-muted-foreground">{text(inventoryPreview.description)}</div>
                  </div>
                  <div className="space-y-1 px-3 py-2">
                    {(inventoryPreview.warnings ?? []).map((warning, index) => (
                      <div key={index} className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[11px]">
                        {text(warning)}
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-3 pt-1 text-[11px]">
                      {(inventoryPreview.summary ?? []).map((item, index) => (
                        <span key={index} className="text-muted-foreground">
                          {text(item.label)}: <strong className="text-foreground tabular-nums">{text(item.value)}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}
            </TabsContent>

            <TabsContent value="batch" className="space-y-3">
              <section className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="text-[11px] text-muted-foreground">
                    <Label htmlFor="delivery-v2-batch-date">Ngày giao</Label>
                    <Input
                      id="delivery-v2-batch-date"
                      type="date"
                      className="mt-0.5 h-8 w-40 text-xs"
                      value={batchDate}
                      onChange={(event) => setBatchDate(event.target.value)}
                    />
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8" disabled={working} onClick={previewBatch}>
                    {busy === "batch-preview" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Xem đơn tới hạn
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    disabled={working || !batchRows.some((row) => text(row.status) === "Sẵn sàng")}
                    onClick={createBatch}
                  >
                    {busy === "batch-create" ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />} Tạo phiếu hàng loạt
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    Kho xuất dùng chung ô “Kho xuất mặc định” ở đầu phiếu. Máy chủ bỏ qua đơn đã có phiếu (chống trùng theo khoá ngày+đơn).
                  </span>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Đơn bán</TableHead>
                        <TableHead>Khách</TableHead>
                        <TableHead>Khoá chống trùng</TableHead>
                        <TableHead>Trạng thái</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batchRows.map((row) => {
                        const order = text(row.sales_order);
                        const ready = text(row.status) === "Sẵn sàng";
                        return (
                          <TableRow key={text(row.delivery_batch_key) || order}>
                            <TableCell>
                              <Checkbox
                                checked={batchSelection.has(order)}
                                disabled={working || !ready}
                                onCheckedChange={(value) => setBatchSelection((current) => {
                                  const next = new Set(current);
                                  if (value === true) next.add(order);
                                  else next.delete(order);
                                  return next;
                                })}
                                aria-label={`Chọn ${order}`}
                              />
                            </TableCell>
                            <TableCell className="text-xs font-medium">{order}</TableCell>
                            <TableCell className="text-xs">{text(row.customer) || "—"}</TableCell>
                            <TableCell className="font-mono text-[10px]">{text(row.delivery_batch_key)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">
                                {text(row.status)}{text(row.existing_delivery_note) ? ` · ${text(row.existing_delivery_note)}` : ""}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!batchRows.length ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-20 text-center text-xs text-muted-foreground">
                            Chọn ngày rồi bấm “Xem đơn tới hạn”.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>

                {batchResults.length ? (
                  <div className="mt-3 rounded-lg border">
                    <div className="border-b px-3 py-2 text-xs font-medium">Kết quả từng đơn</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Đơn bán</TableHead>
                          <TableHead>Kết quả</TableHead>
                          <TableHead>Phiếu xuất</TableHead>
                          <TableHead>Lý do / ghi chú</TableHead>
                          <TableHead className="w-24" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batchResults.map((row, index) => {
                          const status = text(row.status);
                          return (
                            <TableRow key={`${text(row.sales_order)}-${index}`}>
                              <TableCell className="text-xs font-medium">{text(row.sales_order) || "—"}</TableCell>
                              <TableCell>
                                <Badge variant={status === "Lỗi" ? "destructive" : "outline"} className="text-[10px]">{status || "—"}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">{text(row.delivery_note) || "—"}</TableCell>
                              <TableCell className="text-[11px]">
                                {status === "Lỗi"
                                  ? <span className="text-destructive">{text(row.message) || "Máy chủ không nói lý do."}</span>
                                  : row.idempotent === true
                                    ? "Đơn đã có phiếu từ trước — máy chủ không tạo thêm."
                                    : `${quantity(row.lines)} dòng`}
                              </TableCell>
                              <TableCell>
                                {text(row.delivery_note) ? (
                                  <Button type="button" variant="outline" size="sm" className="h-7"
                                    onClick={() => props.onPreviewCreated?.(text(row.delivery_note))}>
                                    <Eye className="size-3" /> In
                                  </Button>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}

                {printDocuments.length ? (
                  <div className="mt-3 rounded-lg border border-dashed p-3">
                    <div className="text-xs font-medium">Gói in ngày {batchDate} · {printDocuments.length} phiếu</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {printDocuments.map((doc) => (
                        <Button key={`${text(doc.doctype)}:${text(doc.name)}`} type="button" size="sm" variant="outline" className="h-7"
                          onClick={() => props.onPreviewCreated?.(text(doc.name))}>
                          <Eye className="size-3" /> {text(doc.name)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className="shrink-0 border-t bg-card px-3 py-1.5 shadow-[0_-4px_14px_rgba(0,0,0,0.035)]">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {working ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> Đang gọi máy chủ</span>
            ) : blockedLines ? (
              <span className="inline-flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="size-3.5" /> {blockedLines} dòng đang có cảnh báo chặn
              </span>
            ) : activeLines.length ? (
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5" /> {activeLines.length} dòng sẵn sàng</span>
            ) : (
              <span className="text-muted-foreground">Chưa có dòng hàng</span>
            )}
            {edited ? <Badge variant="outline">Đã sửa số thực giao</Badge> : null}
            {savedName ? <span className="text-muted-foreground">Phiếu: <strong className="text-foreground">{savedName}</strong></span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={requestClose}>{isExisting ? "Đóng" : "Hủy"}</Button>
            <Button type="button" variant="outline" size="sm" disabled={working || !activeLines.length}
              onClick={() => void refreshAllLineContexts()}>
              <RefreshCw className="size-3.5" /> Đọc lại tồn
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={working || !activeLines.length} onClick={previewAndPrint}>
              <Eye className="size-3.5" /> Xem trước / In
            </Button>
            {docstatus === 0 && selectedOrders.length > 0 && !edited ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={working || formReadOnly || !serverBuildKeepsWarehouses}
                title={serverBuildKeepsWarehouses
                  ? undefined
                  : "Kho trên dòng khác kho mà máy chủ sẽ dùng cho cả phiếu. Hãy đặt Kho xuất mặc định trùng với dòng, hoặc lưu nháp theo số thực giao."}
                onClick={createOnServer}
              >
                <Truck className="size-3.5" /> {multiOrder ? "Máy chủ dựng phiếu gộp" : "Máy chủ dựng phiếu theo đơn"}
              </Button>
            ) : null}
            {docstatus === 0 ? (
              <Button type="button" size="sm" disabled={working || formReadOnly || multiOrder || !activeLines.length} onClick={saveDraftFromLines}>
                {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Lưu nháp theo số thực giao
              </Button>
            ) : null}
            {docstatus === 0 && savedName && caps.submit ? (
              <Button type="button" size="sm" disabled={working} onClick={submitDelivery}>
                {busy === "submit" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Ghi sổ phiếu
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          “Máy chủ dựng phiếu” giữ nguyên thẩm quyền và khoá chống trùng của <code>alumdoor.sales.*</code>, nhưng dùng MỘT kho cho cả phiếu.
          “Lưu nháp theo số thực giao” giữ đúng SL và kho từng dòng đang hiện, và đường này chưa có khoá chống trùng ở máy chủ — chỉ bấm một lần.
          {activeLines.length && !serverBuildKeepsWarehouses
            ? " Hiện kho trên dòng đang khác kho máy chủ sẽ dùng, nên đường máy chủ bị khoá để không ghi lệch kho."
            : ""}
        </div>
      </div>
    </div>

    <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle></DialogHeader>
        <div className="space-y-4 p-1 text-sm">
          <p className="text-muted-foreground">
            Phiếu đang có kế hoạch giao, số thực giao hoặc kho xuất chưa lưu. Đóng bây giờ sẽ bỏ các thay đổi này.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>Tiếp tục chỉnh</Button>
            <Button variant="destructive" onClick={() => { setConfirmDiscard(false); setDirty(false); props.onCancel?.(); }}>Bỏ thay đổi</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
