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
  type Filters,
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
import { useMetaForge } from "@metaforge/views/provider";
import { salesItemSearchTerms } from "../sales-item-search.js";
import type { BomActualComponentRow } from "../AlumdoorBomActualEditor.js";
import { AlumdoorSalesOrderField, fallbackField } from "./AlumdoorSalesOrderField.js";
import { AlumdoorSalesOrderLineTableComplete } from "./AlumdoorSalesOrderLineTableComplete.js";
import {
  applySalesOrderDocumentPreview,
  beginSalesOrderDocumentPreview,
  canApplySalesOrderDocumentPreview,
  createSalesOrderPreviewClock,
  finishSalesOrderDocumentPreview,
  isSalesOrderPersistenceBlocked,
  markSalesOrderDocumentChanged,
  type SalesOrderDocumentPreviewPatch,
} from "./preview-coordinator.js";
import {
  blankFromMeta,
  hydrateSalesLines,
  isAreaDoor,
  isDirectOrdinaryQuantityLine,
  isFullSetSalesItem,
  lineBillableArea,
  lineCommercialNeedsApproval,
  money,
  newLine,
  normalized,
  numberValue,
  optionList,
  positiveNumber,
  pricingSnapshots,
  quantity,
  salesWidthInputField,
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

const CUSTOMER_CONTEXT_FIELDS = [
  "customer_group",
  "contact_person",
  "phone",
  "install_province",
  "install_ward",
  "install_address",
  "payment_terms",
  "selling_price_list",
] as const;

function hydrateSavedLines(rows: Json[], previous: SalesLine[]): SalesLine[] {
  const hydrated = hydrateSalesLines(rows);
  return hydrated.map((line, index) => {
    const prior = previous.find((candidate) => text(candidate.name) && text(candidate.name) === text(line.name))
      ?? previous[index];
    if (!prior || text(prior.item_code) !== text(line.item_code)) return line;
    return {
      ...line,
      _itemName: prior._itemName,
      _context: prior._context,
      _allowedColors: prior._allowedColors,
      _overrides: prior._overrides,
      _commercial: prior._commercial,
      _bomPreview: prior._bomPreview,
      _bomComponentNames: prior._bomComponentNames,
      _bomError: prior._bomError,
      _loading: false,
      _error: "",
      _pricingError: prior._pricingError,
    };
  });
}

function itemSearchScore(option: { value: string; label?: string; description?: string }, query: string): number {
  const needle = normalized(query);
  if (!needle) return 0;
  const code = normalized(option.value);
  const label = normalized(option.label || option.description);
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
    width_pb_ray_m: line.width_pb_ray_m,
    width_pb_nhua_m: line.width_pb_nhua_m,
    width_m: line.width_m,
    height_m: line.height_m,
    mesh_height_m: line.mesh_height_m,
    set_count: line.set_count,
    leaf_variant: line.leaf_variant,
    ray_type: line.ray_type,
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

function salesOrderErrorMessage(error: unknown): string {
  const message = text(mapError(error).message);
  const key = normalized(message);
  if (!message || key.includes("failed to fetch") || key.includes("networkerror") || key.includes("network request failed")) {
    return "Không kết nối được máy chủ local 8799. Hãy bật backend rồi bấm Thử lại.";
  }
  if (key.includes("item price") && key.includes("does not exist")) {
    return "Không tìm thấy đơn giá đúng Bảng giá, Mặt hàng, ĐVT và biến thể. Hãy kiểm tra Item Price rồi tính lại.";
  }
  if (key.includes("unauthorized") || key.includes("session") && key.includes("expired")) {
    return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử lại.";
  }
  return message;
}

function commercialHeaderSignature(header: Json): string {
  return [
    text(header.customer),
    text(header.customer_group),
    text(header.selling_price_list),
    text(header.transaction_date),
    text(header.currency),
    text(header.delivery_date),
  ].join("\u001f");
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [headerError, setHeaderError] = useState("");
  const headerErrorRef = useRef("");
  const [documentPreviewPending, setDocumentPreviewPending] = useState(0);
  const [customerHydrating, setCustomerHydrating] = useState(false);
  const customerHydrationSeq = useRef(0);
  const [caps, setCaps] = useState<SalesCaps>({});
  const [productionCaps, setProductionCaps] = useState<SalesCaps>({});
  const [sourceModified, setSourceModified] = useState("");
  const [docstatus, setDocstatus] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const closeSeen = useRef(props.closeRequest ?? 0);
  const lineSeq = useRef(new Map<string, number>());
  const previewClock = useRef(createSalesOrderPreviewClock());
  const itemNameCache = useRef(new Map<string, string>());
  const didInitialLinePreview = useRef(false);
  const lastCommercialContext = useRef("");

  const documentName = text(props.name);
  const isExisting = Boolean(documentName);
  const formReadOnly = isExisting ? (!caps.write || docstatus !== 0) : !caps.create;
  const canSave = isExisting ? !formReadOnly : Boolean(caps.create);
  const canSubmit = docstatus === 0 && Boolean(caps.submit) && (isExisting ? !formReadOnly : Boolean(caps.create));

  const setHeaderState = useCallback((next: Json) => {
    headerRef.current = next;
    setHeader(next);
  }, []);

  const setHeaderPreviewError = useCallback((message: string) => {
    headerErrorRef.current = message;
    setHeaderError(message);
  }, []);

  const beginDocumentPreview = useCallback(() => {
    const revision = beginSalesOrderDocumentPreview(previewClock.current);
    setDocumentPreviewPending(previewClock.current.pending);
    return revision;
  }, []);

  const finishDocumentPreview = useCallback(() => {
    const pending = finishSalesOrderDocumentPreview(previewClock.current);
    setDocumentPreviewPending(pending);
  }, []);

  const markDocumentChanged = useCallback(() => markSalesOrderDocumentChanged(previewClock.current), []);

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

  const markActiveLinesForReprice = useCallback(() => {
    const current = linesRef.current;
    if (!current.some((line) => text(line.item_code))) return;
    replaceLines(current.map((line) => text(line.item_code)
      ? {
          ...line,
          _loading: true,
          _pricingError: "",
          _commercial: undefined,
          _bomPreview: undefined,
          _bomComponentNames: {},
          _bomError: "",
          rate: undefined,
          amount: undefined,
          discount_amount: undefined,
          adjustment_amount: undefined,
          net_amount: undefined,
        }
      : line), false);
  }, [replaceLines]);

  const patchLineFromUser = useCallback((key: string, patch: Partial<SalesLine>) => {
    markDocumentChanged();
    const current = linesRef.current.find((line) => line._key === key);
    const active = Boolean(text(current?.item_code) || text(patch.item_code));
    // Không giữ priced_qty của preview cũ sau khi người dùng vừa đổi SL/quy cách.
    // Trong lúc request mới chạy, cột Khối lượng sẽ rơi về qty hiện tại thay vì đứng im.
    patchLine(key, active ? { ...patch, _loading: true, _commercial: undefined } : patch, true);
  }, [markDocumentChanged, patchLine]);

  const salesServices = useMemo<FieldServices>(() => ({
    ...services,
    searchLink: async (doctype, query, options) => {
      // Dữ liệu cũ của danh mục này chưa lưu `disabled: 0`; filter metadata
      // `disabled = 0` vừa loại nhầm tài khoản đang dùng, vừa không thuộc tập
      // filter được công bố của list service. Backend vẫn kiểm tra quyền đọc.
      if (doctype === "Tài khoản ngân hàng" && services.searchLink) {
        return services.searchLink(doctype, query, { ...options, filters: undefined });
      }
      if (doctype !== "Item" || !services.searchLink) return services.searchLink?.(doctype, query, options) ?? [];
      const raw = text(query);
      const terms = salesItemSearchTerms(raw);
      const batches = await Promise.allSettled(terms.map((term) => services.searchLink!(doctype, term, { ...options, pageLength: 100 })));
      const merged = new Map<string, { value: string; label?: string; description?: string }>();
      let firstFailure: unknown;
      let fulfilledCount = 0;
      for (const batch of batches) {
        if (batch.status === "fulfilled") {
          fulfilledCount += 1;
          for (const option of batch.value) if (!merged.has(option.value)) merged.set(option.value, option);
        } else if (firstFailure === undefined) firstFailure = batch.reason;
      }
      if (!fulfilledCount) throw firstFailure ?? new Error("Không tải được danh sách mặt hàng.");
      const candidates = [...merged.values()]
        .sort((left, right) => itemSearchScore(right, raw) - itemSearchScore(left, raw) || left.value.localeCompare(right.value, "vi"))
        .slice(0, 200);
      const labels = new Map<string, string>();
      if (services.callPost && candidates.length) {
        try {
          const resolved = await services.callPost<Array<{ name?: string; label?: string }>>(
            "metaforge.api.resolve_display_values",
            { items: JSON.stringify(candidates.map((option) => ({ doctype: "Item", name: option.value }))) },
          );
          for (const item of resolved) {
            const name = text(item.name);
            const label = text(item.label);
            if (name && label && label !== name) labels.set(name, label);
          }
        } catch {
          // Search_link vẫn dùng được theo mã nếu batch title tạm lỗi.
        }
      }
      const displayOptions = candidates
        // Trong danh sách: mã trước + tên sau để tìm đúng hàng. Sau khi chọn, resolveDisplay
        // bên dưới vẫn trả đúng mã vì Tên hàng đã có cột riêng ngay bên cạnh.
        .map((option) => {
          const label = labels.get(option.value) || text(option.label);
          const description = text(option.description);
          const itemName = label && label !== option.value
            ? label
            : description && description !== option.value ? description : "";
          return { value: option.value, label: option.value, ...(itemName ? { description: itemName } : {}) };
        })
        .sort((left, right) => itemSearchScore(right, raw) - itemSearchScore(left, raw) || left.value.localeCompare(right.value, "vi"))
        .slice(0, 100);
      return displayOptions;
    },
    resolveDisplay: async (doctype, name) => doctype === "Item"
      ? { label: name }
      : services.resolveDisplay?.(doctype, name) ?? { label: name },
  }), [services]);
  const readOnlyAdministrativeServices = useMemo<FieldServices>(() => ({
    ...services,
    quickCreate: undefined,
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

  const requestDocumentPreview = useCallback(async (next: Json, changedField: string, sourceLines = linesRef.current): Promise<SalesOrderDocumentPreviewPatch> => {
    const result = await adapter.callPost<Json>("alumdoor.ui.preview_document", {
      doctype: "Sales Order",
      doc: { ...next, items: sourceLines.filter((line) => text(line.item_code)).map(cleanLine) },
      changed_field: changedField,
    });
    return {
      patch: result.patch && typeof result.patch === "object" && !Array.isArray(result.patch) ? result.patch as Json : {},
      clear: Array.isArray(result.clear) ? result.clear.map(text).filter(Boolean) : [],
    };
  }, [adapter, cleanLine]);

  const applyInteractiveDocumentPreview = useCallback((result: SalesOrderDocumentPreviewPatch) => {
    const current = headerRef.current;
    const next = applySalesOrderDocumentPreview(current, result) as Json;
    if (commercialHeaderSignature(current) !== commercialHeaderSignature(next)) markActiveLinesForReprice();
    setHeaderState(next);
  }, [markActiveLinesForReprice, setHeaderState]);

  const refreshDocumentPreview = useCallback(async (changedField = "items", sourceLines = linesRef.current) => {
    const revision = beginDocumentPreview();
    const snapshot = headerRef.current;
    try {
      const result = await requestDocumentPreview(snapshot, changedField, sourceLines);
      if (!canApplySalesOrderDocumentPreview(previewClock.current, revision)) return;
      setHeaderPreviewError("");
      applyInteractiveDocumentPreview(result);
    } catch (error) {
      if (!canApplySalesOrderDocumentPreview(previewClock.current, revision)) return;
      setHeaderPreviewError(salesOrderErrorMessage(error));
    } finally {
      finishDocumentPreview();
    }
  }, [applyInteractiveDocumentPreview, beginDocumentPreview, finishDocumentPreview, requestDocumentPreview, setHeaderPreviewError]);

  const setHeaderField = useCallback((fieldname: string, value: unknown, preview = false) => {
    markDocumentChanged();
    const current = headerRef.current;
    const isCustomer = fieldname === "customer";
    const customerSeq = isCustomer ? ++customerHydrationSeq.current : 0;
    const next: Json = {
      ...current,
      [fieldname]: value,
      ...(fieldname === "payment_method" && text(value) !== "Chuyển khoản" ? { bank_account: undefined } : {}),
      ...(fieldname === "install_province" ? { install_ward: undefined } : {}),
    };
    if (isCustomer) {
      for (const customerField of CUSTOMER_CONTEXT_FIELDS) next[customerField] = undefined;
      setCustomerHydrating(true);
    }
    if (!isCustomer && commercialHeaderSignature(current) !== commercialHeaderSignature(next)) markActiveLinesForReprice();
    setHeaderState(next);
    setDirty(true);
    if (!preview) {
      if (isCustomer && customerSeq === customerHydrationSeq.current) setCustomerHydrating(false);
      return;
    }
    setHeaderPreviewError("");
    const revision = beginDocumentPreview();
    void requestDocumentPreview(next, fieldname)
      .then((result) => {
        if (!canApplySalesOrderDocumentPreview(previewClock.current, revision)) return;
        setHeaderPreviewError("");
        applyInteractiveDocumentPreview(result);
      })
      .catch((error) => {
        if (!canApplySalesOrderDocumentPreview(previewClock.current, revision)) return;
        setHeaderPreviewError(salesOrderErrorMessage(error));
      })
      .finally(() => {
        finishDocumentPreview();
        if (isCustomer && customerSeq === customerHydrationSeq.current) setCustomerHydrating(false);
      });
  }, [applyInteractiveDocumentPreview, beginDocumentPreview, finishDocumentPreview, markActiveLinesForReprice, markDocumentChanged, requestDocumentPreview, setHeaderPreviewError, setHeaderState]);

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
        const [itemMeta, boot, capabilities, productionCapabilities, existingResult] = await Promise.all([
          adapter.getMeta(childDoctype),
          adapter.getBoot(),
          adapter.getCapabilities("Sales Order", documentName || undefined),
          adapter.getCapabilities("Production Request").catch(() => ({})),
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

        let currentEmployee = "";
        if (salesMeta.fields.some((field) => field.fieldname === "responsible_person")) {
          try {
            const employees = await adapter.getList("Employee", {
              fields: ["name", "employee_name", "user_id", "employee_status"],
              filters: [["user_id", "=", boot.user], ["employee_status", "=", "Đang làm việc"]] as Filters,
              pageLength: 1,
            });
            currentEmployee = text(employees[0]?.name);
            if (currentEmployee) defaults.responsible_person = currentEmployee;
          } catch {
            // No Employee mapping: leave blank rather than storing a display name in Link(Employee).
          }
        }

        const existingItems = Array.isArray(existingDoc?.items) ? existingDoc!.items as Json[] : [];
        const initialHeader = existingDoc ? { ...defaults, ...existingDoc, items: undefined } : defaults;
        // Người phụ trách thuộc user đang thao tác, không kế thừa người cũ từ khách hàng
        // hoặc từ payload của một phiên trước.
        if (currentEmployee) initialHeader.responsible_person = currentEmployee;
        const initialLines = existingDoc ? hydrateSalesLines(existingItems) : [newLine(0)];
        setMeta(salesMeta);
        setChildMeta(itemMeta);
        setCaps(capabilities as SalesCaps);
        setProductionCaps(productionCapabilities as SalesCaps);
        setSourceModified(text(existingDoc?.modified));
        setDocstatus(Number(existingDoc?.docstatus) || 0);
        setHeaderState(initialHeader);
        replaceLines(initialLines, false);
        setDirty(false);
      } catch (error) {
        if (active) setFatal(salesOrderErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, businessContext, contextPolicies, documentName, loadAttempt, replaceLines, setHeaderState]);

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
    const documentRevision = previewClock.current.revision;
    const seq = (lineSeq.current.get(row._key) ?? 0) + 1;
    lineSeq.current.set(row._key, seq);
    const isCurrent = () => lineSeq.current.get(row._key) === seq
      && canApplySalesOrderDocumentPreview(previewClock.current, documentRevision);
    const abortIfStale = () => {
      if (isCurrent()) return false;
      // Một preview document khác có thể tăng revision trong lúc request BOM đang bay.
      // Không để dòng kẹt `_loading`; lifecycle bên dưới sẽ gọi lại nếu BOM vẫn chưa resolve.
      if (lineSeq.current.get(row._key) === seq) patchLine(row._key, { _loading: false }, false);
      return true;
    };
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
      if (abortIfStale()) return;
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
      const customerGroup = text(headerRef.current.customer_group);
      if (normalized(context.inventory_mode) === normalized("Thành phẩm theo m2")) {
        const widthField = salesWidthInputField({ ...row, ...next, _context: context } as SalesLine, customerGroup);
        const businessWidth = widthField
          ? positiveNumber(next[widthField] ?? row[widthField])
          : undefined;
        if (businessWidth !== undefined) next.width_m = businessWidth;
      }

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
          if (abortIfStale()) return;
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
          if (abortIfStale()) return;
          next._pricingError = salesOrderErrorMessage(error);
        }
      }

      const bomEligible = isFullSetSalesItem(candidate);
      if (bomEligible) {
        try {
          const bom = await adapter.callPost<BomPreview>("alumdoor.sales.preview_bom_requirements", {
            ...cleanLine(candidate),
            customer_group: customerGroup,
            delivery_date: text(headerRef.current.delivery_date) || today(),
          });
          if (abortIfStale()) return;
          const components = Array.isArray(bom.components) ? bom.components : [];
          next._bomPreview = { ...bom, components };
          next._bomComponentNames = components.length ? await loadBomComponentNames(components) : {};
          if (abortIfStale()) return;
          next._bomError = "";
        } catch (error) {
          if (abortIfStale()) return;
          next._bomPreview = undefined;
          next._bomComponentNames = {};
          next._bomError = salesOrderErrorMessage(error);
        }
      } else {
        next._bomPreview = undefined;
        next._bomComponentNames = {};
        next._bomError = "";
      }
      if (abortIfStale()) return;
      const nextLines = patchLine(row._key, next, false);
      if (refreshTotals) await refreshDocumentPreview("items", nextLines);
    } catch (error) {
      if (isCurrent()) patchLine(row._key, { ...patch, _loading: false, _error: salesOrderErrorMessage(error) }, false);
      else abortIfStale();
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

  useEffect(() => {
    if (loading || !childMeta || customerHydrating) return;
    const unresolved = lines.filter((line) => {
      if (!isFullSetSalesItem(line) || line._loading || line._bomPreview || text(line._bomError)) return false;
      return true;
    });
    if (!unresolved.length) return;
    const timer = window.setTimeout(() => {
      void Promise.all(unresolved.map((line) => previewLine(line, "bom_lifecycle", {}, false)))
        .finally(() => void refreshDocumentPreview("items"));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [childMeta, customerHydrating, header.customer_group, lines, loading, previewLine, refreshDocumentPreview]);

  useEffect(() => {
    if (loading || !childMeta || customerHydrating) return;
    const inconsistent = lines.filter((line) => {
      if (!text(line.item_code) || line._loading || !isDirectOrdinaryQuantityLine(line)) return false;
      const entered = positiveNumber(line.set_count);
      const priced = positiveNumber(line.qty);
      return entered !== undefined && entered !== priced;
    });
    if (!inconsistent.length) return;
    const timer = window.setTimeout(() => {
      void Promise.all(inconsistent.map((line) => previewLine(line, "quantity_lifecycle", {}, false)))
        .finally(() => void refreshDocumentPreview("items"));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [childMeta, customerHydrating, lines, loading, previewLine, refreshDocumentPreview]);

  const commercialContext = commercialHeaderSignature(header);
  useEffect(() => {
    if (loading || !childMeta || customerHydrating) return;
    if (!lastCommercialContext.current) { lastCommercialContext.current = commercialContext; return; }
    if (lastCommercialContext.current === commercialContext) return;
    lastCommercialContext.current = commercialContext;
    const active = linesRef.current.filter((line) => text(line.item_code));
    void Promise.all(active.map((line) => previewLine(line, "parent_context", {}, false))).finally(() => void refreshDocumentPreview("items"));
  }, [childMeta, commercialContext, customerHydrating, loading, previewLine, refreshDocumentPreview]);

  const commitLine = useCallback((key: string, fieldname: string, value: unknown) => {
    const current = linesRef.current.find((line) => line._key === key);
    if (!current) return;
    markDocumentChanged();
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
        _loading: Boolean(itemCode),
        uom: undefined,
        color: undefined,
        ray_type: undefined,
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
      const nextLines = patchLine(key, reset, false);
      if (itemCode) void previewLine({ ...current, ...reset } as SalesLine, fieldname, reset);
      else void refreshDocumentPreview("items", nextLines);
      return;
    }
    const latest = linesRef.current.find((line) => line._key === key) ?? current;
    const resolvedValue = latest[fieldname] !== undefined ? latest[fieldname] : value;
    const patch = { [fieldname]: resolvedValue } as Partial<SalesLine>;
    patchLine(key, { ...patch, _loading: true }, false);
    void previewLine({ ...latest, ...patch } as SalesLine, fieldname, patch);
  }, [markDocumentChanged, patchLine, previewLine, refreshDocumentPreview]);

  const commitBomActualComponents = useCallback((key: string, rows: BomActualComponentRow[]) => {
    const current = linesRef.current.find((line) => line._key === key);
    if (!current) return;
    markDocumentChanged();
    setDirty(true);
    const patch: Partial<SalesLine> = { bom_actual_components: rows };
    patchLine(key, { ...patch, _loading: true }, false);
    void previewLine({ ...current, ...patch } as SalesLine, "bom_actual_components", patch);
  }, [markDocumentChanged, patchLine, previewLine]);

  const addLine = useCallback(() => {
    markDocumentChanged();
    replaceLines([...linesRef.current, newLine(linesRef.current.length)], true);
  }, [markDocumentChanged, replaceLines]);

  const addFive = useCallback(() => {
    markDocumentChanged();
    replaceLines([...linesRef.current, ...Array.from({ length: 5 }, (_, index) => newLine(linesRef.current.length + index))], true);
  }, [markDocumentChanged, replaceLines]);

  const replaceLinesAndRefreshTotals = useCallback((next: SalesLine[]) => {
    markDocumentChanged();
    replaceLines(next, true);
    void refreshDocumentPreview("items", next);
  }, [markDocumentChanged, refreshDocumentPreview, replaceLines]);

  const duplicateLine = useCallback((key: string) => {
    const current = linesRef.current;
    const index = current.findIndex((line) => line._key === key);
    if (index < 0) return;
    const source = current[index]!;
    const duplicate = { ...source, name: undefined, doctype: undefined, _key: newLine(current.length)._key, _loading: false, _error: "", _pricingError: "" } as SalesLine;
    replaceLinesAndRefreshTotals([...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)]);
  }, [replaceLinesAndRefreshTotals]);

  const deleteLine = useCallback((key: string) => {
    replaceLinesAndRefreshTotals(linesRef.current.filter((line) => line._key !== key));
    setSelectedLineKeys((current) => { const next = new Set(current); next.delete(key); return next; });
  }, [replaceLinesAndRefreshTotals]);

  const deleteSelected = useCallback(() => {
    if (!selectedLineKeys.size) return;
    replaceLinesAndRefreshTotals(linesRef.current.filter((line) => !selectedLineKeys.has(line._key)));
    setSelectedLineKeys(new Set());
  }, [replaceLinesAndRefreshTotals, selectedLineKeys]);

  const validate = useCallback((): string | null => {
    if (previewClock.current.pending > 0 || customerHydrating) return "Đơn đang tính lại dữ liệu từ server, hãy hoàn tất trước khi lưu.";
    if (text(headerErrorRef.current)) return `Cần xử lý lỗi tính lại trước khi lưu: ${text(headerErrorRef.current)}`;
    if (!text(headerRef.current.customer)) return "Cần chọn khách hàng.";
    if (!text(headerRef.current.transaction_date)) return "Cần ngày đặt hàng.";
    if (!text(headerRef.current.selling_price_list)) return "Cần Bảng giá áp dụng theo commercial contract hiện hành.";
    const depositAmount = numberValue(headerRef.current.deposit_amount) ?? 0;
    const grandTotal = numberValue(headerRef.current.grand_total) ?? 0;
    if (depositAmount < 0) return "Tiền cọc không được nhỏ hơn 0.";
    if (depositAmount > grandTotal) return "Tiền cọc không được lớn hơn tiền phải trả của đơn.";
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
  }, [customerHydrating]);

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
    const finalProjection = await requestDocumentPreview(document, "items", linesRef.current);
    const finalPreview = applySalesOrderDocumentPreview(document, finalProjection) as Json;
    const payload = serializeCreateDocument(meta, finalPreview) as Partial<Doc>;
    const saved = isExisting
      ? await adapter.updateDoc("Sales Order", documentName, payload, sourceModified)
      : await adapter.createDoc("Sales Order", payload);
    const savedName = text(saved.name) || documentName;
    setSourceModified(text(saved.modified));
    setDocstatus(Number(saved.docstatus) || 0);
    setHeaderState({ ...headerRef.current, ...saved, items: undefined });
    const savedItems = Array.isArray(saved.items) ? saved.items as Json[] : [];
    if (savedItems.length) replaceLines(hydrateSavedLines(savedItems, linesRef.current), false);
    setDirty(false);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", "Sales Order"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "list", "Sales Order"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "count", "Sales Order"], refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: [scopeKey, "overview"], refetchType: "none" }),
    ]).catch(() => undefined);
    return saved;
  }, [adapter, buildDocument, documentName, isExisting, meta, queryClient, replaceLines, requestDocumentPreview, scopeKey, setHeaderState, sourceModified, validate]);

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
      toast.error(salesOrderErrorMessage(error));
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
      if (submittedItems.length) replaceLines(hydrateSavedLines(submittedItems, linesRef.current), false);
      setCaps(await adapter.getCapabilities("Sales Order", savedName) as SalesCaps);
      setDirty(false);
      toast.success(`Đã ghi sổ đơn ${savedName}.`);
      if (!isExisting) props.onCreated(savedName);
      else props.onSaved?.(savedName);
    } catch (error) {
      toast.error(salesOrderErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }, [adapter, canSubmit, documentName, isExisting, persistDraft, props, replaceLines, setHeaderState]);

  const openProduction = useCallback(() => {
    if (!documentName || docstatus !== 1 || !productionCaps.read) return;
    window.location.assign(`/app/${encodeURIComponent("Production Request")}?f_sales_order=${encodeURIComponent(documentName)}`);
  }, [docstatus, documentName, productionCaps.read]);

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Đang mở Sales Workbench…</span></div>;
  if (fatal) return <div className="grid h-full place-items-center p-6"><div className="max-w-md space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><div className="flex items-start gap-2 text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{fatal}</span></div><Button type="button" variant="outline" size="sm" onClick={() => { setFatal(""); setLoading(true); setLoadAttempt((value) => value + 1); }}><RefreshCw className="size-3.5" /> Thử kết nối lại</Button></div></div>;
  if (!meta || !childMeta) return <div className="p-6 text-sm text-muted-foreground">Không đọc được cấu trúc Sales Order.</div>;

  const metaField = (fieldname: string) => meta.fields.find((field) => field.fieldname === fieldname);
  const headerField = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string) => metaField(fieldname) ?? fallbackField(fieldname, label, fieldtype, options);
  const headerRequired = (fieldname: string) => Boolean(metaField(fieldname)?.reqd);
  const paymentOptions = optionList(meta, "payment_method", ["Tiền mặt", "Chuyển khoản", "Ghi công nợ"]);
  const rules = pricingSnapshots(lines);
  const totalArea = lines.reduce((sum, line) => sum + (lineBillableArea(line) ?? 0), 0);
  const unresolvedLines = activeLines.filter((line) => line._loading || line._error || line._pricingError).length;
  const bomBlocked = activeLines.filter((line) => line._bomPreview?.actual_complete === false).length;
  const approvalLines = activeLines.filter(lineCommercialNeedsApproval).length;
  const approvalNeeded = checked(header.discount_requires_approval) || approvalLines > 0;
  const busy = saving || submitting;
  const previewBlocked = isSalesOrderPersistenceBlocked(previewClock.current, headerError) || customerHydrating;
  const persistenceBlocked = busy || previewBlocked || unresolvedLines > 0;
  const recalculating = customerHydrating || documentPreviewPending > 0 || unresolvedLines > 0;

  const headerControl = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string, readOnly = false, preview = false) => (
    <AlumdoorSalesOrderField
      id={`sales-v2-complete-header-${fieldname}`}
      field={headerField(fieldname, label, fieldtype, options)}
      label={label}
      value={header[fieldname]}
      onChange={(value) => setHeaderField(fieldname, fieldValueForServer(headerField(fieldname, label, fieldtype, options).fieldtype, value), preview)}
      registry={registry}
      services={["install_province", "install_ward"].includes(fieldname)
        ? readOnlyAdministrativeServices
        : fieldname === "bank_account" ? salesServices : services}
      parentDoctype="Sales Order"
      docValues={header}
      roles={roles}
      required={headerRequired(fieldname)}
      readOnly={formReadOnly || busy || readOnly}
      compact
      className={`[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_button]:!h-8 ${
        ["install_address", "manual_note", "shipping_note"].includes(fieldname)
          ? "[&_textarea]:!h-8 [&_textarea]:!min-h-8 [&_textarea]:!resize-none [&_textarea]:!py-1"
          : ""
      }`}
    />
  );

  return <>
    <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-sales-order-v2-complete">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="w-full space-y-3 px-3 py-3">
          {formReadOnly ? <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">Đơn đã ghi sổ/khóa hoặc tài khoản không có quyền sửa. Giá, BOM và số tiền chỉ hiển thị theo dữ liệu server.</div> : null}
          {headerError ? <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{headerError}</span><Button type="button" variant="outline" size="sm" className="h-7" disabled={busy} onClick={() => void refreshDocumentPreview("manual_retry")}>Thử lại</Button></div> : null}

          <fieldset disabled={formReadOnly || busy} className="contents">
            <section className="rounded-lg border bg-card p-2.5" data-section="sales-v2-header-complete">
              <div className="space-y-2">
                <div className="grid gap-x-2 gap-y-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.35fr)_minmax(165px,0.75fr)_minmax(210px,0.95fr)_minmax(175px,0.8fr)_minmax(175px,0.8fr)]">
                  {headerControl("customer", "Khách hàng", "Link", "Customer", false, true)}
                  {metaField("customer_group") ? headerControl("customer_group", "Nhóm giá", metaField("customer_group")!.fieldtype, metaField("customer_group")!.options, false, true) : null}
                  {headerControl("selling_price_list", "Bảng giá", "Link", "Price List", false, true)}
                  {headerControl("transaction_date", "Ngày đơn", "Date", undefined, false, true)}
                  {headerControl("delivery_date", "Ngày giao", "Date", undefined, false, true)}
                </div>
                <div className={`grid gap-x-2 gap-y-2 md:grid-cols-2 ${
                  text(header.payment_method) === "Chuyển khoản" && metaField("bank_account")
                    ? "xl:grid-cols-[minmax(200px,1.2fr)_minmax(125px,0.72fr)_minmax(210px,1.2fr)_minmax(112px,0.66fr)_minmax(215px,1.25fr)_minmax(120px,0.72fr)_minmax(82px,0.48fr)]"
                    : "xl:grid-cols-[minmax(210px,1.3fr)_minmax(130px,0.78fr)_minmax(220px,1.3fr)_minmax(115px,0.68fr)_minmax(125px,0.76fr)_minmax(82px,0.48fr)]"
                }`}>
                  {metaField("contact_person") ? headerControl("contact_person", "Người liên hệ") : null}
                  {metaField("phone") ? headerControl("phone", "SĐT") : null}
                  {metaField("responsible_person") ? headerControl("responsible_person", "Người phụ trách", "Link", "Employee", true) : null}
                  {metaField("payment_method") ? headerControl("payment_method", "Thanh toán", "Select", paymentOptions.join("\n"), false, true) : null}
                  {text(header.payment_method) === "Chuyển khoản" && metaField("bank_account") ? headerControl("bank_account", "Tài khoản ngân hàng", "Link", text(metaField("bank_account")?.options) || "Tài khoản ngân hàng") : null}
                  {metaField("deposit_amount") ? headerControl("deposit_amount", "Tiền cọc", "Currency", undefined, false, true) : null}
                  {metaField("vat_rate") ? headerControl("vat_rate", "% VAT", "Percent", undefined, false, true) : null}
                </div>
                <div className="grid gap-x-2 gap-y-2 md:grid-cols-2 xl:grid-cols-[minmax(125px,0.58fr)_minmax(155px,0.72fr)_minmax(210px,1fr)_minmax(245px,1.15fr)_minmax(245px,1.15fr)]">
                  {metaField("install_province") ? <div>{headerControl("install_province", "Tỉnh/TP", "Link", text(metaField("install_province")?.options) || "Tỉnh Thành")}</div> : null}
                  {metaField("install_ward") ? <div>{headerControl("install_ward", "Xã/Phường", "Link", text(metaField("install_ward")?.options) || "Phường Xã")}</div> : null}
                  {metaField("install_address") ? <div>{headerControl("install_address", "Số nhà / đường", "Small Text")}</div> : null}
                  {metaField("shipping_note") ? <div>{headerControl("shipping_note", "Ghi chú vận chuyển", "Small Text")}</div> : null}
                  {metaField("manual_note") ? <div>{headerControl("manual_note", "Ghi chú vận hành", "Small Text")}</div> : null}
                </div>
              </div>
              {customerHydrating ? <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Đang nạp Nhóm giá, liên hệ, SĐT, địa chỉ và bảng giá của khách…</div> : null}
            </section>

            <AlumdoorSalesOrderLineTableComplete
              lines={lines}
              customerGroup={text(header.customer_group)}
              childMeta={childMeta}
              registry={registry}
              services={salesServices}
              roles={roles}
              readOnly={formReadOnly || busy}
              selectedKeys={selectedLineKeys}
              leafVariants={leafVariants}
              onToggleSelection={(key, checkedValue) => setSelectedLineKeys((current) => { const next = new Set(current); if (checkedValue) next.add(key); else next.delete(key); return next; })}
              onToggleAll={(checkedValue) => setSelectedLineKeys(checkedValue ? new Set(lines.map((line) => line._key)) : new Set())}
              onPatch={patchLineFromUser}
              onCommit={commitLine}
              onAdd={addLine}
              onAddFive={addFive}
              onDuplicate={duplicateLine}
              onDelete={deleteLine}
              onDeleteSelected={deleteSelected}
              onBomActualChange={commitBomActualComponents}
            />

            <section className="rounded-lg border bg-card" data-section="sales-v2-summary-complete" aria-label="Tóm tắt đơn">
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 xl:grid-cols-9">
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Dòng hàng</div><div className="mt-0.5 font-semibold tabular-nums">{activeLines.length}</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Diện tích cửa</div><div className="mt-0.5 font-semibold tabular-nums">{quantity(totalArea)} m²</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Tiền hàng</div><div className="mt-0.5 font-semibold tabular-nums">{money(header.total_amount)} ₫</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Chiết khấu</div><div className="mt-0.5 font-semibold tabular-nums">−{money(header.discount_amount)} ₫</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Phụ thu</div><div className="mt-0.5 font-semibold tabular-nums">+{money(header.surcharge_amount)} ₫</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">VAT ({quantity(header.vat_rate ?? 0)}%)</div><div className="mt-0.5 font-semibold tabular-nums">{money(header.vat_amount)} ₫</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] font-semibold text-muted-foreground">Tiền phải trả</div><div className="mt-0.5 font-bold tabular-nums text-primary">{money(header.grand_total)} ₫</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">Tiền cọc</div><div className="mt-0.5 font-semibold tabular-nums">−{money(header.deposit_amount)} ₫</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] font-semibold text-muted-foreground">Còn phải thu</div><div className="mt-0.5 text-lg font-bold tabular-nums text-primary">{money(header.outstanding_amount ?? header.grand_total)} ₫</div></div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-[11px]">
                {recalculating ? <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> Đang tính lại</span> : unresolvedLines || bomBlocked ? <span className="inline-flex items-center gap-1.5"><AlertTriangle className="size-3.5" />{unresolvedLines ? `${unresolvedLines} dòng chưa tính xong` : ""}{unresolvedLines && bomBlocked ? " · " : ""}{bomBlocked ? `${bomBlocked} dòng BOM còn thiếu vật tư thực tế` : ""}</span> : <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5" /> Dữ liệu preview đã sẵn sàng</span>}
                {approvalNeeded ? <Badge variant="outline">{approvalLines || 1} dòng / thay đổi cần duyệt</Badge> : null}
                <span className="ml-auto text-muted-foreground">Bảng giá: <strong className="font-medium text-foreground">{text(header.selling_price_list) || "Chưa chọn"}</strong></span>
              </div>

              {rules.length ? <details className="border-t px-3 py-2 text-[11px]"><summary className="cursor-pointer select-none font-medium">Chính sách giá đang áp · {rules.length} quy tắc</summary><div className="mt-2 flex flex-wrap gap-1.5">{rules.map((rule, index) => <Badge key={`${text(rule.rule_name)}-${index}`} variant="outline">{text(rule.rule_name)}</Badge>)}</div></details> : null}
            </section>
          </fieldset>
        </div>
      </div>

      <div className="shrink-0 border-t bg-card px-3 py-1.5 shadow-[0_-4px_14px_rgba(0,0,0,0.035)]">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2"><span className="text-muted-foreground">{recalculating ? "Đang tính lại" : dirty ? "Có thay đổi chưa lưu" : docstatus === 1 ? "Đã ghi sổ" : "Nháp đã đồng bộ"}</span><strong className="tabular-nums">Còn phải thu: {money(header.outstanding_amount ?? header.grand_total)} ₫</strong></div>
          <div className="flex flex-wrap items-center gap-1.5">
            {docstatus === 1 && documentName && productionCaps.read ? <Button type="button" variant="outline" size="sm" onClick={openProduction}><Factory className="size-3.5" /> Sản xuất</Button> : null}
            {isExisting ? <Button type="button" variant="outline" size="sm" onClick={() => props.onPreviewCreated(documentName)}><Eye className="size-3.5" /> In / xem</Button> : null}
            <Button type="button" variant="ghost" size="sm" onClick={requestClose}>{isExisting ? "Đóng" : "Hủy"}</Button>
            <Button type="button" variant="outline" size="sm" disabled={busy || formReadOnly} onClick={() => { const active = linesRef.current.filter((line) => text(line.item_code)); void Promise.all(active.map((line) => previewLine(line, "manual_refresh", {}, false))).finally(() => void refreshDocumentPreview("manual_refresh")); }}><RefreshCw className="size-3.5" /> Tính lại</Button>
            {docstatus === 0 ? <Button type="button" variant="outline" size="sm" disabled={persistenceBlocked || !canSave} onClick={() => void saveDraft(false)}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Lưu nháp</Button> : null}
            {docstatus === 0 && canSubmit ? <Button type="button" size="sm" disabled={persistenceBlocked} onClick={() => void submitOrder()}>{submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Ghi sổ đơn</Button> : null}
            {docstatus === 0 && isExisting ? <Button type="button" variant="outline" size="sm" disabled={persistenceBlocked || !canSave} onClick={() => void saveDraft(true)}><Eye className="size-3.5" /> Lưu & xem</Button> : null}
          </div>
        </div>
      </div>
    </div>

    <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle></DialogHeader>
        <div className="space-y-4 p-1 text-sm"><p className="text-muted-foreground">Đơn đang có thay đổi ở thông tin đầu đơn, dòng hàng, giá/chiết khấu, VAT hoặc BOM thực tế. Đóng bây giờ sẽ bỏ các thay đổi này.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmDiscard(false)}>Tiếp tục chỉnh</Button><Button variant="destructive" onClick={() => { setConfirmDiscard(false); setDirty(false); props.onCancel(); }}>Bỏ thay đổi</Button></div></div>
      </DialogContent>
    </Dialog>
  </>;
}
