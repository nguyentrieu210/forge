/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, Loader2, PackagePlus, RefreshCw, Save, Send } from "lucide-react";
import { applyContextPolicy, formatMoney, mapError, serializeCreateDocument, type Doc, type DocField, type DocTypeMeta } from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";
import { Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";
import { salesItemSearchTerms } from "./sales-item-search.js";
import {
  AlumdoorPurchaseOrderItemsGrid,
  isAluminumPurchaseLine,
  purchaseFieldRequired,
  purchaseLineKey,
  type PurchaseLine,
} from "./AlumdoorPurchaseOrderItemsGrid.js";
import { AlumdoorSalesOrderField, fallbackField } from "./sales-order-v2/AlumdoorSalesOrderField.js";
import {
  beginPurchaseOrderPreview,
  canApplyPurchaseOrderPreview,
  createPurchaseOrderPreviewClock,
  finishPurchaseOrderPreview,
  isPurchaseOrderPersistenceBlocked,
  markPurchaseOrderChanged,
} from "./purchase-preview-coordinator.js";

type Json = Record<string, unknown>;

type DocumentPreviewResult = {
  patch: Json;
  clear: string[];
};

const PURCHASE_SUPPLIER_GROUPS = ["Nhôm", "Mô tơ", "Sơn", "Phụ kiện", "Vận chuyển", "Khác"];
const PURCHASE_CONTEXT_FIELDS = new Set(["supplier_group", "buying_price_list"]);
const PRICING_HEADER_FIELDS = new Set(["supplier", "supplier_group", "buying_price_list", "transaction_date", "currency"]);
const ALUMINUM_MODE = "Nhôm cây/lá";

export interface AlumdoorPurchaseOrderCreateProps {
  name?: string;
  closeRequest?: number;
  onCreated: (name: string) => void;
  onSaved?: (name: string) => void;
  /** Mở bản in mẫu ALUMDOOR của đơn mua. */
  onPreviewCreated?: (name: string) => void;
  onCancel: () => void;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalized(value: unknown): string {
  return text(value).toLocaleLowerCase("vi");
}

function numberValue(value: unknown): number | undefined {
  if (value === "" || value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positive(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function today(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function money(value: unknown): string {
  return formatMoney(numberValue(value) ?? 0, { style: "plain" });
}

function quantity(value: unknown, digits = 3): string {
  const parsed = numberValue(value) ?? 0;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(parsed);
}

function resolveDefault(field: DocField): unknown {
  if (field.default === undefined || field.default === null || field.default === "") return undefined;
  if (field.default === "Today" && field.fieldtype === "Date") return today();
  return field.default;
}

function blankFromMeta(meta: DocTypeMeta): Json {
  const result: Json = {};
  for (const field of meta.fields ?? []) {
    const value = resolveDefault(field);
    if (value !== undefined) result[field.fieldname] = value;
  }
  return result;
}

function newPurchaseLine(meta: DocTypeMeta, index: number): PurchaseLine {
  const row: PurchaseLine = {
    name: `new-purchase-row-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    doctype: meta.name,
  } as PurchaseLine;
  for (const field of meta.fields ?? []) {
    const value = resolveDefault(field);
    if (value !== undefined) row[field.fieldname] = value;
  }
  if (row.qty === undefined) row.qty = 1;
  return row;
}

function fieldValueForServer(fieldtype: DocField["fieldtype"], value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (["Float", "Int", "Currency", "Percent"].includes(fieldtype)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

function mergePurchaseItemFilters(filters: Record<string, unknown> | Array<unknown> | undefined): Record<string, unknown> | Array<unknown> {
  if (Array.isArray(filters)) {
    return [
      ...filters,
      ["Item", "is_purchase_item", "=", 1],
      ["Item", "disabled", "=", 0],
    ];
  }
  return { ...(filters ?? {}), is_purchase_item: 1, disabled: 0 };
}

function itemSearchScore(option: { value: string; label?: string; description?: string }, query: string): number {
  const needle = normalized(query);
  if (!needle) return 0;
  const code = normalized(option.value);
  const label = normalized(option.label || option.description);
  const haystack = `${code} ${label}`;
  let score = 0;
  if (code === needle) score += 1_000;
  if (label === needle) score += 900;
  if (code.startsWith(needle)) score += 500;
  if (label.startsWith(needle)) score += 450;
  if (haystack.includes(needle)) score += 300;
  for (const token of needle.split(/\s+/).filter(Boolean)) {
    if (code.includes(token)) score += 80;
    if (label.includes(token)) score += 60;
  }
  return score;
}

function cleanChildRow(row: PurchaseLine, childMeta: DocTypeMeta, keepIdentity: boolean): Json {
  const allowed = new Set((childMeta.fields ?? []).map((field) => field.fieldname));
  const result: Json = {};
  for (const [fieldname, value] of Object.entries(row)) {
    if (fieldname.startsWith("_") || value === undefined || value === null || value === "") continue;
    if (allowed.has(fieldname)) result[fieldname] = value;
  }
  if (keepIdentity && text(row.name) && !text(row.name).startsWith("new-")) {
    result.name = row.name;
    result.doctype = row.doctype || childMeta.name;
  }
  return result;
}

function applyChildPreview(row: PurchaseLine, preview: Json, childMeta: DocTypeMeta): PurchaseLine {
  const fields = new Set((childMeta.fields ?? []).map((field) => field.fieldname));
  const next = { ...row } as PurchaseLine;
  for (const fieldname of Array.isArray(preview.clear) ? preview.clear.map(text) : []) {
    if (fields.has(fieldname)) next[fieldname] = undefined;
  }
  const patch = preview.patch && typeof preview.patch === "object" && !Array.isArray(preview.patch)
    ? preview.patch as Json
    : {};
  for (const [fieldname, value] of Object.entries(patch)) {
    if (fields.has(fieldname)) next[fieldname] = value;
  }
  const rawOverrides = preview.field_overrides && typeof preview.field_overrides === "object" && !Array.isArray(preview.field_overrides)
    ? preview.field_overrides as Record<string, unknown>
    : {};
  next._overrides = Object.fromEntries(Object.entries(rawOverrides)
    .filter(([fieldname, value]) => fields.has(fieldname) && Boolean(value) && typeof value === "object" && !Array.isArray(value))
    .map(([fieldname, value]) => [fieldname, value as Record<string, unknown>])) as PurchaseLine["_overrides"];
  return next;
}

function clearItemDerived(line: PurchaseLine, itemCode: unknown): PurchaseLine {
  return {
    name: line.name,
    doctype: line.doctype,
    item_code: itemCode,
    qty: 1,
  } as PurchaseLine;
}

function nearlyEqual(left: unknown, right: unknown, tolerance = 0.0001): boolean {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

function rowValueMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function AlumdoorPurchaseOrderCreate(props: AlumdoorPurchaseOrderCreateProps) {
  const { adapter, scopeKey, businessContext, contextPolicies, registry, services, roles } = useMetaForge();
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [childMeta, setChildMeta] = useState<DocTypeMeta | null>(null);
  const [header, setHeader] = useState<Json>({});
  const headerRef = useRef<Json>({});
  const [rows, setRows] = useState<PurchaseLine[]>([]);
  const rowsRef = useRef<PurchaseLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fatal, setFatal] = useState("");
  const [sourceModified, setSourceModified] = useState("");
  const [docstatus, setDocstatus] = useState(0);
  const [canCreate, setCanCreate] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [submitAllowed, setSubmitAllowed] = useState(false);
  const [workingName, setWorkingName] = useState(() => text(props.name));
  const [taoPhieuNhap, setTaoPhieuNhap] = useState(false);

  /**
   * "Đơn mua → Phiếu nhập" — HDSD §1 mục "Hàng về".
   *
   * Trước 23/08/2026 thanh nút của đơn đã ghi sổ chỉ có Đóng và Tính lại, nên thủ kho phải tự
   * sang màn khác rồi gõ lại số đơn. `alumdoor.purchase.receipt_from_order` vốn đã có sẵn và tự
   * lấy PHẦN CÒN LẠI chưa nhận, chỉ là chưa ai nối vào nút.
   */
  const moPhieuNhap = async () => {
    if (!workingName || taoPhieuNhap) return;
    setTaoPhieuNhap(true);
    try {
      const ketQua = await adapter.callPost<{ purchase_receipt?: string }>(
        "alumdoor.purchase.receipt_from_order",
        { purchase_order: workingName },
      );
      const phieu = text(ketQua?.purchase_receipt);
      if (!phieu) throw new Error("Server không trả về số phiếu nhập.");
      toast.success(`Đã tạo phiếu nhập nháp ${phieu} cho phần còn lại của ${workingName}.`);
      window.location.assign(`/app/${encodeURIComponent("Purchase Receipt")}/${encodeURIComponent(phieu)}`);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setTaoPhieuNhap(false);
    }
  };
  const [dirty, setDirty] = useState(false);
  const [previewPending, setPreviewPending] = useState(0);
  const [previewError, setPreviewErrorState] = useState("");
  const previewErrorRef = useRef("");
  const closeSeen = useRef(props.closeRequest ?? 0);
  const itemCache = useRef(new Map<string, Json>());
  const specCache = useRef(new Map<string, number>());
  const supplierItemCache = useRef(new Map<string, number>());
  const skipSupplierAutofillOnce = useRef(false);
  const supplierHydrationSeq = useRef(0);
  const rowPreviewSeq = useRef(new Map<string, number>());
  const previewClock = useRef(createPurchaseOrderPreviewClock());
  const didInitialPreview = useRef(false);

  useEffect(() => {
    const next = text(props.name);
    if (next && next !== workingName) setWorkingName(next);
  }, [props.name, workingName]);

  const isExisting = Boolean(workingName);
  const formReadOnly = isExisting ? (!canWrite || docstatus !== 0) : !canCreate;
  const interactionBusy = saving || refreshing;
  const previewBlocked = isPurchaseOrderPersistenceBlocked(previewClock.current, previewError);
  const canSave = !formReadOnly && !previewBlocked;

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
    const pending = finishPurchaseOrderPreview(previewClock.current);
    setPreviewPending(pending);
  }, []);

  const setHeaderState = useCallback((next: Json) => {
    headerRef.current = next;
    setHeader(next);
  }, []);

  const replaceRows = useCallback((next: PurchaseLine[]) => {
    const normalizedRows = next.length || !childMeta ? next : [newPurchaseLine(childMeta, 0)];
    rowsRef.current = normalizedRows;
    setRows(normalizedRows);
  }, [childMeta]);

  const purchaseServices = useMemo<FieldServices>(() => ({
    ...services,
    searchLink: async (doctype, query, options) => {
      if (!services.searchLink) return [];
      if (doctype !== "Item") return services.searchLink(doctype, query, options);
      const raw = text(query);
      const terms = salesItemSearchTerms(raw);
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
      return [...merged.values()]
        .sort((left, right) => itemSearchScore(right, raw) - itemSearchScore(left, raw)
          || left.value.localeCompare(right.value, "vi"))
        .slice(0, 100);
    },
  }), [services]);

  const loadItem = useCallback(async (itemCode: string): Promise<Json> => {
    const cached = itemCache.current.get(itemCode);
    if (cached) return cached;
    const { doc } = await adapter.getDoc("Item", itemCode);
    const item = doc as Json;
    itemCache.current.set(itemCode, item);
    return item;
  }, [adapter]);

  /**
   * "Dài cây" chuẩn từ Quy cách kỹ thuật — CÙNG cơ chế đã dùng ở màn NHẬP
   * (`AlumdoorPurchaseReceiptWorkbench.tsx`), nay gọi thêm ở màn ĐẶT để người lập đơn không
   * phải tự nhớ/tra chiều dài cây cho từng dòng nhôm. Chỉ là gợi ý mặc định, người dùng vẫn
   * sửa được vì mỗi cây một dài.
   */
  const loadStandardLengthM = useCallback(async (specName: string): Promise<number | undefined> => {
    const cached = specCache.current.get(specName);
    if (cached !== undefined) return cached || undefined;
    try {
      const { doc } = await adapter.getDoc("Material Specification", specName);
      const value = numberValue((doc as Json).standard_length_m);
      specCache.current.set(specName, value ?? 0);
      return value;
    } catch {
      specCache.current.set(specName, 0);
      return undefined;
    }
  }, [adapter]);

  /**
   * Giá mua gần nhất theo NCC + mã hàng (`Supplier Item.last_purchase_rate`) — chỉ để THAM
   * KHẢO khi gõ đơn giá, không tự gán vào `rate`. Tên chứng từ Supplier Item cố định theo
   * khuôn `{supplier}:{item_code}` (brief `naming: format:{supplier}:{item_code}`), nên tra
   * thẳng bằng tên thay vì phải tìm kiếm. Phần lớn tổ hợp NCC+mã hàng CHƯA có bản ghi này —
   * lỗi 404 là bình thường, không phải sự cố.
   */
  const loadLastPurchaseRate = useCallback(async (supplier: string, itemCode: string): Promise<number | undefined> => {
    const key = `${supplier} ${itemCode}`;
    const cached = supplierItemCache.current.get(key);
    if (cached !== undefined) return cached || undefined;
    try {
      const { doc } = await adapter.getDoc("Supplier Item", `${supplier}:${itemCode}`);
      const value = numberValue((doc as Json).last_purchase_rate);
      supplierItemCache.current.set(key, value ?? 0);
      return value;
    } catch {
      supplierItemCache.current.set(key, 0);
      return undefined;
    }
  }, [adapter]);

  const hydrateLine = useCallback(async (source: PurchaseLine): Promise<PurchaseLine> => {
    const itemCode = text(source.item_code);
    if (!itemCode) return source;
    const item = await loadItem(itemCode);
    const mode = text(item.inventory_mode) || "Hàng thường";
    const defaultPurchaseUom = text(item.default_purchase_uom) || text(item.stock_uom);
    const specName = text(item.material_specification);
    const supplierName = text(headerRef.current.supplier);
    const [standardLength, lastPurchaseRate] = await Promise.all([
      mode === ALUMINUM_MODE && specName ? loadStandardLengthM(specName) : Promise.resolve(undefined),
      supplierName ? loadLastPurchaseRate(supplierName, itemCode) : Promise.resolve(undefined),
    ]);
    const next: PurchaseLine = {
      ...source,
      _itemName: text(item.item_name) || itemCode,
      _itemGroup: text(item.item_group),
      _inventoryMode: mode,
      _materialSpecification: text(item.material_specification),
      _defaultPurchaseUom: defaultPurchaseUom,
      _lastPurchaseRate: lastPurchaseRate,
      item_name: text(item.item_name) || source.item_name,
      item_group: text(item.item_group) || source.item_group,
      inventory_mode: mode,
      measurement_profile: text(item.measurement_profile) || source.measurement_profile,
      material_specification: text(item.material_specification) || source.material_specification,
    } as PurchaseLine;
    if (defaultPurchaseUom && (!text(next.uom) || mode === ALUMINUM_MODE)) next.uom = defaultPurchaseUom;
    if (standardLength !== undefined && positive(source.length_m) === undefined) next.length_m = standardLength;
    return next;
  }, [loadItem, loadLastPurchaseRate, loadStandardLengthM]);

  const requestClose = useCallback(() => {
    if (dirty && typeof window !== "undefined" && !window.confirm("Đơn mua có thay đổi chưa lưu. Bỏ các thay đổi này?")) return;
    props.onCancel();
  }, [dirty, props]);

  useEffect(() => {
    if ((props.closeRequest ?? 0) === closeSeen.current) return;
    closeSeen.current = props.closeRequest ?? 0;
    requestClose();
  }, [props.closeRequest, requestClose]);

  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    let active = true;
    didInitialPreview.current = false;
    setLoading(true);
    setFatal("");
    setPreviewError("");
    previewClock.current = createPurchaseOrderPreviewClock();
    setPreviewPending(0);
    void (async () => {
      try {
        const purchaseMeta = await adapter.getMeta("Purchase Order");
        const itemsField = purchaseMeta.fields.find((field) => field.fieldname === "items" && field.fieldtype === "Table");
        const childDoctype = text(itemsField?.options) || "Purchase Order Item";
        const routeName = text(props.name);
        const [purchaseChildMeta, boot, caps, existingResult] = await Promise.all([
          adapter.getMeta(childDoctype),
          adapter.getBoot(),
          adapter.getCapabilities("Purchase Order", routeName || undefined),
          routeName ? adapter.getDoc("Purchase Order", routeName) : Promise.resolve(null),
        ]);
        if (!active) return;

        const defaults: Json = {
          ...blankFromMeta(purchaseMeta),
          ...applyContextPolicy("Purchase Order", businessContext, contextPolicies).defaults,
        };
        if (!defaults.transaction_date) defaults.transaction_date = today();
        if (purchaseMeta.fields.some((field) => field.fieldname === "schedule_date") && !defaults.schedule_date) defaults.schedule_date = today();
        if (!defaults.company && purchaseMeta.fields.some((field) => field.fieldname === "company")) defaults.company = "ALUMDOOR";
        if (!defaults.currency && purchaseMeta.fields.some((field) => field.fieldname === "currency")) defaults.currency = boot.sysdefaults.currency || "VND";

        const existingDoc = existingResult?.doc as Json | undefined;
        const existingRows = Array.isArray(existingDoc?.items) ? existingDoc!.items as PurchaseLine[] : [];
        const initialRows = existingRows.length
          ? await Promise.all(existingRows.map((row) => hydrateLine({ ...row, doctype: row.doctype || purchaseChildMeta.name } as PurchaseLine)))
          : [newPurchaseLine(purchaseChildMeta, 0)];
        const initialHeader = existingDoc ? { ...defaults, ...existingDoc, items: undefined } : defaults;
        if (existingDoc && text(existingDoc.supplier)) skipSupplierAutofillOnce.current = true;

        setMeta(purchaseMeta);
        setChildMeta(purchaseChildMeta);
        setHeaderState(initialHeader);
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

  const metaField = useCallback((fieldname: string) => meta?.fields.find((field) => field.fieldname === fieldname), [meta]);
  const activeRows = useMemo(() => rows.filter((row) => text(row.item_code)), [rows]);
  const aluminumRows = useMemo(() => activeRows.filter(isAluminumPurchaseLine), [activeRows]);
  const grandTotal = useMemo(() => numberValue(header.grand_total)
    ?? activeRows.reduce((sum, row) => sum + (numberValue(row.amount) ?? ((numberValue(row.qty) ?? 0) * (numberValue(row.rate) ?? 0))), 0), [activeRows, header.grand_total]);
  const totalAluminumKg = useMemo(() => aluminumRows.reduce((sum, row) => sum + (numberValue(row.theoretical_kg ?? row.qty) ?? 0), 0), [aluminumRows]);
  const totalAluminumBars = useMemo(() => aluminumRows.reduce((sum, row) => sum + (numberValue(row.qty_bar) ?? 0), 0), [aluminumRows]);

  const cleanLine = useCallback((line: PurchaseLine): Json => {
    if (!childMeta) return {};
    return cleanChildRow(line, childMeta, isExisting);
  }, [childMeta, isExisting]);

  const requestDocumentPreview = useCallback(async (
    sourceRows: PurchaseLine[],
    sourceHeader: Json,
    changedField: string,
  ): Promise<DocumentPreviewResult> => {
    const items = sourceRows.filter((row) => text(row.item_code)).map(cleanLine);
    if (!items.length) return { patch: {}, clear: [] };
    const result = await adapter.callPost<Json>("alumdoor.ui.preview_document", {
      doctype: "Purchase Order",
      doc: { ...sourceHeader, items },
      changed_field: changedField,
    });
    return {
      patch: result.patch && typeof result.patch === "object" && !Array.isArray(result.patch) ? result.patch as Json : {},
      clear: Array.isArray(result.clear) ? result.clear.map(text).filter(Boolean) : [],
    };
  }, [adapter, cleanLine]);

  const mergeDocumentPreviewSnapshot = useCallback((
    sourceRows: PurchaseLine[],
    sourceHeader: Json,
    result: DocumentPreviewResult,
  ): { rows: PurchaseLine[]; header: Json } => {
    const pricedItems = Array.isArray(result.patch.items) ? result.patch.items as Json[] : [];
    let activeIndex = 0;
    const nextRows = sourceRows.map((row) => {
      if (!text(row.item_code)) return row;
      const priced = pricedItems[activeIndex++];
      return priced ? { ...row, ...priced, _loading: false, _error: "" } as PurchaseLine : row;
    });
    const nextHeader = { ...sourceHeader, ...result.patch };
    delete nextHeader.items;
    for (const fieldname of result.clear) delete nextHeader[fieldname];
    return { rows: nextRows, header: nextHeader };
  }, []);

  const applyDocumentPreviewToLatest = useCallback((
    sourceRows: PurchaseLine[],
    result: DocumentPreviewResult,
  ) => {
    const pricedItems = Array.isArray(result.patch.items) ? result.patch.items as Json[] : [];
    const activeKeys = sourceRows.filter((row) => text(row.item_code)).map((row, index) => purchaseLineKey(row, index));
    const pricedByKey = new Map<string, Json>();
    activeKeys.forEach((key, index) => {
      const priced = pricedItems[index];
      if (priced) pricedByKey.set(key, priced);
    });
    const latestRows = rowsRef.current.map((row, index) => {
      const key = purchaseLineKey(row, index);
      const priced = pricedByKey.get(key);
      return priced ? { ...row, ...priced, _loading: false, _error: "" } as PurchaseLine : row;
    });
    replaceRows(latestRows);
    const nextHeader = { ...headerRef.current, ...result.patch };
    delete nextHeader.items;
    for (const fieldname of result.clear) delete nextHeader[fieldname];
    setHeaderState(nextHeader);
  }, [replaceRows, setHeaderState]);

  const previewDocumentLatest = useCallback(async (
    sourceRows: PurchaseLine[],
    sourceHeader: Json,
    changedField: string,
    showError = true,
  ) => {
    if (!sourceRows.some((row) => text(row.item_code))) return;
    const revision = beginPreview();
    try {
      const result = await requestDocumentPreview(sourceRows, sourceHeader, changedField);
      if (!canApplyPurchaseOrderPreview(previewClock.current, revision)) return;
      setPreviewError("");
      applyDocumentPreviewToLatest(sourceRows, result);
    } catch (error) {
      if (!canApplyPurchaseOrderPreview(previewClock.current, revision)) return;
      const message = mapError(error).message;
      setPreviewError(message);
      if (showError) toast.error(message);
    } finally {
      finishPreview();
    }
  }, [applyDocumentPreviewToLatest, beginPreview, finishPreview, requestDocumentPreview, setPreviewError]);

  const resolveChildLine = useCallback(async (source: PurchaseLine, changedField: string): Promise<PurchaseLine> => {
    if (!childMeta || !text(source.item_code)) return source;
    let hydrated = await hydrateLine(source);
    const defaultPurchaseUom = text(hydrated._defaultPurchaseUom);
    if (isAluminumPurchaseLine(hydrated) && defaultPurchaseUom) hydrated = { ...hydrated, uom: defaultPurchaseUom } as PurchaseLine;
    const preview = await adapter.callPost<Json>("alumdoor.ui.preview_child_row", {
      parent_doctype: "Purchase Order",
      child_doctype: childMeta.name,
      child_fields: childMeta.fields.map((field) => field.fieldname).filter(Boolean),
      parent: { ...headerRef.current, doctype: "Purchase Order", items: undefined },
      row: hydrated,
      changed_field: changedField,
    });
    let resolved = applyChildPreview(hydrated, preview, childMeta);
    if (isAluminumPurchaseLine(resolved) && defaultPurchaseUom) resolved = { ...resolved, uom: defaultPurchaseUom } as PurchaseLine;
    return { ...resolved, _loading: false, _error: "" };
  }, [adapter, childMeta, hydrateLine]);

  const patchLineFromUser = useCallback((key: string, patch: Partial<PurchaseLine>) => {
    markChanged(true);
    const next = rowsRef.current.map((line, index) => purchaseLineKey(line, index) === key
      ? { ...line, ...patch, _loading: false, _error: "" }
      : line);
    replaceRows(next);
    setPreviewError("");
  }, [markChanged, replaceRows, setPreviewError]);

  const patchLineInternal = useCallback((key: string, patch: Partial<PurchaseLine>) => {
    const next = rowsRef.current.map((line, index) => purchaseLineKey(line, index) === key
      ? { ...line, ...patch }
      : line);
    replaceRows(next);
  }, [replaceRows]);

  const commitLine = useCallback((key: string, fieldname: string, value: unknown) => {
    const currentRows = rowsRef.current;
    const index = currentRows.findIndex((line, lineIndex) => purchaseLineKey(line, lineIndex) === key);
    if (index < 0) return;
    const current = currentRows[index]!;
    const actualValue = fieldname === "item_code"
      ? value
      : current[fieldname] !== undefined ? current[fieldname] : value;
    const revision = markChanged(true);
    setPreviewError("");
    let changed = { ...current, [fieldname]: actualValue, _loading: true, _error: "" } as PurchaseLine;
    if (fieldname === "item_code") {
      changed = text(actualValue)
        ? { ...clearItemDerived(current, actualValue), _loading: true, _error: "" }
        : { ...clearItemDerived(current, undefined), _loading: false, _error: "" };
    }
    const nextRows = [...currentRows];
    nextRows[index] = changed;
    replaceRows(nextRows);
    if (!text(changed.item_code)) {
      void previewDocumentLatest(nextRows, headerRef.current, fieldname, false);
      return;
    }

    const seq = (rowPreviewSeq.current.get(key) ?? 0) + 1;
    rowPreviewSeq.current.set(key, seq);
    beginPreview();
    void resolveChildLine(changed, fieldname)
      .then((resolvedLine) => {
        const currentSeq = rowPreviewSeq.current.get(key);
        const currentRevision = canApplyPurchaseOrderPreview(previewClock.current, revision);
        if (currentSeq !== seq || !currentRevision) {
          if (currentSeq === seq) patchLineInternal(key, { _loading: false });
          return;
        }
        const latestRows = rowsRef.current.map((line, lineIndex) => purchaseLineKey(line, lineIndex) === key ? resolvedLine : line);
        replaceRows(latestRows);
        void previewDocumentLatest(latestRows, headerRef.current, fieldname);
      })
      .catch((error) => {
        if (rowPreviewSeq.current.get(key) !== seq || !canApplyPurchaseOrderPreview(previewClock.current, revision)) return;
        const message = mapError(error).message;
        patchLineInternal(key, { _loading: false, _error: message });
      })
      .finally(() => finishPreview());
  }, [beginPreview, finishPreview, markChanged, patchLineInternal, previewDocumentLatest, replaceRows, resolveChildLine, setPreviewError]);

  const setHeaderField = useCallback((fieldname: string, value: unknown) => {
    const revision = markChanged(true);
    const next = { ...headerRef.current, [fieldname]: value };
    if (fieldname === "supplier") {
      next.supplier_group = undefined;
      next.buying_price_list = undefined;
      next.payment_terms = undefined;
      next.contact_person = undefined;
      supplierHydrationSeq.current += 1;
    }
    setHeaderState(next);
    setPreviewError("");
    if (PRICING_HEADER_FIELDS.has(fieldname) && fieldname !== "supplier" && rowsRef.current.some((row) => text(row.item_code))) {
      void previewDocumentLatest(rowsRef.current, next, fieldname, true);
    }
    return revision;
  }, [markChanged, previewDocumentLatest, setHeaderState, setPreviewError]);

  useEffect(() => {
    const supplierName = text(header.supplier);
    if (!supplierName || !meta || loading || formReadOnly) return;
    if (skipSupplierAutofillOnce.current) {
      skipSupplierAutofillOnce.current = false;
      return;
    }
    const seq = ++supplierHydrationSeq.current;
    let active = true;
    void adapter.getDoc("Supplier", supplierName).then(({ doc }) => {
      if (!active || seq !== supplierHydrationSeq.current || text(headerRef.current.supplier) !== supplierName) return;
      const supplier = doc as Json;
      markChanged(true);
      const next = {
        ...headerRef.current,
        supplier_group: text(supplier.supplier_group) || undefined,
        buying_price_list: text(supplier.buying_price_list) || text(supplier.default_buying_price_list) || undefined,
        payment_terms: text(supplier.payment_terms) || undefined,
        contact_person: text(supplier.contact_person) || undefined,
      };
      setHeaderState(next);
      setPreviewError("");
      if (rowsRef.current.some((row) => text(row.item_code))) void previewDocumentLatest(rowsRef.current, next, "supplier", true);
    }).catch((error) => {
      if (!active || seq !== supplierHydrationSeq.current) return;
      toast.error(`Không đọc được Nhà cung cấp ${supplierName}: ${mapError(error).message}`);
    });
    return () => { active = false; };
  }, [adapter, formReadOnly, header.supplier, loading, markChanged, meta, previewDocumentLatest, setHeaderState, setPreviewError]);

  /**
   * Lịch sử giá theo NCC (`buildSupplierPriceHistory`, `clouderp-core/procurement-analytics.ts`)
   * — nối qua route `metaforge.api.supplier_price_history`. Trước đây hàm này có công thức
   * đúng cho câu hỏi "giá lệch bao nhiêu % so với lần mua trước" nhưng 0 route/UI nào gọi
   * (audit vòng 3, ca S3). Tải MỘT LẦN theo NCC (không theo từng dòng) rồi tra theo mã hàng
   * khi hiển thị dòng — xem `priceHistoryByItem` truyền cho `AlumdoorPurchaseOrderItemsGrid`.
   */
  const [priceHistoryByItem, setPriceHistoryByItem] = useState<Map<string, number | null>>(new Map());
  useEffect(() => {
    const supplierName = text(header.supplier);
    if (!supplierName) { setPriceHistoryByItem(new Map()); return; }
    let active = true;
    adapter.callPost<Json>("metaforge.api.supplier_price_history", { supplier: supplierName }).then((result) => {
      if (!active) return;
      const series = Array.isArray(result.price_history) ? result.price_history as Json[] : [];
      const byItem = new Map<string, number | null>();
      for (const row of series) {
        const itemCode = text(row.item_code);
        if (itemCode && !byItem.has(itemCode)) byItem.set(itemCode, (row.latest_change_bps as number | null) ?? null);
      }
      setPriceHistoryByItem(byItem);
    }).catch(() => { if (active) setPriceHistoryByItem(new Map()); });
    return () => { active = false; };
  }, [adapter, header.supplier]);

  const addLine = useCallback(() => {
    if (!childMeta) return;
    markChanged(true);
    replaceRows([...rowsRef.current, newPurchaseLine(childMeta, rowsRef.current.length)]);
  }, [childMeta, markChanged, replaceRows]);

  const addFive = useCallback(() => {
    if (!childMeta) return;
    markChanged(true);
    const base = rowsRef.current.length;
    replaceRows([
      ...rowsRef.current,
      ...Array.from({ length: 5 }, (_, index) => newPurchaseLine(childMeta, base + index)),
    ]);
  }, [childMeta, markChanged, replaceRows]);

  const duplicateLine = useCallback((key: string) => {
    if (!childMeta) return;
    const current = rowsRef.current;
    const index = current.findIndex((line, lineIndex) => purchaseLineKey(line, lineIndex) === key);
    if (index < 0) return;
    markChanged(true);
    const source = current[index]!;
    const copy: PurchaseLine = {
      ...source,
      name: `new-purchase-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      doctype: childMeta.name,
      _loading: false,
      _error: "",
    } as PurchaseLine;
    const next = [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    replaceRows(next);
    void previewDocumentLatest(next, headerRef.current, "items", false);
  }, [childMeta, markChanged, previewDocumentLatest, replaceRows]);

  const deleteLine = useCallback((key: string) => {
    if (!childMeta) return;
    markChanged(true);
    rowPreviewSeq.current.set(key, (rowPreviewSeq.current.get(key) ?? 0) + 1);
    const filtered = rowsRef.current.filter((line, index) => purchaseLineKey(line, index) !== key);
    const next = filtered.length ? filtered : [newPurchaseLine(childMeta, 0)];
    replaceRows(next);
    if (next.some((row) => text(row.item_code))) void previewDocumentLatest(next, headerRef.current, "items", false);
    else {
      const cleanHeader = { ...headerRef.current, net_total: 0, grand_total: 0, rounded_total: 0, total_amount: 0 };
      setHeaderState(cleanHeader);
      setPreviewError("");
    }
  }, [childMeta, markChanged, previewDocumentLatest, replaceRows, setHeaderState, setPreviewError]);

  const resolveAllRowsSnapshot = useCallback(async (
    sourceRows: PurchaseLine[],
    sourceHeader: Json,
    changedField: string,
  ): Promise<{ rows: PurchaseLine[]; header: Json }> => {
    const childResolved = await Promise.all(sourceRows.map((row) => text(row.item_code) ? resolveChildLine(row, changedField) : row));
    const documentResult = await requestDocumentPreview(childResolved, sourceHeader, changedField);
    return mergeDocumentPreviewSnapshot(childResolved, sourceHeader, documentResult);
  }, [mergeDocumentPreviewSnapshot, requestDocumentPreview, resolveChildLine]);

  const refreshAll = useCallback(async (showToast = true, changedField = "manual_refresh") => {
    if (!rowsRef.current.some((row) => text(row.item_code))) return;
    const revision = previewClock.current.revision;
    setRefreshing(true);
    setPreviewError("");
    try {
      const resolved = await resolveAllRowsSnapshot(rowsRef.current, headerRef.current, changedField);
      if (!canApplyPurchaseOrderPreview(previewClock.current, revision)) return;
      replaceRows(resolved.rows);
      setHeaderState(resolved.header);
      setPreviewError("");
      if (showToast) toast.success("Đã tính lại quy cách, giá mua và thành tiền.");
    } catch (error) {
      if (!canApplyPurchaseOrderPreview(previewClock.current, revision)) return;
      const message = mapError(error).message;
      setPreviewError(message);
      if (showToast) toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }, [replaceRows, resolveAllRowsSnapshot, setHeaderState, setPreviewError]);

  useEffect(() => {
    if (loading || !childMeta || didInitialPreview.current) return;
    didInitialPreview.current = true;
    if (!rowsRef.current.some((row) => text(row.item_code))) return;
    void refreshAll(false, "initial_load");
  }, [childMeta, loading, refreshAll]);

  const validateRows = useCallback((resolvedRows: PurchaseLine[], resolvedHeader: Json): string | null => {
    if (previewClock.current.pending > 0) return "Đơn đang tính lại dữ liệu từ server, hãy chờ hoàn tất trước khi lưu.";
    if (text(previewErrorRef.current)) return `Cần xử lý lỗi tính lại trước khi lưu: ${text(previewErrorRef.current)}`;
    if (!text(resolvedHeader.supplier)) return "Cần chọn nhà cung cấp.";
    if (!text(resolvedHeader.company)) return "Đơn mua chưa có Công ty.";
    if (!text(resolvedHeader.currency)) return "Đơn mua chưa có Tiền tệ.";
    if (!text(resolvedHeader.transaction_date)) return "Cần ngày đặt hàng.";
    if (meta?.fields.some((field) => field.fieldname === "schedule_date" && field.reqd) && !text(resolvedHeader.schedule_date)) return "Cần ngày giao dự kiến.";
    const active = resolvedRows.filter((row) => text(row.item_code));
    if (!active.length) return "Cần ít nhất một mặt hàng.";
    for (const [index, row] of active.entries()) {
      const position = index + 1;
      if (row._loading) return `Dòng ${position} đang tính lại.`;
      if (text(row._error)) return `Dòng ${position}: ${text(row._error)}`;
      for (const [fieldname, rule] of Object.entries(row._overrides ?? {}) as Array<[string, { hidden?: number | boolean; reqd?: number | boolean; label?: string }]>) {
        const hidden = rule.hidden === true || rule.hidden === 1;
        const required = rule.reqd === true || rule.reqd === 1;
        if (hidden || !required) continue;
        if (rowValueMissing(row[fieldname])) return `Dòng ${position}: thiếu ${text(rule.label) || fieldname}.`;
      }
      if (!text(row.uom)) return `Dòng ${position}: thiếu ĐVT mua.`;
      if (!positive(row.qty)) return `Dòng ${position}: số lượng tính tiền phải lớn hơn 0.`;
      const rate = numberValue(row.rate);
      if (rate === undefined || rate < 0) return `Dòng ${position}: chưa có đơn giá mua hợp lệ.`;
      if (!isAluminumPurchaseLine(row)) continue;

      const purchaseUom = text(row._defaultPurchaseUom) || text(row.uom);
      if (normalized(purchaseUom) !== "kg" || normalized(row.uom) !== "kg") return `Dòng ${position}: nhôm phải mua theo Kg.`;
      const length = positive(row.length_m);
      const bars = positive(row.qty_bar);
      const kgPerM = positive(row.theoretical_kg_per_m);
      if (purchaseFieldRequired(row, "length_m") && !length) return `Dòng ${position}: nhôm phải có chiều dài một cây/lá.`;
      if (purchaseFieldRequired(row, "qty_bar") && (!bars || !Number.isInteger(bars))) return `Dòng ${position}: số cây/lá phải là số nguyên dương.`;
      if (!kgPerM) return `Dòng ${position}: chưa có barem kg/m từ quy cách.`;
      if (purchaseFieldRequired(row, "color") && !text(row.color)) return `Dòng ${position}: phải chọn Màu.`;
      if (purchaseFieldRequired(row, "is_stamped") && !["Có", "Không"].includes(text(row.is_stamped))) return `Dòng ${position}: phải chọn Dập Có/Không.`;
      if (!length || !bars) return `Dòng ${position}: chưa đủ kích thước/số cây để tính Kg đặt.`;
      const expectedKg = length * bars * kgPerM;
      if (!nearlyEqual(row.theoretical_kg, expectedKg)) return `Dòng ${position}: Kg đặt không khớp Dài cây × Số cây × Kg/m.`;
      if (!nearlyEqual(row.qty, expectedKg)) return `Dòng ${position}: SL tính tiền Kg không khớp barem.`;
      if (row.amount !== undefined && row.amount !== null && row.amount !== "" && !nearlyEqual(row.amount, expectedKg * rate, 0.5)) {
        return `Dòng ${position}: Thành tiền chưa khớp Kg đặt × Đơn giá.`;
      }
    }
    return null;
  }, [meta]);

  const invalidatePurchaseQueries = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", "Purchase Order"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "list", "Purchase Order"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "count", "Purchase Order"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "overview"], refetchType: "none" }),
    ]).catch(() => undefined);
  }, [queryClient, scopeKey]);

  const adoptSavedDocument = useCallback(async (doc: Doc, fallbackRows: PurchaseLine[]) => {
    const saved = doc as Json;
    const savedName = text(saved.name) || workingName;
    if (savedName) setWorkingName(savedName);
    setSourceModified(text(saved.modified));
    setDocstatus(Number(saved.docstatus) || 0);
    setHeaderState({ ...headerRef.current, ...saved, items: undefined });
    const savedRows = Array.isArray(saved.items) ? saved.items as PurchaseLine[] : [];
    if (savedRows.length) {
      const hydrated = await Promise.all(savedRows.map((row) => hydrateLine(row)));
      replaceRows(hydrated);
    } else {
      replaceRows(fallbackRows);
    }
    setDirty(false);
    if (savedName) {
      void adapter.getCapabilities("Purchase Order", savedName).then((caps) => {
        setCanWrite(Boolean(caps.write));
        setSubmitAllowed(Boolean(caps.submit));
      }).catch(() => undefined);
    }
  }, [adapter, hydrateLine, replaceRows, setHeaderState, workingName]);

  const save = useCallback(async (submitAfterSave: boolean) => {
    if (!meta || !childMeta || formReadOnly) return;
    if (previewClock.current.pending > 0) {
      toast.error("Đơn đang tính lại dữ liệu từ server. Chờ hoàn tất rồi lưu.");
      return;
    }
    if (text(previewErrorRef.current)) {
      toast.error(`Cần xử lý lỗi tính lại trước khi lưu: ${text(previewErrorRef.current)}`);
      return;
    }
    setSaving(true);
    const saveRevision = markChanged(false);
    try {
      const sourceRows = rowsRef.current;
      const sourceHeader = headerRef.current;
      const resolved = await resolveAllRowsSnapshot(sourceRows, sourceHeader, "__save__");
      if (!canApplyPurchaseOrderPreview(previewClock.current, saveRevision)) throw new Error("Dữ liệu đã thay đổi trong lúc chuẩn bị lưu. Hãy lưu lại lần nữa.");
      replaceRows(resolved.rows);
      setHeaderState(resolved.header);
      setPreviewError("");
      const validationError = validateRows(resolved.rows, resolved.header);
      if (validationError) {
        toast.error(validationError);
        return;
      }

      const document: Json = {};
      for (const field of meta.fields ?? []) {
        if (field.fieldname === "items") continue;
        const value = fieldValueForServer(field.fieldtype, resolved.header[field.fieldname]);
        if (value !== undefined) document[field.fieldname] = value;
      }
      for (const fieldname of PURCHASE_CONTEXT_FIELDS) {
        const value = resolved.header[fieldname];
        if (value !== undefined && value !== null && value !== "") document[fieldname] = value;
      }
      document.items = resolved.rows
        .filter((row) => text(row.item_code))
        .map((row) => cleanChildRow(row, childMeta, isExisting));
      const payload = serializeCreateDocument(meta, document) as Partial<Doc>;
      const existingName = workingName;
      const saved = existingName
        ? await adapter.updateDoc("Purchase Order", existingName, payload, sourceModified)
        : await adapter.createDoc("Purchase Order", payload);
      const savedName = text(saved.name) || existingName;

      await adoptSavedDocument(saved, resolved.rows);
      invalidatePurchaseQueries();

      if (submitAfterSave) {
        try {
          const submitted = await adapter.submit(saved);
          await adoptSavedDocument(submitted, resolved.rows);
          invalidatePurchaseQueries();
          toast.success(`Đã ghi sổ đơn mua ${savedName}`);
        } catch (submitError) {
          toast.error(`Đã lưu nháp ${savedName}, nhưng chưa ghi sổ được: ${mapError(submitError).message}`);
          if (existingName) props.onSaved?.(savedName);
          else props.onCreated(savedName);
          return;
        }
      } else {
        toast.success(existingName ? `Đã lưu đơn mua ${savedName}` : `Đã lưu nháp đơn mua ${savedName}`);
      }

      if (existingName) props.onSaved?.(savedName);
      else props.onCreated(savedName);
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSaving(false);
    }
  }, [adapter, adoptSavedDocument, childMeta, formReadOnly, invalidatePurchaseQueries, isExisting, markChanged, meta, props, replaceRows, resolveAllRowsSnapshot, setHeaderState, setPreviewError, sourceModified, validateRows, workingName]);

  if (loading) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Đang mở màn mua hàng AlumDoor…</span></div>;
  }
  if (fatal) return <div className="p-6 text-sm text-destructive">{fatal}</div>;
  if (!meta || !childMeta) return <div className="p-6 text-sm text-muted-foreground">Không đọc được cấu trúc Purchase Order.</div>;

  const headerField = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string) =>
    metaField(fieldname) ?? fallbackField(fieldname, label, fieldtype, options);
  const headerControl = (
    fieldname: string,
    label: string,
    fieldtype: DocField["fieldtype"] = "Data",
    options?: string,
  ) => {
    const field = headerField(fieldname, label, fieldtype, options);
    return (
      <AlumdoorSalesOrderField
        id={`purchase-order-header-${fieldname}`}
        field={field}
        value={header[fieldname]}
        onChange={(value) => setHeaderField(fieldname, fieldValueForServer(field.fieldtype, value))}
        registry={registry}
        services={purchaseServices}
        parentDoctype="Purchase Order"
        docValues={header}
        roles={roles}
        required={Boolean(field.reqd)}
        readOnly={formReadOnly || interactionBusy || Boolean(field.read_only)}
        compact
        className={`[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_button]:!h-8 ${fieldname === "note" ? "[&_textarea]:!h-8 [&_textarea]:!min-h-8 [&_textarea]:!resize-none [&_textarea]:!py-1" : ""}`}
      />
    );
  };

  const hasField = (fieldname: string) => Boolean(metaField(fieldname));
  const previewReady = activeRows.length > 0
    && previewPending === 0
    && !text(previewError)
    && !rows.some((row) => row._loading || text(row._error));
  const saveDisabled = interactionBusy || !canSave || !activeRows.length || rows.some((row) => row._loading || text(row._error));

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-purchase-order-stable">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="w-full space-y-3 px-3 py-3">
          {formReadOnly ? <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">Đơn đã ghi sổ/khóa hoặc tài khoản không có quyền sửa.</div> : null}

          <fieldset disabled={formReadOnly || interactionBusy} className="contents">
            <section className="rounded-lg border bg-card p-2.5" data-section="purchase-order-header">
              <div className="space-y-2">
                <div className="grid gap-x-2 gap-y-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.35fr)_minmax(165px,0.75fr)_minmax(210px,0.95fr)_minmax(175px,0.8fr)_minmax(175px,0.8fr)]">
                  {headerControl("supplier", "Nhà cung cấp", "Link", "Supplier")}
                  {headerControl("supplier_group", "Nhóm NCC", "Select", PURCHASE_SUPPLIER_GROUPS.join("\n"))}
                  {headerControl("buying_price_list", "Bảng giá mua", "Link", "Price List")}
                  {headerControl("transaction_date", "Ngày đặt hàng", "Date")}
                  {hasField("schedule_date") ? headerControl("schedule_date", "Ngày giao dự kiến", "Date") : <div />}
                </div>
                <div className="grid gap-x-2 gap-y-2 md:grid-cols-2 xl:grid-cols-[minmax(150px,0.65fr)_minmax(230px,1fr)_minmax(230px,1fr)_minmax(230px,1fr)_minmax(360px,1.6fr)]">
                  {hasField("priority") ? headerControl("priority", "Mức độ", "Select") : <div />}
                  {hasField("supplier_quotation") ? headerControl("supplier_quotation", "Theo báo giá NCC", "Link", "Supplier Quotation") : <div />}
                  {hasField("material_request") ? headerControl("material_request", "Theo yêu cầu vật tư", "Link", "Material Request") : <div />}
                  {hasField("payment_terms") ? headerControl("payment_terms", "Thanh toán", metaField("payment_terms")!.fieldtype, metaField("payment_terms")!.options) : <div />}
                  {hasField("note") ? headerControl("note", "Ghi chú", metaField("note")!.fieldtype) : <div />}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[10px] text-muted-foreground">
                <span>Công ty: <strong className="font-medium text-foreground">{text(header.company) || "—"}</strong></span>
                <span>Tiền tệ: <strong className="font-medium text-foreground">{text(header.currency) || "VND"}</strong></span>
                {isExisting ? (
                  <>
                    <span>Đã nhận: <strong className="font-medium text-foreground">{text(header.received_percentage) || "0"}%</strong></span>
                    <span>Đã xuất HĐ: <strong className="font-medium text-foreground">{text(header.billed_percentage) || "0"}%</strong></span>
                  </>
                ) : null}
              </div>
            </section>

            <AlumdoorPurchaseOrderItemsGrid
              lines={rows}
              childMeta={childMeta}
              registry={registry}
              services={purchaseServices}
              roles={roles}
              readOnly={formReadOnly || interactionBusy}
              priceLocked={Boolean(text(header.buying_price_list))}
              priceHistoryByItem={priceHistoryByItem}
              onPatch={patchLineFromUser}
              onCommit={commitLine}
              onAdd={addLine}
              onAddFive={addFive}
              onDuplicate={duplicateLine}
              onDelete={deleteLine}
            />

            <section className="rounded-lg border bg-card" data-section="purchase-order-summary" aria-label="Tóm tắt đơn mua">
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-5">
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Dòng hàng</div><div className="mt-0.5 font-semibold tabular-nums">{activeRows.length}</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Dòng nhôm</div><div className="mt-0.5 font-semibold tabular-nums">{aluminumRows.length}</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Số cây/lá đặt</div><div className="mt-0.5 font-semibold tabular-nums">{quantity(totalAluminumBars, 0)}</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Kg nhôm</div><div className="mt-0.5 font-semibold tabular-nums">{quantity(totalAluminumKg)} kg</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] font-semibold text-muted-foreground">Tạm tính</div><div className="mt-0.5 text-lg font-bold tabular-nums text-primary">{money(grandTotal)} ₫</div></div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-[11px]">
                {previewPending > 0 || refreshing ? <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> Đang tính lại ({previewPending})</span>
                  : text(previewError) ? <span className="text-destructive">{previewError}</span>
                    : previewReady ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5" /> Dữ liệu preview đã sẵn sàng</span>
                      : <span className="text-muted-foreground">{activeRows.length ? "Còn dòng cần hoàn tất" : "Chưa có dòng hàng"}</span>}
                <span className="ml-auto text-muted-foreground">Bảng giá mua: <strong className="font-medium text-foreground">{text(header.buying_price_list) || "Chưa chọn"}</strong></span>
              </div>
            </section>
          </fieldset>
        </div>
      </div>

      <div className="shrink-0 border-t bg-card px-3 py-1.5 shadow-[0_-4px_14px_rgba(0,0,0,0.035)]">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{docstatus === 1 ? "Đã ghi sổ" : isExisting ? (dirty ? "Nháp có thay đổi chưa lưu" : "Nháp đã đồng bộ") : activeRows.length ? "Đơn mua chưa lưu" : "Nhập mặt hàng để bắt đầu"}</span>
            <strong className="tabular-nums">Tạm tính: {money(grandTotal)} ₫</strong>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {docstatus === 1 && workingName ? <Button type="button" variant="outline" size="sm" disabled={taoPhieuNhap} onClick={() => void moPhieuNhap()}>
              {taoPhieuNhap ? <Loader2 className="size-3.5 animate-spin" /> : <PackagePlus className="size-3.5" />} Đơn mua → Phiếu nhập
            </Button> : null}
            {isExisting && props.onPreviewCreated ? <Button type="button" variant="outline" size="sm" onClick={() => props.onPreviewCreated?.(workingName)}><Eye className="size-3.5" /> In / xem</Button> : null}
            <Button type="button" variant="ghost" size="sm" onClick={requestClose}>{isExisting ? "Đóng" : "Hủy"}</Button>
            <Button type="button" variant="outline" size="sm" disabled={interactionBusy || previewPending > 0 || formReadOnly || !activeRows.length} onClick={() => void refreshAll(true)}>
              {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Tính lại
            </Button>
            {docstatus === 0 ? <Button type="button" variant="outline" size="sm" disabled={saveDisabled} onClick={() => void save(false)}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Lưu nháp
            </Button> : null}
            {docstatus === 0 && submitAllowed ? <Button type="button" size="sm" disabled={saveDisabled} onClick={() => void save(true)}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Ghi sổ đơn
            </Button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
