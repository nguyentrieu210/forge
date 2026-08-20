#!/usr/bin/env node
/**
 * Gom TOÀN BỘ hệ số quy đổi đơn vị có thật trong nguồn, rồi đo xem chúng phủ được bao nhiêu
 * phần của danh mục.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO PHẢI ĐẾM LẠI: kế hoạch đang đứng trên một con số không có nguồn
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ALUMDOOR-AUDIT-VONG-2-KET-QUA.md` §6 đợt A ghi:
 *
 *     "DANH-MỤC.md → uom_conversions cho ~540 mặt hàng"
 *
 * Đếm thật trên nguồn: `DANH-MỤC.md` có **63 dòng sản phẩm**, trong đó **20 dòng có GHI CHÚ**
 * và **19 hệ số** đọc ra được. Không có 540 dòng nào để cho.
 *
 * Con số 540 đến từ `§5.3`: *"`uom_conversions` chỉ có ở 20/566 mặt hàng"* — tức **kích thước
 * lỗ hổng**, không phải **lượng nguồn cung**. Hai đại lượng khác nhau bị dùng lẫn, và kế hoạch
 * thi hành thừa hưởng luôn chỗ lẫn đó.
 *
 * Đây đúng loại lỗi mà chính vòng 2 đặt ra để tránh (§0: *"bốn nguồn nhất trí không phải bằng
 * chứng khi chúng cùng một gốc"*) — lần này không phải bốn nguồn cùng gốc, mà là một con số bị
 * đọc sai vai.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BA NGUỒN CÓ THẬT — và chỉ ba
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   A. `ms-lien/DANH-MỤC.md` cột GHI CHÚ        → 19 hệ số, nhiều kiểu đơn vị
 *   B. `data/trong-luong-nhom.json`             → 40 bản ghi kg/mét dài
 *   C. `BANG-GIA-CHINH-THUC-31-07-2026.md` §1   → 15 mã cửa Đức, cột "TL kg/m² ±8%"
 *
 * Nguồn B và C ĐO HAI ĐẠI LƯỢNG KHÁC NHAU dù cùng đơn vị khối lượng:
 *
 *   B là **kg trên mét dài của một cây nhôm** — dùng quy đổi mua (Kg) sang tồn (Mét).
 *   C là **kg trên mét vuông của cửa thành phẩm** — dùng ước lượng vật tư, KHÔNG phải quy đổi
 *     ĐVT, vì thành phẩm tồn theo Bộ.
 *
 * Chính `data/trong-luong-nhom.json` mở đầu bằng ghi chú giải thích nhầm lẫn này: khách nói
 * "kg/m2" nhưng dữ liệu là kg/mét dài, chứng minh bằng `RHU100 = 1,419` (ray là thanh thẳng,
 * không ai tính ray theo m²). Bộ này giữ nguyên hai nhóm tách bạch — trộn chúng là sai tồn kho
 * gần sáu lần.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ĐỌC-CHỈ. Không ghi D1, không sinh payload nhập liệu.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Dùng:
 *     node server/scripts/build-alumdoor-uom-conversion-catalog.mjs <out.json> [report.json]
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  parseAlumdoorIndexedMarkdownRows,
  readAlumdoorCell,
} from "./lib/alumdoor-source-markdown.mjs";
import { parseConversionNote } from "./lib/alumdoor-uom-conversion-parser.mjs";
import { PRODUCT } from "./extract-alumdoor-danh-muc-source.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");

const DANH_MUC_PATH = resolve(REPO_ROOT, "apps/alumdoor/docs/nguon/ms-lien/DANH-MỤC.md");
const WEIGHT_PATH = resolve(REPO_ROOT, "data/trong-luong-nhom.json");
const PRICE_LIST_PATH = resolve(
  REPO_ROOT,
  "apps/alumdoor/docs/nguon/BANG-GIA-CHINH-THUC-31-07-2026.md",
);

const clean = (value) => String(value ?? "").trim();

/* ────────────────────────────── Nguồn A — GHI CHÚ ────────────────────────────── */

async function readDanhMucFactors() {
  const rows = parseAlumdoorIndexedMarkdownRows(await readFile(DANH_MUC_PATH, "utf8"));
  const out = [];
  const unresolved = [];
  for (const row of rows) {
    if (row.source_row < PRODUCT.FIRST_DATA_ROW) continue;
    const note = readAlumdoorCell(row, PRODUCT.NOTE);
    if (!note) continue;
    const salesCode = readAlumdoorCell(row, PRODUCT.SALES_CODE) || null;
    const purchaseCode = readAlumdoorCell(row, PRODUCT.PURCHASE_CODE) || null;
    const parsed = parseConversionNote(note);
    if (parsed.unresolved) {
      unresolved.push({
        source: "DANH-MỤC.md",
        source_row: row.source_row,
        sales_code: salesCode,
        purchase_code: purchaseCode,
        note,
      });
      continue;
    }
    for (const factor of parsed.factors) {
      out.push({
        basis: "uom_conversion",
        source: "apps/alumdoor/docs/nguon/ms-lien/DANH-MỤC.md",
        source_row: row.source_row,
        sales_code: salesCode,
        purchase_code: purchaseCode,
        profile: null,
        supplier_code: null,
        from_uom: factor.from_uom,
        to_uom: factor.to_uom,
        factor: factor.factor,
        kind: factor.kind,
        source_text: factor.source_text,
      });
    }
  }
  return { factors: out, unresolved };
}

/* ──────────────────────── Nguồn B — kg trên MÉT DÀI ──────────────────────── */

/**
 * `kg_per_m` đọc là "1 Mét cây nhôm nặng `kg_per_m` Kg". Đây là quy đổi ĐVT thật: mặt hàng mua
 * theo Kg, tồn theo Mét.
 *
 * `item_code` trống nghĩa là CHƯA khớp được về mã trong app — ghi chú đầu file nguồn nói thẳng
 * *"để trống nghĩa là CHƯA khớp được — phải hỏi khách, không đoán"*. Giữ nguyên trạng thái đó,
 * xếp vào `needs_item_mapping` chứ không tự gán.
 */
async function readAluminiumWeights() {
  const source = JSON.parse(await readFile(WEIGHT_PATH, "utf8"));
  const factors = [];
  const needsMapping = [];
  for (const row of source.weights ?? []) {
    const kgPerM = Number(row.kg_per_m);
    if (!Number.isFinite(kgPerM) || kgPerM <= 0) continue;
    const entry = {
      basis: "uom_conversion",
      source: "data/trong-luong-nhom.json",
      source_row: null,
      sales_code: null,
      purchase_code: null,
      profile: clean(row.profile) || null,
      supplier_code: clean(row.supplier_code) || null,
      from_uom: "Mét",
      to_uom: "Kg",
      factor: kgPerM,
      kind: "weight_per_length",
      source_text: `${row.supplier_code} = ${kgPerM} kg/m`,
    };
    if (clean(row.item_code)) {
      factors.push({ ...entry, sales_code: clean(row.item_code) });
    } else {
      needsMapping.push(entry);
    }
  }
  return { factors, needsMapping };
}

/* ─────────────────── Nguồn C — kg trên MÉT VUÔNG cửa thành phẩm ─────────────────── */

/**
 * Bảng §1 của bảng giá có mộc: cột `TL kg/m² ±8%` cho 15 mã nhôm cửa Đức.
 *
 * KHÔNG phải hệ số quy đổi ĐVT. Cửa thành phẩm tồn theo Bộ, không tồn theo Kg — không có
 * chuyển đổi Kg↔Bộ nào ở đây. Đây là **barem mua** (`Item.purchase_kg_per_m2` đã có sẵn field),
 * dùng ước lượng khối lượng nhôm cần đặt cho một diện tích cửa.
 *
 * Tách hẳn khỏi nhóm quy đổi để không ai lỡ tay nạp nó vào `uom_conversions`. Dung sai ±8%
 * cũng nói rõ nó không đủ chặt để làm hệ số kho.
 */
async function readPurchaseBarem() {
  const text = await readFile(PRICE_LIST_PATH, "utf8");
  const afterHeading = text.split(/^##\s+1\.\s+/mu)[1];
  if (!afterHeading) throw new Error("BANG-GIA-CHINH-THUC: không tìm thấy mục 1 (cửa cuốn khe thoáng)");
  // Cắt tại tiêu đề mục kế tiếp. Không cắt thì bảng §2..§6 và bảng phụ kiện cũng lọt vào —
  // ra 23 dòng thay vì 15, và 8 dòng thừa mang số của đại lượng khác.
  const section = afterHeading.split(/^##\s+/mu)[0];
  const out = [];
  for (const line of section.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map(clean);
    if (cells.length < 6) continue;
    const code = cells[0].replace(/🆕/gu, "").trim();
    if (!code || code === "Mã" || /^-+$/.test(code)) continue;
    const kgPerSqm = Number(cells[2]);
    const leafWidthMm = Number(cells[4]);
    if (!Number.isFinite(kgPerSqm) || kgPerSqm <= 0) continue;
    out.push({
      basis: "purchase_barem",
      source: "apps/alumdoor/docs/nguon/BANG-GIA-CHINH-THUC-31-07-2026.md §1",
      profile: code,
      kg_per_sqm: kgPerSqm,
      leaf_width_mm: Number.isFinite(leafWidthMm) ? leafWidthMm : null,
      tolerance_pct: 8,
      source_text: `${code}: TL ${kgPerSqm} kg/m² ±8%`,
    });
  }
  return out;
}

/* ────────────────────────────── Đo độ phủ ────────────────────────────── */

/**
 * Danh sách mặt hàng đang sống. Đọc D1 read-only nếu có; không có thì bỏ qua và nói rõ trong
 * báo cáo là chưa đo được — KHÔNG lấy con số 566 trong tài liệu làm mẫu số, vì đó lại là một
 * con số chép từ chỗ khác.
 */
async function readLiveItemCodes() {
  const d1Path = process.env.ALUMDOOR_D1_PATH || resolve(
    REPO_ROOT,
    "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject",
  );
  if (!existsSync(d1Path)) return null;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const { readdirSync, statSync } = await import("node:fs");
    const file = statSync(d1Path).isDirectory()
      ? readdirSync(d1Path)
          .filter((name) => name.endsWith(".sqlite"))
          .map((name) => resolve(d1Path, name))[0]
      : d1Path;
    if (!file) return null;
    const db = new DatabaseSync(file, { readOnly: true });
    const tenant = process.env.ALUMDOOR_TENANT || "demo";
    const rows = db
      .prepare(
        "SELECT name, json_extract(payload_json,'$.stock_uom') AS stock_uom, " +
          "json_extract(payload_json,'$.default_purchase_uom') AS purchase_uom, " +
          "json_extract(payload_json,'$.uom_conversions') AS conversions " +
          "FROM documents WHERE tenant_id=? AND doctype='Item'",
      )
      .all(tenant);
    db.close();
    return rows.map((row) => ({
      item_code: row.name,
      stock_uom: row.stock_uom,
      purchase_uom: row.purchase_uom,
      conversion_count: (() => {
        try {
          return JSON.parse(row.conversions ?? "[]").length;
        } catch {
          return 0;
        }
      })(),
    }));
  } catch {
    return null;
  }
}

function buildCoverage(factors, liveItems) {
  const covered = new Set(factors.map((row) => row.sales_code).filter(Boolean));
  if (!liveItems) {
    return {
      measured: false,
      reason:
        "Không đọc được D1 local. Độ phủ chỉ đo được trên máy có state Wrangler; " +
        "đừng thay bằng con số chép từ tài liệu.",
      factor_item_count: covered.size,
    };
  }
  const liveCodes = new Set(liveItems.map((row) => row.item_code));
  const matched = [...covered].filter((code) => liveCodes.has(code));
  const orphan = [...covered].filter((code) => !liveCodes.has(code));
  const needsConversion = liveItems.filter(
    (row) => row.purchase_uom && row.stock_uom && row.purchase_uom !== row.stock_uom,
  );
  return {
    measured: true,
    live_item_count: liveItems.length,
    live_items_with_conversion: liveItems.filter((row) => row.conversion_count > 0).length,
    live_items_needing_conversion: needsConversion.length,
    factor_item_count: covered.size,
    factor_items_matched: matched.length,
    factor_items_orphan: orphan.length,
    orphan_codes: orphan.sort((a, b) => a.localeCompare(b, "vi")),
  };
}

/* ────────────────────────────── main ────────────────────────────── */

async function main() {
  const [outPath, reportPath] = process.argv.slice(2);
  if (!outPath) {
    throw new Error(
      "Usage: node server/scripts/build-alumdoor-uom-conversion-catalog.mjs <out.json> [report.json]",
    );
  }

  const danhMuc = await readDanhMucFactors();
  const weights = await readAluminiumWeights();
  const barem = await readPurchaseBarem();
  const liveItems = await readLiveItemCodes();

  const factors = [...danhMuc.factors, ...weights.factors];
  const coverage = buildCoverage(factors, liveItems);

  const summary = {
    factor_count: factors.length,
    factor_from_danh_muc: danhMuc.factors.length,
    factor_from_aluminium_weight: weights.factors.length,
    purchase_barem_count: barem.length,
    needs_item_mapping_count: weights.needsMapping.length,
    unresolved_note_count: danhMuc.unresolved.length,
    coverage,
  };

  const payload = {
    format: "alumdoor-uom-conversion-catalog/v1",
    "//": [
      "Ba nguồn, hai loại đại lượng khác nhau — đọc phần đầu file script trước khi dùng.",
      "`factors` là quy đổi ĐVT thật, nạp được vào Item.uom_conversions.",
      "`purchase_barem` là kg/m² cửa thành phẩm — KHÔNG phải quy đổi ĐVT, đừng nạp vào đó.",
      "`needs_item_mapping` là cây nhôm chưa khớp được về mã trong app; nguồn dặn không đoán.",
      "`unresolved_notes` là ghi chú CÓ ý khai hệ số mà máy không đọc ra — phải hỏi xưởng.",
    ],
    summary,
    factors,
    purchase_barem: barem,
    needs_item_mapping: weights.needsMapping,
    unresolved_notes: danhMuc.unresolved,
  };

  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  if (reportPath) {
    await writeFile(
      reportPath,
      `${JSON.stringify({ format: "alumdoor-uom-conversion-catalog-report/v1", summary }, null, 2)}\n`,
      "utf8",
    );
  }

  console.log(
    `ALUMDOOR_UOM_CONVERSION_CATALOG_PASS factors=${summary.factor_count} ` +
      `danh_muc=${summary.factor_from_danh_muc} nhom=${summary.factor_from_aluminium_weight} ` +
      `barem=${summary.purchase_barem_count} need_mapping=${summary.needs_item_mapping_count} ` +
      `unresolved=${summary.unresolved_note_count}`,
  );
  if (coverage.measured) {
    console.log(
      `ALUMDOOR_UOM_CONVERSION_COVERAGE live=${coverage.live_item_count} ` +
        `have_conversion=${coverage.live_items_with_conversion} ` +
        `need_conversion=${coverage.live_items_needing_conversion} ` +
        `matched=${coverage.factor_items_matched} orphan=${coverage.factor_items_orphan}`,
    );
  } else {
    console.log(`ALUMDOOR_UOM_CONVERSION_COVERAGE skipped=${JSON.stringify(coverage.reason)}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { readDanhMucFactors, readAluminiumWeights, readPurchaseBarem, buildCoverage };
