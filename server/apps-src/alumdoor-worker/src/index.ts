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
import { slatCount, australianSlatCount, type AustralianDoor } from "./slats.js";
import { buildRows, extractJson, type OcrRow } from "./ocr.js";
import { syncLotsFromReceipt } from "./lots-from-receipt.js";
import {
  calculateDoorFormula,
  inferDoorType,
  isManualPullGroup,
  parseDoorPolicy,
  selectDoorPolicy,
  type CustomerGroup,
  type DoorFormulaPolicy,
  type DoorFormulaPurpose,
  type SalesMode,
} from "./door-formulas.js";

interface Env {
  INTERNAL_AUTH_SECRET?: string;
  /** Gateway, gọi thẳng script. Xem wrangler.jsonc. */
  PLATFORM?: Fetcher;
  /** Workers AI — chỉ dùng để ĐỌC ẢNH. Không chạm dữ liệu tenant. */
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
}

interface ValidatorSubject {
  doctype: string;
  name: string;
  action: string;
  payload: Record<string, unknown>;
}

export type PlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via: string };

function platformCaller(request: Request, env: Env): PlatformCall {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) {
    const seen = [...request.headers.keys()].filter((k) => k.startsWith("x-cloudforge-")).sort();
    throw new Error(`nền tảng không cấp địa chỉ gọi ngược (nhận được: ${seen.join(", ") || "không có"})`);
  }
  const base = declared.replace(/\/$/, "");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return Object.assign(
    (path: string, init: RequestInit = {}) => {
      const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, {
        ...init,
        headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
      });
      return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
    },
    { via: env.PLATFORM ? "binding" : "fetch" },
  );
}

const answer = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const refuse = (message: string) => new Response(JSON.stringify({ message }), { status: 422, headers: { "content-type": "application/json" } });
const accept = () => answer({ ok: true });

function platformActorIdentity(request: Request): { user_id: string; roles: string[] } {
  const encoded = request.headers.get("x-cloudforge-identity") ?? "";
  if (!encoded) return { user_id: "", roles: [] };
  try {
    const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const json = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const identity = JSON.parse(json) as { actor?: { user_id?: unknown; roles?: unknown } };
    return {
      user_id: typeof identity.actor?.user_id === "string" ? identity.actor.user_id : "",
      roles: Array.isArray(identity.actor?.roles)
        ? identity.actor.roles.filter((role): role is string => typeof role === "string")
        : [],
    };
  } catch {
    return { user_id: "", roles: [] };
  }
}

function platformActorUser(request: Request): string {
  return platformActorIdentity(request).user_id;
}

interface InventoryItem {
  item_code?: string;
  item_group?: string;
  door_type?: string;
  purchase_kg_per_m2?: number;
  inventory_mode?: string;
  stock_uom?: string;
  default_purchase_uom?: string;
  default_sales_uom?: string;
  measurement_profile?: string;
  min_area_sqm?: number;
  is_purchase_item?: unknown;
  is_sales_item?: unknown;
  uom_conversions?: Array<{ uom?: string; conversion_factor?: unknown }>;
  default_color?: string;
  allowed_colors?: Array<{ color?: string }>;
}

function positive(value: unknown): boolean {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
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

async function readMaster(call: PlatformCall, doctype: string, name: string): Promise<Record<string, unknown> | null> {
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
async function warmMasters(call: PlatformCall, doc: Record<string, unknown>): Promise<void> {
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
async function readDoorPolicies(call: PlatformCall): Promise<DoorFormulaPolicy[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify([
      "policy_name", "door_type", "item_group",
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

function colorNames(item: Record<string, unknown>): string[] {
  if (!Array.isArray(item.allowed_colors)) return [];
  return item.allowed_colors
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => String(row.color ?? "").trim())
    .filter(Boolean);
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
async function validateItemMaster(call: PlatformCall, subject: ValidatorSubject): Promise<Response> {
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

  const allowedColors = colorNames(doc);
  const duplicateColors = allowedColors.filter((color, index) => allowedColors.indexOf(color) !== index);
  if (duplicateColors.length) {
    return refuse(`${code}: mã màu ${[...new Set(duplicateColors)].join(", ")} đang bị khai lặp trong Các màu được phép.`);
  }
  const defaultColor = String(doc.default_color ?? "").trim();
  const invalidColor = await assertActiveColors(
    call,
    [...allowedColors, defaultColor].filter(Boolean),
    code,
  );
  if (invalidColor) return invalidColor;
  if (defaultColor && allowedColors.length && !allowedColors.includes(defaultColor)) {
    return refuse(`${code}: Màu mặc định ${defaultColor} chưa nằm trong Các màu được phép.`);
  }

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
  if (mode !== "Hàng thường") {
    if (!profileName) return refuse(`${code}: kiểu ${mode} phải có Bộ quy cách.`);
    const profile = await readMaster(call, "Measurement Profile", profileName);
    if (!profile) return refuse(`${code}: Bộ quy cách ${profileName} không tồn tại hoặc đã ngừng dùng.`);
    if (String(profile.inventory_mode ?? "") !== mode) {
      return refuse(`${code}: Bộ quy cách ${profileName} không thuộc kiểu ${mode}.`);
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

  const conversions = Array.isArray(doc.uom_conversions) ? doc.uom_conversions : [];
  for (const fieldname of ["default_purchase_uom", "default_sales_uom"]) {
    if (fieldname === "default_purchase_uom" && !checked(doc.is_purchase_item)) continue;
    if (fieldname === "default_sales_uom" && !checked(doc.is_sales_item)) continue;
    const uom = String(doc[fieldname] ?? "").trim();
    if (!uom || uom === stockUom) continue;
    const dynamicSquareMetreToSet = mode === "Thành phẩm theo m2"
      && ["m2", "m²", "sqm"].includes(normalizedUom(uom))
      && ["bộ", "bo", "set"].includes(normalizedUom(stockUom));
    if (dynamicSquareMetreToSet) continue;
    const converted = conversions.some((row) =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row)
      && String((row as Record<string, unknown>).uom ?? "") === uom
      && positive((row as Record<string, unknown>).conversion_factor));
    if (!converted) {
      return refuse(`${code}: ${uom} khác ĐVT tồn ${stockUom} nhưng chưa có hệ số quy đổi.`);
    }
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
async function validatePurchaseMeasurement(
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
    if (!item || item.inventory_mode !== "Nhôm cây/lá") continue;

    const line = `Dòng ${index + 1} (${code})`;
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

async function validationDocument(
  call: PlatformCall,
  subject: ValidatorSubject,
): Promise<Record<string, unknown>> {
  if (subject.action === "create") return subject.payload ?? {};
  const current = await readMaster(call, subject.doctype, subject.name);
  return { ...(current ?? {}), ...(subject.payload ?? {}) };
}

type TransactionSide = "purchase" | "sales";

function normalizedUom(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("vi");
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(0.000001, Math.abs(right) * 0.000001);
}

/**
 * One Item contract for the entire purchase/sales chain.
 *
 * The line can choose only a UOM declared by Item. Inventory mode, stock UOM and conversion
 * are master data, not user input. Quantity remains the commercial quantity; stock quantity is
 * a separate snapshot used by the ledger.
 */
async function validateTransactionLines(
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
  const [pairs, doorPolicies, customer] = await Promise.all([
    Promise.all(codes.map(async (code) => [code, await readMaster(call, "Item", code) as InventoryItem | null] as const)),
    side === "sales" ? readDoorPolicies(call) : Promise.resolve([]),
    side === "sales" && !declaredCustomerGroup && customerName
      ? readMaster(call, "Customer", customerName)
      : Promise.resolve(null),
  ]);
  const items = new Map(pairs);
  const customerGroup = declaredCustomerGroup || String(customer?.price_group ?? "").trim();

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

    const stockUom = String(item.stock_uom ?? "").trim();
    const defaultUom = String(side === "purchase" ? item.default_purchase_uom ?? "" : item.default_sales_uom ?? "").trim();
    const uom = String(row.uom ?? (defaultUom || stockUom)).trim();
    const mode = String(item.inventory_mode ?? "Hàng thường");
    const selected = normalizedUom(uom);
    if (side === "purchase" && mode === "Nhôm cây/lá" && selected !== "kg") {
      return refuse(`${line}: nhôm cây/lá phải nhập theo Kg; số cây và chiều dài chỉ là quy cách đối chiếu.`);
    }
    const dynamicSquareMetreToSet = mode === "Thành phẩm theo m2"
      && ["m2", "m²", "sqm"].includes(selected)
      && ["bộ", "bo", "set"].includes(normalizedUom(stockUom));
    const factors = new Map<string, number>();
    if (stockUom) factors.set(stockUom, 1);
    for (const conversion of item.uom_conversions ?? []) {
      const name = String(conversion?.uom ?? "").trim();
      const factor = Number(conversion?.conversion_factor);
      if (name && Number.isFinite(factor) && factor > 0) factors.set(name, factor);
    }
    if (defaultUom && !factors.has(defaultUom) && !(dynamicSquareMetreToSet && defaultUom === uom)) {
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
    if (mode === "Thành phẩm theo m2") {
      const sets = Number(row.set_count ?? 1);
      if (!Number.isFinite(sets) || sets <= 0) return refuse(`${line}: số bộ phải lớn hơn 0.`);
      if (["m2", "m²", "sqm"].includes(selected)) {
        const width = Number(row.width_m);
        const height = Number(row.height_m);
        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
          return refuse(`${line}: hàng tính m2 phải có rộng và cao lớn hơn 0.`);
        }
        const doorType = side === "sales" ? inferDoorType(item.door_type, item.item_group) : null;
        let billable: number;
        if (doorType) {
          if (customerGroup !== "Đại lý" && customerGroup !== "Lẻ") {
            return refuse(`${line}: khách hàng chưa có Nhóm giá Đại lý/Lẻ; không thể chọn đúng công thức đo và cắt.`);
          }
          const rawSalesMode = String(row.sales_mode ?? "Trọn bộ").trim();
          if (rawSalesMode !== "Tách món" && rawSalesMode !== "Trọn bộ") {
            return refuse(`${line}: Cách bán phải là Tách món hoặc Trọn bộ.`);
          }
          try {
            const policy = selectDoorPolicy(doorPolicies, doorType, String(item.item_group ?? ""));
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
            billable = Number(calculated.billable_area_sqm);
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
          } catch (error) {
            return refuse(`${line}: ${error instanceof Error ? error.message : "không tính được công thức cửa"}`);
          }
        } else {
          billable = Math.max(width * height, Number(item.min_area_sqm ?? 0) || 0) * sets;
        }
        if (!nearlyEqual(quantity, billable)) return refuse(`${line}: SL tính tiền phải là ${billable.toFixed(6)} m2 theo kích thước và diện tích tối thiểu của Item.`);
        if (dynamicSquareMetreToSet) {
          expectedFactor = sets / quantity;
          expectedStockQuantity = sets;
        }
      } else if (["bộ", "bo", "set"].includes(selected) && !nearlyEqual(quantity, sets)) {
        return refuse(`${line}: bán theo Bộ thì số lượng tính tiền phải bằng số bộ.`);
      }
    }
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
      return refuse(`${line}: hệ số quy đổi phải là ${expectedFactor} theo Item, không nhập tuỳ ý trên chứng từ.`);
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
 * - Item quyết định màu nào được dùng (danh sách rỗng = mọi màu đang hoạt động).
 * - Measurement Profile quyết định chứng từ có bắt buộc chọn màu hay không.
 * - Mọi chứng từ giữ MÃ màu chuẩn; không cho "ghi gần giống" thành một vị trí tồn khác.
 */
async function validateDocumentColors(
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
    const required = subject.doctype === "Aluminium Lot"
      || checked(profile?.require_color)
      || mode === "Nhôm cây/lá"
      || mode === "Thành phẩm theo m2";
    const color = String(row.color ?? "").trim();
    const line = subject.doctype === "Work Order" || subject.doctype === "Aluminium Lot"
      ? `${subject.doctype} (${code})`
      : `Dòng ${index + 1} (${code})`;

    if (required && !color) return refuse(`${line}: cần chọn Mã màu.`);
    if (!color) continue;
    const allowed = colorNames(item);
    if (allowed.length && !allowed.includes(color)) {
      return refuse(`${line}: màu ${color} không nằm trong Các màu được phép của mặt hàng.`);
    }
  }
  return accept();
}

interface Lot {
  name: string;
  profile: string;
  colour: string;
  generation: string;
  width_m: number;
  sheet_count: number;
  warehouse: string;
  is_offcut?: boolean;
  modified?: string;
}

/**
 * Lô nên cắt: khổ ĐỦ DÀI và NHỎ NHẤT trong số đủ dài.
 *
 * "Không được nhỏ hơn chiều rộng cắt lá" là luật của xưởng — cắt từ cây ngắn hơn thì lá
 * không đủ rộng và cả lô hỏng. Trong số các lô đủ dài thì chọn NGẮN NHẤT, vì phế bằng
 * (khổ − rộng cắt) × số lá: chọn cây 8,8 m để cắt lá 3,9 m sẽ phí 4,9 m mỗi lá.
 *
 * Ưu tiên phụ khi cùng khổ: lô nhiều lá hơn, để hạn chế phải cắt từ hai lô cho một đơn.
 */
export function chooseLots(lots: Lot[], widthM: number, sheets: number): { picks: Array<{ lot: Lot; take: number }>; short: number } {
  const usable = lots
    .filter((lot) => lot.width_m >= widthM && lot.sheet_count > 0)
    .sort((a, b) =>
      (a.width_m - b.width_m)
      || (Number(Boolean(b.is_offcut)) - Number(Boolean(a.is_offcut)))
      || (b.sheet_count - a.sheet_count));
  const picks: Array<{ lot: Lot; take: number }> = [];
  let remaining = sheets;
  for (const lot of usable) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.sheet_count);
    picks.push({ lot, take });
    remaining -= take;
  }
  return { picks, short: Math.max(0, remaining) };
}

async function readLots(call: PlatformCall, profile: string, colour: string, generation: string): Promise<Lot[]> {
  const filters: Array<[string, string, string]> = [
    ["profile", "=", profile],
    ["stock_state", "=", "TỒN"],
  ];
  if (colour) filters.push(["colour", "=", colour]);
  if (generation) filters.push(["generation", "=", generation]);
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "profile", "colour", "generation", "width_m", "sheet_count", "warehouse", "modified"]),
    filters: JSON.stringify(filters),
    limit_page_length: "500",
  });
  const response = await call(`resource/Aluminium%20Lot?${query}`);
  if (!response.ok) throw new Error(`không đọc được lô nhôm (HTTP ${response.status}: ${(await response.text()).slice(0, 140)})`);
  return ((await response.json()) as { data?: Lot[] }).data ?? [];
}

/** Đề xuất cắt — chỉ ĐỌC, không đổi gì. Kế toán xem rồi mới bấm cắt. */
async function proposeCut(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const profile = String(args.profile ?? "");
  const widthM = Number(args.cut_width_m);
  const sheets = Number(args.sheets);
  if (!profile || !Number.isFinite(widthM) || !Number.isFinite(sheets) || widthM <= 0 || sheets <= 0) {
    return refuse("Cần mã nhôm, rộng cắt lá và số lá, đều là số dương.");
  }
  const lots = await readLots(call, profile, String(args.colour ?? ""), String(args.generation ?? ""));
  const { picks, short } = chooseLots(lots, widthM, sheets);
  return answer({
    profile, cut_width_m: widthM, sheets,
    lots_considered: lots.length,
    picks: picks.map(({ lot, take }) => ({
      lot: lot.name, width_m: lot.width_m, colour: lot.colour, generation: lot.generation,
      warehouse: lot.warehouse, available: lot.sheet_count, take,
      scrap_per_sheet_m: Number((lot.width_m - widthM).toFixed(4)),
      scrap_total_m: Number(((lot.width_m - widthM) * take).toFixed(4)),
    })),
    short,
    // Nói thẳng khi thiếu, kèm con số — "không đủ" mà không nói thiếu bao nhiêu thì kế toán
    // vẫn phải mở file ra đếm tay.
    ...(short > 0 ? { message: `Thiếu ${short} lá khổ ≥ ${widthM} m cho ${profile}.` } : {}),
  });
}

/**
 * Cắt thật. Trừ lô và ghi phiếu cắt.
 *
 * Đề xuất lại từ đầu chứ KHÔNG tin danh sách lô client gửi lên: giữa lúc xem và lúc bấm,
 * người khác có thể đã cắt mất. Tính lại rồi mới ghi là khác biệt giữa "kho đúng" và "kho
 * đúng phần lớn thời gian".
 */
async function applyCut(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const profile = String(args.profile ?? "");
  const widthM = Number(args.cut_width_m);
  const sheets = Number(args.sheets);
  const voucher = String(args.voucher_no ?? "");
  if (!voucher) return refuse("Cần số chứng từ — phiếu cắt không có số thì không hoàn được.");
  if (!profile || !Number.isFinite(widthM) || !Number.isFinite(sheets) || widthM <= 0 || sheets <= 0) {
    return refuse("Cần mã nhôm, rộng cắt lá và số lá, đều là số dương.");
  }

  const lots = await readLots(call, profile, String(args.colour ?? ""), String(args.generation ?? ""));
  const { picks, short } = chooseLots(lots, widthM, sheets);
  if (short > 0) return refuse(`Không đủ nhôm: thiếu ${short} lá khổ ≥ ${widthM} m cho ${profile}.`);

  const now = new Date().toISOString();
  /**
   * Các lô cắt SONG SONG, không xếp hàng.
   *
   * Mỗi lần gọi ngược tốn ~1,2 giây và nền tảng cắt một lời gọi app ở 5 giây, nên xếp hàng
   * theo lô là đặt một hạn mức ngầm: cắt lấy từ ba lô sẽ hết giờ. Và hết giờ ở ĐÂY là kiểu
   * hỏng tệ nhất trong cả app — tồn đã trừ, người bấm thấy báo lỗi, rồi bấm lại và trừ lần
   * nữa. Các lô là bản ghi khác nhau nên không có lý do gì phải chờ nhau.
   *
   * An toàn khi hai người cùng cắt KHÔNG đổi: mỗi lệnh ghi vẫn mang `modified` của chính
   * bản ghi vừa đọc, nên người thứ hai bị từ chối. Đó là chốt của nền tảng.
   */
  const results = await Promise.all(picks.map(async ({ lot, take }) => {
    const left = lot.sheet_count - take;
    const update = await call(`resource/Aluminium%20Lot/${encodeURIComponent(lot.name)}`, {
      method: "PUT",
      body: JSON.stringify({
        sheet_count: left,
        // Hết lá thì đánh dấu HẾT, giữ dòng lại làm lịch sử — đúng như file Excel vẫn làm.
        stock_state: left > 0 ? "TỒN" : "HẾT",
        modified: lot.modified,
      }),
    });
    if (!update.ok) return { lot: lot.name, take, ok: false, detail: (await update.text()).slice(0, 140) };
    const cut = await call("resource/Aluminium%20Cut", {
      method: "POST",
      body: JSON.stringify({
        lot: lot.name, cut_on: now, voucher_no: voucher,
        ...(args.customer ? { customer: String(args.customer) } : {}),
        cut_width_m: widthM, sheets_cut: take,
        scrap_m: Number((lot.width_m - widthM).toFixed(4)),
        cut_state: "ĐÃ CẮT",
      }),
    });
    const name = cut.ok ? ((await cut.json()) as { data?: { name?: string } }).data?.name ?? "" : "";
    return { lot: lot.name, take, ok: true, cut: name };
  }));

  const failed = results.filter((entry) => !entry.ok);
  const done = results.filter((entry) => entry.ok);
  if (failed.length) {
    /**
     * Nói rõ phần ĐÃ cắt khi có lô hỏng.
     *
     * Nền tảng không có giao dịch trải nhiều tài liệu, nên một lệnh cắt lấy từ nhiều lô có
     * thể xong một phần. Im lặng thì thủ kho tưởng chưa cắt gì và cắt lại — trừ tồn hai lần.
     */
    return refuse(
      `Cắt được ${done.length}/${picks.length} lô. Lô hỏng: ${failed.map((entry) => entry.lot).join(", ")} — có người vừa cắt, đề xuất lại.`
      + (done.length ? ` ĐÃ CẮT: ${done.map((entry) => `${entry.lot}×${entry.take}`).join(", ")}.` : ""),
    );
  }

  return answer({
    voucher_no: voucher, profile, cut_width_m: widthM, sheets,
    cuts: done.map((entry) => entry.cut).filter(Boolean), lots_used: picks.length,
    scrap_total_m: Number(picks.reduce((sum, p) => sum + (p.lot.width_m - widthM) * p.take, 0).toFixed(4)),
  });
}

interface CutRecord {
  name: string;
  lot: string;
  voucher_no: string;
  cut_width_m: number;
  sheets_cut: number;
  cut_state: string;
  /** Nền tảng luôn kèm `modified` vào kết quả danh sách, nên không phải đọc lại từng bản ghi. */
  modified?: string;
}

/** Phiếu cắt còn ở trạng thái ĐÃ CẮT của một chứng từ — thứ duy nhất hoàn/trả được. */
async function openCuts(call: PlatformCall, args: Record<string, unknown>): Promise<CutRecord[]> {
  const voucher = String(args.voucher_no ?? "");
  const single = String(args.cut ?? "");
  if (!voucher && !single) throw new Error("Cần số chứng từ hoặc số phiếu cắt.");
  const filters: Array<[string, string, string]> = [["cut_state", "=", "ĐÃ CẮT"]];
  if (single) filters.push(["name", "=", single]);
  else filters.push(["voucher_no", "=", voucher]);
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "lot", "voucher_no", "cut_width_m", "sheets_cut", "cut_state"]),
    filters: JSON.stringify(filters),
    limit_page_length: "200",
  });
  const response = await call(`resource/Aluminium%20Cut?${query}`);
  if (!response.ok) throw new Error(`không đọc được phiếu cắt (HTTP ${response.status})`);
  return ((await response.json()) as { data?: CutRecord[] }).data ?? [];
}

/** Đọc lại một bản ghi để lấy `modified` — danh sách không chiếu field đó ra. */
async function readDoc<T>(call: PlatformCall, doctype: string, name: string): Promise<T & { modified?: string }> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`không đọc được ${doctype} ${name} (HTTP ${response.status})`);
  return ((await response.json()) as { data?: T & { modified?: string } }).data ?? ({} as T & { modified?: string });
}

interface V2BatchBalance {
  item_code?: string;
  warehouse?: string;
  batch_no?: string;
  actual_qty?: number;
  actual_weight?: number | null;
  stock_value?: number;
}

interface V2Batch {
  name?: string;
  batch_id?: string;
  item_code?: string;
  color?: string;
  condition?: string;
  length_m?: number;
  is_offcut?: unknown;
  parent_batch?: string;
  received_warehouse?: string;
}

interface V2CutOrderItem {
  row_id?: string;
  item_code?: string;
  serial_and_batch_bundle?: string;
  offcut_bundle?: string;
  source_warehouse?: string;
  source_length_m?: number;
  cut_width_m?: number;
  sheets_cut?: number;
  kg_consumed?: number;
  cut_product_value_minor?: number;
  cut_product_weight_micros?: number;
}

interface V2CutOrder {
  name?: string;
  cut_on?: string;
  cutting_policy?: string;
  customer?: string;
  so_reference?: string;
  cut_state?: string;
  company?: string;
  currency?: string;
  currency_scale?: number;
  items?: V2CutOrderItem[];
  modified?: string;
}

/** Query Report trả về `message.result` theo Frappe; nhận cả dạng đã unwrap để callback dễ kiểm thử. */
async function reportRows<T>(
  call: PlatformCall,
  reportName: string,
  filters: Record<string, unknown>,
): Promise<T[]> {
  const response = await call("method/frappe.desk.query_report.run", {
    method: "POST",
    body: JSON.stringify({ report_name: reportName, ignore_prepared_report: 1, filters }),
  });
  if (!response.ok) throw new Error(`không đọc được báo cáo ${reportName} (HTTP ${response.status})`);
  const payload = await response.json() as {
    message?: { result?: T[] } | T[];
    result?: T[];
  };
  if (Array.isArray(payload.message)) return payload.message;
  if (payload.message && !Array.isArray(payload.message) && Array.isArray(payload.message.result)) return payload.message.result;
  return payload.result ?? [];
}

async function createV2Doc<T extends Record<string, unknown>>(
  call: PlatformCall,
  doctype: string,
  document: T,
): Promise<T & { name: string; modified?: string }> {
  const response = await call(`resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    body: JSON.stringify(document),
  });
  if (!response.ok) throw new Error(`không tạo được ${doctype}: ${(await response.text()).slice(0, 220)}`);
  const data = ((await response.json()) as { data?: T & { name?: string; modified?: string } }).data;
  if (!data?.name) throw new Error(`${doctype} đã tạo nhưng không trả về số chứng từ`);
  return { ...data, name: data.name };
}

async function submitV2Doc<T extends Record<string, unknown>>(
  call: PlatformCall,
  doctype: string,
  name: string,
  document?: T & { modified?: string },
): Promise<Record<string, unknown>> {
  const source = document ?? await readDoc<Record<string, unknown>>(call, doctype, name);
  const response = await call("method/frappe.client.submit", {
    method: "POST",
    body: JSON.stringify({ doc: { ...source, doctype, name } }),
  });
  if (!response.ok) throw new Error(`không ghi sổ được ${doctype} ${name}: ${(await response.text()).slice(0, 240)}`);
  const payload = await response.json() as { message?: Record<string, unknown>; data?: Record<string, unknown> };
  return payload.message ?? payload.data ?? {};
}

async function cancelV2Doc(
  call: PlatformCall,
  doctype: string,
  name: string,
  document?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const source = document ?? await readDoc<Record<string, unknown>>(call, doctype, name);
  const response = await call("method/frappe.client.cancel", {
    method: "POST",
    body: JSON.stringify({ doc: { ...source, doctype, name } }),
  });
  if (!response.ok) throw new Error(`không huỷ được ${doctype} ${name}: ${(await response.text()).slice(0, 240)}`);
  const payload = await response.json() as { message?: Record<string, unknown>; data?: Record<string, unknown> };
  return payload.message ?? payload.data ?? {};
}

async function submitBundle(
  call: PlatformCall,
  input: {
    item_code: string;
    warehouse: string;
    type: "Inward" | "Outward";
    posting_at: string;
    entries: Array<{ row_id: string; qty: number; batch_no: string }>;
  },
): Promise<string> {
  const created = await createV2Doc(call, "Serial and Batch Bundle", input);
  await submitV2Doc(call, "Serial and Batch Bundle", created.name, created);
  return created.name;
}

async function listV2BatchStock(
  call: PlatformCall,
  args: Record<string, unknown>,
): Promise<Array<V2BatchBalance & { batch: V2Batch }>> {
  const itemCode = String(args.item_code ?? "").trim();
  const warehouse = String(args.warehouse ?? "").trim();
  const includeOffcut = args.include_offcut === undefined ? true : checked(args.include_offcut);
  const balances = await reportRows<V2BatchBalance>(call, "Batch Stock Balance", {
    ...(itemCode ? { item_code: itemCode } : {}),
    ...(warehouse && !includeOffcut ? { warehouse } : {}),
  });
  const positive = balances.filter((row) => String(row.batch_no ?? "") && Number(row.actual_qty ?? 0) > 0);
  const warehouseNames = [...new Set(positive.map((row) => String(row.warehouse ?? "")).filter(Boolean))];
  const warehousePairs = await Promise.all(warehouseNames.map(async (name) => [name, await readMaster(call, "Warehouse", name)] as const));
  const warehouses = new Map(warehousePairs);
  const enriched = await Promise.all(positive.map(async (row) => ({
    ...row,
    batch: await readDoc<V2Batch>(call, "Batch", String(row.batch_no)),
  })));
  const color = String(args.color ?? args.colour ?? "").trim();
  const condition = String(args.condition ?? args.generation ?? "").trim();
  return enriched.filter(({ batch, warehouse: rowWarehouse }) =>
    (!itemCode || batch.item_code === itemCode)
    && (!warehouse
      || rowWarehouse === warehouse
      || (includeOffcut
        && warehouses.get(String(rowWarehouse))?.stock_role === "Kho đầu thừa"
        && warehouses.get(String(rowWarehouse))?.parent_warehouse === warehouse))
    && (!color || batch.color === color)
    && (!condition || batch.condition === condition)
    && (includeOffcut || !checked(batch.is_offcut)));
}

/**
 * V2 chỉ đọc Batch + sổ kho. Không còn Aluminium Lot song song với sổ nên một lô không thể "còn"
 * ở bảng phụ trong khi sổ thật đã hết.
 */
async function proposeCutV2(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const itemCode = String(args.item_code ?? args.profile ?? "").trim();
  const warehouse = String(args.warehouse ?? "").trim();
  const cutWidth = Number(args.cut_width_m);
  const sheets = Number(args.sheets);
  if (!itemCode || !warehouse || !Number.isFinite(cutWidth) || cutWidth <= 0 || !Number.isInteger(sheets) || sheets <= 0) {
    return refuse("Cần mã nhôm, kho, rộng cắt và số lá nguyên dương.");
  }
  const stock = await listV2BatchStock(call, { ...args, item_code: itemCode, warehouse });
  const lots: Lot[] = stock.map(({ batch, actual_qty, warehouse: rowWarehouse }) => ({
    name: String(batch.name ?? batch.batch_id ?? ""),
    profile: itemCode,
    colour: String(batch.color ?? ""),
    generation: String(batch.condition ?? ""),
    width_m: Number(batch.length_m ?? 0),
    sheet_count: Math.floor(Number(actual_qty ?? 0)),
    warehouse: String(rowWarehouse ?? warehouse),
    is_offcut: checked(batch.is_offcut),
  }));
  const { picks, short } = chooseLots(lots, cutWidth, sheets);
  return answer({
    item_code: itemCode,
    warehouse,
    cut_width_m: cutWidth,
    sheets,
    lots_considered: lots.length,
    picks: picks.map(({ lot, take }) => ({
      batch_no: lot.name,
      length_m: lot.width_m,
      color: lot.colour,
      condition: lot.generation,
      warehouse: lot.warehouse,
      is_offcut: Boolean(lot.is_offcut),
      available: lot.sheet_count,
      take,
      offcut_per_sheet_m: Number((lot.width_m - cutWidth).toFixed(6)),
    })),
    short,
    ...(short ? { message: `Thiếu ${short} lá khổ ≥ ${cutWidth} m cho ${itemCode}.` } : {}),
  });
}

/**
 * Dựng phiếu cắt nháp cùng các bundle chưa dùng. Ghi sổ vẫn xảy ra ở `cut.apply`; nếu tồn đã đổi,
 * controller kiểm lại từng batch và từ chối, không trừ âm.
 */
async function draftCutV2(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const proposed = await proposeCutV2(call, args);
  if (!proposed.ok) return proposed;
  const proposal = await proposed.json() as {
    item_code: string;
    warehouse: string;
    cut_width_m: number;
    sheets: number;
    short: number;
    picks: Array<{ batch_no: string; length_m: number; take: number; warehouse: string }>;
  };
  if (proposal.short) return refuse(`Không đủ tồn: còn thiếu ${proposal.short} lá.`);
  const cuttingPolicy = String(args.cutting_policy ?? "").trim();
  if (!cuttingPolicy) return refuse("Cần chọn công thức cửa trước khi tạo phiếu cắt.");
  const postingAt = new Date().toISOString();
  const item = await readMaster(call, "Item", proposal.item_code);
  const profileName = String(item?.measurement_profile ?? "");
  const profile = profileName ? await readMaster(call, "Measurement Profile", profileName) : null;
  if (!profile) return refuse(`Mặt hàng ${proposal.item_code} chưa có bộ quy cách.`);
  const kerfM = Number(profile.kerf_mm ?? 0) / 1000;
  const threshold = Number(profile.scrap_threshold_m ?? 0);
  const items: V2CutOrderItem[] = [];
  const createdBundles: string[] = [];
  const createdBatches: string[] = [];
  try {
    for (const [index, pick] of proposal.picks.entries()) {
      const outward = await submitBundle(call, {
        item_code: proposal.item_code,
        warehouse: pick.warehouse,
        type: "Outward",
        posting_at: postingAt,
        entries: [{ row_id: "ROW-1", qty: pick.take, batch_no: pick.batch_no }],
      });
      createdBundles.push(outward);
      const offcutLength = Number((pick.length_m - proposal.cut_width_m - kerfM * pick.take).toFixed(6));
      let offcutBundle = "";
      if (offcutLength >= threshold && offcutLength > 0) {
        const offcutWarehouse = String(args.offcut_warehouse ?? "").trim()
          || await findOffcutWarehouse(call, pick.warehouse);
        if (!offcutWarehouse) throw new Error("chưa có kho vai trò Kho đầu thừa");
        const sourceBatch = await readDoc<V2Batch>(call, "Batch", pick.batch_no);
        const offcutBatch = await createV2Doc(call, "Batch", {
          item_code: proposal.item_code,
          color: sourceBatch.color,
          condition: sourceBatch.condition,
          length_m: offcutLength,
          is_offcut: 1,
          parent_batch: pick.batch_no,
          cut_generation: Number((sourceBatch as Record<string, unknown>).cut_generation ?? 0) + 1,
          received_warehouse: offcutWarehouse,
        });
        createdBatches.push(offcutBatch.name);
        offcutBundle = await submitBundle(call, {
          item_code: proposal.item_code,
          warehouse: offcutWarehouse,
          type: "Inward",
          posting_at: postingAt,
          entries: [{ row_id: "ROW-1", qty: pick.take, batch_no: offcutBatch.name }],
        });
        createdBundles.push(offcutBundle);
      }
      items.push({
        row_id: `ROW-${index + 1}`,
        item_code: proposal.item_code,
        serial_and_batch_bundle: outward,
        ...(offcutBundle ? { offcut_bundle: offcutBundle } : {}),
        source_length_m: pick.length_m,
        cut_width_m: proposal.cut_width_m,
        sheets_cut: pick.take,
      });
    }
    const cut = await createV2Doc(call, "Cut Order", {
      cut_on: postingAt,
      cutting_policy: cuttingPolicy,
      ...(args.customer ? { customer: String(args.customer) } : {}),
      ...(args.so_reference ? { so_reference: String(args.so_reference) } : {}),
      items,
      cut_state: "Nháp",
    });
    return answer({
      cut_order: cut.name,
      draft: true,
      items,
      bundles: createdBundles,
      offcut_batches: createdBatches,
      message: `Đã tạo phiếu cắt nháp ${cut.name}; chưa trừ tồn kho.`,
    });
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : "không tạo được phiếu cắt"}`
      + (createdBundles.length ? `; bundle đã tạo nhưng chưa dùng: ${createdBundles.join(", ")}` : ""),
    );
  }
}

async function findOffcutWarehouse(call: PlatformCall, sourceWarehouse: string): Promise<string> {
  const source = await readMaster(call, "Warehouse", sourceWarehouse);
  if (source?.stock_role === "Kho đầu thừa") return sourceWarehouse;
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "stock_role", "parent_warehouse", "is_group", "disabled"]),
    filters: JSON.stringify([
      ["stock_role", "=", "Kho đầu thừa"],
      ["parent_warehouse", "=", sourceWarehouse],
      ["is_group", "=", 0],
      ["disabled", "=", 0],
    ]),
    limit_page_length: "3",
  });
  const response = await call(`resource/Warehouse?${query}`);
  if (!response.ok) return "";
  const rows = ((await response.json()) as { data?: Array<{ name?: string }> }).data ?? [];
  return rows.length === 1 ? String(rows[0]?.name ?? "") : "";
}

async function applyCutV2(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const name = String(args.cut_order ?? "").trim();
  if (!name) return refuse("Cần chọn phiếu cắt nháp.");
  const cut = await readDoc<V2CutOrder>(call, "Cut Order", name);
  if (cut.cut_state !== "Đã cắt") {
    await submitV2Doc(call, "Cut Order", name, cut as V2CutOrder & Record<string, unknown>);
  }
  const reservations = await consumeReservationsForCut(call, name, cut.so_reference);
  return answer({
    cut_order: name,
    submitted: true,
    idempotent: cut.cut_state === "Đã cắt",
    reservations,
    message: `Đã cắt và trừ tồn theo phiếu ${name}; ${reservations.used} phiếu giữ chỗ đã chuyển sang Đã dùng.`
      + (reservations.failed.length ? ` Cần kiểm tra lại: ${reservations.failed.join(", ")}.` : ""),
  });
}

async function consumeReservationsForCut(
  call: PlatformCall,
  cutOrder: string,
  sourceReference?: string,
): Promise<{ used: number; failed: string[] }> {
  const sourceNames = new Set([cutOrder, String(sourceReference ?? "").trim()].filter(Boolean));
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "source_name", "state", "modified"]),
    filters: JSON.stringify([["state", "=", "Đang giữ"]]),
    limit_page_length: "5000",
  });
  const response = await call(`resource/Stock%20Reservation?${query}`);
  if (!response.ok) return { used: 0, failed: ["không đọc được danh sách giữ chỗ"] };
  const rows = ((await response.json()) as {
    data?: Array<{ name?: string; source_name?: string; state?: string; modified?: string }>;
  }).data ?? [];
  let used = 0;
  const failed: string[] = [];
  for (const row of rows) {
    const reservation = String(row.name ?? "");
    if (!reservation || !sourceNames.has(String(row.source_name ?? ""))) continue;
    const saved = await call(`resource/Stock%20Reservation/${encodeURIComponent(reservation)}`, {
      method: "PUT",
      body: JSON.stringify({ state: "Đã dùng", modified: row.modified }),
    });
    if (saved.ok) used += 1;
    else failed.push(reservation);
  }
  return { used, failed };
}

async function reverseCutV2(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const name = String(args.cut_order ?? args.cut ?? "").trim();
  const reason = String(args.reason ?? "").trim();
  if (!name || !reason) return refuse("Cần phiếu cắt và lý do hoàn cắt.");
  const cut = await readDoc<V2CutOrder>(call, "Cut Order", name);
  await cancelV2Doc(call, "Cut Order", name, {
    ...cut,
    cancel_reason: reason,
    note: String(args.note ?? ""),
  } as Record<string, unknown>);
  return answer({ cut_order: name, reversed: true, message: `Đã đảo đúng bút toán gốc của phiếu ${name}.` });
}

async function returnCutV2(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const name = String(args.cut_order ?? args.cut ?? "").trim();
  const reason = String(args.reason ?? "").trim();
  if (!name || !reason) return refuse("Cần phiếu cắt và lý do trả hàng.");
  const cut = await readDoc<V2CutOrder>(call, "Cut Order", name);
  if (cut.cut_state !== "Đã cắt" || !cut.items?.length) {
    return refuse(`Phiếu ${name} không ở trạng thái Đã cắt hoặc không có dòng hàng.`);
  }
  const marker = `Trả hàng đã cắt từ Cut Order ${name}`;
  const existingQuery = new URLSearchParams({
    fields: JSON.stringify(["name", "note", "docstatus"]),
    limit_page_length: "5000",
  });
  const existingResponse = await call(`resource/Stock%20Entry?${existingQuery}`);
  if (existingResponse.ok) {
    const existing = ((await existingResponse.json()) as { data?: Array<{ name?: string; note?: string; docstatus?: number }> }).data ?? [];
    const prior = existing.find((row) => row.note === marker && row.docstatus !== 2);
    if (prior) return refuse(`Phiếu cắt ${name} đã được nhập trả bằng phiếu kho ${prior.name}.`);
  }

  const postingAt = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];
  const returnedBatches: string[] = [];
  const bundles: string[] = [];
  for (const [index, item] of cut.items.entries()) {
    if (!item.item_code || !item.serial_and_batch_bundle || !item.source_warehouse || !positive(item.sheets_cut) || !positive(item.cut_width_m)) {
      throw new Error(`dòng ${index + 1} của phiếu cắt thiếu dữ liệu gốc để nhập trả`);
    }
    const sourceBundle = await readDoc<{ entries?: Array<{ batch_no?: string }> }>(
      call, "Serial and Batch Bundle", item.serial_and_batch_bundle,
    );
    const parent = String(sourceBundle.entries?.[0]?.batch_no ?? "");
    if (!parent) throw new Error(`bundle ${item.serial_and_batch_bundle} không có lô mẹ`);
    const parentBatch = await readDoc<V2Batch>(call, "Batch", parent);
    const returned = await createV2Doc(call, "Batch", {
      item_code: item.item_code,
      color: parentBatch.color,
      condition: parentBatch.condition,
      length_m: Number(item.cut_width_m),
      is_offcut: 1,
      parent_batch: parent,
      cut_generation: Number((parentBatch as Record<string, unknown>).cut_generation ?? 0) + 1,
      received_warehouse: item.source_warehouse,
      note: `${marker}; lý do: ${reason}`,
    });
    returnedBatches.push(returned.name);
    const bundle = await submitBundle(call, {
      item_code: item.item_code,
      warehouse: item.source_warehouse,
      type: "Inward",
      posting_at: postingAt,
      entries: [{ row_id: "ROW-1", qty: Number(item.sheets_cut), batch_no: returned.name }],
    });
    bundles.push(bundle);
    const value = Number(item.cut_product_value_minor ?? 0);
    const qty = Number(item.sheets_cut);
    rows.push({
      row_id: `ROW-${index + 1}`,
      item_code: item.item_code,
      qty,
      target_warehouse: item.source_warehouse,
      serial_and_batch_bundle: bundle,
      ...(Number(item.cut_product_weight_micros ?? 0) > 0
        ? { weight_kg: Number(item.cut_product_weight_micros) / 1_000_000 }
        : {}),
      valuation_rate: qty > 0 ? value / qty / (10 ** Number(cut.currency_scale ?? 2)) : 0,
      note: marker,
    });
  }
  const stockEntry = await createV2Doc(call, "Stock Entry", {
    purpose: "Material Receipt",
    company: String(cut.company ?? "ALUMDOOR"),
    posting_at: postingAt,
    items: rows,
    note: marker,
  });
  await submitV2Doc(call, "Stock Entry", stockEntry.name, stockEntry);
  return answer({
    cut_order: name,
    stock_entry: stockEntry.name,
    returned_batches: returnedBatches,
    bundles,
    mode: "trả hàng đã cắt",
    message: `Đã nhập lại hàng đã cắt bằng phiếu kho ${stockEntry.name}; lô mẹ không bị khôi phục nguyên khổ.`,
  });
}

async function createReservationV2(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const required = ["item_code", "warehouse", "min_length_m", "qty_reserved", "source_doctype", "source_name", "expires_at"];
  const missing = required.filter((field) => args[field] == null || String(args[field]).trim() === "");
  if (missing.length) return refuse(`Thiếu thông tin giữ chỗ: ${missing.join(", ")}.`);
  const reservation = await createV2Doc(call, "Stock Reservation", {
    item_code: String(args.item_code),
    ...(args.color ? { color: String(args.color) } : {}),
    ...(args.condition ? { condition: String(args.condition) } : {}),
    warehouse: String(args.warehouse),
    min_length_m: Number(args.min_length_m),
    qty_reserved: Number(args.qty_reserved),
    source_doctype: String(args.source_doctype),
    source_name: String(args.source_name),
    expires_at: String(args.expires_at),
    reserved_at: new Date().toISOString(),
    state: "Đang giữ",
  });
  return answer({ reservation: reservation.name, state: "Đang giữ", message: `Đã giữ chỗ ${reservation.name}; tồn thực không thay đổi.` });
}

async function releaseReservationV2(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const name = String(args.reservation ?? "").trim();
  const reason = String(args.released_reason ?? "").trim();
  if (!name || !reason) return refuse("Cần phiếu giữ chỗ và lý do nhả.");
  const reservation = await readDoc<Record<string, unknown>>(call, "Stock Reservation", name);
  if (reservation.state !== "Đang giữ") return refuse(`Phiếu ${name} không còn ở trạng thái Đang giữ.`);
  const response = await call(`resource/Stock%20Reservation/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({ state: "Đã nhả", released_reason: reason, modified: reservation.modified }),
  });
  if (!response.ok) return refuse(`Không nhả được ${name}: ${(await response.text()).slice(0, 180)}`);
  return answer({ reservation: name, state: "Đã nhả" });
}

async function snapshotReconciliationV2(
  call: PlatformCall,
  args: Record<string, unknown>,
  actorUser: string,
): Promise<Response> {
  const warehouse = String(args.warehouse ?? "").trim();
  const scope = String(args.scope ?? "Toàn kho").trim();
  if (!warehouse) return refuse("Cần chọn kho kiểm kê.");
  const stock = await listV2BatchStock(call, {
    warehouse,
    ...(args.item_code ? { item_code: String(args.item_code) } : {}),
    // A reconciliation is always for the warehouse named on the document.
    // Offcut child warehouses have their own reconciliation and reminder cycle.
    include_offcut: 0,
  });
  const itemGroup = String(args.item_group ?? "").trim();
  const selected: typeof stock = [];
  for (const row of stock) {
    if (itemGroup) {
      const item = await readMaster(call, "Item", String(row.item_code ?? row.batch.item_code ?? ""));
      if (item?.item_group !== itemGroup) continue;
    }
    selected.push(row);
  }
  const snapshotAt = new Date().toISOString();
  const lines = selected.map((row, index) => ({
    row_id: `ROW-${index + 1}`,
    item_code: String(row.item_code ?? row.batch.item_code ?? ""),
    batch_no: String(row.batch_no ?? row.batch.name ?? ""),
    book_qty: Number(row.actual_qty ?? 0),
    book_weight_kg: row.actual_weight == null ? undefined : Number(row.actual_weight),
    counted_qty: Number(row.actual_qty ?? 0),
    counted_weight_kg: row.actual_weight == null ? undefined : Number(row.actual_weight),
  }));
  const reconciliation = await createV2Doc(call, "Stock Reconciliation", {
    warehouse,
    scope,
    ...(itemGroup ? { item_group: itemGroup } : {}),
    ...(args.item_code ? { item_code: String(args.item_code) } : {}),
    snapshot_at: snapshotAt,
    counted_by: actorUser,
    ...(args.witnessed_by ? { witnessed_by: String(args.witnessed_by) } : {}),
    items: lines,
    recon_state: "Đang đếm",
  });
  return answer({
    reconciliation: reconciliation.name,
    snapshot_at: snapshotAt,
    lines,
    message: `Đã chụp ${lines.length} dòng sổ vào phiếu ${reconciliation.name}; chưa ghi điều chỉnh.`,
  });
}

async function postReconciliationV2(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const name = String(args.reconciliation ?? "").trim();
  if (!name) return refuse("Cần chọn phiếu kiểm kê.");
  const reconciliation = await readDoc<Record<string, unknown>>(call, "Stock Reconciliation", name);
  const snapshotAt = String(reconciliation.snapshot_at ?? "").trim();
  const warehouse = String(reconciliation.warehouse ?? "").trim();
  const laterEntries = snapshotAt && warehouse
    ? await reportRows<{ voucher_type?: string; voucher_no?: string }>(call, "Stock Ledger", {
      warehouse,
      posting_at: [">", snapshotAt],
    })
    : [];
  const laterVouchers = new Set(
    laterEntries.map((row) => `${String(row.voucher_type ?? "")}:${String(row.voucher_no ?? "")}`),
  );
  await submitV2Doc(call, "Stock Reconciliation", name, reconciliation);
  const warning = laterVouchers.size
    ? `Cảnh báo: có ${laterVouchers.size} chứng từ kho phát sinh sau mốc chốt; chênh lệch vẫn được ghi theo snapshot.`
    : null;
  return answer({
    reconciliation: name,
    posted: true,
    snapshot_at: snapshotAt || null,
    later_vouchers: laterVouchers.size,
    warning,
    message: `Đã ghi sổ chênh lệch theo mốc chốt của ${name}.${warning ? ` ${warning}` : ""}`,
  });
}

async function askAlumdoorAssistant(
  call: PlatformCall,
  args: Record<string, unknown>,
): Promise<Response> {
  const question = String(args.question ?? "").trim();
  if (!question) return refuse("Cần nhập câu hỏi.");
  const contextDoctype = String(args.context_doctype ?? "").trim();
  const contextName = String(args.context_name ?? "").trim();
  let context: Record<string, unknown> = {};
  if (contextDoctype || contextName) {
    if (!contextDoctype || !contextName) return refuse("Bối cảnh phải có đủ loại chứng từ và số chứng từ.");
    const document = await readDoc<Record<string, unknown>>(call, contextDoctype, contextName);
    context = { doctype: contextDoctype, name: contextName, document };
  }
  const response = await call("method/metaforge.ai.ask", {
    method: "POST",
    body: JSON.stringify({ question, context }),
  });
  if (!response.ok) return refuse(`Trợ lý chưa trả lời được: ${(await response.text()).slice(0, 220)}`);
  const payload = await response.json() as { answer?: string; message?: { answer?: string } };
  const responseText = String(payload.answer ?? payload.message?.answer ?? "").trim();
  if (!responseText) return refuse("Trợ lý trả về câu trả lời rỗng.");
  return answer({
    answer: responseText,
    context_doctype: contextDoctype || null,
    context_name: contextName || null,
    read_only: true,
  });
}

async function setAccountingPeriod(
  request: Request,
  call: PlatformCall,
  args: Record<string, unknown>,
  action: "Lock" | "Unlock",
): Promise<Response> {
  const actor = platformActorIdentity(request);
  if (actor.user_id !== "Administrator"
    && !actor.roles.includes("Administrator")
    && !actor.roles.includes("System Manager")
    && !actor.roles.includes("Chủ xưởng")) {
    return new Response(JSON.stringify({ message: "Chỉ Chủ xưởng được khoá hoặc mở kỳ." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  const company = String(args.company ?? "").trim();
  const reason = String(args.reason ?? "").trim();
  const lockDate = String(args.lock_date ?? "").trim();
  if (!company || !reason || (action === "Lock" && !lockDate)) {
    return refuse(action === "Lock"
      ? "Cần công ty, ngày khoá và lý do."
      : "Cần công ty và lý do mở kỳ.");
  }
  const response = await call("method/metaforge.api.set_accounting_period_lock", {
    method: "POST",
    body: JSON.stringify({
      company,
      action,
      ...(action === "Lock" ? { lock_date: lockDate } : {}),
      reason,
    }),
  });
  if (!response.ok) return refuse(`Không cập nhật được kỳ: ${(await response.text()).slice(0, 220)}`);
  const payload = await response.json() as {
    message?: { company?: string; lock_date?: string | null };
  };
  return answer({
    company: payload.message?.company ?? company,
    lock_date: payload.message?.lock_date ?? null,
    action,
    audited: true,
  });
}

/**
 * Đánh dấu phiếu cắt đã xử lý. Chưa đóng dấu thì lần sau hoàn tiếp là cộng tồn hai lần.
 *
 * `modified` lấy từ chính lần đọc danh sách, không đọc lại bản ghi: nếu ai đó đã hoàn phiếu
 * này trong lúc đó thì `modified` đã đổi và lệnh ghi bị TỪ CHỐI — đúng thứ cần, và rẻ hơn
 * một vòng gọi ngược 1,2 giây.
 */
async function closeCut(call: PlatformCall, cut: CutRecord, state: string, note: string): Promise<boolean> {
  const update = await call(`resource/Aluminium%20Cut/${encodeURIComponent(cut.name)}`, {
    method: "PUT",
    body: JSON.stringify({ cut_state: state, note, modified: cut.modified }),
  });
  return update.ok;
}

/**
 * HOÀN CẮT — chữa một lần ghi nhầm. Lá quay về ĐÚNG lô cũ, nguyên khổ.
 *
 * Khác hẳn TRẢ HÀNG ở dưới, và trộn hai thứ này là làm sai tồn theo cách không ai thấy: hoàn
 * cắt nghĩa là nhôm CHƯA bị cắt (bấm nhầm, gõ nhầm số lá), nên cây nhôm vẫn còn nguyên khổ
 * 3,8 m và phải quay về đúng chỗ nó đi ra. Trả hàng nghĩa là nhôm ĐÃ cắt rồi mới quay về —
 * lúc đó nó là lá khổ 3,5 m, không còn là cây 3,8 m nữa, và nhôm thì không nối lại được.
 */
async function reverseCut(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const cuts = await openCuts(call, args);
  if (!cuts.length) return refuse("Không có phiếu cắt nào đang ở trạng thái ĐÃ CẮT cho chứng từ này.");
  const note = String(args.note ?? "Hoàn cắt");
  // Các phiếu chạy song song, cùng lý do với `applyCut`: xếp hàng theo phiếu là tự đặt một
  // hạn mức ngầm "hoàn quá hai phiếu thì hết giờ".
  const results = await Promise.all(cuts.map(async (cut) => {
    const lot = await readDoc<{ sheet_count?: number }>(call, "Aluminium Lot", cut.lot);
    const restored = Number(lot.sheet_count ?? 0) + Number(cut.sheets_cut ?? 0);
    const update = await call(`resource/Aluminium%20Lot/${encodeURIComponent(cut.lot)}`, {
      method: "PUT",
      body: JSON.stringify({ sheet_count: restored, stock_state: "TỒN", modified: lot.modified }),
    });
    if (!update.ok) return { cut: cut.name, lot: cut.lot, ok: false, stamped: false, sheets: 0 };
    /**
     * Đóng dấu NGAY sau khi cộng tồn, và báo riêng khi đóng dấu hỏng.
     *
     * Cộng tồn xong mà phiếu vẫn mang trạng thái ĐÃ CẮT thì lần hoàn sau cộng thêm lần nữa
     * — tồn phình lên và không có gì báo. Đây là chỗ duy nhất trong đường hoàn cắt mà im
     * lặng gây hại thật, nên nó được nêu tên riêng chứ không gộp vào "có lỗi".
     */
    const stamped = await closeCut(call, cut, "ĐÃ HOÀN CẮT", note);
    return { cut: cut.name, lot: cut.lot, ok: true, stamped, sheets: Number(cut.sheets_cut ?? 0) };
  }));

  const done = results.filter((entry) => entry.ok);
  const failed = results.filter((entry) => !entry.ok);
  const unstamped = done.filter((entry) => !entry.stamped);
  if (unstamped.length) {
    return refuse(`Đã cộng lại tồn nhưng KHÔNG đóng dấu được phiếu ${unstamped.map((entry) => entry.cut).join(", ")} — kiểm tra phiếu đó trước khi hoàn tiếp, nếu không sẽ cộng tồn hai lần.`);
  }
  if (failed.length) {
    return refuse(`Hoàn được ${done.length}/${cuts.length} phiếu. Lô vừa thay đổi: ${failed.map((entry) => entry.lot).join(", ")}.${done.length ? ` ĐÃ HOÀN: ${done.map((entry) => entry.cut).join(", ")}.` : ""}`);
  }
  return answer({ reversed: done.map((entry) => entry.cut), sheets_restored: done.reduce((sum, entry) => sum + entry.sheets, 0), mode: "hoàn cắt" });
}

/**
 * TRẢ HÀNG — lá ĐÃ CẮT quay về kho. Nhập vào lô có khổ bằng RỘNG CẮT, không phải khổ gốc.
 *
 * Cột `returned_on` trên lô là của chính xưởng (file tồn có cột "ngày nhập lại"), nên hàng
 * trả về nhìn ra được ngay, không lẫn vào nhôm mới mua.
 */
async function returnCut(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const cuts = await openCuts(call, args);
  if (!cuts.length) return refuse("Không có phiếu cắt nào đang ở trạng thái ĐÃ CẮT cho chứng từ này.");
  const today = new Date().toISOString().slice(0, 10);
  const note = String(args.note ?? "Trả hàng");
  const done: string[] = [];
  const lotsTouched: string[] = [];
  /**
   * Trả hàng chạy TUẦN TỰ, khác với cắt và hoàn cắt — và đây là lý do.
   *
   * Hai phiếu trả cùng một mã, cùng màu, cùng khổ phải dồn vào MỘT lô. Chạy song song thì
   * cả hai cùng thấy "chưa có lô nào" rồi cùng tạo, và kho có hai dòng cho cùng một thứ —
   * thứ mà file Excel của xưởng vốn không có và không ai đi gộp lại. Chậm hơn ở đây là cái
   * giá đúng để trả.
   */
  for (const cut of cuts) {
    const source = await readDoc<{ profile?: string; colour?: string; generation?: string; warehouse?: string }>(call, "Aluminium Lot", cut.lot);
    const width = Number(Number(cut.cut_width_m).toFixed(4));
    const existing = (await readLots(call, String(source.profile ?? ""), String(source.colour ?? ""), String(source.generation ?? "")))
      .find((lot) => Math.abs(lot.width_m - width) < 1e-6 && lot.warehouse === source.warehouse);
    if (existing) {
      const fresh = await readDoc<{ sheet_count?: number }>(call, "Aluminium Lot", existing.name);
      const update = await call(`resource/Aluminium%20Lot/${encodeURIComponent(existing.name)}`, {
        method: "PUT",
        body: JSON.stringify({
          sheet_count: Number(fresh.sheet_count ?? 0) + Number(cut.sheets_cut ?? 0),
          stock_state: "TỒN", returned_on: today, modified: fresh.modified,
        }),
      });
      if (!update.ok) return refuse(`Lô ${existing.name} vừa thay đổi, trả lại từ đầu.${done.length ? ` ĐÃ TRẢ: ${done.join(", ")}.` : ""}`);
      lotsTouched.push(existing.name);
    } else {
      const created = await call("resource/Aluminium%20Lot", {
        method: "POST",
        body: JSON.stringify({
          profile: source.profile, colour: source.colour, generation: source.generation,
          width_m: width, sheet_count: cut.sheets_cut, warehouse: source.warehouse,
          returned_on: today, stock_state: "TỒN", note: `Trả về từ ${cut.voucher_no}`,
        }),
      });
      if (!created.ok) return refuse(`Không tạo được lô nhận hàng trả cho phiếu ${cut.name}.${done.length ? ` ĐÃ TRẢ: ${done.join(", ")}.` : ""}`);
      lotsTouched.push(((await created.json()) as { data?: { name?: string } }).data?.name ?? "");
    }
    if (!(await closeCut(call, cut, "ĐÃ TRẢ HÀNG", note))) {
      return refuse(`Đã nhập lại lá của phiếu ${cut.name} nhưng KHÔNG đóng dấu được phiếu — kiểm tra trước khi trả tiếp.`);
    }
    done.push(cut.name);
  }
  return answer({ returned: done, lots: lotsTouched, mode: "trả hàng" });
}

/** Dòng hàng chép từ báo giá sang đơn. Field nào nhân O2C đọc thì phải qua nguyên vẹn. */
const QUOTE_LINE_FIELDS = [
  "item_code", "item_name", "inventory_mode", "measurement_profile", "min_area_sqm",
  "width_m", "height_m", "mesh_height_m", "set_count", "sales_mode", "has_butterfly_bracket",
  "formula_policy", "width_basis", "cut_width_m", "billable_area_sqm", "length_m", "qty_bar",
  "qty", "uom", "conversion_factor", "stock_uom", "stock_qty", "rate", "amount",
  "color", "motor_model", "accessories", "note",
] as const;

interface QuotationDoc {
  name: string;
  customer?: string;
  company?: string;
  currency?: string;
  selling_price_list?: string;
  customer_group?: string;
  install_address?: string;
  workflow_state?: string;
  converted_to?: string;
  items?: Array<Record<string, unknown>>;
  modified?: string;
}

/**
 * Báo giá đọc được và ĐỦ ĐIỀU KIỆN chuyển thành đơn.
 *
 * Hai chốt, và cả hai đều là chốt nghiệp vụ chứ không phải kiểm dữ liệu:
 *
 *  · Chỉ chuyển báo giá KHÁCH ĐÃ ĐỒNG Ý. Chuyển một báo giá còn đang thương lượng là đưa
 *    một giá chưa chốt vào sổ, và giá đó sẽ đi thẳng ra hoá đơn.
 *  · Chuyển lần thứ hai bị TỪ CHỐI. Hai đơn cho cùng một báo giá là sản xuất hai lần, giao
 *    hai lần, và công nợ gấp đôi — không ai đọc lại danh sách đơn để phát hiện.
 */
async function loadQuotation(call: PlatformCall, name: string): Promise<QuotationDoc> {
  if (!name) throw new Error("Cần chọn báo giá.");
  const quote = await readDoc<QuotationDoc>(call, "Quotation", name);
  if (quote.converted_to) throw new Error(`Báo giá ${name} đã thành đơn ${quote.converted_to} — không tạo đơn thứ hai.`);
  if (quote.workflow_state !== "Khách đồng ý") {
    throw new Error(`Báo giá ${name} đang ở trạng thái "${quote.workflow_state ?? "Nháp"}". Chỉ chuyển được báo giá KHÁCH ĐÃ ĐỒNG Ý.`);
  }
  if (!quote.items?.length) throw new Error(`Báo giá ${name} không có dòng hàng nào.`);
  return quote;
}

function orderLines(quote: QuotationDoc): Array<Record<string, unknown>> {
  return (quote.items ?? []).map((line, index) => {
    const copied: Record<string, unknown> = { row_id: `R${index + 1}` };
    for (const field of QUOTE_LINE_FIELDS) if (line[field] !== undefined && line[field] !== null && line[field] !== "") copied[field] = line[field];
    if (!copied.install_note && line.note) copied.install_note = line.note;
    return copied;
  });
}

/** Xem đơn SẼ tạo. Chỉ đọc — kinh doanh soát số đo trước khi nó thành một tờ lệnh cắt. */
async function previewQuote(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  let quote: QuotationDoc;
  try { quote = await loadQuotation(call, String(args.quotation ?? "")); } catch (error) { return refuse(error instanceof Error ? error.message : "không đọc được báo giá"); }
  const items = orderLines(quote);
  return answer({
    quotation: quote.name, customer: quote.customer,
    ...(quote.selling_price_list ? { selling_price_list: quote.selling_price_list } : {}),
    items,
    /**
     * Tổng ở đây là tổng của BÁO GIÁ, và nói rõ như vậy.
     *
     * Khi đơn có bảng giá, server sẽ định giá lại theo `Item Price` và có thể ra con số
     * khác. Gọi nó là "tổng đơn hàng" thì lúc lệch, người dùng tin bản xem trước.
     */
    lines: items.length,
    ...(quote.selling_price_list
      ? { message: `Đơn sẽ áp bảng giá ${quote.selling_price_list} — SERVER định giá lại, tổng có thể khác báo giá.` }
      : {}),
  });
}

/** Đơn hàng đã tạo từ báo giá này, nếu có. Đọc theo LIÊN KẾT chứ không theo dấu trên báo giá. */
async function orderFor(call: PlatformCall, quotation: string): Promise<string | null> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["against_quotation", "=", quotation]]),
    limit_page_length: "1",
  });
  const response = await call(`resource/Sales%20Order?${query}`);
  if (!response.ok) return null;
  return ((await response.json()) as { data?: Array<{ name?: string }> }).data?.[0]?.name ?? null;
}

/**
 * Tạo đơn từ báo giá — bấm lại bao nhiêu lần cũng chỉ ra MỘT đơn.
 *
 * Tính bất biến này không phải để cho đẹp. Nền tảng cắt một lời gọi app ở 5 giây, và lần
 * chạy thật đầu tiên đã vượt: đơn ĐƯỢC tạo, nhưng người bấm thấy "hết giờ" nên bấm lại, và
 * lần thứ hai tạo đơn thứ hai. Hai đơn cho một báo giá là sản xuất hai lần, giao hai lần,
 * công nợ gấp đôi — và không ai đọc lại danh sách đơn để phát hiện.
 *
 * Chốt không nằm ở dấu `converted_to` trên báo giá: dấu đó được ghi SAU khi đơn đã tồn tại,
 * nên đúng khoảng giữa hai lệnh ghi là lúc nguy hiểm nhất. Chốt nằm ở việc HỎI THẲNG: đã có
 * đơn nào trỏ về báo giá này chưa. Câu hỏi đó đúng ở mọi thời điểm, kể cả khi lần trước chết
 * giữa chừng.
 */
async function convertQuote(call: PlatformCall, args: Record<string, unknown>, ctx?: ExecutionContext): Promise<Response> {
  const name = String(args.quotation ?? "");
  /**
   * Đọc báo giá và hỏi "đã có đơn chưa" CÙNG LÚC — hai câu hỏi độc lập.
   *
   * Mỗi lần gọi ngược tốn ~1,2 giây (app → gateway → tenant, hai chặng), và nền tảng cắt
   * một lời gọi app ở 5 giây. Xếp bốn lần gọi nối đuôi nhau là 5,9 giây — đo được, và đó
   * chính là lần chạy đã hết giờ giữa chừng rồi tạo ra đơn thứ hai.
   */
  let quote: QuotationDoc;
  let existing: string | null;
  try {
    [quote, existing] = await Promise.all([loadQuotation(call, name), orderFor(call, name)]);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "không đọc được báo giá");
  }

  if (existing) {
    // Không phải lỗi: lần trước đã xong, chỉ là người gọi không nhận được câu trả lời.
    ctx?.waitUntil(stampQuotation(call, quote, existing));
    return answer({ sales_order: existing, quotation: quote.name, items: orderLines(quote), lines: (quote.items ?? []).length, already: true });
  }

  const created = await call("resource/Sales%20Order", {
    method: "POST",
    body: JSON.stringify({
      customer: quote.customer, company: quote.company, currency: quote.currency,
      transaction_date: new Date().toISOString().slice(0, 10),
      ...(args.delivery_date ? { delivery_date: String(args.delivery_date) } : {}),
      against_quotation: quote.name,
      ...(quote.selling_price_list ? { selling_price_list: quote.selling_price_list } : {}),
      ...(quote.customer_group ? { customer_group: quote.customer_group } : {}),
      ...(quote.install_address ? { install_address: quote.install_address } : {}),
      items: orderLines(quote),
      note: String(args.note ?? `Theo báo giá ${quote.name}`),
    }),
  });
  if (!created.ok) return refuse(`Không tạo được đơn hàng: ${(await created.text()).slice(0, 200)}`);
  const order = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";

  /**
   * Đóng dấu chạy SAU khi đã trả lời, và không ai phải chờ nó.
   *
   * `converted_to` giờ chỉ để người dùng nhìn thấy trên báo giá; thứ ngăn tạo đơn thứ hai
   * là câu hỏi "đã có đơn nào trỏ về báo giá này chưa" ở trên. Bắt người dùng chờ thêm 1,2
   * giây cho một dòng chữ trang trí là cách chắc chắn nhất để vượt hạn 5 giây — và vượt hạn
   * ở đây tốn kém hơn nhiều so với một dấu ghi muộn nửa giây.
   */
  ctx?.waitUntil(stampQuotation(call, quote, order));
  return answer({ sales_order: order, quotation: quote.name, items: orderLines(quote), lines: (quote.items ?? []).length });
}

/** Ghi dấu lên báo giá. `modified` lấy từ lần đọc đầu — thêm một lần đọc nữa là thêm một vòng chờ. */
async function stampQuotation(call: PlatformCall, quote: QuotationDoc, order: string): Promise<boolean> {
  if (quote.converted_to === order) return true;
  const response = await call(`resource/Quotation/${encodeURIComponent(quote.name)}`, {
    method: "PUT",
    body: JSON.stringify({ converted_to: order, modified: quote.modified }),
  });
  return response.ok;
}

/** Field của dòng mua mà nhân O2P ĐỌC. Chép thiếu `uom`/`conversion_factor` là mất quy đổi. */
const PURCHASE_LINE_FIELDS = [
  "item_code", "item_name", "inventory_mode", "measurement_profile", "stock_uom", "min_area_sqm", "color",
  "width_m", "height_m", "set_count",
  "length_m", "qty_bundle", "qty_bar", "actual_weight_kg", "total_length_m", "actual_kg_per_m", "so_no",
  "qty", "uom", "conversion_factor", "stock_qty", "rate", "amount", "note",
] as const;

interface PurchaseDoc {
  name: string;
  supplier?: string;
  company?: string;
  currency?: string;
  supplier_group?: string;
  buying_price_list?: string;
  schedule_date?: string;
  items?: Array<Record<string, unknown>>;
  modified?: string;
}

function purchaseLines(source: PurchaseDoc, warehouse: string): Array<Record<string, unknown>> {
  return (source.items ?? []).map((line, index) => {
    const copied: Record<string, unknown> = { row_id: `R${index + 1}` };
    for (const field of PURCHASE_LINE_FIELDS) if (line[field] !== undefined && line[field] !== null && line[field] !== "") copied[field] = line[field];
    const target = warehouse || String(line.warehouse ?? "");
    if (target) copied.warehouse = target;
    return copied;
  });
}

async function loadSupplierQuotation(call: PlatformCall, name: string): Promise<PurchaseDoc> {
  if (!name) throw new Error("Cần chọn báo giá nhà cung cấp.");
  const quotation = await readDoc<PurchaseDoc & { docstatus?: number }>(call, "Supplier Quotation", name);
  if (quotation.docstatus !== 1) throw new Error(`Báo giá ${name} chưa ghi sổ — chỉ chuyển được báo giá đã ghi sổ.`);
  if (!quotation.items?.length) throw new Error(`Báo giá ${name} không có dòng hàng nào.`);
  return quotation;
}

/** Đơn mua đã tạo từ báo giá này, nếu có. Hỏi theo LIÊN KẾT, không theo dấu trên báo giá. */
async function orderForQuotation(call: PlatformCall, quotation: string): Promise<string | null> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["supplier_quotation", "=", quotation]]),
    limit_page_length: "1",
  });
  const response = await call(`resource/Purchase%20Order?${query}`);
  if (!response.ok) return null;
  return ((await response.json()) as { data?: Array<{ name?: string }> }).data?.[0]?.name ?? null;
}

async function previewPurchaseOrder(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  let quotation: PurchaseDoc;
  try { quotation = await loadSupplierQuotation(call, String(args.supplier_quotation ?? "")); } catch (error) { return refuse(error instanceof Error ? error.message : "không đọc được báo giá"); }
  const items = purchaseLines(quotation, String(args.warehouse ?? ""));
  return answer({ supplier_quotation: quotation.name, supplier: quotation.supplier, items, lines: items.length });
}

/**
 * Báo giá NCC → đơn mua. Bấm lại bao nhiêu lần cũng chỉ ra MỘT đơn.
 *
 * Cùng khuôn với `convertQuote` bên bán, và vì đúng một lý do: lần chạy thật đầu tiên của
 * bản bán đã vượt hạn giờ, đơn ĐƯỢC tạo nhưng người bấm thấy "hết giờ" nên bấm lại — và
 * lần thứ hai tạo đơn thứ hai. Ở phía mua, đơn thứ hai nghĩa là NCC giao gấp đôi và công
 * nợ gấp đôi. Chốt nằm ở câu hỏi "đã có đơn nào trỏ về báo giá này chưa", đúng ở mọi thời
 * điểm kể cả khi lần trước chết giữa chừng.
 */
async function orderFromSupplierQuotation(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const name = String(args.supplier_quotation ?? "");
  let quotation: PurchaseDoc;
  let existing: string | null;
  try {
    [quotation, existing] = await Promise.all([loadSupplierQuotation(call, name), orderForQuotation(call, name)]);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "không đọc được báo giá");
  }
  const items = purchaseLines(quotation, String(args.warehouse ?? ""));
  if (existing) return answer({ purchase_order: existing, supplier_quotation: quotation.name, items, lines: items.length, already: true });

  const created = await call("resource/Purchase%20Order", {
    method: "POST",
    body: JSON.stringify({
      supplier: quotation.supplier, company: quotation.company, currency: quotation.currency,
      transaction_date: new Date().toISOString().slice(0, 10),
      ...(args.schedule_date ? { schedule_date: String(args.schedule_date) } : {}),
      supplier_quotation: quotation.name,
      items,
    }),
  });
  if (!created.ok) return refuse(`Không tạo được đơn mua: ${(await created.text()).slice(0, 200)}`);
  const order = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";
  return answer({ purchase_order: order, supplier_quotation: quotation.name, items, lines: items.length });
}

/**
 * Số ĐÃ nhận theo từng mã hàng của một đơn mua.
 *
 * Cộng từ chính các phiếu nhập ĐÃ GHI SỔ, không đọc `received_percentage` — cột phần trăm
 * là con số của cả phiếu, không tách được theo mã hàng, mà một đơn có thể về đủ mặt này và
 * thiếu mặt kia. Cộng theo `stock_qty` vì đơn có thể đặt bằng CÂY còn phiếu nhận ghi MÉT.
 *
 * Đọc các phiếu SONG SONG: mỗi lần gọi ngược tốn ~1,2 giây và nền tảng cắt lời gọi app ở
 * 10 giây, nên ba phiếu xếp nối đuôi đã là quá nửa hạn giờ.
 */
async function receivedByItem(call: PlatformCall, order: string): Promise<Map<string, number>> {
  const received = new Map<string, number>();
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["against_purchase_order", "=", order], ["docstatus", "=", 1]]),
    limit_page_length: "20",
  });
  const listed = await call(`resource/Purchase%20Receipt?${query}`);
  if (!listed.ok) return received;
  const names = (((await listed.json()) as { data?: Array<{ name?: string }> }).data ?? [])
    .map((row) => row.name).filter((value): value is string => Boolean(value));
  if (!names.length) return received;
  const receipts = await Promise.all(names.map(async (receipt) => {
    try { return await readDoc<PurchaseDoc>(call, "Purchase Receipt", receipt); } catch { return null; }
  }));
  for (const receipt of receipts) {
    for (const line of receipt?.items ?? []) {
      const code = String(line.item_code ?? "");
      if (!code) continue;
      const quantity = Number(line.stock_qty ?? line.qty ?? 0);
      if (Number.isFinite(quantity)) received.set(code, (received.get(code) ?? 0) + quantity);
    }
  }
  return received;
}

/** Phần CÒN LẠI của một đơn mua, theo từng dòng. Dòng đã về đủ thì biến mất khỏi phiếu. */
async function remainingLines(call: PlatformCall, order: string, warehouse: string): Promise<{ purchase: PurchaseDoc; items: Array<Record<string, unknown>> }> {
  const [purchase, received] = await Promise.all([
    readDoc<PurchaseDoc & { docstatus?: number }>(call, "Purchase Order", order),
    receivedByItem(call, order),
  ]);
  if (purchase.docstatus !== 1) throw new Error(`Đơn mua ${order} chưa ghi sổ.`);
  const items: Array<Record<string, unknown>> = [];
  for (const [index, line] of (purchase.items ?? []).entries()) {
    const code = String(line.item_code ?? "");
    if (!code) continue;
    const factor = Number(line.conversion_factor ?? 1) || 1;
    const orderedStock = Number(line.stock_qty ?? line.qty ?? 0);
    /**
     * Số đã nhận đếm theo MÃ HÀNG, còn đơn có thể có HAI dòng cùng mã (hai khổ, hai màu).
     * Nên phải rót số đã nhận vào các dòng theo thứ tự, hết dòng này mới sang dòng sau —
     * chia đều hay trừ thẳng vào từng dòng đều làm dòng đầu hiện thiếu và dòng sau hiện dư.
     */
    const pool = received.get(code) ?? 0;
    const consumed = Math.min(pool, orderedStock);
    received.set(code, pool - consumed);
    const outstandingStock = orderedStock - consumed;
    if (outstandingStock <= 0) continue;
    const copied: Record<string, unknown> = { row_id: `R${index + 1}`, purchase_order: order };
    for (const field of PURCHASE_LINE_FIELDS) if (line[field] !== undefined && line[field] !== null && line[field] !== "") copied[field] = line[field];
    // `qty` trả về ĐƠN VỊ MUA — thủ kho đếm cây, không đếm mét.
    copied.qty = Number((outstandingStock / factor).toFixed(6));
    const target = warehouse || String(line.warehouse ?? "");
    if (target) copied.warehouse = target;
    items.push(copied);
  }
  return { purchase, items };
}

async function previewPurchaseReceipt(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const order = String(args.purchase_order ?? "");
  if (!order) return refuse("Cần chọn đơn mua.");
  try {
    const { purchase, items } = await remainingLines(call, order, String(args.warehouse ?? ""));
    return answer({
      purchase_order: order, supplier: purchase.supplier, items, lines: items.length,
      ...(items.length ? {} : { message: `Đơn mua ${order} đã nhận đủ — không còn gì để nhập.` }),
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "không đọc được đơn mua");
  }
}

/**
 * Tạo phiếu nhập NHÁP, không ghi sổ.
 *
 * Cố ý dừng ở nháp: số trên đơn là số ĐẶT, số vào kho phải là số ĐẾM ĐƯỢC. Hàng về thiếu
 * vài cây, hoặc một cây móp phải trả lại ngay tại xe, là chuyện thường ngày — ghi sổ hộ
 * thủ kho là ghi vào kho một con số chưa ai nhìn thấy.
 */
async function receiptFromPurchaseOrder(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const order = String(args.purchase_order ?? "");
  if (!order) return refuse("Cần chọn đơn mua.");
  let purchase: PurchaseDoc;
  let items: Array<Record<string, unknown>>;
  try { ({ purchase, items } = await remainingLines(call, order, String(args.warehouse ?? ""))); } catch (error) { return refuse(error instanceof Error ? error.message : "không đọc được đơn mua"); }
  if (!items.length) return refuse(`Đơn mua ${order} đã nhận đủ — không còn gì để nhập.`);

  const created = await call("resource/Purchase%20Receipt", {
    method: "POST",
    body: JSON.stringify({
      supplier: purchase.supplier, company: purchase.company, currency: purchase.currency,
      against_purchase_order: order,
      posting_at: new Date().toISOString(),
      ...(args.supplier_invoice_no ? { supplier_invoice_no: String(args.supplier_invoice_no) } : {}),
      ...(args.driver ? { driver: String(args.driver) } : {}),
      items,
      note: `Nháp theo đơn mua ${order} — sửa lại số THỰC ĐẾM trước khi ghi sổ.`,
    }),
  });
  if (!created.ok) return refuse(`Không tạo được phiếu nhập: ${(await created.text()).slice(0, 200)}`);
  const receipt = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";
  return answer({ purchase_receipt: receipt, purchase_order: order, items, lines: items.length, draft: true });
}

interface SalesOrderDoc {
  name: string;
  docstatus?: number;
  customer?: string;
  customer_group?: string;
  company?: string;
  currency?: string;
  install_address?: string;
  items?: Array<Record<string, unknown>>;
}

const SALES_DELIVERY_LINE_FIELDS = [
  ...QUOTE_LINE_FIELDS,
  "install_note", "warehouse",
] as const;

/** Số đã giao được đọc từ các phiếu xuất ĐÃ GHI SỔ, theo đơn vị tồn. */
async function deliveredByItem(call: PlatformCall, order: string): Promise<Map<string, number>> {
  const delivered = new Map<string, number>();
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["against_sales_order", "=", order], ["docstatus", "=", 1]]),
    limit_page_length: "50",
  });
  const listed = await call(`resource/Delivery%20Note?${query}`);
  if (!listed.ok) return delivered;
  const names = (((await listed.json()) as { data?: Array<{ name?: string }> }).data ?? [])
    .map((row) => row.name).filter((value): value is string => Boolean(value));
  const notes = await Promise.all(names.map(async (name) => {
    try { return await readDoc<SalesOrderDoc>(call, "Delivery Note", name); } catch { return null; }
  }));
  for (const note of notes) {
    for (const line of note?.items ?? []) {
      const code = String(line.item_code ?? "");
      const quantity = Number(line.stock_qty ?? line.qty ?? 0);
      if (code && Number.isFinite(quantity)) delivered.set(code, (delivered.get(code) ?? 0) + quantity);
    }
  }
  return delivered;
}

/** Phần chưa giao của đơn bán; giữ nguyên màu, kích thước, ĐVT và kho của từng dòng. */
async function remainingDeliveryLines(
  call: PlatformCall,
  order: string,
  warehouse: string,
): Promise<{ sales: SalesOrderDoc; items: Array<Record<string, unknown>> }> {
  const [sales, delivered] = await Promise.all([
    readDoc<SalesOrderDoc>(call, "Sales Order", order),
    deliveredByItem(call, order),
  ]);
  if (sales.docstatus !== 1) throw new Error(`Đơn hàng ${order} chưa ghi sổ.`);
  const items: Array<Record<string, unknown>> = [];
  for (const [index, line] of (sales.items ?? []).entries()) {
    const code = String(line.item_code ?? "");
    if (!code) continue;
    const orderedStock = Number(line.stock_qty ?? line.qty ?? 0);
    const pool = delivered.get(code) ?? 0;
    const consumed = Math.min(pool, orderedStock);
    delivered.set(code, pool - consumed);
    const outstandingStock = orderedStock - consumed;
    if (outstandingStock <= 0) continue;
    const orderedQty = Number(line.qty ?? 0);
    const copied: Record<string, unknown> = { row_id: `R${index + 1}` };
    for (const field of SALES_DELIVERY_LINE_FIELDS) {
      if (line[field] !== undefined && line[field] !== null && line[field] !== "") copied[field] = line[field];
    }
    copied.qty = orderedStock > 0 ? Number((orderedQty * outstandingStock / orderedStock).toFixed(6)) : orderedQty;
    copied.stock_qty = Number(outstandingStock.toFixed(6));
    if (String(line.inventory_mode ?? "") === "Thành phẩm theo m2"
      && ["bộ", "bo", "set"].includes(normalizedUom(String(line.stock_uom ?? "")))) {
      copied.set_count = Number(outstandingStock.toFixed(6));
    }
    const target = warehouse || String(line.warehouse ?? "");
    if (target) copied.warehouse = target;
    items.push(copied);
  }
  return { sales, items };
}

async function previewDelivery(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const order = String(args.sales_order ?? "");
  if (!order) return refuse("Cần chọn đơn hàng.");
  try {
    const { sales, items } = await remainingDeliveryLines(call, order, String(args.warehouse ?? ""));
    return answer({
      sales_order: order, customer: sales.customer, install_address: sales.install_address, items, lines: items.length,
      ...(items.length ? {} : { message: `Đơn hàng ${order} đã giao đủ.` }),
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "không đọc được đơn hàng");
  }
}

/** Tạo phiếu xuất NHÁP; thủ kho vẫn là người xác nhận số thực giao trước khi ghi sổ. */
async function deliveryFromSalesOrder(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const order = String(args.sales_order ?? "");
  if (!order) return refuse("Cần chọn đơn hàng.");
  let sales: SalesOrderDoc;
  let items: Array<Record<string, unknown>>;
  try { ({ sales, items } = await remainingDeliveryLines(call, order, String(args.warehouse ?? ""))); }
  catch (error) { return refuse(error instanceof Error ? error.message : "không đọc được đơn hàng"); }
  if (!items.length) return refuse(`Đơn hàng ${order} đã giao đủ.`);
  if (!sales.install_address && !args.install_address) return refuse(`Đơn hàng ${order} chưa có địa chỉ giao / lắp đặt.`);
  const created = await call("resource/Delivery%20Note", {
    method: "POST",
    body: JSON.stringify({
      customer: sales.customer,
      ...(sales.customer_group ? { customer_group: sales.customer_group } : {}),
      company: sales.company,
      currency: sales.currency,
      against_sales_order: order,
      posting_at: new Date().toISOString(),
      install_address: String(args.install_address ?? sales.install_address ?? ""),
      ...(args.install_date ? { install_date: String(args.install_date) } : {}),
      ...(args.installer ? { installer: String(args.installer) } : {}),
      ...(args.driver ? { driver: String(args.driver) } : {}),
      ...(args.vehicle ? { vehicle: String(args.vehicle) } : {}),
      items,
      note: `Nháp theo đơn hàng ${order} — soát số thực giao trước khi ghi sổ.`,
    }),
  });
  if (!created.ok) return refuse(`Không tạo được phiếu xuất: ${(await created.text()).slice(0, 200)}`);
  const delivery = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";
  return answer({ delivery_note: delivery, sales_order: order, items, lines: items.length, draft: true });
}

// ── ẢNH BẢNG GIÁ → DÒNG HÀNG ────────────────────────────────────────────────

/**
 * Mô hình đọc ảnh, xếp theo thứ tự thử.
 *
 * Mistral Small 3.1 24B trước vì nó là model thị giác lớn nhất Workers AI có và đọc chữ
 * tiếng Việt CÓ DẤU khá hơn hẳn; Llama 3.2 Vision là đường lui khi model đầu bận hoặc lỗi.
 * Hỏng cả hai thì TỪ CHỐI — không có đường lui nào là "đoán bừa vài dòng".
 */
const VISION_MODELS = ["@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/meta/llama-3.2-11b-vision-instruct"] as const;

/**
 * Lời dặn cho mô hình. Ba điều quan trọng, và cả ba đều là chống-bịa:
 *
 *   · CHỈ chép thứ NHÌN THẤY. Bảng giá thiếu cột số lượng thì để trống, đừng suy ra 1.
 *   · Số giữ NGUYÊN cách viết trên ảnh ("98.000", không phải 98000) — bộ đọc số ở
 *     `ocr.ts` biết luật dấu chấm/phẩy tiếng Việt, còn mô hình thì không đáng tin ở đó.
 *   · KHÔNG tự nghĩ ra mã hàng. Việc khớp mã do `matchItem` làm bằng luật xác định; mô
 *     hình đoán trúng một mã có thật nhưng SAI là hỏng tệ nhất, vì chứng từ trông hợp lệ.
 */
const OCR_PROMPT = [
  "Bạn đọc một ảnh chụp chứng từ mua hàng của xưởng cửa cuốn Việt Nam (bảng giá, báo giá, phiếu giao hàng hoặc hoá đơn nhà cung cấp).",
  "Trả về DUY NHẤT một mảng JSON, không giải thích, không bọc trong markdown.",
  'Mỗi phần tử: {"item": "tên/mã hàng đúng như in trên ảnh", "qty": "số lượng", "uom": "đơn vị", "rate": "đơn giá", "amount": "thành tiền"}.',
  "QUY TẮC BẮT BUỘC:",
  "- Chỉ chép những gì NHÌN THẤY. Ô nào trống trên ảnh thì bỏ khoá đó đi, TUYỆT ĐỐI không suy đoán hay điền mặc định.",
  '- Giữ NGUYÊN cách viết số của ảnh, kể cả dấu chấm và dấu phẩy: viết "98.000" chứ không viết 98000.',
  "- Không tự nghĩ ra mã hàng. Chép đúng chữ ở cột tên hàng.",
  "- Bỏ qua dòng tiêu đề, dòng tổng cộng và dòng ghi chú.",
].join("\n");

interface AiRunner { run: (model: string, input: Record<string, unknown>) => Promise<unknown> }

/** Danh mục hàng hoá, để khớp mã. Một lần đọc, dùng cho mọi dòng của ảnh. */
async function readCatalog(call: PlatformCall): Promise<Array<{ item_code: string; item_name?: string }>> {
  const query = new URLSearchParams({ fields: JSON.stringify(["item_code", "item_name"]), limit_page_length: "500" });
  const response = await call(`resource/Item?${query}`);
  if (!response.ok) return [];
  const rows = ((await response.json()) as { data?: Array<Record<string, unknown>> }).data ?? [];
  return rows
    .map((row) => ({ item_code: String(row.item_code ?? ""), ...(row.item_name ? { item_name: String(row.item_name) } : {}) }))
    .filter((row) => row.item_code);
}

/** Ảnh đã tải lên → base64. Đường duy nhất, vì `/files/<id>` nằm ngoài tầm gọi ngược của app. */
async function readImage(call: PlatformCall, fileUrl: string): Promise<{ base64: string; content_type: string }> {
  const response = await call("method/forge.files.content", { method: "POST", body: JSON.stringify({ file: fileUrl }) });
  if (!response.ok) throw new Error(`không đọc được ảnh: ${(await response.text()).slice(0, 160)}`);
  const body = (await response.json()) as { message?: { base64?: string; content_type?: string } };
  const base64 = body.message?.base64;
  if (!base64) throw new Error("ảnh rỗng hoặc không đọc được");
  return { base64, content_type: body.message?.content_type ?? "image/jpeg" };
}

async function readWithVision(ai: AiRunner, image: { base64: string; content_type: string }): Promise<string> {
  const failures: string[] = [];
  for (const model of VISION_MODELS) {
    try {
      const output = await ai.run(model, {
        max_tokens: 2048,
        temperature: 0,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image_url", image_url: { url: `data:${image.content_type};base64,${image.base64}` } },
          ],
        }],
      }) as { response?: string; result?: { response?: string } } | string;
      const text = typeof output === "string" ? output : output?.response ?? output?.result?.response ?? "";
      if (text.trim()) return text;
      failures.push(`${model}: trả lời rỗng`);
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message : "lỗi"}`);
    }
  }
  throw new Error(`không mô hình nào đọc được ảnh (${failures.join(" · ")})`);
}

/**
 * Chứng từ đích, và ba tính chất của mỗi cái mà bản dựng dòng phải biết.
 *
 * `lineWarehouse` là chỗ dễ sai: dòng BÁO GIÁ NCC KHÔNG có cột kho — báo giá là lời chào
 * giá, chưa dính đến kho nào. Gửi `warehouse` vào đó là gửi một field không doctype nào
 * khai, tức là đúng cái kiểu "khai một thứ không ai đọc" mà cả dự án này chống.
 */
const OCR_TARGETS = {
  "Báo giá NCC": { doctype: "Supplier Quotation", lineWarehouse: false, requireWarehouse: false },
  "Đơn mua hàng": { doctype: "Purchase Order", lineWarehouse: true, requireWarehouse: false },
  "Phiếu nhập mua": { doctype: "Purchase Receipt", lineWarehouse: true, requireWarehouse: true },
  "Hoá đơn mua": { doctype: "Purchase Invoice", lineWarehouse: true, requireWarehouse: false },
} as const;
type OcrTargetName = keyof typeof OCR_TARGETS;

/**
 * Đọc ảnh và trả về những gì đọc được — KHÔNG ghi gì.
 *
 * Luôn trả cả dòng chưa khớp được mã, kèm chữ gốc. Lọc chúng đi sẽ khiến bảng xem trước
 * trông sạch sẽ trong khi một nửa tấm bảng giá đã biến mất — người soát không có cách nào
 * biết là thiếu.
 */
async function parseOcr(call: PlatformCall, env: Env, args: Record<string, unknown>): Promise<Response> {
  if (!env.AI) return refuse("Bản triển khai này chưa bật Workers AI.");
  const fileUrl = String(args.image ?? args.file ?? "");
  if (!fileUrl) return refuse("Cần chọn ảnh.");
  const targetName = String(args.target ?? "Báo giá NCC") as OcrTargetName;
  const target = OCR_TARGETS[targetName];
  if (!target) return refuse(`Không tạo được "${targetName}". Chọn một trong: ${Object.keys(OCR_TARGETS).join(", ")}.`);

  let image: { base64: string; content_type: string };
  let catalog: Array<{ item_code: string; item_name?: string }>;
  try {
    // Hai lượt đọc độc lập → chạy song song. Mỗi lượt gọi ngược tốn ~1,2 giây và nền tảng
    // cắt lời gọi app ở 10 giây, mà bản thân mô hình đã ăn vài giây.
    [image, catalog] = await Promise.all([readImage(call, fileUrl), readCatalog(call)]);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "không đọc được ảnh");
  }

  let raw: string;
  try { raw = await readWithVision(env.AI, image); } catch (error) { return refuse(error instanceof Error ? error.message : "mô hình không đọc được ảnh"); }

  const parsed = extractJson(raw);
  if (parsed === null) return refuse("Mô hình không trả về dữ liệu đọc được. Chụp lại rõ hơn, đủ sáng, và thẳng góc với tờ giấy.");
  const rows = buildRows(parsed, catalog);
  if (!rows.length) return refuse("Không đọc được dòng hàng nào trong ảnh.");

  const matched = rows.filter((row) => row.item_code).length;
  /**
   * Nói rõ có bao nhiêu dòng khớp kiểu ĐOÁN-THEO-CHUỖI, không chỉ nói tổng số khớp.
   *
   * Ba kiểu khớp không ngang nhau: trùng mã và trùng tên là chắc chắn, còn `contains`
   * ("AL548 màu GS 3m9" chứa mã "AL548") là suy ra. Gộp cả ba vào một con số "khớp 9
   * dòng" khiến người soát yên tâm với đúng những dòng đáng ngờ nhất — mà đó lại là kiểu
   * hỏng tệ nhất của cả tính năng này: mã CÓ THẬT nhưng SAI.
   */
  const guessed = rows.filter((row) => row.confidence === "contains").length;
  return answer({
    target: targetName, doctype: target.doctype, items: rows, lines: rows.length, matched, guessed,
    message: [
      `Đọc được ${rows.length} dòng, khớp được mã ${matched}.`,
      rows.length - matched ? `${rows.length - matched} dòng CHƯA có mã hàng — chọn tay trên chứng từ nháp.` : "",
      guessed ? `${guessed} dòng khớp mã bằng cách ĐOÁN theo tên — soát kỹ mấy dòng này nhất.` : "",
      "Máy đọc ảnh là để khỏi gõ, không phải khỏi nhìn: đối chiếu từng số với ảnh trước khi ghi sổ.",
    ].filter(Boolean).join(" "),
  });
}

/**
 * Tạo chứng từ NHÁP từ ảnh. Không bao giờ ghi sổ.
 *
 * Máy đọc ảnh là để khỏi gõ, không phải để khỏi nhìn. Một chữ số đọc nhầm trên cột đơn giá
 * là sai công nợ với nhà cung cấp, và không sổ nào kêu lên — nên bước người đọc lại là bước
 * bắt buộc, và cách chắc chắn nhất để nó xảy ra là dừng ở nháp.
 *
 * Dòng chưa khớp mã KHÔNG được đưa vào chứng từ: `item_code` là field bắt buộc, gửi lên
 * rỗng thì cả phiếu bị từ chối và người dùng mất luôn những dòng đã đọc đúng. Chúng được
 * trả về riêng để hiện ra màn hình.
 */
async function applyOcr(call: PlatformCall, env: Env, args: Record<string, unknown>): Promise<Response> {
  const preview = await parseOcr(call, env, args);
  if (!preview.ok) return preview;
  const read = await preview.json() as { target: OcrTargetName; items: OcrRow[]; lines: number; matched: number };
  const target = OCR_TARGETS[read.target];

  const warehouse = String(args.warehouse ?? "");
  if (target.requireWarehouse && !warehouse) return refuse("Phiếu nhập mua cần chọn kho nhập.");
  const supplier = String(args.supplier ?? "");
  if (!supplier) return refuse("Cần chọn nhà cung cấp.");

  const usable = read.items.filter((row) => row.item_code && (row.qty ?? 0) > 0);
  const skipped = read.items.filter((row) => !(row.item_code && (row.qty ?? 0) > 0));
  if (!usable.length) {
    return refuse(`Đọc được ${read.lines} dòng nhưng chưa dòng nào đủ mã hàng VÀ số lượng để dựng chứng từ. Xem trước để biết ảnh thiếu gì.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const items = usable.map((row, index) => ({
    row_id: `R${index + 1}`,
    item_code: row.item_code!,
    qty: String(row.qty),
    ...(row.uom ? { uom: row.uom } : {}),
    ...(row.rate ? { rate: String(row.rate) } : { rate: "0" }),
    ...(target.lineWarehouse && warehouse ? { warehouse } : {}),
    ...(read.target === "Hoá đơn mua" ? { expense_account: String(args.expense_account ?? "Hàng tồn kho") } : {}),
    note: row.note ?? row.raw_text,
  }));

  const header: Record<string, unknown> = {
    supplier, company: "ALUMDOOR", currency: "VND", items,
    note: `Đọc từ ảnh — SOÁT LẠI SỐ trước khi ghi sổ. ${skipped.length ? `${skipped.length} dòng không dựng được: ${skipped.map((row) => row.raw_text).join(" · ").slice(0, 300)}` : ""}`.trim(),
  };
  if (read.target === "Báo giá NCC" || read.target === "Đơn mua hàng") header.transaction_date = today;
  else header.posting_at = new Date().toISOString();
  if (read.target === "Hoá đơn mua") header.credit_to = String(args.credit_to ?? "Phải trả người bán");
  if (args.purchase_order) header.against_purchase_order = String(args.purchase_order);
  if (args.supplier_invoice_no) header.supplier_invoice_no = String(args.supplier_invoice_no);

  const created = await call(`resource/${encodeURIComponent(target.doctype)}`, { method: "POST", body: JSON.stringify(header) });
  if (!created.ok) return refuse(`Không tạo được ${read.target}: ${(await created.text()).slice(0, 220)}`);
  const name = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";

  return answer({
    target: read.target, doctype: target.doctype, name, draft: true,
    items: read.items, lines: read.lines, matched: read.matched, skipped: skipped.length,
    message: `Đã tạo ${read.target} NHÁP ${name} với ${usable.length}/${read.lines} dòng.`
      + (skipped.length ? ` ${skipped.length} dòng thiếu mã hàng hoặc số lượng — thêm tay rồi mới ghi sổ.` : "")
      + " Chưa ghi sổ: soát lại từng số so với ảnh trước khi duyệt.",
  });
}

function formulaPurpose(value: unknown): DoorFormulaPurpose {
  const text = String(value ?? "Bán hàng").trim();
  if (text === "Sản xuất" || text === "production") return "production";
  if (text === "Dự toán mua" || text === "purchase") return "purchase";
  if (text === "Tất cả" || text === "all") return "all";
  return "sales";
}

/**
 * Màn tính thử công thức cửa. Chỉ đọc, không ghi chứng từ.
 *
 * Item và Cutting Policy đều đọc từ server; client chỉ gửi số đo và tình huống bán. Nhờ đó
 * gọi API trực tiếp cũng không thể giả một barem hoặc số trừ có lợi hơn dữ liệu đã duyệt.
 */
async function calculateDoor(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const itemCode = String(args.item_code ?? "").trim();
  if (!itemCode) return refuse("Cần chọn mặt hàng cửa.");
  const customerName = String(args.customer ?? "").trim();
  const declaredGroup = String(args.customer_group ?? "").trim();
  const [item, policies, customer] = await Promise.all([
    readMaster(call, "Item", itemCode),
    readDoorPolicies(call),
    !declaredGroup && customerName ? readMaster(call, "Customer", customerName) : Promise.resolve(null),
  ]);
  if (!item) return refuse(`Mặt hàng ${itemCode} không tồn tại hoặc đã ngừng dùng.`);
  const doorType = inferDoorType(item.door_type, item.item_group);
  if (!doorType) return refuse(`${itemCode} chưa được phân loại là một loại cửa có công thức.`);
  const customerGroup = declaredGroup || String(customer?.price_group ?? "").trim();
  if (customerGroup !== "Đại lý" && customerGroup !== "Lẻ") {
    return refuse("Cần Nhóm giá Đại lý/Lẻ; nếu chọn khách thì phải hoàn thiện Nhóm giá trên hồ sơ khách.");
  }
  const rawMode = String(args.sales_mode ?? "Trọn bộ").trim();
  if (rawMode !== "Tách món" && rawMode !== "Trọn bộ") return refuse("Cách bán phải là Tách món hoặc Trọn bộ.");
  try {
    const policy = selectDoorPolicy(policies, doorType, String(item.item_group ?? ""));
    const result = calculateDoorFormula(policy, {
      door_type: doorType,
      item_group: String(item.item_group ?? ""),
      customer_group: customerGroup as CustomerGroup,
      sales_mode: rawMode as SalesMode,
      has_butterfly_bracket: checked(args.has_butterfly_bracket),
      is_manual_pull: checked(args.is_manual_pull) || isManualPullGroup(item.item_group),
      measured_width_m: Number(args.width_m),
      set_count: Number(args.set_count ?? 1),
      min_area_sqm: Number(item.min_area_sqm ?? 0) || 0,
      purpose: formulaPurpose(args.purpose),
      ...(args.height_m == null || args.height_m === "" ? {} : { cover_height_m: Number(args.height_m) }),
      ...(args.mesh_height_m == null || args.mesh_height_m === "" ? {} : { mesh_height_m: Number(args.mesh_height_m) }),
      ...(item.purchase_kg_per_m2 == null ? {} : { kg_per_m2: Number(item.purchase_kg_per_m2) }),
      ...(args.actual_purchase_kg == null || args.actual_purchase_kg === "" ? {} : { actual_purchase_kg: Number(args.actual_purchase_kg) }),
      ...(args.purchase_rate == null || args.purchase_rate === "" ? {} : { purchase_rate: Number(args.purchase_rate) }),
    });
    return answer({
      ...result,
      item_code: itemCode,
      item_group: item.item_group,
      results: [
        { chỉ_tiêu: "Cơ sở rộng", kết_quả: result.width_basis, đơn_vị: "" },
        { chỉ_tiêu: "Rộng cắt lá", kết_quả: result.cut_width_m, đơn_vị: "m" },
        ...(result.billable_area_sqm == null ? [] : [{ chỉ_tiêu: "Diện tích tính tiền", kết_quả: result.billable_area_sqm, đơn_vị: "m2" }]),
        ...(result.purchase_kg == null ? [] : [{ chỉ_tiêu: "Khối lượng mua dự toán", kết_quả: result.purchase_kg, đơn_vị: "Kg" }]),
        ...(result.purchase_amount == null ? [] : [{ chỉ_tiêu: "Tiền mua dự toán", kết_quả: result.purchase_amount, đơn_vị: "VND" }]),
      ],
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "không tính được công thức cửa");
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return answer({ ok: true, app: "alumdoor", platform_binding: Boolean(env.PLATFORM) });
    if (!request.headers.get("x-cloudforge-tenant")) {
      return new Response(JSON.stringify({ message: "not a platform call" }), { status: 403 });
    }
    try {
      if (url.pathname.startsWith("/api/method/")) {
        const method = decodeURIComponent(url.pathname.slice("/api/method/".length));
        const body = (await request.json().catch(() => ({}))) as { args?: Record<string, unknown> };
        const args = body.args ?? {};

        // Chia lá không cần đọc gì của tenant — thuần số học, nên không dựng đường gọi ngược.
        if (method === "alumdoor.slats.compute") {
          try {
            const kind = args.australian_kind ? String(args.australian_kind) as AustralianDoor : null;
            if (kind) return answer({ slats: australianSlatCount(kind, Number(args.height_m)), kind });
            return answer(slatCount(String(args.profile ?? ""), String(args.generation ?? "MỚI"), Number(args.height_m)));
          } catch (error) {
            return refuse(error instanceof Error ? error.message : "không tính được số lá");
          }
        }

        const call = platformCaller(request, env);
        if (method === "alumdoor.door.calculate") return await calculateDoor(call, args);
        if (method === "alumdoor.cut.propose") return await proposeCutV2(call, args);
        if (method === "alumdoor.cut.draft") return await draftCutV2(call, args);
        if (method === "alumdoor.cut.apply") return await applyCutV2(call, args);
        if (method === "alumdoor.cut.reverse") return await reverseCutV2(call, args);
        if (method === "alumdoor.cut.return") return await returnCutV2(call, args);
        if (method === "alumdoor.reserve.create") return await createReservationV2(call, args);
        if (method === "alumdoor.reserve.release") return await releaseReservationV2(call, args);
        if (method === "alumdoor.recon.snapshot") {
          const actorUser = platformActorUser(request);
          if (!actorUser) return refuse("Không xác định được người đang thực hiện kiểm kê.");
          return await snapshotReconciliationV2(call, args, actorUser);
        }
        if (method === "alumdoor.recon.post") return await postReconciliationV2(call, args);
        if (method === "alumdoor.ai.ask") return await askAlumdoorAssistant(call, args);
        if (method === "alumdoor.period.lock") return await setAccountingPeriod(request, call, args, "Lock");
        if (method === "alumdoor.period.unlock") return await setAccountingPeriod(request, call, args, "Unlock");
        if (method === "alumdoor.quote.preview") return await previewQuote(call, args);
        if (method === "alumdoor.quote.convert") return await convertQuote(call, args, ctx);
        if (method === "alumdoor.purchase.preview_order") return await previewPurchaseOrder(call, args);
        if (method === "alumdoor.purchase.order_from_quotation") return await orderFromSupplierQuotation(call, args);
        if (method === "alumdoor.purchase.preview_receipt") return await previewPurchaseReceipt(call, args);
        if (method === "alumdoor.purchase.receipt_from_order") return await receiptFromPurchaseOrder(call, args);
        if (method === "alumdoor.sales.preview_delivery") return await previewDelivery(call, args);
        if (method === "alumdoor.sales.delivery_from_order") return await deliveryFromSalesOrder(call, args);
        if (method === "alumdoor.ocr.parse") return await parseOcr(call, env, args);
        if (method === "alumdoor.ocr.apply") return await applyOcr(call, env, args);
        return new Response(JSON.stringify({ message: `Không có method ${method}` }), { status: 404 });
      }
      /**
       * Sự kiện SAU KHI ghi sổ. Nền tảng giao tới đây sau commit, có chống giao lặp theo
       * từng cặp (app, sự kiện), nên chỗ này không phải tự chống chạy hai lần.
       */
      if (url.pathname === "/hooks/event") {
        const event = (await request.json()) as { event_type?: string; aggregate?: { doctype?: string; name?: string } };
        const type = String(event.event_type ?? "");
        const receipt = String(event.aggregate?.name ?? "");
        if (!receipt || !type.startsWith("purchase_receipt.")) return new Response(null, { status: 204 });
        const call = platformCaller(request, env);
        const direction = type.endsWith(".cancelled") ? -1 : 1;
        const result = await syncLotsFromReceipt(call, receipt, direction);
        /**
         * Dòng hỏng KHÔNG được nuốt: trả lỗi để nền tảng giao lại, và sau 12 lần thì đánh
         * dấu bỏ cuộc — có dấu vết để lần ra. Im lặng ở đây là quay lại đúng cái bệnh cũ:
         * hai quyển sổ lệch nhau mà không ai biết.
         */
        const status = result.failed.length ? 500 : 200;
        return new Response(JSON.stringify(result), { status, headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/hooks/validate") {
        const subject = (await request.json()) as ValidatorSubject;
        if (subject.doctype === "Item") {
          const call = platformCaller(request, env);
          return await validateItemMaster(call, subject);
        }
        if (subject.doctype === "Purchase Order" || subject.doctype === "Purchase Receipt" || subject.doctype === "Purchase Invoice" || subject.doctype === "Supplier Quotation") {
          const call = platformCaller(request, env);
          const doc = await validationDocument(call, subject);
          await warmMasters(call, doc);
          const transaction = await validateTransactionLines(call, subject, "purchase", doc);
          if (!transaction.ok) return transaction;
          const measurements = await validatePurchaseMeasurement(call, subject, doc);
          if (!measurements.ok) return measurements;
          return await validateDocumentColors(call, subject, doc);
        }
        if (["Quotation", "Sales Order", "Delivery Note", "Sales Invoice"].includes(subject.doctype)) {
          const call = platformCaller(request, env);
          const doc = await validationDocument(call, subject);
          await warmMasters(call, doc);
          const transaction = await validateTransactionLines(call, subject, "sales", doc);
          if (!transaction.ok) return transaction;
          return await validateDocumentColors(call, subject, doc);
        }
        if ([
          "Material Request",
          "Request for Quotation",
          "Work Order",
          "Aluminium Lot",
        ].includes(subject.doctype)) {
          const call = platformCaller(request, env);
          return await validateDocumentColors(call, subject);
        }
        return accept();
      }
      return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "lỗi không xác định";
      return refuse(`Alumdoor không xử lý được: ${message}`);
    }
  },
};
