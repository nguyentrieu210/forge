/**
 * `alumdoor.catalog.readiness` — ĐO tình trạng danh mục cho màn Danh mục. ĐỌC-CHỈ tuyệt đối.
 *
 * Trả về đúng `AlumdoorMasterReadiness` của
 * `client/apps/runtime/src/experiences/AlumdoorMasterDataScreen.tsx`:
 * `Record<TÊN DOCTYPE, { total: number; filled?: number; applicable?: number }>`.
 * Khoá là TÊN DOCTYPE thật (nhãn tiếng Việt đổi được, tên DocType thì không).
 *
 * VÌ SAO PHẢI CÓ: màn Danh mục đã biết vẽ bốn trạng thái + "chưa đo", nhưng nơi gắn
 * (`main-base.tsx`) chưa có nguồn số nào để truyền, nên nó luôn in "Chưa có số liệu tình trạng
 * dữ liệu". Đây là mắt xích cuối.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BA GIỚI HẠN CỦA NỀN TẢNG ĐÃ ĐỌC TRƯỚC KHI THIẾT KẾ — chúng quyết định hình dạng file này
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. MỘT TRANG LIST TỐI ĐA 100 DÒNG.
 *    `packages/document-kernel/src/document-list.ts` khai `MAX_LIMIT = 100`, và
 *    `packages/frappe-api/src/router.ts::clampPageLength` cắt mọi `limit_page_length` xuống 100.
 *    Nên `limit_page_length: 500` mà chỗ khác trong worker này đang truyền KHÔNG lấy về 500 dòng.
 *    Hệ quả: đếm bằng cách liệt kê là Phường Xã (3.321 bản ghi) tốn 34 lượt gọi cho MỘT danh mục.
 *    Vì vậy `total` đi bằng `frappe.client.get_count` — một lượt, một `SELECT COUNT(*)`.
 *
 * 2. `disabled` KHÔNG LỌC ĐƯỢC Ở MỌI DOCTYPE.
 *    `packages/frappe-model/src/list-definition-internal.ts` chỉ cho lọc: `name`, `docstatus`,
 *    `status`, trường cha của cây, MỌI trường `Link`, và trường có `in_list_view` hoặc
 *    `in_standard_filter`. Biên dịch `briefs/alumdoor-v2.json` rồi soi từng trường: 12/32 danh mục
 *    ở đây có `disabled` mà KHÔNG đánh hai cờ đó (Material Specification, Warehouse, Supplier,
 *    Customer, Price List, Item Price, Pricing Rule, Tỉnh Thành, Phường Xã, Địa chỉ giao lắp,
 *    Tài khoản ngân hàng, BOM Template), và 2 danh mục không có trường `disabled` nào
 *    (Measurement Profile, Bill of Materials). Với chúng, lọc `disabled` bị từ chối thẳng
 *    (`Filter field is not allowed: disabled`).
 *
 *    Và KHÔNG được lọc ngược `disabled = 0`: `disabled:Check` trong brief phần lớn không khai
 *    `default`, mà `router.ts::createDocument` chỉ ghi mặc định cho trường CÓ `default`. Bản ghi
 *    không có khoá `disabled` thì `json_extract(...)` ra NULL, và `NULL = 0` trong SQLite là NULL
 *    — dòng bị LOẠI. Đếm `disabled = 0` sẽ ra gần 0 cho hầu hết danh mục: một con số hợp lý mà
 *    sai, đúng loại tệ nhất.
 *
 *    Nên phép đo là `total = (đếm tất) − (đếm disabled = 1)`. Chỉ `= 1` mới khớp đúng dòng đã
 *    tắt, NULL không lọt vào. Chỗ nào nền tảng từ chối lọc thì `total` là ĐẾM THÔ — xem
 *    `RAW_TOTAL_NOTE` bên dưới, đây là chỗ chưa khép được, không phải chỗ đã quyết là đủ.
 *
 * 3. BẢNG CON KHÔNG CHIẾU ĐƯỢC QUA LIST.
 *    `metadataToListDefinition` bỏ qua mọi `fieldtype` không nằm trong `listType`, và `Table`
 *    không có trong đó; `MetadataDocumentListDefinitionResolver` cũng từ chối thẳng doctype
 *    `is_child`. Nên `Item.uom_conversions` KHÔNG đọc được bằng một truy vấn danh sách, cũng
 *    không đọc được bằng cách hỏi thẳng `UOM Conversion`. Cách duy nhất là mở từng hồ sơ Item —
 *    xem `probeUomConversions`, chỗ duy nhất trong file này đọc theo từng bản ghi, và nó bị
 *    chặn hai lớp (trần số lượng + hạn giờ) để không bao giờ làm cả lời gọi quá hạn.
 */

import type { PlatformCall } from "./platform-call.js";

/** Khớp `AlumdoorMasterMeasure` bên màn — không thêm bớt trường nào. */
export interface AlumdoorMasterMeasure {
  /** Số bản ghi CÒN DÙNG (đã trừ `disabled`) — xem giới hạn 2 ở đầu file. */
  total: number;
  /** Số bản ghi đã điền trường then chốt. Vắng mặt = CHƯA ĐO, không phải bằng 0. */
  filled?: number;
  /** Mẫu số đúng của `filled` khi trường chỉ bắt buộc với một phần bản ghi. */
  applicable?: number;
}

export type AlumdoorMasterReadiness = Record<string, AlumdoorMasterMeasure>;

/**
 * Danh mục phải đo — 31 khoá của `MASTER_DATA_DECLARED_KEYS` bên màn, cộng `BOM Template`.
 *
 * 30 tên đầu là các DocType `group: "Danh mục"` đủ điều kiện lên menu trong
 * `server/briefs/alumdoor-v2.json` (không `child`, không `menu: false`).
 *
 * Hai tên còn lại KHÔNG lên menu nhưng vẫn phải đo, vì màn đọc chúng qua `critical.source`:
 *  · `Supplier Item` — brief khai `menu: false`, nhưng `Supplier.critical.source` trỏ vào nó
 *    (`last_purchase_rate`). Thiếu khoá này thì mục Nhà cung cấp không bao giờ đỏ được dù bảng
 *    giá nhập rỗng.
 *  · `BOM Template` — thuộc nhóm "Sản xuất", nên hiện KHÔNG mục nào trên màn Danh mục dẫn tới
 *    nó và khoá này chưa được đọc. Vẫn đo vì đề bài chốt `sales_mode` là một trong ba chỗ chặn
 *    cứng; số có sẵn thì ngày màn khai `critical` cho nó là dùng được ngay, không phải chờ đo
 *    lại. Khoá thừa là vô hại: màn tra theo tên, khoá không ai tra thì không vẽ gì.
 *
 * HỢP ĐỒNG: brief mọc thêm DocType nhóm "Danh mục" thì phải thêm vào đây.
 * Máy kiểm: `server/tests/alumdoor-catalog-readiness.test.mjs` đọc thẳng brief và bắt lỗi.
 */
export const CATALOG_DOCTYPES: readonly string[] = [
  // Vật tư & quy cách
  "Item", "Item Group", "UOM", "Surface Finish", "Item Color", "Material Specification",
  "Quy cách cửa", "Measurement Profile", "Geometry Field", "Geometry Profile",
  // Kho
  "Warehouse",
  // Mua hàng & nhà cung cấp
  "Supplier", "Supplier Item",
  // Khách hàng & giá bán
  "Customer", "Price List", "Item Price", "Bậc diện tích", "Pricing Scope", "Pricing Rule",
  // Bán hàng & sản xuất
  "Cutting Policy", "Ngưỡng chọn Motor", "BOM Rule", "Bill of Materials", "Production Standard",
  // Địa bàn & giao lắp
  "Tỉnh Thành", "Phường Xã", "Địa chỉ giao lắp",
  // Kế toán
  "Tài khoản ngân hàng",
  // Lý do vận hành
  "Lý do huỷ", "Nguyên nhân chênh lệch", "Nguyên nhân cửa lỗi",
  // Ngoài menu, nhưng màn đọc qua `critical.source` (hoặc sẽ đọc) — xem chú thích trên.
  "BOM Template",
];

/** Trần trang của nền tảng. Xin nhiều hơn cũng bị `clampPageLength` cắt về đúng số này. */
const PAGE_SIZE = 100;

/**
 * Trần số TRANG cho một lượt quét.
 *
 * Quét trang chỉ dùng cho 3 danh mục mà trường then chốt KHÔNG lọc được (xem `SCANS`), lớn nhất
 * trong đó là Item ~566 bản ghi ⇒ 6 trang. Đặt 12 để còn chỗ cho danh mục lớn gấp đôi mà vẫn
 * chặn được vòng lặp chạy mãi nếu nền tảng trả `has_more` sai.
 */
const MAX_SCAN_PAGES = 12;

/** Số hồ sơ Item mở song song một đợt khi dò bảng con. */
const PROBE_BATCH = 25;

/**
 * Trần số hồ sơ Item được mở để dò `uom_conversions`.
 *
 * Nguồn thật chỉ có 19 hệ số đọc từ `DANH-MỤC.md` + 40 bản ghi kg/mét
 * (`server/scripts/build-alumdoor-uom-conversion-catalog.mjs`), nên tập "thực sự cần hệ số"
 * là hàng chục, không phải hàng trăm. Vượt trần này nghĩa là giả định đó đã sai — lúc đó
 * BỎ HẲN `filled` để màn nói "chưa đo", thay vì trả một con số đo dở.
 */
const PROBE_MAX_ITEMS = 200;

/**
 * Hạn giờ cho riêng khâu dò bảng con.
 *
 * `APP_METHOD_TIMEOUT_MS = 10_000` (packages/app-registry/src/method-dispatch.ts) là hạn của CẢ
 * lời gọi, và cùng file đó đo được một lượt gọi ngược tốn ~1,2 s vì phải đi app → cổng → tenant.
 * Quá hạn thì client không nhận được gì và màn mất luôn 32 số đã đo xong — đắt hơn nhiều so với
 * việc thiếu một `filled`. Nên khâu này tự bỏ cuộc trước, và bỏ cuộc thì bỏ luôn `filled`.
 */
const PROBE_BUDGET_MS = 4_000;

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Check của nền tảng về tới dưới dạng 1 / 0 / true / "1" tuỳ đường ghi. */
function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function positive(value: unknown): boolean {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

/**
 * `SELECT COUNT(*)` qua nền tảng. Trả `null` khi nền tảng TỪ CHỐI, không trả 0.
 *
 * Phân biệt này là bắt buộc: "không đếm được" và "đếm ra 0" dẫn tới hai kết luận ngược nhau trên
 * màn (chưa đo ↔ rỗng, chặn chuỗi). Lọc `disabled` bị từ chối ở 12/32 danh mục (giới hạn 2 đầu
 * file) nên đường `null` là đường CHẠY THẬT, không phải nhánh phòng xa.
 */
async function countRows(call: PlatformCall, doctype: string, filters?: unknown[]): Promise<number | null> {
  const body: Record<string, unknown> = { doctype };
  if (filters && filters.length) body.filters = filters;
  const response = await call("method/frappe.client.get_count", {
    method: "POST",
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null) as { message?: unknown } | null;
  const raw = payload && typeof payload === "object" ? payload.message : null;
  const value = Number(typeof raw === "object" && raw !== null ? (raw as { count?: unknown }).count : raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Đọc hết một danh mục theo trang, chỉ chiếu đúng những trường cần.
 *
 * Sắp theo `name` tăng dần chứ không để mặc định: mặc định là `modified_at desc`, mà phân trang
 * theo `limit_start` trên một khoá KHÔNG duy nhất thì hai trang liền nhau có thể bỏ sót hoặc lặp
 * dòng khi dữ liệu đổi giữa chừng. `name` là khoá chính nên thứ tự luôn xác định.
 *
 * Trả `null` khi bất kỳ trang nào hỏng — nửa danh mục là số sai, không phải số thiếu.
 */
async function scanRows(call: PlatformCall, doctype: string, fields: string[]): Promise<Row[] | null> {
  const rows: Row[] = [];
  for (let page = 0; page < MAX_SCAN_PAGES; page += 1) {
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      limit_page_length: String(PAGE_SIZE),
      limit_start: String(page * PAGE_SIZE),
      order_by: "name asc",
    });
    const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`).catch(() => null);
    if (!response?.ok) return null;
    const payload = await response.json().catch(() => null) as { data?: Row[] } | null;
    const batch = payload?.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  // Hết trần trang mà vẫn còn dòng: số đọc được là một phần, không phải cả danh mục.
  return null;
}

/**
 * Mở hồ sơ Item để đọc bảng con `uom_conversions`.
 *
 * `resource/Item/<mã>` là đường DUY NHẤT trả về dòng con (giới hạn 3 đầu file). Đây là chỗ duy
 * nhất trong file này đọc theo từng bản ghi.
 */
async function readItemConversions(call: PlatformCall, name: string): Promise<unknown[] | null> {
  const response = await call(`resource/Item/${encodeURIComponent(name)}`).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null) as { data?: Row } | null;
  const rows = payload?.data?.uom_conversions;
  return Array.isArray(rows) ? rows : [];
}

/** Mặt hàng THỰC SỰ cần hệ số quy đổi — mẫu số đúng của `Item.uom_conversions`. */
interface ItemNeedingConversion {
  name: string;
  purchaseUom: string;
}

/**
 * `applicable` cho `Item.uom_conversions` — mẫu số, KHÔNG phải tổng số mặt hàng.
 *
 * `AlumdoorMasterMeasure.applicable` bên màn ghi rõ cái bẫy: 20/566 là KÍCH THƯỚC LỖ HỔNG chứ
 * không phải lượng nguồn cung, và brief khai `depends_on` cho `uom_conversions` nên mặt hàng có
 * mua = tồn = bán bị form ẩn hẳn bảng con — đòi 566/566 là đòi một con số không đạt tới được.
 *
 * Điều kiện lấy đúng theo đề: `is_purchase_item && default_purchase_uom &&
 * default_purchase_uom !== stock_uom`. CỐ Ý HẸP HƠN `depends_on` của brief (brief mở bảng con
 * cho cả trường hợp `default_sales_uom != stock_uom`): thiếu hệ số MUA làm phiếu nhập ghi sai số
 * lượng tồn — đúng chỗ hỏng mà cổng "mua vật tư" canh; lệch đơn vị BÁN không đụng vào sổ kho.
 * `server/scripts/audit-alumdoor-item-uom.mjs` cũng đang dùng đúng luật này cho lỗi
 * `missing_purchase_conversion`, nên hai chỗ đo cùng một đại lượng.
 *
 * Bản ghi `disabled` bị loại: mặt hàng đã cho nghỉ không cần hệ số, tính vào mẫu số là dựng một
 * cảnh báo không bao giờ tắt được.
 */
function itemsNeedingConversion(rows: Row[]): ItemNeedingConversion[] {
  const needing: ItemNeedingConversion[] = [];
  for (const row of rows) {
    if (checked(row.disabled)) continue;
    if (!checked(row.is_purchase_item)) continue;
    const purchaseUom = text(row.default_purchase_uom);
    const stockUom = text(row.stock_uom);
    const name = text(row.name);
    if (!name || !purchaseUom || purchaseUom === stockUom) continue;
    needing.push({ name, purchaseUom });
  }
  return needing;
}

/**
 * Đếm mặt hàng ĐÃ có hệ số quy đổi dùng được cho đúng ĐVT mua của nó.
 *
 * Không đếm "có dòng con nào không": một dòng khai đúng ĐVT khác, hoặc khai `conversion_factor`
 * bằng 0, thì `factorFromMaster` (`packages/clouderp-core/src/uom.ts`) vẫn bỏ qua và phiếu nhập
 * vẫn đọc về hệ số 1 — tức vẫn đúng cái hỏng mà cổng này canh. Đếm rộng tay hơn là báo xanh cho
 * một mặt hàng vẫn ghi sai tồn.
 *
 * Trả `null` = CHƯA ĐO XONG (quá trần, quá hạn, hoặc một hồ sơ đọc hỏng). Màn nhận `filled`
 * vắng mặt và nói "chưa đo hệ số quy đổi" — đúng hơn là một con số đo dở.
 */
async function probeUomConversions(
  call: PlatformCall,
  needing: ItemNeedingConversion[],
  now: () => number,
): Promise<number | null> {
  if (needing.length > PROBE_MAX_ITEMS) return null;
  const deadline = now() + PROBE_BUDGET_MS;
  let filled = 0;
  for (let offset = 0; offset < needing.length; offset += PROBE_BATCH) {
    if (now() > deadline) return null;
    const batch = needing.slice(offset, offset + PROBE_BATCH);
    const results = await Promise.all(batch.map(async (item) => {
      const rows = await readItemConversions(call, item.name);
      if (rows === null) return null;
      return rows.some((row) => {
        if (!row || typeof row !== "object") return false;
        const entry = row as Row;
        return text(entry.uom) === item.purchaseUom && positive(entry.conversion_factor);
      });
    }));
    for (const result of results) {
      if (result === null) return null;
      if (result) filled += 1;
    }
  }
  return filled;
}

/**
 * Ba danh mục phải QUÉT TRANG thay vì đếm — vì trường then chốt không lọc được.
 *
 * Biên dịch brief rồi soi từng trường:
 *  · `Item Price.area_tier` là `Link(Bậc diện tích)` ⇒ MỌI Link đều lọc được ⇒ đếm thẳng, không
 *    cần quét. Nó nằm ở `FILTERABLE_CRITICAL` bên dưới.
 *  · `BOM Template.sales_mode` là `Select` không đánh `in_list_view`/`in_standard_filter`
 *    ⇒ lọc bị từ chối ⇒ phải quét (349 bản ghi ≈ 4 trang).
 *  · `Supplier Item.last_purchase_rate` là `Currency`, cũng không đánh hai cờ đó ⇒ phải quét
 *    (448 bản ghi ≈ 5 trang).
 *  · `Item` phải quét vì `applicable` là phép SO HAI TRƯỜNG VỚI NHAU
 *    (`default_purchase_uom !== stock_uom`), thứ ngôn ngữ lọc của nền tảng không diễn đạt được:
 *    mọi toán tử đều so trường với một HẰNG.
 *
 * Quét trang cho cả ba tiện thể đem về `disabled` của từng dòng, nên `total` của chúng là số
 * CÒN DÙNG thật, không dính giới hạn 2 ở đầu file.
 */
const SCANS: ReadonlyArray<{ doctype: string; fields: string[] }> = [
  { doctype: "Item", fields: ["name", "stock_uom", "default_purchase_uom", "is_purchase_item", "disabled"] },
  { doctype: "BOM Template", fields: ["name", "sales_mode", "disabled"] },
  { doctype: "Supplier Item", fields: ["name", "last_purchase_rate", "disabled"] },
];

/** Trường then chốt ĐẾM ĐƯỢC bằng một lượt `COUNT(*)` vì nó lọc được (Link). */
const FILTERABLE_CRITICAL: ReadonlyArray<{ doctype: string; field: string }> = [
  { doctype: "Item Price", field: "area_tier" },
];

/**
 * Chỗ CHƯA KHÉP được, ghi ra để không ai tưởng đã xong.
 *
 * 11 danh mục dưới đây có trường `disabled` mà nền tảng không cho lọc, và cũng không nằm trong
 * `SCANS` để đọc `disabled` theo dòng — nên `total` của chúng là ĐẾM THÔ: bản ghi đã cho nghỉ
 * vẫn tính vào "đủ dùng". Cách sửa đúng nằm ở brief (đánh `in_standard_filter` cho `disabled`),
 * không nằm ở đây: worker không được sửa metadata, và đoán bừa một con số nhỏ hơn còn tệ hơn
 * đếm thô.
 *
 * `BOM Template` cùng cảnh đó nhưng KHÔNG có trong danh sách này, vì `SCANS` đã đọc `disabled`
 * của từng dòng để lấy `sales_mode` — tiện thể trừ luôn, `total` của nó là số CÒN DÙNG thật.
 *
 * `Measurement Profile` và `Bill of Materials` cũng không lọc được `disabled`, nhưng chúng
 * KHÔNG CÓ trường đó trong brief — không có gì để trừ, nên đếm thô chính là số còn dùng.
 *
 * Hằng này KHÔNG tham gia tính toán; nó là chỗ neo cho máy kiểm và cho người đọc sau.
 */
export const RAW_TOTAL_NOTE: readonly string[] = [
  "Material Specification", "Warehouse", "Supplier", "Customer", "Price List", "Item Price",
  "Pricing Rule", "Tỉnh Thành", "Phường Xã", "Địa chỉ giao lắp", "Tài khoản ngân hàng",
];

function measure(total: number, filled?: number, applicable?: number): AlumdoorMasterMeasure {
  // Trải có điều kiện chứ không gán `undefined`: `exactOptionalPropertyTypes` bật, và quan trọng
  // hơn — `{filled: undefined}` qua JSON.stringify thành khoá BIẾN MẤT, còn `{filled: 0}` thì
  // không. Hai thứ đó màn hiểu khác nhau hoàn toàn, nên chỗ này không được nhập nhằng.
  return {
    total: Math.max(0, total),
    ...(filled === undefined ? {} : { filled: Math.max(0, filled) }),
    ...(applicable === undefined ? {} : { applicable: Math.max(0, applicable) }),
  };
}

/**
 * Đo toàn bộ. ĐỌC-CHỈ: chỉ `GET resource/...` và `POST method/frappe.client.get_count` — không
 * lệnh ghi nào, không `PUT`/`DELETE`, không tạo bản ghi, không đụng bộ nhớ dùng chung.
 *
 * MỘT ĐỢT GỌI SONG SONG, không phải một vòng lặp nối đuôi. 32 danh mục × 2 phép đếm cộng 3 lượt
 * quét cùng nằm trong một `Promise.all`; nếu chạy tuần tự thì riêng phần đếm đã là 64 lần chờ
 * nối tiếp, mỗi lần một vòng app → cổng → tenant, và cả lời gọi vượt hạn 10 s trước khi đo xong.
 *
 * Danh mục nào đếm KHÔNG được thì KHÔNG có khoá trong kết quả — màn nói "chưa đo" cho đúng mục
 * đó. Không dựng số 0 thay thế: 0 nghĩa là "rỗng, đang chặn chuỗi", một kết luận khác hẳn.
 */
export async function readCatalogReadiness(
  call: PlatformCall,
  now: () => number = () => Date.now(),
): Promise<AlumdoorMasterReadiness> {
  const [totals, retired, scans, criticalCounts] = await Promise.all([
    Promise.all(CATALOG_DOCTYPES.map(async (doctype) => [doctype, await countRows(call, doctype)] as const)),
    // Đếm cả cho 3 danh mục thuộc `SCANS` dù bản quét chính xác hơn: quét có thể hỏng (mất mạng
    // giữa chừng, vượt trần trang), và lúc đó đây là đường lùi duy nhất còn số. Ba lượt gọi thừa
    // trong một đợt song song rẻ hơn hẳn ba danh mục hoá "chưa đo" — trong đó có Item.
    Promise.all(CATALOG_DOCTYPES.map(async (doctype) => [doctype, await countRows(call, doctype, [["disabled", "=", 1]])] as const)),
    Promise.all(SCANS.map(async (scan) => [scan.doctype, await scanRows(call, scan.doctype, scan.fields)] as const)),
    Promise.all(FILTERABLE_CRITICAL.map(async (entry) => (
      [entry.doctype, await countRows(call, entry.doctype, [[entry.field, "!=", ""]])] as const
    ))),
  ]);

  const totalOf = new Map(totals);
  const retiredOf = new Map(retired);
  const rowsOf = new Map(scans);
  const filledOf = new Map(criticalCounts);

  const readiness: AlumdoorMasterReadiness = {};

  for (const doctype of CATALOG_DOCTYPES) {
    const rows = rowsOf.get(doctype) ?? null;
    if (rows) {
      // Quét được cả danh mục thì `total` tính thẳng từ dòng — chính xác kể cả khi nền tảng
      // không cho lọc `disabled`.
      const active = rows.filter((row) => !checked(row.disabled));
      readiness[doctype] = measure(active.length);
      continue;
    }
    const all = totalOf.get(doctype);
    if (all === null || all === undefined) continue;
    const off = retiredOf.get(doctype);
    readiness[doctype] = measure(all - (off ?? 0));
  }

  // ── Trường then chốt 1: `Item Price.area_tier` (bậc diện tích) ─────────────────────────────
  // KHÔNG `conditional`: brief chốt `area_tier` là `Link` bắt buộc và có `default`
  // `MOI-DIEN-TICH`, tức mặt hàng không phân bậc vẫn phải mang một giá trị. Nên mẫu số đúng là
  // `total`, và màn tự lấy `total` khi `applicable` vắng mặt.
  const itemPrice = readiness["Item Price"];
  const areaTierFilled = filledOf.get("Item Price");
  if (itemPrice && areaTierFilled !== null && areaTierFilled !== undefined) {
    readiness["Item Price"] = measure(itemPrice.total, areaTierFilled);
  }

  // ── Trường then chốt 2: `BOM Template.sales_mode` (cách bán) ───────────────────────────────
  const bomTemplateRows = rowsOf.get("BOM Template");
  const bomTemplate = readiness["BOM Template"];
  if (bomTemplate && bomTemplateRows) {
    const active = bomTemplateRows.filter((row) => !checked(row.disabled));
    readiness["BOM Template"] = measure(active.length, active.filter((row) => text(row.sales_mode) !== "").length);
  }

  // ── Trường then chốt 3 (màn đọc qua `Supplier`): `Supplier Item.last_purchase_rate` ────────
  // Giá nhập bằng 0 KHÔNG tính là đã điền: một dòng giá 0 đồng không phải giá nhập, và để nó
  // đếm vào "đã điền" là đúng cách làm cổng "mua vật tư" xanh trong khi không ai đối chiếu được
  // đơn mua nào.
  const supplierItemRows = rowsOf.get("Supplier Item");
  const supplierItem = readiness["Supplier Item"];
  if (supplierItem && supplierItemRows) {
    const active = supplierItemRows.filter((row) => !checked(row.disabled));
    readiness["Supplier Item"] = measure(active.length, active.filter((row) => positive(row.last_purchase_rate)).length);
  }

  // ── Trường then chốt 4: `Item.uom_conversions` (hệ số quy đổi) ─────────────────────────────
  const itemRows = rowsOf.get("Item");
  const item = readiness["Item"];
  if (item && itemRows) {
    const needing = itemsNeedingConversion(itemRows);
    const filled = await probeUomConversions(call, needing, now);
    readiness["Item"] = measure(item.total, filled ?? undefined, needing.length);
  }

  return readiness;
}

/** Vỏ HTTP. Thân trả về CHÍNH bản đồ số đo, đúng shape `AlumdoorMasterReadiness`. */
export async function catalogReadiness(call: PlatformCall, now?: () => number): Promise<Response> {
  try {
    const readiness = now ? await readCatalogReadiness(call, now) : await readCatalogReadiness(call);
    return new Response(JSON.stringify(readiness), { headers: { "content-type": "application/json" } });
  } catch (error) {
    // Hỏng thì nói hỏng. Trả `{}` sẽ làm màn tuyên bố "đã đếm đủ 0 danh mục" — im lặng theo kiểu
    // tệ nhất, vì `readiness` có mặt nghĩa là ĐÃ ĐO.
    return new Response(
      JSON.stringify({ message: error instanceof Error ? error.message : "Không đo được tình trạng danh mục." }),
      { status: 422, headers: { "content-type": "application/json" } },
    );
  }
}
