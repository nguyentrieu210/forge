import test from "node:test";
import assert from "node:assert/strict";
import { renderPrintFormat } from "../dist/packages/frappe-model/src/services.js";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const brief = await readBriefSource(new URL("../briefs/alumdoor-v2.json", import.meta.url));
const sourcePrint = brief.prints.find((entry) => entry.name === "Biên bản bàn giao / nghiệm thu ALUMDOOR");
assert.ok(sourcePrint, "thiếu mẫu Biên bản bàn giao / nghiệm thu ALUMDOOR");

const print = {
  ...sourcePrint,
  css: (sourcePrint.css ?? []).join("\n"),
  html: (sourcePrint.html ?? []).join("\n"),
};

const fixture = {
  name: "PXK-2026-0001",
  doctype: "Delivery Note",
  owner: "Administrator",
  docstatus: 1,
  status: "Submitted",
  version: 1,
  data: {
    customer: "CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG MINH PHÁT - CHI NHÁNH KHU CÔNG NGHIỆP TÂN BÌNH",
    issue_purpose: "Bán hàng",
    against_sales_order: "DH-2026-0001",
    posting_at: "2026-08-08T01:30:00.000Z",
    install_date: "2026-08-08T00:00:00.000Z",
    install_address: "Lô B12-14, đường số 18, Khu công nghiệp Tân Bình mở rộng, phường Bình Hưng Hòa, TP.HCM; vào cổng số 3 và gọi bảo vệ trước 30 phút.",
    installer: "Đội lắp số 2 - Nguyễn Văn Bình / Trần Quốc Khánh",
    driver: "Lê Văn Nam",
    vehicle: "51D-123.45",
    note: "Khách yêu cầu kiểm tra remote, hành trình đóng mở và hướng dẫn sử dụng trước khi ký nghiệm thu.",
    items: [
      {
        idx: 2,
        item_code: "REMOTE-01",
        item_name: "Remote điều khiển cửa cuốn mã hóa chống sao chép",
        color: "",
        width_m: "",
        height_m: "",
        set_count: "",
        qty: 2,
        uom: "Cái",
        warehouse: "Kho phụ kiện và mô tơ ALUMDOOR - Xưởng 1",
        weight_kg: 0.4,
      },
      {
        idx: 1,
        item_code: "CUA-DUC-01",
        item_name: "Bộ cửa cuốn Đức nan khe thoáng đồng bộ mô tơ, bình lưu điện và phụ kiện lắp đặt",
        color: "GS",
        width_m: 4.2,
        height_m: 2.8,
        set_count: 1,
        qty: 11.76,
        uom: "m2",
        warehouse: "Kho thành phẩm cửa cuốn - Xưởng 1",
        weight_kg: 128.5,
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

test("Alumdoor handover acceptance keeps a non-default A4 acceptance contract", () => {
  const css = print.css;
  const html = print.html;
  const header = cells(section(html, "thead"), "th").map((cell) => cell.text);
  const widths = [...section(html, "colgroup").matchAll(/<col\b[^>]*width:(\d+(?:\.\d+)?)%/gi)]
    .map((match) => Number(match[1]));

  assert.equal(print.doctype, "Delivery Note");
  assert.equal(print.default, false, "biên bản nghiệm thu không được thay mẫu giao hàng mặc định");
  assert.match(css, /@page\{size:A4 portrait;margin:0\}/i);
  assert.match(css, /thead\{display:table-header-group\}/);
  assert.match(css, /tr\{[^}]*break-inside:avoid[^}]*page-break-inside:avoid/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(html, /class="company-header-img" src="\/alumdoor-company-header\.png"/);
  assert.match(html, /Nội dung kiểm tra và nghiệm thu/);
  assert.match(html, /Nghiệm thu có điều kiện/);
  assert.match(html, /Đại diện khách hàng/);

  assert.deepEqual(header, [
    "STT",
    "Mã hàng",
    "Tên hàng",
    "Màu sắc",
    "Rộng (m)",
    "Cao (m)",
    "Số bộ",
    "SL bàn giao",
    "ĐVT",
    "Kho xuất",
    "Kết quả / ghi chú tại chỗ",
  ]);
  assert.equal(widths.length, header.length, "mỗi cột tiêu đề phải có một độ rộng");
  assert.equal(widths.reduce((sum, width) => sum + width, 0), 100, "tổng độ rộng cột phải bằng 100%");
});

test("Alumdoor handover acceptance renders delivery facts and leaves onsite result cells blank", () => {
  const rendered = renderPrintFormat(print, fixture, "vi");
  const rows = [...section(rendered, "tbody").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => cells(match[1], "td"));

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.length === 11), "mọi dòng phải khớp đúng 11 cột tiêu đề");

  assert.equal(rows[0][0].text, "1");
  assert.equal(rows[0][1].text, "CUA-DUC-01", "renderer phải sắp dòng theo idx");
  assert.equal(rows[0][2].text, "Bộ cửa cuốn Đức nan khe thoáng đồng bộ mô tơ, bình lưu điện và phụ kiện lắp đặt");
  assert.equal(rows[0][3].text, "GS");
  assert.equal(rows[0][4].text, "4,2");
  assert.equal(rows[0][5].text, "2,8");
  assert.equal(rows[0][6].text, "1");
  assert.equal(rows[0][7].text, "11,76");
  assert.equal(rows[0][8].text, "m2");
  assert.equal(rows[0][9].text, "Kho thành phẩm cửa cuốn - Xưởng 1");
  assert.equal(rows[0][10].text, "", "kết quả nghiệm thu tại chỗ phải để trống để ghi/ký thực tế");

  assert.equal(rows[1][0].text, "2");
  assert.equal(rows[1][1].text, "REMOTE-01");
  assert.equal(rows[1][4].text, "", "hàng thường không được bịa chiều rộng");
  assert.equal(rows[1][5].text, "", "hàng thường không được bịa chiều cao");
  assert.equal(rows[1][6].text, "", "hàng thường không được bịa số bộ");
  assert.equal(rows[1][7].text, "2,00");
  assert.equal(rows[1][10].text, "");

  assert.match(rendered, /CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG MINH PHÁT/);
  assert.match(rendered, /DH-2026-0001/);
  assert.match(rendered, /Khu công nghiệp Tân Bình mở rộng/);
  assert.match(rendered, /Đội lắp số 2/);
  assert.match(rendered, /51D-123\.45/);
  assert.match(rendered, /Đã hướng dẫn sử dụng \/ bảo quản/);
  assert.doesNotMatch(rendered, /{{|}}/, "HTML preview/PDF không được còn placeholder chưa render");
  assert.doesNotMatch(rendered, /<script\b/i, "mẫu in không được chèn script vào iframe preview/PDF");
});
