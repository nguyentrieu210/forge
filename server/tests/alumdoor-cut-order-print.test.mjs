import test from "node:test";
import assert from "node:assert/strict";
import { renderPrintFormat } from "../dist/packages/frappe-model/src/services.js";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const brief = await readBriefSource(new URL("../briefs/alumdoor-v2.json", import.meta.url));
const sourcePrint = brief.prints.find((entry) => entry.doctype === "Cut Order" && entry.default);
assert.ok(sourcePrint, "thiếu mẫu in Cut Order mặc định");

const print = {
  ...sourcePrint,
  css: (sourcePrint.css ?? []).join("\n"),
  html: (sourcePrint.html ?? []).join("\n"),
};

const fixture = {
  name: "CN-2026-00001",
  doctype: "Cut Order",
  owner: "Administrator",
  docstatus: 1,
  status: "Submitted",
  version: 1,
  data: {
    cut_on: "2026-08-01T03:20:00.000Z",
    cutting_policy: "CT-CUA-DUC-AL70-2026",
    customer: "CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG MINH PHÁT - CHI NHÁNH KHU CÔNG NGHIỆP TÂN BÌNH",
    so_reference: "DH-2026-0001",
    work_order: "WO-2026-00157",
    target_color: "GS - GHI SÁNG SƠN TĨNH ĐIỆN",
    cut_state: "Đã cắt",
    cancel_reason: "",
    note: "Đối chiếu bundle lô mẹ trước khi cắt; đầu thừa đạt ngưỡng phải nhập đúng bundle/kho đầu thừa tương ứng, không gộp sang lô khác.",
    items: [
      {
        idx: 2,
        serial_and_batch_bundle: "SBB-OUT-K12-AL71N-20260801-000987-LONG-BUNDLE-ID",
        offcut_bundle: "SBB-IN-K12-DT-AL71N-20260801-000988",
        item_code: "AL71N",
        source_warehouse: "Kho nhôm K12 - Xưởng 2 - khu vực vật tư dài",
        source_length_m: 3.8,
        cut_width_m: 3.43,
        sheets_cut: 36,
        cuts_count: 36,
        kerf_total_m: 0.108,
        kg_consumed: 94.6,
        kg_weighed: 95.15,
        offcut_length_m: 0.262,
        scrap_m: 0.03
      },
      {
        idx: 1,
        serial_and_batch_bundle: "SBB-OUT-K36-AL70-20260801-000123-LONG-BUNDLE-ID",
        offcut_bundle: "SBB-IN-K36-DT-AL70-20260801-000124",
        item_code: "AL70",
        source_warehouse: "Kho nhôm K36 - Xưởng 1 - khu vực cây nguyên liệu ALUMDOOR",
        source_length_m: 3.8,
        cut_width_m: 3.5,
        sheets_cut: 42,
        cuts_count: 42,
        kerf_total_m: 0.126,
        kg_consumed: 110.45,
        kg_weighed: 111.2,
        offcut_length_m: 0.174,
        scrap_m: 0.01
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

test("Alumdoor Cut Order print keeps the A4 cutting contract", () => {
  const css = print.css;
  const html = print.html;
  const header = cells(section(html, "thead"), "th").map((cell) => cell.text);
  const widths = [...section(html, "colgroup").matchAll(/<col\b[^>]*width:(\d+(?:\.\d+)?)%/gi)]
    .map((match) => Number(match[1]));

  assert.equal(print.name, "Phiếu cắt nhôm ALUMDOOR");
  assert.match(css, /@page\{size:A4 portrait;margin:0\}/i);
  assert.match(css, /thead\{display:table-header-group\}/);
  assert.match(css, /tr\{[^}]*break-inside:avoid[^}]*page-break-inside:avoid/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(html, /class="company-header-img" src="\/alumdoor-company-header\.png"/);
  assert.match(html, /Bundle lô mẹ và bundle nhập đầu thừa/);
  assert.doesNotMatch(html, /<script\b/i);

  assert.deepEqual(header, [
    "STT",
    "Mã nhôm",
    "Bundle lô mẹ / đầu thừa",
    "Kho lô mẹ",
    "Khổ cây (m)",
    "Rộng cắt (m)",
    "Số lá",
    "Số nhát",
    "Kerf (m)",
    "Kg tiêu hao",
    "Kg cân thật",
    "Đầu thừa (m)",
    "Phế (m)"
  ]);
  assert.equal(widths.length, header.length, "mỗi cột tiêu đề phải có một độ rộng");
  assert.equal(widths.reduce((sum, width) => sum + width, 0), 100, "tổng độ rộng cột phải bằng 100%");
});

test("Alumdoor Cut Order renders traceable bundles and cutting measures through the real renderer", () => {
  const rendered = renderPrintFormat(print, fixture, "vi");
  const rows = [...section(rendered, "tbody").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => cells(match[1], "td"));

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.length === 13), "mọi dòng phải khớp đúng 13 cột tiêu đề");

  assert.equal(rows[0][0].text, "1");
  assert.equal(rows[0][1].text, "AL70", "renderer phải sắp dòng theo idx");
  assert.match(rows[0][2].text, /SBB-OUT-K36-AL70-20260801-000123/);
  assert.match(rows[0][2].text, /SBB-IN-K36-DT-AL70-20260801-000124/);
  assert.match(rows[0][3].text, /Kho nhôm K36/);
  assert.equal(rows[0][4].text, "3,8");
  assert.equal(rows[0][5].text, "3,5");
  assert.equal(rows[0][6].text, "42");
  assert.equal(rows[0][7].text, "42");
  assert.equal(rows[0][8].text, "0,126");
  assert.equal(rows[0][9].text, "110,45");
  assert.equal(rows[0][10].text, "111,20");
  assert.equal(rows[0][11].text, "0,174");
  assert.equal(rows[0][12].text, "0,01");

  assert.equal(rows[1][0].text, "2");
  assert.equal(rows[1][1].text, "AL71N");
  assert.match(rows[1][2].text, /SBB-OUT-K12-AL71N/);
  assert.match(rendered, /CT-CUA-DUC-AL70-2026/);
  assert.match(rendered, /DH-2026-0001/);
  assert.match(rendered, /WO-2026-00157/);
  assert.match(rendered, /GHI SÁNG SƠN TĨNH ĐIỆN/);
  assert.doesNotMatch(rendered, /{{|}}/, "HTML preview/PDF không được còn placeholder chưa render");
  assert.doesNotMatch(rendered, /<script\b/i, "mẫu in không được chèn script vào iframe preview/PDF");
});
