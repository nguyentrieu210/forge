/**
 * Quay TỰ ĐỘNG các cảnh demo cho video giới thiệu (xem kịch bản 9 cảnh).
 *
 * Mỗi cảnh là một file .webm riêng để dựng phim cắt ghép cho dễ — quay liền một mạch thì chỉ cần
 * một bước lỡ tay là phải quay lại từ đầu.
 *
 * Chạy:  KHO_PASS=... node quay-video.mjs            (quay hết)
 *        KHO_PASS=... node quay-video.mjs 5          (quay riêng cảnh 5)
 *
 * Video ra ở  <scratchpad>/video/canh-N-<ten>.webm
 */
import { chromium } from "@playwright/test";
import { mkdirSync, existsSync, rmSync } from "node:fs";

const BASE = process.env.KHO_BASE || "http://222.255.238.178/kho";
const PASS = process.env.KHO_PASS;
const OUT = process.env.VIDEO_OUT
  || "C:/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin/078a4bb0-9ba7-48c9-aa06-0e98597c8160/scratchpad/video";
if (!PASS) { console.error("Thiếu KHO_PASS"); process.exit(2); }

// 1600×1000: đủ rộng để bảng không vỡ cột, mà giao diện vẫn to — người xem trên điện thoại đọc
// được chữ sau khi cắt về khung dọc 4:5.
const KHUNG = { width: 1600, height: 1000 };
const STATE = `${OUT}/dang-nhap.json`;

mkdirSync(OUT, { recursive: true });

const chi = process.argv[2] ? Number(process.argv[2]) : null;
const browser = await chromium.launch({ args: ["--hide-scrollbars", "--disable-blink-features=AutomationControlled"] });

/** Nghỉ — quay demo phải CHẬM hơn thao tác thật, người xem cần kịp đọc màn hình. */
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

/** Rê chuột thành đường mượt tới giữa phần tử rồi mới bấm — nhảy cóc nhìn rất máy móc. */
async function reToi(page, locator) {
  const el = locator.first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox();
  if (!b) return null;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 });
  await nghi(350);
  return b;
}
async function bam(page, locator, cho = 900) {
  const b = await reToi(page, locator);
  if (!b) return false;
  await page.mouse.down(); await nghi(70); await page.mouse.up();
  await nghi(cho);
  return true;
}
async function go(page, locator, chu, doTre = 90) {
  await reToi(page, locator);
  await locator.first().click();
  await locator.first().type(chu, { delay: doTre });
  await nghi(500);
}

// ── đăng nhập một lần, dùng lại cho mọi cảnh ────────────────────────────────
if (!existsSync(STATE)) {
  const ctx = await browser.newContext({ viewport: KHUNG });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await nghi(2000);
  await p.evaluate(() => localStorage.setItem("mf-setup-skip", "1"));
  await p.reload({ waitUntil: "domcontentloaded" });
  await nghi(2000);
  if (await p.locator('input[type="password"]').count()) {
    await p.locator("input").first().fill("Administrator");
    await p.locator('input[type="password"]').fill(PASS);
    await p.locator('button[type="submit"], button:has-text("Đăng nhập")').first().click();
    await nghi(5000);
  }
  await ctx.storageState({ path: STATE });
  await ctx.close();
  console.log("đã đăng nhập, lưu phiên");
}

/** Dựng một cảnh: mở context có ghi hình, chạy kịch bản, đóng lại rồi đổi tên file. */
async function canh(so, ten, kichBan) {
  if (chi && chi !== so) return;
  const tmp = `${OUT}/.tmp-${so}`;
  rmSync(tmp, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: KHUNG,
    storageState: STATE,
    recordVideo: { dir: tmp, size: KHUNG },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`   ⚠ lỗi JS: ${e.message.slice(0, 90)}`));
  const bd = Date.now();
  try {
    await kichBan(page);
  } catch (e) {
    console.log(`   ✗ cảnh ${so} lỗi giữa chừng: ${String(e.message).slice(0, 120)}`);
  }
  const video = page.video();
  await ctx.close(); // video chỉ được ghi ra đĩa khi context đóng
  const dich = `${OUT}/canh-${so}-${ten}.webm`;
  if (video) { await video.saveAs(dich).catch(() => {}); }
  rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ cảnh ${so} ${ten.padEnd(18)} ${((Date.now() - bd) / 1000).toFixed(0)}s → canh-${so}-${ten}.webm`);
}

/**
 * Mở một màn rồi CHỜ THẤY THỨ CẦN QUAY.
 *
 * KHÔNG dùng `networkidle`: app có polling nền nên mạng gần như không bao giờ "rảnh" — đo được có
 * lần chờ tới 25 giây, và trong 25 giây đó máy quay vẫn chạy, ghi lại toàn màn hình cũ. Cảnh 7 của
 * bản quay đầu tiên hỏng đúng vì vậy: đáng lẽ Phân quyền, hoá ra 30 giây nhìn màn Tồn kho.
 *
 * Chờ theo DẤU HIỆU NHÌN THẤY ĐƯỢC (bảng có dòng, tiêu đề hiện ra) mới đúng thứ người xem chờ.
 */
const moTrang = async (page, duong, dauHieu, choThem = 1500) => {
  await page.goto(BASE + duong, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (dauHieu) {
    await page.locator(dauHieu).first().waitFor({ state: "visible", timeout: 25000 })
      .catch(() => console.log(`   ⚠ ${duong}: không thấy "${dauHieu}" — cảnh này có thể quay hụt`));
  }
  await nghi(choThem);
};

/** Ảnh chụp mốc — để kiểm lại nội dung clip mà không phải bung từng khung hình. */
const moc = (page, ten) => page.screenshot({ path: `${OUT}/moc-${ten}.png` }).catch(() => {});

/**
 * Kéo dài cảnh cho ĐỦ DÀI hơn lời đọc.
 *
 * Người dựng phim cắt bớt thì dễ, thiếu hình thì phải quay lại. Mỗi cảnh vì vậy quay dư khoảng
 * 40% so với lời đọc. Nhưng không đứng im chờ hết giờ — khung hình bất động vài giây trông như
 * video bị treo; rê chuột chậm và cuộn nhẹ giữ cho hình "còn sống".
 */
async function keoDai(page, giay) {
  const het = Date.now() + giay * 1000;
  let x = 700;
  let xuong = true;
  while (Date.now() < het) {
    x = x === 700 ? 1100 : 700;
    await page.mouse.move(x, 380 + Math.random() * 240, { steps: 30 });
    await nghi(900);
    if (Date.now() >= het) break;
    await page.mouse.wheel(0, xuong ? 200 : -200);
    xuong = !xuong;
    await nghi(900);
  }
}

// ── Cảnh 2: Tổng quan ───────────────────────────────────────────────────────
// `/` KHÔNG phải Tổng quan — nó chuyển thẳng về Tồn kho. Tổng quan là nav kind "overview".
await canh(2, "tong-quan", async (page) => {
  await moTrang(page, "/overview/stock", "main svg, main canvas", 2500);
  const cot = page.locator("main svg .recharts-bar-rectangle, main svg rect").first();
  if (await cot.count()) { await reToi(page, cot); await nghi(1500); }
  await page.mouse.move(900, 620, { steps: 20 });
  await nghi(1500);
  await moc(page, "2-tong-quan");
  await keoDai(page, 8); // lời đọc 12s
});

// ── Cảnh 3: Nhập hàng nhanh ─────────────────────────────────────────────────
await canh(3, "nhap-nhanh", async (page) => {
  await moTrang(page, "/nhap-nhanh", "main input", 1500);
  // Ô quét phải bắt bằng PLACEHOLDER, không bắt bằng "input đầu tiên": mỗi lần thêm được một dòng
  // là bảng mọc thêm ô số lượng/đơn giá, "input đầu tiên" trỏ sang chỗ khác và các lần quét sau
  // rơi vào ô sai. Bản quay đầu chỉ vào được 1 trong 3 mặt hàng đúng vì lỗi này.
  const oQuet = page.locator('main input[placeholder*="uét"]');
  if (await oQuet.count() === 0) { console.log("   ⚠ không thấy ô quét mã"); return; }
  const soLuong = ["120", "50", "300"];
  for (const [i, ma] of ["NVL-001", "NVL-002", "VTDG-001"].entries()) {
    await oQuet.first().click();
    await oQuet.first().fill("");
    await oQuet.first().type(ma, { delay: 60 });
    await nghi(500);
    await page.keyboard.press("Enter");
    await nghi(1600);
    // Điền số lượng + đơn giá cho dòng vừa thêm. Để mặc định thì phiếu ra "Tổng tiền 0" —
    // đúng về kỹ thuật nhưng trên video bán hàng thì nhìn như phần mềm không tính được tiền.
    // Bắt bằng `input` trần, KHÔNG bằng input[type="text"]: ô không khai thuộc tính `type` vẫn là
    // ô text nhưng bộ chọn đó không khớp — lần quay trước rơi đúng bẫy này, ba dòng đều để nguyên
    // số lượng 1 và tiền 0.
    const dong = page.locator("tbody tr").nth(i);
    const oSo = dong.locator("input");
    const n = await oSo.count();
    if (n >= 2) {
      // gõ từng ký tự rồi Tab: ô là input có kiểm soát, fill() nhảy thẳng giá trị nên có nơi
      // không chạy trình định dạng số và giá trị bị trả về như cũ.
      await oSo.nth(n - 2).click();
      await oSo.nth(n - 2).press("Control+a");
      await oSo.nth(n - 2).type(soLuong[i], { delay: 90 });
      await page.keyboard.press("Tab"); await nghi(600);
      await oSo.nth(n - 1).click();
      await oSo.nth(n - 1).press("Control+a");
      await oSo.nth(n - 1).type(["18500", "52000", "12500"][i], { delay: 70 });
      await page.keyboard.press("Tab"); await nghi(900);
    }
  }
  await moc(page, "3-nhap-nhanh");
  await keoDai(page, 12); // lời đọc 28s
});

// ── Cảnh 4: Tồn kho ─────────────────────────────────────────────────────────
await canh(4, "ton-kho", async (page) => {
  await moTrang(page, "/app/Delivery Note", "tbody tr", 2000);
  await moTrang(page, "/app/Stock Entry", "tbody tr", 2000);
  // chờ ĐÚNG dòng dữ liệu, không chờ khung trang — bản quay đầu dính nguyên khung "Đang tải…"
  await moTrang(page, "/ton-kho", "tbody tr", 1500);
  const hang = page.locator("tbody tr").nth(2);
  if (await hang.count()) { await reToi(page, hang); await nghi(1500); }
  await page.mouse.move(1300, 400, { steps: 25 });
  await moc(page, "4-ton-kho");
  await keoDai(page, 12); // lời đọc 22s
});

// ── Cảnh 5: Báo cáo (cảnh quan trọng nhất) ──────────────────────────────────
await canh(5, "bao-cao", async (page) => {
  const kyRong = async () => {
    await page.locator('main input[type="date"]').first().fill("2020-01-01"); await nghi(600);
    await page.locator('main input[type="date"]').nth(1).fill("2026-12-31"); await nghi(3000);
  };
  await moTrang(page, "/bao-cao/xuat-nhap-ton", 'main input[type="date"]', 1200);
  await kyRong();
  await moc(page, "5a-xuat-nhap-ton");
  await page.mouse.move(800, 500, { steps: 20 });
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 260); await nghi(700); }
  await page.mouse.wheel(0, -1040); await nghi(1200);

  // Sổ chi tiết: PHẢI chọn mặt hàng + kho, nếu không màn chỉ hiện lời nhắc "Chọn mặt hàng và kho"
  // — bản quay đầu dính đúng màn rỗng đó, xem như mất cả đoạn.
  await moTrang(page, "/bao-cao/so-chi-tiet", "main button[role=combobox]", 1200);
  await kyRong();
  const chonO = async (viTri, nhan) => {
    const cb = page.locator("main button[role=combobox]").nth(viTri);
    if (await cb.count() === 0) return;
    await bam(page, cb, 800);
    const opt = page.locator('[role="option"]', { hasText: nhan }).first();
    if (await opt.count()) await bam(page, opt, 1500);
    else await page.keyboard.press("Escape");
  };
  await chonO(0, "NVL-001");
  await chonO(1, "Lưu trữ A VH");
  await nghi(2500);
  await moc(page, "5b-so-chi-tiet");
  const theKho = page.getByRole("button", { name: "Thẻ kho", exact: true });
  if (await theKho.count()) { await bam(page, theKho, 2200); }

  await moTrang(page, "/bao-cao/tong-hop-doi-tuong", 'main input[type="date"]', 1200);
  await kyRong();
  await moc(page, "5c-doi-tuong");
  await page.mouse.move(800, 500, { steps: 20 });
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 240); await nghi(700); }
  await nghi(2000);
});

// ── Cảnh 6: Nhập từ Excel ───────────────────────────────────────────────────
await canh(6, "nhap-excel", async (page) => {
  await moTrang(page, "/nhap-excel", "main button", 2000);
  const chon = page.locator("main button").filter({ hasText: /chọn|tải|file|Excel/i }).first();
  if (await chon.count()) { await reToi(page, chon); await nghi(1500); }
  await moc(page, "6-nhap-excel");
  await keoDai(page, 18); // lời đọc 20s
});

// ── Cảnh 7: Phân quyền + cây kho ────────────────────────────────────────────
// Vào THẲNG cây kho rồi phân quyền. Bản trước mở màn Tồn kho trước cho "mượt", nhưng đoạn lời
// đọc tương ứng chỉ dài 28 giây — cắt 28 giây đầu là hết clip mà vẫn chưa tới màn phân quyền,
// người xem nghe nói về phân quyền trong khi màn hình là bảng tồn kho.
await canh(7, "phan-quyen", async (page) => {
  await moTrang(page, "/cay-kho", "main", 2000);
  await moc(page, "7a-cay-kho");
  await keoDai(page, 8);
  await moTrang(page, "/phan-quyen", "main", 2500);
  await moc(page, "7b-phan-quyen");
  await page.mouse.move(900, 550, { steps: 20 });
  await page.mouse.wheel(0, 300); await nghi(1500);
  await keoDai(page, 20);
});

// ── Cảnh 8: Màn công nhân trên điện thoại ───────────────────────────────────
await canh(8, "dien-thoai", async (page) => {
  // KHÔNG dùng khung máy tính: cảnh này phải ra tỉ lệ điện thoại thật
  await page.setViewportSize({ width: 430, height: 932 });
  await moTrang(page, "/x/tra-ton", "input", 1800);
  const o = page.locator("input").first();
  if (await o.count()) {
    await go(page, o, "NVL-001", 110);
    await page.keyboard.press("Enter");
    await nghi(3000);
  }
  await moc(page, "8-dien-thoai");
  await nghi(2500);
  await moTrang(page, "/x/chuyen-nhanh", "main, form", 3000);
  // khung điện thoại hẹp — rê trong phạm vi 430px, ra ngoài là chuột biến mất khỏi hình
  const het = Date.now() + 10000;
  while (Date.now() < het) {
    await page.mouse.move(120 + Math.random() * 200, 300 + Math.random() * 350, { steps: 30 });
    await nghi(1100);
  }
});

// ══ Cảnh bổ sung — kéo video từ ~2 phút lên 3 phút ═════════════════════════
// Toàn tính năng đã có sẵn nhưng bản đầu bỏ qua, không phải bịa thêm cho dài.

// In tem mã vạch — chèn ngay sau đoạn nhập hàng
await canh(10, "in-tem", async (page) => {
  await moTrang(page, "/in-tem", "main", 2000);
  await moc(page, "10-in-tem");
  await keoDai(page, 16);
});

// Yêu cầu vật tư nội bộ — clip RIÊNG, vì lời đọc nói tới nó ở một đoạn khác hẳn đoạn tồn dự kiến
await canh(11, "yeu-cau-vat-tu", async (page) => {
  await moTrang(page, "/app/Material Request", "tbody tr, main", 2500);
  await moc(page, "11-yeu-cau-vat-tu");
  await keoDai(page, 18);
});

// Tồn dự kiến — hàng đã đặt mua nhưng chưa về
await canh(15, "ton-du-kien", async (page) => {
  await moTrang(page, "/bao-cao/stock-projected-qty", "main", 3000);
  await moc(page, "15-ton-du-kien");
  await keoDai(page, 14);
});

// Lô hàng, hạn sử dụng, kiểm tra chất lượng
// Danh sách Kiểm tra chất lượng / Tồn theo lô trên site demo đang RỖNG — quay màn "Chưa có dữ
// liệu" rồi thuyết minh "lập phiếu kiểm ngay trên phần mềm" thì người xem thấy ngay là tính năng
// chưa ai dùng bao giờ. Quay FORM NHẬP thay vì danh sách: vẫn đúng tính năng, mà có gì để nhìn.
await canh(12, "lo-han-dung", async (page) => {
  await moTrang(page, "/app/Batch", "tbody tr, main", 2500);
  await moc(page, "12a-lo-hang");
  await keoDai(page, 10);
  await moTrang(page, "/app/Quality Inspection/new", "main input, main form", 3000);
  await moc(page, "12b-phieu-kiem-chat-luong");
  await keoDai(page, 12);
});

// Kiểm kê — quay form đếm, nơi có bảng nhập số đếm thực tế
await canh(13, "kiem-ke", async (page) => {
  await moTrang(page, "/app/Stock Reconciliation/new", "main input, main form", 3000);
  await moc(page, "13-kiem-ke");
  await keoDai(page, 18);
});

// Thiết lập ban đầu — trả lời câu "cài đặt có phức tạp không"
await canh(14, "thiet-lap", async (page) => {
  await moTrang(page, "/thiet-lap", "main", 2500);
  await moc(page, "14-thiet-lap");
  await keoDai(page, 14);
});

await browser.close();
console.log(`\nVideo nằm ở: ${OUT}`);
console.log("Cảnh 1 (hai file Excel lệch nhau) và cảnh 9 (tấm chốt số điện thoại) phải tự làm —");
console.log("một cái quay ngoài phần mềm, một cái dựng trong phần mềm biên tập.");
