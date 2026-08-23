import { roundTo } from "./numeric.js";
import {
  bomRuleFormula,
  bomRuleFormulaDisplay,
  applicableBomRuleComponents,
  evaluateBomRuleMaster,
  resolveBomRuleMaster,
  type BomRuleMaster,
} from "./bom-rule-core.js";
import type { BomQuantityBase, BomQuantityOperand } from "./bom-template-core.js";
import type { ProductionPlatformCall } from "./sales-production-core.js";

type Json = Record<string, unknown>;

interface ItemDoc extends Json {
  item_code?: string;
  stock_uom?: string;
  uom_conversions?: Array<{ uom?: string; conversion_factor?: unknown }>;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalizedUom(value: unknown): string {
  return text(value).toLocaleLowerCase("vi").replaceAll("²", "2").replaceAll(" ", "");
}

function positive(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function quantityText(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("vi-VN", { maximumFractionDigits: 6 })
    : "";
}

async function listDocs<T extends Json>(
  call: ProductionPlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[] = [],
  limit = 500,
): Promise<T[]> {
  const output: T[] = [];
  while (output.length < limit) {
    const pageLength = Math.min(100, limit - output.length);
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
      limit_start: String(output.length),
      limit_page_length: String(pageLength),
    });
    const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status}).`);
    const page = (((await response.json()) as { data?: T[] }).data ?? []);
    output.push(...page);
    if (page.length < pageLength) break;
  }
  return output.slice(0, limit);
}

async function readDoc<T extends Json>(call: ProductionPlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((((await response.json()) as { data?: T }).data ?? {}) as T);
}

/**
 * NHỚ ĐỆM DANH MỤC LUẬT, có hạn dùng — cùng kiểu với danh mục màu/bề mặt.
 *
 * Danh sách chỉ trả về `name`, nên phải đọc thêm 36 luật riêng lẻ để lấy công thức — mỗi lượt
 * ~43 ms, cộng lại ~1,5 s cho MỖI lần xem trước BOM, dù bộ luật gần như không đổi giữa hai lần
 * người bán gõ số đo liên tiếp. Khoá theo tenant qua `call.tenantKey`; thiếu khoá thì không nhớ
 * đệm — thà chậm còn hơn trộn luật giữa các tenant.
 */
const BOM_RULE_TTL_MS = 30_000;
const bomRuleCache = new Map<string, { at: number; value: Promise<BomRuleMaster[]> }>();

async function loadBomRules(call: ProductionPlatformCall): Promise<BomRuleMaster[]> {
  const tenant = text(call.tenantKey);
  if (tenant) {
    const hit = bomRuleCache.get(tenant);
    if (hit && Date.now() - hit.at < BOM_RULE_TTL_MS) return hit.value;
  }
  const pending = (async () => {
    const names = await listDocs<{ name?: string }>(call, "BOM Rule", ["name"], [["disabled", "=", 0]], 500);
    if (!names.length) return [];
    const docs = await Promise.all(names.map(async (row) => {
      const name = text(row.name);
      if (!name) return null;
      // Gắn lại `name`: dòng BOM chỉ đích danh luật bằng tên, mà payload trả về không chắc
      // mang theo trường đó. Thiếu nó thì ô `bom_rule` trên dòng không tra được luật nào.
      return { ...(await readDoc<Json>(call, "BOM Rule", name)), name } as BomRuleMaster;
    }));
    return docs.filter((row): row is BomRuleMaster => Boolean(row && text(row.rule_code)));
  })();
  if (tenant) {
    bomRuleCache.set(tenant, { at: Date.now(), value: pending });
    void pending.catch(() => bomRuleCache.delete(tenant));
  }
  return pending;
}

function safeFormulaDisplay(rule: BomRuleMaster): string {
  try {
    return bomRuleFormulaDisplay(rule);
  } catch {
    return text(rule.source_formula_text) || text(rule.rule_name) || text(rule.rule_code);
  }
}

/**
 * Values handed to a BOM Rule are PER ONE parent set. set_count is multiplied only by
 * evaluateBomRuleMaster afterwards. Sales billable_area_sqm can already include all sets,
 * so it is never passed through unchanged when a per-set area can be derived.
 */
function geometryValues(args: Json): Json {
  const setCount = positive(args.set_count) ?? 1;
  const width = positive(args.width_m);
  const widthRay = positive(args.width_pb_ray_m) ?? width;
  const widthPlastic = positive(args.width_pb_nhua_m) ?? width;
  const height = positive(args.height_m);
  const cut = positive(args.cut_width_m);
  const totalArea = positive(args.billable_area_sqm);
  const areaPerSet = width && height
    ? roundTo(width * height)
    : totalArea
      ? roundTo(totalArea / setCount)
      : undefined;
  const values: Json = {
    width_m: width,
    height_m: height,
    mesh_height_m: positive(args.mesh_height_m),
    cut_width_m: cut,
    billable_area_sqm: areaPerSet,
    leaf_count: positive(args.leaf_count),
    set_count: 1,
    "RONG-PB-RAY": widthRay,
    PB_RAY_RONG: widthRay,
    PB_NHUA_RONG: widthPlastic,
    PB_RONG: width,
    "CAO-PB": height,
    PB_CAO: height,
    "RONG-CAT-LA": cut,
    CAT_LA_RONG: cut,
    // `CAO_LUOI` là tên viết đảo còn sót lại; bộ mã chuẩn dùng trục-sau là `LUOI_CAO`.
    // Phát cả hai: bom-rule-core KHÔNG có bảng alias như geometry-policy, nên luật khai
    // tên chuẩn mà đây phát tên cũ là gãy im lặng — dòng cấu kiện hiện "Chưa map Quy tắc BOM"
    // chứ không báo lỗi. Ngày 22/08 có 9 luật dính đúng thế: 6 luật CAT_LA_RONG, 3 luật LUOI_CAO.
    CAO_LUOI: positive(args.mesh_height_m),
    LUOI_CAO: positive(args.mesh_height_m),
  };
  for (const key of Object.keys(values)) {
    if (values[key] === undefined || values[key] === null || values[key] === "") delete values[key];
  }
  return values;
}

function conversionFor(item: ItemDoc, fromUom: string): { factor: number; stock_uom: string } | null {
  const stockUom = text(item.stock_uom);
  if (!stockUom) return null;
  if (normalizedUom(stockUom) === normalizedUom(fromUom)) return { factor: 1, stock_uom: stockUom };
  const rows = Array.isArray(item.uom_conversions) ? item.uom_conversions : [];
  const matched = rows.find((row) => normalizedUom(row.uom) === normalizedUom(fromUom) && positive(row.conversion_factor));
  const factor = positive(matched?.conversion_factor);
  return factor ? { factor, stock_uom: stockUom } : null;
}

/** Trường hình học mang CHIỀU CAO cửa, dưới mọi cách viết còn tồn tại trong danh mục luật. */
const TRUONG_CAO = new Set(["PB_CAO", "CAO-PB", "height_m"]);

/** Giá trị `component_count_source` của Quy tắc BOM khi số cấu kiện là số lá. */
const NGUON_SO_LA = "Số lá";

/**
 * Giá trị `qty_basis` cũ trên dòng định mức mang cùng nghĩa — ĐƯỜNG LUI, sắp gỡ.
 *
 * `qty_basis` là field của tầng nền (`clouderp-erpnext`), vẫn đang nuôi cổng chặn nhôm
 * batch-tracked và guard lệnh sản xuất, nên chưa bỏ được khỏi bản ghi. Nhưng nó thôi làm
 * authority ở đây: luật khai `component_count_source` thì luật thắng.
 */
const BASIS_CU_THEO_SO_LA = "Theo số lá";

/** Số cấu kiện có phải số lá không — hỏi LUẬT trước, dòng định mức chỉ là đường lui. */
function dungSoLa(rule: BomRuleMaster, component: Json): boolean {
  const khaiTrenLuat = text(rule.component_count_source);
  if (khaiTrenLuat) return khaiTrenLuat === NGUON_SO_LA;
  return text(component.qty_basis) === BASIS_CU_THEO_SO_LA;
}

function tenTruong(operand: BomQuantityOperand): string {
  return "field" in operand ? text(operand.field) : "";
}

function giaTriTruong(operand: BomQuantityOperand, values: Json): number | null {
  if (!("field" in operand)) return Number.isFinite(operand.value) ? operand.value : null;
  const raw = Number(values[text(operand.field)]);
  if (!Number.isFinite(raw)) return null;
  const offset = Number(operand.offset);
  return roundTo(raw + (Number.isFinite(offset) ? offset : 0));
}

/**
 * Rộng cắt của MỖI LÁ, tách khỏi luật tính theo diện tích.
 *
 * Luật tôn khai `Cao PB × (Rộng ray − 0,03)`. Vế cao ở đó chỉ để nhân ra TỔNG diện tích tấm;
 * vế còn lại mới là đường cắt ngang của từng nan — mỗi lá chạy hết bề rộng cửa. Số lá KHÔNG
 * suy từ công thức này: nó đến từ `leaf_count`, do công thức chia lá của Cutting Policy tính.
 *
 * Trả null khi luật không phải tích hai vế hoặc không vế nào là chiều cao — khi đó không có
 * "mỗi lá" nào để nói, và giữ nguyên diện tích như cũ vẫn đúng.
 */
function rongCatMoiLa(rule: BomRuleMaster, values: Json): number | null {
  let base: BomQuantityBase;
  try {
    base = bomRuleFormula(rule).base;
  } catch {
    return null;
  }
  if (base.kind !== "PRODUCT") return null;
  const canh = TRUONG_CAO.has(tenTruong(base.left))
    ? base.right
    : TRUONG_CAO.has(tenTruong(base.right))
      ? base.left
      : null;
  return canh ? giaTriTruong(canh, values) : null;
}

/**
 * Lớp CẤU KIỆN VẬT LÝ — trả lời "mấy cây, mấy lá, mỗi cái cắt bao nhiêu".
 *
 * Tách hẳn khỏi lớp tiêu hao kho (`stock_consumption_*`). Người bán và thợ cắt đọc lớp này;
 * mét/m²/kg là ngôn ngữ của nhập-xuất kho và nằm ở lớp dưới.
 */
interface CauKienVatLy {
  component_count: number | null;
  component_count_uom: string;
  cut_length_each_m?: number;
  leaf_count?: number;
  component_count_error?: string;
}

/**
 * Số cấu kiện vật lý của một dòng BOM.
 *
 * Hai nguồn, chọn theo Quy tắc BOM chứ không đoán theo mã hàng:
 *
 *   - luật khai số cấu kiện là số lá → `leaf_count` do công thức chia lá tính. KHÔNG có đường lui về 1:
 *     một dòng lá hiện "1" là nói dối thợ, nên thiếu số lá thì trả lỗi đọc được để màn bán
 *     hiện cảnh báo. Diện tích m² vẫn còn nguyên ở lớp kho.
 *   - còn lại → `qty_per_set` của Quy tắc BOM, đây mới là authority về "mấy cái mỗi bộ";
 *     `qty` trên dòng BOM chỉ là bản sao dùng khi luật chưa khai.
 *
 * ĐVT đếm lấy từ chính dòng BOM (`Cây`/`Lá`/`Cái`/`Bộ`), KHÔNG lấy `result_uom` của luật —
 * `result_uom` là đơn vị của phép đo (Mét, m2), nhét nó vào cột SL là chỗ hỏng cũ.
 */
/**
 * SỐ CẤU KIỆN — cố ý tách khỏi việc tính công thức hình học.
 *
 * `qty_per_set` (mấy cây/bộ) và `leaf_count` (mấy lá) là những con số ĐỘC LẬP với chiều dài cắt:
 * biết cửa cần 2 cây ray không đòi hỏi phải biết Cao PB bằng bao nhiêu. Trước đây hàm này nhận
 * thẳng `result` từ `evaluateBomRuleMaster` — nên khi người bán mới chọn mặt hàng, CHƯA kịp gõ
 * kích thước, công thức hình học ném lỗi "thiếu PB_CAO" và toàn bộ cấu kiện rơi vào nhánh lỗi,
 * mất luôn cả số cây lẫn ĐVT — cột SL/ĐVT trống trơn hoặc lùi về "1 / Mét" cũ, đúng lúc người
 * bán cần thấy "2 Cây" nhất để biết cửa này có gì.
 *
 * Nên số cấu kiện phải tính được NGAY, không chờ kích thước; chỉ `cut_length_each_m` mới cần đợi.
 */
function soCauKien(
  component: Json,
  rule: BomRuleMaster,
  values: Json,
  qtyPerSet: number,
  setCount: number,
): Pick<CauKienVatLy, "component_count" | "component_count_uom" | "leaf_count" | "component_count_error"> {
  /*
   * `bom_count_uom` là ĐVT ĐẾM giữ từ dòng định mức (Cây/Lá/Cái). `uom` đứng sau nó chỉ là
   * đường lui: ở luồng bán, `uom` đã bị ĐVT BÁN của Item ghi đè thành Mét/m2 rồi.
   */
  const dvt = text(component.bom_count_uom) || text(component.uom);

  if (dungSoLa(rule, component)) {
    const soLa = positive(values.leaf_count);
    if (!soLa) {
      return {
        component_count: null,
        component_count_uom: dvt || "Lá",
        component_count_error: "Chưa tính được số lá từ công thức cửa — kiểm tra Cách chia lá của Quy cách cửa.",
      };
    }
    return { component_count: roundTo(soLa * setCount), component_count_uom: dvt || "Lá", leaf_count: soLa };
  }

  const moiBo = positive(qtyPerSet) ?? positive(component.qty) ?? 1;
  return { component_count: roundTo(moiBo * setCount), component_count_uom: dvt };
}

function cauKienVatLy(
  component: Json,
  rule: BomRuleMaster,
  result: ReturnType<typeof evaluateBomRuleMaster>,
  values: Json,
): CauKienVatLy {
  const dem = soCauKien(component, rule, values, result.qty_per_set, result.set_count);
  const rongCat = dungSoLa(rule, component) ? rongCatMoiLa(rule, values) : null;
  return {
    ...dem,
    ...(rongCat !== null ? { cut_length_each_m: rongCat }
      : text(rule.result_kind) === "LENGTH" && Number.isFinite(result.result_per_piece) ? { cut_length_each_m: result.result_per_piece }
      : {}),
  };
}

/**
 * Ghi chú cấu kiện, viết cho NGƯỜI BÁN chứ không cho kho.
 *
 * Người bán chốt đơn cần biết "mấy cây, mấy lá, mỗi cái cắt bao nhiêu" — đó là thứ khách hỏi
 * và thợ mang xuống xưởng. Tổng mét/m²/kg vẫn còn đủ trong `stock_consumption_*`/`stock_qty`
 * cho kho và giá thành đọc; chúng chỉ thôi chiếm chỗ mở đầu của dòng mô tả này.
 */
function componentRuleNote(
  result: ReturnType<typeof evaluateBomRuleMaster>,
  vatLy: CauKienVatLy,
  warning: string,
): string {
  const parts: string[] = [];
  if (vatLy.component_count_error) {
    parts.push(vatLy.component_count_error);
  } else if (vatLy.component_count !== null) {
    const dvt = vatLy.component_count_uom || "cái";
    parts.push(vatLy.cut_length_each_m === undefined
      ? `${quantityText(vatLy.component_count)} ${dvt}`
      : `${quantityText(vatLy.component_count)} ${dvt} × ${quantityText(vatLy.cut_length_each_m)} m/${dvt.toLocaleLowerCase("vi")}`);
  }
  parts.push(`${result.formula_display} · ${result.rule_code} v${result.rule_version}`);
  parts.push(`tiêu hao ${quantityText(result.consumption_qty)} ${result.consumption_uom}`);
  if (warning) parts.push(warning);
  return parts.filter(Boolean).join(" · ");
}

export async function enrichSalesBomPreviewWithRules(
  call: ProductionPlatformCall,
  args: Json,
  preview: Json,
): Promise<Json> {
  /*
   * Dòng cấu kiện TRÙNG CHÍNH MẶT HÀNG CHA bị loại ngay tại đây.
   *
   * Một BOM khai chính nó làm cấu phần thì mỗi lần nổ định mức lại sinh thêm một tầng cùng
   * mã — dự trù vật tư và giá thành phình vô hạn, còn màn bán thì hiện một dòng con y hệt
   * dòng cha, không ai đọc ra là lỗi. Dữ liệu hôm nay chưa có ca nào, nên chặn ở đây là
   * chặn trước khi kịp có: rẻ hơn nhiều so với gỡ một lệnh sản xuất đã phát.
   */
  const maCha = text(args.item_code);
  const tatCa = Array.isArray(preview.components)
    ? preview.components.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  const tuThamChieu = maCha ? tatCa.filter((row) => text(row.item_code) === maCha) : [];
  const components = tuThamChieu.length ? tatCa.filter((row) => text(row.item_code) !== maCha) : tatCa;

  const rules = await loadBomRules(call);
  if (!rules.length) return {
    ...preview,
    bom_rule_status: "NOT_IMPORTED",
    bom_rule_warning: "Chưa import danh mục Quy tắc BOM; đang hiển thị snapshot BOM cũ.",
  };

  const values = geometryValues(args);
  const setCount = positive(args.set_count) ?? 1;
  /*
   * Loại cửa và nhóm hàng đọc từ chính MẶT HÀNG, không bắt phía gọi phải gửi.
   *
   * `cleanLine` ở màn bán hàng chỉ giữ những trường có khai trên dòng Sales Order Item, mà
   * `door_type` là thuộc tính của Item chứ không phải của dòng bán — nên nó không bao giờ
   * được gửi lên, và MỌI luật đều trượt: từng dòng cấu kiện hiện "Chưa map Quy tắc BOM"
   * trong khi luật có đủ. Suy ở đây thì mọi phía gọi cùng hưởng, kể cả gọi bằng tay.
   *
   * Vẫn tôn trọng giá trị phía gọi gửi lên nếu có — dòng bán được phép ghi đè.
   */
  const parentItem = text(args.item_code)
    ? await readDoc<ItemDoc & { door_type?: string; item_group?: string }>(call, "Item", text(args.item_code)).catch(() => ({} as Json))
    : ({} as Json);
  const doorType = text(args.door_type) || text((parentItem as Json).door_type);
  const itemGroup = text(args.item_group) || text((parentItem as Json).item_group);
  const ruleContext = {
    bom: text(preview.bom_no),
    parent_item: text(args.item_code),
    parent_item_group: itemGroup,
    door_type: doorType,
    price_variant: text(args.price_variant),
    ...(positive(values.billable_area_sqm) === undefined
      ? {}
      : { area_sqm: positive(values.billable_area_sqm)! }),
    on: text(args.delivery_date),
  };
  // BOM tĩnh quyết định CÓ NHỮNG CẤU KIỆN NÀO; luật chỉ quyết định BAO NHIÊU. Luật khai theo
  // `door_type` nên một cửa Đài Loan khớp cả lá 6D, 7D lẫn 1LY, cả V4 kẽm lẫn V4 sơn — bơm hết
  // vào là ra BOM có ba độ dày lá cùng lúc. Chỉ dựng cấu kiện từ luật khi BOM không có dòng nào.
  const existingCodes = new Set(components.map((row) => text(row.item_code)).filter(Boolean));
  const generated = components.length
    ? []
    : applicableBomRuleComponents(rules, ruleContext)
      .filter((itemCode) => !existingCodes.has(itemCode))
      .map((itemCode): Json => ({
        component_key: `BOM-RULE:${itemCode}`,
        item_code: itemCode,
        auto_generated_by_bom_rule: true,
      }));
  const ruleComponents = [...components, ...generated];
  const itemCodes = [...new Set(ruleComponents.map((row) => text(row.item_code)).filter(Boolean))];
  const itemPairs = await Promise.all(itemCodes.map(async (code) => [code, await readDoc<ItemDoc>(call, "Item", code)] as const));
  const itemByCode = new Map(itemPairs);
  const missing: string[] = [];

  /*
   * Dòng BOM có thể CHỈ ĐÍCH DANH luật qua ô `bom_rule`. Ưu tiên nó trước khi tra tự động.
   *
   * Tra tự động khớp theo (loại cửa · mã cấu kiện), nên một mã chỉ được đúng một luật cho cả
   * dòng cửa — không diễn tả nổi trường hợp một BOM cá biệt cần công thức khác. Và khi tra
   * trượt thì mãi tới lúc báo giá mới lộ, chứ mở BOM ra không thấy gì.
   *
   * Chỉ nhận luật còn hiệu lực; luật đã ngừng dùng hoặc không tồn tại thì lùi về tra tự động
   * thay vì ném lỗi — dòng cũ trỏ tới luật vừa bị gỡ vẫn phải chạy được.
   */
  const ruleByName = new Map(rules.filter((r) => text(r.name)).map((r) => [text(r.name), r]));
  const enriched = ruleComponents.map((component) => {
    const itemCode = text(component.item_code);
    const chiDinh = text(component.bom_rule);
    const rule = (chiDinh ? ruleByName.get(chiDinh) : undefined) ?? resolveBomRuleMaster(rules, {
      ...ruleContext,
      component_item: itemCode,
    });
    if (!rule) {
      missing.push(itemCode);
      return {
        ...component,
        bom_rule_missing: true,
        bom_rule_warning: `Chưa map Quy tắc BOM cho ${itemCode}.`,
        note: [`Chưa map Quy tắc BOM cho ${itemCode}.`, text(component.note)].filter(Boolean).join(" · "),
      };
    }

    try {
      const result = evaluateBomRuleMaster(rule, values, { set_count: setCount });
      const item = itemByCode.get(itemCode) ?? {};
      const conversion = conversionFor(item, result.consumption_uom);
      const stockUom = conversion?.stock_uom ?? text(item.stock_uom);
      const stockQty = conversion ? roundTo(result.consumption_qty * conversion.factor) : null;
      const conversionWarning = conversion || !stockUom || normalizedUom(stockUom) === normalizedUom(result.consumption_uom)
        ? ""
        : `Thiếu quy đổi ${result.consumption_uom} → ${stockUom} trên Item ${itemCode}.`;
      const {
        width_pb_ray_m: _widthPbRay,
        width_pb_nhua_m: _widthPbNhua,
        width_m: _width,
        height_m: _height,
        mesh_height_m: _meshHeight,
        cut_width_m: _cutWidth,
        sales_uom_message: _oldSalesUomMessage,
        ...base
      } = component;
      void _widthPbRay; void _widthPbNhua; void _width; void _height; void _meshHeight; void _cutWidth; void _oldSalesUomMessage;
      /*
       * Trả KÍCH THƯỚC CẮT về đúng cột số đo mà nó sinh ra từ.
       *
       * Gỡ số đo của cha khỏi dòng con là đúng — 2,90 m của cây ray không phải "cao phủ bì
       * 3 m" của cửa. Nhưng gỡ xong mà không đặt lại gì thì bảng cấu kiện trống trơn cột số
       * đo, và thợ không biết cắt ray dài bao nhiêu, trục dài bao nhiêu: con số duy nhất hiện
       * ra là 5,8 — TỔNG mét của 2 cây, không phải chiều dài mỗi cây.
       *
       * Nên đặt `result_per_piece` vào chính cột đã chi phối nó: ray tính từ Cao PB thì hiện ở
       * cột Cao, trục tính từ Rộng PB ray thì hiện ở cột Rộng. Đọc ngang một dòng là ra
       * "cắt cây này dài bấy nhiêu", đúng thứ mang xuống xưởng.
       */
      const TRUC_SANG_O: Readonly<Record<string, string>> = {
        PB_CAO: "height_m", "CAO-PB": "height_m",
        PB_RAY_RONG: "width_pb_ray_m", "RONG-PB-RAY": "width_pb_ray_m",
        PB_NHUA_RONG: "width_pb_nhua_m", "RONG-PB-NHUA": "width_pb_nhua_m",
        CAT_LA_RONG: "cut_width_m", "RONG-CAT-LA": "cut_width_m",
        LUOI_CAO: "mesh_height_m", CAO_LUOI: "mesh_height_m", "CAO-LUOI": "mesh_height_m",
      };
      /*
       * `cut_axis` nói THẲNG cột nào đang giữ kích thước cắt, thay vì để client tự dò xem ô
       * số đo nào tình cờ có giá trị. Trước đây cây ray hiện được 2,9 ở cột Cao còn V4/trục
       * để trống cột Rộng, vì việc "đoán cột" phụ thuộc một ô có mặt hay không.
       */
      const oCat = text(rule.result_kind) === "LENGTH" ? TRUC_SANG_O[text(rule.source_field)] : undefined;
      const kichThuocCat: Json = oCat && Number.isFinite(result.result_per_piece)
        ? { [oCat]: result.result_per_piece }
        : {};
      const vatLy = cauKienVatLy(component, rule, result, values);
      return {
        ...base,
        ...kichThuocCat,
        bom_rule_code: result.rule_code,
        bom_rule_version: result.rule_version,
        bom_rule_authority: result.authority_type,
        formula_display: result.formula_display,
        formula_snapshot: result.formula_snapshot,
        result_per_piece: result.result_per_piece,
        qty_per_set: result.qty_per_set,
        parent_set_count: result.set_count,
        /*
         * LỚP CẤU KIỆN VẬT LÝ — abstraction chính của màn bán và của thợ cắt.
         * Đây mới là thứ cột SL/ĐVT phải đọc; `qty`/`uom`/`set_count` bên dưới chỉ còn là
         * projection tương thích ngược cho bảng cũ, KHÔNG phải authority.
         */
        component_count: vatLy.component_count,
        component_count_uom: vatLy.component_count_uom,
        ...(vatLy.cut_length_each_m === undefined ? {} : { cut_length_each_m: vatLy.cut_length_each_m }),
        ...(oCat ? { cut_axis: oCat } : {}),
        ...(vatLy.leaf_count === undefined ? {} : { leaf_count: vatLy.leaf_count }),
        ...(vatLy.component_count_error ? { component_count_error: vatLy.component_count_error } : {}),
        /* LỚP TIÊU HAO KHO — mét/m²/kg, phục vụ xuất kho, dự trù và giá thành. */
        stock_consumption_qty: result.consumption_qty,
        stock_consumption_uom: result.consumption_uom,
        consumption_qty: result.consumption_qty,
        consumption_uom: result.consumption_uom,
        // Projection tương thích ngược cho bảng BOM cũ. UI mới đọc component_count/_uom.
        set_count: result.qty_per_set,
        qty: result.consumption_qty,
        uom: result.consumption_uom,
        ...(text(rule.result_kind) === "LENGTH" ? { length_m: result.result_per_piece } : {}),
        stock_uom: stockUom,
        stock_qty: stockQty,
        conversion_factor: conversion?.factor ?? null,
        note: componentRuleNote(result, vatLy, conversionWarning),
        ...(conversionWarning ? { uom_warning: conversionWarning } : {}),
      };
    } catch (error) {
      const formulaDisplay = safeFormulaDisplay(rule);
      const quantityError = error instanceof Error ? error.message : "Không tính được Quy tắc BOM.";
      /*
       * Công thức hình học ném lỗi (thường vì chưa nhập kích thước) KHÔNG có nghĩa là số cấu
       * kiện cũng chưa biết — "2 cây ray" là một hằng số của luật, không phụ thuộc Cao PB.
       * Vẫn tính SL/ĐVT ở đây; chỉ chiều dài cắt để trống cho tới khi có đủ số đo.
       */
      const dem = soCauKien(component, rule, values, Number(rule.qty_per_set), setCount);
      return {
        ...component,
        bom_rule_code: text(rule.rule_code),
        bom_rule_version: Number(rule.version ?? 1),
        formula_display: formulaDisplay,
        quantity_error: quantityError,
        component_count: dem.component_count,
        component_count_uom: dem.component_count_uom,
        ...(dem.leaf_count === undefined ? {} : { leaf_count: dem.leaf_count }),
        ...(dem.component_count_error ? { component_count_error: dem.component_count_error } : {}),
        note: [formulaDisplay, dem.component_count !== null
          ? `${quantityText(dem.component_count)} ${dem.component_count_uom || ""} · chưa nhập kích thước để tính chiều dài cắt`.trim()
          : quantityError].filter(Boolean).join(" · "),
      };
    }
  });

  return {
    ...preview,
    components: enriched,
    bom_rule_status: missing.length ? "PARTIAL" : "APPLIED",
    bom_rule_missing_components: [...new Set(missing)],
    ...(tuThamChieu.length
      ? { bom_self_reference_warning: `Định mức của ${maCha} khai chính nó làm cấu phần — đã bỏ ${tuThamChieu.length} dòng. Sửa lại định mức trước khi phát lệnh sản xuất.` }
      : {}),
  };
}
