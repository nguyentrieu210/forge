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
 * Nguồn có 332/448 dòng khai phân loại. 116 dòng để trống. Thứ tự thẩm quyền:
 *
 *   1. cột `KH/NCC/KH LẺ` của chính dòng đó          — khai trực tiếp
 *   2. tên có mặt ở cột ĐẠI LÝ của sheet đơn hàng    — đã bán như đại lý thì là đại lý
 *   3. không có gì                                    → HOÃN, không đoán
 *   4. hai dòng cùng khách khai NGƯỢC NHAU            → HOÃN CẢ HAI, không chọn dòng nào
 *
 * Bậc 3 và 4 KHÔNG chặn cả lượt nạp. Đối tác hoãn được liệt kê riêng để chủ xưởng điền; nạp 403
 * khách đúng rồi bổ sung phần còn lại tốt hơn nạp 0 khách. Nhưng số hoãn phải được ĐẾM và
 * so với ngưỡng — hoãn im lặng thì lần sau cả nghìn dòng trôi qua mà không ai biết.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { parseAlumdoorIndexedMarkdownRows, readAlumdoorCell } from "./alumdoor-source-markdown.mjs";

const clean = (value) => String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();

/**
 * Khoá ĐỐI CHIẾU LỎNG: bỏ dấu, bỏ ký tự không chữ-số.
 *
 * CHỈ dùng để dò tên ở cột ĐẠI LÝ của sheet tháng — chỗ đó người ta gõ tay, thiếu dấu là chuyện
 * thường, và đối chiếu lỏng chỉ làm mất/thêm một bằng chứng "đã bán như đại lý" chứ không tạo ra
 * hay xoá bản ghi nào.
 *
 * KHÔNG dùng làm khoá ĐỊNH DANH khách — xem `partnerIdentityKey`.
 */
export function partnerKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/gu, "d")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * Khoá ĐỊNH DANH khách: GIỮ NGUYÊN DẤU, chỉ hạ chữ thường theo lệ tiếng Việt.
 *
 * VÌ SAO KHÔNG DÙNG `partnerKey` Ở ĐÂY: bỏ dấu gộp 6 cặp tên KHÁC HẲN NHAU trong `DS-KH-NCC.md`
 * thành một khách, và 3 trong 6 cặp có bằng chứng nguồn nói đây là hai người thật:
 *
 *   dòng 71  ANH BIỂN  0907 627 145 · THÁI SƠN      ┐ hai SĐT khác nhau
 *   dòng 349 ANH BIÊN  0975937881   · THÁI SƠN      ┘
 *   dòng 297 ANH HÙNG  (không SĐT)  · LƯ CHÍ CƯỜNG  ┐ hai người phụ trách khác nhau
 *   dòng 364 ANH HƯNG  0978457567   · THÁI SƠN      ┘
 *   dòng 5   ANH HOÁ   0979090953   · LƯ CHÍ CƯỜNG  ┐ hai người phụ trách khác nhau
 *   dòng 183 ANH HOÀ   (không SĐT)  · THÁI SƠN      ┘
 *
 * Gộp im lặng thì một trong hai người KHÔNG BAO GIỜ có bản ghi Customer, và mọi đơn của người đó
 * chạy vào công nợ + nhóm giá của người kia.
 *
 * Khoá này KHỚP với phép dò trùng của server (`customer-import.ts`: `text(customer_name)` rồi
 * `.toLocaleLowerCase("vi")`) — nghĩa là lớp plan không còn nuốt cái mà server sẵn sàng nhận.
 * Nó "chặt" hơn server đúng một chỗ: gom khoảng trắng thừa. Chặt hơn ở phía an toàn — hai dòng ta
 * tách ra thì server cũng thấy tách.
 */
export function partnerIdentityKey(value) {
  return clean(value).toLocaleLowerCase("vi");
}

/**
 * Ô SĐT chứa HAI số → tách thành số chính + số phụ.
 *
 * VÌ SAO: `normalizedPhone` của server bỏ mọi ký tự không phải chữ số, nên ô hai số bị dán thành
 * một chuỗi 20 chữ số đi thẳng vào `Customer.phone`. Đo được 4 ô như vậy trong 246 ô có SĐT
 * (phân bố độ dài chữ số của nguồn chỉ có hai giá trị: 242 ô 10 chữ số, 4 ô 20 chữ số):
 *
 *   dòng 169 "0918 691 691 - 0966 336 139"   dòng 274 "0905 168 690/0974765728"
 *   dòng 316 "0367 35 2572 _ 0916 964023"    dòng 450 "0932608860/0943608860"
 *
 * Số 20 chữ số không gọi được, và `phone` là 1 trong 4 khoá dò trùng của `dry_run` nên lượt nạp
 * sau không bao giờ khớp lại được 4 khách này.
 *
 * Chỉ tách khi CẢ HAI mảnh đều đủ ≥ 8 chữ số. 6 ô khác trong nguồn cũng có dấu `-` nhưng vế sau
 * là tên người ("0972 886 317 - ANH LÂM"), mảnh đó không đủ chữ số nên ô giữ nguyên văn — server
 * vốn đã bỏ phần chữ khi chuẩn hoá.
 */
export function splitPhoneCell(raw) {
  const value = clean(raw);
  if (!value) return { phone: null, extra_phones: [] };
  const parts = value
    .split(/[\/;,_]|\s+[-–]\s+/u)
    .map((part) => clean(part))
    .filter((part) => part.replace(/[^0-9]/gu, "").length >= 8);
  if (parts.length <= 1) return { phone: value, extra_phones: [] };
  return { phone: parts[0], extra_phones: parts.slice(1) };
}

/** Số chữ số tối đa của một SĐT đơn. Vượt ngưỡng nghĩa là ô còn nhiều số mà chưa tách được. */
const MAX_PHONE_DIGITS = 12;

export function phoneDigitCount(value) {
  return String(value ?? "").replace(/[^0-9]/gu, "").length;
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
 * nó thành `Đại lý` — giữ nguyên ánh xạ đó, đổi ở đây là đổi giá của 323 khách tự khai `KH`.
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
    const { phone, extra_phones } = splitPhoneCell(readAlumdoorCell(row, DS.PHONE));
    partners.push({
      source_row: row.source_row,
      partner_name: name,
      // `key` = đối chiếu lỏng (cột ĐẠI LÝ sheet tháng); `identity` = định danh khách.
      key: partnerKey(name),
      identity: partnerIdentityKey(name),
      kind_raw: clean(readAlumdoorCell(row, DS.KIND)) || null,
      kind: classifyPartnerKind(readAlumdoorCell(row, DS.KIND)),
      phone,
      extra_phones,
      account_manager: canonicalAccountManager(readAlumdoorCell(row, DS.ACCOUNT_MANAGER)),
      address: clean(readAlumdoorCell(row, DS.ADDRESS)) || null,
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

/** Trường được phép hợp nhất từ dòng trùng sang dòng giữ, kèm nhãn để ghi vết vào `note`. */
const MERGEABLE_FIELDS = Object.freeze([
  ["kind", "Phân loại"],
  ["phone", "SĐT"],
  ["address", "Địa chỉ"],
  ["note", "Ghi chú"],
  ["account_manager", "Người phụ trách"],
]);

/**
 * Chia đối tác thành bốn rổ: khách nạp được, nhà cung cấp, khách hoãn, và dòng trùng đã gộp.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO KHÔNG CÒN "GIỮ DÒNG ĐẦU, VỨT DÒNG SAU"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Bản trước gom theo khoá BỎ DẤU rồi giữ dòng đầu. Ba hậu quả đo được trên chính
 * `DS-KH-NCC.md` (sha256 c008557f…, 448 đối tác có tên):
 *
 * 1. CHỐT NHÓM GIÁ BẰNG THỨ TỰ DÒNG. Dòng 86 `ANH HƯỞNG - KHÁCH LẺ` khai `KH` (→ Đại lý), dòng
 *    236 cùng tên khai `KH LẺ` (→ Lẻ). Nguồn TỰ MÂU THUẪN, mà code lặng lẽ lấy dòng 86. Sai nhóm
 *    giá là sai TIỀN và sai KÍCH THƯỚC CẮT: `alumdoor-cutting-policy-catalog.mjs` cho CP-CUA-DUC
 *    có DUC-RCL-DL = PB_NHUA_RONG − 0,02 m (Đại lý) và DUC-RCL-LE = PB_RAY_RONG − 0,08 m (Lẻ) —
 *    khác cả gốc đo lẫn 0,06 m = 60 mm số trừ. Đo được đúng 1 cặp mâu thuẫn → cả hai dòng vào rổ
 *    HOÃN với `conflicting_declared_kind`, không đoán dòng nào đúng.
 *
 * 2. VỨT LUÔN SĐT/ĐỊA CHỈ CỦA DÒNG BỊ BỎ. Trong 14 dòng bị bỏ của bản cũ: 6 dòng có SĐT, 2 dòng
 *    có địa chỉ, và evidence chỉ ghi `{source_row, partner_name}` nên không lấy lại được. Trái
 *    luật "NGHỈ HƯU, KHÔNG XOÁ" mà chính lượt này đã áp cho SĐT dùng chung. Nay: hợp nhất mọi
 *    trường mà dòng giữ đang TRỐNG, và chở đủ dữ liệu dòng bị bỏ ra `duplicates` để truy lại.
 *
 * 3. GỘP HAI CÁI TÊN KHÁC HẲN NHAU. Xem `partnerIdentityKey` — nay định danh bằng tên CÓ DẤU,
 *    6 cặp lệch dấu tách trở lại thành 6 khách riêng và được liệt kê ở `near_duplicate_names`
 *    để chủ xưởng chốt, thay vì biến mất.
 *
 * Rổ HOÃN không chặn cả lượt nạp — nạp 403 khách đúng rồi bổ sung phần còn lại tốt hơn nạp 0
 * khách — nhưng mọi rổ đều được ĐẾM và so trần ở `customer-import-core.mjs`.
 */
export function buildPartnerPlan({ partners, dealerRefs }) {
  const customers = [];
  const suppliers = [];
  const deferred = [];
  const unknownKind = [];
  const duplicates = [];
  const kindConflicts = [];
  const multiPhones = [];
  const unsplittablePhones = [];

  /* Gom TOÀN BỘ dòng cùng định danh TRƯỚC khi phân rổ — bản cũ phân rổ trước nên không bao giờ
     nhìn thấy hai dòng của cùng một khách khai ngược nhau. */
  const groups = new Map();
  for (const partner of partners) {
    const identity = partner.identity ?? partnerIdentityKey(partner.partner_name);
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(partner);
  }

  for (const rows of groups.values()) {
    for (const row of rows) {
      if (row.extra_phones?.length) {
        multiPhones.push({
          source_row: row.source_row,
          partner_name: row.partner_name,
          phone: row.phone,
          extra_phones: row.extra_phones,
        });
      }
      if (phoneDigitCount(row.phone) > MAX_PHONE_DIGITS) {
        // Còn dính nhiều số mà không tách được theo dấu nào — ghi ra, KHÔNG cắt bừa chuỗi số.
        unsplittablePhones.push({ source_row: row.source_row, partner_name: row.partner_name, phone: row.phone });
      }
    }

    /* Hai dòng cùng khách khai phân loại NGƯỢC NHAU → không dòng nào thắng. */
    const declaredKinds = new Set(rows.map((row) => row.kind).filter(Boolean));
    if (declaredKinds.size > 1) {
      kindConflicts.push({
        partner_name: rows[0].partner_name,
        rows: rows.map((row) => ({ source_row: row.source_row, kind_raw: row.kind_raw, kind: row.kind })),
      });
      for (const row of rows) deferred.push({ ...row, defer_reason: "conflicting_declared_kind" });
      continue;
    }

    /* Giữ dòng đầu làm chỗ đứng, nhưng KÉO mọi trường trống về từ các dòng sau. */
    const kept = { ...rows[0], merged_from: [] };
    for (const dropped of rows.slice(1)) {
      const taken = [];
      for (const [field, label] of MERGEABLE_FIELDS) {
        if (kept[field] || !dropped[field]) continue;
        kept[field] = dropped[field];
        if (field === "kind") kept.kind_raw = dropped.kind_raw;
        if (field === "phone") kept.extra_phones = dropped.extra_phones ?? [];
        taken.push({ field, label });
      }
      if (taken.length > 0) kept.merged_from.push({ source_row: dropped.source_row, fields: taken });
      duplicates.push({
        source_row: dropped.source_row,
        merged_into: kept.source_row,
        partner_name: dropped.partner_name,
        kind_raw: dropped.kind_raw ?? null,
        phone: dropped.phone ?? null,
        extra_phones: dropped.extra_phones ?? [],
        address: dropped.address ?? null,
        account_manager: dropped.account_manager ?? null,
        note: dropped.note ?? null,
        merged_fields: taken.map((item) => item.field),
      });
    }

    if (kept.kind === "SUPPLIER") {
      suppliers.push(kept);
      continue;
    }
    if (kept.kind === "UNKNOWN") {
      // Có chữ trong ô phân loại nhưng không hiểu là gì — khác hẳn với ô trống.
      unknownKind.push({ source_row: kept.source_row, kind_raw: kept.kind_raw });
      deferred.push({ ...kept, defer_reason: "unrecognized_kind" });
      continue;
    }

    const priceGroup = kept.kind ?? (dealerRefs.has(kept.key) ? "Đại lý" : null);
    if (!priceGroup) {
      deferred.push({ ...kept, defer_reason: "missing_price_group_authority" });
      continue;
    }
    customers.push({
      ...kept,
      price_group: priceGroup,
      price_group_authority: kept.kind ? "declared" : "sales_history",
    });
  }

  const nearDuplicateNames = collectNearDuplicateNames(groups);

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
      kind_conflict_count: kindConflicts.length,
      near_duplicate_name_count: nearDuplicateNames.length,
      near_duplicate_conflicting_count: nearDuplicateNames.filter((entry) => entry.conflicting_evidence).length,
      multi_phone_count: multiPhones.length,
      unsplittable_phone_count: unsplittablePhones.length,
      merged_field_row_count: duplicates.filter((row) => row.merged_fields.length > 0).length,
      with_phone: partners.filter((row) => row.phone).length,
      with_address: partners.filter((row) => row.address).length,
      account_manager_count: new Set(partners.map((row) => row.account_manager).filter(Boolean)).size,
    },
    duplicates,
    unknown_kind: unknownKind,
    kind_conflicts: kindConflicts,
    near_duplicate_names: nearDuplicateNames,
    multi_phones: multiPhones,
    unsplittable_phones: unsplittablePhones,
  };
}

/**
 * Hai định danh KHÁC NHAU nhưng chung khoá bỏ dấu — nghi gõ nhầm dấu, KHÔNG tự gộp.
 *
 * Đo được 6 cặp; 3 cặp mang bằng chứng mâu thuẫn (SĐT khác nhau hoặc người phụ trách khác nhau)
 * nên gần như chắc chắn là hai người thật. 3 cặp còn lại có thể là một người gõ hai kiểu, nhưng
 * gộp nhầm thì mất trắng một khách còn tách nhầm thì chỉ dư một bản ghi — mà bản ghi dư vẫn
 * `disabled` được, còn khách bị nuốt thì không lấy lại được. Nên tách hết, hỏi chủ xưởng sau.
 *
 * Danh sách này đi cùng danh sách SĐT dùng chung: cả hai đều là CÂU HỎI, không phải kết luận.
 */
function collectNearDuplicateNames(groups) {
  /* Gom theo khoá BỎ DẤU; mỗi phần tử là một nhóm định danh (tên CÓ DẤU) hoàn chỉnh. */
  const byLooseKey = new Map();
  for (const rows of groups.values()) {
    const loose = rows[0].key ?? partnerKey(rows[0].partner_name);
    if (!loose) continue;
    if (!byLooseKey.has(loose)) byLooseKey.set(loose, []);
    byLooseKey.get(loose).push(rows);
  }

  const result = [];
  for (const [loose, identityGroups] of byLooseKey) {
    if (identityGroups.length < 2) continue;
    /* So bằng chứng trên MỌI dòng của cả hai nhánh, không chỉ dòng đầu — dòng thứ hai của một
       nhánh cũng có thể là chỗ duy nhất mang SĐT. */
    const rows = identityGroups.flat();
    const phones = new Set(rows.map((row) => row.phone).filter(Boolean));
    const managers = new Set(rows.map((row) => row.account_manager).filter(Boolean));
    result.push({
      loose_key: loose,
      conflicting_evidence: phones.size > 1 || managers.size > 1,
      rows: rows.map((row) => ({
        source_row: row.source_row,
        partner_name: row.partner_name,
        phone: row.phone ?? null,
        account_manager: row.account_manager ?? null,
        kind_raw: row.kind_raw ?? null,
      })),
    });
  }
  return result;
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
 *
 * `note` còn chở hai loại vết KHÔNG ĐƯỢC MẤT, viết theo đúng khuôn đã dùng cho SĐT dùng chung:
 *   - `SĐT phụ: …`        — số thứ hai của ô hai số, `Customer.phone` chỉ giữ được một số.
 *   - `SĐT lấy từ dòng N` — trường kéo về từ dòng trùng, để truy ngược lại nguồn.
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
    if (row.extra_phones?.length) notes.push(`SĐT phụ: ${row.extra_phones.join(" · ")}`);
    for (const merged of row.merged_from ?? []) {
      for (const { label } of merged.fields) notes.push(`${label} lấy từ dòng ${merged.source_row}`);
    }
    if (notes.length > 0) values.note = notes.join(" · ");
    return { row_number: row.source_row, values };
  });
}

export const __testing = {
  DS,
  EXPECTED_DS_HEADER,
  MIN_PARTNER_ROWS,
  MAX_PHONE_DIGITS,
  ACCOUNT_MANAGER_ALIASES,
  MERGEABLE_FIELDS,
};
