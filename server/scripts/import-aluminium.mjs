#!/usr/bin/env node
/**
 * Nạp tồn nhôm từ file Excel của xưởng vào app.
 *
 *   FORGE_ADMIN_PASSWORD=… node scripts/import-aluminium.mjs \
 *     --file C:/Forge/data/ton-nhom.xlsx --origin https://alu.kairo.vn [--apply]
 *
 * Mặc định là CHẠY THỬ: đọc, chuẩn hoá, đối chiếu, in ra những gì SẼ ghi — và không ghi gì.
 * Nạp nhầm 1.500 dòng tồn vào một tenant đang chạy thì dọn tay mất cả buổi, nên `--apply`
 * phải gõ rõ ràng.
 *
 * BA THỨ ĐƯỢC CHUẨN HOÁ, và mỗi thứ đều là một cách số liệu bị lệch nếu bỏ qua:
 *
 *   · `tđ` và `td` là cùng một thứ gõ hai kiểu. Trong Excel chỉ là thiếu dấu; ở đây nếu để
 *     nguyên thì thành HAI kho khác nhau không bao giờ cộng lại được.
 *   · Khổ ≤ 0,25 m không phải nhôm dùng được — không cắt nổi lá nào. Để trong tồn thì mọi
 *     báo cáo "còn bao nhiêu lá" đều bị thổi lên. Nạp vào nhưng đánh dấu là phế.
 *   · Dòng `SỐ LÁ` = 0 là dòng ĐÃ HẾT, giữ lại làm lịch sử chứ không phải tồn.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { fail } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const FILE = argOf("file", "C:/Forge/data/ton-nhom.xlsx");
const ORIGIN = (argOf("origin", process.env.FORGE_ORIGIN) ?? "").replace(/\/$/, "");
const USER = argOf("admin", "admin");
const WAREHOUSE = argOf("warehouse", "Xưởng 1");
const PASSWORD = process.env.FORGE_ADMIN_PASSWORD;
const APPLY = args.includes("--apply");
if (!ORIGIN) fail("--origin is required");
if (!PASSWORD) fail("FORGE_ADMIN_PASSWORD is required");

/**
 * `xlsx` sống trong workspace client (màn báo cáo dùng nó để xuất file), không trong server.
 *
 * Nạp qua đường dẫn thay vì thêm phụ thuộc mới cho server: đây là script chạy tay một lần
 * cho một khách, không phải thứ Worker cần khi chạy. Thêm nó vào server sẽ kéo một gói vài
 * trăm KB vào một nơi không bao giờ dùng tới.
 */
const XLSX = await (async () => {
  const { readdirSync, existsSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const store = path.resolve(import.meta.dirname, "../../client/node_modules/.pnpm");
  if (!existsSync(store)) return null;
  // Nhiều bản xlsx cùng tồn tại (0.18.5 và bản tarball 0.20.3); lấy bản mới nhất theo thứ tự tên.
  for (const entry of readdirSync(store).filter((name) => name.startsWith("xlsx@")).sort().reverse()) {
    const file = path.join(store, entry, "node_modules", "xlsx", "xlsx.mjs");
    if (existsSync(file)) return import(pathToFileURL(file).href);
  }
  return null;
})().catch(() => null);
if (!XLSX) fail("không tìm thấy gói `xlsx` — nó nằm trong client/node_modules, chạy `pnpm install` ở client trước");

/** Sheet không phải mã nhôm. `RAY` rỗng nên bỏ, ray theo dõi ở nơi khác. */
const NOT_A_PROFILE = new Set(["MẪU", "LICH_SU", "LỊCH SỬ", "RAY"]);
/** Khổ nhỏ hơn ngưỡng này không cắt được lá nào — là phế, không phải tồn. */
const SCRAP_BELOW_M = 0.25;

const GENERATION = new Map([["mới", "MỚI"], ["moi", "MỚI"], ["cũ", "CŨ"], ["cu", "CŨ"], ["tđ", "TĐ"], ["td", "TĐ"]]);

const wb = XLSX.read(readFileSync(FILE), { type: "buffer" });
const lots = [];
const profiles = new Set();
const problems = [];
let scrapRows = 0;
let emptyRows = 0;

for (const sheet of wb.SheetNames) {
  const profile = sheet.trim();
  if (NOT_A_PROFILE.has(profile)) continue;
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, defval: "" });
  const head = grid.findIndex((row) => row.some((cell) => String(cell).trim().startsWith("THEO DÕI TỒN")));
  if (head < 0) { problems.push(`${profile}: không tìm thấy dòng tiêu đề`); continue; }
  const cols = grid[head].map((cell) => String(cell).trim());
  const at = (label) => cols.findIndex((c) => c.startsWith(label));
  const [cDate, cColour, cGen, cWidth, cCount, cBack, cScrap, cNote] =
    [at("NGÀY NHẬP NHÔM"), at("MÀU"), at("TÌNH TRẠNG"), at("KHỔ"), at("SỐ LÁ"), at("NGÀY NHẬP LẠI"), at("LM/PHẾ"), at("GHI CHÚ")];

  for (const row of grid.slice(head + 1)) {
    const width = Number(row[cWidth]);
    const count = Number(row[cCount]);
    if (!Number.isFinite(width) || width <= 0) continue;
    if (!Number.isFinite(count) || count <= 0) { emptyRows += 1; continue; }
    const rawGen = String(row[cGen] ?? "").trim().toLowerCase();
    const generation = GENERATION.get(rawGen);
    if (rawGen && !generation) problems.push(`${profile}: tình trạng lạ "${row[cGen]}"`);
    const scrap = width < SCRAP_BELOW_M;
    if (scrap) scrapRows += 1;
    profiles.add(profile);
    lots.push({
      profile,
      colour: String(row[cColour] ?? "").trim() || "KHÔNG RÕ",
      generation: generation ?? "MỚI",
      width_m: width,
      sheet_count: count,
      warehouse: WAREHOUSE,
      ...(excelDate(row[cDate]) ? { received_on: excelDate(row[cDate]) } : {}),
      ...(excelDate(row[cBack]) ? { returned_on: excelDate(row[cBack]) } : {}),
      stock_state: "TỒN",
      ...(row[cScrap] ? { scrap_note: String(row[cScrap]).slice(0, 60) } : {}),
      ...(scrap ? { note: `Khổ ${width} m — dưới ${SCRAP_BELOW_M} m, coi là phế` } : {}),
      ...(!scrap && row[cNote] ? { note: String(row[cNote]).slice(0, 200) } : {}),
    });
  }
}

/** Excel lưu ngày là số ngày kể từ 1899-12-30. Chuỗi rỗng/không phải số thì bỏ, không đoán. */
function excelDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20000 || serial > 60000) return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
}

const sheets = lots.reduce((sum, lot) => sum + lot.sheet_count, 0);
console.log(`file      ${FILE}`);
console.log(`mã nhôm   ${profiles.size}`);
console.log(`lô tồn    ${lots.length}`);
console.log(`tổng lá   ${sheets.toLocaleString("vi")}`);
console.log(`  · dòng khổ < ${SCRAP_BELOW_M} m (đánh dấu phế): ${scrapRows}`);
console.log(`  · dòng số lá = 0 (đã hết, bỏ qua):            ${emptyRows}`);
for (const problem of problems.slice(0, 10)) console.log(`  ! ${problem}`);
if (!APPLY) {
  console.log(`\nCHẠY THỬ — chưa ghi gì. Thêm --apply để nạp thật.`);
  process.exit(0);
}

// ---- ghi lên tenant --------------------------------------------------------
let cookie = "";
let csrf = "";
async function call(method, path, payload) {
  const response = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const jar = new Map(cookie ? cookie.split("; ").map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]) : []);
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  csrf = response.headers.get("x-frappe-csrf-token") ?? csrf;
  return response;
}

const login = await call("POST", "/api/method/login", { usr: USER, pwd: PASSWORD });
if (!login.ok) fail(`login failed (${login.status})`);

// Mã nhôm phải tồn tại làm Item trước, vì lô trỏ vào nó bằng Link.
let madeItems = 0;
for (const profile of [...profiles].sort()) {
  const response = await call("POST", "/api/resource/Item", {
    item_code: profile, item_name: profile, item_group: "Nan/lá cửa", stock_uom: "m2",
  });
  if (response.ok) madeItems += 1;
}
console.log(`\nmã nhôm tạo mới: ${madeItems} / ${profiles.size}`);

/**
 * Xoá sạch trước khi nạp, khi được yêu cầu.
 *
 * `Aluminium Lot` đánh số tự động nên không có khoá tự nhiên để chống trùng: chạy lại lần
 * hai sẽ nhân đôi tồn kho, và tồn kho nhân đôi là loại sai không ai phát hiện cho tới lúc
 * đối chiếu. Nên hoặc nạp vào tenant sạch, hoặc dọn trước — không có đường thứ ba.
 */
if (args.includes("--reset")) {
  process.stdout.write("dọn lô cũ … ");
  let removed = 0;
  for (;;) {
    const page = await call("GET", `/api/resource/Aluminium%20Lot?${new URLSearchParams({ fields: JSON.stringify(["name"]), limit_page_length: "200" })}`);
    const rows = (await page.json().catch(() => ({}))).data ?? [];
    if (!rows.length) break;
    for (const row of rows) { await call("DELETE", `/api/resource/Aluminium%20Lot/${encodeURIComponent(row.name)}`); removed += 1; }
  }
  console.log(`${removed} lô`);
}

/**
 * Ghi có THỬ LẠI và có giới hạn song song.
 *
 * Lần đầu chạy tuần tự 1.257 lời gọi và đứt ở lô thứ 66 vì `ECONNRESET` — một lần rớt kết
 * nối giết cả mẻ, và để lại tenant nạp dở. Ba thay đổi: mỗi lô được thử lại, một lỗi mạng
 * không làm hỏng những lô khác, và bốn lời gọi song song để 1.257 lô không mất bốn phút.
 *
 * Song song ĐÚNG BỐN, không nhiều hơn: đây là ghi vào D1 của khách đang chạy, không phải
 * một bài đo tốc độ.
 */
async function writeLot(lot, attempt = 1) {
  try {
    const response = await call("POST", "/api/resource/Aluminium%20Lot", lot);
    if (response.ok) return { ok: true };
    const body = await response.text();
    return { ok: false, reason: (JSON.parse(body || "{}").message ?? `http ${response.status}`).slice(0, 90) };
  } catch (error) {
    if (attempt >= 4) return { ok: false, reason: `mạng: ${String(error.message).slice(0, 60)}` };
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    return writeLot(lot, attempt + 1);
  }
}

let written = 0;
let refused = 0;
const reasons = new Map();
const queue = [...lots];
const workers = Array.from({ length: 4 }, async () => {
  for (;;) {
    const lot = queue.pop();
    if (!lot) return;
    const result = await writeLot(lot);
    if (result.ok) {
      written += 1;
      if (written % 100 === 0) process.stdout.write(`  … ${written}/${lots.length}
`);
    } else {
      refused += 1;
      reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1);
    }
  }
});
await Promise.all(workers);

console.log(`lô đã ghi: ${written} / ${lots.length}`);
if (refused) {
  console.log(`lô bị từ chối: ${refused}`);
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`  ${String(count).padStart(5)} × ${reason}`);
}
process.exit(refused ? 1 : 0);
