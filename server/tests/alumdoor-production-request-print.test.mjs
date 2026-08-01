import test from "node:test";
import assert from "node:assert/strict";
import { renderPrintFormat } from "../dist/packages/frappe-model/src/services.js";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const brief = await readBriefSource(new URL("../briefs/alumdoor-v2.json", import.meta.url));
const sourcePrint = brief.prints.find((entry) => entry.doctype === "Production Request" && entry.default);
assert.ok(sourcePrint, "thiếu mẫu in Production Request mặc định");

const print = {
  ...sourcePrint,
  css: (sourcePrint.css ?? []).join("\n"),
  html: (sourcePrint.html ?? []).join("\n"),
};

const fixture = {
  name: "YCSX-2026-0001",
  doctype: "Production Request",
  owner: "Administrator",
  docstatus: 0,
  status: "Draft",
  version: 1,
  data: {
    sales_order: "DH-2026-0001",
    customer: "CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG MINH PHÁT - CHI NHÁNH KHU CÔNG NGHIỆP TÂN BÌNH",
    requested_on: "2026-08-01T02:15:00.000Z",
    delivery_date: "2026-08-08T00:00:00.000Z",
    source_warehouse: "Kho nguyên vật liệu nhôm và phụ kiện ALUMDOOR - Xưởng 1",
    target_warehouse: "Kho thành phẩm cửa cuốn ALUMDOOR - Xưởng 1",
    request_state: "Nháp",
    work_order_count: 0,
    note: "Ưu tiên bộ số 1 cho công trình tầng trệt. Kiểm tra đúng màu, mô tơ và chiều rộng cắt trước khi phát hành lệnh sản xuất.",
    items: [
      {
        idx: 2,
        request_line_key: "DH-2026-0001:ROW-2:SET-2",
        sales_order_row_id: "ROW-2",
        item_code: "CUA-LUOI-01",
        item_group: "Cửa cuốn",
        door_type: "Cửa Lưới",
        department: "Tổ cửa lưới",
        set_no: 2,
        set_count: 1,
        width_m: 3.6,
        height_m: 2.6,
        mesh_height_m: 2.3,
        color: "TRANG-SUA",
        motor_model: "MOTOR-AC-300KG",
        sales_mode: "Trọn bộ",
        formula_policy: "CT-LUOI-01",
        formula_version: "2026.08",
        width_basis: "Phủ bì",
        cut_width_m: 3.71,
        billable_area_sqm: 9.36,
        leaf_count: 38,
        single_layer_leaf_count: 38,
        double_layer_leaf_count: 0,
        estimated_weight_kg: 96.5,
        estimated_minutes: 165,
        schedule_warning: "Chờ xác nhận màu lưới trước khi sơn.",
        source_warehouse: "Kho nguyên vật liệu nhôm và phụ kiện ALUMDOOR - Xưởng 1",
        target_warehouse: "Kho thành phẩm cửa cuốn ALUMDOOR - Xưởng 1",
        bom_no: "BOM-CUA-LUOI-01",
        output_qty: 9.36,
        stock_uom: "m2"
      },
      {
        idx: 1,
        request_line_key: "DH-2026-0001:ROW-1:SET-1",
        sales_order_row_id: "ROW-1",
        item_code: "CUA-DUC-01",
        item_group: "Cửa cuốn",
        door_type: "Cửa Đức",
        department: "Tổ cửa cuốn Đức",
        set_no: 1,
        set_count: 1,
        width_m: 4.2,
        height_m: 2.8,
        mesh_height_m: 0,
        color: "GS",
        motor_model: "MOTOR-AC-500KG",
        sales_mode: "Trọn bộ",
        formula_policy: "CT-DUC-01",
        formula_version: "2026.08",
        width_basis: "Phủ bì",
        cut_width_m: 4.31,
        billable_area_sqm: 11.76,
        leaf_count: 42,
        single_layer_leaf_count: 42,
        double_layer_leaf_count: 0,
        estimated_weight_kg: 128.5,
        estimated_minutes: 185,
        schedule_warning: "Hoàn tất trước 15:00 để chuyển KCS cùng ngày.",
        source_warehouse: "Kho nguyên vật liệu nhôm và phụ kiện ALUMDOOR - Xưởng 1",
        target_warehouse: "Kho thành phẩm cửa cuốn ALUMDOOR - Xưởng 1",
        bom_no: "BOM-CUA-DUC-01",
        output_qty: 11.76,
        stock_uom: "m2"
      }
    ]
  }
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

test("Alumdoor Production Request print keeps the A4 manufacturing contract", () => {
  const css = print.css;
  const html = print.html;
  const header = cells(section(html, "thead"), "th").map((cell) => cell.text);
  const widths = [...section(html, "colgroup").matchAll(/<col\b[^>]*width:(\d+(?:\.\d+)?)%/gi)]
    .map((match) => Number(match[1]));

  assert.equal(print.name, "Phiếu yêu cầu sản xuất ALUMDOOR");
  assert.match(css, /@page\{size:A4 portrait;margin:0\}/i);
  assert.match(css, /thead\{display:table-header-group\}/);
  assert.match(css, /tr\{[^}]*break-inside:avoid[^}]*page-break-inside:avoid/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(html, /class="brand-logo" src="\/alumdoor-order-logo\.png"/);
  assert.match(html, /class="company-header-img" src="\/alumdoor-company-header\.png"/);
  assert.match(html, /Chủ xưởng duyệt/);

  assert.deepEqual(header, [
    "STT",
    "Bộ số",
    "Số bộ",
    "Mã TP",
    "Loại cửa",
    "Bộ phận",
    "Màu",
    "Rộng (m)",
    "Cao (m)",
    "Rộng cắt (m)",
    "Số lá",
    "Mô tơ / cảnh báo",
    "Phút dự toán",
    "Kho vật tư"
  ]);
  assert.equal(widths.length, header.length, "mỗi cột tiêu đề phải có một độ rộng");
  assert.equal(widths.reduce((sum, width) => sum + width, 0), 100, "tổng độ rộng cột phải bằng 100%");
});

test("Alumdoor Production Request renders long manufacturing data through the real renderer", () => {
  const rendered = renderPrintFormat(print, fixture, "vi");
  const rows = [...section(rendered, "tbody").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => cells(match[1], "td"));

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.length === 14), "mọi dòng phải khớp đúng 14 cột tiêu đề");
  assert.equal(rows[0][0].text, "1");
  assert.equal(rows[0][1].text, "1");
  assert.equal(rows[0][2].text, "1");
  assert.equal(rows[0][3].text, "CUA-DUC-01", "renderer phải sắp dòng theo idx");
  assert.equal(rows[0][4].text, "Cửa Đức");
  assert.equal(rows[0][5].text, "Tổ cửa cuốn Đức");
  assert.equal(rows[0][6].text, "GS");
  assert.equal(rows[0][7].text, "4,2");
  assert.equal(rows[0][8].text, "2,8");
  assert.equal(rows[0][9].text, "4,31");
  assert.equal(rows[0][10].text, "42");
  assert.match(rows[0][11].text, /MOTOR-AC-500KG/);
  assert.match(rows[0][11].text, /Hoàn tất trước 15:00/);
  assert.equal(rows[0][12].text, "185");
  assert.match(rows[0][13].text, /Kho nguyên vật liệu nhôm/);

  assert.equal(rows[1][0].text, "2");
  assert.equal(rows[1][3].text, "CUA-LUOI-01");
  assert.equal(rows[1][4].text, "Cửa Lưới");
  assert.equal(rows[1][9].text, "3,71");
  assert.equal(rows[1][10].text, "38");
  assert.match(rendered, /CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG MINH PHÁT/);
  assert.match(rendered, /Kho thành phẩm cửa cuốn ALUMDOOR/);
  assert.doesNotMatch(rendered, /{{|}}/, "HTML preview/PDF không được còn placeholder chưa render");
  assert.doesNotMatch(rendered, /<script\b/i, "mẫu in không được chèn script vào iframe preview/PDF");
});
