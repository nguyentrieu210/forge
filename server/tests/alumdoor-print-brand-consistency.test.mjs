import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const [brief, sidecar, logo] = await Promise.all([
  readFile(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../briefs/alumdoor-v2.prints.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../../client/apps/runtime/public/alumdoor-order-logo.png", import.meta.url)),
]);

const purchaseOrder = brief.prints.find((entry) => entry.doctype === "Purchase Order" && entry.default);
assert.ok(purchaseOrder, "thiếu mẫu Purchase Order chuẩn");

test("all new Alumdoor print forms reuse the exact Purchase Order brand system", () => {
  const purchaseHtml = purchaseOrder.html.join("\n");
  const embeddedLogo = purchaseHtml.match(/data:image\/png;base64,([^\"]+)/)?.[1];
  assert.ok(embeddedLogo, "mẫu Purchase Order chuẩn phải chứa logo gốc");
  assert.equal(
    createHash("sha256").update(logo).digest("hex"),
    createHash("sha256").update(Buffer.from(embeddedLogo, "base64")).digest("hex"),
    "asset logo dùng chung phải giống từng byte với logo Purchase Order chuẩn",
  );

  for (const format of sidecar.prints) {
    const css = format.css.join("\n");
    const html = format.html.join("\n");
    assert.match(css, /padding:23\.7mm 8mm 8mm/);
    assert.match(css, /\.letterhead\{position:relative;width:194mm;height:17mm;margin-left:0;overflow:hidden\}/);
    assert.match(css, /\.brand-logo\{position:absolute;left:0;top:1\.35mm;width:74mm;height:auto\}/);
    assert.match(css, /\.company-header-img\{position:absolute;right:-13\.5mm;top:0;width:114\.3mm;height:auto;display:block\}/);
    assert.match(css, /\.title\{width:194mm;font-family:Arial,'Liberation Sans',sans-serif;font-size:18px;line-height:1\.2;font-weight:700;color:#f15a24;text-transform:uppercase;text-align:center;margin:5mm 0 6mm\}/);
    assert.match(html, /class="brand-logo" src="\/alumdoor-order-logo\.png" alt="ALUMDOOR"/);
    assert.match(html, /class="company-header-img" src="\/alumdoor-company-header\.png"/);
    assert.doesNotMatch(html, /brand-logo-text|brand-tagline/);
    assert.ok(html.indexOf("class=\"letterhead\"") < html.indexOf("class=\"title\""));
    assert.ok(html.indexOf("class=\"title\"") < html.indexOf("class=\"meta\""));
    assert.ok(html.indexOf("class=\"meta\"") < html.indexOf("<table>"));
    assert.ok(html.indexOf("<table>") < html.indexOf("class=\"sign\""));
  }
});
