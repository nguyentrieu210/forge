#!/usr/bin/env node
/**
 * Read-only, fail-closed gate for the local Alumdoor catalog import.
 *
 * This script never discovers a cloud database and never opens SQLite for writing. The caller
 * must pass the exact Miniflare D1 path proven from the running local process.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { evaluateSourceAppPackages } from "./lib/alumdoor-import-gate-apps.mjs";
import { evaluateBomProjection, evaluateBomRuleCoverage } from "./lib/alumdoor-import-gate-bom.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const EXPECTED_SOURCES = Object.freeze({
  "25.7 QUY TRÌNH (2).docx": "0397A208844ED5C8AD6AC75DE48693582AA9E0A40B2086A5F3FC24B9AC250228",
  "danh mục sản phẩm.xlsx": "1C2044A4DE98EFD16F66715ECB96151CA8F073F9A6E7D07A2FEA5FFA52DAA95F",
  "MS LIÊN BS.xlsx": "64820A840AA22D763875930D13095076A2A3F33D9FA7027E3263D8A7D4EE2E41",
  "QUY CÁCH  (3).xlsx": "37423D7702C9BF44FB3078AE69776C603072367C469A3BB134C0831C65FC1A32",
  "TỒN NHÔM 2026 NEW (1).xlsx": "C2E6C8FA2A64DD36BA8EC3F8F64926ACFC72529EF609F737EFD00E077CA2E20C",
});
/**
 * Ô nguồn tự mâu thuẫn, và tên vật tư chưa rõ vòng đời.
 *
 * Trước đây hai mục này là mảng chuỗi và cổng đếm độ dài. Hệ quả: một mục đã được chủ xưởng
 * giải quyết vẫn tiếp tục chặn cho tới khi có người xoá tay khỏi mảng — và khi xoá thì không
 * còn dấu vết vì sao nó từng ở đó. `LONG ĐỀN` và `HOA KHẾ` đã có mã chạy trong D1 nhiều ngày
 * mà vẫn bị đếm là thiếu; ngược lại, ai đó xoá nhầm một dòng là mất luôn cả câu hỏi.
 *
 * Nên giữ nguyên mục, thêm phần giải quyết, và KHÔNG tin vào lời chú thích:
 *   - vòng đời: khai mã đã thay thế, cổng tự kiểm mã đó có thật và còn dùng được không.
 *     Ai vô hiệu hoá mã ấy về sau thì blocker sống lại — đúng như phải thế.
 *   - ô mâu thuẫn: nguồn nằm trong bảng tính chứ không trong D1 nên không kiểm bằng truy vấn
 *     được; đòi hồ sơ quyết định có thật và băm SHA-256 khớp, cùng chuẩn đang áp cho
 *     owner-overrides.
 */
const SOURCE_CONFLICT_CELLS = Object.freeze([
  { cell: "ĐM!G1088/I1088", resolved_by: "ALUMDOOR-QD-20260822#QĐ-1", note: "Số ở cột Định mức là kết quả tính cho một cỡ cửa cụ thể; lấy công thức ở cột I." },
  { cell: "ĐM!G1089/I1089", resolved_by: "ALUMDOOR-QD-20260822#QĐ-1", note: "Như G1088." },
  { cell: "ĐM!G1184/I1184", resolved_by: "ALUMDOOR-QD-20260822#QĐ-2", note: "Không mâu thuẫn: cột G là hệ số cân 4,4 kg/m, cột I là công thức chiều dài." },
  { cell: "ĐM!G1192/I1192", resolved_by: "ALUMDOOR-QD-20260822#QĐ-2", note: "Như G1184." },
  { cell: "ĐM!G1212/I1212", resolved_by: "ALUMDOOR-QD-20260822#QĐ-2", note: "Như G1184; riêng nhãn ĐVT ở dòng này ghi KG thay vì KG/M — lỗi nhãn trong nguồn." },
  { cell: "ĐM!G1254/I1254", resolved_by: "ALUMDOOR-QD-20260822#QĐ-5", note: "Công thức bị chép từ dòng 1257 (tôn 8D) mà quên đổi hệ số; tôn 6D là 8,2 kg/m². Nguồn vẫn cần sửa." },
]);
const LIFECYCLE_GAPS = Object.freeze([
  { name: "TP-PULYDEN 114N", resolved_item: "PKDUC_PULY_114N", resolved_by: "ALUMDOOR-QD-20260822#QĐ-6", note: "Tên trong danh sách bị sai chính tả; nguồn ghi TP-PULY 114N \"PULY 114 NHỎ\" (danh mục sản phẩm.xlsx dòng 145)." },
  { name: "TP-PULYDEN 114L", resolved_item: "PKDUC_PULY_114L", resolved_by: "ALUMDOOR-QD-20260822#QĐ-6", note: "Như trên, dòng 146: TP-PULY 114L \"PULY 114 LỚN\"." },
  { name: "LONG ĐỀN", resolved_item: "LKMT_LONGDEN", resolved_by: "ALUMDOOR-QD-20260822" },
  { name: "HOA KHẾ", resolved_item: "LKMT_HOAKHE", resolved_by: "ALUMDOOR-QD-20260822" },
  { name: "CỐT TRỤC 140", resolved_item: "LKMT_COT", resolved_by: "ALUMDOOR-QD-20260822#QĐ-4", note: "Chủ xưởng: cốt và trục là hai mặt hàng khác nhau. Trục 140 đã có RT_TR140." },
]);
/**
 * Ô công thức hỏng đã mở tận nơi và phân loại.
 *
 * File nguồn làm trên Google Sheets rồi tải về .xlsx. Excel không có hàm mảng động của
 * Google Sheets nên chúng xuất ra thành `__xludf.DUMMYFUNCTION(…)` kèm giá trị lỗi đóng
 * băng. Đếm chúng như lỗi dữ liệu là đếm nhầm: `ĐM!C1925` chỉ là bảng chiếu lại dữ liệu
 * đã nằm sẵn ở dòng 34–382, không mất cấu kiện nào.
 *
 * Hai ô còn lại là lỗi nhập liệu thật và vẫn chặn: một ô đơn giá bị gõ chữ "tính lại", và
 * một ô tự trỏ vào chính nó. Cả hai nằm ở sổ bán hàng nên không hỏng danh mục, nhưng hỏng
 * sổ — giữ chặn cho tới khi xưởng sửa file.
 */
const FORMULA_ERRORS_RESOLVED = Object.freeze({
  "MS LIÊN BS.xlsx!ĐM!C1925": "ALUMDOOR-QD-20260822#o-cong-thuc",
  "MS LIÊN BS.xlsx!ĐM!C1983": "ALUMDOOR-QD-20260822#o-cong-thuc",
  "MS LIÊN BS.xlsx!BCKQKD!M21": "ALUMDOOR-QD-20260822#o-cong-thuc",
  "MS LIÊN BS.xlsx!BCKQKD!M24": "ALUMDOOR-QD-20260822#o-cong-thuc",
});
const DECISION_ARTIFACTS = Object.freeze({
  "ALUMDOOR-QD-20260822": { artifact: "docs/decisions/ALUMDOOR-QUYET-DINH-CHU-XUONG-20260822.md", sha256: "41a37150a146967c5783e349d7ecfc3f98ff81d4fa5f8926ff7d642ee3f0f9ab" },
});
const REQUIRED_SOURCE_APP_IDS = Object.freeze(["alumdoor", "alumdoor-attendance", "hrm", "vn-accounting"]);
const FORBIDDEN = new Set(["--apply", "--execute", "--fix", "--import", "--migrate", "--deploy"]);

const args = parseArgs(process.argv.slice(2));
for (const token of process.argv.slice(2)) if (FORBIDDEN.has(token)) throw new Error(`${token} is forbidden: this gate is read-only`);
if (!args.d1) throw new Error("usage: audit-alumdoor-import-gate-local.mjs --d1 <exact-miniflare.sqlite> [--backup <sqlite>] [--tenant demo] [--source-root <folder>] [--app-package-dir <folder>] [--output <json>]");

const databasePath = path.resolve(args.d1);
if (!existsSync(databasePath) || statSync(databasePath).size <= 0) throw new Error(`D1 does not exist or is empty: ${databasePath}`);
const sourceRoot = path.resolve(args.sourceRoot || "C:/Users/Admin/Downloads/New folder (3)");
const appPackageDir = path.resolve(args.appPackageDir || path.join(ROOT, "work/source-packages-current"));
const tenant = args.tenant || "demo";
const clean = (value) => String(value ?? "").normalize("NFC").trim();
const truthy = (value) => value === true || value === 1 || value === "1" || ["true", "yes", "có", "co"].includes(clean(value).toLocaleLowerCase("vi"));
const parseJson = (value, fallback = {}) => { try { const parsed = JSON.parse(String(value ?? "")); return parsed && typeof parsed === "object" ? parsed : fallback; } catch { return fallback; } };
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex").toUpperCase();
const runtimeShaBefore = sha256(databasePath);
const keyOf = (doctype, name) => `${doctype}\u0000${name}`;

const sourceHashes = Object.entries(EXPECTED_SOURCES).map(([name, expected]) => {
  const file = path.join(sourceRoot, name);
  const actual = existsSync(file) ? sha256(file) : "";
  return { name, file, expected, actual, ok: actual === expected };
});

const db = new DatabaseSync(databasePath, { readOnly: true });
let report;
try {
  const quick = db.prepare("PRAGMA quick_check").all().map((row) => Object.values(row)[0]);
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
  const installed = db.prepare("SELECT version,content_hash,manifest_json FROM installed_apps WHERE tenant_id=? AND app_id='alumdoor'").get(tenant);
  if (!installed) throw new Error(`Alumdoor is not installed for tenant ${tenant}`);
  const installedApps = db.prepare("SELECT app_id,version,content_hash,manifest_json FROM installed_apps WHERE tenant_id=? ORDER BY app_id").all(tenant);
  const sourceApps = evaluateSourceAppPackages({
    candidates: REQUIRED_SOURCE_APP_IDS.map((appId) => ({ expected_id: appId, file: path.join(appPackageDir, `${appId}.json`), package_value: readJson(path.join(appPackageDir, `${appId}.json`)) })),
    installedRows: installedApps,
    parseManifest: parseAppManifest,
  });
  const manifest = parseJson(installed.manifest_json, null);
  if (!manifest || !Array.isArray(manifest.doctypes)) throw new Error("Installed Alumdoor manifest is invalid");
  // Link integrity is cross-app (for example Employee → Company). Merge every installed
  // manifest, then let Alumdoor's own declaration win for doctypes it extends.
  const meta = new Map();
  for (const row of db.prepare("SELECT app_id,manifest_json FROM installed_apps WHERE tenant_id=? ORDER BY CASE WHEN app_id='alumdoor' THEN 1 ELSE 0 END, app_id").all(tenant)) {
    const installedManifest = parseJson(row.manifest_json, null);
    for (const doctype of installedManifest?.doctypes ?? []) meta.set(doctype.name, doctype);
  }

  const documents = db.prepare("SELECT doc_key,doctype,name,docstatus,payload_json FROM documents WHERE tenant_id=?").all(tenant)
    .map((row) => ({ layer: "documents", doctype: row.doctype, name: row.name, doc_key: row.doc_key, docstatus: Number(row.docstatus), payload: parseJson(row.payload_json), disabledColumn: 0 }));
  const masters = db.prepare("SELECT record_type AS doctype,name,disabled,data_json FROM master_records WHERE tenant_id=?").all(tenant)
    .map((row) => ({ layer: "master_records", doctype: row.doctype, name: row.name, doc_key: "", docstatus: 0, payload: parseJson(row.data_json), disabledColumn: Number(row.disabled ?? 0) }));
  const documentByKey = new Map(documents.map((row) => [keyOf(row.doctype, row.name), row]));
  const masterByKey = new Map(masters.map((row) => [keyOf(row.doctype, row.name), row]));
  const union = new Map(masterByKey);
  for (const [key, row] of documentByKey) union.set(key, row); // documents are precedence/tombstone authority
  const active = (row) => row.layer === "documents"
    ? row.docstatus !== 2 && !truthy(row.payload.disabled)
    : !truthy(row.disabledColumn) && !truthy(row.payload.disabled);

  const overlaps = [...documentByKey.keys()].filter((key) => masterByKey.has(key));
  const conflicts = overlaps.flatMap((key) => {
    const document = documentByKey.get(key);
    const master = masterByKey.get(key);
    const left = comparablePayload(meta, document.doctype, document.payload, active(document));
    const right = comparablePayload(meta, master.doctype, master.payload, active(master));
    return stable(left) === stable(right) ? [] : [{ doctype: document.doctype, name: document.name, document: left, master: right }];
  });

  const linkFindings = [];
  const linkSeen = new Set();
  const inspectLink = (source, fieldPath, targetType, value) => {
    const targetName = clean(value);
    if (!targetName) return;
    const id = `${source.doctype}\u0000${source.name}\u0000${fieldPath}\u0000${targetType}\u0000${targetName}`;
    if (linkSeen.has(id)) return;
    linkSeen.add(id);
    const target = union.get(keyOf(targetType, targetName));
    if (!target) linkFindings.push({ state: "MISSING", source_doctype: source.doctype, source_name: source.name, field: fieldPath, target_doctype: targetType, target_name: targetName });
    else if (!active(target)) linkFindings.push({ state: "INACTIVE", source_doctype: source.doctype, source_name: source.name, field: fieldPath, target_doctype: targetType, target_name: targetName, target_layer: target.layer });
  };
  const inspectPayload = (source, doctype, payload, prefix = "") => {
    const doctypeMeta = meta.get(doctype);
    if (!doctypeMeta) return;
    for (const field of doctypeMeta.fields ?? []) {
      const fieldname = clean(field.fieldname);
      if (!fieldname) continue;
      const fieldPath = prefix ? `${prefix}.${fieldname}` : fieldname;
      if (field.fieldtype === "Link" && field.options) inspectLink(source, fieldPath, field.options, payload?.[fieldname]);
      if (field.fieldtype === "Table" && field.options && Array.isArray(payload?.[fieldname])) {
        payload[fieldname].forEach((row, index) => inspectPayload(source, field.options, row, `${fieldPath}[${index}]`));
      }
    }
  };
  for (const row of union.values()) if (active(row)) inspectPayload(row, row.doctype, row.payload);

  const childRows = db.prepare("SELECT parent_key,fieldname,child_doctype,row_id,payload_json FROM document_children WHERE tenant_id=?").all(tenant);
  const childrenByParentField = new Map();
  for (const row of childRows) {
    const key = `${row.parent_key}\u0000${row.fieldname}`;
    if (!childrenByParentField.has(key)) childrenByParentField.set(key, []);
    childrenByParentField.get(key).push(row);
    const parent = documents.find((entry) => entry.doc_key === row.parent_key);
    if (parent && active(parent)) inspectPayload(parent, row.child_doctype, parseJson(row.payload_json), `${row.fieldname}{${row.row_id}}`);
  }
  const childMismatches = [];
  for (const document of documents) {
    if (!active(document)) continue;
    const doctypeMeta = meta.get(document.doctype);
    for (const field of doctypeMeta?.fields ?? []) {
      if (field.fieldtype !== "Table") continue;
      const payloadCount = Array.isArray(document.payload?.[field.fieldname]) ? document.payload[field.fieldname].length : 0;
      const childCount = (childrenByParentField.get(`${document.doc_key}\u0000${field.fieldname}`) ?? []).length;
      if (payloadCount !== childCount) childMismatches.push({ doctype: document.doctype, name: document.name, field: field.fieldname, payload_count: payloadCount, child_count: childCount });
    }
  }

  const itemRows = [...union.values()].filter((row) => row.doctype === "Item" && active(row));
  const invalidConversions = [];
  const missingDefaultConversions = [];
  const normalizedUom = (value) => clean(value).toLocaleLowerCase("vi").replaceAll("²", "2").replaceAll(" ", "");
  for (const item of itemRows) {
    const stock = clean(item.payload.stock_uom);
    const conversions = Array.isArray(item.payload.uom_conversions) ? item.payload.uom_conversions : [];
    for (const [index, conversion] of conversions.entries()) {
      if (!(Number(conversion?.conversion_factor) > 0)) invalidConversions.push({ item_code: item.name, row: index + 1, uom: clean(conversion?.uom), conversion_factor: conversion?.conversion_factor ?? null });
    }
    const byUom = new Set(conversions.filter((row) => Number(row?.conversion_factor) > 0).map((row) => normalizedUom(row.uom)));
    for (const field of ["default_purchase_uom", "default_sales_uom"]) {
      const uom = clean(item.payload[field]);
      const dynamicAreaToSet = clean(item.payload.inventory_mode) === "Thành phẩm theo m2"
        && ["m2", "m²", "sqm"].includes(normalizedUom(uom))
        && ["bộ", "bo", "set"].includes(normalizedUom(stock));
      if (dynamicAreaToSet) continue;
      if (uom && normalizedUom(uom) !== normalizedUom(stock) && !byUom.has(normalizedUom(uom))) {
        missingDefaultConversions.push({ item_code: item.name, field, uom, stock_uom: stock });
      }
    }
  }

  const placeholderPrices = [...union.values()].filter((row) => row.doctype === "Item Price" && active(row)
    && clean(row.payload.price_variant) === "TAM_CHUA_CHOT").map((row) => ({ name: row.name, item_code: clean(row.payload.item_code), rate: row.payload.rate }));
  const supplierItems = [...union.values()].filter((row) => row.doctype === "Supplier Item" && active(row)).length;

  const bomPayload = readJson(path.join(ROOT, "local-imports/alumdoor-canonical-bom-payload.json"));
  const bomRuleAudit = readJson(path.join(ROOT, "local-imports/alumdoor-bom-rules/alumdoor-bom-rules-audit.json"));
  const ownerOverrides = readJson(path.join(ROOT, "local-imports/alumdoor-bom-rules/owner-overrides.json"));
  const unverifiedOwnerOverrides = (ownerOverrides?.overrides ?? []).filter((entry) => {
    const evidence = entry?.evidence;
    return !(evidence && typeof evidence === "object" && clean(evidence.id) && clean(evidence.artifact) && /^[a-f0-9]{64}$/i.test(clean(evidence.sha256)));
  });
  /*
   * Một mục chỉ được coi là đã giải quyết khi CHỨNG MINH ĐƯỢC ngay tại đây, không phải khi
   * có người ghi chú là xong:
   *   - vòng đời: mã thay thế phải tồn tại và còn dùng được trong chính D1 đang xét.
   *     Vô hiệu hoá mã ấy sau này là blocker sống lại, không cần ai nhớ mà bật tay.
   *   - ô mâu thuẫn: hồ sơ quyết định phải có thật và băm SHA-256 khớp hằng số đã ghim.
   *     Sửa hồ sơ sau lưng là băm lệch và mục đó chặn trở lại.
   */
  const quyetDinh = (id) => {
    const ref = DECISION_ARTIFACTS[String(id ?? "").split("#")[0]];
    if (!ref) return null;
    const file = path.join(ROOT, ref.artifact);
    if (!existsSync(file)) return { ok: false, reason: `thiếu hồ sơ ${ref.artifact}` };
    const hash = sha256(file);
    if (hash.toLowerCase() !== ref.sha256.toLowerCase()) return { ok: false, reason: `băm hồ sơ ${ref.artifact} lệch` };
    return { ok: true, artifact: ref.artifact, sha256: hash };
  };
  const conflictCells = SOURCE_CONFLICT_CELLS.map((row) => {
    if (!row.resolved_by) return { ...row, resolved: false, reason: "chưa có quyết định" };
    const q = quyetDinh(row.resolved_by);
    return q?.ok ? { ...row, resolved: true, evidence: q } : { ...row, resolved: false, reason: q?.reason ?? "không tra được hồ sơ" };
  });
  const lifecycleGaps = LIFECYCLE_GAPS.map((row) => {
    if (!row.resolved_item) return { ...row, resolved: false, reason: "chưa có mã thay thế" };
    const q = quyetDinh(row.resolved_by);
    if (!q?.ok) return { ...row, resolved: false, reason: q?.reason ?? "không tra được hồ sơ" };
    const item = union.get(keyOf("Item", row.resolved_item));
    if (!item) return { ...row, resolved: false, reason: `mã ${row.resolved_item} không có trong D1` };
    if (!active(item)) return { ...row, resolved: false, reason: `mã ${row.resolved_item} đã ngừng dùng` };
    return { ...row, resolved: true, evidence: q };
  });

  const sourceAudit = readJson(path.join(ROOT, "work/catalog-audit-source/xlsx_audit.json"));
  const formulaErrorsAll = Array.isArray(sourceAudit) ? sourceAudit.flatMap((book) => (book.sheets ?? []).flatMap((sheet) => (sheet.formula_errors ?? []).map((error) => ({ file: book.file, sheet: sheet.name, ...error })))) : [{ file: "xlsx_audit.json", error: "missing audit artifact" }];
  const formulaErrorsClassified = formulaErrorsAll.map((row) => {
    const id = FORMULA_ERRORS_RESOLVED[`${clean(row.file)}!${clean(row.sheet)}!${clean(row.cell)}`];
    if (!id) return { ...row, resolved: false };
    const q = quyetDinh(id);
    return q?.ok ? { ...row, resolved: true, resolved_by: id, evidence: q } : { ...row, resolved: false, reason: q?.reason ?? "không tra được hồ sơ" };
  });
  const formulaErrors = formulaErrorsClassified.filter((row) => !row.resolved);
  /*
   * The source-complete BOM payload deliberately keeps dynamic quantities blank.  Those rows
   * are not unresolved when the BOM Rule projection maps them: a per-order materialized BOM
   * needs geometry before a number can exist.  Counting payload.pending_value_count and
   * rules.rows_pending as two independent blockers therefore double-counted every unresolved
   * source row and also treated valid runtime formulas as broken static quantities.
   *
   * Gate the BOM payload on structural coverage only.  Gate business authority exactly once,
   * through the Rule projection, whose `rows_mapped + rows_pending = component_rows` contract
   * covers both fixed CONSTANT rules and geometry-dependent rules.
   */
  const bomProjection = evaluateBomProjection(bomPayload, bomRuleAudit);
  /*
   * Độ phủ luật số lượng đo TRÊN D1, không lấy `rows_pending` của artifact: artifact là ảnh
   * chụp một lần dựng lại trước (1 279 dòng / 232 BOM) còn D1 đang gác là tập khác hẳn.
   * Giữ số của artifact trong báo cáo làm dấu vết, nhưng chặn thì chặn theo cái đang có thật.
   */
  const DOOR_TYPE_OF_GROUP = Object.freeze({
    "Cửa CN Đức": "Cửa Đức", "Cửa tấm liền Úc": "Cửa tấm liền Úc", "Cửa Đài Loan": "Cửa Đài Loan",
    "Cửa Đài Loan Inox": "Cửa Đài Loan", "Cửa kéo Đài Loan": "Cửa Đài Loan",
    "Cửa Lưới": "Cửa Lưới", "Cửa Siêu Trường": "Cửa Siêu Trường",
  });
  /*
   * `Item.door_type` là nguồn chuẩn, KHÔNG suy từ nhóm hàng. Nhóm "Cửa tấm liền Úc" chứa cả
   * 8 cửa Úc (door_type "Cửa Úc") lẫn 2 cửa Đức AL70 kéo tay (door_type "Cửa tấm liền Úc"),
   * theo đúng tài liệu quy trình. Suy từ nhóm là gán nhầm loại cho cả 10 mã.
   */
  const doorTypeOfItem = (code) => clean(union.get(keyOf("Item", code))?.payload?.door_type);
  const itemGroupOf = (code) => clean(union.get(keyOf("Item", code))?.payload?.item_group);
  const bomCoverage = evaluateBomRuleCoverage({
    boms: [...union.values()].filter((row) => row.doctype === "Bill of Materials" && active(row))
      .map((row) => ({ name: row.name, ...row.payload })),
    itemGroupOf: (code) => doorTypeOfItem(code) || itemGroupOf(code),
    doorTypeOfGroup: (value) => DOOR_TYPE_OF_GROUP[value] ?? value,
    bomRules: [...union.values()].filter((row) => row.doctype === "BOM Rule" && active(row)).map((row) => row.payload),
  });
  // A backup with the right schema/app revision can still be older than the database about to
  // be mutated.  Require a byte-identical copy and a D1 that remained stable for this audit.
  // The safe workflow therefore stops the local runtime, creates the backup, then runs this gate.
  const runtimeShaAfter = sha256(databasePath);
  const runtimeStableDuringGate = runtimeShaBefore === runtimeShaAfter;
  const backup = verifyBackup(args.backup, tenant, installed, runtimeShaAfter, runtimeStableDuringGate);

  const blockers = {
    source_hash_mismatch: sourceHashes.filter((row) => !row.ok).length,
    app_source_stale: sourceApps.stale_count,
    source_formula_error: formulaErrors.length,
    source_authority_conflict: conflictCells.filter((row) => !row.resolved).length,
    source_lifecycle_missing: lifecycleGaps.filter((row) => !row.resolved).length,
    unverified_owner_override: unverifiedOwnerOverrides.length,
    d1_authority_conflict: conflicts.length,
    dangling_reference: linkFindings.filter((row) => row.state === "MISSING").length,
    inactive_reference: linkFindings.filter((row) => row.state === "INACTIVE").length,
    child_storage_mismatch: childMismatches.length,
    invalid_conversion: invalidConversions.length,
    missing_default_conversion: missingDefaultConversions.length,
    placeholder_price: placeholderPrices.length,
    bom_pending: bomProjection.structural_blockers,
    bom_rule_pending: bomCoverage.lines_pending,
    supplier_item_empty: supplierItems === 0 ? 1 : 0,
    backup_unverified: backup.verified ? 0 : 1,
  };
  const go = quick.length === 1 && quick[0] === "ok" && foreignKeys.length === 0
    && Object.values(blockers).every((count) => count === 0);
  report = {
    format: "alumdoor-local-import-gate/v1",
    generated_at: new Date().toISOString(),
    mode: "read-only",
    decision: go ? "GO" : "NO-GO",
    runtime: { tenant, d1_path: databasePath, d1_sha256: runtimeShaAfter, stable_during_gate: runtimeStableDuringGate, app_version: installed.version, app_content_hash: installed.content_hash, installed_apps: installedApps.map(({ manifest_json: _manifest, ...row }) => row), quick_check: quick, foreign_key_violations: foreignKeys.length },
    source: { root: sourceRoot, hashes: sourceHashes, app_package_dir: appPackageDir, app_packages: sourceApps.packages, formula_errors: formulaErrors, formula_errors_resolved: formulaErrorsClassified.filter((row) => row.resolved), unresolved_conflict_cells: conflictCells.filter((row) => !row.resolved), resolved_conflict_cells: conflictCells.filter((row) => row.resolved), lifecycle_gaps: lifecycleGaps.filter((row) => !row.resolved), resolved_lifecycle_gaps: lifecycleGaps.filter((row) => row.resolved) },
    d1: { documents: documents.length, master_records: masters.length, union: union.size, overlap: overlaps.length, conflicts, link_findings: linkFindings, child_mismatches: childMismatches, invalid_conversions: invalidConversions, missing_default_conversions: missingDefaultConversions, placeholder_prices: placeholderPrices, supplier_items: supplierItems },
    payloads: {
      bom_pending: blockers.bom_pending,
      bom_source_value_pending: bomProjection.source_value_pending,
      bom_rule_mapped: bomCoverage.lines_mapped,
      bom_rule_coverage_d1: bomCoverage,
      bom_rule_artifact_pending: bomProjection.rule_rows_pending,
      bom_rule_pending: blockers.bom_rule_pending,
      bom_projection_consistent: bomProjection.projection_consistent,
      unverified_owner_overrides: unverifiedOwnerOverrides,
    },
    backup,
    blockers,
  };
} finally {
  db.close();
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (args.output) writeFileSync(path.resolve(args.output), serialized, "utf8");
process.stdout.write(serialized);
console.log(`ALUMDOOR_LOCAL_IMPORT_GATE_${report.decision} blockers=${Object.values(report.blockers).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)}`);
if (report.decision !== "GO") process.exitCode = 2;

function parseArgs(argv) {
  const out = { d1: "", backup: "", tenant: "demo", sourceRoot: "", appPackageDir: "", output: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (FORBIDDEN.has(token)) continue;
    const key = ({ "--d1": "d1", "--backup": "backup", "--tenant": "tenant", "--source-root": "sourceRoot", "--app-package-dir": "appPackageDir", "--output": "output" })[token];
    if (!key) throw new Error(`unknown argument: ${token}`);
    const value = argv[++index];
    if (!value) throw new Error(`${token} requires a value`);
    out[key] = value;
  }
  return out;
}

function readJson(file) {
  if (!existsSync(file)) return null;
  return parseJson(readFileSync(file, "utf8"), null);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function comparablePayload(meta, doctype, payload, isActive) {
  const system = new Set(["idx", "row_id", "doctype", "name", "owner", "creation", "modified", "modified_by", "docstatus", "status", "version"]);
  const normalizeNested = (value) => {
    if (Array.isArray(value)) return value.map(normalizeNested);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !system.has(key))
      .map(([key, child]) => [key, normalizeNested(child)]));
    if (typeof value === "string") return clean(value);
    return value;
  };
  const specialFields = {
    Account: [{ fieldname: "account_type", fieldtype: "Select" }],
    Currency: [{ fieldname: "currency_scale", fieldtype: "Int", default: 0 }],
    "Fiscal Year": [
      { fieldname: "label", fieldtype: "Data" },
      { fieldname: "year_start_date", fieldtype: "Date" },
      { fieldname: "year_end_date", fieldtype: "Date" },
    ],
  };
  const fields = (meta.get(doctype)?.fields?.length ? meta.get(doctype).fields : specialFields[doctype]) ?? [];
  const out = { __active: isActive };
  for (const field of fields) {
    const name = clean(field.fieldname);
    if (!name) continue;
    let value = payload?.[name];
    if (value === undefined && field.default !== undefined) value = field.default;
    if (field.fieldtype === "Check") value = truthy(value) ? 1 : 0;
    else if (field.fieldtype === "Table") value = Array.isArray(value) ? normalizeNested(value) : [];
    else if (["Int", "Float", "Currency", "Percent"].includes(field.fieldtype) && value !== undefined && value !== "") value = Number(value);
    else if (typeof value === "string") value = clean(value);
    if (value !== undefined && value !== "") out[name] = value;
  }
  return out;
}

function verifyBackup(fileArg, tenant, runtimeInstalled, runtimeSha256, runtimeStableDuringGate) {
  if (!fileArg) return { verified: false, reason: "--backup was not supplied" };
  const file = path.resolve(fileArg);
  if (!existsSync(file) || statSync(file).size <= 0) return { verified: false, file, reason: "backup missing or empty" };
  const backupDb = new DatabaseSync(file, { readOnly: true });
  try {
    const quick = backupDb.prepare("PRAGMA quick_check").all().map((row) => Object.values(row)[0]);
    const foreignKeys = backupDb.prepare("PRAGMA foreign_key_check").all();
    const app = backupDb.prepare("SELECT version,content_hash FROM installed_apps WHERE tenant_id=? AND app_id='alumdoor'").get(tenant);
    const backupSha256 = sha256(file);
    const sha256Match = backupSha256 === runtimeSha256;
    const verified = quick.length === 1 && quick[0] === "ok" && foreignKeys.length === 0
      && app?.version === runtimeInstalled.version && app?.content_hash === runtimeInstalled.content_hash
      && runtimeStableDuringGate && sha256Match;
    let reason = "";
    if (!verified) {
      if (!runtimeStableDuringGate) reason = "runtime D1 changed while the gate was reading it; stop the runtime before pre-import backup verification";
      else if (!sha256Match) reason = "backup is healthy but does not byte-match the current runtime D1";
      else reason = "backup integrity or installed Alumdoor revision differs from runtime";
    }
    return { verified, file, bytes: statSync(file).size, sha256: backupSha256, runtime_sha256: runtimeSha256, sha256_match: sha256Match, runtime_stable_during_gate: runtimeStableDuringGate, quick_check: quick, foreign_key_violations: foreignKeys.length, app_version: app?.version ?? null, app_content_hash: app?.content_hash ?? null, reason };
  } finally {
    backupDb.close();
  }
}
