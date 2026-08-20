/**
 * Neo các con số của nguồn ĐỐI TÁC (`DS-KH-NCC.md`) và các cổng chặn quanh nó.
 *
 * VÌ SAO CẦN BỘ TEST NÀY: bản nhập Customer trước đó đọc `data/customer-export.xlsx` đã bị moi
 * ruột còn 4 cột × 1 dòng rác, mà cổng duy nhất là pin SHA256 — hash vẫn KHỚP nên không ai biết.
 * Bài học: cổng phải kiểm HÌNH DẠNG và CON SỐ, không chỉ kiểm "file có đổi không". Mỗi test dưới
 * đây khoá một con số đã đo được, để lần sau nguồn co lại hay phình ra thì chết ở đây chứ không
 * chết im lặng trong D1.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync as read } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  __testing,
  buildCustomerRecords,
  buildPartnerPlan,
  canonicalAccountManager,
  classifyPartnerKind,
  loadPartnerSource,
  parsePartnerSource,
  partnerIdentityKey,
  partnerKey,
  splitPhoneCell,
} from "../scripts/lib/alumdoor-partner-source.mjs";
import { collectSuppliers } from "../../scripts/local-runner/import-alumdoor-supplier-master-local.mjs";
import { parseAlumdoorIndexedMarkdownRows, readAlumdoorCell } from "../scripts/lib/alumdoor-source-markdown.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NGUON = resolve(REPO_ROOT, "apps/alumdoor/docs/nguon/don-hang-xuat-hang");
const PARTY_SOURCE = resolve(NGUON, "DS-KH-NCC.md");
const GOODS_SOURCE = resolve(NGUON, "DS-HH-NHẬP.md");

/**
 * Đo thật một lần rồi dùng chung: `loadPartnerSource` đọc 1 file đối tác + 6 sheet tháng.
 */
let cachedPlan = null;
async function realPlan() {
  if (!cachedPlan) {
    const source = await loadPartnerSource(REPO_ROOT);
    cachedPlan = { source, plan: buildPartnerPlan(source) };
  }
  return cachedPlan;
}

/* ───────────────────────── Con số neo của nguồn thật ───────────────────────── */

test("nguồn thật: 448 = 403 khách + 5 NCC-thuần + 33 hoãn + 7 dòng trùng đã gộp", async () => {
  const { plan } = await realPlan();
  const s = plan.summary;

  assert.equal(s.partner_count, 448, "448 đối tác có tên trong DS-KH-NCC.md");
  assert.equal(s.customer_count, 403, "403 khách nạp được vào D1");
  assert.equal(s.supplier_count, 9, "2 tự khai NCC + 7 suy từ cột NCC của DANH-MỤC.md");
  assert.equal(s.both_customer_and_supplier, 4, "4 đối tác VỪA mua VỪA bán");
  assert.equal(s.deferred_count, 33, "31 thiếu thẩm quyền + 2 dòng của cặp khai ngược nhau");
  assert.equal(s.duplicate_count, 7, "7 dòng trùng ĐỊNH DANH (tên CÓ DẤU) đã gộp vào dòng trước");

  /**
   * PHÉP CỘNG ĐỔI KHI NCC VÀ KHÁCH THÔI LOẠI TRỪ NHAU.
   *
   * Bản trước cộng bốn rổ rời nhau. Nay một đối tác có thể nằm ở CẢ HAI rổ khách và NCC, nên
   * cộng thẳng `customer_count + supplier_count` là đếm 4 người hai lần. Bất biến đúng là:
   * mỗi dòng nguồn rơi vào đúng MỘT trong bốn số phận — thành khách (kể cả khách kiêm NCC),
   * thành NCC thuần, bị hoãn, hoặc đã gộp vào dòng trước.
   */
  const supplierOnly = s.supplier_count - s.both_customer_and_supplier;
  assert.equal(supplierOnly, 5, "9 NCC trừ 4 người kiêm khách");
  assert.equal(
    s.customer_count + supplierOnly + s.deferred_count + s.duplicate_count,
    s.partner_count,
    "tổng bốn số phận phải bằng 448 — lệch là có dòng bị nuốt hoặc đếm hai lần",
  );
});

test("NCC và KHÁCH không loại trừ nhau — 4 đối tác vừa mua vừa bán", async () => {
  /**
   * Bản trước gặp `NCC` là đẩy sang rổ nhà cung cấp rồi `continue`, nên đối tác đó không bao giờ
   * có bản ghi `Customer`. Nguồn bác bỏ ở bốn chỗ: bốn tên vừa đứng ở cột NCC của `DANH-MỤC.md`
   * (ta MUA của họ) vừa đứng ở cột ĐẠI LÝ của sheet đơn hàng tháng (ta BÁN cho họ).
   */
  const { plan } = await realPlan();
  const both = plan.customers.filter((row) => row.also_supplier);
  assert.deepEqual(
    both.map((row) => `${row.source_row}:${row.partner_name}`),
    ["121:ANH TUẤN Q7", "182:ANH ĐẠT MOTOR", "200:ĐỨC TÀI", "216:VIỆT ĐÔNG HƯNG"],
  );
  // Cả bốn phải có mặt ở CẢ HAI rổ — vào rổ này mà mất rổ kia là quay lại mô hình loại trừ.
  const supplierRows = new Set(plan.suppliers.map((row) => row.source_row));
  for (const row of both) assert.equal(supplierRows.has(row.source_row), true, row.partner_name);
});

test("NCC ta đang mua hàng KHÔNG bị hỏi 'nhóm giá là gì'", async () => {
  /**
   * `ANH HUY BẠC ĐẠN` (184), `PHÚ XUÂN VIỆT` (211), `TIẾN ĐẠT` (213) từng nằm trong rổ hoãn với
   * tư cách "khách chưa rõ nhóm giá". Chúng thiếu nhóm giá không phải vì nguồn sót — mà vì ta
   * KHÔNG bán cho họ. Đưa chúng cho chủ xưởng là hỏi một câu không có câu trả lời.
   */
  const { plan } = await realPlan();
  const deferredRows = new Set(plan.deferred.map((row) => row.source_row));
  for (const row of [184, 211, 213]) {
    assert.equal(deferredRows.has(row), false, `dòng ${row} là NCC, không phải khách chưa rõ nhóm giá`);
  }
  assert.equal(plan.summary.supplier_from_purchase_history, 7);
  assert.equal(plan.summary.supplier_declared, 2);
});

test("403 khách chia đúng theo thẩm quyền và theo nhóm giá", async () => {
  const { plan } = await realPlan();
  const s = plan.summary;

  // Thẩm quyền: 327 dòng tự khai + 76 dòng suy từ cột ĐẠI LÝ của sheet tháng.
  assert.equal(s.customer_declared, 327);
  assert.equal(s.customer_from_sales_history, 76);
  assert.equal(s.customer_declared + s.customer_from_sales_history, 403);

  // Nhóm giá quyết định tiền VÀ kích thước cắt nhôm, nên chỉ có đúng hai giá trị hợp lệ.
  assert.equal(s.dealer_count, 399);
  assert.equal(s.retail_count, 4);
  assert.equal(s.dealer_count + s.retail_count, 403);

  /**
   * Rổ `Lẻ` vẫn đúng 4 tên SAU khi sửa mâu thuẫn nhóm giá — không phải 5.
   * `ANH HƯỞNG - KHÁCH LẺ` KHÔNG vào đây: nguồn khai `KH` ở dòng 86 và `KH LẺ` ở dòng 236, nên
   * nó bị HOÃN chứ không được xếp Lẻ. Chọn Lẻ ở đây cũng là đoán, y như chọn Đại lý.
   */
  assert.deepEqual(
    plan.customers.filter((row) => row.price_group === "Lẻ").map((row) => row.source_row),
    [233, 234, 237, 239],
  );
});

test("9 nhà cung cấp là chín cái tên cụ thể, kèm bằng chứng của từng cái", async () => {
  const { plan } = await realPlan();
  assert.deepEqual(
    plan.suppliers.map((row) => `${row.source_row}:${row.partner_name}:${row.supplier_authority}`),
    [
      "121:ANH TUẤN Q7:purchase_history",
      "182:ANH ĐẠT MOTOR:purchase_history",
      "184:ANH HUY BẠC ĐẠN:purchase_history",
      "196:CTY NAM PHÁT:declared",
      "200:ĐỨC TÀI:purchase_history",
      "211:PHÚ XUÂN VIỆT:purchase_history",
      "213:TIẾN ĐẠT:purchase_history",
      "216:VIỆT ĐÔNG HƯNG:purchase_history",
      "318:ANH BẢO BỌ - LỘC PHÁT:declared_and_purchase_history",
    ],
  );
});

/* ───────────── Nhóm giá: cấm đoán, thiếu thẩm quyền thì hoãn ───────────── */

test("ô phân loại trống KHÔNG được suy ra nhóm giá", () => {
  for (const blank of ["", "   ", null, undefined]) {
    assert.equal(classifyPartnerKind(blank), null, `"${blank}" phải trả null, không được đoán`);
  }
});

test("ô phân loại có chữ lạ là UNKNOWN chứ không rơi vào Đại lý", () => {
  // `UNKNOWN` khác hẳn `null`: có người đã gõ một thứ gì đó vào ô, chỉ là ta chưa hiểu.
  for (const odd of ["KH VIP", "CTV", "ĐẠI LÝ CẤP 2", "KH SỈ"]) {
    assert.equal(classifyPartnerKind(odd), "UNKNOWN", odd);
  }
  assert.equal(classifyPartnerKind("KH"), "Đại lý");
  assert.equal(classifyPartnerKind("KH LẺ"), "Lẻ");
  assert.equal(classifyPartnerKind("NCC"), "SUPPLIER");

  // Ô chỉ có dấu câu KHÔNG phải chữ lạ: `partnerKey` bỏ hết ký tự không chữ-số nên "?" và "-"
  // rỗng như ô trống, và rơi vào rổ HOÃN chứ không vào rổ "chưa hiểu".
  for (const punctuation of ["?", "-", "  ...  "]) {
    assert.equal(classifyPartnerKind(punctuation), null, punctuation);
  }
});

test("không khai phân loại và không có lịch sử bán → HOÃN, không đoán", () => {
  const partners = [
    { source_row: 10, partner_name: "KHÁCH KHÔNG RÕ", key: partnerKey("KHÁCH KHÔNG RÕ"), kind_raw: null, kind: null },
    { source_row: 11, partner_name: "KHÁCH ĐÃ BÁN", key: partnerKey("KHÁCH ĐÃ BÁN"), kind_raw: null, kind: null },
    { source_row: 12, partner_name: "KHÁCH LẠ KIỂU", key: partnerKey("KHÁCH LẠ KIỂU"), kind_raw: "KH VIP", kind: "UNKNOWN" },
  ];
  const plan = buildPartnerPlan({ partners, dealerRefs: new Set([partnerKey("KHÁCH ĐÃ BÁN")]) });

  assert.deepEqual(plan.customers.map((row) => row.source_row), [11]);
  assert.equal(plan.customers[0].price_group, "Đại lý");
  assert.equal(plan.customers[0].price_group_authority, "sales_history");
  assert.deepEqual(
    plan.deferred.map((row) => [row.source_row, row.defer_reason]),
    [[10, "missing_price_group_authority"], [12, "unrecognized_kind"]],
  );
});

/* ───────── Hai dòng cùng khách khai NGƯỢC NHAU: hoãn cả hai, không chọn dòng nào ───────── */

test("mâu thuẫn nhóm giá giữa hai dòng cùng tên: đúng 1 cặp, và cả hai dòng bị HOÃN", async () => {
  const { plan } = await realPlan();

  /**
   * Dòng 86 `ANH HƯỞNG - KHÁCH LẺ` khai `KH` (→ Đại lý), dòng 236 cùng tên khai `KH LẺ` (→ Lẻ).
   * Bản trước giữ dòng 86 và vứt dòng 236, tức chốt nhóm giá bằng THỨ TỰ DÒNG. Sai nhóm giá là
   * sai tiền VÀ sai kích thước cắt (Đại lý trừ 0,02 m trên phủ bì nhựa; Lẻ trừ 0,08 m trên phủ bì
   * ray) — chênh cả gốc đo lẫn 60 mm số trừ trên mọi cửa của khách này.
   */
  assert.equal(plan.summary.kind_conflict_count, 1);
  assert.deepEqual(plan.kind_conflicts[0].rows, [
    { source_row: 86, kind_raw: "KH", kind: "Đại lý" },
    { source_row: 236, kind_raw: "KH LẺ", kind: "Lẻ" },
  ]);

  const deferredRows = plan.deferred.filter((row) => row.defer_reason === "conflicting_declared_kind");
  assert.deepEqual(deferredRows.map((row) => row.source_row), [86, 236]);

  /* Dòng hoãn KHÔNG vào D1, nên dữ liệu của nó phải còn nguyên trong plan để evidence chở đi —
     dòng 236 là chỗ duy nhất có SĐT và địa chỉ của khách này. */
  const row236 = deferredRows.find((row) => row.source_row === 236);
  assert.equal(row236.phone, "0987603754");
  assert.match(row236.address, /216\/148 Đường số 5/u);

  // Không dòng nào của cặp mâu thuẫn được lọt vào rổ khách — kể cả dòng đầu.
  const customerRows = new Set(plan.customers.map((row) => row.source_row));
  assert.equal(customerRows.has(86), false, "dòng 86 KHÔNG được thắng chỉ vì đứng trước");
  assert.equal(customerRows.has(236), false);
});

test("mâu thuẫn phân loại được phát hiện dù dòng nào đứng trước", () => {
  const make = (rows) => buildPartnerPlan({
    partners: rows.map((row) => ({
      ...row,
      key: partnerKey(row.partner_name),
      identity: partnerIdentityKey(row.partner_name),
    })),
    dealerRefs: new Set(),
  });
  const a = { source_row: 10, partner_name: "KHÁCH X", kind_raw: "KH", kind: "Đại lý" };
  const b = { source_row: 20, partner_name: "KHÁCH X", kind_raw: "KH LẺ", kind: "Lẻ" };

  for (const order of [[a, b], [b, a]]) {
    const plan = make(order);
    assert.equal(plan.summary.kind_conflict_count, 1);
    assert.equal(plan.customers.length, 0, "không dòng nào được chọn");
    assert.deepEqual(plan.deferred.map((row) => row.defer_reason), [
      "conflicting_declared_kind", "conflicting_declared_kind",
    ]);
  }

  // Một dòng khai, một dòng để TRỐNG thì KHÔNG phải mâu thuẫn — lời khai duy nhất được dùng.
  const single = make([{ source_row: 10, partner_name: "KHÁCH Y", kind_raw: null, kind: null }, { ...b, partner_name: "KHÁCH Y" }]);
  assert.equal(single.summary.kind_conflict_count, 0);
  assert.deepEqual(single.customers.map((row) => [row.source_row, row.price_group]), [[10, "Lẻ"]]);
});

/* ───────── Dòng trùng: hợp nhất trường trống, không vứt dữ liệu ───────── */

test("dòng trùng KHÔNG bị vứt trắng: trường trống được kéo về và evidence chở đủ dữ liệu", async () => {
  const { plan } = await realPlan();

  /**
   * Bản trước ghi đúng `{source_row, partner_name}` rồi `continue`, nên 6 SĐT và 2 địa chỉ của
   * các dòng bị bỏ không còn ở đâu — trái luật "nghỉ hưu, không xoá" mà chính lượt này đã áp cho
   * SĐT dùng chung. Nay mỗi dòng bị gộp phải còn nguyên dữ liệu trong evidence.
   */
  for (const row of plan.duplicates) {
    for (const field of ["source_row", "merged_into", "partner_name", "kind_raw", "phone", "address", "note", "account_manager", "merged_fields"]) {
      assert.ok(field in row, `evidence.duplicates thiếu trường ${field}`);
    }
  }

  // Không dòng nào mất trắng: mọi trường có dữ liệu ở dòng bị gộp mà dòng giữ đang trống
  // đều phải được kéo sang.
  const kept = new Map(plan.customers.concat(plan.suppliers, plan.deferred).map((row) => [row.source_row, row]));
  for (const dropped of plan.duplicates) {
    const target = kept.get(dropped.merged_into);
    if (!target) continue;
    for (const field of ["phone", "address", "note", "account_manager"]) {
      if (dropped[field]) assert.ok(target[field], `dòng ${dropped.source_row}.${field} bị vứt trắng`);
    }
  }

  // Hai lần hợp nhất đo được trên nguồn thật, có số dòng cụ thể chứ không phải "một vài".
  assert.equal(plan.summary.merged_field_row_count, 2);
  assert.deepEqual(
    plan.duplicates.filter((row) => row.merged_fields.length > 0)
      .map((row) => [row.source_row, row.merged_into, row.merged_fields]),
    [[362, 103, ["kind"]], [438, 268, ["phone"]]],
  );

  // Dòng 438 mang SĐT mà dòng 268 để trống — SĐT đó phải có mặt trong bản ghi Customer,
  // kèm vết chỉ về dòng nguồn.
  const record = buildCustomerRecords(plan.customers, new Set()).find((row) => row.row_number === 268);
  assert.equal(record.values.phone, "0907219579");
  assert.match(record.values.note, /SĐT lấy từ dòng 438/u);
});

/* ───────── Tên lệch dấu: KHÔNG gộp im lặng ───────── */

test("định danh khách dùng tên CÓ DẤU, khớp phép dò trùng của server", () => {
  // `partnerKey` bỏ dấu nên gộp hai cái tên khác hẳn nhau; `partnerIdentityKey` thì không.
  assert.equal(partnerKey("ANH BIỂN"), partnerKey("ANH BIÊN"));
  assert.notEqual(partnerIdentityKey("ANH BIỂN"), partnerIdentityKey("ANH BIÊN"));
  assert.notEqual(partnerIdentityKey("ANH HÙNG"), partnerIdentityKey("ANH HƯNG"));

  // Khớp `customer-import.ts`: `text(customer_name).toLocaleLowerCase("vi")`.
  assert.equal(partnerIdentityKey("Anh Biển"), "anh biển");
  assert.equal(partnerIdentityKey("  ANH   BIỂN  "), "anh biển");
});

test("6 cặp tên lệch dấu tách thành 6 khách riêng và được liệt kê để chủ xưởng chốt", async () => {
  const { plan } = await realPlan();
  assert.equal(plan.summary.near_duplicate_name_count, 6);

  assert.deepEqual(
    plan.near_duplicate_names.map((entry) => entry.rows.map((row) => `${row.source_row}:${row.partner_name}`)),
    [
      ["5:ANH HOÁ", "183:ANH HOÀ"],
      ["71:ANH BIỂN", "349:ANH BIÊN"],
      ["107:ANH THE GIANG", "238:ANH THẾ GIANG"],
      ["278:NHÔM KÍNH HÒA LỘC", "428:NHÔM KÍNH HOÀ LỘC"],
      ["297:ANH HÙNG", "364:ANH HƯNG"],
      ["346:CỬA MINH CHÂU", "399:CƯẢ MINH CHÂU"],
    ],
  );

  /**
   * 3 cặp mang bằng chứng nguồn nói đây là HAI NGƯỜI THẬT (SĐT khác nhau hoặc người phụ trách
   * khác nhau) — không phải 2 như bản audit ước: cặp 5/183 cũng lệch người phụ trách
   * (LƯ CHÍ CƯỜNG vs THÁI SƠN), cùng loại bằng chứng với cặp 297/364.
   */
  assert.equal(plan.summary.near_duplicate_conflicting_count, 3);
  assert.deepEqual(
    plan.near_duplicate_names.filter((entry) => entry.conflicting_evidence).map((entry) => entry.loose_key),
    ["anh hoa", "anh bien", "anh hung"],
  );

  // Và cả 6 dòng "vế sau" đều phải có mặt ở một rổ nào đó, không dòng nào bốc hơi.
  const placed = new Set([
    ...plan.customers.map((row) => row.source_row),
    ...plan.suppliers.map((row) => row.source_row),
    ...plan.deferred.map((row) => row.source_row),
  ]);
  for (const row of [183, 349, 238, 428, 364, 399]) {
    assert.equal(placed.has(row), true, `dòng ${row} phải có bản ghi riêng, không bị nuốt`);
  }
});

/* ───────── Ô SĐT chứa hai số ───────── */

test("4 ô SĐT chứa hai số được tách; không ô nào còn 20 chữ số vào Customer.phone", async () => {
  const { plan } = await realPlan();
  assert.equal(plan.summary.multi_phone_count, 4);
  assert.deepEqual(
    plan.multi_phones.map((row) => [row.source_row, row.phone, row.extra_phones]),
    [
      [169, "0918 691 691", ["0966 336 139"]],
      [274, "0905 168 690", ["0974765728"]],
      [316, "0367 35 2572", ["0916 964023"]],
      [450, "0932608860", ["0943608860"]],
    ],
  );
  assert.equal(plan.summary.unsplittable_phone_count, 0);

  // `normalizedPhone` của server chỉ giữ chữ số, nên 20 chữ số lọt qua là số không gọi được.
  const records = buildCustomerRecords(plan.customers, new Set());
  const digits = (value) => String(value ?? "").replace(/[^0-9]/gu, "").length;
  assert.equal(records.filter((row) => digits(row.values.phone) > __testing.MAX_PHONE_DIGITS).length, 0);

  // Số thứ hai KHÔNG bị xoá — nó nằm trong `note` theo đúng khuôn của SĐT dùng chung.
  const record = records.find((row) => row.row_number === 450);
  assert.equal(record.values.phone, "0932608860");
  assert.match(record.values.note, /SĐT phụ: 0943608860/u);
});

test("splitPhoneCell chỉ tách khi cả hai mảnh đủ chữ số, không cắt tên người ra khỏi số", () => {
  assert.deepEqual(splitPhoneCell("0905 168 690/0974765728"), { phone: "0905 168 690", extra_phones: ["0974765728"] });
  assert.deepEqual(splitPhoneCell("0918 691 691 - 0966 336 139"), { phone: "0918 691 691", extra_phones: ["0966 336 139"] });
  assert.deepEqual(splitPhoneCell("0367 35 2572 _ 0916 964023"), { phone: "0367 35 2572", extra_phones: ["0916 964023"] });

  // 6 ô khác trong nguồn có dấu `-` nhưng vế sau là TÊN NGƯỜI — mảnh đó không đủ chữ số, nên ô
  // giữ nguyên văn. Server vốn đã bỏ phần chữ khi chuẩn hoá, đừng đụng vào.
  assert.deepEqual(splitPhoneCell("0972 886 317 - ANH LÂM"), { phone: "0972 886 317 - ANH LÂM", extra_phones: [] });
  assert.deepEqual(splitPhoneCell("0909 807 613 ( A.DŨNG)"), { phone: "0909 807 613 ( A.DŨNG)", extra_phones: [] });
  assert.deepEqual(splitPhoneCell(""), { phone: null, extra_phones: [] });
  assert.deepEqual(splitPhoneCell(null), { phone: null, extra_phones: [] });
});

test("mọi bản ghi Customer dựng ra đều có nhóm giá hợp lệ — không có dòng nào lọt trống", async () => {
  const { plan } = await realPlan();
  const records = buildCustomerRecords(plan.customers, new Set());
  assert.equal(records.length, 403);
  const groups = new Set(records.map((row) => row.values.price_group));
  assert.deepEqual([...groups].sort(), ["Lẻ", "Đại lý"].sort());
  assert.equal(records.filter((row) => !row.values.customer_name).length, 0);

  // 36 đối tác hoãn KHÔNG được lẫn vào payload, dù chúng vẫn phải còn tên trong evidence.
  const deferredNames = new Set(plan.deferred.map((row) => row.partner_name));
  assert.equal(records.filter((row) => deferredNames.has(row.values.customer_name)).length, 0);
  assert.equal(deferredNames.size > 0 && plan.deferred.every((row) => row.partner_name && row.defer_reason), true);
});

test("account_manager chỉ thành Link khi Employee có thật; không thì giữ tên trong ghi chú", async () => {
  const { plan } = await realPlan();
  // Link trỏ vào bản ghi không tồn tại làm hỏng cả lượt nạp, nên tập rỗng = không gán Link nào.
  const withoutEmployees = buildCustomerRecords(plan.customers, new Set());
  assert.equal(withoutEmployees.filter((row) => row.values.account_manager).length, 0);
  assert.equal(withoutEmployees.filter((row) => /Người phụ trách:/.test(row.values.note ?? "")).length > 300, true);

  const withEmployees = buildCustomerRecords(plan.customers, new Set(["THÁI SƠN"]));
  assert.equal(withEmployees.filter((row) => row.values.account_manager === "THÁI SƠN").length > 0, true);
  assert.equal(withEmployees.filter((row) => /Người phụ trách: THÁI SƠN/.test(row.values.note ?? "")).length, 0);
});

/* ───────────── Người phụ trách: 7 cách viết về 4 người ───────────── */

test("7 cách viết người phụ trách gộp về đúng 4 người", async () => {
  const rows = parseAlumdoorIndexedMarkdownRows(await readFile(PARTY_SOURCE, "utf8"));
  const raw = new Set();
  const canonical = new Set();
  for (const row of rows) {
    if (row.source_row < __testing.DS.FIRST_DATA_ROW) continue;
    const value = readAlumdoorCell(row, __testing.DS.ACCOUNT_MANAGER);
    if (!value) continue;
    raw.add(value);
    canonical.add(canonicalAccountManager(value));
  }
  assert.equal(raw.size, 7, "nguồn có 7 cách viết");
  assert.equal(canonical.size, 4, "gộp lại còn 4 nhân viên thật");
  assert.deepEqual([...canonical].sort(), ["LÊ THÚY", "LÊ THẾ ĐÔN", "LƯ CHÍ CƯỜNG", "THÁI SƠN"].sort());
});

test("gộp người phụ trách là bảng khai tay: khác dấu, gọi tắt, gõ nhầm đều về một mối", () => {
  // `LÊ THUÝ` vs `LÊ THÚY` khác đúng một dấu; `CHÍ CƯỜNG` là gọi tắt; `LÊ THỂ ĐÔN` là gõ nhầm.
  assert.equal(canonicalAccountManager("LÊ THUÝ"), "LÊ THÚY");
  assert.equal(canonicalAccountManager("LÊ THÚY"), "LÊ THÚY");
  assert.equal(canonicalAccountManager("CHÍ CƯỜNG"), "LƯ CHÍ CƯỜNG");
  assert.equal(canonicalAccountManager("LƯ CHÍ CƯỜNG"), "LƯ CHÍ CƯỜNG");
  assert.equal(canonicalAccountManager("LÊ THỂ ĐÔN"), "LÊ THẾ ĐÔN");
  assert.equal(canonicalAccountManager(""), null);

  // Khoá tra bảng là tên ĐÃ BỎ DẤU, nên mọi biến thể dấu của bốn cái tên đó đều tự gộp — kể cả
  // biến thể chưa từng xuất hiện trong nguồn. Việc thật của bảng khai tay là (a) chọn MỘT cách
  // viết để hiển thị và (b) gộp cách gọi tắt `CHÍ CƯỜNG`, thứ mà bỏ dấu không gộp được.
  assert.equal(canonicalAccountManager("LÊ THUỲ"), "LÊ THÚY");
  assert.equal(partnerKey("LÊ THẾ ĐÔN"), partnerKey("LÊ THỂ ĐÔN"));
  assert.notEqual(partnerKey("CHÍ CƯỜNG"), partnerKey("LƯ CHÍ CƯỜNG"));

  // Tên khác HẲN thì KHÔNG bị nhét vào người gần giống nhất — giữ nguyên để người ta khai thêm.
  assert.equal(canonicalAccountManager("NGUYỄN VĂN A"), "NGUYỄN VĂN A");
  assert.equal(canonicalAccountManager("LÊ THẾ ĐÔNG"), "LÊ THẾ ĐÔNG");
});

/* ───────────── Ngưỡng 400 dòng: nguồn bị cắt phải chết ngay ───────────── */

function makeSource(dataRowCount, { header = validHeaderLine() } = {}) {
  const lines = ["# DS KH-NCC", "", "    1 | [0] DANH SÁCH NCC/KHÁCH HÀNG", header];
  for (let i = 0; i < dataRowCount; i += 1) {
    lines.push(`    ${i + 3} | [0] KHÁCH ${i + 1}  ·  [1] THÁI SƠN  ·  [2] KH  ·  [3] 090000${String(i).padStart(4, "0")}`);
  }
  return `${lines.join("\n")}\n`;
}
/**
 * Nhân đôi TOÀN BỘ khối dữ liệu của một bản trích, giữ nguyên hai dòng đầu (tiêu đề).
 *
 * Đây là hình dạng của lỗi copy/trích thường gặp nhất — dán đè cả khối lên chính nó — và là kiểu
 * hỏng mà rổ `duplicates` không có trần nào để bắt.
 */
function duplicateEveryDataRow(text) {
  const serialize = (cells) => Object.entries(cells)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([index, value]) => `[${index}] ${value}`)
    .join("  ·  ");

  const rows = parseAlumdoorIndexedMarkdownRows(text);
  const head = rows.filter((row) => row.source_row < __testing.DS.FIRST_DATA_ROW);
  const data = rows.filter((row) => row.source_row >= __testing.DS.FIRST_DATA_ROW);

  const lines = ["# DS KH-NCC", ""];
  for (const row of head) lines.push(`    ${row.source_row} | ${serialize(row.cells)}`);
  let next = __testing.DS.FIRST_DATA_ROW;
  for (const row of [...data, ...data]) lines.push(`    ${next++} | ${serialize(row.cells)}`);
  return `${lines.join("\n")}\n`;
}

function validHeaderLine() {
  const cells = Object.entries(__testing.EXPECTED_DS_HEADER)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([index, value]) => `[${index}] ${value}`)
    .join("  ·  ");
  return `    2 | ${cells}`;
}

test("ngưỡng 400: nguồn bị cắt chết ngay, không nạp một dòng rác", () => {
  assert.equal(__testing.MIN_PARTNER_ROWS, 400);

  // Đây chính là hình dạng đã lọt qua cổng hash: đúng cột, đúng tiêu đề, chỉ còn 1 dòng.
  assert.throws(
    () => parsePartnerSource(makeSource(1)),
    /nguồn chỉ còn 1 đối tác, dưới ngưỡng 400/,
    "1 dòng phải chết",
  );
  assert.throws(() => parsePartnerSource(makeSource(399)), /dưới ngưỡng 400/, "399 dòng vẫn phải chết");

  const ok = parsePartnerSource(makeSource(400));
  assert.equal(ok.partners.length, 400);
});

test("ngưỡng 400 không thay thế được cổng hình dạng cột", () => {
  // Đủ dòng nhưng sai bố cục cột thì vẫn phải chết — hai cổng bắt hai kiểu hỏng khác nhau.
  const wrongHeader = "    2 | [0] Tên khách hàng  ·  [1] Điện thoại  ·  [2] Mã số thuế";
  assert.throws(
    () => parsePartnerSource(makeSource(400, { header: wrongHeader })),
    /bố cục cột đã đổi/,
  );
});

test("nguồn thật vượt ngưỡng và giữ đúng bố cục cột", async () => {
  const parsed = parsePartnerSource(await readFile(PARTY_SOURCE, "utf8"));
  assert.equal(parsed.partners.length, 448);
  assert.equal(parsed.partners.length > __testing.MIN_PARTNER_ROWS, true);
  // 1 dòng có ô nhưng không có tên: ghi lại chứ không nuốt.
  assert.deepEqual(parsed.nameless, [193]);
});

/* ───────────── Bẫy: dòng tiêu đề lọt vào danh sách NCC ───────────── */

test("bẫy: tiêu đề cột 'KH/NCC/KH LẺ' tự nhận mình là NCC", () => {
  // Bộ lọc NCC nhận diện bằng chuỗi con "NCC", mà tiêu đề cột CÓ chuỗi đó. Không chặn dòng
  // tiêu đề thì cái tên "Nhà cung cấp/tên khách hàng" thành một Supplier trong D1.
  assert.equal(classifyPartnerKind(__testing.EXPECTED_DS_HEADER[__testing.DS.KIND]), "SUPPLIER");
  assert.equal(__testing.DS.HEADER_ROW, 2);
  assert.equal(__testing.DS.FIRST_DATA_ROW, 3, "guard phải bỏ dòng <= 2, không phải chỉ dòng 1");
});

test("collectSuppliers bỏ dòng tiêu đề (dòng 2), không phải chỉ bỏ dòng 1", () => {
  const party = [
    "    1 | [0] DANH SÁCH NCC/KHÁCH HÀNG",
    validHeaderLine(),
    "    3 | [0] KHÁCH THƯỜNG  ·  [2] KH",
    "    4 | [0] CTY NAM PHÁT  ·  [2] NCC",
  ].join("\n");
  const suppliers = collectSuppliers(party, "");
  assert.deepEqual(suppliers.map((row) => row.name), ["CTY NAM PHÁT"]);
  assert.equal(
    suppliers.some((row) => /Nhà cung cấp\/tên khách hàng/i.test(row.name)),
    false,
    "tên tiêu đề cột không được thành nhà cung cấp",
  );
});

test("nguồn thật cho đúng 3 nhà cung cấp sau khi chặn dòng tiêu đề", async () => {
  const suppliers = collectSuppliers(await readFile(PARTY_SOURCE, "utf8"), await readFile(GOODS_SOURCE, "utf8"));
  assert.deepEqual(
    suppliers.map((row) => row.name),
    ["ANH BẢO BỌ - LỘC PHÁT", "CTY NAM PHÁT", "TIẾN ĐẠT"],
  );
  // 2 từ DS-KH-NCC + 1 từ DS-HH-NHẬP. Không guard thì thành 4 vì tiêu đề lọt vào.
  assert.equal(suppliers.filter((row) => row.sources.some((s) => s.startsWith("DS-KH-NCC"))).length, 2);
  assert.equal(suppliers.filter((row) => row.sources.some((s) => s.startsWith("DS-HH-NHẬP"))).length, 1);
});

/* ───────────── Hằng số trong các script chạy thật ───────────── */

/**
 * `customer-import-core.mjs` và `import-alumdoor-supplier-master-local.mjs` chạy ngay khi nạp
 * (kết nối mạng, kiểm nhánh git), nên không `import` được vào test. Đọc bằng văn bản là cách duy
 * nhất neo được hằng số của chúng — và hằng số sai chính là thứ đã làm hỏng lượt nhập trước.
 */
function constantOf(file, name) {
  const text = read(resolve(REPO_ROOT, file), "utf8");
  const match = text.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`, "u"));
  assert.ok(match, `${file} phải khai hằng số ${name}`);
  return Number(match[1]);
}

test("EXPECTED_CANONICAL là SÀN 403, và số chống trôi nguồn là EXPECTED_PARTNER_ROWS = 448", async () => {
  const { plan } = await realPlan();
  const core = "scripts/local-runner/customer-import-core.mjs";
  const floor = constantOf(core, "EXPECTED_CANONICAL");
  const partnerRows = constantOf(core, "EXPECTED_PARTNER_ROWS");

  assert.equal(floor, 403);
  assert.equal(floor, plan.summary.customer_count, "sàn phải bằng số đo hôm nay, không phải số nhớ");
  assert.equal(partnerRows, 448);
  assert.equal(partnerRows, plan.summary.partner_count);

  /**
   * Cổng phải là `<` chứ không phải `!==`. Bằng-tuyệt-đối thì chủ xưởng điền đúng cột mà evidence
   * bảo họ điền (36 tên trong `evidence.deferred`) sẽ đẩy khách lên 404 và giết cả lượt nạp với
   * tên lỗi đọc như là nguồn bị cắt — đúng ca đã đo được với dòng 213 TIẾN ĐẠT.
   */
  const text = read(resolve(REPO_ROOT, core), "utf8");
  assert.match(text, /payload\.length\s*<\s*EXPECTED_CANONICAL/u, "phải so SÀN, không so bằng");
  assert.equal(/payload\.length\s*!==\s*EXPECTED_CANONICAL/u.test(text), false);
  assert.match(text, /plan\.summary\.partner_count\s*!==\s*EXPECTED_PARTNER_ROWS/u, "448 mới là bất biến bằng-tuyệt-đối");
});

test("chủ xưởng điền cột phân loại cho một dòng hoãn thì lượt nạp vẫn qua, không chết", async () => {
  const core = "scripts/local-runner/customer-import-core.mjs";
  const floor = constantOf(core, "EXPECTED_CANONICAL");
  const maxDeferred = constantOf(core, "MAX_DEFERRED");
  const partnerRows = constantOf(core, "EXPECTED_PARTNER_ROWS");

  /**
   * Đúng hành động mà `evidence.deferred` yêu cầu: điền `KH` cho dòng 213 TIẾN ĐẠT — một trong 36
   * tên đưa cho chủ xưởng. Bản trước ra `deferred=35` (qua trần) nhưng `customer_count=404 ≠ 403`
   * → `canonical_count_mismatch` → `ALUMDOOR_CUSTOMER_PREFLIGHT_BLOCKED` → 0 khách vào D1.
   */
  const filled = (await readFile(PARTY_SOURCE, "utf8"))
    .replace("  213 | [0] TIẾN ĐẠT  ·  [1] LÊ THUÝ  ·", "  213 | [0] TIẾN ĐẠT  ·  [1] LÊ THUÝ  ·  [2] KH  ·");
  assert.notEqual(filled, await readFile(PARTY_SOURCE, "utf8"), "phải sửa được đúng dòng 213");

  const { source } = await realPlan();
  const plan = buildPartnerPlan({ ...source, partners: parsePartnerSource(filled).partners });

  // TIẾN ĐẠT vốn đã là NCC (mua của họ); điền `KH` làm nó kiêm thêm vai khách.
  assert.equal(plan.summary.customer_count, 404, "khách tăng đúng 1");
  assert.equal(plan.summary.both_customer_and_supplier, 5, "TIẾN ĐẠT nay kiêm cả hai vai");
  assert.equal(plan.summary.deferred_count, 33, "TIẾN ĐẠT đã rời rổ hoãn từ trước, không giảm thêm");
  assert.equal(plan.summary.partner_count, partnerRows, "448 không đổi — nguồn không co không phình");
  assert.equal(plan.summary.customer_count >= floor, true, "sàn phải cho phép rổ hoãn cạn dần");
  assert.equal(plan.summary.deferred_count <= maxDeferred, true);
  const supplierOnly = plan.summary.supplier_count - plan.summary.both_customer_and_supplier;
  assert.equal(
    plan.summary.customer_count + supplierOnly + plan.summary.deferred_count + plan.summary.duplicate_count,
    partnerRows,
  );
});

test("trần hoãn chốt ở 36 để lần sau không âm thầm phình ra", async () => {
  const { plan } = await realPlan();
  const maxDeferred = constantOf("scripts/local-runner/customer-import-core.mjs", "MAX_DEFERRED");
  assert.equal(maxDeferred, 36);
  assert.equal(plan.summary.deferred_count <= maxDeferred, true);
});

test("rổ trùng tên có trần riêng: nguồn dán lặp cả khối không còn qua sạch", async () => {
  const { plan } = await realPlan();
  const maxDuplicate = constantOf("scripts/local-runner/customer-import-core.mjs", "MAX_DUPLICATE_ROWS");
  assert.equal(maxDuplicate, 7);
  assert.equal(plan.summary.duplicate_count, 7);

  /**
   * Đo thật kiểu hỏng đã lọt: nhân đôi toàn bộ khối dữ liệu. Bản trước ra `customer_count` KHÔNG
   * ĐỔI nên không blocker nào bắn. Nay cả `partner_count` lẫn `duplicate_count` đều vượt trần.
   */
  const text = await readFile(PARTY_SOURCE, "utf8");
  const doubled = duplicateEveryDataRow(text);
  const doubledPlan = buildPartnerPlan({ ...(await realPlan()).source, partners: parsePartnerSource(doubled).partners });
  assert.equal(doubledPlan.summary.partner_count, 896, "896 = 448 × 2");
  assert.equal(doubledPlan.summary.customer_count, plan.summary.customer_count, "số khách KHÔNG đổi — đúng lỗ hổng cũ");
  assert.equal(doubledPlan.summary.duplicate_count > maxDuplicate, true, "nhưng rổ trùng phải vượt trần");
});

test("trần SĐT dùng chung chốt ở 14 dòng / 7 số đo được", async () => {
  const { plan } = await realPlan();
  const maxShared = constantOf("scripts/local-runner/customer-import-core.mjs", "MAX_SHARED_PHONE_ROWS");
  assert.equal(maxShared, 14);

  // Đếm lại bằng đúng phép chuẩn hoá của `alumdoor.customer_import` (chỉ giữ chữ số, giữ dấu +).
  const key = (value) => {
    const raw = String(value ?? "").normalize("NFC").trim();
    return raw ? (raw.startsWith("+") ? "+" : "") + raw.replace(/[^0-9]/g, "") : "";
  };
  const owners = new Map();
  for (const row of plan.customers) {
    const phone = key(row.phone);
    if (!phone) continue;
    owners.set(phone, (owners.get(phone) ?? 0) + 1);
  }
  const shared = [...owners.values()].filter((count) => count > 1);
  assert.equal(shared.length, 7, "7 số điện thoại bị hai bản ghi khác nhau dùng chung");
  assert.equal(shared.reduce((total, count) => total + count, 0), maxShared, "đúng 14 dòng dính");
});

test("EXPECTED_COUNT của bộ nhập NCC là 3, không phải 22", async () => {
  const declared = constantOf("scripts/local-runner/import-alumdoor-supplier-master-local.mjs", "EXPECTED_COUNT");
  const suppliers = collectSuppliers(await readFile(PARTY_SOURCE, "utf8"), await readFile(GOODS_SOURCE, "utf8"));
  assert.equal(declared, 3);
  assert.equal(declared, suppliers.length);
});

test("cổng bốn file của adapter Customer không còn đòi bản export rỗng ruột", () => {
  const text = read(resolve(REPO_ROOT, "scripts/local-runner/customer-adapter.mjs"), "utf8");
  const gate = text.match(/for\(const f of \[([^\]]*)\]\)/u);
  assert.ok(gate, "adapter phải còn cổng danh sách file");
  assert.equal(/data\/customer-export\.xlsx/.test(gate[1]), false, "customer-export.xlsx phải bị gỡ khỏi cổng");
  assert.equal(gate[1].includes("DS-KH-NCC.md"), true, "cổng phải kiểm chính file nguồn đang đọc");
});

test("bộ nhập Customer không còn đọc bản export rỗng ruột", () => {
  const text = read(resolve(REPO_ROOT, "scripts/local-runner/customer-import-core.mjs"), "utf8");
  assert.equal(/path\.join\(repoRoot,\s*'data',\s*'customer-export\.xlsx'\)/.test(text), false);
  assert.equal(text.includes("loadPartnerSource"), true);
  assert.equal(text.includes("buildPartnerPlan"), true);
  assert.equal(text.includes("buildCustomerRecords"), true);
});
