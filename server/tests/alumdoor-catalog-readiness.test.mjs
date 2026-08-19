/**
 * Máy kiểm cho `alumdoor.catalog.readiness` — số đo tình trạng danh mục.
 *
 * CHẠY: cd server && node --test tests/alumdoor-catalog-readiness.test.mjs
 *
 * Ba nhóm câu hỏi, và nhóm thứ ba là nhóm đắt nhất nếu sai:
 *   1. HỢP ĐỒNG — đo đủ mọi DocType nhóm "Danh mục" của brief, không thừa không thiếu.
 *   2. ĐỌC-CHỈ — không một lệnh ghi nào rời khỏi method này.
 *   3. PHÂN BIỆT "CHƯA ĐO" VỚI "BẰNG 0" — hai thứ này trông giống nhau trên một `Record` nếu
 *      code cẩu thả, mà trên màn chúng là hai kết luận ngược nhau (im lặng ↔ chặn cả chuỗi).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CATALOG_DOCTYPES,
  RAW_TOTAL_NOTE,
  catalogReadiness,
  readCatalogReadiness,
} from "../dist/apps-src/alumdoor-worker/src/catalog-readiness.js";

const BRIEF = JSON.parse(readFileSync(fileURLToPath(new URL("../briefs/alumdoor-v2.json", import.meta.url)), "utf8"));

/** Tên trường then chốt và số bản ghi mẫu — giữ nhỏ để đọc được, giữ thật để không đo giả. */
const SAMPLE = {
  // Ba mặt hàng: một CẦN hệ số và ĐÃ có, một CẦN mà THIẾU, một không cần (mua = tồn).
  Item: [
    { name: "RAY-U100", stock_uom: "Mét", default_purchase_uom: "Cây", is_purchase_item: 1 },
    { name: "RAY-U75", stock_uom: "Mét", default_purchase_uom: "Cây", is_purchase_item: 1 },
    { name: "OC-KHOA", stock_uom: "Cái", default_purchase_uom: "Cái", is_purchase_item: 1 },
    { name: "CU-NGHI", stock_uom: "Mét", default_purchase_uom: "Cây", is_purchase_item: 1, disabled: 1 },
  ],
  "BOM Template": [
    { name: "BT-1", sales_mode: "Trọn bộ" },
    { name: "BT-2", sales_mode: "" },
    { name: "BT-3" },
  ],
  "Supplier Item": [
    { name: "SI-1", last_purchase_rate: 125000 },
    { name: "SI-2", last_purchase_rate: 0 },
  ],
};

const CONVERSIONS = {
  "RAY-U100": [{ uom: "Cây", conversion_factor: 5.85 }],
  "RAY-U75": [],
};

/**
 * Nền tảng giả: đếm, liệt kê, đọc hồ sơ — và GHI LẠI mọi lời gọi để test soi được đường đi.
 *
 * `refuseFilterOn` mô phỏng đúng cái nền tảng thật làm với 12/32 danh mục: từ chối lọc trên
 * trường không đánh `in_list_view`/`in_standard_filter`. Không có nó thì test chạy trên một
 * thế giới dễ hơn thế giới thật, và nhánh `null` — nhánh CHẠY THẬT — không bao giờ được kiểm.
 */
function platform(options = {}) {
  const counts = options.counts ?? {};
  const rows = options.rows ?? {};
  const refuseFilterOn = new Set(options.refuseFilterOn ?? []);
  const observed = [];

  const call = async (path, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    observed.push({ path, method, body: init.body ? JSON.parse(String(init.body)) : null });

    if (path === "method/frappe.client.get_count") {
      const body = JSON.parse(String(init.body ?? "{}"));
      const filters = body.filters ?? [];
      for (const filter of filters) {
        if (refuseFilterOn.has(filter[0])) {
          return Response.json({ message: `Filter field is not allowed: ${filter[0]}` }, { status: 417 });
        }
      }
      const table = counts[body.doctype];
      if (table === undefined) return Response.json({ message: `Unsupported doctype: ${body.doctype}` }, { status: 417 });
      const key = filters.length ? `${filters[0][0]}${filters[0][1]}${filters[0][2]}` : "*";
      const value = typeof table === "number" ? (key === "*" ? table : 0) : table[key];
      if (value === undefined) return Response.json({ message: "no such count" }, { status: 417 });
      return Response.json({ message: value });
    }

    const list = /^resource\/([^/?]+)\?(.*)$/.exec(path);
    if (list) {
      const doctype = decodeURIComponent(list[1]);
      const query = new URLSearchParams(list[2]);
      const start = Number(query.get("limit_start") ?? 0);
      const length = Number(query.get("limit_page_length") ?? 100);
      const all = rows[doctype];
      if (all === undefined) return Response.json({ message: `Unsupported doctype: ${doctype}` }, { status: 417 });
      return Response.json({ data: all.slice(start, start + length) });
    }

    const doc = /^resource\/Item\/(.+)$/.exec(path);
    if (doc) {
      const name = decodeURIComponent(doc[1]);
      return Response.json({ data: { name, uom_conversions: CONVERSIONS[name] ?? [] } });
    }

    return Response.json({ message: `unexpected ${path}` }, { status: 404 });
  };
  call.via = "test";
  return { call, observed };
}

/** Bộ số đủ dùng cho mọi danh mục: đếm được hết, quét được ba bảng cần quét. */
function fullFixture(overrides = {}) {
  const counts = {};
  for (const doctype of CATALOG_DOCTYPES) counts[doctype] = { "*": 7, "disabled=1": 2 };
  counts["Item Price"] = { "*": 558, "disabled=1": 0, 'area_tier!=': 0 };
  return platform({
    counts: { ...counts, ...(overrides.counts ?? {}) },
    rows: { ...SAMPLE, ...(overrides.rows ?? {}) },
    refuseFilterOn: overrides.refuseFilterOn ?? [],
  });
}

// ── 1. hợp đồng với brief ─────────────────────────────────────────────────────

test("mọi DocType nhóm Danh mục của brief đều được đo", () => {
  const eligible = (BRIEF.doctypes ?? [])
    .filter((dt) => dt.group === "Danh mục" && dt.child !== true && dt.menu !== false)
    .map((dt) => dt.name);
  // Quét rỗng = đạt giả: đổi tên khoá `group` trong brief thì bộ lọc ra mảng rỗng và test vẫn
  // xanh trong khi nó chẳng đối chiếu gì.
  assert.ok(eligible.length >= 30, `Chỉ lọc được ${eligible.length} DocType Danh mục — bộ lọc hỏng`);
  const measured = new Set(CATALOG_DOCTYPES);
  assert.deepEqual(eligible.filter((name) => !measured.has(name)), [], "Có DocType Danh mục chưa được đo");
});

test("hai danh mục ngoài menu vẫn phải đo vì màn đọc qua critical.source", () => {
  // `Supplier Item` khai `menu:false`, `BOM Template` thuộc nhóm Sản xuất — cả hai không lên
  // màn Danh mục, nhưng thiếu số của chúng thì hai cổng chặn cứng không bao giờ đỏ được.
  for (const doctype of ["Supplier Item", "BOM Template"]) {
    assert.ok(CATALOG_DOCTYPES.includes(doctype), `${doctype} phải nằm trong danh sách đo`);
  }
});

test("không danh mục nào khai hai lần", () => {
  assert.equal(new Set(CATALOG_DOCTYPES).size, CATALOG_DOCTYPES.length);
});

// ── 1b. hợp đồng với MÀN, đọc thẳng mã nguồn client ───────────────────────────
//
// Hợp đồng thật không phải giữa worker và brief, mà giữa worker và cái màn ĐỌC số này. Brief
// đúng mà shape lệch một trường thì màn vẫn in "chưa đo" trên một bản đồ đã đo xong — và không
// máy kiểm nào ở hai phía bắt được, vì mỗi phía chỉ nhìn nửa của mình.

const CLIENT_ROOT = new URL("../../client/apps/runtime/src/", import.meta.url);

function clientSource(relative) {
  const url = new URL(relative, CLIENT_ROOT);
  // Không SKIP khi thiếu: một máy kiểm xanh vì nó chẳng kiểm gì là loại hỏng khó thấy nhất.
  try {
    return readFileSync(url, "utf8");
  } catch {
    assert.fail(`Không đọc được mã nguồn client để đối chiếu hợp đồng: ${url.pathname}`);
  }
}

test("shape trả về khớp đúng AlumdoorMasterMeasure của màn", () => {
  const source = clientSource("experiences/AlumdoorMasterDataScreen.tsx");
  const block = /export interface AlumdoorMasterMeasure \{([\s\S]*?)\n\}/.exec(source);
  assert.ok(block, "màn không còn khai AlumdoorMasterMeasure — hợp đồng đã đổi chỗ");
  const declared = [...block[1].matchAll(/^\s{2}([a-z_]+)(\??):/gm)].map((m) => `${m[1]}${m[2]}`);
  // Thêm/bớt trường bên màn mà worker không đổi theo thì test này đỏ — đúng lúc cần đỏ.
  assert.deepEqual(declared, ["total", "filled?", "applicable?"]);
});

test("mọi mục màn khai đều được worker đo", () => {
  const source = clientSource("experiences/AlumdoorMasterDataScreen.tsx");
  const start = source.indexOf("const MASTER_GROUPS");
  const end = source.indexOf("\n];", start);
  assert.ok(start >= 0 && end > start, "không tìm được bảng khai MASTER_GROUPS");
  // KHÔNG neo vào đầu dòng: màn viết mục ngắn gọn trên một dòng (`{ key: "UOM", label: … }`)
  // và mục dài thì `key:` xuống dòng riêng. Neo `^` chỉ bắt được 10/31 — và một bộ tách bắt
  // thiếu sẽ báo ĐẠT cho đúng những mục nó không đọc tới.
  const keys = [...source.slice(start, end).matchAll(/\bkey:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 31, `chỉ đọc được ${keys.length} mục — bộ tách hỏng, không phải màn teo lại`);
  const measured = new Set(CATALOG_DOCTYPES);
  assert.deepEqual(keys.filter((key) => !measured.has(key)), [], "màn khai mục mà worker không đo");
});

test("nơi gắn đã nối dây: gọi method rồi truyền xuống màn", () => {
  const source = clientSource("main-base.tsx");
  // Ba mảnh, thiếu mảnh nào là mắt xích vẫn hở: gọi method, giữ số, truyền prop.
  assert.match(source, /alumdoor\.catalog\.readiness/, "chưa gọi method đo");
  assert.match(source, /readiness=\{readiness\}/, "gọi rồi nhưng không truyền xuống màn");
  // Không được dựng `{}` thay cho "chưa đo": `readiness={}` cho ra blocked=0/partial=0 và màn
  // tuyên bố cả chuỗi đã thông sau 0 phép đo.
  assert.equal(/useState<AlumdoorMasterReadiness>\(\s*\{\s*\}\s*\)/.test(source), false, "khởi tạo bằng map rỗng là dựng số giả");
});

test("danh sách đếm-thô chỉ gồm danh mục THẬT SỰ không trừ được disabled", () => {
  // Neo vào brief: mỗi tên trong `RAW_TOTAL_NOTE` phải (a) có trường `disabled`, và (b) không
  // đánh `in_list_view`/`in_standard_filter` cho nó — tức nền tảng thật sự từ chối lọc.
  // Ghi tên vào đây mà brief đã sửa xong thì lời cảnh báo hoá ra nói dối.
  for (const name of RAW_TOTAL_NOTE) {
    const dt = (BRIEF.doctypes ?? []).find((entry) => entry.name === name);
    assert.ok(dt, `${name} không có trong brief`);
    const field = (dt.fields ?? []).find((f) => (typeof f === "string" ? f.startsWith("disabled:") : f.fieldname === "disabled"));
    assert.ok(field, `${name} không có trường disabled — không thuộc diện đếm thô`);
    const filterable = typeof field === "object" && Boolean(field.in_list_view || field.in_standard_filter);
    assert.equal(filterable, false, `${name} đã lọc được disabled — phải bỏ khỏi RAW_TOTAL_NOTE`);
  }
});

// ── 2. đọc-chỉ ────────────────────────────────────────────────────────────────

test("không một lệnh ghi nào rời khỏi method này", async () => {
  const f = fullFixture();
  await readCatalogReadiness(f.call, () => 0);
  assert.ok(f.observed.length > 0, "không gọi gì cả — fixture hỏng");
  for (const entry of f.observed) {
    assert.ok(["GET", "POST"].includes(entry.method), `phương thức lạ: ${entry.method}`);
    if (entry.method === "POST") {
      // POST duy nhất được phép là `get_count` — đọc. Mọi POST khác là một lệnh ghi.
      assert.equal(entry.path, "method/frappe.client.get_count", `POST ghi dữ liệu: ${entry.path}`);
    }
  }
});

test("đếm bằng COUNT chứ không liệt kê từng dòng", async () => {
  const f = fullFixture();
  await readCatalogReadiness(f.call, () => 0);
  // Trần trang của nền tảng là 100 (MAX_LIMIT), nên liệt kê để đếm Phường Xã 3.321 bản ghi tốn
  // 34 lượt cho MỘT danh mục. Chỉ ba danh mục được phép quét trang, và phải đúng ba cái đó.
  const listed = new Set(
    f.observed
      .filter((entry) => entry.method === "GET" && entry.path.includes("?"))
      .map((entry) => decodeURIComponent(/^resource\/([^/?]+)\?/.exec(entry.path)[1])),
  );
  assert.deepEqual([...listed].sort(), ["BOM Template", "Item", "Supplier Item"]);
});

// ── 3. chưa đo ≠ bằng 0 ───────────────────────────────────────────────────────

test("danh mục đếm không được thì KHÔNG có khoá — không dựng số 0", async () => {
  // Mốc so sánh: cùng bộ số nhưng CÓ Warehouse thì khoá phải xuất hiện. Thiếu mốc này thì test
  // dưới đây xanh cả khi hàm trả về bản đồ rỗng.
  const readiness = await readCatalogReadiness(fullFixture().call, () => 0);
  assert.ok(Object.hasOwn(readiness, "Warehouse"));

  // `Warehouse` bị bỏ khỏi bảng đếm ⇒ nền tảng từ chối ⇒ không đo được.
  const broken = platform({
    counts: Object.fromEntries(CATALOG_DOCTYPES.filter((d) => d !== "Warehouse").map((d) => [d, { "*": 3, "disabled=1": 0 }])),
    rows: SAMPLE,
  });
  const partial = await readCatalogReadiness(broken.call, () => 0);
  assert.equal(Object.hasOwn(partial, "Warehouse"), false, "Warehouse đếm hỏng mà vẫn có khoá — màn sẽ đọc thành 'rỗng, chặn nhập kho'");
  assert.equal(partial["UOM"].total, 3, "các danh mục còn lại vẫn phải đo được");
});

test("total trừ bản ghi disabled khi nền tảng cho lọc", async () => {
  const f = fullFixture();
  const readiness = await readCatalogReadiness(f.call, () => 0);
  assert.equal(readiness["UOM"].total, 5, "7 bản ghi − 2 đã nghỉ = 5");
});

test("nền tảng từ chối lọc disabled thì total là đếm thô, KHÔNG phải đo hỏng", async () => {
  const f = fullFixture({ refuseFilterOn: ["disabled"] });
  const readiness = await readCatalogReadiness(f.call, () => 0);
  // Đếm tất vẫn chạy ⇒ mục vẫn có số. Bỏ hẳn khoá ở đây là làm 11 danh mục quan trọng nhất
  // (Khách hàng, Kho, Nhà cung cấp, Bảng giá…) thành "chưa đo" vì một cờ metadata.
  assert.equal(readiness["Customer"].total, 7);
});

// ── trường then chốt 1: Item Price.area_tier ──────────────────────────────────

test("area_tier đếm được và KHÔNG kèm applicable", async () => {
  const f = fullFixture({ counts: { "Item Price": { "*": 558, "disabled=1": 0, 'area_tier!=': 12 } } });
  const readiness = await readCatalogReadiness(f.call, () => 0);
  assert.equal(readiness["Item Price"].total, 558);
  assert.equal(readiness["Item Price"].filled, 12);
  // `area_tier` bắt buộc với MỌI dòng giá (Link required, default MOI-DIEN-TICH) nên mẫu số
  // đúng là `total`. Khai `applicable` ở đây là dựng một mẫu số thứ hai không có thật.
  assert.equal(readiness["Item Price"].applicable, undefined);
});

test("đếm area_tier hỏng thì filled vắng mặt, total vẫn còn", async () => {
  const f = fullFixture({ refuseFilterOn: ["area_tier"] });
  const readiness = await readCatalogReadiness(f.call, () => 0);
  assert.equal(readiness["Item Price"].total, 558);
  assert.equal(readiness["Item Price"].filled, undefined, "chưa đo trường then chốt thì phải nói chưa đo");
});

// ── trường then chốt 2: BOM Template.sales_mode ───────────────────────────────

test("sales_mode: chuỗi rỗng và trường vắng mặt đều là CHƯA điền", async () => {
  const f = fullFixture();
  const readiness = await readCatalogReadiness(f.call, () => 0);
  assert.equal(readiness["BOM Template"].total, 3);
  assert.equal(readiness["BOM Template"].filled, 1, "chỉ BT-1 có sales_mode");
});

// ── trường then chốt 3: Supplier Item.last_purchase_rate ──────────────────────

test("giá nhập bằng 0 không tính là đã điền", async () => {
  const f = fullFixture();
  const readiness = await readCatalogReadiness(f.call, () => 0);
  assert.equal(readiness["Supplier Item"].total, 2);
  assert.equal(readiness["Supplier Item"].filled, 1, "SI-2 giá 0 đồng không phải giá nhập");
});

// ── trường then chốt 4: Item.uom_conversions ──────────────────────────────────

test("applicable là số mặt hàng THỰC SỰ cần hệ số, không phải tổng mặt hàng", async () => {
  const f = fullFixture();
  const readiness = await readCatalogReadiness(f.call, () => 0);
  assert.equal(readiness["Item"].total, 3, "4 mặt hàng − 1 đã nghỉ");
  // Mẫu số KHÔNG phải 3: OC-KHOA mua = tồn nên form ẩn hẳn bảng con, và CU-NGHI đã cho nghỉ.
  assert.equal(readiness["Item"].applicable, 2);
  assert.equal(readiness["Item"].filled, 1, "chỉ RAY-U100 có hệ số cho đúng ĐVT mua");
});

test("hệ số khai sai ĐVT hoặc bằng 0 không tính là đã điền", async () => {
  const rows = { Item: [
    { name: "A", stock_uom: "Mét", default_purchase_uom: "Cây", is_purchase_item: 1 },
    { name: "B", stock_uom: "Mét", default_purchase_uom: "Cây", is_purchase_item: 1 },
  ] };
  const f = platform({
    counts: Object.fromEntries(CATALOG_DOCTYPES.map((d) => [d, { "*": 1, "disabled=1": 0 }])),
    rows: { ...SAMPLE, ...rows },
  });
  // Ghi đè bảng hệ số: A khai đúng ĐVT nhưng factor 0, B khai factor tốt nhưng sai ĐVT.
  CONVERSIONS.A = [{ uom: "Cây", conversion_factor: 0 }];
  CONVERSIONS.B = [{ uom: "Kg", conversion_factor: 2.4 }];
  try {
    const readiness = await readCatalogReadiness(f.call, () => 0);
    assert.equal(readiness["Item"].applicable, 2);
    assert.equal(readiness["Item"].filled, 0, "cả hai đều làm phiếu nhập đọc về hệ số 1");
  } finally {
    delete CONVERSIONS.A;
    delete CONVERSIONS.B;
  }
});

test("quá hạn giờ khi dò bảng con thì BỎ filled, không trả số đo dở", async () => {
  const f = fullFixture();
  // Đồng hồ nhảy vọt ngay lần đọc đầu: hết ngân sách trước khi dò xong.
  let tick = 0;
  const readiness = await readCatalogReadiness(f.call, () => (tick++ === 0 ? 0 : 999_999));
  assert.equal(readiness["Item"].filled, undefined, "đo dở phải nói chưa đo");
  assert.equal(readiness["Item"].applicable, 2, "mẫu số vẫn đo được — nó chỉ cần danh sách");
  assert.equal(readiness["Item"].total, 3);
});

// ── vỏ HTTP ───────────────────────────────────────────────────────────────────

test("thân trả về CHÍNH bản đồ số đo, không bọc thêm lớp nào", async () => {
  const f = fullFixture();
  const response = await catalogReadiness(f.call, () => 0);
  assert.equal(response.status, 200);
  const payload = await response.json();
  // Màn nhận thẳng `Record<tên DocType, {total, filled?, applicable?}>`. Bọc thêm `{rows: …}`
  // là màn đọc ra rỗng và in "chưa đo" trong khi số đã đo xong.
  assert.equal(typeof payload["UOM"].total, "number");
  for (const [key, value] of Object.entries(payload)) {
    assert.ok(CATALOG_DOCTYPES.includes(key), `khoá lạ trong kết quả: ${key}`);
    assert.deepEqual(
      Object.keys(value).filter((name) => !["total", "filled", "applicable"].includes(name)),
      [],
      `${key} có trường ngoài shape AlumdoorMasterMeasure`,
    );
  }
});

test("JSON không được mang khoá filled: null — màn phân biệt vắng mặt với 0", async () => {
  const f = fullFixture({ refuseFilterOn: ["area_tier"] });
  const response = await catalogReadiness(f.call, () => 0);
  const raw = await response.text();
  assert.equal(raw.includes("null"), false, `có null trong thân: ${raw.slice(0, 200)}`);
  assert.equal(Object.hasOwn(JSON.parse(raw)["Item Price"], "filled"), false);
});
