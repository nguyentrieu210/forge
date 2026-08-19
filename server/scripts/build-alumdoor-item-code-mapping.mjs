#!/usr/bin/env node
/**
 * Sinh bảng ánh xạ mã cũ → mã chuẩn theo `docs/ALUMDOOR-QUY-UOC-MA.md`.
 *
 * CHỈ ĐỌC. Không chạm D1, không gọi API, không đổi một mã nào. Nó tồn tại để biến câu
 * "quy ước mã chưa áp dụng" thành một bảng cụ thể chủ xưởng soát được — vì mã hàng là KHOÁ
 * BẢN GHI, đổi nó là đổi danh tính vĩnh viễn và không ai duyệt được một luật trừu tượng.
 *
 * Dùng:
 *   node server/scripts/build-alumdoor-item-code-mapping.mjs <items.json|-> [out.json] [--markdown out.md]
 *
 * Nguồn `items.json` là mảng Item hoặc payload `alumdoor-item-master-payload/v2`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  ALUMDOOR_CODE_MAX_LENGTH,
  buildCodeMapping,
  violatesCodeConvention,
} from "./lib/alumdoor-item-code-convention.mjs";

const args = process.argv.slice(2);
const [sourceArg, outArg] = args.filter((a) => !a.startsWith("--"));
const markdownIndex = args.indexOf("--markdown");
const markdownOut = markdownIndex >= 0 ? args[markdownIndex + 1] : "";
if (!sourceArg) {
  console.error("Usage: node build-alumdoor-item-code-mapping.mjs <items.json> [out.json] [--markdown out.md]");
  process.exit(2);
}

const raw = JSON.parse(readFileSync(path.resolve(sourceArg), "utf8"));
const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : null;
if (!items) throw new Error("Nguồn phải là mảng Item hoặc payload có khoá `items`");

const mapping = buildCodeMapping(items);
const tooLong = mapping.rows.filter((row) => row.code && row.code.length > ALUMDOOR_CODE_MAX_LENGTH);
const stillInvalid = mapping.rows.filter((row) => row.code && violatesCodeConvention(row.code).length);

const report = {
  format: "alumdoor-item-code-mapping/v1",
  generated_at: new Date().toISOString(),
  convention: "docs/ALUMDOOR-QUY-UOC-MA.md (chốt 2026-07-29)",
  summary: mapping.summary,
  /** Ba nhóm dưới đây là thứ CẦN NGƯỜI QUYẾT, không phải thứ máy làm tiếp được. */
  needs_owner_decision: {
    unresolved_prefix: mapping.unresolved.map((row) => ({
      item_code: row.original, item_group: row.item.item_group ?? "", reason: row.why,
    })),
    too_long: tooLong.map((row) => ({
      item_code: row.original, proposed: row.code, length: row.code.length,
      item_name: row.item.item_name ?? "",
    })),
    still_invalid: stillInvalid
      .filter((row) => row.code.length <= ALUMDOOR_CODE_MAX_LENGTH)
      .map((row) => ({ item_code: row.original, proposed: row.code, problems: violatesCodeConvention(row.code) })),
  },
  /** Gộp là ĐÍCH, không phải lỗi — nhưng phải cố ý, nên liệt kê đủ mã nguồn của mỗi họ. */
  merged_families: mapping.merged
    .sort((a, b) => b[1].length - a[1].length)
    .map(([code, group, safety]) => ({
      canonical: code,
      safe_to_merge: safety.safe,
      reason: safety.reason,
      sources: group.map((row) => row.original),
      dropped: [...new Set(group.flatMap((row) => row.warnings))],
    })),
  mapping: mapping.rows.map((row) => ({
    from: row.original,
    to: row.code,
    prefix: row.prefix,
    why: row.why,
    dropped: row.warnings,
    item_group: row.item.item_group ?? "",
    item_name: row.item.item_name ?? "",
  })),
};

const outPath = path.resolve(outArg || "alumdoor-item-code-mapping.json");
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (markdownOut) {
  const lines = [];
  lines.push("# Bảng ánh xạ mã hàng Alumdoor — cần chủ xưởng soát", "");
  lines.push(`Sinh tự động từ \`${path.basename(sourceArg)}\` theo \`docs/ALUMDOOR-QUY-UOC-MA.md\`.`);
  lines.push("**Chưa đổi mã nào** — đây là đề xuất để soát.", "");
  lines.push(`- Mã nguồn: **${mapping.summary.source_count}**`);
  lines.push(`- Mã chuẩn sau khi gộp: **${mapping.summary.canonical_count}**`);
  lines.push(`- Bị hấp thụ do trùng sau khi bỏ màu/cách bán/bậc: **${mapping.summary.absorbed}** (${mapping.summary.merged_families} họ)`);
  lines.push(`- Chưa suy được tiền tố: **${mapping.summary.unresolved_count}**`);
  lines.push(`- Vượt ${ALUMDOOR_CODE_MAX_LENGTH} ký tự, cần đặt tên tay: **${tooLong.length}**`);
  lines.push(`- ⚠️ Họ CHƯA ĐƯỢC gộp vì cấu phần khác nhau: **${mapping.summary.unsafe_merges}**`, "");
  if (mapping.unresolved.length) {
    lines.push("## Chưa suy được tiền tố", "", "| Mã cũ | Nhóm hàng | Lý do |", "|---|---|---|");
    for (const row of mapping.unresolved) lines.push(`| \`${row.original}\` | ${row.item.item_group ?? ""} | ${row.why} |`);
    lines.push("");
  }
  if (tooLong.length) {
    lines.push(`## Vượt ${ALUMDOOR_CODE_MAX_LENGTH} ký tự — cần chủ xưởng đặt tên ngắn`, "",
      "Máy KHÔNG tự cắt: cắt bừa là bịa ra một cái tên mà xưởng không đọc được.", "",
      "| Mã cũ | Đề xuất | Dài | Tên hàng |", "|---|---|---:|---|");
    for (const row of tooLong) lines.push(`| \`${row.original}\` | \`${row.code}\` | ${row.code.length} | ${row.item.item_name ?? ""} |`);
    lines.push("");
  }
  const unsafe = report.merged_families.filter((f) => !f.safe_to_merge);
  if (unsafe.length) {
    lines.push("## ⚠️ CHƯA ĐƯỢC GỘP — cấu phần khác nhau", "",
      "Gộp mấy họ này là **mất phần trọn bộ**. Đo trên D1 19/08:",
      "`TP-LUOI-SN13x26-STD - TRONBO` có BOM Template **5 cấu phần**, bản `- TACHMON` chỉ có **1**.",
      "",
      "Khi `Sales Package` bị khai tử, fact \"phạm vi cấu phần được giao\" không còn chỗ trên dòng",
      "bán nên nó bò vào MÃ HÀNG. Phải để BOM phân giải theo `sales_mode` trước, rồi mới gộp mã.",
      "", "| Mã chuẩn | Số mã cũ | Lý do | Mã nguồn |", "|---|---:|---|---|");
    for (const family of unsafe) {
      lines.push(`| \`${family.canonical}\` | ${family.sources.length} | ${family.reason} | ${family.sources.map((s) => `\`${s}\``).join(" · ")} |`);
    }
    lines.push("");
  }
  const safe = report.merged_families.filter((f) => f.safe_to_merge);
  lines.push("## Gộp an toàn — chỉ khác màu hoặc nhà cung cấp", "",
    "Đây là ĐÍCH của đợt này: `QUY-UOC-MA §5` nêu chính ví dụ năm mã `AL595` gộp về một.", "",
    "| Mã chuẩn | Số mã cũ | Mã nguồn |", "|---|---:|---|");
  for (const family of safe) {
    lines.push(`| \`${family.canonical}\` | ${family.sources.length} | ${family.sources.map((s) => `\`${s}\``).join(" · ")} |`);
  }
  lines.push("");
  writeFileSync(path.resolve(markdownOut), `${lines.join("\n")}\n`, "utf8");
}

console.log(`ALUMDOOR_ITEM_CODE_MAPPING_PASS ${JSON.stringify(mapping.summary)}`);
console.log(`output=${outPath}${markdownOut ? ` markdown=${path.resolve(markdownOut)}` : ""}`);
