import { chromium } from "@playwright/test";

/**
 * Màn thao tác của Alumdoor trên tenant SỐNG, qua đúng đường trình duyệt đi.
 *
 * Ba câu hỏi: màn có dựng được từ manifest không, ô nhập có phải control THẬT của form
 * không, và con số người dùng gõ có tới được method nguyên vẹn không. Câu thứ ba là câu
 * quan trọng nhất — nó bắt được lỗi "3.5 thành 35".
 */
const O = "https://alu.kairo.vn";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
let bad = 0;
const ok = (l, c, d = "") => { if (!c) bad += 1; console.log(`${c ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); };

await page.goto(`${O}/x/action%3Acat-nhom`);
await page.locator("#mf-login-usr").fill("admin");
await page.locator("#mf-login-pwd").fill("admin@2026");
await page.getByRole("button", { name: "Đăng nhập" }).click();
await page.waitForTimeout(6000);
await page.goto(`${O}/x/action%3Acat-nhom`);
await page.waitForTimeout(5000);

let body = await page.locator("body").innerText();
ok("màn Cắt nhôm dựng được TỪ MANIFEST", /Cắt nhôm/.test(body) && !/chưa được triển khai/.test(body), "");
ok("  · đủ ô nhập brief khai", /Mã nhôm/.test(body) && /Rộng cắt lá/.test(body) && /Số chứng từ/.test(body), "");
ok("  · có nút xem trước RIÊNG với nút ghi thật", /Xem đề xuất/.test(body) && /Cắt và trừ tồn/.test(body), "");
const nav = await page.locator("nav, aside").first().innerText().catch(() => "");
ok("  · menu có cả ba thao tác", /Cắt nhôm/.test(nav) && /Hoàn cắt/.test(nav) && /Trả hàng/.test(nav), "");

// Link là combobox THẬT của form (nút mở popover), không phải một ô text nghèo hơn.
await page.locator("#action-cat-nhom-profile").click();
await page.waitForTimeout(800);
await page.keyboard.type("AL548");
await page.waitForTimeout(2500);
// Tên CHÍNH XÁC: option đầu là `Tạo mới "AL548"`, chọn nhầm nó thì mở hộp tạo bản ghi.
await page.getByRole("option", { name: "AL548", exact: true }).first().click();
await page.waitForTimeout(1000);

await page.getByLabel(/Rộng cắt lá/).click();
await page.keyboard.type("3.5");
await page.getByLabel(/Số lá cần/).click();
await page.keyboard.type("8");
await page.getByLabel(/Số chứng từ/).fill("UI-TEST-1");

/**
 * Chốt PHÍM DẤU THẬP PHÂN, đọc ngay trên ô trước khi gọi method.
 *
 * Định dạng Việt Nam (`#.###,##`) dùng dấu chấm để phân nhóm hàng nghìn, nên dấu chấm người
 * dùng gõ từng bị nuốt: "3.5" thành **35** — sai một bậc mười, im lặng. Lần đó lộ ra vì kho
 * không có cây nhôm 35 m nên bị từ chối; ở ô đơn giá thì 1.5 thành 15 và không gì báo cả.
 */
const rong = await page.getByLabel(/Rộng cắt lá/).inputValue();
ok("gõ '3.5' vào ô số ra 3,5 — KHÔNG thành 35", rong === "3,5", `ô đang là "${rong}"`);

await page.getByRole("button", { name: "Xem đề xuất" }).click();
await page.waitForTimeout(7000);
body = await page.locator("body").innerText();
ok("bấm Xem đề xuất ra bảng lô nhôm", /LN-\d/.test(body), (body.match(/LN-\d+/g) || ["không thấy lô nào"]).slice(0, 3).join(", "));
ok("  · nói rõ CHƯA GHI GÌ", /chưa ghi gì/i.test(body), "");
ok("  · rộng cắt tới method đúng 3,5 m", !/≥ 35 m/.test(body), "");
await page.screenshot({ path: "alu-cut-preview.png", fullPage: true });

await page.goto(`${O}/x/action%3Ahoan-cat`);
await page.waitForTimeout(4000);
body = await page.locator("body").innerText();
// Không có `preview` thì màn KHÔNG được mọc ra một nút xem trước rỗng.
ok("màn Hoàn cắt mở được, và KHÔNG có nút xem trước", /Hoàn cắt/.test(body) && !/Xem đề xuất/.test(body), "");

console.log(bad ? `\n${bad} FAILED` : "\nMÀN THAO TÁC CHẠY ĐÚNG");
await browser.close();
process.exit(bad ? 1 : 0);
