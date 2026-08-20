/**
 * Máy kiểm cho màn Danh mục Alumdoor.
 *
 * CHẠY:
 *   node --test client/apps/runtime/src/experiences/__tests__/alumdoor-master-data-screen.test.mjs
 *
 * File đang kiểm là `.tsx`, mà repo chưa có đường chạy `node --test` cho TSX (mọi test hiện có
 * đọc `dist/` đã biên dịch, còn app runtime khai `noEmit` nên không có `dist`). Nên test tự nạp
 * bộ dịch `tsx` (đã là devDependency của `client/apps/demo`) và tự thay bốn gói giao diện bằng
 * bản giả — xem `module-stubs/resolver.mjs`.
 *
 * Không tìm thấy `tsx` thì SKIP kèm câu chỉ việc phải làm, KHÔNG pass lặng lẽ: một máy kiểm
 * xanh vì nó chẳng kiểm gì là loại hỏng khó thấy nhất.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Đi ngược lên tìm gốc repo thay vì đếm cứng số `../` — đổi vị trí file là hỏng.
 *
 * Mốc nhận dạng là "có CẢ `client/` lẫn `server/`". KHÔNG dùng `pnpm-workspace.yaml`: `client/`
 * cũng là một workspace riêng và có file đó, nên bản đầu dừng ngay ở `client/` rồi đi tìm brief
 * ở `client/server/briefs/…` — một đường dẫn không bao giờ tồn tại.
 */
function findRepoRoot(from) {
  let dir = from;
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(join(dir, "client")) && existsSync(join(dir, "server"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const REPO_ROOT = findRepoRoot(HERE);

function findTsxApi() {
  const froms = [
    join(HERE, "x.js"),
    ...(REPO_ROOT ? [
      join(REPO_ROOT, "client/apps/demo/x.js"),
      join(REPO_ROOT, "client/x.js"),
      join(REPO_ROOT, "x.js"),
    ] : []),
  ];
  for (const from of froms) {
    try { return createRequire(from).resolve("tsx/esm/api"); } catch { /* thử chỗ kế tiếp */ }
  }
  try {
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return createRequire(join(globalRoot, "x.js")).resolve("tsx/esm/api");
  } catch { /* không có tsx toàn cục */ }
  return null;
}

const tsxApiPath = findTsxApi();
const skip = tsxApiPath
  ? false
  : "Không tìm thấy `tsx` (devDependency của client/apps/demo). Chạy `pnpm install` ở gốc repo rồi thử lại.";

let screen = null;
let wrapper = null;
if (tsxApiPath) {
  /**
   * Chỉ thẳng tsconfig của app runtime. tsx tìm tsconfig theo CWD, mà gốc repo KHÔNG có
   * `tsconfig.json` — thiếu dòng này nó dịch JSX theo lối cổ (`React.createElement`) trong khi
   * file nguồn không hề import React, và test chết với "React is not defined".
   */
  process.env.TSX_TSCONFIG_PATH = join(HERE, "..", "..", "..", "tsconfig.json");
  const tsxApi = await import(pathToFileURL(tsxApiPath).href);
  tsxApi.register();
  // Đăng ký SAU tsx: Node chạy hook mới đăng ký trước, nên bản giả chặn được bốn tên gói
  // giao diện, còn phần dịch `.tsx` vẫn rơi xuống tsx qua `nextResolve`.
  register("./module-stubs/resolver.mjs", import.meta.url);
  screen = await import("../AlumdoorMasterDataScreen.tsx");
  // Bản BỌC, không phải màn: đây mới là thứ `experience-registry.tsx:10` nạp và `main-base.tsx:913`
  // dựng. Prop nào không khai ở đó thì không bao giờ tới được màn.
  wrapper = await import("../AlumdoorMasterDataWithImport.tsx");
}

const entry = (key, extra = {}) => ({ key, label: key, ...extra });
const navItem = (key) => ({ key, label: key, route: `/x/${key}` });

// ── trạng thái từng mục ────────────────────────────────────────────────────────

test("chưa đo thì nói chưa đo, không tô xanh cũng không tô đỏ", { skip }, () => {
  const status = screen.resolveEntryStatus(entry("Item"), undefined);
  assert.equal(status.state, "unknown");
  // Chip rỗng ⇒ không vẽ. Đây là điểm khác biệt duy nhất giữa "chưa ai đếm" và "đếm ra 0".
  assert.equal(status.label, "");
});

test("rỗng + là cổng chặn ⇒ chỉ đúng bước vận hành đang đứt", { skip }, () => {
  const status = screen.resolveEntryStatus(
    entry("Warehouse", { gate: { step: "nhập kho", why: "..." } }),
    { Warehouse: { total: 0 } },
  );
  assert.equal(status.state, "blocked");
  assert.equal(status.tone, "destructive");
  assert.match(status.label, /chặn nhập kho/);
});

test("rỗng nhưng không chặn ai thì không được kêu như hỏng", { skip }, () => {
  const status = screen.resolveEntryStatus(entry("Lý do huỷ"), { "Lý do huỷ": { total: 0 } });
  assert.equal(status.state, "idle");
  assert.equal(status.tone, "muted");
  // ... nhưng cũng KHÔNG được nhận là đã xét: "chưa cần" là một kết luận, mà màn chưa xét gì.
  assert.equal(/chưa cần/.test(status.label), false, `nhãn idle không được nhận đã xét: ${status.label}`);
});

test("mục rỗng chưa khai vai trò thì nhãn phải trung tính, không phán 'chưa cần'", { skip }, () => {
  // Khách hàng và Bảng giá từng ăn đúng nhãn này khi rỗng, trong khi brief khai chúng BẮT BUỘC:
  // `Sales Order.customer` required, `Quotation.customer:Link(Customer)!`,
  // `Item Price.price_list:Link(Price List)!`. Nay cả hai đã có cổng chặn.
  const groups = screen.resolveMasterGroups(allKeys(), { Customer: { total: 0 }, "Price List": { total: 0 } });
  const byKey = new Map(groups.flatMap((group) => group.items).map((item) => [item.key, item]));
  assert.equal(byKey.get("Customer").status.state, "blocked");
  assert.equal(byKey.get("Customer").definition.gate.step, "đơn hàng");
  assert.equal(byKey.get("Price List").status.state, "blocked");
  assert.equal(byKey.get("Price List").definition.gate.step, "báo giá");
});

test("có dữ liệu mà trống trường then chốt là một trạng thái RIÊNG, kèm số đo", { skip }, () => {
  const status = screen.resolveEntryStatus(
    entry("Item Price", {
      gate: { step: "báo giá", why: "..." },
      critical: { source: "Item Price", field: "area_tier", label: "bậc diện tích" },
    }),
    { "Item Price": { total: 558, filled: 0 } },
  );
  assert.equal(status.state, "partial");
  assert.equal(status.tone, "warning");
  // Con số LUÔN đi kèm tên trường. Số trần cạnh một cái tên là đúng cái bẫy đã phải gỡ một lần.
  assert.match(status.label, /bậc diện tích 0\/558/);
});

test("trường then chốt nằm ở DocType khác vẫn đo đúng chỗ", { skip }, () => {
  const status = screen.resolveEntryStatus(
    entry("Bill of Materials", { critical: { source: "BOM Template", field: "sales_mode", label: "cách bán" } }),
    { "Bill of Materials": { total: 338 }, "BOM Template": { total: 349, filled: 0 } },
  );
  assert.equal(status.state, "partial");
  assert.match(status.label, /cách bán 0\/349/);
});

test("nguồn của trường then chốt RỖNG HẲN là ca tệ nhất, không được ra xanh", { skip }, () => {
  const supplier = entry("Supplier", {
    gate: { step: "mua vật tư", why: "..." },
    critical: { source: "Supplier Item", field: "last_purchase_rate", label: "giá nhập gần nhất" },
  });
  const rong = screen.resolveEntryStatus(supplier, { Supplier: { total: 41 }, "Supplier Item": { total: 0, filled: 0 } });
  const nhehon = screen.resolveEntryStatus(supplier, { Supplier: { total: 41 }, "Supplier Item": { total: 10, filled: 0 } });

  // Bản trước đảo ngược đúng cặp này: bảng nguồn 0 bản ghi ra "Đủ dùng · 41 bản ghi" (xanh), còn
  // 0/10 — nhẹ hơn hẳn — mới ra vàng. Mức nghiêm trọng phải đơn điệu theo dữ liệu.
  assert.equal(rong.state, "blocked");
  assert.equal(rong.tone, "destructive");
  assert.match(rong.label, /giá nhập gần nhất/);
  assert.equal(nhehon.state, "partial");
});

test("nguồn rỗng mà mục không canh bước nào thì kêu vàng, không kêu đỏ", { skip }, () => {
  const status = screen.resolveEntryStatus(
    entry("Bill of Materials", { critical: { source: "BOM Template", field: "sales_mode", label: "cách bán" } }),
    { "Bill of Materials": { total: 338 }, "BOM Template": { total: 0 } },
  );
  assert.equal(status.state, "partial");
  assert.equal(status.tone, "warning");
});

test("trường chỉ bắt buộc với MỘT PHẦN bản ghi thì `total` không được làm mẫu số", { skip }, () => {
  // `Item.uom_conversions` khai `depends_on` trong brief: mặt hàng mua = tồn = bán thì form ẩn
  // hẳn bảng con. Lấy 566 làm mẫu số là đòi một con số không đạt tới được — cảnh báo không tắt
  // được thì vài tuần sau không ai nhìn nữa.
  const item = entry("Item", {
    critical: { source: "Item", field: "uom_conversions", label: "hệ số quy đổi", conditional: true },
  });
  const chuaDoMauSo = screen.resolveEntryStatus(item, { Item: { total: 566, filled: 20 } });
  assert.equal(chuaDoMauSo.state, "ready");
  assert.equal(chuaDoMauSo.unmeasuredField, "hệ số quy đổi", "thiếu mẫu số cũng là chưa đo, không được kêu 20/566");

  // Đo được mẫu số thật thì mới kết luận — và điền đủ phần bắt buộc là hết kêu.
  const conThieu = screen.resolveEntryStatus(item, { Item: { total: 566, filled: 20, applicable: 59 } });
  assert.equal(conThieu.state, "partial");
  assert.match(conThieu.label, /hệ số quy đổi 20\/59/);

  const xong = screen.resolveEntryStatus(item, { Item: { total: 566, filled: 59, applicable: 59 } });
  assert.equal(xong.state, "ready");
  assert.equal(xong.unmeasuredField, undefined);
});

test("điền đủ trường then chốt thì mới là đủ dùng", { skip }, () => {
  const status = screen.resolveEntryStatus(
    entry("Item Price", { critical: { source: "Item Price", field: "area_tier", label: "bậc diện tích" } }),
    { "Item Price": { total: 558, filled: 558 } },
  );
  assert.equal(status.state, "ready");
  assert.equal(status.unmeasuredField, undefined);
  assert.match(status.label, /558 bản ghi/);
});

test("`filled` vắng mặt KHÁC `filled = 0` — đủ dòng nhưng phải nói là chưa đo trường", { skip }, () => {
  const status = screen.resolveEntryStatus(
    entry("Item", { critical: { source: "Item", field: "uom_conversions", label: "hệ số quy đổi" } }),
    { Item: { total: 566 } },
  );
  assert.equal(status.state, "ready");
  assert.equal(status.unmeasuredField, "hệ số quy đổi");
});

test("số bản ghi hiện theo cách viết Việt Nam", { skip }, () => {
  const status = screen.resolveEntryStatus(entry("Phường Xã"), { "Phường Xã": { total: 3321 } });
  assert.match(status.label, new RegExp(`${(3321).toLocaleString("vi-VN").replace(".", "\\.")} bản ghi`));
});

// ── gom nhóm ───────────────────────────────────────────────────────────────────

test("thứ tự nhóm là thứ tự PHẢI KHAI, không đảo theo chỗ đang chặn", { skip }, () => {
  const items = screen.MASTER_DATA_DECLARED_KEYS.map(navItem);
  // Kho rỗng và đang chặn; nếu màn xếp lại theo mức nghiêm trọng thì `warehouses` phải nhảy lên đầu.
  const groups = screen.resolveMasterGroups(items, { Warehouse: { total: 0 } });
  assert.deepEqual(
    groups.map((group) => group.id),
    ["materials", "warehouses", "selling", "sales-configuration", "purchasing", "addresses", "operations", "finance"],
  );
  assert.deepEqual(groups.map((group) => group.step), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("nhóm bị quyền chặn hết thì biến mất và số bước vẫn liền mạch", { skip }, () => {
  const groups = screen.resolveMasterGroups([navItem("Warehouse"), navItem("Customer")]);
  assert.deepEqual(groups.map((group) => group.id), ["warehouses", "selling"]);
  assert.deepEqual(groups.map((group) => group.step), [1, 2]);
});

test("mục không có trong danh sách trắng thì bỏ, không dựng route đoán", { skip }, () => {
  const groups = screen.resolveMasterGroups([navItem("Warehouse"), navItem("Một DocType Lạ")]);
  const keys = groups.flatMap((group) => group.items.map((item) => item.key));
  assert.deepEqual(keys, ["Warehouse"]);
});

test("nhãn nhóm đếm CỔNG ĐANG CHẶN, và chỉ đếm khi đã đo", { skip }, () => {
  const items = screen.MASTER_DATA_DECLARED_KEYS.map(navItem);
  const chuaDo = screen.resolveMasterGroups(items);
  assert.equal(chuaDo.every((group) => group.blockedCount === 0 && group.partialCount === 0), true);

  const daDo = screen.resolveMasterGroups(items, {
    Warehouse: { total: 0 },
    "Item Price": { total: 558, filled: 0 },
    "Địa chỉ giao lắp": { total: 0 },
  });
  const byId = new Map(daDo.map((group) => [group.id, group]));
  assert.equal(byId.get("warehouses").blockedCount, 1);
  assert.equal(byId.get("addresses").blockedCount, 1);
  assert.equal(byId.get("selling").partialCount, 1);
  assert.equal(byId.get("selling").blockedCount, 0);
});

// ── chuỗi vận hành ─────────────────────────────────────────────────────────────

test("chưa đo thì KHÔNG được kết luận chuỗi đứt ở đâu", { skip }, () => {
  const groups = screen.resolveMasterGroups(screen.MASTER_DATA_DECLARED_KEYS.map(navItem));
  const summary = screen.summarizeChain(groups, undefined);
  assert.equal(summary.measured, false);
  assert.deepEqual(summary.brokenSteps, []);
});

test("bước đứt xếp theo thứ tự chuỗi và không lặp", { skip }, () => {
  const items = screen.MASTER_DATA_DECLARED_KEYS.map(navItem);
  const readiness = {
    Warehouse: { total: 0 },                                  // chặn `nhập kho`
    "Item Price": { total: 558, filled: 0 },                  // chặn `báo giá`
    Supplier: { total: 0 },                                   // chặn `mua vật tư`
    // `applicable` là mẫu số THẬT của `uom_conversions` (số mặt hàng có ĐVT mua/bán khác ĐVT
    // tồn). 59 ở đây là số dựng cho máy kiểm, không phải số đo — thiếu nó thì mục ra "chưa đo"
    // chứ màn KHÔNG mượn 566 làm mẫu số.
    Item: { total: 566, filled: 20, applicable: 59 },          // cũng chặn `mua vật tư`
  };
  const summary = screen.summarizeChain(screen.resolveMasterGroups(items, readiness), readiness);
  assert.equal(summary.measured, true);
  // `mua vật tư` có hai mục cùng chặn nhưng chỉ được kể một lần; thứ tự theo chuỗi, không theo
  // thứ tự phát hiện.
  assert.deepEqual(summary.brokenSteps, ["báo giá", "mua vật tư", "nhập kho"]);
  assert.equal(summary.blocked, 2);
  assert.equal(summary.partial, 2);
});

test("ba chỗ chặn cứng phải KÊU RA khi đo bằng số thật, không chỉ có mặt trong bảng khai", { skip }, () => {
  const items = screen.MASTER_DATA_DECLARED_KEYS.map(navItem);
  /**
   * Bản trước chỉ so `gate.step` nên nó xanh mà không chứng minh gì: chạy cùng bộ số này,
   * `Supplier` ra "Đủ dùng · 41 bản ghi" MÀU XANH (vì bảng giá nhập rỗng bị coi là không có
   * vấn đề) và câu `gate.why` giải thích chỗ chặn bị ẩn luôn — `why` chỉ hiện khi blocked/partial.
   *
   * Số dùng ở đây là hiện trạng 19/08: Supplier 41 bản ghi, Supplier Item 0, Warehouse 0.
   */
  const readiness = {
    Supplier: { total: 41 },
    "Supplier Item": { total: 0, filled: 0 },
    Item: { total: 566, filled: 20, applicable: 59 },
    Warehouse: { total: 0 },
  };
  const byKey = new Map(
    screen.resolveMasterGroups(items, readiness).flatMap((group) => group.items).map((item) => [item.key, item]),
  );
  assert.equal(byKey.get("Supplier").status.state, "blocked", "giá nhập rỗng phải kêu, không được ra 'Đủ dùng · 41 bản ghi'");
  assert.equal(byKey.get("Item").status.state, "partial");   // hệ số quy đổi 20/59
  assert.equal(byKey.get("Warehouse").status.state, "blocked"); // chưa có kho ⇒ chưa có lô
  assert.deepEqual(
    [...new Set([byKey.get("Supplier"), byKey.get("Item"), byKey.get("Warehouse")].map((i) => i.definition.gate.step))],
    ["mua vật tư", "nhập kho"],
  );
});

test("`gate.why` chỉ được nói CƠ CHẾ — số đo phải chảy từ `readiness` ra chip", { skip }, () => {
  /**
   * Số nhồi cứng vào `why` đã nói dối hai lần, và cùng một kiểu: `why` chỉ được in khi mục đang
   * blocked/partial, nên câu chứa số chỉ hiện ra ở đúng trạng thái làm nó sai.
   *  · `Bill of Materials`: "106/338 hàng bán chưa có định mức" in ra cạnh chip "Rỗng" (0 bản
   *    ghi) — nó khẳng định 232 mặt hàng ĐÃ có định mức trên chính hàng nói bảng trống.
   *  · `Supplier`: "bảng đó còn 0 bản ghi" nói về `Supplier Item`, trong khi màn cầm sẵn số đo
   *    thật của bảng đó mà không đọc.
   */
  const withDigits = screen.MASTER_DATA_DECLARED_KEYS
    .flatMap((key) => {
      const found = screen.resolveMasterGroups([navItem(key)]).flatMap((group) => group.items)[0];
      const why = found?.definition.gate?.why;
      return why && /\d/.test(why) ? [`${key}: ${why}`] : [];
    });
  assert.deepEqual(withDigits, [], `số đo phải ra chip, không nhồi vào gate.why: ${withDigits.join(" | ")}`);
});

// ── hợp đồng với brief ─────────────────────────────────────────────────────────

test("brief mọc thêm mục Danh mục nào thì màn này phải khai mục đó", { skip }, () => {
  const briefPath = REPO_ROOT ? join(REPO_ROOT, "server/briefs/alumdoor-v2.json") : null;
  if (!briefPath || !existsSync(briefPath)) {
    // Bản checkout chỉ có client thì không đối chiếu được — nói ra, đừng coi là đạt.
    assert.fail(`Không đọc được brief để đối chiếu hợp đồng: ${briefPath ?? "không tìm thấy gốc repo"}`);
  }
  const brief = JSON.parse(readFileSync(briefPath, "utf8"));
  const eligible = (brief.doctypes ?? [])
    .filter((dt) => dt.group === "Danh mục" && dt.child !== true && dt.menu !== false)
    .map((dt) => dt.name);

  // Quét rỗng = đạt giả. Nếu hình dạng brief đổi (đổi tên khoá `group`/`child`) thì bộ lọc trả
  // về mảng rỗng và test vẫn xanh trong khi nó chẳng đối chiếu gì.
  assert.ok(eligible.length >= 30, `Chỉ lọc được ${eligible.length} DocType Danh mục — bộ lọc hỏng, không phải brief teo lại`);

  const declared = new Set(screen.MASTER_DATA_DECLARED_KEYS);
  const missing = eligible.filter((name) => !declared.has(name));
  assert.deepEqual(missing, [], `Thiếu khai trên màn Danh mục: ${missing.join(", ")}`);
});

test("không mục nào khai hai lần", { skip }, () => {
  const keys = screen.MASTER_DATA_DECLARED_KEYS;
  assert.equal(new Set(keys).size, keys.length);
});

// ── dựng được thật ─────────────────────────────────────────────────────────────

/**
 * Gọi ĐỆ QUY mọi component hàm trong cây trả về.
 *
 * `jsx()` chỉ dựng mô tả, không gọi component con — nên nếu chỉ gọi hàm màn hình một lần thì
 * `EntryMeta`, `MasterLink`, `GroupAlarm`, `ChainNotice` không chạy dòng nào và test "dựng được"
 * sẽ xanh kể cả khi bốn hàm đó ném lỗi.
 */
function renderDeep(node, sink, depth = 0) {
  if (depth > 40 || node === null || node === undefined || node === false || node === true) return;
  if (typeof node === "string" || typeof node === "number") {
    sink.text.push(String(node));
    return;
  }
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) renderDeep(child, sink, depth);
    return;
  }
  const { type, props } = node;
  if (typeof type === "function") {
    renderDeep(type(props ?? {}), sink, depth + 1);
    return;
  }
  if (typeof type === "string") sink.types.push(type);
  if (props?.children !== undefined) renderDeep(props.children, sink, depth + 1);
}

function renderScreen(props) {
  const sink = { types: [], text: [] };
  renderDeep(screen.AlumdoorMasterDataScreen(props), sink);
  return { ...sink, joined: sink.text.join(" ") };
}

const allKeys = () => screen.MASTER_DATA_DECLARED_KEYS.map(navItem);

test("chưa đo thì KHÔNG vẽ chip trạng thái nào — im lặng đúng hơn một chip bịa", { skip }, () => {
  const rendered = renderScreen({ items: allKeys(), onNavigate: () => {} });
  assert.ok(rendered.types.includes("Button"), "phải vẽ ra được các đường dẫn danh mục");
  assert.equal(rendered.types.filter((type) => type === "StatusBadge").length, 0);
  assert.match(rendered.joined, /Chưa có số liệu tình trạng dữ liệu/);
  // Vai trò trong chuỗi là dữ kiện thiết kế nên vẫn phải hiện dù chưa đo được gì.
  assert.match(rendered.joined, /Cổng chuỗi · nhập kho/);
});

test("đo rồi thì chip trạng thái xuất hiện đúng số mục có tin để báo", { skip }, () => {
  const rendered = renderScreen({
    items: allKeys(),
    onNavigate: () => {},
    readiness: { Warehouse: { total: 0 }, "Item Price": { total: 558, filled: 0 } },
  });
  // 2 chip mục (Kho rỗng, Đơn giá thiếu bậc diện tích) + 2 chip nhãn nhóm tương ứng.
  assert.equal(rendered.types.filter((type) => type === "StatusBadge").length, 4);
  assert.match(rendered.joined, /Chuỗi vận hành đang đứt ở/);
  assert.match(rendered.joined, /báo giá · nhập kho/);
});

const readinessDayDu = (measure = { total: 5, filled: 5, applicable: 5 }) => Object.fromEntries(
  screen.MASTER_DATA_DECLARED_KEYS.map((key) => [key, { ...measure }]),
);

test("đủ hết thì nói đủ hết — và chỉ khi không còn mục nào kêu", { skip }, () => {
  const rendered = renderScreen({ items: allKeys(), onNavigate: () => {}, readiness: readinessDayDu() });
  assert.match(rendered.joined, /Không còn mục nào chặn/);
  assert.equal(rendered.joined.includes("đang đứt"), false);
});

test("câu 'đã đủ dữ liệu nền' KHÔNG được gọi tên bước mà màn không đo", { skip }, () => {
  /**
   * `hoá đơn` và `công nợ` không có mục nào canh: `Sales Invoice.debit_to` và
   * `Payment Entry.paid_from/paid_to` đều là `Link(Account)!` bắt buộc, mà `Account` KHÔNG có
   * trong brief (DocType nền tảng — cùng loại lỗ hổng với `Batch`). Bản trước đọc thuộc lòng cả
   * tám bước trong câu all-clear; chủ xưởng đọc xong mở bán là kẹt ở đúng hai bước cuối.
   */
  const rendered = renderScreen({ items: allKeys(), onNavigate: () => {}, readiness: readinessDayDu() });
  const [ketLuan, phamVi] = rendered.joined.split("Màn này không đo");
  assert.ok(phamVi !== undefined, `phải nói ra bước không đo được: ${rendered.joined.slice(0, 220)}`);
  for (const step of ["hoá đơn", "công nợ"]) {
    assert.equal(ketLuan.includes(step), false, `câu all-clear không được nhận đã đủ dữ liệu nền cho '${step}'`);
    assert.match(phamVi, new RegExp(step));
  }

  const summary = screen.summarizeChain(screen.resolveMasterGroups(allKeys(), readinessDayDu()), readinessDayDu());
  assert.deepEqual(summary.uncoveredSteps, ["hoá đơn", "công nợ"]);
  assert.deepEqual(summary.coveredSteps, ["báo giá", "đơn hàng", "mua vật tư", "nhập kho", "sản xuất", "xuất kho"]);
});

test("readiness rỗng hoặc thiếu khoá thì KHÔNG được tuyên bố đã đủ dữ liệu nền", { skip }, () => {
  const daDu = /đã đủ dữ liệu nền/;
  // (A) map rỗng: 0/31 mục được đo mà bản trước vẫn in nguyên câu all-clear.
  const rong = renderScreen({ items: allKeys(), onNavigate: () => {}, readiness: {} });
  assert.equal(daDu.test(rong.joined), false, rong.joined.slice(0, 200));
  assert.match(rong.joined, /chưa kết luận được chuỗi đã thông/);
  assert.match(rong.joined, /0\/31 danh mục/);

  // (B) đo đúng 1/31 mục.
  const motMuc = renderScreen({ items: allKeys(), onNavigate: () => {}, readiness: { Item: { total: 566, filled: 566, applicable: 566 } } });
  assert.equal(daDu.test(motMuc.joined), false);

  // (C) đo 30/31, thiếu đúng `Warehouse` — mà kho thật đang 0 bản ghi, một trong ba chặn cứng.
  const readiness = readinessDayDu();
  delete readiness.Warehouse;
  const thieuKho = renderScreen({ items: allKeys(), onNavigate: () => {}, readiness });
  assert.equal(daDu.test(thieuKho.joined), false);
  assert.match(thieuKho.joined, /30\/31 danh mục, còn 1 danh mục chưa ai đếm/);

  const summary = screen.summarizeChain(screen.resolveMasterGroups(allKeys(), readiness), readiness);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.visible, 31);
});

test("đếm đủ 31 dòng mà không đo trường then chốt nào cũng KHÔNG phải là đã đủ", { skip }, () => {
  // Cùng lỗ hổng với readiness rỗng, chỉ sâu hơn một tầng: mọi mục ra `ready` (đủ dòng) nên
  // blocked = partial = unknown = 0, trong khi ba chip vẫn ghi "chưa đo …".
  const readiness = Object.fromEntries(screen.MASTER_DATA_DECLARED_KEYS.map((key) => [key, { total: 5 }]));
  const rendered = renderScreen({ items: allKeys(), onNavigate: () => {}, readiness });
  assert.equal(/đã đủ dữ liệu nền/.test(rendered.joined), false, rendered.joined.slice(0, 200));
  assert.match(rendered.joined, /chưa ai đo trường then chốt/);

  const summary = screen.summarizeChain(screen.resolveMasterGroups(allKeys(), readiness), readiness);
  // Item (hệ số quy đổi), Item Price (bậc diện tích), Supplier + Supplier Item (giá nhập gần nhất).
  assert.equal(summary.unmeasured, 4);
  assert.equal(summary.unknown, 0);
});

test("số đếm ở câu đầu màn phải khớp thứ nó đang đếm", { skip }, () => {
  /**
   * Năm danh mục đo được total = 0: Warehouse có cổng chặn, bốn mục còn lại thì không. Bản trước
   * in "1 danh mục rỗng" ngay bên trên năm nhãn "Rỗng" đếm được trên màn — con số hợp lý mà đếm
   * sai thứ, đúng loại bẫy chú thích trong file nói phải tránh.
   */
  const readiness = {
    Warehouse: { total: 0 },
    UOM: { total: 0 },
    "Item Group": { total: 0 },
    "Lý do huỷ": { total: 0 },
    "Nguyên nhân cửa lỗi": { total: 0 },
  };
  const rendered = renderScreen({ items: allKeys(), onNavigate: () => {}, readiness });
  const cauDau = rendered.joined.split("01 Vật tư")[0];
  assert.equal(/1 danh mục rỗng[^ ]/.test(cauDau), false, `đếm sai thứ: ${cauDau}`);
  assert.match(cauDau, /1 mục đang chặn chuỗi/);
  assert.match(cauDau, /4 danh mục rỗng chưa đặt vai trò/);

  const summary = screen.summarizeChain(screen.resolveMasterGroups(allKeys(), readiness), readiness);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.idle, 4);
});

test("không hàng nào tự mâu thuẫn với chip ngay cạnh nó", { skip }, () => {
  // BOM rỗng: câu giải thích cũ khẳng định 232 mặt hàng đã có định mức ("106/338") ngay cạnh chip
  // nói bảng còn 0 bản ghi.
  const bom = renderScreen({ items: allKeys(), onNavigate: () => {}, readiness: { "Bill of Materials": { total: 0 } } });
  assert.match(bom.joined, /Rỗng · chặn sản xuất/);
  assert.equal(bom.joined.includes("106/338"), false, "số đo cũ vẫn còn trên màn");

  // Nhà cung cấp rỗng trong khi bảng giá nhập đã có 448 dòng: bản trước in "bảng đó còn 0 bản
  // ghi" ngay trên hàng "Mã hàng theo nhà cung cấp · Đủ dùng · 448 bản ghi".
  const ncc = renderScreen({
    items: allKeys(),
    onNavigate: () => {},
    readiness: { Supplier: { total: 0 }, "Supplier Item": { total: 448, filled: 448 } },
  });
  assert.match(ncc.joined, /448 bản ghi/);
  assert.equal(ncc.joined.includes("0 bản ghi"), false, "vừa nói bảng kia 0 vừa nói 448");
});

test("bản bọc phải chuyển tiếp `readiness`, không nuốt im lặng", { skip }, () => {
  /**
   * Đường gắn là BA CHẶNG: `main-base.tsx:26` nhập tên `AlumdoorMasterDataScreen` từ
   * `experience-registry.js` → `experience-registry.tsx:10` khai tên đó là
   * `lazy(import("./experiences/AlumdoorMasterDataWithImport.js"))` → bản bọc gọi màn thật.
   * `grep -rn AlumdoorMasterDataScreen client --include=*.tsx` ra 4 file, không phải 1.
   *
   * Bản bọc chỉ chuyển tiếp `items`/`onNavigate` thì `readiness` chết ở chặng giữa: tsc strict
   * báo `TS2322: Property 'readiness' does not exist on type 'Props'`, còn nếu ép qua bằng cast
   * thì màn vẫn in "Chưa có số liệu tình trạng dữ liệu" và không ai hiểu vì sao.
   */
  const readiness = { Warehouse: { total: 0 } };
  const node = wrapper.AlumdoorMasterDataWithImport({ items: allKeys(), onNavigate: () => {}, readiness });
  assert.equal(node.type, screen.AlumdoorMasterDataScreen, "bản bọc phải dựng đúng màn thật");
  assert.deepEqual(node.props.readiness, readiness);

  // Và số đo đó phải đi hết đường: dựng sâu qua bản bọc thì chip trạng thái phải hiện ra.
  const sink = { types: [], text: [] };
  renderDeep(node, sink);
  assert.match(sink.text.join(" "), /Rỗng · chặn nhập kho/);
});

test("không quyền đọc gì cả thì ra màn rỗng, không ném lỗi", { skip }, () => {
  const rendered = renderScreen({ items: [], onNavigate: () => {} });
  assert.equal(rendered.types.includes("Button"), false);
  assert.ok(rendered.types.includes("PackageSearch"));
});
