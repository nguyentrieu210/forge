import test from "node:test";
import assert from "node:assert/strict";
import { renderPrintFormat } from "../dist/packages/frappe-model/src/services.js";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const brief = await readBriefSource(new URL("../briefs/alumdoor-v2.json", import.meta.url));
const sourcePrint = brief.prints.find((entry) => entry.doctype === "Sales Order" && entry.default);
assert.ok(sourcePrint, "thiếu mẫu in Sales Order mặc định");

const print = {
  ...sourcePrint,
  css: (sourcePrint.css ?? []).join("\n"),
  html: (sourcePrint.html ?? []).join("\n"),
};

const fixture = {
  name: "DH-2026-0001",
  doctype: "Sales Order",
  owner: "Administrator",
  docstatus: 1,
  status: "Submitted",
  version: 1,
  data: {
    customer: "CÔNG TY MINH PHÁT",
    transaction_date: "2026-08-01T00:00:00.000Z",
    delivery_date: "2026-08-08T00:00:00.000Z",
    against_quotation: "BG-2026-0012",
    customer_group: "Đại lý",
    install_address: "12 Nguyễn Văn A, TP.HCM",
    currency: "VND",
    grand_total: 15_400_000,
    note: "Giao buổi sáng, gọi khách trước 30 phút.",
    items: [
      {
        idx: 2,
        item_code: "REMOTE-01",
        item_name: "Remote điều khiển",
        color: "",
        width_m: "",
        height_m: "",
        set_count: "",
        qty: 2,
        uom: "Cái",
        rate: 350_000,
        amount: 700_000,
        motor_model: "",
        accessories: "",
        install_note: "Giao kèm bộ cửa",
      },
      {
        idx: 1,
        item_code: "CUA-DUC-01",
        item_name: "Cửa cuốn Đức",
        color: "GS",
        width_m: 4.2,
        height_m: 2.8,
        set_count: 1,
        qty: 11.76,
        uom: "m2",
        rate: 1_250_000,
        amount: 14_700_000,
        motor_model: "MOTOR-500KG",
        accessories: "2 remote",
        install_note: "Lắp trục cao",
      },
    ],
  },
};

function section(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  assert.ok(match, `thiếu <${tag}>`);
  return match[1];
}

function cells(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "gi"))]
    .map((match) => ({ attributes: match[1], html: match[2], text: textContent(match[2]) }));
}

function textContent(html) {
  return html
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#47;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

test("Alumdoor Sales Order print keeps the A4 structural contract", () => {
  const css = print.css;
  const html = print.html;
  const header = cells(section(html, "thead"), "th").map((cell) => cell.text);
  const widths = [...section(html, "colgroup").matchAll(/<col\b[^>]*width:(\d+(?:\.\d+)?)%/gi)]
    .map((match) => Number(match[1]));

  assert.equal(print.name, "Đơn bán hàng ALUMDOOR");
  assert.match(css, /@page\{size:A4 portrait;margin:0\}/i);
  assert.match(css, /thead\{display:table-header-group\}/);
  assert.match(css, /tr\{[^}]*break-inside:avoid[^}]*page-break-inside:avoid/);
  assert.match(css, /th,td\{[^}]*text-align:center/);
  assert.match(css, /\.n,\.c\{[^}]*text-align:center/);
  assert.match(css, /\.total-value\{[^}]*text-align:center/);
  assert.match(html, /class="brand-logo" src="\/alumdoor-order-logo\.png"/);
  assert.match(html, /class="company-header-img" src="\/alumdoor-company-header\.png"/);
  assert.ok(html.indexOf("class=\"letterhead\"") < html.indexOf("class=\"title\""));

  assert.deepEqual(header, [
    "STT",
    "Mã hàng",
    "Tên hàng",
    "Màu sắc",
    "Rộng (m)",
    "Cao (m)",
    "Số bộ",
    "Số lượng",
    "ĐVT",
    "Đơn giá",
    "Thành tiền",
    "Mô tơ / phụ kiện",
    "Ghi chú lắp đặt",
  ]);
  assert.equal(widths.length, header.length, "mỗi cột tiêu đề phải có một độ rộng");
  assert.equal(widths.reduce((sum, width) => sum + width, 0), 100, "tổng độ rộng cột phải bằng 100%");
});

test("Alumdoor Sales Order fixture renders door and ordinary rows through the real renderer", () => {
  const rendered = renderPrintFormat(print, fixture, "vi");
  const rows = [...section(rendered, "tbody").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => cells(match[1], "td"));

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.length === 13), "mọi dòng phải khớp đúng 13 cột tiêu đề");
  assert.equal(rows[0][0].text, "1");
  assert.equal(rows[0][1].text, "CUA-DUC-01", "renderer phải sắp dòng theo idx");
  assert.equal(rows[0][2].text, "Cửa cuốn Đức");
  assert.equal(rows[0][3].text, "GS");
  assert.equal(rows[0][4].text, "4,2");
  assert.equal(rows[0][5].text, "2,8");
  assert.equal(rows[0][6].text, "1");
  assert.equal(rows[0][7].text, "11,76");
  assert.equal(rows[0][8].text, "m2");
  assert.equal(rows[0][11].text, "MOTOR-500KG 2 remote");
  assert.equal(rows[0][12].text, "Lắp trục cao");

  assert.equal(rows[1][0].text, "2");
  assert.equal(rows[1][1].text, "REMOTE-01");
  assert.equal(rows[1][4].text, "", "hàng thường không được bịa chiều rộng");
  assert.equal(rows[1][5].text, "", "hàng thường không được bịa chiều cao");
  assert.equal(rows[1][6].text, "", "hàng thường không được bịa số bộ");
  assert.equal(rows[1][7].text, "2,00");
  assert.equal(rows[1][8].text, "Cái");
  assert.equal(rows[1][12].text, "Giao kèm bộ cửa");

  assert.match(rendered, /15\.400\.000 VND/);
  assert.doesNotMatch(rendered, /{{|}}/, "HTML preview/PDF không được còn placeholder chưa render");
  assert.doesNotMatch(rendered, /<script\b/i, "mẫu in không được chèn script vào iframe preview/PDF");
});
