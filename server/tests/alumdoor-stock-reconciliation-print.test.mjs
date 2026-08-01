import test from "node:test";
import assert from "node:assert/strict";
import { renderPrintFormat } from "../dist/packages/frappe-model/src/services.js";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const brief = await readBriefSource(new URL("../briefs/alumdoor-v2.json", import.meta.url));
const sourcePrint = brief.prints.find((entry) => entry.doctype === "Stock Reconciliation" && entry.default);
assert.ok(sourcePrint, "thiếu mẫu in Stock Reconciliation mặc định");

const print = {
  ...sourcePrint,
  css: (sourcePrint.css ?? []).join("\n"),
  html: (sourcePrint.html ?? []).join("\n"),
};

const fixture = {
  name: "KK-2026-00001",
  doctype: "Stock Reconciliation",
  owner: "qa-manager@example.test",
  docstatus: 1,
  status: "Submitted",
  version: 1,
  data: {
    warehouse: "KHO-NVL",
    snapshot_at: "2026-08-02T08:30:00.000Z",
    counted_by: "qa-stock@example.test",
    witnessed_by: "qa-manager@example.test",
    note: "QA QR lineage kiểm kê",
    items: [
      {
        idx: 1,
        item_code: "AL71N",
        batch_no: "BATCH-AL71N-001",
        book_qty: 10,
        counted_qty: 9,
        variance_qty: -1,
        variance_weight_kg: -6.57,
        variance_reason: "Khác",
        variance_note: "Đối chiếu QA",
      },
    ],
  },
};

function textContent(html) {
  return html
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

test("Alumdoor stock reconciliation print declares an authoritative document-name QR", () => {
  assert.equal(print.name, "Biên bản kiểm kê kho ALUMDOOR");
  assert.match(print.css, /\.qr\{width:74px;height:74px/);
  assert.match(print.html, /alt="QR \{\{ name \}\}"/);
  assert.match(print.html, /src="\{\{ name \| qrcode \}\}"/,
    "QR phải được sinh từ chính document name qua qrcode filter của renderer");
  assert.doesNotMatch(print.html, /<script\b/i);
});

test("Alumdoor stock reconciliation real renderer emits the QR image for the exact document identity", () => {
  const rendered = renderPrintFormat(print, fixture, "vi");
  const text = textContent(rendered);

  assert.match(text, /Số:\s*KK-2026-00001/);
  assert.match(text, /KHO-NVL/);
  assert.match(text, /AL71N/);
  assert.match(text, /BATCH-AL71N-001/);
  assert.match(rendered, /<img class="qr" alt="QR KK-2026-00001" src="data:image\/gif;base64,[^"]+">/,
    "renderer phải biến qrcode filter thành data URL thật cho đúng name");
  assert.doesNotMatch(rendered, /QR KK-2026-00002/);
  assert.doesNotMatch(rendered, /\{\{|\}\}/, "preview/PDF không được còn placeholder chưa render");
  assert.doesNotMatch(rendered, /<script\b/i);
});
