/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RefreshCw, Save, Send, X } from "lucide-react";
import {
  applyContextPolicy,
  mapError,
  serializeCreateDocument,
  type Doc,
  type DocField,
  type DocTypeMeta,
} from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";
import { Button, toast } from "@metaforge/ui";
import { useMetaForge } from "../../../container/provider.js";
import { salesItemSearchTerms } from "./sales-item-search.js";
import {
  AlumdoorPurchaseOrderItemsGrid,
  isAluminumPurchaseLine,
  purchaseLineKey,
  type PurchaseLine,
} from "./AlumdoorPurchaseOrderItemsGrid.js";
import { AlumdoorSalesOrderField, fallbackField } from "./sales-order-v2/AlumdoorSalesOrderField.js";

type Json = Record<string, unknown>;

const PURCHASE_SUPPLIER_GROUPS = ["Nhôm", "Mô tơ", "Sơn", "Phụ kiện", "Vận chuyển", "Khác"];
const PURCHASE_CONTEXT_FIELDS = new Set(["supplier_group", "buying_price_list"]);
const ALUMINUM_MODE = "Nhôm cây/lá";

export interface AlumdoorPurchaseOrderCreateProps {
  name?: string;
  closeRequest?: number;
  onCreated: (name: string) => void;
  onSaved?: (name: string) => void;
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
  const parsed = numberValue(value) ?? 0;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(parsed);
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
    name: `new-purchase-row-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
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
  return {
    ...(filters ?? {}),
    is_purchase_item: 1,
    disabled: 0,
  };
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
  const closeSeen = useRef(props.closeRequest ?? 0);
  const itemCache = useRef(new Map<string, Json>());
  const skipSupplierAutofillOnce = useRef(false);
  const pricingPreviewSeq = useRef(0);
  const rowPreviewSeq = useRef(new Map<string, number>());

  const documentName = text(props.name);
  const isExisting = Boolean(documentName);
  const formReadOnly = isExisting && (!canWrite || docstatus !== 0);
  const canSave = isExisting ? !formReadOnly : canCreate;

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

  const hydrateLine = useCallback(async (source: PurchaseLine): Promise<PurchaseLine> => {
    const itemCode = text(source.item_code);
    if (!itemCode) return source;
    const item = await loadItem(itemCode);
    const mode = text(item.inventory_mode) || "Hàng thường";
    const defaultPurchaseUom = text(item.default_purchase_uom) || text(item.stock_uom);
    const next: PurchaseLine = {
      ...source,
      _itemName: text(item.item_name) || itemCode,
      _itemGroup: text(item.item_group),
      _inventoryMode: mode,
      _materialSpecification: text(item.material_specification),
      _defaultPurchaseUom: defaultPurchaseUom,
      item_name: text(item.item_name) || source.item_name,
      inventory_mode: mode,
      material_specification: text(item.material_specification) || source.material_specification,
    } as PurchaseLine;
    // Purchase UOM is a master decision, not a free-form line decision. Aluminum in particular
    // is priced in Kg while qty_bar remains the counted physical quantity.
    if (defaultPurchaseUom && (!text(next.uom) || mode === ALUMINUM_MODE)) next.uom = defaultPurchaseUom;
    return next;
  }, [loadItem]);

  useEffect(() => {
    if ((props.closeRequest ?? 0) === closeSeen.current) return;
    closeSeen.current = props.closeRequest ?? 0;
    props.onCancel();
  }, [props.closeRequest, props.onCancel]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const purchaseMeta = await adapter.getMeta("Purchase Order");
        const itemsField = purchaseMeta.fields.find((field) => field.fieldname === "items" && field.fieldtype === "Table");
        const childDoctype = text(itemsField?.options) || "Purchase Order Item";
        const [purchaseChildMeta, boot, caps, existingResult] = await Promise.all([
          adapter.getMeta(childDoctype),
          adapter.getBoot(),
          adapter.getCapabilities("Purchase Order", documentName || undefined),
          documentName ? adapter.getDoc("Purchase Order", documentName) : Promise.resolve(null),
        ]);
        if (!active) return;

        const defaults: Json = {
          ...blankFromMeta(purchaseMeta),
          ...applyContextPolicy("Purchase Order", businessContext, contextPolicies).defaults,
        };
        if (!defaults.transaction_date) defaults.transaction_date = today();
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
        setSourceModified(text(existingDoc?.modified));
        setDocstatus(Number(existingDoc?.docstatus) || 0);
        setCanCreate(Boolean(caps.create));
        setCanWrite(Boolean(caps.write));
        setSubmitAllowed(Boolean(caps.submit));
      } catch (error) {
        if (active) setFatal(mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, businessContext, contextPolicies, documentName, hydrateLine, setHeaderState]);

  const metaField = useCallback((fieldname: string) => meta?.fields.find((field) => field.fieldname === fieldname), [meta]);
  const setHeaderField = useCallback((fieldname: string, value: unknown) => {
    const next = { ...headerRef.current, [fieldname]: value };
    if (fieldname === "supplier") {
      next.supplier_group = undefined;
      next.buying_price_list = undefined;
      next.payment_terms = undefined;
      next.contact_person = undefined;
    }
    setHeaderState(next);
  }, [setHeaderState]);

  useEffect(() => {
    const supplierName = text(header.supplier);
    if (!supplierName || !meta || loading || formReadOnly) return;
    if (skipSupplierAutofillOnce.current) {
      skipSupplierAutofillOnce.current = false;
      return;
    }
    let active = true;
    void adapter.getDoc("Supplier", supplierName).then(({ doc }) => {
      if (!active) return;
      const supplier = doc as Json;
      setHeaderState({
        ...headerRef.current,
        supplier_group: text(supplier.supplier_group) || undefined,
        buying_price_list: text(supplier.buying_price_list) || text(supplier.default_buying_price_list) || undefined,
        payment_terms: text(supplier.payment_terms) || undefined,
        contact_person: text(supplier.contact_person) || undefined,
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [adapter, formReadOnly, header.supplier, loading, meta, setHeaderState]);

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

  const previewPurchaseDocument = useCallback(async (
    sourceRows: PurchaseLine[],
    sourceHeader: Json,
    changedField: string,
  ): Promise<{ rows: PurchaseLine[]; header: Json }> => {
    const positions: number[] = [];
    const items: Json[] = [];
    sourceRows.forEach((row, index) => {
      if (!text(row.item_code)) return;
      positions.push(index);
      items.push(cleanLine(row));
    });
    if (!items.length) return { rows: sourceRows, header: sourceHeader };
    const result = await adapter.callPost<Json>("alumdoor.ui.preview_document", {
      doctype: "Purchase Order",
      doc: { ...sourceHeader, items },
      changed_field: changedField,
    });
    const patch = result.patch && typeof result.patch === "object" && !Array.isArray(result.patch)
      ? result.patch as Json
      : {};
    const pricedItems = Array.isArray(patch.items) ? patch.items as Json[] : [];
    const nextRows = [...sourceRows];
    positions.forEach((position, activeIndex) => {
      const priced = pricedItems[activeIndex];
      if (priced) nextRows[position] = { ...nextRows[position], ...priced } as PurchaseLine;
    });
    const nextHeader = { ...sourceHeader, ...patch };
    delete nextHeader.items;
    for (const fieldname of Array.isArray(result.clear) ? result.clear.map(text) : []) delete nextHeader[fieldname];
    return { rows: nextRows, header: nextHeader };
  }, [adapter, cleanLine]);

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

  const resolveRowsFromAuthority = useCallback(async (
    sourceRows: PurchaseLine[],
    changedField: string,
    changedKey?: string,
    sourceHeader = headerRef.current,
  ): Promise<{ rows: PurchaseLine[]; header: Json }> => {
    const childResolved = await Promise.all(sourceRows.map(async (row, index) => {
      if (!text(row.item_code)) return row;
      const key = purchaseLineKey(row, index);
      if (changedKey && key !== changedKey) return row;
      return resolveChildLine(row, changedField);
    }));
    return previewPurchaseDocument(childResolved, sourceHeader, changedField);
  }, [previewPurchaseDocument, resolveChildLine]);

  const patchLine = useCallback((key: string, patch: Partial<PurchaseLine>) => {
    const next = rowsRef.current.map((line, index) => purchaseLineKey(line, index) === key
      ? { ...line, ...patch, _error: "" }
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
    let changed = { ...current, [fieldname]: actualValue, _loading: true, _error: "" } as PurchaseLine;
    if (fieldname === "item_code") {
      changed = text(actualValue)
        ? { ...clearItemDerived(current, actualValue), _loading: true, _error: "" }
        : { ...clearItemDerived(current, undefined), _loading: false, _error: "" };
    }
    const nextRows = [...currentRows];
    nextRows[index] = changed;
    replaceRows(nextRows);
    if (!text(changed.item_code)) return;

    const seq = (rowPreviewSeq.current.get(key) ?? 0) + 1;
    rowPreviewSeq.current.set(key, seq);
    void resolveRowsFromAuthority(nextRows, fieldname, key)
      .then((resolved) => {
        if (rowPreviewSeq.current.get(key) !== seq) return;
        replaceRows(resolved.rows);
        setHeaderState(resolved.header);
      })
      .catch((error) => {
        if (rowPreviewSeq.current.get(key) !== seq) return;
        patchLine(key, { _loading: false, _error: mapError(error).message });
      });
  }, [patchLine, replaceRows, resolveRowsFromAuthority, setHeaderState]);

  const addLine = useCallback(() => {
    if (!childMeta) return;
    replaceRows([...rowsRef.current, newPurchaseLine(childMeta, rowsRef.current.length)]);
  }, [childMeta, replaceRows]);

  const addFive = useCallback(() => {
    if (!childMeta) return;
    const base = rowsRef.current.length;
    replaceRows([
      ...rowsRef.current,
      ...Array.from({ length: 5 }, (_, index) => newPurchaseLine(childMeta, base + index)),
    ]);
  }, [childMeta, replaceRows]);

  const duplicateLine = useCallback((key: string) => {
    if (!childMeta) return;
    const source = rowsRef.current.find((line, index) => purchaseLineKey(line, index) === key);
    if (!source) return;
    const copy: PurchaseLine = {
      ...source,
      name: `new-purchase-row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      doctype: childMeta.name,
      _loading: false,
      _error: "",
    } as PurchaseLine;
    replaceRows([...rowsRef.current, copy]);
  }, [childMeta, replaceRows]);

  const deleteLine = useCallback((key: string) => {
    if (!childMeta) return;
    const next = rowsRef.current.filter((line, index) => purchaseLineKey(line, index) !== key);
    replaceRows(next.length ? next : [newPurchaseLine(childMeta, 0)]);
  }, [childMeta, replaceRows]);

  const refreshAll = useCallback(async (showToast = true) => {
    if (!childMeta || !rowsRef.current.some((row) => text(row.item_code))) return;
    setRefreshing(true);
    const seq = ++pricingPreviewSeq.current;
    try {
      const resolved = await resolveRowsFromAuthority(rowsRef.current, "manual_refresh");
      if (pricingPreviewSeq.current !== seq) return;
      replaceRows(resolved.rows);
      setHeaderState(resolved.header);
      if (showToast) toast.success("Đã tính lại quy cách, giá mua và thành tiền theo dữ liệu hiện tại.");
    } catch (error) {
      if (pricingPreviewSeq.current === seq) toast.error(mapError(error).message);
    } finally {
      setRefreshing(false);
    }
  }, [childMeta, replaceRows, resolveRowsFromAuthority, setHeaderState]);

  const pricingSignature = useMemo(() => [
    text(header.supplier),
    text(header.supplier_group),
    text(header.buying_price_list),
    text(header.transaction_date),
    text(header.currency),
  ].join("\u001f"), [header.buying_price_list, header.currency, header.supplier, header.supplier_group, header.transaction_date]);

  useEffect(() => {
    if (loading || formReadOnly || !activeRows.length) return;
    const timer = window.setTimeout(() => {
      const seq = ++pricingPreviewSeq.current;
      void previewPurchaseDocument(rowsRef.current, headerRef.current, "pricing_context")
        .then((resolved) => {
          if (pricingPreviewSeq.current !== seq) return;
          replaceRows(resolved.rows.map((row) => ({ ...row, _loading: false })));
          setHeaderState(resolved.header);
        })
        .catch((error) => {
          if (pricingPreviewSeq.current === seq) toast.error(mapError(error).message);
        });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [activeRows.length, formReadOnly, loading, previewPurchaseDocument, pricingSignature, replaceRows, setHeaderState]);

  const validateRows = useCallback((resolvedRows: PurchaseLine[], resolvedHeader: Json): string | null => {
    if (!text(resolvedHeader.supplier)) return "Cần chọn nhà cung cấp.";
    if (!text(resolvedHeader.company)) return "Đơn mua chưa có Công ty.";
    if (!text(resolvedHeader.currency)) return "Đơn mua chưa có Tiền tệ.";
    if (!text(resolvedHeader.transaction_date)) return "Cần ngày đặt hàng.";
    const active = resolvedRows.filter((row) => text(row.item_code));
    if (!active.length) return "Cần ít nhất một mặt hàng.";
    for (const [index, row] of active.entries()) {
      const position = index + 1;
      if (!text(row.uom)) return `Dòng ${position}: thiếu ĐVT mua.`;
      if (!positive(row.qty)) return `Dòng ${position}: số lượng tính tiền phải lớn hơn 0.`;
      const rate = numberValue(row.rate);
      if (rate === undefined || rate < 0) return `Dòng ${position}: chưa có đơn giá mua hợp lệ.`;
      if (!isAluminumPurchaseLine(row)) continue;

      const purchaseUom = text(row._defaultPurchaseUom) || text(row.uom);
      if (normalized(purchaseUom) !== "kg" || normalized(row.uom) !== "kg") {
        return `Dòng ${position}: nhôm phải mua theo Kg; số cây/lá được lưu riêng.`;
      }
      const length = positive(row.length_m);
      const bars = positive(row.qty_bar);
      const kgPerM = positive(row.theoretical_kg_per_m);
      if (!length) return `Dòng ${position}: nhôm phải có chiều dài một cây/lá.`;
      if (!bars || !Number.isInteger(bars)) return `Dòng ${position}: số cây/lá phải là số nguyên dương.`;
      if (!kgPerM) return `Dòng ${position}: chưa có barem kg/m từ Quy cách vật tư.`;
      if (!text(row.color)) return `Dòng ${position}: nhôm phải chọn Màu.`;
      if (!["Có", "Không"].includes(text(row.is_stamped))) return `Dòng ${position}: nhôm phải chọn trạng thái Dập Có/Không.`;
      const expectedKg = length * bars * kgPerM;
      if (!nearlyEqual(row.theoretical_kg, expectedKg)) return `Dòng ${position}: Kg đặt không khớp Dài cây × Số cây × Kg/m.`;
      if (!nearlyEqual(row.qty, expectedKg)) return `Dòng ${position}: SL tính tiền Kg không khớp barem ${expectedKg.toFixed(3)} kg.`;
      if (row.amount !== undefined && row.amount !== null && row.amount !== "" && !nearlyEqual(row.amount, expectedKg * rate, 0.5)) {
        return `Dòng ${position}: Thành tiền chưa khớp Kg đặt × Đơn giá.`;
      }
    }
    return null;
  }, []);

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
  }, [hydrateLine, replaceRows, setHeaderState]);

  const save = useCallback(async (submitAfterSave: boolean) => {
    if (!meta || !childMeta || !canSave) return;
    setSaving(true);
    try {
      const resolved = await resolveRowsFromAuthority(rowsRef.current, "__save__");
      replaceRows(resolved.rows);
      setHeaderState(resolved.header);
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
      const saved = isExisting
        ? await adapter.updateDoc("Purchase Order", documentName, payload, sourceModified)
        : await adapter.createDoc("Purchase Order", payload);
      const savedName = text(saved.name) || documentName;

      // Save and submit are two requests. Adopt the successful draft immediately so a failed
      // submit cannot leave the screen pretending the document was never created/saved.
      await adoptSavedDocument(saved, resolved.rows);
      invalidatePurchaseQueries();

      if (submitAfterSave) {
        try {
          const submitted = await adapter.submit(saved);
          await adoptSavedDocument(submitted, resolved.rows);
          invalidatePurchaseQueries();
          toast.success(`Đã ghi sổ đơn mua ${savedName}`);
        } catch (submitError) {
          toast.error(`Đã lưu nháp ${savedName}, nhưng chưa xác nhận được: ${mapError(submitError).message}`);
          if (isExisting) props.onSaved?.(savedName);
          else props.onCreated(savedName);
          return;
        }
      } else {
        toast.success(isExisting ? `Đã lưu đơn mua ${savedName}` : `Đã lưu nháp đơn mua ${savedName}`);
      }

      if (isExisting) props.onSaved?.(savedName);
      else props.onCreated(savedName);
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSaving(false);
    }
  }, [adapter, adoptSavedDocument, canSave, childMeta, documentName, invalidatePurchaseQueries, isExisting, meta, props, replaceRows, resolveRowsFromAuthority, setHeaderState, sourceModified, validateRows]);

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
        readOnly={formReadOnly || Boolean(field.read_only)}
        compact
        className="[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_button]:!h-8"
      />
    );
  };

  const hasField = (fieldname: string) => Boolean(metaField(fieldname));

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-purchase-order-v3">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-primary px-4 text-primary-foreground shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{isExisting ? `Đơn mua hàng ${documentName}` : "Tạo đơn mua hàng"}</h1>
            <span className="rounded bg-primary-foreground/15 px-2 py-0.5 text-xs">{docstatus === 1 ? "Đã xác nhận" : isExisting ? "Nháp" : "Nhập mới"}</span>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={props.onCancel} title="Đóng"><X className="size-4" /></Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-3">
        <div className="mx-auto w-full max-w-[1900px] space-y-2">
          {formReadOnly ? <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">Đơn đã xác nhận/khóa hoặc tài khoản không có quyền sửa.</div> : null}

          <fieldset disabled={formReadOnly} className="contents">
            <section className="rounded-lg border bg-card p-3 shadow-sm" data-section="purchase-order-header">
              <div className="grid gap-x-3 gap-y-2 md:grid-cols-2 xl:grid-cols-6">
                <div className="xl:col-span-2">{headerControl("supplier", "Nhà cung cấp", "Link", "Supplier")}</div>
                {headerControl("supplier_group", "Nhóm NCC", "Select", PURCHASE_SUPPLIER_GROUPS.join("\n"))}
                {headerControl("buying_price_list", "Bảng giá mua", "Link", "Price List")}
                {headerControl("transaction_date", "Ngày đặt hàng", "Date")}
                {hasField("schedule_date") ? headerControl("schedule_date", "Ngày giao", "Date") : <div />}
                {hasField("priority") ? headerControl("priority", "Mức độ", "Select") : null}
                {hasField("supplier_quotation") ? headerControl("supplier_quotation", "Theo báo giá NCC", "Link", "Supplier Quotation") : null}
                {hasField("payment_terms") ? headerControl("payment_terms", "Thanh toán", metaField("payment_terms")!.fieldtype, metaField("payment_terms")!.options) : null}
                {hasField("note") ? <div className="md:col-span-2 xl:col-span-3">{headerControl("note", "Ghi chú", metaField("note")!.fieldtype)}</div> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                <span>Công ty: <strong className="text-foreground">{text(header.company) || "—"}</strong></span>
                <span>Tiền tệ: <strong className="text-foreground">{text(header.currency) || "VND"}</strong></span>
                <span>Mặt hàng: <strong className="text-foreground">chỉ hàng được phép mua + đang hoạt động</strong></span>
                <span>ĐVT mua lấy từ <strong className="text-foreground">Item master</strong>.</span>
              </div>
            </section>

            <AlumdoorPurchaseOrderItemsGrid
              lines={rows}
              childMeta={childMeta}
              registry={registry}
              services={purchaseServices}
              roles={roles}
              readOnly={formReadOnly}
              priceLocked={Boolean(text(header.buying_price_list))}
              onPatch={patchLine}
              onCommit={commitLine}
              onAdd={addLine}
              onAddFive={addFive}
              onDuplicate={duplicateLine}
              onDelete={deleteLine}
            />
          </fieldset>

          <section className="overflow-hidden rounded-lg border bg-card shadow-sm" aria-label="Tóm tắt đơn mua">
            <div className="grid grid-cols-2 divide-x divide-y md:grid-cols-5 md:divide-y-0">
              <div className="px-4 py-3"><div className="text-[11px] text-muted-foreground">Dòng hàng</div><div className="mt-1 text-lg font-semibold tabular-nums">{activeRows.length}</div></div>
              <div className="px-4 py-3"><div className="text-[11px] text-muted-foreground">Dòng nhôm</div><div className="mt-1 text-lg font-semibold tabular-nums">{aluminumRows.length}</div></div>
              <div className="px-4 py-3"><div className="text-[11px] text-muted-foreground">Số cây/lá đặt</div><div className="mt-1 text-lg font-semibold tabular-nums">{totalAluminumBars.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}</div></div>
              <div className="px-4 py-3"><div className="text-[11px] text-muted-foreground">Kg nhôm</div><div className="mt-1 text-lg font-semibold tabular-nums">{totalAluminumKg.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} kg</div></div>
              <div className="bg-primary/5 px-4 py-3"><div className="text-[11px] font-medium text-muted-foreground">Tạm tính</div><div className="mt-1 text-xl font-bold tabular-nums text-primary">{money(grandTotal)} đ</div></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
              <span>Nhôm: Kg đặt = Dài một cây × Số cây/lá × Kg/m lý thuyết. Số cây/lá giữ riêng; qty thương mại là Kg.</span>
              <span>{text(header.buying_price_list) ? <>Giá preview theo <strong className="text-foreground">{text(header.buying_price_list)}</strong> + NCC + ngày đặt.</> : <>Chưa chọn bảng giá: đơn giá được phép nhập tay.</>}</span>
            </div>
          </section>
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background px-4 py-2 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5" /> Dữ liệu preview đã sẵn sàng</span>
          <strong className="text-foreground">Tạm tính: {money(grandTotal)} đ</strong>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>{isExisting ? "Đóng" : "Hủy"}</Button>
          <Button type="button" variant="outline" size="sm" disabled={saving || refreshing || formReadOnly || !activeRows.length} onClick={() => void refreshAll(true)}>
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Tính lại
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={saving || !canSave || !activeRows.length} onClick={() => void save(false)}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Lưu nháp
          </Button>
          {submitAllowed && !formReadOnly ? (
            <Button type="button" size="sm" disabled={saving || !canSave || !activeRows.length} onClick={() => void save(true)}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Ghi sổ đơn
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
