import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderPrintFormat } from "../dist/packages/frappe-model/src/services.js";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));
const sourcePrint = brief.prints.find((entry) => entry.doctype === "Purchase Order" && entry.default);
assert.ok(sourcePrint, "thiếu mẫu in Purchase Order mặc định");

const print = {
  ...sourcePrint,
  css: (sourcePrint.css ?? []).join("\n"),
  html: (sourcePrint.html ?? []).join("\n"),
};

const fixture = {
  name: "PO-ALUMDOOR-PRINT-001",
  doctype: "Purchase Order",
  owner: "Administrator",
  docstatus: 0,
  status: "Draft",
  version: 1,
  data: {
    supplier: "NHÀ MÁY TIẾN ĐẠT",
    transaction_date: "2026-07-30T00:00:00.000Z",
    schedule_date: "2026-08-02T00:00:00.000Z",
    currency: "VND",
    grand_total: 65_216_800,
    // Đảo thứ tự đầu vào để khóa luôn việc renderer phải tôn trọng idx của dòng chứng từ.
    items: [
      {
        idx: 2,
        item_code: "MOTOR-01",
        item_name: "Motor cửa cuốn",
        color: "",
        length_m: "",
        theoretical_kg_per_m: "",
        qty_bar: "",
        qty: 2,
        uom: "Cái",
        rate: 3_200_000,
        amount: 6_400_000,
        is_stamped: "Không",
        note: "Dòng hàng thường",
      },
      {
        idx: 1,
        item_code: "AL71",
        item_name: "Nhôm lá 71",
        color: "GS",
        length_m: 7.2,
        theoretical_kg_per_m: 0.389,
        qty_bar: 200,
        qty: 560.16,
        uom: "Kg",
        rate: 105_000,
        amount: 58_816_800,
        is_stamped: "Có",
        note: "Dòng nhôm",
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

test("Alumdoor Purchase Order print keeps the A4 structural contract", () => {
  const css = print.css;
  const html = print.html;
  const header = cells(section(html, "thead"), "th").map((cell) => cell.text);
  const widths = [...section(html, "colgroup").matchAll(/<col\b[^>]*width:(\d+(?:\.\d+)?)%/gi)]
    .map((match) => Number(match[1]));

  assert.equal(print.name, "Đơn nhập hàng ALUMDOOR");
  assert.match(css, /@page\{size:A4 portrait;margin:0\}/i);
  assert.match(css, /thead\{display:table-header-group\}/);
  assert.match(css, /tr\{[^}]*break-inside:avoid[^}]*page-break-inside:avoid/);
  assert.match(css, /th,td\{[^}]*text-align:center/);
  assert.match(css, /\.n\{[^}]*text-align:center/);
  assert.match(css, /\.c\{[^}]*text-align:center/);
  assert.match(css, /\.total-value\{[^}]*text-align:center/);
  assert.match(html, /class="brand-logo" src="data:image\/png;base64,/);
  assert.match(html, /class="company-header-img" src="\/alumdoor-company-header\.png"/);
  assert.ok(html.indexOf("class=\"letterhead\"") < html.indexOf("class=\"title\""));

  assert.deepEqual(header, [
    "STT",
    "Mã hàng",
    "Tên hàng",
    "Màu sắc",
    "Kích thước",
    "Trọng lượng",
    "SỐ CÂY/LÁ",
    "Số lượng",
    "ĐVT",
    "Đơn giá",
    "Thành tiền",
    "Dập",
    "Ghi chú",
  ]);
  assert.equal(widths.length, header.length, "mỗi cột tiêu đề phải có một độ rộng");
  assert.equal(widths.reduce((sum, width) => sum + width, 0), 100, "tổng độ rộng cột phải bằng 100%");
  assert.doesNotMatch(html, /qty_bundle|Số bó/i);
});

test("Alumdoor Purchase Order fixture renders aluminium and ordinary rows through the real renderer", () => {
  const rendered = renderPrintFormat(print, fixture, "vi");
  const rows = [...section(rendered, "tbody").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => cells(match[1], "td"));

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.length === 13), "mọi dòng phải khớp đúng 13 cột tiêu đề");
  assert.equal(rows[0][0].text, "1");
  assert.equal(rows[0][1].text, "AL71", "renderer phải sắp dòng theo idx");
  assert.equal(rows[0][2].text, "Nhôm lá 71");
  assert.equal(rows[0][3].text, "GS");
  assert.equal(rows[0][4].text, "7,2");
  assert.equal(rows[0][5].text, "0,389");
  assert.equal(rows[0][6].text, "200");
  assert.equal(rows[0][7].text, "560,16");
  assert.equal(rows[0][11].text, "Có");
  assert.equal(rows[0][12].text, "Dòng nhôm");

  assert.equal(rows[1][0].text, "2");
  assert.equal(rows[1][1].text, "MOTOR-01");
  assert.equal(rows[1][2].text, "Motor cửa cuốn");
  assert.equal(rows[1][4].text, "", "hàng thường không được bịa kích thước nhôm");
  assert.equal(rows[1][5].text, "", "hàng thường không được bịa trọng lượng kg/m");
  assert.equal(rows[1][6].text, "", "hàng thường không được bịa số cây/lá");
  assert.equal(rows[1][7].text, "2,00");
  assert.equal(rows[1][8].text, "Cái");
  assert.equal(rows[1][11].text, "Không");
  assert.equal(rows[1][12].text, "Dòng hàng thường");

  assert.match(rendered, /65\.216\.800 VND/);
  assert.doesNotMatch(rendered, /{{|}}/, "HTML preview/PDF không được còn placeholder chưa render");
  assert.doesNotMatch(rendered, /<script\b/i, "mẫu in không được chèn script vào iframe preview/PDF");
});
