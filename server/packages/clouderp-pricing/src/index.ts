import type { JsonObject } from "../../contracts/src/index.js";
import { divideRoundedInt, errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import type { PricingContext, ResolvedPrice } from "./types.js";

export type { PricingContext, ResolvedPrice } from "./types.js";

export const STANDARD_PRICE_VARIANT = "STANDARD";

/**
 * Bậc "mọi diện tích" — giá trị KHÔNG RỖNG đứng thay cho ô bậc bỏ trống.
 *
 * VÌ SAO phải có sentinel thay vì để trống: `Item Price` tự đặt tên bằng
 * `format:{price_list}:{item_code}:{uom}:{price_variant}:{area_tier}`, mà `resolveAutoname`
 * (`frappe-model/src/autoname.ts` ~124) NÉM LỖI khi một khoá trong format rỗng:
 * "area_tier is required because it appears in the Item Price naming format". Đo trên bản chụp
 * D1 `work/pricing-preimage.json`: 558/558 dòng giá đang chạy không có bậc ⇒ để trống nghĩa là
 * 558/558 dòng bị TỪ CHỐI ngay khi tạo.
 *
 * VÌ SAO chọn sentinel chứ không phải "tên có điều kiện": tên có điều kiện đòi `resolveAutoname`
 * biết bỏ qua khoá rỗng — mà đó là nhân đặt tên dùng chung cho MỌI doctype của MỌI app, sửa ở đó
 * là đổi luật đặt tên toàn nền tảng để chiều một trường của một doctype. Sentinel giữ thay đổi
 * nằm gọn trong đường giá.
 *
 * Sentinel được xử lý như CÚ PHÁP, không tra về danh mục: nếu phải tra thì một ngày ai đó bấm
 * "ngừng dùng" bản ghi này là cả 558/558 dòng giá phẳng chết theo.
 */
export const ALL_AREA_TIER = "MOI-DIEN-TICH";

/**
 * Diện tích dùng để TRA BẬC là diện tích MỘT BỘ, không phải diện tích cả dòng.
 *
 * VÌ SAO phải có hàm riêng thay vì đưa thẳng `billable_area_sqm` xuống: hai con số này khác
 * nhau đúng bằng số bộ. `apps-src/alumdoor-worker/src/door-formulas.ts:369` tính
 * `billable = Math.max(rawArea, minimum) * sets` và ghi `area_per_set_sqm = rawArea`, còn cận
 * bậc thì brief mô tả rõ là của MỘT bộ ("Diện tích tối thiểu tính tiền cho một bộ"). Đo trên
 * thang TP-TOLEKEM124_8D_MSK: 2 bộ × 4,5 m² tra bằng diện tích cả dòng (9,0) rơi vào bậc 8-9
 * @580.000 thay vì bậc 4-5 @640.000 — hụt 540.000đ/dòng; 3 bộ × 3,5 m² (10,5) rơi vào bậc
 * >10 @560.000 thay vì bậc 3-4 @660.000 — hụt 1.050.000đ/dòng.
 *
 * Quy ước "per bộ" này đã được khoá ở chỗ khác nên đây không phải lựa chọn mới:
 * `clouderp-selling/src/adjustment-policy.ts:278-287` dùng `area_per_set_sqm` cho ngưỡng
 * >4/<7 và <8 m².
 *
 * ƯU TIÊN `area_per_set_sqm` chứ không tự chia: chia `billable/sets` cho ra
 * `max(rawArea, minimum)` — bằng `area_per_set_sqm` với mọi bộ lớn hơn mức tối thiểu, nhưng
 * LỆCH với bộ nhỏ hơn mức tối thiểu (bộ 3,2 m² khai tối thiểu 4 m² thì raw=3,2 còn
 * billable/bộ=4,0, hai bậc khác nhau). Nguồn không nói bậc đọc theo số nào, nên KHÔNG ĐOÁN:
 * dùng số mà dòng bán đã khai, chỉ chia khi không có. Chỗ này cần chủ xưởng chốt.
 *
 * FAIL-CLOSED: `set_count` có khai mà không đọc ra số dương thì trả `undefined` — không có
 * diện tích thì `priceTierMatches` loại mọi dòng giá có bậc và người bán thấy lỗi, còn hơn
 * lặng lẽ coi dòng nhiều bộ là một bộ.
 */
export function areaTierBasisSqm(line: {
  area_per_set_sqm?: unknown;
  billable_area_sqm?: unknown;
  set_count?: unknown;
}): number | undefined {
  const perSet = finitePositiveNumber(line.area_per_set_sqm);
  if (perSet !== undefined) return perSet;
  const billable = finitePositiveNumber(line.billable_area_sqm);
  if (billable === undefined) return undefined;
  const declared = line.set_count;
  if (declared === undefined || declared === null || normalizedText(declared) === "") return billable;
  const sets = finitePositiveNumber(declared);
  if (sets === undefined) return undefined;
  return billable / sets;
}

function finitePositiveNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function disabled(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(String(value ?? "").trim().toLocaleLowerCase("vi"));
}

function normalizedText(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

export function normalizePriceVariant(value: unknown): string {
  const variant = normalizedText(value).toUpperCase() || STANDARD_PRICE_VARIANT;
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(variant)) {
    throw errors.validation("Item Price variant must use 1-64 characters: A-Z, 0-9, _ or -");
  }
  return variant;
}

function itemPriceVariant(data: JsonObject): string {
  return normalizePriceVariant(data.price_variant);
}

/**
 * Bậc diện tích: cận trên ĐÓNG, cận dưới MỞ — `min < S ≤ max`.
 *
 * `BRD §4.11` chốt đúng chiều này, và nêu luôn hệ quả: một cửa đúng 5,0 m² ăn bậc `4-5`, không
 * phải bậc `5-6`. Đảo chiều là lệch một bậc giá trên đúng những đơn nằm ở mép.
 *
 * Thiếu cả hai cận thì bậc không ràng buộc gì — coi như không khớp, thay vì khớp mọi thứ. Đây là
 * lưới an toàn cho bậc khai thiếu, KHÔNG phải đường của `ALL_AREA_TIER`: sentinel đã được chặn
 * trước ở `priceTierMatches` nên không bao giờ xuống tới đây, kể cả khi có người lỡ tạo một bản
 * ghi `Bậc diện tích` trùng mã đó và gán cận cho nó.
 */
function areaWithinTier(tier: JsonObject, areaSqm: number): boolean {
  /**
   * `Number(null)` là **0**, không phải NaN — và `Number.isFinite(0)` là true. Nên một bậc để
   * trống cận trên mà lưu thành `null` bị đọc thành "cận trên bằng 0", tức loại mọi diện tích.
   *
   * Đo trên dữ liệu Alumdoor 21/08/2026: bậc `DT-TREN-10M2` (trên 10 m², không có cận trên) lưu
   * `max_area_sqm: null`, và cửa Đài Loan trọn bộ 12 m² ném "Item Price … does not exist".
   * Bảy bậc có đủ hai cận thì chạy đúng, chỉ bậc trên cùng chết — nên lỗi nhìn như thiếu dòng
   * giá chứ không lộ ra là lỗi đọc cận. Bậc `DT-TREN-4M2` cùng hình dạng lại chạy được, chỉ vì
   * nó lưu thiếu HẲN khoá (`undefined` → NaN) thay vì lưu `null`.
   *
   * Ba cách viết "không có cận" đều phải hiểu như nhau: vắng khoá, `null`, và chuỗi rỗng.
   */
  const doCan = (value: unknown): number => (value === null || value === undefined || String(value).trim() === "" ? Number.NaN : Number(value));
  const min = doCan(tier.min_area_sqm);
  const max = doCan(tier.max_area_sqm);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) return false;
  if (hasMin && !(areaSqm > min)) return false;
  if (hasMax && !(areaSqm <= max)) return false;
  return true;
}

/**
 * Dòng giá có gắn bậc chỉ khớp khi diện tích của dòng bán rơi vào đúng bậc đó.
 *
 * Fail-closed hai chiều: dòng bán không khai diện tích thì KHÔNG khớp bất kỳ dòng giá có bậc
 * nào (thà không thấy giá còn hơn lấy nhầm bậc), và bậc không đọc được thì cũng không khớp.
 *
 * Hai giá trị nghĩa là "áp cho mọi diện tích": ô trống (dòng giá cũ, 558/558 dòng trên D1 hiện
 * vậy) và `ALL_AREA_TIER` (dòng giá mới, buộc phải có giá trị để khoá đặt tên đủ năm đoạn). Cả
 * hai phải khớp kể cả khi dòng bán KHÔNG khai diện tích — nếu không thì mọi đơn bán phụ kiện,
 * motor, ray… đều mất giá.
 */
async function priceTierMatches(
  context: ControllerContext<JsonObject>,
  data: JsonObject,
  areaSqm: number | undefined,
): Promise<boolean> {
  const tierName = normalizedText(data.area_tier);
  if (!tierName || tierName === ALL_AREA_TIER) return true;
  if (!Number.isFinite(areaSqm) || !((areaSqm as number) > 0)) return false;
  const tier = await context.reader.getMasterRecordData(context.command.tenant_id, "Bậc diện tích", tierName);
  if (!tier || disabled(tier.disabled)) return false;
  return areaWithinTier(tier, areaSqm as number);
}

function fieldMatchedPrice(
  data: JsonObject,
  priceList: string,
  itemCode: string,
  lineUom: string,
  priceVariant: string,
): boolean {
  const dataPriceList = normalizedText(data.price_list);
  const dataItemCode = normalizedText(data.item_code);
  const priceUom = normalizedText(data.uom);
  return dataPriceList === priceList
    && dataItemCode === itemCode
    && itemPriceVariant(data) === priceVariant
    && (lineUom ? priceUom === lineUom : !priceUom);
}

function namedPriceCompatible(
  data: JsonObject,
  priceList: string,
  itemCode: string,
  lineUom: string,
  priceVariant: string,
): boolean {
  const dataPriceList = normalizedText(data.price_list);
  const dataItemCode = normalizedText(data.item_code);
  const priceUom = normalizedText(data.uom);
  if (dataPriceList && dataPriceList !== priceList) return false;
  if (dataItemCode && dataItemCode !== itemCode) return false;
  return itemPriceVariant(data) === priceVariant
    && (lineUom ? priceUom === lineUom : !priceUom);
}

function preferredPriceRecordName(priceList: string, itemCode: string, uom: string, variant: string): string {
  const base = `${priceList}:${itemCode}`;
  if (variant === STANDARD_PRICE_VARIANT) return uom ? `${base}:${uom}` : base;
  return uom ? `${base}:${uom}:${variant}` : `${base}:${variant}`;
}

/**
 * Tên năm đoạn của dòng giá KHÔNG bậc, theo đúng khoá đặt tên hiện hành của `Item Price`
 * (`format:{price_list}:{item_code}:{uom}:{price_variant}:{area_tier}`).
 *
 * VÌ SAO cần tra thêm tên này, chứ không sửa `preferredPriceRecordName`: `listMasterRecordData`
 * lọc `disabled=0` (`document-kernel/src/d1-store.ts` ~841), nên dòng giá ĐÃ NGỪNG DÙNG chỉ còn
 * đường tra theo TÊN. Mất đường đó thì một dòng giá ngừng dùng báo "does not exist" thay vì
 * "is disabled" — đúng loại thông báo khiến người dùng đi tạo dòng giá thứ hai.
 *
 * Chỉ tra được dòng KHÔNG bậc: dòng CÓ bậc thì tên chứa mã bậc, mà lúc tra ta mới có diện tích
 * chứ chưa có mã bậc. Hệ quả còn lại, ghi ra chứ không giấu: dòng giá CÓ bậc mà đang ngừng dùng
 * vẫn báo "does not exist". Chữa nó phải quét cả danh mục bậc — 8 lượt đọc mỗi lần tra giá.
 */
function untieredPriceRecordName(priceList: string, itemCode: string, uom: string, variant: string): string {
  return `${priceList}:${itemCode}:${uom}:${variant}:${ALL_AREA_TIER}`;
}

/** Đọc được cận của bậc: `undefined` nghĩa là KHÔNG CHỨNG MINH ĐƯỢC, không phải "không có cận". */
interface TierBounds { min: number; max: number }

async function tierBounds(
  reader: PricingMasterReader,
  tenantId: string,
  tierCode: string,
): Promise<TierBounds | undefined> {
  // Sentinel và ô trống phủ toàn trục — đây là định nghĩa, không phải một bản ghi tra được.
  if (!tierCode || tierCode === ALL_AREA_TIER) return { min: -Infinity, max: Infinity };
  const tier = await reader.getMasterRecordData(tenantId, "Bậc diện tích", tierCode);
  if (!tier || disabled(tier.disabled)) return undefined;
  const min = Number(tier.min_area_sqm);
  const max = Number(tier.max_area_sqm);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) return undefined;
  return { min: hasMin ? min : -Infinity, max: hasMax ? max : Infinity };
}

/**
 * HAI DÒNG GIÁ CÙNG KHỚP MỘT KHOÁ LÀ LỖI PHẢI CHẶN LÚC LƯU, KHÔNG PHẢI LÚC BÁN.
 *
 * Trước khi bậc vào khoá đặt tên, nền tảng tự chặn việc này: dòng giá thứ hai cho cùng
 * (bảng giá, mã, ĐVT, biến thể) sinh ĐÚNG một tên nên `lifecycle.ts:10` ném 409. Khoá đặt tên
 * năm đoạn gỡ mất chốt đó — `…:STANDARD` và `…:STANDARD:MOI-DIEN-TICH` là hai tên khác nhau,
 * cả hai cùng bật lọt vào D1 được. Đo trên dist: mọi lượt tra giá của mã đó (khai hay không
 * khai diện tích) đều ném `Multiple active Item Price records match …:STANDARD,
 * …:STANDARD:MOI-DIEN-TICH` ⇒ không dòng báo giá/đơn nào của mã đó lưu được nữa.
 *
 * Trường hợp thứ hai, khó lần hơn: dòng phẳng `MOI-DIEN-TICH` + một dòng CÓ BẬC do người dùng
 * tự thêm trong Danh mục (ô `Bậc diện tích` HIỆN trên form, khác `price_variant` bị ẩn bằng
 * `depends_on: eval:false`). Đo được: đơn 3,5 m² ném `Multiple active…`, còn đơn 6 m² vẫn ra
 * giá bình thường — hỏng chập chờn theo diện tích.
 *
 * `validate-alumdoor-pricing-payload.mjs` có chốt `item_price_flat_and_tiered_overlap` nhưng nó
 * chỉ soi payload ngoại tuyến, KHÔNG nhìn thấy dòng do người dùng tạo. Đây mới là chỗ chặn được.
 *
 * FAIL-CLOSED: bậc không đọc được cận (bản ghi thiếu, đã ngừng dùng, hoặc bỏ trống cả hai cận)
 * thì coi như CHỒNG LẤN. Từ chối nhầm một dòng giá tốn một lần soát tay; cho qua nhầm thì mã đó
 * mất khả năng bán mà chỉ lộ ra lúc đang lập đơn.
 */
export interface PricingMasterReader {
  getMasterRecordData(tenantId: string, recordType: string, name: string): Promise<JsonObject | null>;
  listMasterRecordData(tenantId: string, recordType: string): Promise<Array<{ name: string; data: JsonObject }>>;
}

export async function assertItemPriceTierIsUnambiguous(
  reader: PricingMasterReader,
  tenantId: string,
  candidate: JsonObject,
  candidateName: string,
): Promise<void> {
  // Dòng đã ngừng dùng không tham gia tra giá, nên nó không thể gây nhập nhằng.
  if (disabled(candidate.disabled)) return;
  const priceList = normalizedText(candidate.price_list);
  const itemCode = normalizedText(candidate.item_code);
  const uom = normalizedText(candidate.uom);
  if (!priceList || !itemCode) return;
  const variant = itemPriceVariant(candidate);
  const self = normalizedText(candidateName);
  const candidateBounds = await tierBounds(reader, tenantId, normalizedText(candidate.area_tier));

  const rows = await reader.listMasterRecordData(tenantId, "Item Price");
  for (const row of rows) {
    if (normalizedText(row.name) === self) continue;
    if (disabled(row.data.disabled)) continue;
    if (!fieldMatchedPrice(row.data, priceList, itemCode, uom, variant)) continue;
    const otherBounds = await tierBounds(reader, tenantId, normalizedText(row.data.area_tier));
    // Cận trên ĐÓNG, cận dưới MỞ (`min < S ≤ max`), nên hai khoảng chồng nhau khi
    // `min(A) < max(B)` VÀ `min(B) < max(A)`. Chạm mép (4-5 và 5-6) không phải chồng.
    const overlaps = !candidateBounds || !otherBounds
      || (candidateBounds.min < otherBounds.max && otherBounds.min < candidateBounds.max);
    if (!overlaps) continue;
    throw errors.validation(
      `Item Price ${self || "(mới)"} trùng bậc với ${row.name}: ${priceList} / ${itemCode} / ${uom || "(no UOM)"} / ${variant} đã có một dòng đang bật phủ cùng khoảng diện tích. Ngừng dùng dòng cũ trước, hoặc chọn bậc không chồng lấn.`,
    );
  }
}

export async function resolveServerPrice(
  context: ControllerContext<JsonObject>,
  input: PricingContext,
): Promise<ResolvedPrice> {
  const priceList = normalizedText(input.priceList);
  const itemCode = normalizedText(input.itemCode);
  const lineUom = normalizedText(input.uom);
  const documentCurrency = normalizedText(input.documentCurrency);
  const priceVariant = normalizePriceVariant(input.priceVariant);
  const legacyPriceName = `${priceList}:${itemCode}`;
  const preferredPriceName = preferredPriceRecordName(priceList, itemCode, lineUom, priceVariant);
  const legacy = await context.reader.getMasterRecordData(context.command.tenant_id, "Item Price", legacyPriceName);
  const untieredPriceName = untieredPriceRecordName(priceList, itemCode, lineUom, priceVariant);
  const preferred = preferredPriceName === legacyPriceName
    ? legacy
    : await context.reader.getMasterRecordData(context.command.tenant_id, "Item Price", preferredPriceName);
  // Không ĐVT thì bỏ hẳn lượt tra này: `uom` là trường bắt buộc của `Item Price`, nên tên năm
  // đoạn với đoạn ĐVT rỗng không thể trỏ vào bản ghi nào — tra chỉ tốn một lượt đọc.
  const untiered = !lineUom || untieredPriceName === preferredPriceName || untieredPriceName === legacyPriceName
    ? null
    : await context.reader.getMasterRecordData(context.command.tenant_id, "Item Price", untieredPriceName);
  const legacyUom = normalizedText(legacy?.uom);
  const compatibleLegacy = priceVariant === STANDARD_PRICE_VARIANT
    && legacy
    && namedPriceCompatible(legacy, priceList, itemCode, lineUom, STANDARD_PRICE_VARIANT)
    ? legacy
    : null;
  const compatiblePreferred = preferred
    && namedPriceCompatible(preferred, priceList, itemCode, lineUom, priceVariant)
    ? preferred
    : null;
  const compatibleUntiered = untiered
    && namedPriceCompatible(untiered, priceList, itemCode, lineUom, priceVariant)
    ? untiered
    : null;

  let priceName = preferredPriceName;
  let itemPrice: JsonObject | null = null;
  let convertedFromUom = "";
  let item: JsonObject | null = null;
  const areaSqm = Number.isFinite(Number(input.billableAreaSqm)) ? Number(input.billableAreaSqm) : undefined;
  /**
   * Lọc theo bậc diện tích TRƯỚC khi đếm ứng viên.
   *
   * Một mặt hàng bán theo thang giá có tám dòng `Item Price` cùng bảng giá / cùng ĐVT, chỉ khác
   * `area_tier`. Không lọc bậc trước thì tám dòng đó cùng lọt vào `exactCandidates` và hàm ném
   * "Multiple active Item Price records match" — tức thang giá vừa dựng lại làm chết chính nó.
   */
  const keepByTier = async (rows: Array<{ name: string; data: JsonObject }>) => {
    const kept: Array<{ name: string; data: JsonObject }> = [];
    for (const row of rows) if (await priceTierMatches(context, row.data, areaSqm)) kept.push(row);
    return kept;
  };
  const listedPrices = await context.reader.listMasterRecordData(context.command.tenant_id, "Item Price");
  const fieldMatches = listedPrices.filter(({ data }) => fieldMatchedPrice(data, priceList, itemCode, lineUom, priceVariant));
  const activeFieldMatches = await keepByTier(fieldMatches.filter(({ data }) => !disabled(data.disabled)));
  const exactCandidates = new Map<string, JsonObject>();
  if (
    compatiblePreferred
    && !disabled(compatiblePreferred.disabled)
    && await priceTierMatches(context, compatiblePreferred, areaSqm)
  ) {
    exactCandidates.set(preferredPriceName, compatiblePreferred);
  }
  if (
    compatibleUntiered
    && !disabled(compatibleUntiered.disabled)
    && await priceTierMatches(context, compatibleUntiered, areaSqm)
  ) {
    exactCandidates.set(untieredPriceName, compatibleUntiered);
  }
  for (const candidate of activeFieldMatches) {
    if (candidate.name === legacyPriceName && preferredPriceName !== legacyPriceName) continue;
    exactCandidates.set(candidate.name, candidate.data);
  }
  if (exactCandidates.size > 1) {
    throw errors.validation(
      `Multiple active Item Price records match ${priceList} / ${itemCode} / ${lineUom || "(no UOM)"} / ${priceVariant}: ${[...exactCandidates.keys()].sort().join(", ")}`,
    );
  }
  if (exactCandidates.size === 1) {
    const [candidateName, candidateData] = [...exactCandidates.entries()][0]!;
    itemPrice = candidateData;
    priceName = candidateName;
  } else if (
    compatibleLegacy
    && !disabled(compatibleLegacy.disabled)
    && await priceTierMatches(context, compatibleLegacy, areaSqm)
  ) {
    itemPrice = compatibleLegacy;
    priceName = legacyPriceName;
  }

  if (!itemPrice && lineUom) {
    item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", itemCode);
    const transactionDefaultUom = input.partyType === "Supplier"
      ? normalizedText(item?.default_purchase_uom)
      : normalizedText(item?.default_sales_uom);
    const baseUom = transactionDefaultUom || normalizedText(item?.stock_uom);
    if (item && baseUom && baseUom !== lineUom) {
      const baseMatches = listedPrices.filter(({ data }) => fieldMatchedPrice(data, priceList, itemCode, baseUom, priceVariant));
      // Đường lùi về ĐVT gốc cũng phải lọc bậc, không thì nó thành cửa sau bỏ qua thang giá.
      const activeBase = await keepByTier(baseMatches.filter(({ data }) => !disabled(data.disabled)));
      if (activeBase.length > 1) {
        throw errors.validation(`Multiple active Item Price records match ${priceList} / ${itemCode} / ${baseUom} / ${priceVariant}: ${activeBase.map(({ name }) => name).sort().join(", ")}`);
      }
      if (activeBase.length === 1) {
        itemPrice = activeBase[0]!.data;
        priceName = activeBase[0]!.name;
        convertedFromUom = baseUom;
      }
    }
  }

  /**
   * Đường này tồn tại để báo lỗi TỬ TẾ khi dòng giá duy nhất khớp lại đang ngừng dùng: chọn nó
   * rồi để kiểm tra ngay dưới ném "Item Price … is disabled", thay vì "does not exist".
   *
   * Vì thế nó chỉ được nhận ứng viên ĐANG NGỪNG DÙNG. Bản cũ lấy `fieldMatches[0]` — cả dòng
   * đang bật — điều mà trước khi có bậc thì không bao giờ xảy ra (một dòng bật đã được chọn ở
   * trên, nhiều dòng bật thì đã ném). Có bậc rồi thì xảy ra thật: một dòng giá BỊ BẬC LOẠI vẫn
   * đang bật, và nó lọt qua đây thành giá được dùng. Đơn không khai diện tích sẽ lặng lẽ ăn giá
   * của bậc đầu tiên trong danh sách.
   */
  if (!itemPrice) {
    const disabledCandidate = compatiblePreferred && disabled(compatiblePreferred.disabled)
      ? { name: preferredPriceName, data: compatiblePreferred }
      : compatibleUntiered && disabled(compatibleUntiered.disabled)
        ? { name: untieredPriceName, data: compatibleUntiered }
        : compatibleLegacy && disabled(compatibleLegacy.disabled)
          ? { name: legacyPriceName, data: compatibleLegacy }
          : fieldMatches.find(({ data }) => disabled(data.disabled));
    if (disabledCandidate) {
      itemPrice = disabledCandidate.data;
      priceName = disabledCandidate.name;
    }
  }

  if (
    !itemPrice
    && priceVariant === STANDARD_PRICE_VARIANT
    && legacy
    && itemPriceVariant(legacy) === STANDARD_PRICE_VARIANT
    && !lineUom
    && legacyUom
  ) {
    throw errors.validation(`Item Price ${legacyPriceName} declares UOM "${legacyUom}"; the document row must provide a matching transaction UOM`);
  }
  if (!itemPrice) throw errors.reference(`Item Price ${preferredPriceName} does not exist for variant ${priceVariant}`);
  if (disabled(itemPrice.disabled)) throw errors.reference(`Item Price ${priceName} is disabled`);

  const currency = normalizedText(itemPrice.currency);
  if (!currency) throw errors.reference(`Item Price ${priceName} must define currency`);
  if (currency !== documentCurrency) throw errors.reference(`Item Price ${priceName} currency does not match document currency`);
  const priceUom = normalizedText(itemPrice.uom);
  if (priceUom && lineUom && priceUom !== lineUom && !convertedFromUom) {
    throw errors.validation(`Item Price ${priceName} applies to UOM "${priceUom}", but the document row uses "${lineUom}"`);
  }
  const currencyMaster = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
  const scale = typeof currencyMaster?.currency_scale === "number" ? currencyMaster.currency_scale : 2;
  let rate = toScaledInt(decimal(itemPrice.rate, "item price rate"), scale, "item price rate");
  if (rate < 0) throw errors.validation("Item Price rate cannot be negative");
  if (convertedFromUom) {
    item ??= await context.reader.getMasterRecordData(context.command.tenant_id, "Item", itemCode);
    if (!item) throw errors.reference(`Item ${itemCode} does not exist`);
    const sourceFactor = uomFactorMicros(item, convertedFromUom);
    const targetFactor = uomFactorMicros(item, lineUom);
    rate = multiplyDivideRounded(rate, targetFactor, sourceFactor);
  }

  let selected: { name: string; data: JsonObject } | undefined;
  let discount: string | undefined;
  if (input.applyPricingRules !== false) {
    const rules = await context.reader.listMasterRecordData(context.command.tenant_id, "Pricing Rule");
    const matches = rules
      .filter(({ data }) => overridesRate(data) && matchesRule(data, input))
      .sort((a, b) => ruleScore(b.data) - ruleScore(a.data) || a.name.localeCompare(b.name));
    if (matches.length > 1) {
      const topScore = ruleScore(matches[0]!.data);
      const tied = matches.filter(({ data }) => ruleScore(data) === topScore);
      if (tied.length > 1) {
        throw errors.validation(`Ambiguous Pricing Rule match: ${tied.map(({ name }) => name).sort().join(", ")}`);
      }
    }
    selected = matches[0];
    if (selected) {
      const data = selected.data;
      if (data.rate !== undefined) {
        rate = toScaledInt(decimal(data.rate, "pricing rule rate"), scale, "pricing rule rate");
      } else if (data.discount_percentage !== undefined) {
        const pct = toScaledInt(decimal(data.discount_percentage, "discount percentage"), 6, "discount percentage");
        if (pct < 0 || pct > 100_000_000) throw errors.validation("Discount percentage must be between 0 and 100");
        const discountMinor = divideRounded(
          multiplyScaled(fromScaledInt(rate, scale), scale, fromScaledInt(pct, 6), 6, scale),
          100,
        );
        rate = Math.max(0, rate - discountMinor);
        discount = fromScaledInt(pct, 6);
      }
    }
  }
  if (rate < 0) throw errors.validation("Resolved price cannot be negative");
  return {
    rate_minor: rate,
    rate: fromScaledInt(rate, scale),
    currency,
    currency_scale: scale,
    item_price: priceName,
    price_variant: priceVariant,
    ...((lineUom || priceUom) ? { uom: lineUom || priceUom } : {}),
    ...(convertedFromUom ? { source_uom: convertedFromUom } : {}),
    ...(selected ? { pricing_rule: selected.name } : {}),
    ...(discount ? { discount_percentage: discount } : {}),
  };
}

/**
 * Đường tra giá này chỉ biết ĐÈ ĐƠN GIÁ (`rate`) hoặc GIẢM PHẦN TRĂM (`discount_percentage`) —
 * xem ngay bên dưới chỗ dùng `selected`. Nó KHÔNG đọc `adjustment_rate`; phụ thu và phụ giảm
 * theo dòng do `clouderp-selling` lo bằng một bộ so khớp khác, giàu hơn hẳn (bộ kia biết
 * `item_group`, `pricing_scope` và `conditions`, còn `matchesRule` ở đây thì không).
 *
 * Nên phải LỌC RA TRƯỚC. Nếu để luật phụ thu lọt vào đây thì hai chuyện xảy ra, cả hai đều tệ:
 * chọn trúng nó cũng không đổi được đồng nào (không có `rate` để đọc), mà hai luật phụ thu cùng
 * mức ưu tiên là ném "Ambiguous Pricing Rule match" và CHẶN cả dòng hàng.
 *
 * Đo trên dữ liệu Alumdoor 21/08/2026: bán một bộ KHOÁ NGANG bị chặn bởi bốn luật —
 * "Phụ thu cửa Úc trên 4m² dưới 7m²", "Phụ vận chuyển cửa dưới 8m² — Đức và Lưới",
 * "Sơn vân gỗ — cửa", "Sơn vân gỗ — ray". Không luật nào trong bốn cái đó liên quan tới khoá
 * ngang; chúng khớp chỉ vì `matchesRule` không nhìn `item_group` lẫn `pricing_scope`, rồi hoà
 * điểm nhau ở mức ưu tiên 100.
 */
function overridesRate(rule: JsonObject): boolean {
  return rule.rate !== undefined || rule.discount_percentage !== undefined;
}

function matchesRule(rule: JsonObject, input: PricingContext): boolean {
  if (rule.disabled === true || rule.disabled === 1) return false;
  if (typeof rule.price_list === "string" && rule.price_list !== input.priceList) return false;
  if (typeof rule.item_code === "string" && rule.item_code !== input.itemCode) return false;
  if (typeof rule.party_type === "string" && rule.party_type !== input.partyType) return false;
  if (typeof rule.party === "string" && rule.party !== input.party) return false;
  if (typeof rule.customer_group === "string" && rule.customer_group !== input.customerGroup) return false;
  if (typeof rule.supplier_group === "string" && rule.supplier_group !== input.supplierGroup) return false;
  if (typeof rule.valid_from === "string" && input.postingDate.slice(0, 10) < rule.valid_from.slice(0, 10)) return false;
  if (typeof rule.valid_upto === "string" && input.postingDate.slice(0, 10) > rule.valid_upto.slice(0, 10)) return false;
  const min = rule.min_qty === undefined ? 0 : toScaledInt(decimal(rule.min_qty, "minimum quantity"), 6);
  const max = rule.max_qty === undefined ? Number.MAX_SAFE_INTEGER : toScaledInt(decimal(rule.max_qty, "maximum quantity"), 6);
  return input.qtyMicros >= min && input.qtyMicros <= max;
}

function ruleScore(rule: JsonObject): number {
  return (typeof rule.priority === "number" ? rule.priority : 0) * 100
    + (rule.party ? 20 : 0) + (rule.item_code ? 10 : 0) + (rule.customer_group || rule.supplier_group ? 5 : 0);
}

function decimal(value: unknown, field: string): string | number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`);
  return value;
}

function uomFactorMicros(item: JsonObject, uom: string): number {
  const stockUom = normalizedText(item.stock_uom);
  if (uom === stockUom) return 1_000_000;
  const rows = Array.isArray(item.uom_conversions) ? item.uom_conversions : [];
  const match = rows.find((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return normalizedText((value as JsonObject).uom) === uom;
  }) as JsonObject | undefined;
  if (!match) throw errors.validation(`UOM "${uom}" has no conversion factor on Item ${normalizedText(item.name) || normalizedText(item.item_code)}`);
  const factor = toScaledInt(decimal(match.conversion_factor, `conversion factor for ${uom}`), 6, `conversion factor for ${uom}`);
  if (factor <= 0) throw errors.validation(`Conversion factor for UOM "${uom}" must be greater than zero`);
  return factor;
}

function multiplyDivideRounded(value: number, multiplier: number, divisor: number): number {
  if (![value, multiplier, divisor].every(Number.isSafeInteger) || divisor <= 0) throw errors.validation("Pricing arithmetic exceeds safe integer bounds");
  const numerator = BigInt(value) * BigInt(multiplier);
  const denominator = BigInt(divisor);
  const rounded = (numerator + denominator / 2n) / denominator;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw errors.validation("Pricing arithmetic exceeds safe integer bounds");
  return result;
}

function divideRounded(numerator: number, denominator: number): number {
  return divideRoundedInt(numerator, denominator, "Pricing arithmetic exceeds safe integer bounds");
}
