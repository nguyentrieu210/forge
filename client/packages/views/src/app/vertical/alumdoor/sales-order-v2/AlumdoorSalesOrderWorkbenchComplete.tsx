/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye, Factory, Loader2, RefreshCw, Save, Send } from "lucide-react";
import {
  applyContextPolicy,
  mapError,
  serializeCreateDocument,
  type Doc,
  type DocField,
  type DocTypeMeta,
} from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  toast,
} from "@metaforge/ui";
import { useMetaForge } from "../../../../container/provider.js";
import { salesItemSearchTerms } from "../sales-item-search.js";
import type { BomActualComponentRow } from "../AlumdoorBomActualEditor.js";
import { AlumdoorSalesOrderField, fallbackField } from "./AlumdoorSalesOrderField.js";
import { AlumdoorSalesOrderLineTableComplete } from "./AlumdoorSalesOrderLineTableComplete.js";
import {
  blankFromMeta,
  hydrateSalesLines,
  isAreaDoor,
  lineBillableArea,
  money,
  newLine,
  normalized,
  numberValue,
  optionList,
  positiveNumber,
  pricingSnapshots,
  quantity,
  text,
  today,
  type AlumdoorSalesOrderCreateProps,
  type BomPreview,
  type BomPreviewComponent,
  type CommercialPreview,
  type FieldOverride,
  type Json,
  type SalesItemContext,
  type SalesLine,
} from "./model.js";

type SalesCaps = {
  read?: boolean;
  write?: boolean;
  create?: boolean;
  delete?: boolean;
  submit?: boolean;
  cancel?: boolean;
  amend?: boolean;
};

function itemSearchScore(option: { value: string; description?: string }, query: string): number {
  const needle = normalized(query);
  if (!needle) return 0;
  const code = normalized(option.value);
  const label = normalized(option.description);
  const haystack = `${label} ${code}`;
  const tokens = needle.split(/\s+/).filter(Boolean);
  let score = 0;
  if (code === needle) score += 1_000;
  if (label === needle) score += 900;
  if (code.startsWith(needle)) score += 500;
  if (label.startsWith(needle)) score += 450;
  if (haystack.includes(needle)) score += 300;
  for (const token of tokens) {
    if (code.includes(token)) score += 80;
    if (label.includes(token)) score += 60;
  }
  return score;
}

function fieldValueForServer(fieldtype: DocField["fieldtype"], value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (fieldtype === "Float" || fieldtype === "Int" || fieldtype === "Currency" || fieldtype === "Percent") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

function commercialFacts(line: SalesLine): Json {
  return {
    item_code: line.item_code,
    item_group: line._context?.item_group,
    door_type: line._context?.door_type,
    inventory_mode: line._context?.inventory_mode,
    width_m: line.width_m,
    height_m: line.height_m,
    mesh_height_m: line.mesh_height_m,
    set_count: line.set_count,
    leaf_variant: line.leaf_variant,
    has_butterfly_bracket: line.has_butterfly_bracket,
    length_m: line.length_m,
    qty_bar: line.qty_bar,
    billable_area_sqm: line.billable_area_sqm,
    cut_width_m: line.cut_width_m,
    leaf_count: line.leaf_count,
    color: line.color,
  };
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || text(value).toLowerCase() === "true";
}

export function AlumdoorSalesOrderWorkbenchComplete(props: AlumdoorSalesOrderCreateProps) {
  const { adapter, scopeKey, businessContext, contextPolicies, registry, services, roles } = useMetaForge();
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [childMeta, setChildMeta] = useState<DocTypeMeta | null>(null);
  const [header, setHeader] = useState<Json>({});
  const headerRef = useRef<Json>({});
  const [lines, setLines] = useState<SalesLine[]>([newLine(0)]);
  const linesRef = useRef<SalesLine[]>(lines);
  const [selectedLineKeys, setSelectedLineKeys] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fatal, setFatal] = useState("");
  const [headerError, setHeaderError] = useState("");
  const [caps, setCaps] = useState<SalesCaps>({});
  const [sourceModified, setSourceModified] = useState("");
  const [docstatus, setDocstatus] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const closeSeen = useRef(props.closeRequest ?? 0);
  const lineSeq = useRef(new Map<string, number>());
  const headerSeq = useRef(0);
  const documentSeq = useRef(0);
  const itemNameCache = useRef(new Map<string, string>());
  const didInitialLinePreview = useRef(false);
  const lastCommercialContext = useRef("");

  const documentName = text(props.name);
  const isExisting = Boolean(documentName);
  const formReadOnly = isExisting && (!caps.write || docstatus !== 0);
  const canSave = isExisting ? !formReadOnly : Boolean(caps.create);
  const canSubmit = docstatus === 0 && Boolean(caps.submit) && (isExisting ? !formReadOnly : Boolean(caps.create));

  const setHeaderState = useCallback((next: Json) => {
    headerRef.current = next;
    setHeader(next);
  }, []);

  const replaceLines = useCallback((next: SalesLine[], markDirty = false) => {
    const normalizedLines = next.length ? next : [newLine(0)];
    linesRef.current = normalizedLines;
    setLines(normalizedLines);
    if (markDirty) setDirty(true);
  }, []);

  const patchLine = useCallback((key: string, patch: Partial<SalesLine>, markDirty = false): SalesLine[] => {
    const next = linesRef.current.map((line) => line._key === key ? { ...line, ...patch } : line);
    replaceLines(next, markDirty);
    return next;
  }, [replaceLines]);

  const salesServices = useMemo<FieldServices>(() => ({
    ...services,
    searchLink: async (doctype, query, options) => {
      if (doctype !== "Item" || !services.searchLink) return services.searchLink?.(doctype, query, options) ?? [];
      const raw = text(query);
      const terms = salesItemSearchTerms(raw);
      const batches = await Promise.allSettled(terms.map((term) => services.searchLink!(doctype, term, { ...options, pageLength: 100 })));
      const merged = new Map<string, { value: string; description?: string }>();
      let firstFailure: unknown;
      let fulfilledCount = 0;
      for (const batch of batches) {
        if (batch.status === "fulfilled") {
          fulfilledCount += 1;
          for (const option of batch.value) if (!merged.has(option.value)) merged.set(option.value, option);
        } else if (firstFailure === undefined) firstFailure = batch.reason;
      }
      if (!fulfilledCount) throw firstFailure ?? new Error("Không tải được danh sách mặt hàng.");
      return [...merged.values()]
        .sort((left, right) => itemSearchScore(right, raw) - itemSearchScore(left, raw) || left.value.localeCompare(right.value, "vi"))
        .slice(0, 100);
    },
  }), [services]);

  const childFields = useMemo(() => childMeta?.fields.map((field) => field.fieldname).filter(Boolean) ?? [], [childMeta]);
  const childFieldSet = useMemo(() => new Set(childFields), [childFields]);
  const leafVariants = useMemo(() => optionList(childMeta, "leaf_variant", ["Kéo tay", "Motor ngoài", "Motor trong"]), [childMeta]);
  const activeLines = useMemo(() => lines.filter((line) => text(line.item_code)), [lines]);

  const cleanLine = useCallback((line: SalesLine): Json => {
    const result: Json = {};
    for (const [key, value] of Object.entries(line)) {
      const existingIdentity = isExisting && (key === "name" || key === "doctype");
      if (key.startsWith("_") || value === undefined) continue;
      if (childFieldSet.has(key) || existingIdentity) result[key] = value;
    }
    return result;
  }, [childFieldSet, isExisting]);

  const previewDocument = useCallback(async (next: Json, changedField: string, sourceLines = linesRef.current): Promise<Json> => {
    const result = await adapter.callPost<Json>("alumdoor.ui.preview_document", {
      doctype: "Sales Order",
      doc: { ...next, items: sourceLines.filter((line) => text(line.item_code)).map(cleanLine) },
      changed_field: changedField,
    });
    const patch = result.patch && typeof result.patch === "object" && !Array.isArray(result.patch) ? result.patch as Json : {};
    const merged = { ...next, ...patch };
    for (const field of Array.isArray(result.clear) ? result.clear.map(text) : []) delete merged[field];
    return merged;
  }, [adapter, cleanLine]);

  const refreshDocumentPreview = useCallback(async (changedField = "items", sourceLines = linesRef.current) => {
    const seq = ++documentSeq.current;
    try {
      const resolved = await previewDocument(headerRef.current, changedField, sourceLines);
      if (documentSeq.current !== seq) return;
      setHeaderError("");
      setHeaderState(resolved);
    } catch (error) {
      if (documentSeq.current !== seq) return;
      setHeaderError(mapError(error).message);
    }
  }, [previewDocument, setHeaderState]);

  const setHeaderField = useCallback((fieldname: string, value: unknown, preview = false) => {
    const seq = ++headerSeq.current;
    const current = headerRef.current;
    const next = {
      ...current,
      [fieldname]: value,
      ...(fieldname === "payment_method" && text(value) !== "Chuyển khoản" ? { bank_account: undefined } : {}),
    };
    setHeaderState(next);
    setDirty(true);
    if (!preview) return;
    void previewDocument(next, fieldname)
      .then((resolved) => {
        if (headerSeq.current !== seq) return;
        setHeaderError("");
        setHeaderState(resolved);
      })
      .catch((error) => {
        if (headerSeq.current !== seq) return;
        setHeaderError(mapError(error).message);
      });
  }, [previewDocument, setHeaderState]);

  const requestClose = useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else props.onCancel();
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const salesMeta = await adapter.getMeta("Sales Order");
        const table = salesMeta.fields.find((field) => field.fieldname === "items" && field.fieldtype === "Table");
        const childDoctype = text(table?.options) || "Sales Order Item";
        const [itemMeta, boot, capabilities, existingResult] = await Promise.all([
          adapter.getMeta(childDoctype),
          adapter.getBoot(),
          adapter.getCapabilities("Sales Order", documentName || undefined),
          documentName ? adapter.getDoc("Sales Order", documentName) : Promise.resolve(null),
        ]);
        if (!active) return;
        const defaults: Json = {
          ...blankFromMeta(salesMeta),
          ...applyContextPolicy("Sales Order", businessContext, contextPolicies).defaults,
        };
        if (!defaults.transaction_date) defaults.transaction_date = today();
        if (!defaults.delivery_date) defaults.delivery_date = today();
        if (!defaults.currency) defaults.currency = boot.sysdefaults.currency || "VND";
        const existingDoc = existingResult?.doc as Json | undefined;
        const existingItems = Array.isArray(existingDoc?.items) ? existingDoc!.items as Json[] : [];
        const initialHeader = existingDoc ? { ...defaults, ...existingDoc, items: undefined } : defaults;
        const initialLines = existingDoc ? hydrateSalesLines(existingItems) : [newLine(0)];
        setMeta(salesMeta);
        setChildMeta(itemMeta);
        setCaps(capabilities as SalesCaps);
        setSourceModified(text(existingDoc?.modified));
        setDocstatus(Number(existingDoc?.docstatus) || 0);
        setHeaderState(initialHeader);
        replaceLines(initialLines, false);
        setDirty(false);
      } catch (error) {
        if (active) setFatal(mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, businessContext, contextPolicies, documentName, replaceLines, setHeaderState]);

  const loadItemName = useCallback(async (itemCode: string): Promise<string> => {
    const cached = itemNameCache.current.get(itemCode);
    if (cached) return cached;
    try {
      const { doc } = await adapter.getDoc("Item", itemCode);
      const name = text((doc as Json).item_name) || itemCode;
      itemNameCache.current.set(itemCode, name);
      return name;
    } catch {
      itemNameCache.current.set(itemCode, itemCode);
      return itemCode;
    }
  }, [adapter]);

  const loadBomComponentNames = useCallback(async (components: BomPreviewComponent[]): Promise<Record<string, string>> => {
    const codes = [...new Set(components.map((component) => text(component.item_code)).filter(Boolean))];
    const entries = await Promise.all(codes.map(async (code) => [code, await loadItemName(code)] as const));
    return Object.fromEntries(entries);
  }, [loadItemName]);

  const previewLine = useCallback(async (source: SalesLine, changedField: string, patch: Partial<SalesLine> = {}, refreshTotals = true) => {
    if (!childMeta) return;
    const row = { ...source, ...patch } as SalesLine;
    const itemCode = text(row.item_code);
    if (!itemCode) return;
    const seq = (lineSeq.current.get(row._key) ?? 0) + 1;
    lineSeq.current.set(row._key, seq);
    patchLine(row._key, { ...patch, _loading: true, _error: "", _pricingError: "" }, false);
    try {
      const parent = { ...headerRef.current, items: undefined };
      const [context, uiPreview, colors, itemName] = await Promise.all([
        adapter.callPost<SalesItemContext>("alumdoor.sales.item_context", {
          item_code: itemCode,
          uom: row.uom,
          warehouse: row.warehouse,
          price_list: headerRef.current.selling_price_list,
          currency: headerRef.current.currency || "VND",
          qty: row.qty,
        }),
        adapter.callPost<Json>("alumdoor.ui.preview_child_row", {
          child_doctype: childMeta.name,
          child_fields: childFields,
          row,
          parent,
          changed_field: changedField,
        }),
        adapter.callPost<Json>("alumdoor.catalog.allowed_colors", { item_code: itemCode, usage_scope: "sales" }),
        loadItemName(itemCode),
      ]);
      if (lineSeq.current.get(row._key) !== seq) return;
      const serverPatch = uiPreview.patch && typeof uiPreview.patch === "object" && !Array.isArray(uiPreview.patch) ? uiPreview.patch as Json : {};
      const overrides = uiPreview.field_overrides && typeof uiPreview.field_overrides === "object" && !Array.isArray(uiPreview.field_overrides)
        ? uiPreview.field_overrides as Record<string, FieldOverride> : {};
      const allowedColors = Array.isArray(colors.allowed_colors) ? colors.allowed_colors.map(text).filter(Boolean) : [];
      const next: Partial<SalesLine> = {
        ...patch,
        ...serverPatch,
        _context: context,
        _itemName: itemName,
        _allowedColors: allowedColors,
        _overrides: overrides,
        _loading: false,
        _error: "",
        _pricingError: "",
        _commercial: undefined,
        _bomError: "",
      };
      for (const field of Array.isArray(uiPreview.clear) ? uiPreview.clear.map(text) : []) if (childFieldSet.has(field)) next[field] = undefined;
      if (!text(row.uom) && !text(next.uom) && text(context.selected_uom)) next.uom = text(context.selected_uom);
      if (!text(row.color) && !text(next.color) && text(context.default_color)) next.color = text(context.default_color);

      let candidate = { ...row, ...next, _context: context } as SalesLine;
      const pricedQty = positiveNumber(candidate.qty);
      const priceList = text(headerRef.current.selling_price_list);
      if (pricedQty && priceList && text(candidate.uom)) {
        try {
          const commercial = await adapter.callPost<CommercialPreview>("metaforge.api.preview_sales_commercial_line", {
            line: cleanLine(candidate),
            price_list: priceList,
            currency: text(headerRef.current.currency) || "VND",
            posting_date: text(headerRef.current.transaction_date) || today(),
            customer: text(headerRef.current.customer),
            customer_group: text(headerRef.current.customer_group),
            facts: commercialFacts(candidate),
          });
          if (lineSeq.current.get(row._key) !== seq) return;
          const sellingRate = numberValue(commercial.selling_rate ?? commercial.rate);
          const grossAmount = numberValue(commercial.gross_amount);
          const discountPercentage = numberValue(commercial.discount_percentage);
          const discountAmount = numberValue(commercial.discount_amount);
          const adjustmentAmount = numberValue(commercial.adjustment_amount);
          const netAmount = numberValue(commercial.net_before_tax ?? commercial.net_amount ?? commercial.amount);
          if (sellingRate !== undefined) next.rate = sellingRate;
          if (grossAmount !== undefined) next.amount = grossAmount;
          if (discountPercentage !== undefined) next.discount_percentage = discountPercentage;
          if (discountAmount !== undefined) next.discount_amount = discountAmount;
          if (adjustmentAmount !== undefined) next.adjustment_amount = adjustmentAmount;
          if (netAmount !== undefined) next.net_amount = netAmount;
          next._commercial = commercial;
          candidate = { ...candidate, ...next, _commercial: commercial } as SalesLine;
        } catch (error) {
          next._pricingError = mapError(error).message;
        }
      }

      if (isAreaDoor(candidate) && positiveNumber(candidate.width_m) !== undefined && positiveNumber(candidate.height_m) !== undefined) {
        try {
          const bom = await adapter.callPost<BomPreview>("alumdoor.sales.preview_bom_requirements", {
            ...cleanLine(candidate),
            customer_group: text(headerRef.current.customer_group),
            delivery_date: text(headerRef.current.delivery_date) || today(),
          });
          if (lineSeq.current.get(row._key) !== seq) return;
          const components = Array.isArray(bom.components) ? bom.components : [];
          next._bomPreview = { ...bom, components };
          next._bomComponentNames = components.length ? await loadBomComponentNames(components) : {};
          next._bomError = "";
        } catch (error) {
          next._bomPreview = undefined;
          next._bomComponentNames = {};
          next._bomError = mapError(error).message;
        }
      } else {
        next._bomPreview = undefined;
        next._bomComponentNames = {};
        next._bomError = "";
      }
      const nextLines = patchLine(row._key, next, false);
      if (refreshTotals) await refreshDocumentPreview("items", nextLines);
    } catch (error) {
      if (lineSeq.current.get(row._key) === seq) patchLine(row._key, { ...patch, _loading: false, _error: mapError(error).message }, false);
    }
  }, [adapter, childFieldSet, childFields, childMeta, cleanLine, loadBomComponentNames, loadItemName, patchLine, refreshDocumentPreview]);

  useEffect(() => {
    if (loading || !childMeta || didInitialLinePreview.current) return;
    didInitialLinePreview.current = true;
    const initial = linesRef.current.filter((line) => text(line.item_code));
    if (!initial.length) {
      void refreshDocumentPreview("items");
      return;
    }
    void Promise.all(initial.map((line) => previewLine(line, "initial_load", {}, false))).finally(() => void refreshDocumentPreview("items"));
  }, [childMeta, loading, previewLine, refreshDocumentPreview]);

  const commercialContext = [text(header.customer), text(header.customer_group), text(header.selling_price_list), text(header.transaction_date), text(header.currency), text(header.delivery_date)].join("\u001f");
  useEffect(() => {
    if (loading || !childMeta) return;
    if (!lastCommercialContext.current) { lastCommercialContext.current = commercialContext; return; }
    if (lastCommercialContext.current === commercialContext) return;
    lastCommercialContext.current = commercialContext;
    const active = linesRef.current.filter((line) => text(line.item_code));
    void Promise.all(active.map((line) => previewLine(line, "parent_context", {}, false))).finally(() => void refreshDocumentPreview("items"));
  }, [childMeta, commercialContext, loading, previewLine, refreshDocumentPreview]);

  const commitLine = useCallback((key: string, fieldname: string, value: unknown) => {
    const current = linesRef.current.find((line) => line._key === key);
    if (!current) return;
    setDirty(true);
    if (fieldname === "item_code") {
      const itemCode = text(value);
      const reset: Partial<SalesLine> = {
        item_code: itemCode || undefined,
        _itemName: itemCode || undefined,
        _context: undefined,
        _allowedColors: [],
        _overrides: {},
        _commercial: undefined,
        _bomPreview: undefined,
        _bomComponentNames: {},
        _bomError: "",
        _pricingError: "",
        _error: "",
        uom: undefined,
        color: undefined,
        rate: undefined,
        amount: undefined,
        discount_percentage: undefined,
        discount_amount: undefined,
        adjustment_amount: undefined,
        net_amount: undefined,
        billable_area_sqm: undefined,
        cut_width_m: undefined,
        leaf_count: undefined,
        single_layer_leaf_count: undefined,
        double_layer_leaf_count: undefined,
        estimated_weight_kg: undefined,
        bom_actual_components: [],
      };
      patchLine(key, reset, false);
      if (itemCode) void previewLine({ ...current, ...reset } as SalesLine, fieldname, reset);
      return;
    }
    const latest = linesRef.current.find((line) => line._key === key) ?? current;
    const resolvedValue = latest[fieldname] !== undefined ? latest[fieldname] : value;
    const patch = { [fieldname]: resolvedValue } as Partial<SalesLine>;
    patchLine(key, patch, false);
    void previewLine({ ...latest, ...patch } as SalesLine, fieldname, patch);
  }, [patchLine, previewLine]);

  const commitBomActualComponents = useCallback((key: string, rows: BomActualComponentRow[]) => {
    const current = linesRef.current.find((line) => line._key === key);
    if (!current) return;
    setDirty(true);
    const patch: Partial<SalesLine> = { bom_actual_components: rows };
    patchLine(key, patch, false);
    void previewLine({ ...current, ...patch } as SalesLine, "bom_actual_components", patch);
  }, [patchLine, previewLine]);

  const addLine = useCallback(() => replaceLines([...linesRef.current, newLine(linesRef.current.length)], true), [replaceLines]);
  const addFive = useCallback(() => replaceLines([...linesRef.current, ...Array.from({ length: 5 }, (_, index) => newLine(linesRef.current.length + index))], true), [replaceLines]);
  const duplicateLine = useCallback((key: string) => {
    const current = linesRef.current;
    const index = current.findIndex((line) => line._key === key);
    if (index < 0) return;
    const source = current[index]!;
    const duplicate = { ...source, name: undefined, doctype: undefined, _key: newLine(current.length)._key, _loading: false, _error: "", _pricingError: "" } as SalesLine;
    replaceLines([...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)], true);
  }, [replaceLines]);
  const deleteLine = useCallback((key: string) => {
    replaceLines(linesRef.current.filter((line) => line._key !== key), true);
    setSelectedLineKeys((current) => { const next = new Set(current); next.delete(key); return next; });
  }, [replaceLines]);
  const deleteSelected = useCallback(() => {
    if (!selectedLineKeys.size) return;
    replaceLines(linesRef.current.filter((line) => !selectedLineKeys.has(line._key)), true);
    setSelectedLineKeys(new Set());
  }, [replaceLines, selectedLineKeys]);

  const validate = useCallback((): string | null => {
    if (!text(headerRef.current.customer)) return "Cần chọn khách hàng.";
    if (!text(headerRef.current.transaction_date)) return "Cần ngày đặt hàng.";
    if (!text(headerRef.current.selling_price_list)) return "Cần Bảng giá áp dụng theo commercial contract hiện hành.";
    const currentLines = linesRef.current.filter((line) => text(line.item_code));
    if (!currentLines.length) return "Cần ít nhất một dòng hàng.";
    for (const [index, line] of currentLines.entries()) {
      if (line._loading) return `Dòng ${index + 1} đang tính lại, hãy hoàn tất trước khi lưu.`;
      if (text(line._error)) return `Dòng ${index + 1}: ${text(line._error)}`;
      if (text(line._pricingError)) return `Dòng ${index + 1}: ${text(line._pricingError)}`;
      if (numberValue(line.rate) === undefined) return `Dòng ${index + 1}: thiếu Đơn giá.`;
      for (const [fieldname, rule] of Object.entries(line._overrides ?? {}) as Array<[string, FieldOverride]>) {
        if (!(rule.reqd === true || rule.reqd === 1) || rule.hidden === true || rule.hidden === 1) continue;
        if (line[fieldname] == null || line[fieldname] === "") return `Dòng ${index + 1}: thiếu ${text(rule.label) || fieldname}.`;
      }
    }
    return null;
  }, []);

  const buildDocument = useCallback((sourceLines = linesRef.current): Json => {
    if (!meta) return {};
    const document: Json = {};
    for (const [fieldname, rawValue] of Object.entries(headerRef.current)) {
      const field = meta.fields.find((candidate) => candidate.fieldname === fieldname);
      if (!field) continue;
      const value = fieldValueForServer(field.fieldtype, rawValue);
      if (value !== undefined) document[fieldname] = value;
    }
    document.items = sourceLines.filter((line) => text(line.item_code)).map(cleanLine);
    return document;
  }, [cleanLine, meta]);

  const persistDraft = useCallback(async (): Promise<Doc | null> => {
    const validationError = validate();
    if (validationError) { toast.error(validationError); return null; }
    if (!meta) return null;
    const document = buildDocument();
    const finalPreview = await previewDocument(document, "items", linesRef.current);
    const payload = serializeCreateDocument(meta, finalPreview) as Partial<Doc>;
    const saved = isExisting
      ? await adapter.updateDoc("Sales Order", documentName, payload, sourceModified)
      : await adapter.createDoc("Sales Order", payload);
    const savedName = text(saved.name) || documentName;
    setSourceModified(text(saved.modified));
    setDocstatus(Number(saved.docstatus) || 0);
    setHeaderState({ ...headerRef.current, ...saved, items: undefined });
    const savedItems = Array.isArray(saved.items) ? saved.items as Json[] : [];
    if (savedItems.length) replaceLines(hydrateSalesLines(savedItems), false);
    setDirty(false);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", "Sales Order"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "list", "Sales Order"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "count", "Sales Order"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "overview"], refetchType: "none" }),
    ]).catch(() => undefined);
    return saved;
  }, [adapter, buildDocument, documentName, isExisting, meta, previewDocument, queryClient, replaceLines, scopeKey, setHeaderState, sourceModified, validate]);

  const saveDraft = useCallback(async (previewAfterSave = false) => {
    setSaving(true);
    try {
      const saved = await persistDraft();
      if (!saved) return;
      const savedName = text(saved.name) || documentName;
      toast.success(isExisting ? `Đã lưu nháp ${savedName}` : `Đã tạo nháp ${savedName}`);
      if (previewAfterSave) props.onPreviewCreated(savedName);
      else if (isExisting) props.onSaved?.(savedName);
      else props.onCreated(savedName);
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSaving(false);
    }
  }, [documentName, isExisting, persistDraft, props]);

  const submitOrder = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const saved = await persistDraft();
      if (!saved) return;
      const submitted = await adapter.submit(saved);
      const savedName = text(submitted.name) || text(saved.name) || documentName;
      const canonical = await adapter.getDoc("Sales Order", savedName);
      const doc = canonical.doc as Json;
      setDocstatus(Number(doc.docstatus) || 1);
      setSourceModified(text(doc.modified));
      setHeaderState({ ...headerRef.current, ...doc, items: undefined });
      const submittedItems = Array.isArray(doc.items) ? doc.items as Json[] : [];
      if (submittedItems.length) replaceLines(hydrateSalesLines(submittedItems), false);
      setCaps(await adapter.getCapabilities("Sales Order", savedName) as SalesCaps);
      setDirty(false);
      toast.success(`Đã ghi sổ đơn ${savedName}.`);
      if (!isExisting) props.onCreated(savedName);
      else props.onSaved?.(savedName);
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSubmitting(false);
    }
  }, [adapter, canSubmit, documentName, isExisting, persistDraft, props, replaceLines, setHeaderState]);

  const openProduction = useCallback(() => {
    if (!documentName || docstatus !== 1) return;
    window.location.assign(`/app/${encodeURIComponent("Production Request")}?f_sales_order=${encodeURIComponent(documentName)}`);
  }, [docstatus, documentName]);

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Đang mở Sales Workbench…</span></div>;
  if (fatal) return <div className="p-6 text-sm text-destructive">{fatal}</div>;
  if (!meta || !childMeta) return <div className="p-6 text-sm text-muted-foreground">Không đọc được cấu trúc Sales Order.</div>;

  const metaField = (fieldname: string) => meta.fields.find((field) => field.fieldname === fieldname);
  const headerField = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string) => metaField(fieldname) ?? fallbackField(fieldname, label, fieldtype, options);
  const headerRequired = (fieldname: string) => Boolean(metaField(fieldname)?.reqd);
  const paymentOptions = optionList(meta, "payment_method", ["Tiền mặt", "Chuyển khoản", "Ghi công nợ"]);
  const rules = pricingSnapshots(lines);
  const totalArea = lines.reduce((sum, line) => sum + (lineBillableArea(line) ?? 0), 0);
  const unresolvedLines = activeLines.filter((line) => line._loading || line._error || line._pricingError).length;
  const bomBlocked = activeLines.filter((line) => line._bomPreview?.actual_complete === false).length;
  const approvalNeeded = checked(header.discount_requires_approval) || activeLines.some((line) => checked(line.rate_requires_approval));
  const busy = saving || submitting;

  const headerControl = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string, readOnly = false, preview = false) => (
    <AlumdoorSalesOrderField
      id={`sales-v2-complete-header-${fieldname}`}
      field={headerField(fieldname, label, fieldtype, options)}
      value={header[fieldname]}
      onChange={(value) => setHeaderField(fieldname, fieldValueForServer(headerField(fieldname, label, fieldtype, options).fieldtype, value), preview)}
      registry={registry}
      services={services}
      parentDoctype="Sales Order"
      docValues={header}
      roles={roles}
      required={headerRequired(fieldname)}
      readOnly={formReadOnly || readOnly}
      compact
      className="[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_button]:!h-8"
    />
  );

  return <>
    <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-sales-order-v2-complete">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1900px] space-y-3 px-3 py-3">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Đơn bán hàng</h1>
              <Badge variant="outline">{isExisting ? documentName : "Nháp mới"}</Badge>
              <Badge variant={docstatus === 1 ? "default" : "outline"}>{docstatus === 1 ? "Đã ghi sổ" : "Nháp"}</Badge>
              {formReadOnly && docstatus === 0 ? <Badge variant="outline">Chỉ xem</Badge> : null}
              {approvalNeeded ? <Badge variant="outline">Cần duyệt thương mại</Badge> : null}
              {dirty ? <Badge variant="outline">Chưa lưu</Badge> : null}
            </div>
            <div className="flex items-center gap-1.5">
              {docstatus === 1 && documentName ? <Button type="button" variant="outline" size="sm" onClick={openProduction}><Factory className="size-3.5" /> Sản xuất</Button> : null}
              {isExisting ? <Button type="button" variant="outline" size="sm" onClick={() => props.onPreviewCreated(documentName)}><Eye className="size-3.5" /> In / xem</Button> : null}
            </div>
          </header>

          {formReadOnly ? <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">Đơn đã ghi sổ/khóa hoặc tài khoản không có quyền sửa. Giá, BOM và số tiền chỉ hiển thị theo authority server.</div> : null}
          {headerError ? <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{headerError}</span><Button type="button" variant="outline" size="sm" className="h-7" onClick={() => void refreshDocumentPreview("manual_retry")}>Thử lại</Button></div> : null}

          <fieldset disabled={formReadOnly} className="contents">
            <section className="rounded-lg border bg-card p-3" data-section="sales-v2-header-complete">
              <div className="grid gap-x-3 gap-y-2 md:grid-cols-2 xl:grid-cols-6">
                <div className="xl:col-span-2">{headerControl("customer", "Khách hàng", "Link", "Customer", false, true)}</div>
                {metaField("customer_group") ? headerControl("customer_group", "Nhóm giá", metaField("customer_group")!.fieldtype, metaField("customer_group")!.options, true) : null}
                {headerControl("selling_price_list", "Bảng giá", "Link", "Price List", false, true)}
                {headerControl("transaction_date", "Ngày đơn", "Date", undefined, false, true)}
                {headerControl("delivery_date", "Ngày giao", "Date", undefined, false, true)}
                {metaField("responsible_person") ? headerControl("responsible_person", "Người phụ trách", "Link", "Employee") : null}
                {metaField("contact_person") ? headerControl("contact_person", "Người liên hệ") : null}
                {metaField("phone") ? headerControl("phone", "SĐT") : null}
                {metaField("payment_method") ? headerControl("payment_method", "Thanh toán", "Select", paymentOptions.join("\n"), false, true) : null}
                {text(header.payment_method) === "Chuyển khoản" && metaField("bank_account") ? headerControl("bank_account", "Tài khoản ngân hàng", "Link", text(metaField("bank_account")?.options) || "Tài khoản ngân hàng") : null}
                {metaField("vat_rate") ? headerControl("vat_rate", "% VAT", "Percent", undefined, false, true) : null}
                {metaField("install_address") ? <div className="xl:col-span-3">{headerControl("install_address", "Địa chỉ giao / lắp đặt", "Small Text")}</div> : null}
                {metaField("manual_note") ? <div className="xl:col-span-3">{headerControl("manual_note", "Ghi chú vận hành", "Small Text")}</div> : metaField("shipping_note") ? <div className="xl:col-span-3">{headerControl("shipping_note", "Ghi chú giao hàng", "Small Text")}</div> : null}
              </div>
            </section>

            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0">
                <AlumdoorSalesOrderLineTableComplete
                  lines={lines}
                  childMeta={childMeta}
                  registry={registry}
                  services={salesServices}
                  roles={roles}
                  readOnly={formReadOnly}
                  selectedKeys={selectedLineKeys}
                  leafVariants={leafVariants}
                  onToggleSelection={(key, checkedValue) => setSelectedLineKeys((current) => { const next = new Set(current); if (checkedValue) next.add(key); else next.delete(key); return next; })}
                  onToggleAll={(checkedValue) => setSelectedLineKeys(checkedValue ? new Set(lines.map((line) => line._key)) : new Set())}
                  onPatch={(key, patch) => patchLine(key, patch, true)}
                  onCommit={commitLine}
                  onAdd={addLine}
                  onAddFive={addFive}
                  onDuplicate={duplicateLine}
                  onDelete={deleteLine}
                  onDeleteSelected={deleteSelected}
                  onBomActualChange={commitBomActualComponents}
                />
              </div>

              <aside className="space-y-3 xl:sticky xl:top-3 xl:self-start" aria-label="Tóm tắt đơn và chính sách giá">
                <section className="rounded-lg border bg-card">
                  <div className="border-b px-3 py-2"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tóm tắt server</h2></div>
                  <div className="space-y-2 px-3 py-3 text-xs">
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Dòng hàng</span><span className="font-medium tabular-nums">{activeLines.length}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Diện tích cửa</span><span className="font-medium tabular-nums">{quantity(totalArea)} m²</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Tiền hàng</span><span className="tabular-nums">{money(header.total_amount)} ₫</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Chiết khấu</span><span className="tabular-nums">−{money(header.discount_amount)} ₫</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Phụ thu</span><span className="tabular-nums">{money(header.surcharge_amount)} ₫</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">VAT ({quantity(header.vat_rate ?? 0)}%)</span><span className="tabular-nums">{money(header.vat_amount)} ₫</span></div>
                    <div className="border-t pt-2"><div className="flex items-baseline justify-between gap-3"><span className="font-semibold">Tiền phải thu</span><strong className="text-lg tabular-nums text-primary">{money(header.grand_total)} ₫</strong></div><p className="mt-1 text-[10px] text-muted-foreground">Projection từ `alumdoor.ui.preview_document`; save/submit vẫn normalize lại ở canonical controller.</p></div>
                    {approvalNeeded ? <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px]"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>Giá/chiết khấu/bảng giá đang cần quyền duyệt khi ghi sổ.</span></div> : null}
                    {unresolvedLines || bomBlocked ? <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px]"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{unresolvedLines ? `${unresolvedLines} dòng chưa resolve xong. ` : ""}{bomBlocked ? `${bomBlocked} dòng còn thiếu vật tư BOM thực tế; vẫn được lưu nháp.` : ""}</span></div> : <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-2 text-[11px]"><CheckCircle2 className="size-3.5" /> Không có blocker preview hiện tại.</div>}
                  </div>
                </section>

                <section className="rounded-lg border bg-card">
                  <div className="border-b px-3 py-2"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chính sách giá</h2></div>
                  <div className="space-y-2 px-3 py-3 text-xs"><div><div className="text-[10px] text-muted-foreground">Bảng giá</div><div className="mt-0.5 font-medium">{text(header.selling_price_list) || "Chưa resolve"}</div></div>{rules.length ? <div className="space-y-1.5 border-t pt-2">{rules.slice(0, 8).map((rule, index) => <div key={`${text(rule.rule_name)}-${index}`} className="rounded-md bg-muted/45 px-2.5 py-2"><div className="font-medium">{text(rule.rule_name)}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{text(rule.effect_type) || "Pricing Rule"}</div></div>)}{rules.length > 8 ? <div className="text-[10px] text-muted-foreground">+ {rules.length - 8} rule khác</div> : null}</div> : <div className="rounded-md border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground">Chưa có Pricing Rule nào được server áp.</div>}<p className="border-t pt-2 text-[10px] leading-4 text-muted-foreground">Operator có thể sửa giá/CK; server quyết định canonical money và quyền duyệt ở Submit.</p></div>
                </section>
              </aside>
            </div>
          </fieldset>
        </div>
      </div>

      <div className="shrink-0 border-t bg-card px-3 py-2 shadow-[0_-4px_14px_rgba(0,0,0,0.035)]">
        <div className="mx-auto flex w-full max-w-[1900px] flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2"><span className="text-muted-foreground">{dirty ? "Có thay đổi chưa lưu" : docstatus === 1 ? "Đơn đã ghi sổ" : "Nháp đã đồng bộ"}</span><strong className="tabular-nums">Phải thu: {money(header.grand_total)} ₫</strong></div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={requestClose}>{isExisting ? "Đóng" : "Hủy"}</Button>
            <Button type="button" variant="outline" size="sm" disabled={busy || formReadOnly} onClick={() => { const active = linesRef.current.filter((line) => text(line.item_code)); void Promise.all(active.map((line) => previewLine(line, "manual_refresh", {}, false))).finally(() => void refreshDocumentPreview("manual_refresh")); }}><RefreshCw className="size-3.5" /> Tính lại</Button>
            {docstatus === 0 ? <Button type="button" variant="outline" size="sm" disabled={busy || !canSave} onClick={() => void saveDraft(false)}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Lưu nháp</Button> : null}
            {docstatus === 0 && canSubmit ? <Button type="button" size="sm" disabled={busy} onClick={() => void submitOrder()}>{submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Ghi sổ đơn</Button> : null}
            {docstatus === 0 && isExisting ? <Button type="button" variant="outline" size="sm" disabled={busy || !canSave} onClick={() => void saveDraft(true)}><Eye className="size-3.5" /> Lưu & xem</Button> : null}
          </div>
        </div>
      </div>
    </div>

    <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle></DialogHeader>
        <div className="space-y-4 p-1 text-sm"><p className="text-muted-foreground">Đơn đang có thay đổi ở header, dòng hàng, giá/chiết khấu, VAT hoặc BOM thực tế. Đóng bây giờ sẽ bỏ các thay đổi này.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmDiscard(false)}>Tiếp tục chỉnh</Button><Button variant="destructive" onClick={() => { setConfirmDiscard(false); setDirty(false); props.onCancel(); }}>Bỏ thay đổi</Button></div></div>
      </DialogContent>
    </Dialog>
  </>;
}
