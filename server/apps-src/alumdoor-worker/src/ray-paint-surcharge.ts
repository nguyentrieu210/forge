/**
 * Phụ thu sơn ray cho cửa TRỌN BỘ — tính ĐỘNG theo mét ray thật của chính đơn đang lập.
 *
 * Đơn ray/BOM và đơn giá là hai tầng tách biệt (đêm 23/08 mới xác nhận: tầng giá không đọc
 * được BOM theo bộ lọc). Ở Tách món, ray là một dòng bán có mét riêng nên Pricing Rule
 * `LENGTH_M` tính thẳng được. Ở Trọn bộ, ray chỉ là cấu kiện ẩn trong BOM — không có dòng nào
 * cho luật đó chạy vào.
 *
 * Hàm này không mượn luật giá — nó tự tính: xổ BOM của chính cửa (dùng lại đúng
 * `previewDraftSalesBomRequirements`, KHÔNG viết lại phép tính hình học lần hai), lọc đúng
 * những mã ray nằm trong `Pricing Scope "Ray TD và ray sắt không ron"`, cộng mét đã cắt của
 * chúng, rồi đọc thẳng đơn giá/điều kiện màu từ hai `Pricing Rule` "Sơn vân gỗ — ray" / "Sơn
 * ray màu khác" — không hard-code 55.000 hay 15.000 ở đây, để không có ngày hai nơi nói hai
 * con số khác nhau.
 */
import type { ProductionPlatformCall } from "./sales-production-core.js";
/*
 * Nhập từ `sales-production.js` (lớp bọc), KHÔNG phải `sales-production-core.js`.
 * Bản lõi chưa qua `enrichSalesBomPreviewWithRules` nên không có `cut_length_each_m` /
 * `component_count` — hai trường bài này cần để cộng mét ray thật.
 */
import { previewDraftSalesBomRequirements } from "./sales-production.js";

type Json = Record<string, unknown>;

export interface RayPaintSurchargeResult {
  applicable: boolean;
  total_length_m: number;
  rate_per_meter: number;
  surcharge_minor: number;
  matched_rule: string | null;
  ray_components: Array<{ item_code: string; length_m: number }>;
  reason?: string;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function positive(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function readResource(call: ProductionPlatformCall, doctype: string, name: string): Promise<Json | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) return null;
  return ((await response.json()) as { data?: Json }).data ?? null;
}

function tableRows(value: unknown): Json[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

interface RayColorRule {
  name: string;
  rate_minor: number;
  matches(color: string): boolean;
}

function parseConditionColor(rule: Json): RayColorRule | null {
  const rateMinor = Math.round(positive(rule.adjustment_rate));
  if (!rateMinor) return null;
  let conditions: Json[] = [];
  try {
    const raw = rule.conditions;
    conditions = tableRows(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
  const colorCondition = conditions.find((c) => text(c.field) === "color");
  if (!colorCondition) return null;
  const op = text(colorCondition.operator);
  if (op === "eq") {
    const want = text(colorCondition.value);
    return { name: text(rule.title || rule.name), rate_minor: rateMinor, matches: (color) => color === want };
  }
  if (op === "not_in") {
    const excluded = new Set((Array.isArray(colorCondition.values) ? colorCondition.values : []).map(text));
    return { name: text(rule.title || rule.name), rate_minor: rateMinor, matches: (color) => Boolean(color) && !excluded.has(color) };
  }
  return null;
}

/**
 * Mét ray thật của chính đơn — xổ BOM rồi cộng chiều dài cắt của những cấu kiện thuộc phạm vi
 * "Ray TD và ray sắt không ron". KHÔNG tính lại hình học: `cut_length_each_m`/`component_count`
 * lấy nguyên từ BOM preview, cùng một nguồn với bảng cấu kiện người bán đang nhìn thấy.
 */
async function rayLengthFromBom(
  call: ProductionPlatformCall,
  bomArgs: Json,
  inScope: Set<string>,
): Promise<Array<{ item_code: string; length_m: number }>> {
  const response = await previewDraftSalesBomRequirements(call, bomArgs);
  if (!response.ok) return [];
  const body = (await response.json()) as Json;
  const components = tableRows(body.components);
  const result: Array<{ item_code: string; length_m: number }> = [];
  for (const component of components) {
    const itemCode = text(component.item_code);
    if (!itemCode || !inScope.has(itemCode)) continue;
    const cutEach = Number(component.cut_length_each_m);
    const count = Number(component.component_count);
    if (!Number.isFinite(cutEach) || !Number.isFinite(count) || cutEach <= 0 || count <= 0) continue;
    result.push({ item_code: itemCode, length_m: Math.round(cutEach * count * 1e6) / 1e6 });
  }
  return result;
}

/**
 * Phần THUẦN — cộng mét + chọn luật màu. Không tự đọc BOM/Pricing Scope, nhận sẵn qua tham số
 * để test được mà không phải giả lập cả chuỗi đọc Item/Cutting Policy/BOM Rule.
 */
export function combineRayPaintSurcharge(
  rayComponents: Array<{ item_code: string; length_m: number }>,
  rayColor: string,
  rules: Json[],
): RayPaintSurchargeResult {
  if (!rayColor) {
    return { applicable: false, total_length_m: 0, rate_per_meter: 0, surcharge_minor: 0, matched_rule: null, ray_components: [], reason: "Chưa chọn màu ray." };
  }
  const colorRules = rules
    .filter((r): r is Json => Boolean(r) && !r.disabled)
    .map(parseConditionColor)
    .filter((r): r is RayColorRule => Boolean(r))
    // Ưu tiên luật có điều kiện `eq` (khớp đích danh một màu) trước luật `not_in` (khớp phần còn lại).
    .sort((a, b) => (a.matches(rayColor) === b.matches(rayColor) ? 0 : a.matches(rayColor) ? -1 : 1));
  const matched = colorRules.find((r) => r.matches(rayColor));
  if (!matched) {
    return { applicable: true, total_length_m: 0, rate_per_meter: 0, surcharge_minor: 0, matched_rule: null, ray_components: [], reason: `Màu ${rayColor} không thuộc luật phụ thu sơn ray nào (được miễn).` };
  }
  const totalLength = Math.round(rayComponents.reduce((sum, r) => sum + r.length_m, 0) * 1e6) / 1e6;
  const surchargeMinor = Math.round(matched.rate_minor * totalLength);
  return {
    applicable: true,
    total_length_m: totalLength,
    rate_per_meter: matched.rate_minor,
    surcharge_minor: surchargeMinor,
    matched_rule: matched.name,
    ray_components: rayComponents,
  };
}

export async function computeRayPaintSurcharge(
  call: ProductionPlatformCall,
  args: Json,
): Promise<RayPaintSurchargeResult> {
  const rayColor = text(args.ray_color);
  if (!rayColor) return combineRayPaintSurcharge([], rayColor, []);

  const scope = await readResource(call, "Pricing Scope", "Ray TD và ray sắt không ron");
  const inScope = new Set(tableRows(scope?.members).map((m) => text(m.item_code)).filter(Boolean));
  if (!inScope.size) {
    return { applicable: false, total_length_m: 0, rate_per_meter: 0, surcharge_minor: 0, matched_rule: null, ray_components: [], reason: "Chưa cấu hình Pricing Scope ray." };
  }

  const [rule1, rule2, rayComponents] = await Promise.all([
    readResource(call, "Pricing Rule", "Sơn vân gỗ — ray"),
    readResource(call, "Pricing Rule", "Sơn ray màu khác"),
    rayLengthFromBom(call, args, inScope),
  ]);
  return combineRayPaintSurcharge(rayComponents, rayColor, [rule1, rule2].filter((r): r is Json => Boolean(r)));
}
