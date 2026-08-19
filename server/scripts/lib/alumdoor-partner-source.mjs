/**
 * Nguồn ĐỐI TÁC — khách hàng và nhà cung cấp — đọc thẳng từ bản trích của file gốc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO PHẢI ĐỔI NGUỒN: FILE ĐANG DÙNG ĐÃ BỊ MOI RUỘT MÀ CỔNG KIỂM KHÔNG BẮT ĐƯỢC
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `scripts/local-runner/customer-import-core.mjs` đọc `data/customer-export.xlsx` và pin hash
 * của nó. Hash KHỚP. Nhưng nội dung file chỉ còn:
 *
 *     dòng 1: Tên khách hàng · Điện thoại · Mã số thuế · Hạn mức công nợ
 *     dòng 2: "KH tồn 52412"                      ← ô tổng của bảng tính, không phải tên khách
 *
 * Bốn cột, một dòng rác, KHÔNG có cột `Nhóm giá`. Bộ nhập chờ 369 dòng nên ném
 * `canonical_count_mismatch 369 vs 1` — và người đọc log hiểu thành "thiếu file nguồn".
 * `ALUMDOOR-AUDIT-VONG-2-KET-QUA.md` §1 chép lại đúng cách hiểu đó.
 *
 * Nguồn KHÔNG thiếu. Nó nằm trong `2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx` sheet `DS KH-NCC`, đã trích
 * sẵn ra `apps/alumdoor/docs/nguon/don-hang-xuat-hang/DS-KH-NCC.md`: **448 đối tác có tên**.
 *
 * BÀI HỌC ĐÃ CƯỠNG CHẾ Ở ĐÂY: pin hash chỉ chứng minh file KHÔNG ĐỔI KỂ TỪ LÚC PIN. Nó không
 * chứng minh file có nội dung. Nên dưới đây kiểm cả hai: hình dạng cột (tiêu đề khít) VÀ số
 * dòng tối thiểu. File rỗng ruột lần sau sẽ chết ở đúng chỗ, với đúng tên lỗi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NHÓM GIÁ — BẮT BUỘC, CẤM ĐOÁN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `Customer.price_group` quyết định TIỀN và cả KÍCH THƯỚC CẮT NHÔM (đại lý đo phủ bì nhựa trừ
 * 0,02; khách lẻ đo phủ bì ray trừ 0,08 — `docs/ALUMDOOR-LUAT-DO-VA-GIA.md`). Đoán sai một
 * khách là cắt sai mọi đơn của khách đó.
 *
 * Nguồn có 332/449 dòng khai phân loại. 117 dòng để trống. Thứ tự thẩm quyền:
 *
 *   1. cột `KH/NCC/KH LẺ` của chính dòng đó          — khai trực tiếp
 *   2. tên có mặt ở cột ĐẠI LÝ của sheet đơn hàng    — đã bán như đại lý thì là đại lý
 *   3. không có gì                                    → HOÃN, không đoán
 *
 * Bậc 3 KHÔNG chặn cả lượt nạp. Đối tác hoãn được liệt kê riêng để chủ xưởng điền; nạp 400
 * khách đúng rồi bổ sung phần còn lại tốt hơn nạp 0 khách. Nhưng số hoãn phải được ĐẾM và
 * so với ngưỡng — hoãn im lặng thì lần sau cả nghìn dòng trôi qua mà không ai biết.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { parseAlumdoorIndexedMarkdownRows, readAlumdoorCell } from "./alumdoor-source-markdown.mjs";

const clean = (value) => String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();

/** Khoá so trùng: bỏ dấu, bỏ ký tự không chữ-số. Cùng phép với `customer-import-core.mjs`. */
export function partnerKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/gu, "d")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/** Cột của sheet `DS KH-NCC`. Cột 6 tồn tại trong dữ liệu nhưng KHÔNG có tiêu đề — bỏ qua. */
const DS = Object.freeze({
  HEADER_ROW: 2,
  FIRST_DATA_ROW: 3,
  NAME: 0,
  ACCOUNT_MANAGER: 1,
  KIND: 2,
  PHONE: 3,
  ADDRESS: 4,
  NOTE: 5,
});

const EXPECTED_DS_HEADER = Object.freeze({
  [DS.NAME]: "Nhà cung cấp/tên khách hàng",
  [DS.ACCOUNT_MANAGER]: "NGƯỜI PHỤ TRÁCH",
  [DS.KIND]: "KH/NCC/KH LẺ",
  [DS.PHONE]: "SDT",
  [DS.ADDRESS]: "CHÀNH XE / ĐỊA CHỈ GIAO HÀNG",
  [DS.NOTE]: "GHI CHÚ",
});

/** Dưới ngưỡng này thì nguồn coi như đã bị moi ruột — chết ngay, đừng nạp một dòng rác. */
const MIN_PARTNER_ROWS = 400;

/**
 * Người phụ trách viết bảy kiểu cho bốn người thật.
 *
 * `LÊ THUÝ`(81) vs `LÊ THÚY`(53) khác nhau đúng một dấu; `LƯ CHÍ CƯỜNG`(69) vs `CHÍ CƯỜNG`(20)
 * là gọi tắt; `LÊ THẾ ĐÔN`(85) vs `LÊ THỂ ĐÔN`(2) là gõ nhầm. Không gộp thì bốn nhân viên thành
 * bảy, và báo cáo doanh số theo nhân viên chia làm bảy phần.
 *
 * Gộp bằng bảng khai tay chứ không bằng thuật toán "gần giống": `PULY 114 LỚN` và `PULY 114 NHỎ`
 * cũng gần giống nhau.
 */
const ACCOUNT_MANAGER_ALIASES = new Map([
  ["le thuy", "LÊ THÚY"],
  ["lu chi cuong", "LƯ CHÍ CƯỜNG"],
  ["chi cuong", "LƯ CHÍ CƯỜNG"],
  ["le the don", "LÊ THẾ ĐÔN"],
  ["thai son", "THÁI SƠN"],
  ["le quy don", "LÊ QUÝ ĐÔN"],
]);

export function canonicalAccountManager(raw) {
  const key = partnerKey(raw);
  if (!key) return null;
  return ACCOUNT_MANAGER_ALIASES.get(key) ?? clean(raw);
}

/**
 * Phân loại thô → giá trị `Customer.price_group`, hoặc `SUPPLIER` để bỏ qua.
 *
 * `KH` trong nguồn nghĩa là "khách hàng" theo cách xưởng dùng, và bộ nhập hiện hành đã ánh xạ
 * nó thành `Đại lý` — giữ nguyên ánh xạ đó, đổi ở đây là đổi giá của 325 khách.
 */
export function classifyPartnerKind(raw) {
  const key = partnerKey(raw);
  if (!key) return null;
  if (key.includes("ncc")) return "SUPPLIER";
  if (key === "kh le" || key === "khach le") return "Lẻ";
  if (key === "kh" || key === "dai ly" || key === "khach hang") return "Đại lý";
  return "UNKNOWN";
}

function assertHeader(rows) {
  const header = rows.find((row) => row.source_row === DS.HEADER_ROW);
  if (!header) throw new Error("DS-KH-NCC: không tìm thấy dòng tiêu đề 2");
  const mismatches = [];
  for (const [index, want] of Object.entries(EXPECTED_DS_HEADER)) {
    const got = readAlumdoorCell(header, Number(index));
    if (got !== want) mismatches.push({ column: Number(index), expected: want, actual: got });
  }
  if (mismatches.length > 0) {
    throw new Error(`DS-KH-NCC: bố cục cột đã đổi — ${JSON.stringify(mismatches)}`);
  }
}

/** Đọc `DS-KH-NCC.md` thành danh sách đối tác thô. */
export function parsePartnerSource(markdownText) {
  const rows = parseAlumdoorIndexedMarkdownRows(markdownText);
  assertHeader(rows);

  const partners = [];
  const nameless = [];
  for (const row of rows) {
    if (row.source_row < DS.FIRST_DATA_ROW) continue;
    const name = clean(readAlumdoorCell(row, DS.NAME));
    if (!name) {
      if (Object.keys(row.cells).length > 0) nameless.push(row.source_row);
      continue;
    }
    partners.push({
      source_row: row.source_row,
      partner_name: name,
      key: partnerKey(name),
      kind_raw: clean(readAlumdoorCell(row, DS.KIND)) || null,
      kind: classifyPartnerKind(readAlumdoorCell(row, DS.KIND)),
      phone: clean(readAlumdoorCell(row, DS.PHONE)) || null,
      address: clean(readAlumdoorCell(row, DS.ADDRESS)) || null,
      account_manager: canonicalAccountManager(readAlumdoorCell(row, DS.ACCOUNT_MANAGER)),
      note: clean(readAlumdoorCell(row, DS.NOTE)) || null,
    });
  }

  if (partners.length < MIN_PARTNER_ROWS) {
    // Đây là cổng mà bản `customer-export.xlsx` bị moi ruột đã lọt qua.
    throw new Error(
      `DS-KH-NCC: nguồn chỉ còn ${partners.length} đối tác, dưới ngưỡng ${MIN_PARTNER_ROWS}. ` +
        "Nguồn nhiều khả năng đã bị cắt — kiểm tra file gốc trước khi nới ngưỡng.",
    );
  }
  return { partners, nameless };
}

/**
 * Tên đã từng đứng ở cột ĐẠI LÝ của một sheet đơn hàng tháng — bằng chứng bán như đại lý.
 *
 * Đọc bản trích markdown chứ không đọc `.xlsx`: bản trích nằm trong repo, có trong mục lục
 * nguồn, và không cần dựng cả bộ đọc bảng tính chỉ để lấy một cột.
 */
export function parseDealerReferences(monthlyTexts) {
  const refs = new Set();
  for (const text of monthlyTexts) {
    const rows = parseAlumdoorIndexedMarkdownRows(text);
    const header = rows.find((row) => row.source_row === 1);
    if (!header) continue;
    const dealerColumn = Object.entries(header.cells)
      .find(([, value]) => partnerKey(value) === "dai ly" || partnerKey(value) === "khach hang");
    if (!dealerColumn) continue;
    const index = Number(dealerColumn[0]);
    for (const row of rows) {
      if (row.source_row <= 1) continue;
      const key = partnerKey(readAlumdoorCell(row, index));
      if (key) refs.add(key);
    }
  }
  return refs;
}

const MONTHLY_SHEETS = [
  "T22026.md", "T32026.md", "T42026.md", "T52026.md", "T62026.md", "T72026.md",
];

export async function loadPartnerSource(repoRoot) {
  const base = resolve(repoRoot, "apps/alumdoor/docs/nguon/don-hang-xuat-hang");
  const partnerPath = resolve(base, "DS-KH-NCC.md");
  if (!existsSync(partnerPath)) {
    throw new Error(`Không tìm thấy nguồn đối tác: ${partnerPath}`);
  }
  const { partners, nameless } = parsePartnerSource(await readFile(partnerPath, "utf8"));

  const monthlyTexts = [];
  for (const name of MONTHLY_SHEETS) {
    const file = resolve(base, name);
    if (existsSync(file)) monthlyTexts.push(await readFile(file, "utf8"));
  }
  const dealerRefs = parseDealerReferences(monthlyTexts);

  return { partners, nameless, dealerRefs, monthly_sheet_count: monthlyTexts.length };
}

/**
 * Chia đối tác thành ba rổ: khách nạp được, nhà cung cấp, và khách phải hoãn vì chưa có
 * thẩm quyền nhóm giá.
 *
 * Trùng tên thì giữ dòng đầu — nguồn là danh sách người ta gõ tay, một người có thể xuất hiện
 * hai lần. Ghi lại số trùng chứ không nuốt.
 */
export function buildPartnerPlan({ partners, dealerRefs }) {
  const customers = [];
  const suppliers = [];
  const deferred = [];
  const unknownKind = [];
  const duplicates = [];
  const seen = new Set();

  for (const partner of partners) {
    if (seen.has(partner.key)) {
      duplicates.push({ source_row: partner.source_row, partner_name: partner.partner_name });
      continue;
    }
    seen.add(partner.key);

    if (partner.kind === "SUPPLIER") {
      suppliers.push(partner);
      continue;
    }
    if (partner.kind === "UNKNOWN") {
      // Có chữ trong ô phân loại nhưng không hiểu là gì — khác hẳn với ô trống.
      unknownKind.push({ source_row: partner.source_row, kind_raw: partner.kind_raw });
      deferred.push({ ...partner, defer_reason: "unrecognized_kind" });
      continue;
    }

    const priceGroup = partner.kind ?? (dealerRefs.has(partner.key) ? "Đại lý" : null);
    if (!priceGroup) {
      deferred.push({ ...partner, defer_reason: "missing_price_group_authority" });
      continue;
    }
    customers.push({
      ...partner,
      price_group: priceGroup,
      price_group_authority: partner.kind ? "declared" : "sales_history",
    });
  }

  return {
    customers,
    suppliers,
    deferred,
    summary: {
      partner_count: partners.length,
      customer_count: customers.length,
      customer_declared: customers.filter((row) => row.price_group_authority === "declared").length,
      customer_from_sales_history: customers.filter((row) => row.price_group_authority === "sales_history").length,
      dealer_count: customers.filter((row) => row.price_group === "Đại lý").length,
      retail_count: customers.filter((row) => row.price_group === "Lẻ").length,
      supplier_count: suppliers.length,
      deferred_count: deferred.length,
      duplicate_count: duplicates.length,
      unknown_kind_count: unknownKind.length,
      with_phone: partners.filter((row) => row.phone).length,
      with_address: partners.filter((row) => row.address).length,
      account_manager_count: new Set(partners.map((row) => row.account_manager).filter(Boolean)).size,
    },
    duplicates,
    unknown_kind: unknownKind,
  };
}

/**
 * Dựng bản ghi `Customer` để nạp.
 *
 * `account_manager` là Link tới `Employee` — CHỈ gán khi nhân viên đó có thật, vì Link trỏ vào
 * bản ghi không tồn tại làm hỏng cả lượt nạp. Không có Employee thì tên vẫn được giữ trong
 * `note` để không mất thông tin và để bước sau nối lại được.
 *
 * Địa chỉ chành xe là văn xuôi (`"1430 VÕ VĂN KIỆT P.1, Q.6 (CHÀNH CÔ TUYẾT 0908 028 618)"`),
 * không tách được ra Tỉnh/Phường mà doctype `Địa chỉ giao lắp` bắt buộc. Nạp vào
 * `install_address_line1` + `shipping_note` — hai trường Data/Small Text không Link — để địa chỉ
 * có mặt ngay, còn `Địa chỉ giao lắp` chờ chuẩn hoá hành chính.
 */
export function buildCustomerRecords(customers, knownEmployees = new Set()) {
  return customers.map((row) => {
    const values = {
      customer_name: row.partner_name,
      price_group: row.price_group,
    };
    if (row.phone) values.phone = row.phone;
    if (row.address) values.install_address_line1 = row.address;
    if (row.account_manager && knownEmployees.has(row.account_manager)) {
      values.account_manager = row.account_manager;
    }
    const notes = [];
    if (row.account_manager && !knownEmployees.has(row.account_manager)) {
      notes.push(`Người phụ trách: ${row.account_manager}`);
    }
    if (row.note) notes.push(row.note);
    if (notes.length > 0) values.note = notes.join(" · ");
    return { row_number: row.source_row, values };
  });
}

export const __testing = { DS, EXPECTED_DS_HEADER, MIN_PARTNER_ROWS, ACCOUNT_MANAGER_ALIASES };
