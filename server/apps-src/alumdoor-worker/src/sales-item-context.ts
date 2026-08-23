import { finishColorContextForItem } from "./color-scopes.js";
import { inferDoorType } from "./door-formulas.js";

/**
 * Read-only sales item context for the metadata-driven sales grids.
 *
 * Every read goes back through the platform callback with the caller identity. This method
 * does not reserve stock and does not replace the Delivery Note posting guard; it only lets
 * sales staff see the current answer before they promise it to a customer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2026-08-21 — mở danh mục ra tới màn bán hàng
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Hợp đồng đầy đủ: `docs/audits/ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md`.
 * Kiểm kê khoảng trống: `docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md`.
 *
 * Ba luật chi phối mọi trường thêm vào dưới đây:
 *
 * 1. **`null` ≠ vắng mặt ≠ `0`.** Khoá vắng mặt = chưa đo / không áp dụng. Khoá có mặt mang
 *    `null` = **CHƯA KHAI trong danh mục**, và phải đi kèm chỗ sửa. `0` là số thật. 33 mã ray/
 *    trục `RT_` đang CỐ Ý chưa có hệ số quy đổi Mét→Cây; biến `null` thành `1` ở bất kỳ tầng
 *    nào là ghi sai tồn của cả nhóm.
 *
 * 2. **Thà từ chối và báo lỗi còn hơn tính ra một con số sai trong im lặng.** Thiếu dữ liệu thì
 *    trả trạng thái "chưa khai" kèm `fix_where`, không đoán, không fallback thầm.
 *
 * 3. **Mọi khâu thêm vào đều được phép hỏng riêng.** Người bán có thể không có vai đọc báo cáo
 *    kho (`Batch Stock Balance` đòi `Stock Manager`/`Stock User`). Một khâu hỏng chỉ được làm
 *    mất đúng khoá của nó (`*_error`), không được làm mất cả ngữ cảnh dòng hàng.
 *
 * Về ngân sách gọi: `APP_METHOD_TIMEOUT_MS = 10_000` cho CẢ lời gọi. Khâu danh mục được KHỞI
 * ĐỘNG TRƯỚC lượt tra giá và chỉ `await` ở cuối, nên nó chạy chồng lên tra giá + đọc tồn thay
 * vì nối đuôi. Đường 422 "ĐVT chưa khai" KHÔNG khởi động khâu nào — nó vẫn từ chối trước khi
 * chạm tới bảng giá, đúng như hợp đồng cũ.
 */
export type SalesPlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };

type Json = Record<string, unknown>;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

function truthy(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(String(value ?? "").trim().toLocaleLowerCase("vi"));
}

function positive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizedText(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalizedKey(value: unknown): string {
  return normalizedText(value).toLocaleLowerCase("vi");
}

function normalizedUom(value: unknown): string {
  return normalizedKey(value);
}

const AREA_UOMS = new Set(["m2", "m²", "sqm"]);
const SET_UOMS = new Set(["bộ", "bo", "set"]);

function sameText(left: unknown, right: unknown): boolean {
  return normalizedText(left) === normalizedText(right);
}

async function readResource(call: SalesPlatformCall, doctype: string, name: string): Promise<Json | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json }).data ?? null;
}

async function listResources(
  call: SalesPlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[],
  limit = 20,
): Promise<Json[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit),
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query.toString()}`);
  // Older callback mocks and deployments only exposed single-record reads. Treat an absent
  // list endpoint as "no field fallback" so exact/legacy diagnostics remain truthful.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Không tra được ${doctype} theo trường dữ liệu (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json[] }).data ?? [];
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CÁCH BÁN (biến thể giá) — vì sao nó phải có mặt ở đây
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Bảng giá thật của chủ xưởng (`Alumdoor 2026`, 288 dòng đo trên D1 ngày 21/08/2026) khai
 * MỘT MÃ HÀNG THÀNH NHIỀU DÒNG GIÁ, chỉ khác `price_variant`:
 *
 *   STANDARD 173 · TRON_BO 56 · TANG_RAY 15 · CHI_LA 15 · TACH_MON 13 · KEO_TAY 9 · MOTOR_NGOAI 7
 *
 * 22/224 cặp (mã + ĐVT) có từ hai dòng đang bật trở lên. Ví dụ `CDUC_AL70_1LOP · m2`:
 * `TANG_RAY` 1.221.000 và `CHI_LA` 1.146.000 — lệch 75.000 đ/m², tức một bộ 9 m² lệch
 * 675.000 đ. Không có gì để chọn giữa hai con số đó ngoài Ý ĐỊNH của người bán.
 *
 * Đường LƯU đã biết chuyện này (`clouderp-pricing` lọc theo biến thể, mặc định `STANDARD`).
 * Đường XEM TRƯỚC thì không: nó chỉ lọc theo (bảng giá, mã, ĐVT) nên gặp hai dòng là ném
 * "Có nhiều đơn giá đang hoạt động" — một câu không nói được người bán phải làm gì.
 *
 * Ba luật của khối này:
 *
 * 1. **Một biến thể thì TỰ ĐIỀN, không hỏi.** 202/224 cặp rơi vào đây; hỏi han là làm phiền.
 * 2. **Nhiều biến thể mà chưa chọn thì KHÔNG ra tiền** — trả danh sách lựa chọn KÈM ĐƠN GIÁ
 *    để người bán chọn đúng, thay vì bắt họ dịch `TANG_RAY` sang tiếng Việt trong đầu.
 * 3. **Có `STANDARD` thì `STANDARD` thắng khi chưa chọn** — đúng bằng mặc định của đường lưu
 *    (`normalizePriceVariant(undefined) === "STANDARD"`). Xem trước và lưu phải ra CÙNG một
 *    con số; lệch nhau ở chỗ này là mầm của mọi lần "xem một đằng, lưu một nẻo".
 */
const STANDARD_PRICE_VARIANT = "STANDARD";

/** Biến thể của một dòng giá. Ô trống = `STANDARD`, đúng như `clouderp-pricing`. */
function priceVariantOf(row: Json): string {
  return normalizedText(row.price_variant).toUpperCase() || STANDARD_PRICE_VARIANT;
}

/** Chuẩn hóa biến thể do người gọi truyền vào. Chuỗi rỗng = "chưa chọn", KHÁC `STANDARD`. */
function requestedVariantOf(value: unknown): string {
  return normalizedText(value).toUpperCase();
}

/**
 * Một cách bán mà mã hàng này thật sự có giá, kèm đúng con số của nó.
 *
 * `rate` là `null` khi cách bán đó khai theo BẬC DIỆN TÍCH: lúc chọn cách bán chưa có kích
 * thước dòng nên chưa có một con số duy nhất — `rate_min`/`rate_max` cho biết khoảng.
 */
interface PriceVariantOption extends Json {
  price_variant: string;
  item_price: string;
  uom: string;
  rate: number | null;
  rate_min: number | null;
  rate_max: number | null;
  currency: string | null;
  area_tier: string | null;
  tier_count: number;
}

interface ItemPriceLookup {
  price: Json | null;
  name: string;
  sourceUom: string;
  /** Đường nào đã dẫn tới bản ghi giá này — chính là phần "vì sao ra con số đó". */
  resolution:
    | "exact_uom" | "legacy_name" | "field_lookup" | "base_uom_fallback"
    | "disabled" | "not_found" | "variant_required" | "area_tier_ladder";
  /** Biến thể đang dùng cho con số trả về. `null` = chưa chọn được. */
  variant: string | null;
  /** Vì sao lại là biến thể đó. `null` khi chưa chọn được. */
  variantSource: "requested" | "only_option" | "standard_default" | null;
  /**
   * VẮNG MẶT (`undefined`) = không liệt kê được (không có endpoint tra theo trường, hoặc
   * đã trúng bản ghi bằng TÊN nên chưa cần quét). Mảng RỖNG = quét được mà không có dòng nào.
   * Hai nghĩa khác nhau; client phải phân biệt để không vẽ "chưa khai giá" lên một mã chỉ vì
   * người bán thiếu quyền đọc danh sách.
   */
  variantOptions?: PriceVariantOption[];
}

/** Gom các dòng giá đang bật của MỘT ĐVT thành một lựa chọn cho mỗi cách bán. */
function buildVariantOptions(activeRows: Json[]): PriceVariantOption[] {
  const byVariant = new Map<string, Json[]>();
  for (const row of activeRows) {
    const variant = priceVariantOf(row);
    const bucket = byVariant.get(variant);
    if (bucket) bucket.push(row);
    else byVariant.set(variant, [row]);
  }
  const options: PriceVariantOption[] = [];
  for (const [variant, rows] of byVariant) {
    const rates = rows
      .map((row) => Number(row.rate))
      .filter((value) => Number.isFinite(value));
    const single = rows.length === 1 ? rows[0]! : null;
    options.push({
      price_variant: variant,
      item_price: normalizedText(single?.name) || "",
      uom: normalizedText(rows[0]!.uom),
      rate: single && rates.length === 1 ? rates[0]! : null,
      rate_min: rates.length ? Math.min(...rates) : null,
      rate_max: rates.length ? Math.max(...rates) : null,
      currency: normalizedText(rows[0]!.currency) || null,
      area_tier: single ? normalizedText(single.area_tier) || null : null,
      tier_count: rows.length,
    });
  }
  return options.sort((left, right) => left.price_variant.localeCompare(right.price_variant));
}

/**
 * Nhiều dòng cùng một cách bán chỉ được phép khi chúng là một THANG BẬC DIỆN TÍCH.
 *
 * Bảy mã `LA_DLK_*` / `CDL_DLM_*` có tám dòng `TRON_BO` khác nhau đúng ở `area_tier`. Đó là
 * dữ liệu ĐÚNG — con số cuối lấy theo diện tích của dòng bán, và đường lưu đã biết lọc bậc.
 * Còn hai dòng trùng khoá mà KHÔNG có bậc phân biệt thì là lỗi khai báo, phải nói thẳng.
 */
function isAreaTierLadder(rows: Json[]): boolean {
  if (rows.length < 2) return false;
  const tiers = rows.map((row) => normalizedText(row.area_tier));
  if (tiers.some((tier) => !tier)) return false;
  return new Set(tiers).size === tiers.length;
}

/**
 * Tên bản ghi là tối ưu, không phải nguồn sự thật duy nhất.
 *
 * Metadata authoritative hiện tạo Item Price theo `<bảng giá>:<mã hàng>`. Một số dữ liệu mới
 * có thể dùng thêm ĐVT. Luôn thử tên authoritative trước. So khớp nghiệp vụ được chuẩn hóa NFC
 * để dữ liệu import có dấu tổ hợp không bị nhìn giống nhau trên UI nhưng khác byte trong code.
 * Probe exact có ĐVT và callback list chỉ là fallback, không được phép chặn legacy hợp lệ.
 *
 * Hai probe theo TÊN chỉ trúng dòng `STANDARD` (tên bốn đoạn không mang biến thể), nên chúng
 * chỉ được phép thắng khi người bán CHƯA chọn cách bán khác. Yêu cầu `CHI_LA` mà lại trả về
 * dòng `STANDARD` tìm thấy bằng tên là ra một con số không ai đặt hàng.
 */
async function resolveItemPriceRecord(
  call: SalesPlatformCall,
  priceList: string,
  itemCode: string,
  selectedUom: string,
  baseUom: string,
  requestedVariant: string,
): Promise<ItemPriceLookup> {
  const exactName = `${priceList}:${itemCode}:${selectedUom}`;
  const legacyName = `${priceList}:${itemCode}`;
  const nameProbesUsable = !requestedVariant || requestedVariant === STANDARD_PRICE_VARIANT;

  const legacy = await readResource(call, "Item Price", legacyName);
  const compatibleLegacy = legacy
    && sameText(legacy.uom, selectedUom)
    && priceVariantOf(legacy) === STANDARD_PRICE_VARIANT
    ? legacy
    : null;

  let exact: Json | null = null;
  let exactReadError: Error | null = null;
  try {
    exact = await readResource(call, "Item Price", exactName);
  } catch (error) {
    exactReadError = error instanceof Error ? error : new Error(String(error));
  }
  const compatibleExact = exact && priceVariantOf(exact) === STANDARD_PRICE_VARIANT ? exact : null;
  const standardByName = nameProbesUsable
    ? {
      variant: STANDARD_PRICE_VARIANT,
      variantSource: (requestedVariant ? "requested" : "standard_default") as "requested" | "standard_default",
    }
    : null;
  if (standardByName && compatibleExact && !truthy(compatibleExact.disabled)) {
    return {
      price: compatibleExact, name: exactName, sourceUom: selectedUom, resolution: "exact_uom",
      ...standardByName,
    };
  }
  // Exact UOM là override. Nếu endpoint tên Unicode chưa route được, legacy hợp lệ vẫn là
  // fallback tương thích; lỗi probe không được làm mất giá đang dùng của dữ liệu cũ.
  if (standardByName && compatibleLegacy && !truthy(compatibleLegacy.disabled)) {
    return {
      price: compatibleLegacy, name: legacyName, sourceUom: selectedUom, resolution: "legacy_name",
      ...standardByName,
    };
  }
  let rows: Json[];
  try {
    rows = await listResources(
      call,
      "Item Price",
      ["name", "price_list", "item_code", "uom", "price_variant", "area_tier", "rate", "currency", "disabled"],
      [
        ["Item Price", "price_list", "=", priceList],
        ["Item Price", "item_code", "=", itemCode],
      ],
      100,
    );
  } catch (error) {
    throw exactReadError ?? error;
  }
  const scoped = rows.filter((row) =>
    sameText(row.price_list, priceList)
    && sameText(row.item_code, itemCode)
    && sameText(row.uom, selectedUom));
  const active = scoped.filter((row) => !truthy(row.disabled));
  const options = buildVariantOptions(active);

  /**
   * Chọn cách bán. `STANDARD` thắng khi chưa chọn — đúng bằng mặc định của đường lưu, nên xem
   * trước và lưu không bao giờ ra hai con số. Chỉ khi KHÔNG có dòng `STANDARD` nào mà lại có
   * từ hai cách bán trở lên thì mới phải hỏi.
   */
  const available = new Set(options.map((option) => option.price_variant));
  const chosenVariant = requestedVariant
    ? requestedVariant
    : available.has(STANDARD_PRICE_VARIANT)
      ? STANDARD_PRICE_VARIANT
      : options.length === 1
        ? options[0]!.price_variant
        : null;
  const variantSource: ItemPriceLookup["variantSource"] = requestedVariant
    ? "requested"
    : chosenVariant === null
      ? null
      : options.length === 1 ? "only_option" : "standard_default";

  if (chosenVariant === null && options.length > 1) {
    return {
      price: null,
      name: exactName,
      sourceUom: selectedUom,
      resolution: "variant_required",
      variant: null,
      variantSource: null,
      variantOptions: options,
    };
  }

  const inVariant = chosenVariant === null
    ? []
    : active.filter((row) => priceVariantOf(row) === chosenVariant);
  if (inVariant.length > 1) {
    if (isAreaTierLadder(inVariant)) {
      return {
        price: null,
        name: exactName,
        sourceUom: selectedUom,
        resolution: "area_tier_ladder",
        variant: chosenVariant,
        variantSource,
        variantOptions: options,
      };
    }
    throw new Error(`Có nhiều đơn giá đang hoạt động cho ${itemCode} · ${selectedUom} · ${chosenVariant} trong bảng giá ${priceList}.`);
  }
  if (inVariant.length === 1) {
    const selected = inVariant[0]!;
    return {
      price: selected,
      name: normalizedText(selected.name) || exactName,
      sourceUom: selectedUom,
      resolution: "field_lookup",
      variant: chosenVariant,
      variantSource,
      variantOptions: options,
    };
  }

  if (baseUom && baseUom !== selectedUom) {
    const baseMatches = rows.filter((row) =>
      sameText(row.price_list, priceList)
      && sameText(row.item_code, itemCode)
      && sameText(row.uom, baseUom));
    const activeBase = baseMatches.filter((row) => !truthy(row.disabled));
    const baseOptions = buildVariantOptions(activeBase);
    const baseAvailable = new Set(baseOptions.map((option) => option.price_variant));
    const baseVariant = requestedVariant
      ? requestedVariant
      : baseAvailable.has(STANDARD_PRICE_VARIANT)
        ? STANDARD_PRICE_VARIANT
        : baseOptions.length === 1
          ? baseOptions[0]!.price_variant
          : null;
    if (baseVariant === null && baseOptions.length > 1) {
      return {
        price: null,
        name: `${priceList}:${itemCode}:${baseUom}`,
        sourceUom: baseUom,
        resolution: "variant_required",
        variant: null,
        variantSource: null,
        variantOptions: baseOptions,
      };
    }
    const inBaseVariant = baseVariant === null
      ? []
      : activeBase.filter((row) => priceVariantOf(row) === baseVariant);
    if (inBaseVariant.length > 1) {
      if (isAreaTierLadder(inBaseVariant)) {
        return {
          price: null,
          name: `${priceList}:${itemCode}:${baseUom}`,
          sourceUom: baseUom,
          resolution: "area_tier_ladder",
          variant: baseVariant,
          variantSource: requestedVariant ? "requested" : "standard_default",
          variantOptions: baseOptions,
        };
      }
      throw new Error(`Có nhiều đơn giá đang hoạt động cho ${itemCode} · ${baseUom} · ${baseVariant} trong bảng giá ${priceList}.`);
    }
    if (inBaseVariant.length === 1) {
      const selected = inBaseVariant[0]!;
      return {
        price: selected,
        name: normalizedText(selected.name) || `${priceList}:${itemCode}:${baseUom}`,
        sourceUom: baseUom,
        resolution: "base_uom_fallback",
        variant: baseVariant,
        variantSource: requestedVariant
          ? "requested"
          : baseOptions.length === 1 ? "only_option" : "standard_default",
        variantOptions: baseOptions,
      };
    }
  }

  /**
   * Đường lùi cuối chỉ được nhận bản ghi ĐANG NGỪNG DÙNG, và phải CÙNG CÁCH BÁN.
   *
   * Nó tồn tại để báo lỗi tử tế ("Giá … đã ngừng áp dụng") thay vì "chưa khai giá". Bản cũ lấy
   * `scoped[0]` — dòng đầu tiên khớp (bảng giá, mã, ĐVT) bất kể biến thể và bất kể còn bật —
   * điều mà trước khi có biến thể thì vô hại: tới được đây nghĩa là KHÔNG còn dòng nào đang bật.
   * Có biến thể rồi thì cảnh đó xảy ra thật, và hậu quả đo được bằng tiền: hỏi giá `KEO_TAY`
   * cho `CDUC_AL70_1LOP` (mã này chỉ có `TANG_RAY`/`CHI_LA`) trả về 1.221.000 của `TANG_RAY` —
   * một con số người bán không hề đặt hàng, ra trong im lặng.
   */
  const variantScopedDisabled = scoped.find((row) =>
    truthy(row.disabled)
    && (chosenVariant === null || priceVariantOf(row) === chosenVariant));
  const disabled = (nameProbesUsable ? compatibleExact ?? compatibleLegacy : null) ?? variantScopedDisabled ?? null;
  if (!disabled && exactReadError) throw exactReadError;
  return {
    price: disabled,
    name: disabled
      ? normalizedText(disabled.name) || (disabled === compatibleLegacy ? legacyName : exactName)
      : exactName,
    sourceUom: selectedUom,
    resolution: disabled ? "disabled" : "not_found",
    variant: disabled ? priceVariantOf(disabled) : chosenVariant,
    variantSource: disabled ? null : variantSource,
    variantOptions: options,
  };
}

async function reportRows(call: SalesPlatformCall, reportName: string, filters: Json): Promise<Json[]> {
  const response = await call("method/frappe.desk.query_report.run", {
    method: "POST",
    body: JSON.stringify({ report_name: reportName, ignore_prepared_report: 1, filters }),
  });
  if (!response.ok) throw new Error(`Không đọc được báo cáo ${reportName} (HTTP ${response.status}).`);
  const payload = await response.json() as {
    message?: { result?: Json[] } | Json[];
    result?: Json[];
  };
  if (Array.isArray(payload.message)) return payload.message;
  return payload.message?.result ?? payload.result ?? [];
}

function quantityFromRow(row: Json): number {
  for (const key of ["actual_qty", "balance_qty", "closing_qty", "stock_qty", "qty"]) {
    const raw = row[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function cleanNumber(value: number): string {
  return Number(value.toFixed(6)).toLocaleString("vi-VN", { maximumFractionDigits: 6 });
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Danh mục → màn bán hàng. Mọi thứ dưới đây là THÊM MỚI; không trường cũ nào đổi nghĩa.
// ────────────────────────────────────────────────────────────────────────────────────────────

/** Một chỗ trống trong danh mục, kèm đường đi tới nơi sửa. `code` ổn định để client tra icon. */
interface CatalogGap {
  code: string;
  label: string;
  where: string;
}

interface UomEntry {
  uom: string;
  roles: string[];
  /** `null` = CHƯA KHAI. Không bao giờ được thay bằng 1. */
  conversion_factor: number | null;
  declared: boolean;
  factor_source: "stock_uom" | "uom_conversions" | "dynamic_area" | "catch_weight" | null;
}

interface UomGap {
  uom: string;
  kind: "MISSING_CONVERSION" | "UNDECLARED_UOM";
  message: string;
  fix_where: string;
  /** `true` = danh mục CỐ Ý để trống, chờ chủ xưởng chốt — không phải lỗi hệ thống. */
  intentional: boolean;
}

function itemFix(itemCode: string, section: string): string {
  return `Danh mục → Mặt hàng → ${itemCode} → ${section}`;
}

function pushRole(roles: Map<string, Set<string>>, uom: string, role: string): void {
  if (!uom) return;
  const existing = roles.get(uom);
  if (existing) existing.add(role);
  else roles.set(uom, new Set([role]));
}

/**
 * Thang ĐVT THẬT của mặt hàng: mua · tồn · bán, cộng hệ số của từng bậc và bậc nào TRỐNG.
 *
 * `Kg` vắng mặt trong bảng quy đổi của hàng cân thực tế là ĐÚNG LUẬT, không phải thiếu dữ liệu:
 * `validateCanonicalAluminumItem` (`item-catalog-invariants.ts`) từ chối thẳng mọi hệ số Kg↔Cây
 * tĩnh — "số cây/lá và kg thực là hai quan sát độc lập". Không phân biệt hai thứ này thì màn bán
 * hàng báo động giả trên toàn bộ nhóm nhôm, và cảnh báo kêu suốt là cảnh báo không ai đọc.
 */
function buildUomLadder(
  itemCode: string,
  item: Json,
  stockUom: string,
  defaultSalesUom: string,
  selectedUom: string,
  factorByUom: Map<string, number>,
  dynamicSelectedUoms: Set<string>,
  catchWeight: boolean,
): { ladder: Json; missing: UomEntry[] } {
  const purchaseUom = normalizedText(item.default_purchase_uom);
  const weightUom = normalizedText(item.weight_uom);
  const roles = new Map<string, Set<string>>();
  pushRole(roles, purchaseUom, "purchase");
  pushRole(roles, stockUom, "stock");
  pushRole(roles, defaultSalesUom, "sales");
  pushRole(roles, selectedUom, "selected");
  for (const uom of factorByUom.keys()) pushRole(roles, uom, "convertible");

  const entries: UomEntry[] = [...roles.entries()].map(([uom, roleSet]): UomEntry => {
    const factor = factorByUom.get(uom);
    const isCatchWeightUnit = catchWeight && weightUom && normalizedUom(uom) === normalizedUom(weightUom);
    const dynamic = dynamicSelectedUoms.has(uom);
    const declared = factor !== undefined && !dynamic;
    return {
      uom,
      roles: [...roleSet].sort(),
      conversion_factor: declared ? factor! : null,
      declared,
      factor_source: dynamic
        ? "dynamic_area"
        : uom === stockUom && declared
          ? "stock_uom"
          : declared
            ? "uom_conversions"
            : isCatchWeightUnit
              ? "catch_weight"
              : null,
    };
  }).sort((left, right) => left.uom.localeCompare(right.uom, "vi"));

  // Chỉ tính là THIẾU khi bậc đó thật sự cần cho giao dịch (mua/tồn/bán/đang chọn) và không phải
  // ĐVT cân thực tế — thứ CỐ Ý không có hệ số — cũng không phải hệ số động theo từng dòng.
  const missing = entries.filter((entry) =>
    !entry.declared
    && entry.factor_source !== "catch_weight"
    && entry.factor_source !== "dynamic_area"
    && entry.roles.some((role) => ["purchase", "stock", "sales", "selected"].includes(role)));

  return {
    ladder: {
      purchase_uom: purchaseUom || null,
      stock_uom: stockUom || null,
      sales_uom: defaultSalesUom || null,
      selected_uom: selectedUom,
      catch_weight: catchWeight,
      weight_uom: weightUom || null,
      entries,
      missing_factors: missing.map((entry) => ({
        uom: entry.uom,
        roles: entry.roles.filter((role) => role !== "convertible"),
        reason: `Chưa khai hệ số quy đổi ${entry.uom} → ${stockUom || "ĐVT tồn"}.`,
        fix_where: itemFix(itemCode, "Đơn vị quy đổi khác"),
      })),
    },
    missing,
  };
}

/**
 * 33 mã ray/trục `RT_` chốt 20/08/2026: mua Kg · tồn CÂY · bán Mét, và hệ số Mét→Cây CỐ Ý để
 * trống. Nhận ra đúng cảnh đó để nói "chờ chủ xưởng chốt" thay vì "lỗi cấu hình".
 */
function intentionallyBlankFactor(item: Json, uom: string, stockUom: string): boolean {
  if (!truthy(item.has_catch_weight)) return false;
  if (normalizedUom(uom) === normalizedUom(stockUom)) return false;
  return normalizedUom(item.default_purchase_uom) === "kg";
}

interface BatchDetail extends Json {
  batch_no: string;
  qty: number;
  weight_kg: number | null;
  length_m: number | null;
  color: string | null;
  condition: string | null;
  is_offcut: boolean;
  warehouse: string | null;
}

/** Số lô đọc chi tiết. Đủ để người bán chọn cây, không đủ để tiêu hết hạn giờ của lời gọi. */
const BATCH_DETAIL_LIMIT = 12;

/**
 * Tồn theo LÔ, và trục cân song song.
 *
 * `Batch Stock Balance` trả sẵn `actual_qty` (cây) và `actual_weight` (kg) nên trục tiền và trục
 * tồn lấy được mà không cần mở hồ sơ lô nào. Chỉ khi cần khổ/màu/tình trạng mới mở, và chỉ mở
 * `BATCH_DETAIL_LIMIT` lô dài nhất — mở hết là đúng cách làm quá hạn cả lời gọi.
 */
async function readBatchStock(
  call: SalesPlatformCall,
  itemCode: string,
  warehouse: string,
): Promise<{ weight: number | null; count: number; batches: BatchDetail[] | null }> {
  const rows = await reportRows(call, "Batch Stock Balance", {
    item_code: itemCode,
    ...(warehouse ? { warehouse } : {}),
  });
  const live = rows.filter((row) =>
    normalizedText(row.batch_no)
    && (!row.item_code || sameText(row.item_code, itemCode))
    && (!warehouse || !row.warehouse || sameText(row.warehouse, warehouse))
    && Number(row.actual_qty ?? 0) > 0);

  // Không dòng nào cân được thì `weight` là `null` (chưa cân), KHÔNG phải 0 kg.
  const weighed = live.filter((row) => Number.isFinite(Number(row.actual_weight)));
  const weight = weighed.length
    ? weighed.reduce((sum, row) => sum + Number(row.actual_weight), 0)
    : null;

  const top = live.slice(0, BATCH_DETAIL_LIMIT);
  const details = await Promise.all(top.map(async (row) => {
    const name = normalizedText(row.batch_no);
    const batch = await readResource(call, "Batch", name).catch(() => null);
    const length = positive(batch?.length_m);
    const rowWeight = Number(row.actual_weight);
    return {
      batch_no: name,
      qty: Number(row.actual_qty ?? 0),
      weight_kg: Number.isFinite(rowWeight) ? rowWeight : null,
      length_m: length,
      color: normalizedText(batch?.color) || null,
      condition: normalizedText(batch?.condition) || null,
      is_offcut: truthy(batch?.is_offcut),
      warehouse: normalizedText(row.warehouse) || null,
    } satisfies BatchDetail;
  }));
  details.sort((left, right) => (right.length_m ?? 0) - (left.length_m ?? 0));
  return { weight, count: live.length, batches: details };
}

interface CatalogExtras {
  spec_context: Json;
  /** VẮNG MẶT khi người gọi tắt khâu màu; `null` khi bật mà không dựng được. Hai nghĩa khác nhau. */
  color_scope?: Json | null;
  color_scope_error: string | null;
  gaps: CatalogGap[];
}

/**
 * Bộ theo dõi · bộ quy cách hình học · quy cách kỹ thuật · bản lá — bốn danh mục quyết định ô nào
 * bắt buộc và số nào dùng được, mà trước nay màn bán hàng chỉ nhận được cái TÊN của chúng.
 *
 * `Quy cách cửa` (bản lá theo mã nhôm) KHÔNG có liên kết nào từ `Item`: nó khoá theo mã nhôm
 * (`AL70`, `AL552N`…), còn mã hàng là một danh tính khác. Nên nó chỉ được tra khi người gọi
 * truyền thẳng `slat_profile`. Suy mã nhôm từ mã hàng bằng chuỗi con là bịa ra một luật không có
 * thật — đúng cái bẫy `TP-CUA` nằm trong `TP-CUADL1LY` mà đợt đổi mã đã ghi lại.
 */
async function readCatalogExtras(
  call: SalesPlatformCall,
  itemCode: string,
  item: Json,
  itemGroup: string,
  doorType: string,
  includeColorScope: boolean,
  slatProfile: string,
): Promise<CatalogExtras> {
  const profileName = normalizedText(item.measurement_profile);
  const geometryName = normalizedText(item.geometry_profile);
  const specName = normalizedText(item.material_specification);

  const [profile, geometry, spec, doorSpec, colorScope, cuttingPolicies] = await Promise.all([
    profileName ? readResource(call, "Measurement Profile", profileName).catch(() => null) : Promise.resolve(null),
    geometryName ? readResource(call, "Geometry Profile", geometryName).catch(() => null) : Promise.resolve(null),
    specName ? readResource(call, "Material Specification", specName).catch(() => null) : Promise.resolve(null),
    slatProfile ? readResource(call, "Quy cách cửa", slatProfile).catch(() => null) : Promise.resolve(null),
    includeColorScope
      ? finishColorContextForItem(call, itemCode, undefined, "sales").then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      )
      : Promise.resolve(null),
    /*
     * Ước số chia lá còn có thể nằm trên CHÍNH SÁCH CẮT, và `calculateLeafPlan` ƯU TIÊN chỗ đó
     * trước khi nhìn tới mặt hàng. Không hỏi ở đây thì cảnh báo "chưa có bản lá" nổi lên vĩnh
     * viễn dù hệ thống tính lá đúng — đúng cảnh ngày 22/08: màn bán hàng vừa in
     * "Bản lá / ước số chia: 0,077 m" vừa báo thiếu ngay bên trên.
     * Đi chung Promise.all nên không thêm độ trễ.
     */
    doorType
      ? listResources(call, "Cutting Policy", ["name", "door_type", "leaf_divisor_const"], [["door_type", "=", doorType]], 5).catch(() => [])
      : Promise.resolve([] as Json[]),
  ]);

  const gaps: CatalogGap[] = [];
  if (!profileName) {
    gaps.push({
      code: "MEASUREMENT_PROFILE_MISSING",
      label: "Mặt hàng chưa gắn bộ theo dõi vật tư",
      where: itemFix(itemCode, "Bộ theo dõi vật tư"),
    });
  }
  /**
   * Hai danh mục này ĐÒI ĐÚNG LOẠI MẶT HÀNG, không đòi tất cả.
   *
   * Bộ quy cách hình học là của CỬA — cả 5 bộ trong danh mục đều là GP-CUA-*, và
   * `raySpecificGeometry` chỉ tra nó theo `door_type`. Quy cách kỹ thuật thì ngược lại: nó giữ
   * Kg/m của cây vật tư, thứ mà một cánh cửa thành phẩm không có.
   *
   * Trước 23/08/2026 cả hai đều hỏi vô điều kiện, nên màn bán hàng treo thường trực hai câu
   * không bao giờ tắt được: cửa CDL_DLM_1LY bị đòi quy cách cây, ray RT_RAY_HOP_TD_U100 bị đòi
   * bộ hình học của cửa. Cảnh báo không sửa được dạy người ta bỏ qua MỌI cảnh báo — kể cả câu
   * thật nằm ngay bên cạnh.
   */
  const laCua = Boolean(doorType);
  if (laCua && !geometryName) {
    gaps.push({
      code: "GEOMETRY_PROFILE_MISSING",
      label: "Mặt hàng chưa có bộ quy cách hình học",
      where: itemFix(itemCode, "Bộ quy cách hình học"),
    });
  }
  if (!laCua && !specName) {
    gaps.push({
      code: "SPEC_NOT_LINKED",
      label: "Mặt hàng chưa gắn quy cách kỹ thuật",
      where: itemFix(itemCode, "Quy cách kỹ thuật"),
    });
  } else if (spec) {
    const specWhere = `Danh mục → Quy cách kỹ thuật vật tư → ${specName}`;
    /*
     * KHÔNG hỏi "Chiều dài cây chuẩn" nữa. Soát 23/08/2026: 78/78 quy cách đều trống, và
     * `standard_length_m` chỉ được đọc ở đúng hai chỗ — chính cảnh báo này và một phép chiếu
     * xuống UI. Không phép tính nào dùng tới. Nhôm thì càng không có "chiều dài chuẩn": mỗi
     * đợt giao một chiều dài khác nhau, nên hệ số quy đổi nằm trên DÒNG chứ không trên hồ sơ.
     * Một câu hỏi không ai trả lời được và không ai cần câu trả lời thì không phải cảnh báo.
     *
     * Kg/m thì GIỮ: nó là số quy đổi Mét↔Kg, được đọc ở 39 chỗ, và 36/78 còn thiếu là gap thật.
     */
    if (positive(spec.theoretical_kg_per_m) === null) {
      gaps.push({
        code: "SPEC_MISSING_KG_PER_M",
        label: "Kg/m lý thuyết chưa khai",
        where: `${specWhere} → Kg/m lý thuyết`,
      });
    }
  }

  const itemDivisor = positive(item.leaf_divisor_m);
  const specDivisor = positive(doorSpec?.buoc_la_m);
  const policyDivisor = (cuttingPolicies as Json[])
    .map((row) => positive(row?.leaf_divisor_const))
    .find((value) => value !== null) ?? null;
  if (doorType && itemDivisor === null && specDivisor === null && policyDivisor === null) {
    gaps.push({
      code: "LEAF_DIVISOR_MISSING",
      label: `Mã bán theo công thức ${doorType} nhưng chưa có bản lá / ước số chia`,
      where: itemFix(itemCode, "Bản lá / ước số chia (m)"),
    });
  }
  if (slatProfile && !doorSpec) {
    gaps.push({
      code: "DOOR_SPEC_MISSING",
      label: `Chưa có bản ghi Quy cách cửa cho mã nhôm ${slatProfile}`,
      where: "Danh mục → Bản lá theo mã nhôm",
    });
  }

  const geometryFields = Array.isArray(geometry?.fields)
    ? geometry.fields
      .filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
      .map((row) => normalizedText(row.geometry_field ?? row.field ?? row.fieldname))
      .filter(Boolean)
    : [];

  const scopeOk = colorScope && colorScope.ok ? colorScope.value : null;
  const scopeError = colorScope && !colorScope.ok
    ? (colorScope.error instanceof Error ? colorScope.error.message : "Không lấy được Bề mặt/màu theo Nhóm hàng.")
    : null;
  // NOTE (vá 21/08/2026 theo phản hồi trực tiếp của chủ xưởng: "hàng thường k cần cái bề mặt
  // và nhiều mặt hàng khác"): trước bản vá này, THIẾU Bề mặt là chặn cứng (gap COLOR_SCOPE_EMPTY
  // được đẩy vào `blocking` ở cuối hàm ⇒ readiness.ready = false ⇒ client không chốt được dòng).
  // Đo trên D1 ngày 21/08: 370/404 mã (91,6%) thuộc 13/17 nhóm bị chặn oan — Phụ kiện chung (106),
  // Linh kiện motor (90), Ray và trục (33), Motor (32), Điều khiển & phụ kiện điện (16),
  // Bình lưu điện (4)... Đó là hàng KHÔNG SƠN nên vốn không có Bề mặt.
  // Cách chữa đúng bản chất là dùng cờ đã có sẵn `Measurement Profile.require_color`
  // (Hàng thường / Ống trục / Tấm-Kính / Cuộn / Lô-Serial / Ray và trục đều = false),
  // KHÔNG phải đi khai bừa Bề mặt cho Bình lưu điện — làm vậy chỉ giấu triệu chứng.
  // Sau bản vá, số mã bị chặn còn 46 — đúng là hàng cần sơn mà nhóm chưa được Bề mặt nào khai.
  if (scopeOk && scopeOk.allowed_finishes.length === 0 && truthy(profile?.require_color)) {
    gaps.push({
      code: "COLOR_SCOPE_EMPTY",
      label: `Nhóm hàng ${itemGroup || "(chưa khai)"} chưa Bề mặt nào khai áp dụng`,
      where: "Danh mục → Bề mặt → Nhóm SP áp dụng",
    });
  }

  return {
    spec_context: {
      measurement_profile: profile
        ? {
          name: profileName,
          inventory_mode: normalizedText(profile.inventory_mode) || null,
          stock_uom: normalizedText(profile.stock_uom) || null,
          track_dimension_lot: truthy(profile.track_dimension_lot),
          require_color: truthy(profile.require_color),
          require_condition: truthy(profile.require_condition),
          require_length: truthy(profile.require_length),
          require_width: truthy(profile.require_width),
          require_piece_qty: truthy(profile.require_piece_qty),
          track_bundle_qty: truthy(profile.track_bundle_qty),
          weight_tolerance_pct: positive(profile.weight_tolerance_pct),
        }
        : null,
      geometry_profile: geometry
        ? {
          code: normalizedText(geometry.profile_code ?? geometry.name) || geometryName,
          name: normalizedText(geometry.profile_name) || geometryName,
          fields: geometryFields,
        }
        : null,
      material_specification: spec
        ? {
          spec_code: normalizedText(spec.spec_code ?? spec.name) || specName,
          spec_type: normalizedText(spec.spec_type) || null,
          standard_length_m: positive(spec.standard_length_m),
          theoretical_kg_per_m: positive(spec.theoretical_kg_per_m),
          thickness_mm: positive(spec.thickness_mm),
          width_m: positive(spec.width_m),
          effective_width_m: positive(spec.effective_width_m),
          scrap_threshold_m: positive(spec.scrap_threshold_m),
          profile_system: normalizedText(spec.profile_system) || null,
          section_code: normalizedText(spec.section_code) || null,
        }
        : null,
      door_spec: doorSpec
        ? {
          ma: normalizedText(doorSpec.ma ?? doorSpec.name) || slatProfile,
          dong_cua: normalizedText(doorSpec.dong_cua) || null,
          doi: normalizedText(doorSpec.doi) || null,
          buoc_la_m: specDivisor,
          be_rong_nan_mm: positive(doorSpec.be_rong_nan_mm),
          rong_toi_da_mm: positive(doorSpec.rong_toi_da_mm),
          tru_mot_la: truthy(doorSpec.tru_mot_la),
          trong_luong_kg_m2: positive(doorSpec.trong_luong_kg_m2),
          nguon: normalizedText(doorSpec.nguon) || null,
        }
        : null,
      leaf_divisor_m: itemDivisor ?? specDivisor,
      leaf_divisor_source: itemDivisor !== null
        ? "Item.leaf_divisor_m"
        : specDivisor !== null ? "Quy cách cửa" : null,
      coverage_gaps: gaps,
      read_error: null,
    },
    ...(includeColorScope
      ? {
        color_scope: scopeOk
          ? {
            item_group: scopeOk.item_group,
            requires_color: truthy(profile?.require_color)
              || scopeOk.allowed_finishes.some((finish) => finish.requires_color),
            allowed_finishes: scopeOk.allowed_finishes,
            allowed_colors: scopeOk.allowed_colors,
            colors_by_finish: scopeOk.colors_by_finish,
          }
          : null,
      }
      : {}),
    color_scope_error: scopeError,
    gaps,
  };
}

export async function salesItemContext(call: SalesPlatformCall, args: Json): Promise<Response> {
  const itemCode = normalizedText(args.item_code);
  if (!itemCode) return json({ message: "Cần chọn mặt hàng bán." }, 422);

  const item = await readResource(call, "Item", itemCode);
  if (!item || truthy(item.disabled) || item.is_sales_item === 0 || item.is_sales_item === false) {
    return json({ message: `Mặt hàng ${itemCode} không tồn tại, đã ngừng dùng hoặc không được phép bán.` }, 422);
  }

  const stockUom = normalizedText(item.stock_uom);
  const inventoryMode = normalizedText(item.inventory_mode);
  const measurementProfile = normalizedText(item.measurement_profile);
  // Canonical Item Gate A deliberately stores finished doors as physical Bộ while their
  // commercial UOM is m². Older payloads carried inventory_mode; the current canonical
  // payload carries measurement_profile. Treat either field as the same area-door authority
  // so existing local D1 data does not need a destructive re-import just to sell in m².
  const isAreaFinished = [inventoryMode, measurementProfile]
    .some((value) => normalizedKey(value) === "thành phẩm theo m2");
  // Dữ liệu Item cũ có thể chưa chụp inventory_mode. Các mặt hàng đó vẫn đi theo
  // đường số lượng trực tiếp như mặc định metadata, không được trả context rỗng rồi
  // làm SL và Khối lượng lệch nhau trên màn bán.
  const effectiveInventoryMode = isAreaFinished ? "Thành phẩm theo m2" : inventoryMode || "Hàng thường";
  const explicitDoorType = normalizedText(item.door_type);
  const effectiveDoorType = explicitDoorType
    || (isAreaFinished ? (inferDoorType(undefined, item.item_group) ?? "") : "");
  const defaultSalesUom = normalizedText(item.default_sales_uom) || stockUom;
  const conversions = Array.isArray(item.uom_conversions)
    ? item.uom_conversions.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  const factorByUom = new Map<string, number>();
  if (stockUom) factorByUom.set(stockUom, 1);
  for (const row of conversions) {
    const uom = normalizedText(row.uom);
    const factor = positive(row.conversion_factor);
    if (uom && factor) factorByUom.set(uom, factor);
  }
  if (defaultSalesUom && !factorByUom.has(defaultSalesUom) && defaultSalesUom === stockUom) {
    factorByUom.set(defaultSalesUom, 1);
  }
  // Cửa bán m² nhưng tồn Bộ có hệ số theo TỪNG kích thước dòng, nên Item không được phép
  // khai một conversion tĩnh. Vẫn mở ĐVT bán và tra giá/m²; conversion thật sẽ được máy
  // tính cửa chụp sau khi có rộng, cao và số bộ.
  const dynamicAreaToSet = isAreaFinished
    && AREA_UOMS.has(normalizedUom(defaultSalesUom))
    && SET_UOMS.has(normalizedUom(stockUom));
  if (dynamicAreaToSet && defaultSalesUom && !factorByUom.has(defaultSalesUom)) {
    factorByUom.set(defaultSalesUom, 1);
  }
  const allowedUoms = [...factorByUom.keys()];
  const selectedUom = normalizedText(args.uom) || defaultSalesUom || stockUom;
  const catchWeight = truthy(item.has_catch_weight);
  const dynamicUoms = new Set<string>();
  if (dynamicAreaToSet && defaultSalesUom) dynamicUoms.add(defaultSalesUom);

  if (!selectedUom || !factorByUom.has(selectedUom)) {
    /**
     * Vẫn TỪ CHỐI, và vẫn từ chối TRƯỚC khi chạm tới bảng giá hay báo cáo kho — hợp đồng cũ
     * không đổi. Cái thêm vào là lý do và chỗ sửa: một mã ray/trục không bán được vì hệ số
     * Mét→Cây đang CỐ Ý để trống chờ chủ xưởng, chứ không phải vì ai đó khai sai ĐVT. Thân 422
     * chỉ dùng dữ liệu đã có trên hồ sơ Item, không thêm lượt đọc nào.
     */
    const rejected = buildUomLadder(
      itemCode, item, stockUom, defaultSalesUom, selectedUom, factorByUom, dynamicUoms, catchWeight,
    );
    const intentional = intentionallyBlankFactor(item, selectedUom, stockUom);
    const gap: UomGap = {
      uom: selectedUom || "",
      kind: selectedUom === defaultSalesUom ? "MISSING_CONVERSION" : "UNDECLARED_UOM",
      message: selectedUom === defaultSalesUom
        ? `Mặt hàng bán theo ${selectedUom} nhưng chưa khai hệ số quy đổi ${selectedUom} → ${stockUom || "ĐVT tồn"}.`
        : `ĐVT "${selectedUom || "(trống)"}" chưa được khai trên mặt hàng ${itemCode}.`,
      fix_where: itemFix(itemCode, "Đơn vị quy đổi khác"),
      intentional,
    };
    return json({
      message: `ĐVT "${selectedUom || "(trống)"}" chưa được khai trên mặt hàng ${itemCode}.`,
      allowed_uoms: allowedUoms,
      item_code: itemCode,
      uom_ladder: rejected.ladder,
      uom_gap: gap,
      readiness: {
        ready: false,
        blocking: [{
          code: gap.kind === "MISSING_CONVERSION" ? "UOM_FACTOR_MISSING" : "UOM_UNDECLARED",
          label: gap.message,
          where: gap.fix_where,
        }],
        warnings: [],
      },
    }, 422);
  }
  const conversionFactor = factorByUom.get(selectedUom) ?? 1;
  const dynamicSelectedUom = dynamicAreaToSet && AREA_UOMS.has(normalizedUom(selectedUom));
  if (dynamicSelectedUom) dynamicUoms.add(selectedUom);

  const { ladder: uomLadder, missing: missingFactors } = buildUomLadder(
    itemCode, item, stockUom, defaultSalesUom, selectedUom, factorByUom, dynamicUoms, catchWeight,
  );
  // Chỗ trống nào được nêu lên đầu là chỗ chạm tới việc BÁN trước: ĐVT đang chọn, rồi ĐVT bán
  // mặc định, rồi mới tới phần còn lại. Nêu nhầm bậc mua lên đầu là bắt người bán đi sửa một ô
  // không liên quan tới dòng họ đang gõ.
  const salesRelevantGap = missingFactors.find((entry) => entry.roles.includes("selected"))
    ?? missingFactors.find((entry) => entry.roles.includes("sales"))
    ?? missingFactors[0];
  const uomGap: UomGap | null = salesRelevantGap
    ? {
      uom: salesRelevantGap.uom,
      kind: "MISSING_CONVERSION",
      message: `Chưa khai hệ số quy đổi ${salesRelevantGap.uom} → ${stockUom || "ĐVT tồn"}.`,
      fix_where: itemFix(itemCode, "Đơn vị quy đổi khác"),
      intentional: intentionallyBlankFactor(item, salesRelevantGap.uom, stockUom),
    }
    : null;

  /**
   * Khâu danh mục KHỞI ĐỘNG ở đây và chỉ được `await` ở cuối, nên nó chạy chồng lên lượt tra giá
   * và lượt đọc tồn thay vì nối đuôi. Gắn `.catch` ngay tại chỗ tạo: một promise bị bỏ rơi mà
   * reject là unhandled rejection giết cả isolate, trong khi thứ ta muốn chỉ là mất một khoá.
   */
  const includeColorScope = args.include_color_scope === undefined || truthy(args.include_color_scope);
  const slatProfile = normalizedText(args.slat_profile);
  const catalogPending = readCatalogExtras(
    call, itemCode, item, normalizedText(item.item_group), effectiveDoorType, includeColorScope, slatProfile,
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  const priceList = normalizedText(args.price_list);
  const documentCurrency = normalizedText(args.currency ?? item.currency ?? "VND") || "VND";
  let rate: number | null = null;
  let currency = documentCurrency;
  let itemPrice: string | null = null;
  let priceMissing = false;
  let priceError: string | null = null;
  // Phần giải trình đơn giá. Nó chỉ GHI LẠI những gì đường tra giá đã đi qua — không tra lại,
  // không tự tính một con số thứ hai. Hai con số cùng nói về một đơn giá là mầm của mọi lần
  // "xem trước một đằng, lưu một nẻo".
  let priceResolution: ItemPriceLookup["resolution"] | "standard_rate" | "manual" | "error" = "manual";
  let pricePriceUom: string | null = null;
  let priceStoredRate: number | null = null;
  let priceAreaTier: string | null = null;
  let priceVariant: string | null = null;
  let priceVariantSource: ItemPriceLookup["variantSource"] = null;
  let priceVariantOptions: PriceVariantOption[] | undefined;
  let priceVariantRequired = false;
  let priceTieredByArea = false;
  let priceConvertedFrom: string | null = null;
  let priceConversionApplied: number | null = null;
  /**
   * Cách bán do người bán chọn trên dòng. Chưa chọn ⇒ chuỗi rỗng ⇒ đường tra tự quyết theo luật
   * ở `resolveItemPriceRecord` (STANDARD nếu có, biến thể duy nhất nếu chỉ có một, còn lại thì
   * HỎI). Giá trị sai cú pháp không được làm hỏng cả lời gọi — nó chỉ là một lựa chọn không tồn
   * tại, và đường "không thấy giá cho cách bán này" đã nói đúng chuyện đó.
   */
  const requestedVariant = requestedVariantOf(args.price_variant);
  if (priceList) {
    const expectedName = `${priceList}:${itemCode}:${selectedUom}`;
    try {
      const lookup = await resolveItemPriceRecord(
        call,
        priceList,
        itemCode,
        selectedUom,
        defaultSalesUom,
        requestedVariant,
      );
      const price = lookup.price;
      itemPrice = lookup.name;
      priceResolution = lookup.resolution;
      priceVariant = lookup.variant;
      priceVariantSource = lookup.variantSource;
      priceVariantOptions = lookup.variantOptions;
      priceVariantRequired = lookup.resolution === "variant_required";
      priceTieredByArea = lookup.resolution === "area_tier_ladder";
      if (price) {
        pricePriceUom = normalizedText(price.uom) || null;
        priceAreaTier = normalizedText(price.area_tier) || null;
        priceVariant = priceVariantOf(price);
        const stored = Number(price.rate);
        priceStoredRate = Number.isFinite(stored) ? stored : null;
      }
      if (lookup.sourceUom && lookup.sourceUom !== selectedUom) priceConvertedFrom = lookup.sourceUom;
      if (priceVariantRequired) {
        /**
         * KHÔNG ra tiền, và KHÔNG gọi đây là lỗi. Dòng chưa chọn cách bán thì thiếu một dữ kiện
         * người bán phải cung cấp, y như thiếu chiều rộng — chỗ sửa nằm ngay trên dòng, không
         * phải trong Danh mục. `price_error` để trống nên không có mã `PRICE_ERROR` chỉ sai chỗ.
         */
        priceMissing = true;
      } else if (priceTieredByArea) {
        /**
         * Thang bậc diện tích KHÔNG phải lỗi và KHÔNG phải chốt chặn: đường lưu lọc bậc bằng
         * diện tích một bộ của dòng, còn lời gọi này không nhận kích thước nên nó không có
         * quyền chốt một con số. Nói ra khoảng giá là đủ để người bán không tưởng mã này chưa
         * khai giá — `metaforge.api.preview_sales_commercial_line` mới là chỗ ra số cuối.
         */
        priceMissing = true;
      } else if (price && !truthy(price.disabled)) {
        const priceCurrency = normalizedText(price.currency);
        const parsed = Number(price.rate);
        currency = priceCurrency || documentCurrency;
        if (!priceCurrency) {
          priceMissing = true;
          priceError = `Đơn giá ${selectedUom} chưa khai tiền tệ.`;
        } else if (priceCurrency !== documentCurrency) {
          priceMissing = true;
          priceError = `Giá ${selectedUom} dùng ${priceCurrency}, chứng từ dùng ${documentCurrency}.`;
        } else if (!Number.isFinite(parsed) || parsed < 0) {
          priceMissing = true;
          priceError = `Đơn giá ${selectedUom} không hợp lệ.`;
        } else {
          const sourceFactor = factorByUom.get(lookup.sourceUom);
          if (!sourceFactor) {
            priceMissing = true;
            priceError = `ĐVT "${lookup.sourceUom}" chưa có hệ số quy đổi trên mặt hàng ${itemCode}.`;
          } else {
            rate = parsed * conversionFactor / sourceFactor;
            priceConversionApplied = conversionFactor / sourceFactor;
          }
        }
      } else {
        priceMissing = true;
        if (price && truthy(price.disabled)) priceError = `Giá ${selectedUom} đã ngừng áp dụng.`;
        itemPrice = itemPrice || expectedName;
      }
    } catch (error) {
      priceMissing = true;
      priceError = error instanceof Error ? error.message : `Không tra được đơn giá ${selectedUom}.`;
      itemPrice = expectedName;
      priceResolution = "error";
    }
  } else {
    // `Item.standard_rate` chỉ tồn tại ở brief đời 1; trên brief v2 nó đã bị gỡ, nên đường này
    // gần như luôn rơi về "nhập tay". Giữ nguyên hành vi cũ, chỉ nói đúng tên trạng thái ra.
    const standard = Number(item.standard_rate);
    if (Number.isFinite(standard) && standard >= 0) {
      rate = standard;
      priceResolution = "standard_rate";
    }
  }

  const managedStock = !(item.is_stock_item === 0 || item.is_stock_item === false || normalizedText(item.item_nature) === "Dịch vụ");
  // Kho xuất của đơn là ngữ cảnh chứng từ hoặc lựa chọn ngay trên dòng. `default_warehouse`
  // không phải field của Item (nó thuộc Item Default theo công ty), nên không được đọc từ Item.
  const warehouse = normalizedText(args.warehouse);
  let availableStockQty: number | null = null;
  let availableQty: number | null = null;
  let stockStatus = "Không quản lý tồn";
  let stockReadError: string | null = null;
  if (managedStock) {
    if (!warehouse) {
      stockStatus = "Chưa chọn kho";
    } else {
      try {
        const rows = await reportRows(call, "Stock Balance", { item_code: itemCode, warehouse });
        availableStockQty = rows
          .filter((row) => (!row.item_code || sameText(row.item_code, itemCode))
            && (!row.warehouse || sameText(row.warehouse, warehouse)))
          .reduce((sum, row) => sum + quantityFromRow(row), 0);
        const selectedAvailableQty = availableStockQty / conversionFactor;
        availableQty = dynamicSelectedUom ? null : selectedAvailableQty;
        stockStatus = availableStockQty > 0
          ? dynamicSelectedUom
            ? `Còn ${cleanNumber(availableStockQty)} ${stockUom} · m² quy đổi theo kích thước dòng`
            : `Còn ${cleanNumber(selectedAvailableQty)} ${selectedUom}`
          : "Hết hàng";
      } catch (error) {
        stockReadError = error instanceof Error ? error.message : "Không đọc được tồn kho.";
        stockStatus = "Không đọc được tồn";
      }
    }
  }

  const priceStatus = priceList
    ? (priceError
      ?? (priceVariantRequired
        ? "Chưa chọn mã giá"
        : priceTieredByArea
          ? `Giá ${selectedUom} theo bậc diện tích`
          : priceMissing
            ? `Chưa khai giá ${selectedUom}`
            : `Giá ${selectedUom}: ${cleanNumber(rate ?? 0)} ${currency}`))
    : "Giá nhập tay";

  // ── Tồn theo LÔ + trục cân, chạy song song với trục cây/bộ ở trên ───────────────────────────
  // Chỉ chạy khi mặt hàng thật sự theo lô. Người bán có thể không có vai đọc báo cáo kho, nên
  // hỏng ở đây chỉ được làm mất `stock_snapshot.batches`/`weight_qty`, không được làm mất tồn.
  const batchTracked = truthy(item.has_batch_no);
  let batchWeight: number | null = null;
  let batchCount: number | null = null;
  let batchDetails: BatchDetail[] | null = null;
  let batchReadError: string | null = null;
  if (managedStock && batchTracked && warehouse && !stockReadError) {
    try {
      const batchStock = await readBatchStock(call, itemCode, warehouse);
      batchWeight = batchStock.weight;
      batchCount = batchStock.count;
      batchDetails = batchStock.batches;
    } catch (error) {
      batchReadError = error instanceof Error ? error.message : "Không đọc được tồn theo lô.";
    }
  }

  const catalog = await catalogPending;
  const catalogValue = catalog.ok ? catalog.value : null;
  const catalogError = catalog.ok
    ? null
    : (catalog.error instanceof Error ? catalog.error.message : "Không đọc được ngữ cảnh danh mục.");

  const weightUom = normalizedText(item.weight_uom) || null;
  const selectedQtyBlocked = dynamicSelectedUom
    ? "Cửa bán m² tồn Bộ — hệ số quy đổi theo kích thước của từng dòng, không có số tĩnh."
    : uomGap && uomGap.uom === selectedUom
      ? uomGap.message
      : null;

  const stockSnapshot: Json = {
    warehouse: warehouse || null,
    stock_uom: stockUom || null,
    stock_qty: availableStockQty,
    selected_uom: selectedUom,
    selected_qty: availableQty,
    selected_qty_blocked_reason: selectedQtyBlocked,
    weight_uom: catchWeight ? weightUom : null,
    weight_qty: batchWeight,
    batch_tracked: batchTracked,
    batch_count: batchCount,
    batches: batchDetails,
    source: batchDetails ? "Batch Stock Balance" : availableStockQty === null ? null : "Stock Balance",
    read_error: stockReadError ?? batchReadError,
  };

  // ── Bán vượt tồn ───────────────────────────────────────────────────────────────────────────
  // Chỉ so khi CÙNG MỘT TRỤC. Trục tồn là cây/bộ, trục bán có thể là Mét — không có hệ số thì
  // `severity` là "unknown", không phải "ok". Vẽ "đủ hàng" cho một phép so chưa làm được là đúng
  // kiểu hỏng im lặng mà cả đợt danh mục này đang chống.
  const requestedQty = positive(args.qty);
  let shortage: Json | null = null;
  if (requestedQty !== null && managedStock) {
    const sellable = dynamicSelectedUom ? null : availableQty;
    const shortBy = sellable === null ? null : Math.max(0, requestedQty - sellable);
    const comparable = sellable !== null;
    shortage = {
      requested_qty: requestedQty,
      requested_uom: selectedUom,
      available_qty: sellable ?? availableStockQty,
      available_uom: comparable ? selectedUom : stockUom || selectedUom,
      short_by: shortBy,
      severity: !comparable ? "unknown" : shortBy && shortBy > 0 ? "over" : "ok",
      message: !comparable
        ? (stockReadError
          ? `Không so được: ${stockReadError}`
          : selectedQtyBlocked
            ? `Không so được: ${selectedQtyBlocked}`
            : "Không so được tồn với số lượng đang gõ.")
        : shortBy && shortBy > 0
          ? `Thiếu ${cleanNumber(shortBy)} ${selectedUom} so với tồn ở ${warehouse || "kho chưa chọn"}.`
          : `Đủ hàng: còn ${cleanNumber(sellable ?? 0)} ${selectedUom}.`,
    };
  }

  // ── Sẵn sàng của MÃ HÀNG ───────────────────────────────────────────────────────────────────
  // `blocking` là cổng chặn thật (bán ra là ghi sai tiền hoặc sai tồn); `warnings` phải hiện
  // nhưng không chặn. Xếp đúng chỗ quan trọng hơn là liệt kê nhiều: một cảnh báo kêu suốt ngày
  // là một cảnh báo không ai đọc.
  const blocking: CatalogGap[] = [];
  const warnings: CatalogGap[] = [];
  for (const entry of missingFactors) {
    blocking.push({
      code: "UOM_FACTOR_MISSING",
      label: `Chưa khai hệ số quy đổi ${entry.uom} → ${stockUom || "ĐVT tồn"}`,
      where: itemFix(itemCode, "Đơn vị quy đổi khác"),
    });
  }
  if (priceList && priceError) {
    blocking.push({
      code: "PRICE_ERROR",
      label: priceError,
      where: `Danh mục → Đơn giá theo bảng giá → ${itemPrice ?? priceList}`,
    });
  } else if (priceList && priceVariantRequired) {
    /**
     * CHẶN, và chỉ đường về ĐÚNG Ô TRÊN DÒNG — không phải về Danh mục.
     *
     * Đây là khác biệt quan trọng với `PRICE_MISSING`: danh mục không thiếu gì cả, nó khai đủ
     * hai (hoặc hơn) đơn giá cho hai cách bán. Thứ còn thiếu là một quyết định của người bán.
     * Đẩy họ đi sửa Danh mục là đẩy đi sai chỗ, và tệ hơn: người sốt ruột sẽ ngừng dùng một
     * trong hai dòng giá thật để "cho hết lỗi".
     */
    blocking.push({
      code: "PRICE_VARIANT_REQUIRED",
      label: `Chưa chọn cách bán cho ${itemCode} — ${(priceVariantOptions ?? []).length} cách bán có đơn giá khác nhau`,
      where: "Dòng bán → ô Cách bán",
    });
  } else if (priceList && priceTieredByArea) {
    warnings.push({
      code: "PRICE_TIERED_BY_AREA",
      label: `Đơn giá ${selectedUom} theo bậc diện tích — con số cuối lấy theo kích thước của dòng`,
      where: "Danh mục → Bậc diện tích",
    });
  } else if (priceList && priceMissing) {
    blocking.push({
      code: "PRICE_MISSING",
      label: `Chưa khai đơn giá ${selectedUom} trong bảng giá ${priceList}`,
      where: `Danh mục → Đơn giá theo bảng giá → ${itemPrice ?? `${priceList}:${itemCode}:${selectedUom}`}`,
    });
  }
  if (shortage && shortage.severity === "over") {
    blocking.push({
      code: "STOCK_SHORT",
      label: String(shortage.message),
      where: `Kho ${warehouse || "(chưa chọn)"}`,
    });
  } else if (shortage && shortage.severity === "unknown") {
    warnings.push({
      code: "STOCK_UNKNOWN_VS_REQUESTED",
      label: String(shortage.message),
      where: `Kho ${warehouse || "(chưa chọn)"}`,
    });
  }
  if (priceConvertedFrom) {
    warnings.push({
      code: "PRICE_CONVERTED_FROM_BASE_UOM",
      label: `Đơn giá quy đổi từ ĐVT ${priceConvertedFrom}, không phải giá khai cho ${selectedUom}`,
      where: `Danh mục → Đơn giá theo bảng giá → ${itemPrice ?? priceList}`,
    });
  }
  if (stockReadError ?? batchReadError) {
    warnings.push({
      code: "STOCK_UNREADABLE",
      label: String(stockReadError ?? batchReadError),
      where: "Báo cáo kho — cần vai Thủ kho/Stock User",
    });
  }
  if (catalogValue?.color_scope_error) {
    warnings.push({
      code: "COLOR_SCOPE_UNREADABLE",
      label: catalogValue.color_scope_error,
      where: "Danh mục → Bề mặt / Màu vật tư",
    });
  }
  if (catalogError) {
    warnings.push({
      code: "CATALOG_CONTEXT_UNREADABLE",
      label: catalogError,
      where: "Danh mục → Bộ theo dõi / Quy cách kỹ thuật",
    });
  }
  for (const gap of catalogValue?.gaps ?? []) {
    if (gap.code === "COLOR_SCOPE_EMPTY") blocking.push(gap);
    else warnings.push(gap);
  }

  return json({
    item_code: itemCode,
    item_group: normalizedText(item.item_group),
    door_type: effectiveDoorType || null,
    inventory_mode: effectiveInventoryMode,
    measurement_profile: measurementProfile || null,
    min_area_sqm: Number(item.min_area_sqm ?? 0) || 0,
    // Quyết định trực tiếp của chủ xưởng 22/08/2026: ngưỡng là 8 m², toán tử GT (> 8).
    gift_rail_min_area_sqm: positive(item.gift_rail_min_area_sqm) ?? 8,
    gift_rail_area_operator: normalizedText(item.gift_rail_area_operator).toUpperCase() === "GTE" ? "GTE" : "GT",
    purchase_kg_per_m2: positive(item.purchase_kg_per_m2),
    leaf_divisor_m: positive(item.leaf_divisor_m),
    default_color: normalizedText(item.default_color) || null,
    selected_uom: selectedUom,
    allowed_uoms: allowedUoms,
    uom_options: allowedUoms.map((uom) => ({ uom, conversion_factor: factorByUom.get(uom) })),
    conversion_factor: dynamicSelectedUom ? null : conversionFactor,
    stock_uom: stockUom,
    warehouse: warehouse || null,
    managed_stock: managedStock,
    available_stock_qty: availableStockQty,
    available_qty: availableQty,
    availability_status: [stockStatus, priceStatus].filter(Boolean).join(" · "),
    rate,
    currency,
    item_price: itemPrice,
    price_missing: priceMissing,
    price_error: priceError,
    stock_read_error: stockReadError,

    // ── THÊM MỚI 2026-08-21 · tất cả optional, không trường cũ nào đổi nghĩa ─────────────────
    uom_ladder: uomLadder,
    uom_gap: uomGap,
    stock_snapshot: stockSnapshot,
    ...(shortage === null ? {} : { shortage }),
    spec_context: catalogValue?.spec_context ?? null,
    ...(catalogValue && "color_scope" in catalogValue
      ? { color_scope: catalogValue.color_scope ?? null }
      : {}),
    color_scope_error: catalogValue?.color_scope_error ?? catalogError,
    price_explain: {
      price_list: priceList || null,
      item_price: itemPrice,
      resolution: priceResolution,
      price_uom: pricePriceUom,
      price_rate: priceStoredRate,
      converted_from_uom: priceConvertedFrom,
      conversion_applied: priceConversionApplied,
      rate,
      currency,
      area_tier: priceAreaTier,
      price_variant: priceVariant,

      // ── Cách bán (biến thể giá) · THÊM MỚI 2026-08-21 · optional ────────────────────────
      // `price_variant_options` VẮNG MẶT = không liệt kê được (đã trúng bằng tên, hoặc callback
      // không có endpoint tra theo trường). Mảng RỖNG = quét được mà mã này chưa khai giá nào.
      price_variant_source: priceVariantSource,
      price_variant_required: priceVariantRequired,
      price_tiered_by_area: priceTieredByArea,
      ...(priceVariantOptions === undefined ? {} : { price_variant_options: priceVariantOptions }),
      note: priceExplainNote({
        priceList,
        itemPrice,
        resolution: priceResolution,
        priceUom: pricePriceUom,
        selectedUom,
        convertedFrom: priceConvertedFrom,
        areaTier: priceAreaTier,
        rate,
        currency,
        priceError,
        priceVariant,
        variantOptions: priceVariantOptions,
      }),
    },
    readiness: {
      ready: blocking.length === 0,
      blocking,
      warnings,
    },
  });
}

/** Một câu tiếng Việt giải trình đúng con số đang hiện — người bán đọc được, không phải mã lỗi. */
function priceExplainNote(input: {
  priceList: string;
  itemPrice: string | null;
  resolution: string;
  priceUom: string | null;
  selectedUom: string;
  convertedFrom: string | null;
  areaTier: string | null;
  rate: number | null;
  currency: string;
  priceError: string | null;
  priceVariant?: string | null;
  variantOptions?: PriceVariantOption[] | undefined;
}): string {
  if (!input.priceList) return "Chứng từ không dùng bảng giá — đơn giá nhập tay.";
  if (input.resolution === "error") return input.priceError ?? "Không tra được đơn giá.";
  if (input.resolution === "variant_required") {
    // Câu này là thứ người bán đọc để BIẾT PHẢI LÀM GÌ, nên nó phải mang đủ con số để chọn.
    const listed = (input.variantOptions ?? [])
      .map((option) => `${option.price_variant} ${describeOptionRate(option)}`)
      .join(" · ");
    return `Mã này có ${input.variantOptions?.length ?? 0} cách bán với đơn giá khác nhau — `
      + `chọn cách bán trên dòng thì mới ra tiền: ${listed}.`;
  }
  if (input.resolution === "area_tier_ladder") {
    const option = (input.variantOptions ?? []).find((entry) => entry.price_variant === input.priceVariant);
    const span = option ? describeOptionRate(option) : "(chưa đọc được khoảng giá)";
    return `Cách bán ${input.priceVariant ?? "(chưa chọn)"} khai giá theo BẬC DIỆN TÍCH `
      + `(${option?.tier_count ?? 0} bậc, ${span}) — con số cuối lấy theo diện tích một bộ của dòng.`;
  }
  if (input.resolution === "not_found") {
    const scope = input.priceVariant ? ` cho cách bán ${input.priceVariant}` : "";
    return `Chưa khai đơn giá ${input.selectedUom}${scope} cho mặt hàng này trong bảng giá ${input.priceList}.`;
  }
  if (input.resolution === "disabled") {
    return `Đơn giá ${input.itemPrice ?? input.selectedUom} đã ngừng áp dụng.`;
  }
  const tier = input.areaTier ? `, bậc ${input.areaTier}` : "";
  // Cách bán chỉ được nêu khi nó KHÁC mặc định — nói "cách bán STANDARD" với người bán là nhiễu.
  const variant = input.priceVariant && input.priceVariant !== STANDARD_PRICE_VARIANT
    ? `, cách bán ${input.priceVariant}`
    : "";
  const amount = input.rate === null ? "(chưa ra số)" : `${cleanNumber(input.rate)} ${input.currency}`;
  if (input.resolution === "base_uom_fallback" && input.convertedFrom) {
    return `Không có dòng giá cho ${input.selectedUom}; lấy giá ĐVT ${input.convertedFrom} từ `
      + `${input.itemPrice} rồi quy đổi ⇒ ${amount}/${input.selectedUom}${tier}${variant}.`;
  }
  return `Giá lấy từ ${input.itemPrice} (${input.priceUom || input.selectedUom})${tier}${variant} ⇒ ${amount}/${input.selectedUom}.`;
}

/** Khoảng giá của một cách bán, viết cho người bán đọc chứ không phải cho log. */
function describeOptionRate(option: PriceVariantOption): string {
  const unit = option.uom ? `/${option.uom}` : "";
  const currency = option.currency ? ` ${option.currency}` : "";
  if (option.rate !== null) return `${cleanNumber(option.rate)}${currency}${unit}`;
  if (option.rate_min === null || option.rate_max === null) return "(chưa có đơn giá)";
  if (option.rate_min === option.rate_max) return `${cleanNumber(option.rate_min)}${currency}${unit}`;
  return `${cleanNumber(option.rate_min)}–${cleanNumber(option.rate_max)}${currency}${unit}`;
}
