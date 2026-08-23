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
    phone: "0901234567",
    transaction_date: "2026-08-01T00:00:00.000Z",
    delivery_date: "2026-08-08T00:00:00.000Z",
    against_quotation: "BG-2026-0012",
    customer_group: "Đại lý",
    install_address: "12 Nguyễn Văn A, TP.HCM",
    currency: "VND",
    total_amount: 15_400_000,
    discount_amount: 2_205_000,
    vat_rate: 0,
    vat_amount: 0,
    surcharge_amount: 0,
    grand_total: 13_195_000,
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
        discount_percentage: 0,
        discount_amount: 0,
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
        discount_percentage: 15,
        discount_amount: 2_205_000,
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

  assert.equal(print.name, "Đơn bán hàng ALUMDOOR");
  // Lề vật lý phải nằm ở @page thì MỌI trang mới có lề: body{padding} chỉ áp một lần ở đầu
  // dòng chảy, nên trang 2 trở đi in sát mép giấy và rơi vào vùng không in được của máy in.
  // Trang đầu giữ đúng 23,7mm để bản in không đổi so với mẫu khách đã duyệt.
  assert.match(css, /@page\{size:A4 portrait;margin:12mm 8mm 8mm\}/i);
  assert.match(css, /@page :first\{margin-top:23\.7mm\}/i);
  // Khổ giấy và lề cũ chỉ còn dành cho màn hình xem trước. Nếu chúng rớt lại vào bản in thì
  // body cao/rộng hơn khung trang đã trừ lề và trình duyệt đẩy ra thêm một trang trắng.
  assert.doesNotMatch(css.replace(/@media screen\{.*?\}\}/gs, ""), /min-height:297mm|padding:23\.7mm/);
  assert.match(css, /@media screen\{html\{width:210mm\}body\{width:210mm;min-height:297mm;padding:23\.7mm 8mm 8mm\}\}/);
  assert.match(css, /thead\{display:table-header-group\}/);
  assert.match(css, /tr\{[^}]*break-inside:avoid[^}]*page-break-inside:avoid/);
  assert.match(css, /th,td\{[^}]*text-align:center/);
  assert.match(css, /\.n,\.c\{[^}]*text-align:center/);
  assert.match(css, /\.discount-row td\{[^}]*border:1px solid #777!important[^}]*text-align:center/);
  assert.match(css, /\.summary-value\{[^}]*text-align:center!important/);
  assert.match(html, /class="brand-logo" src="\/alumdoor-order-logo\.png"/);
  assert.match(html, /class="company-header-img" src="\/alumdoor-company-header\.png"/);
  assert.ok(html.indexOf("class=\"letterhead\"") < html.indexOf("class=\"title\""));

  assert.match(html, /\{\{#ifAny items\.mesh_height_m\}\}/);
  assert.doesNotMatch(html, /Mô tơ \/ phụ kiện|Ghi chú lắp đặt/i, "các trường vận hành không được in");
  assert.doesNotMatch(html, /Nhóm giá/i, "nhóm giá không được in");
  assert.match(html, /SĐT:/);
});

test("Alumdoor Sales Order fixture renders door and ordinary rows through the real renderer", () => {
  const rendered = renderPrintFormat(print, fixture, "vi");
  const header = cells(section(rendered, "thead"), "th").map((cell) => cell.text);
  // Nhãn cột chép theo MÀN NHẬP (chốt 24/08/2026): "Cao phủ bì" thay "Cao", "SL" thay "Số lượng"
  // — người bán đọc bản in phải thấy đúng chữ vừa nhập, không phải một bộ từ vựng thứ hai.
  assert.deepEqual(header, ["STT", "Mã hàng", "Tên hàng", "Màu", "Rộng (m)", "Cao phủ bì (m)", "SL", "ĐVT", "Khối lượng", "Đơn giá (VNĐ)", "CK (%)", "Thành tiền (VNĐ)"]);
  const tbody = section(rendered, "tbody");
  const rows = [...tbody.matchAll(/<tr\b(?![^>]*discount-row)[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => cells(match[1], "td"));

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.length === 12), "mọi dòng hàng phải khớp đúng số cột tiêu đề");
  assert.equal(rows[0][0].text, "1");
  assert.equal(rows[0][1].text, "CUA-DUC-01", "renderer phải sắp dòng theo idx");
  assert.equal(rows[0][2].text, "Cửa cuốn Đức");
  assert.equal(rows[0][3].text, "GS");
  assert.equal(rows[0][4].text, "4,2");
  assert.equal(rows[0][5].text, "2,8");
  assert.equal(rows[0][6].text, "1");
  assert.equal(rows[0][7].text, "m2");
  assert.equal(rows[0][8].text, "11,76");
  assert.equal(rows[0][9].text, "1.250.000");
  assert.equal(rows[0][10].text, "", "dòng hàng chính không lặp phần trăm chiết khấu");
  assert.equal(rows[0][11].text, "14.700.000");

  assert.equal(rows[1][0].text, "2");
  assert.equal(rows[1][1].text, "REMOTE-01");
  assert.equal(rows[1][3].text, "", "hàng thường không được bịa màu");
  assert.equal(rows[1][4].text, "", "hàng thường không được bịa chiều rộng");
  assert.equal(rows[1][5].text, "", "hàng thường không được bịa chiều cao");
  assert.equal(rows[1][6].text, "", "hàng thường không được bịa số bộ");
  assert.equal(rows[1][7].text, "Cái");
  assert.equal(rows[1][8].text, "2,00");
  assert.equal(rows[1][10].text, "");

  const discountRow = tbody.match(/<tr class="discount-row">([\s\S]*?)<\/tr>/i)?.[1] ?? "";
  const discountCells = cells(discountRow, "td").map((cell) => cell.text);
  assert.equal(discountCells[0], "Chiết khấu");
  assert.equal(discountCells.at(-2), "15%");
  assert.equal(discountCells.at(-1), "-2.205.000");
  assert.match(tbody, /class="discount-row"/);
  assert.doesNotMatch(tbody, />0%<|>-0 VNĐ</, "dòng chiết khấu bằng 0 phải được ẩn");

  assert.match(rendered, /15\.400\.000/);
  assert.doesNotMatch(rendered, /Tổng tiền VAT/, "dòng VAT bằng 0 phải được ẩn");
  assert.match(rendered, /-2\.205\.000/);
  assert.match(rendered, /SĐT:<\/span><span class="meta-value">0901234567/);
  assert.doesNotMatch(rendered, /Nhóm giá/);
  // Chỉ soi "{{": mọi placeholder chưa render đều mở bằng nó, còn "}}" đứng một mình là
  // CSS hợp lệ — at-rule lồng nhau (@media screen{…{…}}) đóng bằng đúng hai ngoặc.
  assert.doesNotMatch(rendered, /\{\{/, "HTML preview/PDF không được còn placeholder chưa render");
  assert.doesNotMatch(rendered, /<script\b/i, "mẫu in không được chèn script vào iframe preview/PDF");
});

/**
 * Bảng đơn bán ẩn/hiện cột theo dữ liệu, nên dòng chiết khấu phải trải đúng số cột CÒN LẠI.
 * Trước đây nó viết cứng colspan 10/11: đơn chỉ có phụ kiện in ra bảng 8 cột trong khi dòng
 * chiết khấu vẫn chiếm 12, đẩy ô "CK %" và số tiền chiết khấu ra hẳn ngoài mép phải bảng.
 */
function spanOf(row) {
  return cells(row, "td").reduce((total, cell) => total + Number(/colspan="(\d+)"/i.exec(cell.attributes)?.[1] ?? 1), 0);
}

function orderWith(items) {
  return { ...fixture, data: { ...fixture.data, items } };
}

const DISCOUNTED = { qty: 1, uom: "Cái", rate: 450_000, amount: 450_000, discount_percentage: 10, discount_amount: 45_000 };

test("dòng chiết khấu trải đúng số cột với mọi tổ hợp cột tuỳ dữ liệu", () => {
  const shapes = {
    "đủ cột": { item_code: "A", color: "GS", width_m: 1.2, height_m: 2.4, mesh_height_m: 0.6, set_count: 1, ...DISCOUNTED },
    "không màu, có cao lưới": { item_code: "A", color: "", width_m: 1.2, height_m: 2.4, mesh_height_m: 0.6, set_count: 1, ...DISCOUNTED },
    "không cao lưới": { item_code: "A", color: "GS", width_m: 1.2, height_m: 2.4, set_count: 1, ...DISCOUNTED },
    // Đúng hình dạng đã in sai ngoài thực tế: một dòng phụ kiện có chiết khấu, bảng 9 cột.
    "chỉ phụ kiện, có số lượng": { item_code: "TP-Tanker-Alumax-Lac33", item_name: "LẮC TANKER_ALUMAX 33", set_count: 1, ...DISCOUNTED },
    "phụ kiện trơn": { item_code: "REMOTE-01", ...DISCOUNTED },
  };

  for (const [label, item] of Object.entries(shapes)) {
    const rendered = renderPrintFormat(print, orderWith([item]), "vi");
    const columns = cells(section(rendered, "thead"), "th").length;
    const discountRow = section(rendered, "tbody").match(/<tr class="discount-row">([\s\S]*?)<\/tr>/i);
    assert.ok(discountRow, `${label}: thiếu dòng chiết khấu`);
    assert.equal(spanOf(discountRow[1]), columns, `${label}: dòng chiết khấu phải phủ đúng ${columns} cột`);
    assert.doesNotMatch(rendered, /colspan="rest/, `${label}: colspan động phải được giải trước khi ra HTML`);
  }
});

/**
 * Khối thông tin đầu trang là HAI CỘT TƯỜNG MINH, không phải lưới tự rải theo hàng.
 * Với lưới tự rải, chỉ cần SĐT hoặc Ghi chú vắng mặt là cả cột phải trượt lên một ô và
 * "Ngày giao hàng" nhảy sang nằm cạnh "Địa chỉ".
 */
function metaColumns(rendered) {
  const meta = rendered.match(/<div class="meta">([\s\S]*?)<table/)?.[1] ?? "";
  return [...meta.matchAll(/<div class="meta-col">([\s\S]*?)<\/div>\s*(?=<div class="meta-col">|<\/div>)/g)]
    .map((match) => [...match[1].matchAll(/meta-label">([^<]*)</g)].map((label) => label[1]));
}

test("khối thông tin giữ đúng hai cột dù trường tuỳ chọn vắng mặt", () => {
  const right = ["Số đơn:", "Ngày đặt hàng:", "Ngày giao hàng:"];

  assert.deepEqual(metaColumns(renderPrintFormat(print, fixture, "vi")), [
    ["Khách hàng:", "SĐT:", "Địa chỉ:", "Ghi chú:"],
    right,
  ]);

  const noPhone = { ...fixture, data: { ...fixture.data, phone: "" } };
  assert.deepEqual(metaColumns(renderPrintFormat(print, noPhone, "vi")), [
    ["Khách hàng:", "Địa chỉ:", "Ghi chú:"],
    right,
  ]);

  const noNote = { ...fixture, data: { ...fixture.data, note: "" } };
  assert.deepEqual(metaColumns(renderPrintFormat(print, noNote, "vi")), [
    ["Khách hàng:", "SĐT:", "Địa chỉ:"],
    right,
  ]);

  // Ghi chú thuộc khối đầu trang, không còn khối riêng dưới bảng.
  assert.doesNotMatch(renderPrintFormat(print, fixture, "vi"), /footer-note/);
});
