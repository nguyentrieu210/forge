/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye, Factory, Loader2, Lock, RefreshCw, Save, Send, Truck, Undo2, UserPlus } from "lucide-react";
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
import {
  AlumdoorSalesOrderField,
  fallbackField,
  supplierCustomerPrefill,
  supplierNameFromOption,
} from "./AlumdoorSalesOrderField.js";
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
  mayHaveBom,
  lineAdjustmentSplit,
  lineBillableArea,
  lineBlockingGaps,
  lineCommercialNeedsApproval,
  lineDuplicateDiscount,
  lineGiftRailViolation,
  lineReadinessBlock,
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
  type UomGap,
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

/** Trần `in` của nền tảng là 50 giá trị; giữ biên an toàn cho hai bộ lọc cùng chạy. */
const ITEM_HINT_LIMIT = 40;
/** Trần một trang list của nền tảng. Chạm trần = không kết luận được về giá — xem chỗ dùng. */
const PRICE_HINT_PAGE = 100;

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

type AdjustmentSplit = {
  /** Tổng các khoản điều chỉnh LÀM TĂNG tiền — đây mới là "Phụ thu". */
  surcharge: number;
  /** Tổng các khoản điều chỉnh LÀM GIẢM tiền (trị tuyệt đối) — thuộc nhóm "Chiết khấu". */
  reduction: number;
  /** Nhãn các quy tắc giá đang kéo tiền xuống, để giải thích số "Chiết khấu" cho người bán. */
  reductionRules: string[];
};

/**
 * `adjustment_amount` của một dòng là TỔNG ĐẠI SỐ của mọi Pricing Rule loại ADJUSTMENT,
 * nên nó có thể ÂM khi một luật giảm trừ lớn hơn các luật phụ thu. Trước đây khối tổng
 * nối cứng dấu "+" trước con số này nên in ra "+-1.550.850 ₫" — vừa sai dấu vừa gộp một
 * khoản giảm vào ô "Phụ thu". Ở đây tách lại theo dấu của TỪNG luật đã áp.
 *
 * `applied_adjustments[].amount_minor` là đơn vị minor của tiền tệ; thay vì đoán currency
 * scale, quy đổi bằng đúng tỉ lệ tổng của chính dòng đó (`adjustment_amount / Σ amount_minor`),
 * nên kết quả đúng với mọi scale.
 */
function splitLineAdjustments(lines: SalesLine[], headerSurcharge: number): AdjustmentSplit {
  let surcharge = 0;
  let reduction = 0;
  let seen = false;
  const reductionRules = new Set<string>();
  // Phép tách theo dấu nay sống ở `lineAdjustmentSplit` (model.ts) để DÒNG HÀNG và KHỐI TỔNG
  // dùng chung đúng một phép tính — hai chỗ tách khác nhau là hai con số "Chiết khấu" khác nhau.
  for (const line of lines) {
    const split = lineAdjustmentSplit(line);
    if (!split.surcharge && !split.reduction) continue;
    surcharge += split.surcharge;
    reduction += split.reduction;
    for (const label of split.reductionRules) reductionRules.add(label);
    seen = true;
  }
  if (!seen && headerSurcharge) {
    if (headerSurcharge >= 0) surcharge = headerSurcharge;
    else reduction = -headerSurcharge;
  }
  return { surcharge, reduction, reductionRules: [...reductionRules] };
}

/**
 * Cảnh báo trùng chiết khấu — nay khai ĐÚNG như chốt chặn của server
 * (`commercial-line-resolver.ts:194`): |tổng ADJUSTMENT âm| ≈ `discount_amount`.
 *
 * Điều kiện cũ ("có `discount_percentage` > 0 và có một luật âm mà TÊN nghe như chiết khấu")
 * sau bản vá P0 không bao giờ đúng nữa: dòng đi đường Pricing Rule trả về
 * `discount_percentage: 0`. Badge trở thành code chết, và UI với server nói hai thứ tiếng khác
 * nhau về cùng một lỗi tiền.
 */
function duplicateDiscountLines(lines: SalesLine[]): number {
  return lines.filter(lineDuplicateDiscount).length;
}

function hydrateSavedLines(rows: Json[], previous: SalesLine[]): SalesLine[] {
  const hydrated = hydrateSalesLines(rows);
  return hydrated.map((line, index) => {
    const prior = previous.find((candidate) => text(candidate.name) && text(candidate.name) === text(line.name))
      ?? previous[index];
    const persistedVariant = text(line.price_variant).toUpperCase();
    const persistedGiftRailDecision = persistedVariant === "TANG_RAY" || persistedVariant === "CHI_LA";
    if (!prior || text(prior.item_code) !== text(line.item_code)) {
      return persistedGiftRailDecision ? { ...line, _giftRailTouched: true } : line;
    }
    return {
      ...line,
      _giftRailTouched: prior._giftRailTouched || persistedGiftRailDecision ? true : undefined,
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

/** Id của ô header trên màn này. Giữ một chỗ để `focusHeaderField` không đoán chuỗi. */
function headerFieldId(fieldname: string): string {
  return `sales-v2-complete-header-${fieldname}`;
}

/**
 * Cuộn tới và focus ô header đang chặn lưu.
 *
 * Control của từng fieldtype tự quyết `id` rơi vào thẻ nào — Link thì rơi vào nút mở picker,
 * Data thì rơi vào `input`. Nên thử focus chính thẻ mang id trước; không focus được thì tìm
 * phần tử nhận focus đầu tiên trong cùng khối.
 *
 * Vì sao `setTimeout` chứ không `requestAnimationFrame`: màn nằm trong Radix `DialogContent`,
 * và toast lỗi vừa mount ngay trước đó. Cả hai đều chỉnh focus trong nhịp kế tiếp, nên focus
 * đặt trong rAF bị kéo ngược về khung dialog (đo ngày 23/08/2026: `activeElement` thành
 * `div[id^="radix-"]`). Lùi một nhịp ngắn để đặt sau cùng.
 */
function focusHeaderField(fieldname: string): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  window.setTimeout(() => {
    const anchor = document.getElementById(headerFieldId(fieldname));
    if (!anchor) return;
    const focusable = anchor.matches("input, select, textarea, button, [tabindex]")
      ? anchor
      : anchor.closest("div")?.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]") ?? null;
    (focusable ?? anchor).scrollIntoView({ block: "center", behavior: "smooth" });
    focusable?.focus({ preventScroll: true });
  }, 160);
}

/** Thân JSON của lỗi HTTP, nếu adapter còn giữ. Hợp đồng làn A §A.10 làm giàu chính thân này. */
function errorPayload(error: unknown): Json | undefined {
  const candidate = (error as { response?: { data?: unknown } } | undefined)?.response?.data;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Json : undefined;
}

function salesOrderErrorMessage(error: unknown): string {
  const message = text(mapError(error).message);
  const key = normalized(message);
  /**
   * Địa chỉ sửa do SERVER đưa thắng mọi câu đoán ở dưới.
   *
   * Đường 422 "ĐVT … chưa được khai" nay kèm `uom_gap.fix_where` trỏ đúng tới mã hàng cụ thể.
   * Dùng nó thay cho một câu chung chung là bớt cho người bán một vòng đi tìm.
   */
  const uomGap = errorPayload(error)?.uom_gap as UomGap | undefined;
  if (uomGap && typeof uomGap === "object" && text(uomGap.fix_where)) {
    return `${text(uomGap.message) || message} Khai ở ${text(uomGap.fix_where)}, rồi bấm Tính lại.`;
  }
  if (!message || key.includes("failed to fetch") || key.includes("networkerror") || key.includes("network request failed")) {
    return "Không kết nối được máy chủ local 8799. Hãy bật backend rồi bấm Thử lại.";
  }
  if (key.includes("item price") && key.includes("does not exist")) {
    return "Không tìm thấy đơn giá đúng Bảng giá, Mặt hàng, ĐVT và biến thể. Hãy kiểm tra Item Price rồi tính lại.";
  }
  // Nhóm ray/trục bán Mét nhưng tồn Cây/Kg. Mã nào chưa khai hệ số thì server TỪ CHỐI — đúng
  // luật "thà báo lỗi còn hơn tính ra một con số sai trong im lặng". Việc của câu này là nói
  // luôn khai ở đâu, thay vì để người bán ngồi đoán.
  if (key.includes("chua duoc khai tren mat hang") || (key.includes("dvt") && key.includes("chua duoc khai"))) {
    return `${message} Khai ở Danh mục → Hàng hoá/Vật tư → Quy đổi đơn vị, rồi bấm Tính lại.`;
  }
  if (key.includes("chua co he so quy doi")) {
    return `${message} Khai ở Danh mục → Hàng hoá/Vật tư → Quy đổi đơn vị.`;
  }
  if (key.includes("co nhieu don gia dang hoat dong")) {
    return `${message} Ngừng dùng bớt một dòng ở Danh mục → Đơn giá (Item Price).`;
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
  /**
   * Phiếu xuất kho CÒN HIỆU LỰC của đơn này. Đây là thứ quyết định đơn còn sửa được hay không.
   *
   * Luật của xưởng: ghi sổ rồi vẫn huỷ duyệt để sửa được, CHỪNG NÀO hàng chưa rời kho. Hàng đã
   * rời kho thì khoá chặt — sửa đơn lúc đó là đơn một đằng, kho một nẻo, và không ai đối chiếu
   * lại được. Phiếu đã huỷ (docstatus 2) không tính, vì hàng đã trả về kho.
   */
  const [deliveryNotes, setDeliveryNotes] = useState<Doc[]>([]);
  const [deliveryNotesLoaded, setDeliveryNotesLoaded] = useState(false);
  const [unsubmitting, setUnsubmitting] = useState(false);
  const [confirmUnsubmit, setConfirmUnsubmit] = useState(false);
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
      /**
       * Ba lượt đọc CHẠY SONG SONG cho cùng một tập ứng viên — không lượt nào nằm trên đường
       * tới hạn của lượt kia, nên dropdown không chậm thêm so với trước.
       *
       * Vì sao chỉ `ITEM_HINT_LIMIT` mã: nền tảng chặn `in` ở 50 giá trị
       * (`document-kernel/src/document-list.ts` MAX_IN_VALUES). Xin nhiều hơn là bị từ chối cả
       * lượt, và người bán mất luôn gợi ý — tệ hơn là gợi ý ít hơn một chút.
       */
      const hintCodes = candidates.slice(0, ITEM_HINT_LIMIT).map((option) => option.value);
      const hintPriceList = text(headerRef.current.selling_price_list);
      const [labelResult, itemResult, priceResult] = await Promise.allSettled([
        services.callPost && candidates.length
          ? services.callPost<Array<{ name?: string; label?: string }>>(
            "metaforge.api.resolve_display_values",
            { items: JSON.stringify(candidates.map((option) => ({ doctype: "Item", name: option.value }))) },
          )
          : Promise.resolve([]),
        hintCodes.length
          ? adapter.getList("Item", {
            fields: ["name", "item_group", "default_sales_uom", "stock_uom"],
            filters: [["name", "in", hintCodes]] as Filters,
            pageLength: ITEM_HINT_LIMIT,
          })
          : Promise.resolve([] as Doc[]),
        hintCodes.length && hintPriceList
          ? adapter.getList("Item Price", {
            fields: ["name", "item_code", "uom", "rate"],
            filters: [["price_list", "=", hintPriceList], ["item_code", "in", hintCodes]] as Filters,
            pageLength: PRICE_HINT_PAGE,
          })
          : Promise.resolve([] as Doc[]),
      ]);

      const labels = new Map<string, string>();
      // Search_link vẫn dùng được theo mã nếu batch title tạm lỗi.
      if (labelResult.status === "fulfilled") {
        for (const item of labelResult.value) {
          const name = text(item.name);
          const label = text(item.label);
          if (name && label && label !== name) labels.set(name, label);
        }
      }
      const itemFacts = new Map<string, { group: string; salesUom: string }>();
      if (itemResult.status === "fulfilled") {
        for (const row of itemResult.value) {
          const name = text(row.name);
          if (name) itemFacts.set(name, { group: text(row.item_group), salesUom: text(row.default_sales_uom) || text(row.stock_uom) });
        }
      }
      /**
       * `null` = KHÔNG BIẾT, và khác hẳn "tập rỗng".
       *
       * Trang list bị chặn ở 100 dòng. Chạm trần nghĩa là có thể còn dòng giá chưa lấy về, nên
       * dán nhãn "chưa có giá" lúc đó là nói sai một cách rất khó phát hiện. Không biết thì im.
       */
      const pricedCodes = itemResult.status === "fulfilled"
        && priceResult.status === "fulfilled"
        && hintPriceList
        && priceResult.value.length < PRICE_HINT_PAGE
        ? new Set(priceResult.value.map((row) => text(row.item_code)).filter(Boolean))
        : null;

      const displayOptions = candidates
        // Trong danh sách: mã trước + tên sau để tìm đúng hàng. Sau khi chọn, resolveDisplay
        // bên dưới vẫn trả đúng mã vì Tên hàng đã có cột riêng ngay bên cạnh.
        .map((option) => {
          const label = labels.get(option.value) || text(option.label);
          const description = text(option.description);
          const itemName = label && label !== option.value
            ? label
            : description && description !== option.value ? description : "";
          const facts = itemFacts.get(option.value);
          const hints = [
            itemName,
            facts?.group ?? "",
            facts?.salesUom ? `ĐVT ${facts.salesUom}` : "",
            pricedCodes && !pricedCodes.has(option.value) ? "chưa có giá" : "",
          ].filter(Boolean).join(" · ");
          return { value: option.value, label: option.value, ...(hints ? { description: hints } : {}) };
        })
        .sort((left, right) => itemSearchScore(right, raw) - itemSearchScore(left, raw) || left.value.localeCompare(right.value, "vi"))
        .slice(0, 100);
      return displayOptions;
    },
    resolveDisplay: async (doctype, name) => doctype === "Item"
      ? { label: name }
      : services.resolveDisplay?.(doctype, name) ?? { label: name },
  }), [adapter, services]);
  const readOnlyAdministrativeServices = useMemo<FieldServices>(() => ({
    ...services,
    quickCreate: undefined,
  }), [services]);

  const childFields = useMemo(() => childMeta?.fields.map((field) => field.fieldname).filter(Boolean) ?? [], [childMeta]);
  const childFieldSet = useMemo(() => new Set(childFields), [childFields]);
  const leafVariants = useMemo(() => optionList(childMeta, "leaf_variant", ["Kéo tay", "Motor ngoài", "Motor trong"]), [childMeta]);
  const activeLines = useMemo(() => lines.filter((line) => text(line.item_code)), [lines]);
  const pendingSupplierName = supplierNameFromOption(header.customer);

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
    const supplierSelection = isCustomer ? supplierNameFromOption(value) : null;
    const pendingSupplier = supplierNameFromOption(current.customer);
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

    // Một NCC có thể đồng thời là khách theo quyết định trực tiếp của chủ xưởng 22/08/2026.
    // Giá trị `NCC · ...` chỉ là định danh TẠM trên UI, tuyệt đối không gửi xuống Customer Link.
    // Nạp dữ kiện liên hệ để người bán đối chiếu, rồi chờ họ chọn Nhóm giá và bấm nút thêm vai
    // trò Khách hàng. Không tự tạo master chỉ vì người dùng lướt/chọn nhầm một gợi ý.
    if (supplierSelection) {
      next.selling_price_list = current.selling_price_list;
      setHeaderState(next);
      setDirty(true);
      setHeaderPreviewError("");
      void adapter.getDoc("Supplier", supplierSelection)
        .then(({ doc }) => {
          if (customerSeq !== customerHydrationSeq.current) return;
          if (supplierNameFromOption(headerRef.current.customer) !== supplierSelection) return;
          const prefill = supplierCustomerPrefill(supplierSelection, doc as Json);
          setHeaderState({
            ...headerRef.current,
            contact_person: prefill.contact_person,
            phone: prefill.phone,
            install_address: prefill.install_address_line1,
          });
        })
        .catch((error) => {
          if (customerSeq === customerHydrationSeq.current) setHeaderPreviewError(salesOrderErrorMessage(error));
        })
        .finally(() => {
          if (customerSeq === customerHydrationSeq.current) setCustomerHydrating(false);
        });
      return;
    }

    // Khi đang chờ chuyển NCC thành Customer, Nhóm giá là quyết định bắt buộc của người bán.
    // Chưa có Customer thật thì không gọi preview chứng từ: backend sẽ từ chối đúng vì tham
    // chiếu `NCC · ...` không tồn tại, và lỗi giả đó sẽ che mất nút hoàn tất chuyển vai trò.
    if (!isCustomer && pendingSupplier) {
      setHeaderState(next);
      setDirty(true);
      setHeaderPreviewError("");
      return;
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
  }, [adapter, applyInteractiveDocumentPreview, beginDocumentPreview, finishDocumentPreview, markActiveLinesForReprice, markDocumentChanged, requestDocumentPreview, setHeaderPreviewError, setHeaderState]);

  /**
   * Hoàn tất vai trò kép NCC → Customer một cách idempotent.
   *
   * Chỉ chạy sau một hành động bấm rõ ràng và khi đã chọn Nhóm giá. Tên Customer thật từ
   * response được thay vào header trước mọi preview/lưu, nên chuỗi trình bày `NCC · ...` không
   * thể lọt xuống Sales Order. Nếu hai phiên cùng tạo, lượt thua thử đọc lại Customer rồi dùng
   * bản ghi đã có thay vì tạo vai trò trùng.
   */
  const activateSupplierAsCustomer = useCallback(async () => {
    const supplierName = supplierNameFromOption(headerRef.current.customer);
    if (!supplierName) return;
    const priceGroup = text(headerRef.current.customer_group);
    if (!(["Đại lý", "Lẻ"] as const).includes(priceGroup as "Đại lý" | "Lẻ")) {
      toast.error("Chọn Nhóm giá Đại lý hoặc Lẻ trước khi thêm vai trò Khách hàng cho NCC.");
      return;
    }

    setCustomerHydrating(true);
    setHeaderPreviewError("");
    try {
      let customer: Json | null = null;
      try {
        customer = (await adapter.getDoc("Customer", supplierName)).doc as Json;
      } catch {
        const supplier = (await adapter.getDoc("Supplier", supplierName)).doc as Json;
        const payload = {
          ...supplierCustomerPrefill(supplierName, supplier),
          price_group: priceGroup,
        } as Partial<Doc>;
        try {
          customer = await adapter.createDoc("Customer", payload) as Json;
        } catch (createError) {
          try {
            customer = (await adapter.getDoc("Customer", supplierName)).doc as Json;
          } catch {
            throw createError;
          }
        }
      }

      const customerName = text(customer?.name) || supplierName;
      const next: Json = {
        ...headerRef.current,
        customer: customerName,
        customer_group: text(customer?.price_group) || priceGroup,
      };
      setHeaderState(next);
      markActiveLinesForReprice();
      const revision = beginDocumentPreview();
      try {
        const result = await requestDocumentPreview(next, "customer");
        if (canApplySalesOrderDocumentPreview(previewClock.current, revision)) {
          setHeaderPreviewError("");
          applyInteractiveDocumentPreview(result);
        }
      } finally {
        finishDocumentPreview();
      }
      setDirty(true);
      toast.success(`Đã thêm vai trò Khách hàng cho NCC ${supplierName}.`);
    } catch (error) {
      const message = salesOrderErrorMessage(error);
      setHeaderPreviewError(message);
      toast.error(message);
    } finally {
      setCustomerHydrating(false);
    }
  }, [adapter, applyInteractiveDocumentPreview, beginDocumentPreview, finishDocumentPreview, markActiveLinesForReprice, requestDocumentPreview, setHeaderPreviewError, setHeaderState]);

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
          price_list: headerRef.current.selling_price_list,
          currency: headerRef.current.currency || "VND",
          /**
           * KHÔNG hỏi tồn kho ở màn bán hàng — quyết định của chủ dự án 21/08/2026.
           *
           * `warehouse` và `qty` là hai tham số DUY NHẤT bật khâu đọc tồn của
           * `alumdoor.sales.item_context`: thiếu `warehouse` thì không có `stock_snapshot`,
           * thiếu `qty` thì không dựng `shortage` (nên cũng không có cổng chặn `STOCK_SHORT`).
           * Bỏ ở đây là tắt cả đường, không phải giấu cột — server khỏi tốn lượt đọc kho.
           *
           * Năng lực đó KHÔNG bị xoá: nó thuộc về khâu xuất kho, nơi mới có kho thật để trừ.
           */
          // Bật khâu màu theo PHẠM VI (Bề mặt → Màu). Đây là đường đánh thức pipeline
          // `finish_color_context` vốn đã viết xong mà chưa nơi nào gọi tới.
          include_color_scope: true,
          /**
           * Mã nhôm CHỈ truyền khi dòng thật sự mang nó.
           *
           * `Quy cách cửa` khoá theo mã nhôm (`AL70`, `AL552N`), còn `Sales Order Item` không có
           * trường nào giữ mã đó — soát toàn bộ field của DocType này là 0. Suy mã nhôm từ mã
           * hàng bằng chuỗi con chính là cái bẫy `TP-CUA` nằm trong `TP-CUADL1LY` mà đợt đổi mã
           * 19/08 đã ghi lại, nên thà để server trả `door_spec: null`.
           */
          ...(text(row.slat_profile) ? { slat_profile: text(row.slat_profile) } : {}),
          /**
           * CÁCH BÁN của dòng đi cùng lượt tra giá.
           *
           * Không truyền thì server phải tự quyết, và nó chỉ quyết được khi mã có dòng
           * `STANDARD` hoặc chỉ có đúng một cách bán. 22/224 cặp (mã + ĐVT) của bảng giá
           * `Alumdoor 2026` không rơi vào hai trường hợp đó — với chúng, server trả về danh
           * sách lựa chọn kèm đơn giá thay vì một con số, và ô "Cách bán" trên dòng hiện ra.
           */
          ...(text(row.price_variant) ? { price_variant: text(row.price_variant) } : {}),
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
      /**
       * Màu theo PHẠM VI — `color_scope` THẮNG danh sách phẳng.
       *
       * `alumdoor.catalog.allowed_colors` trả một danh sách phẳng; `context.color_scope` đi đúng
       * pipeline `Item → Item Group lineage → Surface Finish → Item Color` và mang theo cả
       * `colors_by_finish` lẫn `requires_color`. Pipeline đó đã viết xong từ đợt hội tụ 16/08 mà
       * chưa nơi nào gọi tới — đây là chỗ đánh thức nó.
       *
       * Vẫn giữ lời gọi phẳng làm đường lui: hai request chạy song song nên không tốn thêm thời
       * gian chờ, và payload chưa có `color_scope` thì ô màu vẫn dùng được như trước.
       */
      const flatColors = Array.isArray(colors.allowed_colors) ? colors.allowed_colors.map(text).filter(Boolean) : [];
      const scope = context.color_scope;
      const scopedColors = Array.isArray(scope?.allowed_colors) ? scope!.allowed_colors!.map(text).filter(Boolean) : [];
      // `color_scope: null` + `color_scope_error` = KHÔNG dựng được phạm vi. Lúc đó danh sách
      // phẳng vẫn hơn là một ô rỗng không lời giải thích; lý do đi vào dải "còn thiếu" của dòng.
      const allowedColors = scope && scopedColors.length ? scopedColors : flatColors;
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
      /**
       * TỰ ĐIỀN cách bán khi mã chỉ có MỘT — và đây KHÔNG phải tiện nghi, nó là điều kiện để
       * LƯU ĐƯỢC.
       *
       * `alumdoor.sales.item_context` tự chọn khi chỉ có một lựa chọn nên XEM TRƯỚC ra giá
       * đúng dù dòng để trống. Nhưng đường LƯU (`commercial-sales-order-controller.ts:125`)
       * mặc định `STANDARD` khi ô trống. Mã có đúng một cách bán mà cách đó không phải
       * `STANDARD` sẽ xem trước ra tiền rồi lưu lại bị từ chối "Item Price … does not exist
       * for variant STANDARD" — đúng kiểu hỏng chỉ lộ ra ở bước cuối.
       *
       * Nhiều cách bán thì KHÔNG đoán: server đã trả `price_variant_required` và danh sách kèm
       * đơn giá, ô "Cách bán" trên dòng hiện ra để người bán quyết.
       */
      const variantCodes = Array.isArray(context.price_explain?.price_variant_options)
        ? context.price_explain!.price_variant_options!.map((option) => text(option?.price_variant)).filter(Boolean)
        : [];
      if (variantCodes.length === 1 && !text(row.price_variant) && !text(next.price_variant)) {
        next.price_variant = variantCodes[0];
      }
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

      const bomEligible = mayHaveBom(candidate);
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
    if (loading || !childMeta || customerHydrating || pendingSupplierName) return;
    const unresolved = lines.filter((line) => {
      if (!mayHaveBom(line) || line._loading || line._bomPreview || text(line._bomError)) return false;
      return true;
    });
    if (!unresolved.length) return;
    const timer = window.setTimeout(() => {
      void Promise.all(unresolved.map((line) => previewLine(line, "bom_lifecycle", {}, false)))
        .finally(() => void refreshDocumentPreview("items"));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [childMeta, customerHydrating, header.customer_group, lines, loading, pendingSupplierName, previewLine, refreshDocumentPreview]);

  useEffect(() => {
    if (loading || !childMeta || customerHydrating || pendingSupplierName) return;
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
  }, [childMeta, customerHydrating, lines, loading, pendingSupplierName, previewLine, refreshDocumentPreview]);

  const commercialContext = commercialHeaderSignature(header);
  useEffect(() => {
    if (loading || !childMeta || customerHydrating || pendingSupplierName) return;
    if (!lastCommercialContext.current) { lastCommercialContext.current = commercialContext; return; }
    if (lastCommercialContext.current === commercialContext) return;
    lastCommercialContext.current = commercialContext;
    const active = linesRef.current.filter((line) => text(line.item_code));
    void Promise.all(active.map((line) => previewLine(line, "parent_context", {}, false))).finally(() => void refreshDocumentPreview("items"));
  }, [childMeta, commercialContext, customerHydrating, loading, pendingSupplierName, previewLine, refreshDocumentPreview]);

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
        // Cách bán thuộc về MẶT HÀNG CŨ. Giữ lại là mang `CHI_LA` sang một mã chỉ có `TRON_BO`
        // rồi báo "chưa khai đơn giá" cho một lựa chọn mà chính người bán không hề chọn.
        price_variant: undefined,
        // Mặt hàng mới ⇒ quyết định tặng ray cũ hết hiệu lực, ô tick được quyền tự đặt lại.
        _giftRailTouched: undefined,
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

  const addSuggestedItem = useCallback((sourceKey: string, itemCode: string) => {
    const normalizedCode = text(itemCode);
    if (!normalizedCode) return;
    if (linesRef.current.some((line) => text(line.item_code) === normalizedCode)) {
      toast.success(`${normalizedCode} đã có trong đơn.`);
      return;
    }
    const current = linesRef.current;
    const sourceIndex = current.findIndex((line) => line._key === sourceKey);
    const suggested = { ...newLine(current.length), item_code: normalizedCode, _loading: true } as SalesLine;
    const insertion = sourceIndex < 0 ? current.length : sourceIndex + 1;
    const next = [...current.slice(0, insertion), suggested, ...current.slice(insertion)];
    markDocumentChanged();
    replaceLines(next, true);
    void previewLine(suggested, "item_code", { item_code: normalizedCode });
  }, [markDocumentChanged, previewLine, replaceLines]);

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

  /**
   * Lỗi validate phải CHỈ ĐƯỢC CHỖ SỬA, không chỉ hiện một toast ở góc màn.
   *
   * Bấm "Ghi sổ đơn" trên form trống chỉ ra toast "Cần chọn khách hàng." ở góc phải, còn ô
   * Khách hàng không viền đỏ và không được focus — người bán phải tự đi tìm. `focus` mang
   * tên trường để `persistDraft` cuộn tới và focus đúng ô đó.
   */
  const validate = useCallback((): { message: string; focus?: string } | null => {
    if (previewClock.current.pending > 0 || customerHydrating) return { message: "Đơn đang tính lại dữ liệu từ server, hãy hoàn tất trước khi lưu." };
    if (text(headerErrorRef.current)) return { message: `Cần xử lý lỗi tính lại trước khi lưu: ${text(headerErrorRef.current)}` };
    if (!text(headerRef.current.customer)) return { message: "Cần chọn khách hàng.", focus: "customer" };
    if (supplierNameFromOption(headerRef.current.customer)) return { message: "NCC đã chọn chưa có vai trò Khách hàng. Chọn Nhóm giá rồi bấm ‘Thêm vai trò khách’.", focus: "customer" };
    if (!text(headerRef.current.transaction_date)) return { message: "Cần ngày đặt hàng.", focus: "transaction_date" };
    if (!text(headerRef.current.selling_price_list)) return { message: "Cần Bảng giá áp dụng theo commercial contract hiện hành.", focus: "selling_price_list" };
    const depositAmount = numberValue(headerRef.current.deposit_amount) ?? 0;
    const grandTotal = numberValue(headerRef.current.grand_total) ?? 0;
    if (depositAmount < 0) return { message: "Tiền cọc không được nhỏ hơn 0.", focus: "deposit_amount" };
    if (depositAmount > grandTotal) return { message: "Tiền cọc không được lớn hơn tiền phải thu của đơn.", focus: "deposit_amount" };
    const currentLines = linesRef.current.filter((line) => text(line.item_code));
    if (!currentLines.length) return { message: "Cần ít nhất một dòng hàng." };
    for (const [index, line] of currentLines.entries()) {
      if (line._loading) return { message: `Dòng ${index + 1} đang tính lại, hãy hoàn tất trước khi lưu.` };
      if (text(line._error)) return { message: `Dòng ${index + 1}: ${text(line._error)}` };
      if (text(line._pricingError)) return { message: `Dòng ${index + 1}: ${text(line._pricingError)}` };
      // Cổng chặn của danh mục do server tuyên bố. Thiếu khai báo thì từ chối lưu và chỉ đúng
      // chỗ sửa, thay vì để đơn đi tiếp với một con số không giải thích được.
      const readinessBlock = lineReadinessBlock(line);
      if (readinessBlock) return { message: `Dòng ${index + 1}: ${readinessBlock.what} — sửa ở: ${readinessBlock.where}` };
      if (numberValue(line.rate) === undefined) return { message: `Dòng ${index + 1}: thiếu Đơn giá.` };
      for (const [fieldname, rule] of Object.entries(line._overrides ?? {}) as Array<[string, FieldOverride]>) {
        if (!(rule.reqd === true || rule.reqd === 1) || rule.hidden === true || rule.hidden === 1) continue;
        if (line[fieldname] == null || line[fieldname] === "") return { message: `Dòng ${index + 1}: thiếu ${text(rule.label) || fieldname}.` };
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
    if (validationError) {
      toast.error(validationError.message);
      if (validationError.focus) focusHeaderField(validationError.focus);
      return null;
    }
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
    /**
     * PA-14 — override thương mại phải được DUYỆT rồi mới ghi sổ.
     *
     * Trước 23/08/2026 màn chỉ HIỆN "CK x% khác chuẩn y% — cần duyệt" rồi vẫn cho bấm Ghi sổ:
     * đơn ra `docstatus = 1` với chiết khấu ngoài chính sách, và `Sales Order` không có một
     * trường approval nào để ai đó phát hiện lại về sau (soát field ngày 23/08: chỉ có
     * `status`, `discount_amount`, `docstatus`). Cảnh báo như vậy là cảnh báo dối.
     *
     * Hợp đồng nghiệm thu nói đúng ranh giới: "save draft MAY preserve override; submit is
     * denied when approval required". Nên chặn ở đây — Lưu nháp vẫn giữ nguyên override để
     * người bán không mất công nhập lại trong lúc chờ duyệt.
     */
    const pendingApproval = linesRef.current
      .filter((line) => text(line.item_code))
      .filter(lineCommercialNeedsApproval).length;
    if (pendingApproval || checked(headerRef.current.discount_requires_approval)) {
      toast.error(
        `${pendingApproval || 1} dòng có giá/chiết khấu khác chính sách — cần duyệt trước khi ghi sổ. `
        + "Lưu nháp để giữ nguyên số đã nhập, hoặc trả chiết khấu về mức chuẩn.",
      );
      return;
    }
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

  /** Sang thẳng màn xuất kho, đã biết sẵn xuất cho đơn nào. */
  const openDelivery = useCallback(() => {
    if (!documentName || docstatus !== 1) return;
    window.location.assign(`/app/${encodeURIComponent("Delivery Note")}?f_sales_order=${encodeURIComponent(documentName)}`);
  }, [docstatus, documentName]);

  /* Đơn đã ghi sổ thì đi hỏi xem đã có phiếu xuất kho nào chưa — câu trả lời quyết định
     đơn còn sửa được hay đã khoá. Hỏi lúc mở đơn chứ không đợi người dùng bấm, vì nút phải
     hiện đúng ngay từ đầu. */
  useEffect(() => {
    let active = true;
    if (docstatus !== 1 || !documentName) { setDeliveryNotes([]); setDeliveryNotesLoaded(docstatus === 0); return; }
    void (async () => {
      try {
        const rows = await adapter.getList("Delivery Note", {
          fields: ["name", "docstatus", "posting_at"],
          filters: { against_sales_order: documentName },
          pageLength: 50,
        });
        if (!active) return;
        setDeliveryNotes(rows.filter((row) => Number(row.docstatus) !== 2));
      } catch {
        // Hỏi không được thì coi như CHƯA BIẾT: giữ nút huỷ duyệt tắt, đừng mở khoá dựa trên
        // một câu hỏi thất bại.
        if (active) setDeliveryNotes([]);
      } finally {
        if (active) setDeliveryNotesLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [adapter, docstatus, documentName, loadAttempt]);

  const daXuatKho = deliveryNotes.length > 0;
  const coTheHuyDuyet = docstatus === 1 && Boolean(documentName) && Boolean(caps.cancel) && Boolean(caps.amend) && deliveryNotesLoaded && !daXuatKho;

  /**
   * Huỷ duyệt để sửa. `cancel` đưa chứng từ về docstatus 2 — nó Ở LẠI sổ, không biến mất — rồi
   * `amend` lập một bản nháp mới mang số mới, trỏ ngược về bản cũ qua `amended_from`.
   *
   * Không có kiểu "gỡ ghi sổ tại chỗ": chứng từ đã ghi sổ mà sửa thẳng thì sổ sách không còn
   * đối chiếu được. Đây đúng là cách kế toán làm — huỷ chứng từ cũ, lập bản sửa.
   */
  const huyDuyetDeSua = useCallback(async () => {
    if (!coTheHuyDuyet || !documentName) return;
    setUnsubmitting(true);
    try {
      await adapter.cancel("Sales Order", documentName);
      const banSua = await adapter.amend("Sales Order", documentName);
      const tenMoi = text(banSua.name);
      toast.success(`Đã huỷ duyệt ${documentName}. Bản sửa: ${tenMoi}`);
      if (tenMoi) window.location.assign(`/app/${encodeURIComponent("Sales Order")}/${encodeURIComponent(tenMoi)}`);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setUnsubmitting(false);
      setConfirmUnsubmit(false);
    }
  }, [adapter, coTheHuyDuyet, documentName]);

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
  // Thiếu khai báo danh mục phải đếm được ở thanh tổng, không chỉ nằm trong dòng đã mở.
  const catalogGapLines = activeLines.filter((line) => lineBlockingGaps(line).length > 0).length;
  const approvalLines = activeLines.filter(lineCommercialNeedsApproval).length;
  const approvalNeeded = checked(header.discount_requires_approval) || approvalLines > 0;
  // Khối tổng phải nói đúng bản chất: "Chiết khấu" gom mọi khoản LÀM GIẢM (chiết khấu %
  // của dòng + các quy tắc giá mang dấu âm), "Phụ thu" chỉ còn các khoản LÀM TĂNG.
  // Đẳng thức tiền không đổi: Tiền hàng − Chiết khấu + Phụ thu = gốc tính VAT.
  const adjustmentSplit = splitLineAdjustments(activeLines, numberValue(header.surcharge_amount) ?? 0);
  const headerDiscountAmount = numberValue(header.discount_amount) ?? 0;
  const discountTotal = headerDiscountAmount + adjustmentSplit.reduction;
  const surchargeTotal = adjustmentSplit.surcharge;
  const discountBreakdown = adjustmentSplit.reduction
    ? `Chiết khấu dòng ${money(headerDiscountAmount)} ₫ + giảm trừ theo quy tắc giá ${money(adjustmentSplit.reduction)} ₫${
      adjustmentSplit.reductionRules.length ? ` (${adjustmentSplit.reductionRules.join(" · ")})` : ""
    }`
    : `Chiết khấu theo % trên từng dòng hàng`;
  const duplicateDiscountCount = duplicateDiscountLines(activeLines);
  /* Tặng ray dưới ngưỡng: CHẶN lưu, không chỉ nhắc — đây là quà tặng ra tiền thật. */
  const giftRailViolations = activeLines.map(lineGiftRailViolation).filter(Boolean);
  const grandTotalAmount = numberValue(header.grand_total) ?? 0;
  const depositAmount = numberValue(header.deposit_amount) ?? 0;
  const depositExceedsTotal = depositAmount - grandTotalAmount > 0.0000001;
  // Số server chiếu xuống là authority. Phép trừ chỉ là fallback trong nhịp đầu khi preview
  // chưa trả về, không được ghi đè một `outstanding_amount` canonical đã có.
  const outstandingAmount = numberValue(header.outstanding_amount)
    ?? Math.max(0, grandTotalAmount - depositAmount);
  const busy = saving || submitting;
  const previewBlocked = isSalesOrderPersistenceBlocked(previewClock.current, headerError) || customerHydrating;
  const persistenceBlocked = busy || previewBlocked || unresolvedLines > 0 || giftRailViolations.length > 0;
  const recalculating = customerHydrating || documentPreviewPending > 0 || unresolvedLines > 0;

  const headerControl = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string, readOnly = false, preview = false) => (
    <AlumdoorSalesOrderField
      id={headerFieldId(fieldname)}
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
                  {metaField("customer_group") ? headerControl("customer_group", "Nhóm giá", metaField("customer_group")!.fieldtype, metaField("customer_group")!.options, !pendingSupplierName, true) : null}
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
                  {/* Ô Tiền cọc đã chuyển xuống khối TỔNG TIỀN, ngay trước "Còn phải thu". */}
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
              {pendingSupplierName ? (
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <Badge variant="outline" className="mr-2 border-amber-500/60">NCC</Badge>
                    {pendingSupplierName} có thể đồng thời là khách. Chọn Nhóm giá, rồi thêm vai trò Khách hàng để giữ tham chiếu hợp lệ.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-amber-500/70 bg-background"
                    disabled={customerHydrating || !["Đại lý", "Lẻ"].includes(text(header.customer_group))}
                    onClick={() => void activateSupplierAsCustomer()}
                  >
                    {customerHydrating ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                    Thêm vai trò khách
                  </Button>
                </div>
              ) : null}
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
              showStockConversionColumn={docstatus === 1}
              showLeafCountColumn={docstatus === 1}
              selectedKeys={selectedLineKeys}
              leafVariants={leafVariants}
              onToggleSelection={(key, checkedValue) => setSelectedLineKeys((current) => { const next = new Set(current); if (checkedValue) next.add(key); else next.delete(key); return next; })}
              onToggleAll={(checkedValue) => setSelectedLineKeys(checkedValue ? new Set(lines.map((line) => line._key)) : new Set())}
              onPatch={patchLineFromUser}
              onCommit={commitLine}
              onAdd={addLine}
              onAddFive={addFive}
              onAddSuggestedItem={addSuggestedItem}
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
                <div className="bg-card px-3 py-2" title={discountBreakdown}><div className="text-[10px] text-muted-foreground">Chiết khấu</div><div className="mt-0.5 font-semibold tabular-nums text-destructive">−{money(discountTotal)} ₫</div></div>
                <div className="bg-card px-3 py-2" title={surchargeTotal ? "Chỉ gồm các khoản làm TĂNG tiền phải trả" : "Đơn này không có khoản phụ thu nào"}><div className="text-[10px] text-muted-foreground">Phụ thu</div><div className="mt-0.5 font-semibold tabular-nums">+{money(surchargeTotal)} ₫</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">VAT ({quantity(header.vat_rate ?? 0)}%)</div><div className="mt-0.5 font-semibold tabular-nums">{money(header.vat_amount)} ₫</div></div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] font-semibold text-muted-foreground">Tiền phải thu</div><div className="mt-0.5 font-bold tabular-nums text-primary">{money(header.grand_total)} ₫</div></div>
                <div className="bg-card px-3 py-2">
                  <label htmlFor="sales-v2-complete-deposit-amount" className="block text-[10px] text-muted-foreground">Tiền cọc</label>
                  <AlumdoorSalesOrderField
                    id="sales-v2-complete-deposit-amount"
                    field={headerField("deposit_amount", "Tiền cọc", "Currency")}
                    label="Tiền cọc"
                    hideLabel
                    value={header.deposit_amount ?? 0}
                    // Không cho số âm; số vượt Tiền phải thu vẫn nhập được nhưng bị chặn ở validate()
                    // đúng như ràng buộc của máy chủ, kèm cảnh báo ngay dưới ô.
                    onChange={(value) => setHeaderField("deposit_amount", Math.max(0, numberValue(value) ?? 0), false)}
                    onCommit={() => void refreshDocumentPreview("deposit_amount")}
                    registry={registry}
                    services={services}
                    parentDoctype="Sales Order"
                    docValues={header}
                    roles={roles}
                    readOnly={formReadOnly || busy}
                    compact
                    className={`mt-0.5 [&_.mf-control]:!min-h-7 [&_input]:!h-7 [&_input]:!text-right [&_input]:tabular-nums [&_input]:!font-semibold ${depositExceedsTotal ? "[&_input]:!border-destructive" : ""}`}
                  />
                  {depositExceedsTotal ? <div className="mt-0.5 text-[10px] leading-tight text-destructive">Cọc lớn hơn Tiền phải thu</div> : null}
                  {/* Doctype Sales Order chưa khai `deposit_amount`, nên số này mới chỉ tính được
                      "Còn phải thu" trên màn hình chứ CHƯA lưu vào đơn. Nói thẳng thay vì để người
                      bán tưởng đã lưu. Dòng cảnh báo tự biến mất khi brief có field và đã forge. */}
                  {!metaField("deposit_amount") && depositAmount > 0
                    ? <div className="mt-0.5 text-[10px] leading-tight text-destructive">Chưa lưu được vào đơn — Sales Order thiếu field deposit_amount</div>
                    : null}
                </div>
                <div className="bg-card px-3 py-2"><div className="text-[10px] font-semibold text-muted-foreground">Còn phải thu</div><div className="mt-0.5 text-lg font-bold tabular-nums text-primary">{money(outstandingAmount)} ₫</div></div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-[11px]">
                {recalculating ? <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> Đang tính lại</span> : unresolvedLines || bomBlocked ? <span className="inline-flex items-center gap-1.5"><AlertTriangle className="size-3.5" />{unresolvedLines ? `${unresolvedLines} dòng chưa tính xong` : ""}{unresolvedLines && bomBlocked ? " · " : ""}{bomBlocked ? `${bomBlocked} dòng BOM còn thiếu vật tư thực tế` : ""}</span> : <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5" /> Dữ liệu preview đã sẵn sàng</span>}
                {catalogGapLines ? <Badge variant="outline" className="border-destructive/40 text-destructive">{catalogGapLines} dòng thiếu khai báo danh mục — mở dòng để xem sửa ở đâu</Badge> : null}
                {giftRailViolations.length ? <Badge variant="outline" className="border-destructive/40 text-destructive" title={giftRailViolations.join(" · ")}>{giftRailViolations.length} dòng tặng ray dưới ngưỡng — không lưu được cho tới khi bỏ tick</Badge> : null}
                {approvalNeeded ? <Badge variant="outline" className="border-destructive/40 text-destructive" title="Ghi sổ bị chặn cho tới khi override được duyệt hoặc trả về mức chuẩn. Lưu nháp vẫn được.">{approvalLines || 1} dòng / thay đổi cần duyệt — chưa ghi sổ được</Badge> : null}
                {duplicateDiscountCount ? <Badge variant="outline" className="border-destructive/40 text-destructive" title="Dòng đang bị trừ theo Chiết khấu % VÀ bị trừ thêm bởi một quy tắc giá mang nghĩa chiết khấu. Kiểm tra lại Pricing Rule trước khi ghi sổ.">{duplicateDiscountCount} dòng có thể bị trừ chiết khấu 2 lần — kiểm tra quy tắc giá</Badge> : null}
                <span className="ml-auto text-muted-foreground">Bảng giá: <strong className="font-medium text-foreground">{text(header.selling_price_list) || "Chưa chọn"}</strong></span>
              </div>

              {rules.length ? <details className="border-t px-3 py-2 text-[11px]"><summary className="cursor-pointer select-none font-medium">Chính sách giá đang áp · {rules.length} quy tắc</summary><div className="mt-2 flex flex-wrap gap-1.5">{rules.map((rule, index) => <Badge key={`${text(rule.rule_name)}-${index}`} variant="outline">{text(rule.rule_name)}</Badge>)}</div></details> : null}
            </section>
          </fieldset>
        </div>
      </div>

      <div className="shrink-0 border-t bg-card px-3 py-1.5 shadow-[0_-4px_14px_rgba(0,0,0,0.035)]">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2"><span className="text-muted-foreground">{recalculating ? "Đang tính lại" : dirty ? "Có thay đổi chưa lưu" : docstatus === 1 ? "Đã ghi sổ" : "Nháp đã đồng bộ"}</span><strong className="tabular-nums">Còn phải thu: {money(outstandingAmount)} ₫</strong></div>
          <div className="flex flex-wrap items-center gap-1.5">
            {docstatus === 1 && documentName && productionCaps.read ? <Button type="button" variant="outline" size="sm" onClick={openProduction}><Factory className="size-3.5" /> Sản xuất</Button> : null}
            {docstatus === 1 && documentName ? <Button type="button" variant="outline" size="sm" onClick={openDelivery}><Truck className="size-3.5" /> Xuất kho</Button> : null}
            {coTheHuyDuyet ? <Button type="button" variant="outline" size="sm" disabled={unsubmitting} onClick={() => setConfirmUnsubmit(true)}>{unsubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />} Huỷ duyệt để sửa</Button> : null}
            {docstatus === 1 && daXuatKho ? <span className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700" title={`Phiếu xuất kho: ${deliveryNotes.map((row) => text(row.name)).join(", ")}`}><Lock className="size-3" /> Đã xuất kho — khoá sửa</span> : null}
            {isExisting ? <Button type="button" variant="outline" size="sm" onClick={() => props.onPreviewCreated(documentName)}><Eye className="size-3.5" /> In / xem</Button> : null}
            <Button type="button" variant="ghost" size="sm" onClick={requestClose}>{isExisting ? "Đóng" : "Hủy"}</Button>
            <Button type="button" variant="outline" size="sm" disabled={busy || formReadOnly} onClick={() => { const active = linesRef.current.filter((line) => text(line.item_code)); void Promise.all(active.map((line) => previewLine(line, "manual_refresh", {}, false))).finally(() => void refreshDocumentPreview("manual_refresh")); }}><RefreshCw className="size-3.5" /> Tính lại</Button>
            {docstatus === 0 ? <Button type="button" variant="outline" size="sm" disabled={persistenceBlocked || !canSave} onClick={() => void saveDraft(false)}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Lưu nháp</Button> : null}
            {docstatus === 0 && canSubmit ? <Button type="button" size="sm" disabled={persistenceBlocked || approvalNeeded} title={approvalNeeded ? "Còn dòng giá/chiết khấu khác chính sách — cần duyệt trước khi ghi sổ. Lưu nháp vẫn được." : undefined} onClick={() => void submitOrder()}>{submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Ghi sổ đơn</Button> : null}
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

    <Dialog open={confirmUnsubmit} onOpenChange={setConfirmUnsubmit}>
      <DialogContent>
        <DialogHeader><DialogTitle>Huỷ duyệt đơn {documentName} để sửa?</DialogTitle></DialogHeader>
        <div className="space-y-4 p-1 text-sm">
          <p className="text-muted-foreground">
            Đơn này <strong>chưa có phiếu xuất kho</strong> nên còn sửa được. Sau khi huỷ duyệt, hệ
            thống lập một <strong>bản sửa mang số mới</strong> để anh chỉnh; đơn cũ <strong>ở lại
            sổ</strong> với trạng thái đã huỷ chứ không biến mất — sổ sách phải đối chiếu được.
          </p>
          <p className="text-muted-foreground">
            Xuất kho rồi thì không huỷ duyệt được nữa: lúc đó sửa đơn là đơn một đằng, kho một nẻo.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmUnsubmit(false)} disabled={unsubmitting}>Thôi</Button>
            <Button onClick={() => void huyDuyetDeSua()} disabled={unsubmitting}>
              {unsubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />} Huỷ duyệt và lập bản sửa
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
