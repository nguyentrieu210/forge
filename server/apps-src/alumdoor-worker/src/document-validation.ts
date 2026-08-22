/**
 * Worker riêng của ALUMDOOR — những việc brief không nói được vì phải TÍNH rồi mới quyết.
 *
 *   POST /api/method/alumdoor.slats.compute   chiều cao phủ bì → số lá, theo mã và đời SP
 *   POST /api/method/alumdoor.cut.propose     rộng cắt lá + số lá → đề xuất lô nhôm nên cắt
 *   POST /api/method/alumdoor.cut.apply       cắt thật: trừ lô, ghi phiếu cắt, ghi phế
 *   POST /api/method/alumdoor.cut.reverse     GHI NHẦM: trả lá nguyên khổ về đúng lô cũ
 *   POST /api/method/alumdoor.cut.return      TRẢ HÀNG: nhập lá ĐÃ CẮT vào lô khổ mới
 *   POST /api/method/alumdoor.quote.preview   xem đơn hàng sẽ tạo từ một báo giá
 *   POST /api/method/alumdoor.quote.convert   báo giá đã chốt → đơn hàng, đúng MỘT lần
 *
 * Worker không giữ quyền nào. Mọi đọc/ghi đi ngược qua gateway với danh tính của chính
 * người vừa gọi, nên nó làm được đúng những gì người đó làm được, trong đúng một lời gọi.
 *
 * VÌ SAO TRỪ TỒN Ở ĐÂY LÀ AN TOÀN, trong khi ở chỗ khác em nói kiểm-rồi-ghi là không an
 * toàn cho kho: lệnh ghi lô mang theo `modified` của chính bản ghi vừa đọc. Hai người cắt
 * cùng một lô cùng lúc thì người thứ hai bị TỪ CHỐI vì bản ghi đã đổi — không phải cả hai
 * cùng lọt rồi kho âm. Đó là chốt của nền tảng, không phải của Worker này.
 */
import {
  australianSlatCount,
  slatCount,
  slatProfilesFromCatalog,
  type AustralianDoor,
  type SlatCatalogRow,
  type SlatProfileTable,
} from "./slats.js";
import { buildRows, extractJson, type OcrRow } from "./ocr.js";
import { syncLotsFromReceipt } from "./lots-from-receipt.js";
import {
  calculateDoorFormula,
  inferDoorType,
  isManualPullGroup,
  parseDoorPolicy,
  rayTypeOf,
  selectDoorPolicy,
  type CustomerGroup,
  type DoorFormulaPolicy,
  type DoorFormulaPurpose,
  type SalesMode,
} from "./door-formulas.js";
import { salesItemContext } from "./sales-item-context.js";
import {
  allowedColorNamesForGroup,
  colorScopeForItem,
  colorUsageForDoctype,
  finishColorContextForItem,
  normalizeColorUsage,
} from "./color-scopes.js";
import { previewChildRow } from "./ui-child-preview.js";
import { previewDocument } from "./ui-document-preview.js";
import {
  confirmSupplierOffset,
  planCapacity,
  previewDailyDeliveries,
  validateWarrantyClaim,
  type CapacityDemand,
  type CapacityResource,
  type WarrantyClaimInput,
} from "./operations-core.js";
import {
  calculateSalesProductionLine,
  createSalesProduction,
  previewDraftSalesBomRequirements,
  previewSalesProduction,
  syncPaintJobsFromCut,
  validateProductionRequest,
} from "./sales-production.js";
import {
  attendanceChallenge,
  attendanceResolveStation,
  attendanceRotateStationQr,
  attendanceScan,
  attendanceStationQr,
} from "./attendance-routes.js";
import {
  attendanceCorrectionRequests, attendanceExceptions, attendanceMonth, attendanceReviewCorrection,
  attendanceSubmitCorrection, attendanceToday,
} from "./attendance-operational-routes.js";
import {
  payrollApprovePeriod, payrollCalculatePeriod, payrollCreatePeriod, payrollMarkPaid,
  payrollMySlips, payrollPeriodList, payrollPeriodSlips, payrollSubmitPeriod,
} from "./payroll-routes.js";

interface Env {
  INTERNAL_AUTH_SECRET?: string;
  /** Dedicated HMAC secret for short-lived attendance QR challenges. */
  ALUMDOOR_ATTENDANCE_QR_SECRET?: string;
  /** Gateway, gọi thẳng script. Xem wrangler.jsonc. */
  PLATFORM?: Fetcher;
  /** Workers AI — chỉ dùng để ĐỌC ẢNH. Không chạm dữ liệu tenant. */
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
}


import type { PlatformCall } from "./platform-call.js";
import { accept, answer, refuse } from "./responses.js";

// Luật kiểm tra chứng từ của AlumDoor: mặt hàng, phép đo lúc mua, số lượng theo từng kiểu
// bán (m2, mét, cây, cái), và màu được phép dùng.
//
// Gần 850 dòng này từng nằm giữa index.ts 3689 dòng, xen kẽ với định tuyến, cắt nhôm và
// đồng bộ lô. Tách ra để đọc một luật không phải cuộn qua ba thứ khác, và để sửa luật số
// lượng không đụng vào file chứa tất cả mọi thứ.

export interface InventoryItem {
  item_code?: string;
  item_group?: string;
  door_type?: string;
  purchase_kg_per_m2?: number;
  inventory_mode?: string;
  stock_uom?: string;
  default_purchase_uom?: string;
  default_sales_uom?: string;
  measurement_profile?: string;
  material_specification?: string;
  min_area_sqm?: number;
  is_purchase_item?: unknown;
  is_sales_item?: unknown;
  uom_conversions?: Array<{ uom?: string; conversion_factor?: unknown }>;
}

export interface ValidatorSubject {
  doctype: string;
  name: string;
  action: string;
  payload: Record<string, unknown>;
}

export function positive(value: unknown): boolean {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

export function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  const normalized = String(value ?? "").trim().toLocaleLowerCase("vi");
  return normalized === "có" || normalized === "co" || normalized === "yes" || normalized === "true";
}


/**
 * Nhớ bản ghi đã đọc TRONG MỘT LƯỢT kiểm — nguyên nhân thật của lỗi quá hạn 2 giây.
 *
 * Một phiếu mua chạy qua ba bộ kiểm nối tiếp: dòng hàng, quy cách đo, màu. Cả ba đều bắt đầu
 * bằng việc đọc Item của từng dòng, và mỗi bộ đọc lại từ đầu — nên phiếu 3 dòng tốn 9 lượt
 * đọc Item thay vì 3, cộng Measurement Profile và Item Color. Mỗi lượt là một vòng app →
 * cổng → tenant; nhân lên là vượt hạn mức 2000 ms, và phiếu bị từ chối vì CHẬM chứ không
 * phải vì sai. Đó là lý do phiếu nhập chưa bao giờ lưu nổi.
 *
 * Khoá theo chính hàm `call` — nó được tạo mới cho từng request, nên bộ nhớ tạm sống đúng
 * một lượt kiểm rồi biến mất cùng nó. Không có chuyện một lượt đọc phải dữ liệu cũ của lượt
 * trước: `WeakMap` thả cache ngay khi `call` hết dùng.
 *
 * Nhớ cả kết quả `null` (404): "mặt hàng này không tồn tại" cũng là một câu trả lời, và hỏi
 * lại ba lần vẫn ra đúng nó.
 */
const masterCache = new WeakMap<object, Map<string, Promise<Record<string, unknown> | null>>>();

export async function readMaster(call: PlatformCall, doctype: string, name: string): Promise<Record<string, unknown> | null> {
  let cache = masterCache.get(call);
  if (!cache) { cache = new Map(); masterCache.set(call, cache); }
  const key = `${doctype}/${name}`;
  const hit = cache.get(key);
  // Nhớ chính lời hứa chứ không phải kết quả: hai bộ kiểm hỏi cùng lúc thì chỉ MỘT lượt gọi
  // thật đi ra ngoài, thay vì cả hai cùng bắn đi rồi cùng chờ.
  if (hit) return hit;
  const pending = (async () => {
    const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`không đọc được ${doctype} ${name} (HTTP ${response.status})`);
    return ((await response.json()) as { data?: Record<string, unknown> }).data ?? null;
  })();
  cache.set(key, pending);
  // Lỗi mạng thì BỎ khỏi bộ nhớ tạm: giữ lại một lời hứa đã hỏng nghĩa là mọi bộ kiểm sau
  // trong cùng lượt đều hỏng theo, dù lần thử lại có thể thành công.
  pending.catch(() => cache.delete(key));
  return pending;
}

/**
 * Đọc TRƯỚC, song song, mọi bản ghi mà ba bộ kiểm sắp cần.
 *
 * Bộ nhớ tạm ở trên bỏ được các lượt đọc TRÙNG, nhưng không đổi được việc chúng nối đuôi
 * nhau: kiểm dòng hàng đọc Item xong mới tới kiểm quy cách đọc Measurement Profile, xong mới
 * tới kiểm màu đọc Item Color. Ba đợt chờ, mỗi đợt hai chặng mạng (app → cổng → tenant).
 *
 * Ở đây gom lại còn HAI đợt: Item và Item Color không phụ thuộc nhau nên đi cùng lúc; chỉ
 * Measurement Profile mới phải đợi, vì tên profile nằm trong chính bản ghi Item.
 *
 * Cố ý KHÔNG `await` kết quả: `readMaster` nhớ lời hứa, nên khi từng bộ kiểm hỏi tới thì
 * lượt gọi đã đang bay rồi. Lỗi ở đây cũng nuốt luôn — bộ kiểm thật sẽ gặp lại và báo bằng
 * câu chữ của nó, còn ném từ đây thì mất mất thông tin dòng nào hỏng.
 */
export async function warmMasters(call: PlatformCall, doc: Record<string, unknown>): Promise<void> {
  const rows = Array.isArray(doc.items)
    ? doc.items.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  const codes = [...new Set(rows.map((row) => String(row.item_code ?? "").trim()).filter(Boolean))];
  const colors = [...new Set([
    ...rows.map((row) => String(row.color ?? row.colour ?? "").trim()),
    String(doc.color ?? doc.colour ?? "").trim(),
  ].filter(Boolean))];

  const items = await Promise.all([
    ...codes.map((code) => readMaster(call, "Item", code).catch(() => null)),
    ...colors.map((name) => readMaster(call, "Item Color", name).catch(() => null)),
  ]);
  const profiles = [...new Set(items
    .map((item) => String(item?.measurement_profile ?? "").trim())
    .filter(Boolean))];
  await Promise.all(profiles.map((name) => readMaster(call, "Measurement Profile", name).catch(() => null)));
}

/**
 * Một lượt đọc cho cả chứng từ. Không đọc từng policy theo từng dòng: đơn 40 cửa mà làm vậy
 * sẽ vừa chậm vừa có thể thấy hai phiên bản chính sách khác nhau giữa đầu và cuối vòng lặp.
 */
/**
 * Bảng bản lá của tenant. Đọc hỏng hoặc danh mục rỗng ⇒ trả bảng rỗng, và `slatCount` lùi về
 * hạt giống biên dịch sẵn — hai bên sinh ra từ cùng một nguồn và có chốt chặn trong máy sinh
 * brief giữ chúng khớp nhau, nên lùi về là an toàn chứ không phải đoán.
 */
export async function readSlatCatalog(call: PlatformCall): Promise<SlatProfileTable> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["ma", "buoc_la_m", "tru_mot_la", "disabled"]),
    limit_page_length: "200",
  });
  const response = await call(`resource/${encodeURIComponent("Quy cách cửa")}?${query}`).catch(() => null);
  if (!response?.ok) return {};
  const rows = ((await response.json()) as { data?: SlatCatalogRow[] }).data ?? [];
  return slatProfilesFromCatalog(rows);
}

export async function readDoorPolicies(call: PlatformCall): Promise<DoorFormulaPolicy[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify([
      // `ray_type` PHẢI có trong danh sách này: nó tham gia khoá chọn chính sách. Thiếu nó
      // thì mọi chính sách đọc về đều không mang loại ray, và một đơn khai ray sẽ không khớp
      // được chính sách nào — hỏng cả U75 lẫn U100, không riêng loại thiếu dữ liệu.
      "policy_name", "door_type", "item_group", "ray_type",
      "dealer_width_basis", "retail_width_basis",
      "dealer_cut_deduction_m", "retail_cut_deduction_m", "butterfly_cut_deduction_m",
      "dealer_split_sales_basis", "dealer_full_sales_basis", "retail_sales_basis", "manual_pull_sales_basis",
      "purchase_formula", "purchase_height_basis", "purchase_width_basis",
      "priority", "disabled", "note",
    ]),
    limit_page_length: "100",
  });
  const response = await call(`resource/Cutting%20Policy?${query}`);
  if (!response.ok) return [];
  const rows = ((await response.json()) as { data?: Array<Record<string, unknown>> }).data ?? [];
  return rows.map(parseDoorPolicy);
}

/** Ray/trục bán theo mét không mang mã màu và không được chặn khi để trống màu. */
function isColorlessLinearItem(item: Record<string, unknown>): boolean {
  const name = String(item.item_name ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
  const code = String(item.item_code ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
  return name.startsWith("ray") || code.includes("ray")
    || name.startsWith("trục") || name.startsWith("truc")
    || code.includes("trục") || code.includes("truc");
}

async function assertActiveColors(
  call: PlatformCall,
  colors: string[],
  context: string,
): Promise<Response | null> {
  const unique = [...new Set(colors.filter(Boolean))];
  const masters = await Promise.all(unique.map(async (color) => [color, await readMaster(call, "Item Color", color)] as const));
  for (const [color, master] of masters) {
    if (!master) return refuse(`${context}: mã màu ${color} không tồn tại.`);
    if (checked(master.disabled)) return refuse(`${context}: mã màu ${color} đã ngừng dùng.`);
  }
  return null;
}

/**
 * Khóa các mối quan hệ cốt lõi của Item ở server.
 *
 * `save` gửi PATCH nên phải ghép với bản hiện có trước khi kiểm tra. Nếu chỉ nhìn payload,
 * một lần sửa mô tả sẽ bị hiểu nhầm là Item không có nhóm/UOM; tệ hơn, một lần đổi riêng
 * `inventory_mode` có thể lọt vì bộ quy cách nằm ở bản cũ không được nhìn thấy.
 */
export async function validateItemMaster(call: PlatformCall, subject: ValidatorSubject): Promise<Response> {
  const current = subject.action === "save" ? await readMaster(call, "Item", subject.name) : null;
  const doc = { ...(current ?? {}), ...(subject.payload ?? {}) };
  const code = String(doc.item_code ?? subject.name ?? "").trim();
  const groupName = String(doc.item_group ?? "").trim();
  const nature = String(doc.item_nature ?? "").trim();
  const stage = String(doc.material_stage ?? "").trim();
  const supply = String(doc.supply_type ?? "").trim();
  const mode = String(doc.inventory_mode ?? "Hàng thường").trim() || "Hàng thường";
  const stockUom = String(doc.stock_uom ?? "").trim();

  if (!code || !groupName) return refuse("Mặt hàng phải có mã và Nhóm hàng.");
  const group = await readMaster(call, "Item Group", groupName);
  if (!group) return refuse(`Nhóm hàng ${groupName} không tồn tại hoặc đã ngừng dùng.`);
  if (checked(group.is_group)) return refuse(`Nhóm hàng ${groupName} là nhóm chứa; hãy chọn một nhóm lá.`);

  if (!["Hàng tồn kho", "Dịch vụ", "Tài sản"].includes(nature)) {
    return refuse(`${code}: cần chọn đúng Bản chất mặt hàng.`);
  }
  if (nature === "Dịch vụ") {
    if (checked(doc.is_stock_item)) return refuse(`${code}: dịch vụ không được bật Quản lý tồn kho.`);
    if (mode !== "Hàng thường" || doc.measurement_profile) {
      return refuse(`${code}: dịch vụ không dùng kiểu quản lý tồn hoặc bộ quy cách kho.`);
    }
    if (checked(doc.has_batch_no) || checked(doc.has_serial_no)) {
      return refuse(`${code}: dịch vụ không theo dõi lô/serial.`);
    }
    return accept();
  }

  if (!checked(doc.is_stock_item)) return refuse(`${code}: hàng tồn kho/tài sản phải bật Quản lý tồn kho.`);
  if (!stockUom) return refuse(`${code}: cần Đơn vị tồn kho.`);
  if (nature === "Hàng tồn kho" && (!stage || !supply)) {
    return refuse(`${code}: cần Giai đoạn vật tư và Nguồn cung.`);
  }

  const profileName = String(doc.measurement_profile ?? "").trim();
  /**
   * BỘ QUY CÁCH ĐƯỢC ĐỌC TRƯỚC, KHÔNG ĐỢI `inventory_mode` CHO PHÉP.
   *
   * `inventory_mode` là ô suy ra TỪ CHÍNH bộ quy cách này. Gõ sai tên bộ (hoặc trỏ vào một bộ
   * đã xoá) thì ô suy ra không tính được và rỗng, rồi `mode` rơi về "Hàng thường", rồi cả khối
   * kiểm dưới đây bị BỎ QUA — mặt hàng lưu thành công với một bộ quy cách không tồn tại và
   * không kiểu tồn nào. Đo ngày 21/08/2026 trên cổng 8810: `measurement_profile:"BO_KHONG_CO"`
   * trả 201.
   *
   * Đó là hình mẫu "luật ngủ im lặng" tệ nhất: người canh cửa hỏi ý kiến chính kẻ nó phải
   * canh. Nên tên bộ được kiểm ĐỘC LẬP, và kiểu tồn thật lấy từ bộ khi ô suy ra chưa kịp có.
   */
  const profile = profileName ? await readMaster(call, "Measurement Profile", profileName) : null;
  if (profileName && !profile) {
    return refuse(`${code}: Bộ quy cách ${profileName} không tồn tại hoặc đã ngừng dùng.`);
  }
  const modeThat = String(doc.inventory_mode ?? "").trim() || String(profile?.inventory_mode ?? "").trim() || "Hàng thường";
  if (modeThat !== "Hàng thường") {
    if (!profileName) return refuse(`${code}: kiểu ${modeThat} phải có Bộ quy cách.`);
    if (String(profile?.inventory_mode ?? "") !== modeThat) {
      return refuse(`${code}: Bộ quy cách ${profileName} không thuộc kiểu ${modeThat}.`);
    }
    /**
     * Bộ quy cách ĐỀ XUẤT đơn vị tồn, không áp đặt — đúng như nhãn của chính trường đó
     * ("Đơn vị tồn đề xuất").
     *
     * Bản trước từ chối lưu khi hai bên lệch nhau, và điều đó khoá cứng hai nhóm hàng thật:
     *   · 117 mã cửa thành phẩm mang ĐVT tồn m² trong khi bộ quy cách đề xuất Bộ — 40% danh
     *     mục không sửa được qua giao diện, chúng vào được là nhờ nạp thẳng vòng qua chỗ này.
     *   · Nan/lá cửa mà chủ xưởng chốt là tồn theo CÂY, trong khi bộ quy cách nhôm đề xuất Kg.
     *
     * Một bộ quy cách phục vụ nhiều mặt hàng có cách đếm khác nhau là chuyện bình thường:
     * cửa Đài Loan tồn theo kg còn nan lá tồn theo cây, cả hai vẫn cùng kiểu "Nhôm cây/lá" vì
     * chúng giống nhau ở CÁCH ĐO (màu, khổ, số cây), không phải ở đơn vị tồn.
     *
     * Thứ vẫn phải chặn nằm ở dưới: mua theo đơn vị khác đơn vị tồn thì bắt buộc có hệ số
     * quy đổi — đó mới là chỗ sai thì lệch sổ kho.
     */
  }

  /**
   * ĐƠN VỊ TÍNH VÀ QUY CÁCH VẬT LIỆU PHẢI CÓ THẬT.
   *
   * Kernel chỉ kiểm đích của trường `Link` khi CHỐT SỔ (`generic-controller.ts`:
   * `if (context.command.action === "submit") await validateReference(...)`), mà toàn bộ danh
   * mục là doctype không chốt sổ — nên mọi liên kết của `Item` đi thẳng vào CSDL không ai hỏi.
   * Đo ngày 21/08/2026: `stock_uom: "DVT_KHONG_CO"` trả 201 và mặt hàng nằm đó, tồn kho tính
   * theo một đơn vị không tồn tại; `material_specification` treo thì Kg/m lý thuyết và chiều
   * dài cây chuẩn không bao giờ tra ra, dự toán mua im lặng thiếu số.
   */
  for (const [fieldname, nhan] of [
    ["stock_uom", "Đơn vị tồn kho"], ["default_purchase_uom", "ĐVT mua mặc định"],
    ["default_sales_uom", "ĐVT bán mặc định"], ["weight_uom", "ĐVT khối lượng"],
  ] as const) {
    const uom = String(doc[fieldname] ?? "").trim();
    if (!uom) continue;
    if (!await readMaster(call, "UOM", uom)) {
      return refuse(`${code}: ${nhan} "${uom}" không tồn tại hoặc đã ngừng dùng.`);
    }
  }
  const specName = String(doc.material_specification ?? "").trim();
  if (specName && !await readMaster(call, "Material Specification", specName)) {
    return refuse(`${code}: Quy cách vật liệu ${specName} không tồn tại hoặc đã ngừng dùng.`);
  }

  const conversions = Array.isArray(doc.uom_conversions) ? doc.uom_conversions : [];
  /**
   * BẢNG QUY ĐỔI ĐƠN VỊ — ba kiểu hỏng lưu được nhưng không bao giờ nổ ra ở đây.
   *
   * Đo ngày 21/08/2026 trên cổng 8810, cả ba đều trả 201:
   *   · hệ số ÂM (-3): `applyUomConversion` nhân thẳng, ra số lượng tồn âm;
   *   · HAI dòng cùng một ĐVT khác hệ số: `factorFromMaster` lấy dòng ĐẦU và im lặng bỏ dòng
   *     sau, nên hai người đọc cùng một mặt hàng ra hai con số khác nhau tuỳ thứ tự dòng;
   *   · dòng quy đổi trỏ vào CHÍNH đơn vị tồn với hệ số ≠ 1 ("1 Cái = 7 Cái"): mâu thuẫn tự
   *     thân, và `resolveFactorMicros` trả 1 trước khi kịp nhìn tới nó nên không ai thấy.
   *
   * HỆ SỐ TRỐNG hoặc 0 VẪN ĐƯỢC LƯU — đó là chốt 2026-08-20 (xem chú thích dưới) và là trạng
   * thái ĐÚNG của 33 mã ray/trục chưa đọc được chiều dài cây chuẩn. Chỗ chặn của nó nằm ở lúc
   * lập chứng từ, không phải lúc khai danh mục.
   */
  /**
   * ĐỔI ĐƠN VỊ TỒN THÌ BẢNG QUY ĐỔI CŨ HẾT HIỆU LỰC — PHẢI KHAI LẠI.
   *
   * Hệ số quy đổi luôn được đọc là "1 <ĐVT> = hệ số × <ĐVT TỒN>". Đổi ĐVT tồn mà giữ nguyên con
   * số là đổi NGHĨA của nó trong im lặng — không lỗi, không cảnh báo, chỉ có sổ kho sai.
   *
   * Đo được ngày 21/08/2026: `RT_TR114_2.1` đổi tồn Kg → Cây lúc 01:37 trong khi dòng
   * `Mét = 4,7` (ghi chú của chính nó: "1 Mét = 4,7 **Kg**") ở nguyên. Đơn `DH-2026-0085` bán
   * 10 Mét bị trừ **47 Cây** thay vì ≈1,7 cây — sai 28 lần. 23/33 mã ray-trục dính cùng một
   * đường. Vá dữ liệu một lượt không ngăn được lượt sau; chốt chặn phải nằm ở đây.
   *
   * Cách khai lại: hoặc gõ hệ số mới theo ĐVT tồn mới, hoặc để 0 (ô trống hợp lệ — xem chốt
   * 2026-08-20 bên dưới) rồi điền khi xưởng đo xong. Cả hai đều là một hành động CÓ Ý THỨC.
   */
  const stockUomCu = String(current?.stock_uom ?? "").trim();
  if (stockUomCu && stockUom && normalizedUom(stockUomCu) !== normalizedUom(stockUom)) {
    const cuTheoUom = new Map<string, unknown>();
    for (const row of (Array.isArray(current?.uom_conversions) ? current.uom_conversions : [])) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const u = normalizedUom((row as Record<string, unknown>).uom);
      if (u) cuTheoUom.set(u, (row as Record<string, unknown>).conversion_factor);
    }
    for (const row of conversions) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const rowUom = String((row as Record<string, unknown>).uom ?? "").trim();
      const heSo = (row as Record<string, unknown>).conversion_factor;
      if (!positive(heSo)) continue;
      if (!cuTheoUom.has(normalizedUom(rowUom))) continue;
      if (Number(cuTheoUom.get(normalizedUom(rowUom))) !== Number(heSo)) continue;
      return refuse(
        `${code}: đang đổi Đơn vị tồn "${stockUomCu}" → "${stockUom}", nhưng hệ số quy đổi của "${rowUom}"`
        + ` vẫn là ${heSo} — con số đó được tính theo "${stockUomCu}" nên bây giờ mang nghĩa khác.`
        + ` Hãy khai lại hệ số theo "${stockUom}", hoặc để trống (0) rồi điền sau khi đo.`,
      );
    }
  }

  const daGapUom = new Set<string>();
  for (let index = 0; index < conversions.length; index += 1) {
    const row = conversions[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return refuse(`${code}: dòng quy đổi ${index + 1} không hợp lệ.`);
    }
    const rowUom = String((row as Record<string, unknown>).uom ?? "").trim();
    if (!rowUom) return refuse(`${code}: dòng quy đổi ${index + 1} chưa chọn Đơn vị tính.`);
    const khoa = normalizedUom(rowUom);
    if (daGapUom.has(khoa)) {
      return refuse(`${code}: bảng quy đổi có hai dòng cùng đơn vị "${rowUom}"; giữ đúng một dòng cho mỗi đơn vị.`);
    }
    daGapUom.add(khoa);
    if (stockUom && khoa === normalizedUom(stockUom)) {
      return refuse(`${code}: không khai dòng quy đổi cho chính đơn vị tồn "${stockUom}" — hệ số của nó luôn là 1.`);
    }
    const heSo = (row as Record<string, unknown>).conversion_factor;
    if (heSo !== undefined && heSo !== null && String(heSo).trim() !== "" && Number(heSo) < 0) {
      return refuse(`${code}: hệ số quy đổi của "${rowUom}" không được âm.`);
    }
    if (!await readMaster(call, "UOM", rowUom)) {
      return refuse(`${code}: đơn vị "${rowUom}" trong bảng quy đổi không tồn tại hoặc đã ngừng dùng.`);
    }
  }
  for (const fieldname of ["default_purchase_uom", "default_sales_uom"]) {
    if (fieldname === "default_purchase_uom" && !checked(doc.is_purchase_item)) continue;
    if (fieldname === "default_sales_uom" && !checked(doc.is_sales_item)) continue;
    const uom = String(doc[fieldname] ?? "").trim();
    if (!uom || uom === stockUom) continue;
    const dynamicSquareMetreToSet = profileName === "Thành phẩm theo m2"
      && ["m2", "m²", "sqm"].includes(normalizedUom(uom))
      && ["bộ", "bo", "set"].includes(normalizedUom(stockUom));
    if (dynamicSquareMetreToSet) continue;
    const converted = conversions.some((row) =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row)
      && String((row as Record<string, unknown>).uom ?? "") === uom
      && positive((row as Record<string, unknown>).conversion_factor));
    /**
     * HỆ SỐ QUY ĐỔI ĐỂ TRỐNG VẪN LƯU ĐƯỢC MẶT HÀNG (chủ dự án chốt 2026-08-20).
     *
     * Trước đây chỗ này TỪ CHỐI lưu. Hệ quả: đang dựng danh mục mà chưa cân thử để biết
     * "1 con bù lon nặng bao nhiêu kg" thì KHÔNG khai nổi mặt hàng — buộc người nhập gõ một số
     * bịa cho qua cửa. Một con số bịa nằm im trong danh mục nguy hiểm hơn một ô trống: ô trống
     * thì nhìn thấy, số bịa thì trông như đã khai và âm thầm nhân sai cả trăm lần (bù lon thật
     * là 0,096 kg/con, số "10" lệch hơn 100 lần).
     *
     * Chỗ chặn THẬT vẫn còn nguyên và nằm đúng chỗ nó phải nằm: khi lập CHỨNG TỪ theo đơn vị đó
     * (xem `ĐVT mặc định … chưa có hệ số quy đổi trên Item` bên dưới) và ở `clouderp-core/uom.ts`
     * (`factor > 0` mới coi là có quy đổi). Tức là khai thiếu thì vẫn không nhập/xuất kho được —
     * chỉ khác ở chỗ lỗi nổ ra lúc DÙNG, không phải lúc KHAI.
     */
    if (!converted) continue;
  }
  return accept();
}

/**
 * Nhôm của xưởng có hai lớp số liệu:
 * - sổ kho và tiền đi theo KG cân thực tế;
 * - cây × chiều dài mô tả hình dáng vật lý để cắt và đối chiếu.
 *
 * Item được đọc lại từ máy chủ, không tin `inventory_mode` do trình duyệt gửi lên. Nhờ đó
 * một lệnh API không thể giả hàng nhôm thành "Hàng thường" để bỏ qua quy cách bắt buộc.
 */
export async function validatePurchaseMeasurement(
  call: PlatformCall,
  subject: ValidatorSubject,
  validatedDoc?: Record<string, unknown>,
): Promise<Response> {
  const doc = validatedDoc ?? await validationDocument(call, subject);
  const rows = Array.isArray(doc.items)
    ? doc.items.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  if (!rows.length) return accept();

  const codes = [...new Set(rows.map((row) => String(row.item_code ?? "").trim()).filter(Boolean))];
  const items = new Map<string, InventoryItem>();
  await Promise.all(codes.map(async (code) => {
    const response = await call(`resource/Item/${encodeURIComponent(code)}`);
    if (!response.ok) {
      throw new Error(`không đọc được mặt hàng ${code} để kiểm tra quy cách (HTTP ${response.status})`);
    }
    const item = ((await response.json()) as { data?: InventoryItem }).data ?? {};
    items.set(code, item);
  }));

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const code = String(row.item_code ?? "").trim();
    if (!code) continue;
    const item = items.get(code);
    if (!item) continue;
    const line = `Dòng ${index + 1} (${code})`;

    /**
     * Cửa/tấm được cân theo diện tích thật, không dùng kg/m của nhôm cây:
     *
     *   TL thực (kg/m²) = Tổng kg ÷ (Cao × Rộng × Số cái/bộ)
     *
     * Tổng kg là tùy chọn với nhóm này; nhưng một khi người dùng đã nhập thì snapshot dẫn
     * xuất phải có và phải khớp. Nhờ vậy gọi API thẳng không thể lưu một TL kg/m² giả khác
     * với bốn số nguồn mà người dùng nhìn thấy trên phiếu.
     */
    const isAreaItem = item.inventory_mode === "Tấm/Kính" || item.inventory_mode === "Thành phẩm theo m2";
    const hasActualWeight = row.actual_weight_kg !== undefined
      && row.actual_weight_kg !== null
      && row.actual_weight_kg !== "";
    if (subject.doctype === "Purchase Receipt" && isAreaItem && hasActualWeight) {
      const totalKg = Number(row.actual_weight_kg);
      const width = Number(row.width_m);
      const height = Number(row.height_m);
      const pieces = Number(row.set_count);
      if (!Number.isFinite(totalKg) || totalKg <= 0) {
        return refuse(`${line}: Tổng kg thực cân phải lớn hơn 0.`);
      }
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return refuse(`${line}: cần nhập Cao và Rộng lớn hơn 0 để tính TL thực kg/m².`);
      }
      if (!Number.isFinite(pieces) || pieces <= 0) {
        return refuse(`${line}: Số cái/bộ phải lớn hơn 0 để tính TL thực kg/m².`);
      }
      const expected = totalKg / (height * width * pieces);
      const declared = Number(row.actual_kg_per_sqm);
      if (!Number.isFinite(declared) || !nearlyEqual(declared, expected)) {
        return refuse(`${line}: TL thực phải là ${expected.toFixed(6)} kg/m² (= ${totalKg} kg ÷ ${height} m ÷ ${width} m ÷ ${pieces} cái/bộ).`);
      }
    }

    if (item.inventory_mode !== "Nhôm cây/lá") continue;
    const stamped = String(row.is_stamped ?? "").trim();
    if (stamped !== "Có" && stamped !== "Không") {
      return refuse(`${line}: cần chọn Dập là Có hoặc Không.`);
    }
    if (subject.doctype === "Purchase Order") {
      const specificationName = String(item.material_specification ?? "").trim();
      if (!specificationName) {
        return refuse(`${line}: mặt hàng chưa có định mức kg/m để lập đơn đặt hàng.`);
      }
      const specification = await readMaster(call, "Material Specification", specificationName);
      const kgPerM = Number(specification?.theoretical_kg_per_m);
      const length = Number(row.length_m);
      const bars = Number(row.qty_bar);
      if (!Number.isFinite(kgPerM) || kgPerM <= 0) {
        return refuse(`${line}: định mức kg/m của ${specificationName} chưa hợp lệ.`);
      }
      if (!Number.isFinite(length) || length <= 0) {
        return refuse(`${line}: cần nhập kích thước/chiều dài lớn hơn 0.`);
      }
      if (!Number.isFinite(bars) || bars <= 0) {
        return refuse(`${line}: cần nhập số cây/lá lớn hơn 0.`);
      }
      const expected = length * kgPerM * bars;
      const declaredBarem = Number(row.theoretical_kg);
      const declaredQty = Number(row.qty);
      const declaredRate = Number(row.rate);
      const declaredAmount = Number(row.amount);
      if (!Number.isFinite(declaredBarem) || !nearlyEqual(declaredBarem, expected)
        || !Number.isFinite(declaredQty) || !nearlyEqual(declaredQty, expected)) {
        return refuse(`${line}: số kg barem phải là ${expected.toFixed(6)} kg (= ${length} m × ${kgPerM} kg/m × ${bars} cây/lá).`);
      }
      if (!Number.isFinite(declaredRate) || declaredRate < 0) {
        return refuse(`${line}: đơn giá theo Kg không hợp lệ.`);
      }
      const expectedAmount = expected * declaredRate;
      if (!Number.isFinite(declaredAmount) || !nearlyEqual(declaredAmount, expectedAmount)) {
        return refuse(`${line}: thành tiền phải là ${expectedAmount.toFixed(0)} (= ${expected.toFixed(6)} kg barem × ${declaredRate}).`);
      }
      continue;
    }
    /**
     * TIỀN luôn theo Kg thực cân — đây là điều không đổi, vì hoá đơn nhà cung cấp ghi Kg và
     * phiếu giao có cột Kg do chính họ cân.
     *
     * TỒN thì tuỳ mặt hàng. Chủ xưởng chốt ngày 2026-07-29: nan/lá cửa tồn theo CÂY (thợ đếm
     * lá, không cân kg), còn cửa Đài Loan và một số mã khác vẫn tồn theo Kg. Bản trước ép cứng
     * "nhôm phải tồn theo Kg" nên nửa danh mục không khai đúng được.
     */
    if (String(row.uom ?? "") !== "Kg") {
      return refuse(`${line}: nhôm phải nhập theo Kg; số cây và chiều dài chỉ là quy cách vật lý.`);
    }
    if (!positive(row.qty)) return refuse(`${line}: cần nhập số Kg thực cân lớn hơn 0.`);
    if (!positive(row.length_m)) return refuse(`${line}: cần nhập chiều dài một cây/lá lớn hơn 0.`);
    if (!positive(row.qty_bar)) return refuse(`${line}: cần nhập số cây/lá lớn hơn 0.`);

    const declared = row.conversion_factor === undefined || row.conversion_factor === null || row.conversion_factor === ""
      ? undefined
      : Number(row.conversion_factor);
    if (item.stock_uom === "Kg") {
      // Nhập Kg, tồn Kg: hệ số phải là 1. Khai khác đi là tự nhân số kg lên khi vào sổ.
      if (declared !== undefined && (!Number.isFinite(declared) || declared !== 1)) {
        return refuse(`${line}: mặt hàng tồn theo Kg thì hệ số quy đổi phải bằng 1 vì số lượng đã là Kg thực cân.`);
      }
      continue;
    }
    /**
     * Nhập Kg mà tồn theo CÂY thì hệ số đổi theo TỪNG LÔ, không cố định trên mặt hàng: cùng
     * một mã, phiếu Tiến Đạt ngày 22/7 có ba dòng dài 8,50 · 7,20 · 6,60 m nên số cây trên một
     * kg khác nhau ở cả ba.
     *
     * Nhưng dòng chứng từ đã mang sẵn cả hai con số cần thiết — số Kg và số cây — nên hệ số
     * suy ra được và phải KHỚP với chúng. Không kiểm chỗ này thì 191,4 kg vào sổ thành 191,4
     * cây: sai gần tám mươi lần, chứng từ vẫn lưu thành công, và chỉ lộ ra lúc kiểm kho.
     */
    const expected = Number(row.qty_bar) / Number(row.qty);
    if (declared === undefined) {
      return refuse(`${line}: mặt hàng tồn theo ${item.stock_uom} mà nhập theo Kg — dòng phải có hệ số quy đổi (${expected.toFixed(6)} theo số cây và số kg đã nhập).`);
    }
    if (!Number.isFinite(declared) || declared <= 0 || Math.abs(declared - expected) > Math.max(1e-6, expected * 1e-4)) {
      return refuse(`${line}: hệ số quy đổi phải là ${expected.toFixed(6)} (= ${row.qty_bar} cây ÷ ${row.qty} kg), đang khai ${row.conversion_factor}.`);
    }
  }
  return accept();
}

export async function validationDocument(
  call: PlatformCall,
  subject: ValidatorSubject,
): Promise<Record<string, unknown>> {
  if (subject.action === "create") return subject.payload ?? {};
  const current = await readMaster(call, subject.doctype, subject.name);
  return { ...(current ?? {}), ...(subject.payload ?? {}) };
}

type TransactionSide = "purchase" | "sales";

export function normalizedUom(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
}

const SALES_AREA_UOMS = new Set(["m2", "m²", "sqm"]);
const SALES_METRE_UOMS = new Set(["m", "mét", "met", "meter", "metre"]);
const SALES_SET_UOMS = new Set(["bộ", "bo", "set"]);
const SALES_PIECE_UOMS = new Set(["cây", "cay", "lá", "la", "đoạn", "doan"]);

type LinearSalesBasis = "RAY" | "TRUC";

/** Ray/trục dùng kích thước công trình để tính mét bán, kể cả khi Item vẫn tồn Hàng thường. */
export function deriveLinearSalesBasis(item: { item_name?: unknown; item_code?: unknown }): LinearSalesBasis | undefined {
  const itemName = String(item.item_name ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
  const itemCode = String(item.item_code ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
  if (itemName.startsWith("ray") || itemCode.includes("ray")) return "RAY";
  if (itemName.startsWith("trục") || itemName.startsWith("truc")
    || itemCode.includes("trục") || itemCode.includes("truc")) return "TRUC";
  return undefined;
}

function isWidthQuantitySalesItem(item: { item_name?: unknown; item_code?: unknown }): boolean {
  const itemName = String(item.item_name ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
  const itemCode = String(item.item_code ?? "").normalize("NFC").trim().toLocaleLowerCase("vi").replace(/[ _-]+/g, "");
  return itemName.includes("bộ ba lá đáy")
    || itemName === "lá đầu"
    || itemCode.includes("bo3laday")
    || itemCode === "tpa282"
    || itemCode.includes("ladau");
}

function isOrdinaryQuantitySalesItem(item: {
  item_name?: unknown;
  item_code?: unknown;
  inventory_mode?: unknown;
  measurement_profile?: unknown;
}): boolean {
  const inventoryMode = String(item.inventory_mode ?? "").normalize("NFC").trim() || "Hàng thường";
  return inventoryMode === "Hàng thường"
    && normalizedUom(item.measurement_profile) !== normalizedUom("Thành phẩm theo m2")
    && !deriveLinearSalesBasis(item)
    && !isWidthQuantitySalesItem(item);
}

export function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(0.000001, Math.abs(right) * 0.000001);
}

type TransactionQuantityState = [expectedFactor: number, expectedStockQuantity: number];

function calculateDoorBillableArea(
  row: Record<string, unknown>,
  item: InventoryItem,
  doorType: NonNullable<ReturnType<typeof inferDoorType>>,
  customerGroup: string,
  doorPolicies: DoorFormulaPolicy[],
  width: number,
  height: number,
  sets: number,
  line: string,
): Response | number {
  if (customerGroup !== "Đại lý" && customerGroup !== "Lẻ") {
    return refuse(`${line}: khách hàng chưa có Nhóm giá Đại lý/Lẻ; không thể chọn đúng công thức đo và cắt.`);
  }
  const rawSalesMode = String(row.sales_mode ?? "Trọn bộ").trim();
  if (rawSalesMode !== "Tách món" && rawSalesMode !== "Trọn bộ") {
    return refuse(`${line}: Cách bán phải là Tách món hoặc Trọn bộ.`);
  }
  try {
    // `ray_type` của DÒNG BÁN tham gia chọn chính sách: U75 và U100 có hai bộ hằng số trừ
    // khác nhau (cutting-policy.md §2.1). Trước đây trường này có trên dòng nhưng không ai
    // đọc, nên đơn U100 lặng lẽ ăn hằng số U75.
    const policy = selectDoorPolicy(doorPolicies, doorType, String(item.item_group ?? ""), rayTypeOf(row.ray_type));
    const calculated = calculateDoorFormula(policy, {
      door_type: doorType,
      item_group: String(item.item_group ?? ""),
      customer_group: customerGroup as CustomerGroup,
      sales_mode: rawSalesMode as SalesMode,
      has_butterfly_bracket: checked(row.has_butterfly_bracket),
      is_manual_pull: checked(row.is_manual_pull) || isManualPullGroup(item.item_group),
      measured_width_m: width,
      cover_height_m: height,
      set_count: sets,
      min_area_sqm: Number(item.min_area_sqm ?? 0) || 0,
      purpose: "sales",
    });
    const billable = Number(calculated.billable_area_sqm);
    if (row.formula_policy && String(row.formula_policy) !== calculated.policy_name) {
      return refuse(`${line}: đang chụp chính sách ${row.formula_policy}, đúng phải là ${calculated.policy_name}.`);
    }
    if (row.width_basis && String(row.width_basis) !== calculated.width_basis) {
      return refuse(`${line}: cơ sở rộng phải là ${calculated.width_basis} theo nhóm khách ${customerGroup}.`);
    }
    if (row.cut_width_m != null && row.cut_width_m !== ""
      && !nearlyEqual(Number(row.cut_width_m), calculated.cut_width_m)) {
      return refuse(`${line}: rộng cắt phải là ${calculated.cut_width_m.toFixed(4)} m theo ${calculated.policy_name}.`);
    }
    if (row.billable_area_sqm != null && row.billable_area_sqm !== ""
      && !nearlyEqual(Number(row.billable_area_sqm), billable)) {
      return refuse(`${line}: diện tích chụp trên dòng phải là ${billable.toFixed(6)} m2 theo ${calculated.policy_name}.`);
    }
    return billable;
  } catch (error) {
    return refuse(`${line}: ${error instanceof Error ? error.message : "không tính được công thức cửa"}`);
  }
}

function validateAreaTransactionQuantity(
  row: Record<string, unknown>,
  item: InventoryItem,
  side: TransactionSide,
  selected: string,
  mode: string,
  quantity: number,
  customerGroup: string,
  doorPolicies: DoorFormulaPolicy[],
  dynamicSquareMetreToSet: boolean,
  initialExpectedFactor: number,
  initialExpectedStockQuantity: number,
  line: string,
): Response | TransactionQuantityState {
  let expectedFactor = initialExpectedFactor;
  let expectedStockQuantity = initialExpectedStockQuantity;
  if (mode !== "Thành phẩm theo m2") return [expectedFactor, expectedStockQuantity];

  const sets = Number(row.set_count ?? 1);
  if (!Number.isFinite(sets) || sets <= 0) return refuse(`${line}: Số cái/bộ phải lớn hơn 0.`);
  if (!SALES_AREA_UOMS.has(selected)) {
    if (SALES_SET_UOMS.has(selected) && !nearlyEqual(quantity, sets)) {
      return refuse(`${line}: bán theo Bộ thì số lượng tính tiền phải bằng số bộ.`);
    }
    return [expectedFactor, expectedStockQuantity];
  }

  const width = Number(row.width_m);
  const height = Number(row.height_m);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return refuse(`${line}: hàng tính m2 phải có rộng và cao lớn hơn 0.`);
  }
  const doorType = side === "sales" ? inferDoorType(item.door_type, item.item_group) : null;
  let billable: number;
  if (doorType) {
    const doorBillable = calculateDoorBillableArea(
      row, item, doorType, customerGroup, doorPolicies, width, height, sets, line,
    );
    if (doorBillable instanceof Response) return doorBillable;
    billable = doorBillable;
  } else {
    billable = Math.max(width * height, Number(item.min_area_sqm ?? 0) || 0) * sets;
  }
  if (!nearlyEqual(quantity, billable)) {
    return refuse(`${line}: SL tính tiền phải là ${billable.toFixed(6)} m2 theo kích thước và diện tích tối thiểu của Item.`);
  }
  if (dynamicSquareMetreToSet) {
    expectedFactor = sets / quantity;
    expectedStockQuantity = sets;
  }
  return [expectedFactor, expectedStockQuantity];
}

function validateOrdinarySalesQuantity(
  row: Record<string, unknown>, quantity: number, line: string,
): Response | null {
  const enteredCount = Number(row.set_count ?? quantity);
  if (!Number.isFinite(enteredCount) || enteredCount <= 0) return refuse(`${line}: Số lượng phải lớn hơn 0.`);
  if (!nearlyEqual(quantity, enteredCount)) return refuse(`${line}: Khối lượng phải bằng Số lượng (${enteredCount}).`);
  return null;
}

function validateWidthSalesQuantity(
  row: Record<string, unknown>, quantity: number, line: string,
): Response | null {
  const width = Number(row.width_m);
  const quantityUnits = Number(row.set_count ?? 1);
  if (!Number.isFinite(width) || width <= 0) return refuse(`${line}: Bộ 3 lá đáy/Lá đầu cần nhập Rộng lớn hơn 0.`);
  if (!Number.isFinite(quantityUnits) || quantityUnits <= 0) return refuse(`${line}: cần nhập Số lượng lớn hơn 0.`);
  const billableLength = width * quantityUnits;
  if (!nearlyEqual(quantity, billableLength)) {
    return refuse(`${line}: SL tính tiền phải là ${billableLength.toFixed(6)} Mét = Rộng × Số lượng.`);
  }
  return null;
}

function validateLinearSalesQuantity(
  row: Record<string, unknown>, quantity: number, linearBasis: LinearSalesBasis, line: string,
): Response | null {
  const dimension = Number(linearBasis === "RAY" ? row.height_m : row.width_m);
  const quantityUnits = Number(row.set_count);
  if (!Number.isFinite(dimension) || dimension <= 0) {
    return refuse(`${line}: ${linearBasis === "RAY" ? "Ray cần nhập Cao" : "Trục cần nhập Rộng"} lớn hơn 0.`);
  }
  if (!Number.isFinite(quantityUnits) || quantityUnits <= 0) return refuse(`${line}: cần nhập Số lượng lớn hơn 0.`);
  const billableLength = dimension * quantityUnits;
  if (!nearlyEqual(quantity, billableLength)) {
    return refuse(`${line}: SL tính tiền phải là ${billableLength.toFixed(6)} Mét = ${linearBasis === "RAY" ? "Cao" : "Rộng"} × Số lượng.`);
  }
  return null;
}

function validateAluminiumMetreSalesQuantity(
  row: Record<string, unknown>, quantity: number, line: string,
): Response | null {
  const length = Number(row.length_m);
  const pieces = Number(row.qty_bar);
  if (!Number.isFinite(length) || length <= 0) return refuse(`${line}: bán theo Mét phải nhập chiều dài một cây/đoạn lớn hơn 0.`);
  if (!Number.isFinite(pieces) || pieces <= 0) return refuse(`${line}: bán theo Mét phải nhập số cây/đoạn lớn hơn 0.`);
  const billableLength = length * pieces;
  if (!nearlyEqual(quantity, billableLength)) {
    return refuse(`${line}: SL tính tiền phải là ${billableLength.toFixed(6)} Mét = chiều dài × số cây/đoạn.`);
  }
  return null;
}

function validateAluminiumPieceSalesQuantity(
  row: Record<string, unknown>, quantity: number, uom: string, line: string,
): Response | null {
  const pieces = Number(row.qty_bar);
  if (!Number.isFinite(pieces) || pieces <= 0) return refuse(`${line}: bán theo ${uom} phải nhập số cây/lá/đoạn lớn hơn 0.`);
  if (!nearlyEqual(quantity, pieces)) return refuse(`${line}: SL tính tiền theo ${uom} phải bằng số cây/lá/đoạn (${pieces}).`);
  return null;
}

function validateSalesTransactionQuantity(
  row: Record<string, unknown>,
  side: TransactionSide,
  mode: string,
  selected: string,
  uom: string,
  quantity: number,
  ordinaryQuantityItem: boolean,
  widthQuantityItem: boolean,
  linearBasis: LinearSalesBasis | undefined,
  line: string,
): Response | null {
  if (side !== "sales") return null;
  if (ordinaryQuantityItem) return validateOrdinarySalesQuantity(row, quantity, line);
  if (widthQuantityItem && SALES_METRE_UOMS.has(selected)) return validateWidthSalesQuantity(row, quantity, line);
  if (linearBasis && SALES_METRE_UOMS.has(selected)) return validateLinearSalesQuantity(row, quantity, linearBasis, line);
  if (mode !== "Nhôm cây/lá") return null;
  if (SALES_METRE_UOMS.has(selected)) return validateAluminiumMetreSalesQuantity(row, quantity, line);
  if (SALES_PIECE_UOMS.has(selected)) return validateAluminiumPieceSalesQuantity(row, quantity, uom, line);
  return null;
}

/**
 * One Item contract for the entire purchase/sales chain.
 *
 * The line can choose only a UOM declared by Item. Inventory mode, stock UOM and conversion
 * are master data, not user input. Quantity remains the commercial quantity; stock quantity is
 * a separate snapshot used by the ledger.
 */
/**
 * Trả về TÊN LOẠI CỬA khi dòng bán bắt buộc Cao lưới mà ô đó còn trống; "" nếu không bắt.
 *
 * Không tự chọn danh sách loại cửa: hỏi thẳng `purchase_height_basis` của Cutting Policy, để
 * xưởng đổi chính sách trong dữ liệu là phép kiểm đi theo, không phải sửa mã. Không chọn được
 * chính sách thì im lặng nhường — phép kiểm chính ở dưới sẽ báo đúng lỗi chính sách.
 */
function meshHeightMissing(
  row: Record<string, unknown>,
  item: InventoryItem,
  doorPolicies: DoorFormulaPolicy[],
): string {
  const doorType = inferDoorType(item.door_type, item.item_group);
  if (!doorType) return "";
  let policy: DoorFormulaPolicy;
  try {
    policy = selectDoorPolicy(doorPolicies, doorType, String(item.item_group ?? ""), rayTypeOf(row.ray_type));
  } catch {
    return "";
  }
  if (policy.purchase_height_basis !== "Cao lưới") return "";
  const mesh = Number(row.mesh_height_m);
  return Number.isFinite(mesh) && mesh > 0 ? "" : doorType;
}

export async function validateTransactionLines(
  call: PlatformCall,
  subject: ValidatorSubject,
  side: TransactionSide,
  validatedDoc?: Record<string, unknown>,
): Promise<Response> {
  const doc = validatedDoc ?? await validationDocument(call, subject);
  const rows = Array.isArray(doc.items)
    ? doc.items.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  if (!rows.length) return accept();
  const codes = [...new Set(rows.map((row) => String(row.item_code ?? "").trim()).filter(Boolean))];
  const declaredCustomerGroup = String(doc.customer_group ?? "").trim();
  const customerName = String(doc.customer ?? "").trim();
  /**
   * Item, bộ chính sách và hồ sơ khách độc lập nên đọc song song. Validator có ngân sách hai
   * giây; xếp ba lượt này nối đuôi sẽ biến một phép kiểm đúng thành timeout trên đơn nhiều dòng.
   */
  const [pairs, doorPolicies, customer, persistedDocument] = await Promise.all([
    Promise.all(codes.map(async (code) => [code, await readMaster(call, "Item", code) as InventoryItem | null] as const)),
    side === "sales" ? readDoorPolicies(call) : Promise.resolve([]),
    side === "sales" && customerName
      ? readMaster(call, "Customer", customerName)
      : Promise.resolve(null),
    side === "sales" && subject.action !== "create"
      ? readMaster(call, subject.doctype, subject.name)
      : Promise.resolve(null),
  ]);
  const items = new Map(pairs);
  const persistedCustomer = String(persistedDocument?.customer ?? "").trim();
  const persistedCustomerGroup = String(persistedDocument?.customer_group ?? "").trim();
  const masterCustomerGroup = String(customer?.price_group ?? customer?.customer_group ?? "").trim();
  // Hồ sơ khách là mặc định, còn Nhóm giá trên đơn là snapshot nghiệp vụ được phép chọn lại.
  // Với payload cũ không gửi group, giữ snapshot đã lưu rồi mới rơi về master khách.
  const customerGroup = declaredCustomerGroup
    || (persistedCustomer === customerName ? persistedCustomerGroup : "")
    || masterCustomerGroup;
  if (side === "sales" && customerName) {
    if (!customer) return refuse(`Khách hàng ${customerName} không tồn tại hoặc đã ngừng dùng.`);
    if (customerGroup !== "Đại lý" && customerGroup !== "Lẻ") {
      if (!customerGroup) return refuse(`Khách hàng ${customerName} chưa có Nhóm giá Đại lý/Lẻ.`);
      return refuse(`Nhóm giá "${customerGroup || "(trống)"}" không hợp lệ; hãy chọn Đại lý hoặc Lẻ.`);
    }
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const code = String(row.item_code ?? "").trim();
    if (!code) continue;
    const item = items.get(code);
    const line = `Dòng ${index + 1} (${code})`;
    if (!item) return refuse(`${line}: mặt hàng không tồn tại hoặc đã ngừng dùng.`);
    if (side === "purchase" && item.is_purchase_item !== undefined && !checked(item.is_purchase_item)) {
      return refuse(`${line}: Item không được phép mua.`);
    }
    if (side === "sales" && item.is_sales_item !== undefined && !checked(item.is_sales_item)) {
      return refuse(`${line}: Item không được phép bán.`);
    }
    /**
     * Cao lưới là số đo ĐỘC LẬP, không suy được từ Cao phủ bì. Ba loại cửa có
     * `Cutting Policy.purchase_height_basis = "Cao lưới"` (Cửa Lưới, Cửa Đài Loan, Cửa Siêu
     * Trường) tính Kg nhôm theo chiều cao đó, nên thiếu ô này thì phát lệnh sản xuất vỡ với
     * "Cao lưới phải lớn hơn 0" — sau khi đã hứa ngày giao với khách.
     *
     * Chặn ở GHI SỔ ĐƠN BÁN chứ không ở báo giá: lúc báo giá người bán chưa ra tận nơi đo,
     * và bắt buộc từ đó là chặn đúng cái việc mà màn báo giá sinh ra để làm.
     */
    if (side === "sales" && subject.doctype === "Sales Order" && subject.action === "submit") {
      const missing = meshHeightMissing(row, item, doorPolicies);
      if (missing) {
        return refuse(`${line}: ${missing} tính vật tư theo Cao lưới; hãy nhập ô "Cao lưới (m)" trước khi ghi sổ đơn.`);
      }
    }

    const stockUom = String(item.stock_uom ?? "").trim();
    const defaultUom = String(side === "purchase" ? item.default_purchase_uom ?? "" : item.default_sales_uom ?? "").trim();
    const uom = String(row.uom ?? (defaultUom || stockUom)).trim();
    const inventoryMode = String(item.inventory_mode ?? "").trim();
    const measurementProfile = String(item.measurement_profile ?? "").trim();
    const mode = [inventoryMode, measurementProfile]
      .some((value) => normalizedUom(value) === normalizedUom("Thành phẩm theo m2"))
      ? "Thành phẩm theo m2"
      : inventoryMode || "Hàng thường";
    const linearBasis = side === "sales" ? deriveLinearSalesBasis(item) : undefined;
    const widthQuantityItem = side === "sales" ? isWidthQuantitySalesItem(item) : false;
    const ordinaryQuantityItem = side === "sales" ? isOrdinaryQuantitySalesItem(item) : false;
    const selected = normalizedUom(uom);
    if (side === "purchase" && mode === "Nhôm cây/lá" && selected !== "kg") {
      return refuse(`${line}: nhôm cây/lá phải nhập theo Kg; số cây và chiều dài chỉ là quy cách đối chiếu.`);
    }
    /**
     * m2 ↔ Bộ của hàng "Thành phẩm theo m2" là hệ số ĐỘNG, suy từ rộng × cao của từng dòng,
     * nên đúng theo thiết kế là KHÔNG có hệ số tĩnh nào trên Item.
     *
     * Phải xét riêng cho từng đơn vị, chứ không dùng chung một cờ tính theo đơn vị ĐANG CHỌN.
     * Trước đây cờ này tính từ `uom` của dòng rồi lại đem miễn trừ cho phép kiểm `defaultUom`:
     * bán đúng theo đơn vị kho ("Bộ", hệ số 1, hoàn toàn hợp lệ) thì cờ tắt, và dòng bị chặn vì
     * một đơn vị MẶC ĐỊNH mà nó không hề dùng — "ĐVT mặc định m2 chưa có hệ số quy đổi trên Item".
     * Hậu quả: mọi mặt hàng cửa (đều để `default_sales_uom = m2`) không lập nổi đơn bán,
     * kéo theo không tạo được Yêu cầu sản xuất lẫn Lệnh sản xuất từ đơn.
     */
    const dynamicAreaToSet = (candidate: string): boolean =>
      measurementProfile === "Thành phẩm theo m2"
      && SALES_AREA_UOMS.has(normalizedUom(candidate))
      && SALES_SET_UOMS.has(normalizedUom(stockUom));
    const dynamicSquareMetreToSet = dynamicAreaToSet(uom);
    const factors = new Map<string, number>();
    if (stockUom) factors.set(stockUom, 1);
    for (const conversion of item.uom_conversions ?? []) {
      const name = String(conversion?.uom ?? "").trim();
      const factor = Number(conversion?.conversion_factor);
      if (name && Number.isFinite(factor) && factor > 0) factors.set(name, factor);
    }
    if (defaultUom && !factors.has(defaultUom) && !dynamicAreaToSet(defaultUom)) {
      return refuse(`${line}: ĐVT mặc định ${defaultUom} chưa có hệ số quy đổi trên Item.`);
    }
    if (uom && !factors.has(uom) && !dynamicSquareMetreToSet) {
      return refuse(`${line}: ĐVT ${uom} chưa được Item cho phép.`);
    }
    // Draft/partial payloads can be validated again by the authoritative document controller.
    // When qty is present, however, all derived quantities below must be exact.
    if (row.qty === undefined || row.qty === null || row.qty === "") continue;
    const quantity = Number(row.qty);
    if (!Number.isFinite(quantity) || quantity <= 0) return refuse(`${line}: số lượng phải lớn hơn 0.`);
    let expectedFactor = uom ? factors.get(uom) ?? 1 : 1;
    let expectedStockQuantity = quantity * expectedFactor;
    const areaQuantity = validateAreaTransactionQuantity(
      row, item, side, selected, mode, quantity, customerGroup, doorPolicies,
      dynamicSquareMetreToSet, expectedFactor, expectedStockQuantity, line,
    );
    if (areaQuantity instanceof Response) return areaQuantity;
    [expectedFactor, expectedStockQuantity] = areaQuantity;
    const salesQuantityError = validateSalesTransactionQuantity(
      row, side, mode, selected, uom, quantity, ordinaryQuantityItem, widthQuantityItem, linearBasis, line,
    );
    if (salesQuantityError) return salesQuantityError;
    /**
     * Nhôm mua theo Kg mà tồn theo CÂY: hệ số đến từ chính DÒNG, không từ hồ sơ mặt hàng.
     *
     * Bảng quy đổi trên Item chỉ chứa được một hệ số cố định cho mỗi đơn vị, mà số cây trên
     * một kg đổi theo chiều dài từng lô — phiếu Tiến Đạt ngày 22/7 có ba dòng cùng mã A282 dài
     * 8,50 · 7,20 · 6,60 m, ba hệ số khác nhau. Ép theo hồ sơ mặt hàng thì mọi phiếu nhập nhôm
     * đều bị từ chối.
     *
     * Con số này KHÔNG được thả tự do: `validateAluminium` ở trên đã buộc nó khớp
     * `số cây ÷ số kg` của chính dòng đó.
     */
    const lotFactorFromLine = side === "purchase" && mode === "Nhôm cây/lá" && normalizedUom(stockUom) !== "kg"
      && positive(row.qty) && positive(row.qty_bar);
    if (lotFactorFromLine) {
      expectedFactor = Number(row.qty_bar) / Number(row.qty);
      expectedStockQuantity = Number(row.qty_bar);
    }
    const declaredFactor = row.conversion_factor === undefined || row.conversion_factor === null || row.conversion_factor === ""
      ? expectedFactor : Number(row.conversion_factor);
    if (!Number.isFinite(declaredFactor) || declaredFactor <= 0 || !nearlyEqual(declaredFactor, expectedFactor)) {
      /*
       * Nói đúng SỐ ĐÓ TỪ ĐÂU RA. Câu cũ luôn ghi "theo Item" kể cả khi số kỳ vọng vừa được
       * suy từ chính dòng (nhánh `lotFactorFromLine` ngay trên), nên người dùng đi sửa danh mục
       * — chỗ không có lỗi — thay vì nhìn vào số cây/số kg của dòng. Đo 23/08/2026: đúng cái
       * câu này làm một đợt test đi lạc.
       */
      const nguon = lotFactorFromLine
        ? `= ${Number(row.qty_bar)} cây ÷ ${Number(row.qty)} ${uom || "đơn vị mua"} của chính dòng này`
        : "theo bảng quy đổi của Item";
      return refuse(`${line}: hệ số quy đổi phải là ${expectedFactor} ${nguon}, không nhập tuỳ ý trên chứng từ.`);
    }
    const stockQuantity = Number(row.stock_qty);
    if (row.stock_qty !== undefined && row.stock_qty !== null && row.stock_qty !== ""
      && (!Number.isFinite(stockQuantity) || !nearlyEqual(stockQuantity, expectedStockQuantity))) {
      return refuse(`${line}: số lượng tồn phải đúng theo Item và quy cách của dòng.`);
    }
  }
  return accept();
}

/**
 * Màu là một chiều của hàng thật, không phải ghi chú.
 *
 * - Màu vật tư quyết định nhóm hàng nào được dùng; phạm vi rỗng là màu dùng chung.
 * - Measurement Profile quyết định chứng từ có bắt buộc chọn màu hay không.
 * - Mọi chứng từ giữ MÃ màu chuẩn; không cho "ghi gần giống" thành một vị trí tồn khác.
 */
export async function validateDocumentColors(
  call: PlatformCall,
  subject: ValidatorSubject,
  validatedDoc?: Record<string, unknown>,
): Promise<Response> {
  const doc = validatedDoc ?? await validationDocument(call, subject);
  const rawLines: Array<{ item_code?: unknown; color?: unknown }> =
    subject.doctype === "Work Order"
      ? [{ item_code: doc.production_item, color: doc.color }]
      : subject.doctype === "Aluminium Lot"
        ? [{ item_code: doc.profile, color: doc.colour }]
        : Array.isArray(doc.items)
          ? doc.items
            .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
            .map((row) => ({ item_code: row.item_code, color: row.color ?? row.colour }))
          : [];
  if (!rawLines.length) return accept();

  const codes = [...new Set(rawLines.map((row) => String(row.item_code ?? "").trim()).filter(Boolean))];
  const itemPairs = await Promise.all(codes.map(async (code) => [code, await readMaster(call, "Item", code)] as const));
  const items = new Map(itemPairs);
  const profileNames = [...new Set(itemPairs
    .map(([, item]) => String(item?.measurement_profile ?? "").trim())
    .filter(Boolean))];
  const profilePairs = await Promise.all(profileNames.map(async (name) => [name, await readMaster(call, "Measurement Profile", name)] as const));
  const profiles = new Map(profilePairs);
  const selectedColors = rawLines.map((row) => String(row.color ?? "").trim()).filter(Boolean);
  const invalidColor = await assertActiveColors(call, selectedColors, subject.doctype);
  if (invalidColor) return invalidColor;

  for (let index = 0; index < rawLines.length; index += 1) {
    const row = rawLines[index]!;
    const code = String(row.item_code ?? "").trim();
    if (!code) continue;
    const item = items.get(code);
    if (!item) return refuse(`Dòng ${index + 1}: mặt hàng ${code} không tồn tại hoặc đã ngừng dùng.`);

    const profileName = String(item.measurement_profile ?? "").trim();
    const profile = profileName ? profiles.get(profileName) : null;
    const mode = String(item.inventory_mode ?? "Hàng thường");
    const required = !isColorlessLinearItem(item) && (subject.doctype === "Aluminium Lot"
      || checked(profile?.require_color)
      || mode === "Nhôm cây/lá"
      || mode === "Thành phẩm theo m2");
    const color = String(row.color ?? "").trim();
    const line = subject.doctype === "Work Order" || subject.doctype === "Aluminium Lot"
      ? `${subject.doctype} (${code})`
      : `Dòng ${index + 1} (${code})`;

    if (required && !color) return refuse(`${line}: cần chọn Mã màu.`);
    if (!color) continue;
    const usage = colorUsageForDoctype(subject.doctype);
    const allowed = await allowedColorNamesForGroup(
      call,
      String(item.item_group ?? ""),
      usage,
    );
    if (!allowed.length) {
      return refuse(`${line}: Nhóm hàng chưa có màu vật tư nào được phép.`);
    }
    if (!allowed.includes(color)) {
      const allowedInternally = await allowedColorNamesForGroup(call, String(item.item_group ?? ""), "internal");
      if (allowedInternally.includes(color) && usage === "sales") {
        return refuse(`${line}: màu ${color} chỉ dùng khi mua hàng, không dùng trên chứng từ bán.`);
      }
      if (allowedInternally.includes(color) && usage === "purchase") {
        return refuse(`${line}: màu ${color} chỉ dùng khi bán hàng, không dùng trên chứng từ mua.`);
      }
      return refuse(`${line}: màu ${color} không áp dụng cho Nhóm hàng ${String(item.item_group ?? "").trim()}.`);
    }
  }
  return accept();
}
