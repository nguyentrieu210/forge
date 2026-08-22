/**
 * Lõi nhập liệu — mở D1 cục bộ và ghi document theo đúng hình dạng bảng.
 *
 * VÌ SAO GHI THẲNG SQL, KHÔNG QUA API
 * Máy này không còn Windows Service của runtime (đã dọn 2026-08-20), nên mọi đường nhập liệu
 * đi qua `http://127.0.0.1:8799` đều phải dựng server trước rồi mới nhập được — mà bản thân
 * việc dựng server lại là thứ hay hỏng nhất. Ghi thẳng vào tệp SQLite thì nhập được cả khi
 * runtime đang tắt, và tắt runtime vốn là điều kiện AN TOÀN để ghi, không phải trở ngại.
 *
 * ĐIỀU KIỆN BẮT BUỘC: runtime phải TẮT khi chạy. Miniflare giữ D1 mở; ghi song song với nó là
 * cách chắc chắn nhất để có hai bản sự thật. `moPhienGhi()` chặn sẵn nếu thấy cổng còn nghe.
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
export const GOC_REPO = resolve(THU_MUC, "..", "..");

export const DUONG_D1 = process.env.ALUMDOOR_D1_PATH || resolve(
  GOC_REPO,
  "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject",
  "0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite",
);

export const TENANT = process.env.ALUMDOOR_TENANT || "demo";
const NGUOI_GHI = "nhap-tung-tang";
const CONG_RUNTIME = [8799, 5173];

const congDangNghe = (cong) => new Promise((ok) => {
  const s = createConnection({ host: "127.0.0.1", port: cong });
  const xong = (ketQua) => { s.destroy(); ok(ketQua); };
  s.setTimeout(400);
  s.on("connect", () => xong(true));
  s.on("timeout", () => xong(false));
  s.on("error", () => xong(false));
});

/**
 * Mở phiên ghi: chặn khi runtime còn sống, sao lưu D1, rồi trả về handle.
 *
 * Sao lưu là BẮT BUỘC chứ không phải tuỳ chọn — một lần ghi sai vào D1 không có nút hoàn tác,
 * và bản sao 12 MB rẻ hơn nhiều so với việc dựng lại toàn bộ thang nhập liệu.
 */
export async function moPhienGhi({ tang }) {
  throw new Error(
    `Bộ nhập legacy '${tang}' đã bị khóa: ghi thẳng D1 bỏ qua authority ledger, cascade và validator. `
    + "Chỉ dùng scripts/local-runner sau khi audit-alumdoor-import-gate-local.mjs trả GO.",
  );
  /* c8 ignore next 35 -- retained only as recovery documentation; unreachable by design */
  if (!existsSync(DUONG_D1)) throw new Error(`Không thấy D1: ${DUONG_D1}`);

  for (const cong of CONG_RUNTIME) {
    if (await congDangNghe(cong)) {
      throw new Error(
        `Cổng ${cong} còn nghe — runtime đang chạy. Tắt worker/Desk rồi chạy lại: ghi song song với miniflare sẽ tạo hai bản sự thật.`,
      );
    }
  }

  const thuMucSaoLuu = resolve(GOC_REPO, "nhap", ".sao-luu");
  mkdirSync(thuMucSaoLuu, { recursive: true });
  const dauThoiGian = new Date().toISOString().replace(/[:.]/g, "-");
  const duongSaoLuu = resolve(thuMucSaoLuu, `d1-truoc-${tang}-${dauThoiGian}.sqlite`);
  copyFileSync(DUONG_D1, duongSaoLuu);

  const db = new DatabaseSync(DUONG_D1);
  return { db, duongSaoLuu, tang };
}

const dem = (db, doctype) => db
  .prepare("SELECT COUNT(*) c FROM documents WHERE tenant_id=? AND doctype=?")
  .get(TENANT, doctype).c;

/**
 * Ghi một lô document cùng doctype, kèm dòng tìm kiếm.
 *
 * Idempotent bằng `ON CONFLICT(tenant_id,doc_key)`: chạy lại lần hai không đẻ bản sao, và chỉ
 * tăng `version` khi payload THỰC SỰ khác — nếu tăng vô điều kiện thì mỗi lần chạy lại sẽ
 * đánh dấu toàn bộ danh mục là "vừa sửa", làm hỏng mọi thứ đọc theo `modified_at`.
 *
 * @param {object} phien   handle từ `moPhienGhi`
 * @param {string} doctype
 * @param {Array<{name: string, payload: object, title?: string, content?: string}>} banGhi
 */
export function ghiLo(phien, doctype, banGhi, { chiThem = false } = {}) {
  const { db } = phien;
  const truoc = dem(db, doctype);
  const luc = new Date().toISOString();

  const chenDoc = db.prepare(`
    INSERT INTO documents
      (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
    VALUES (?,?,?,?,?,0,'Draft',1,?,?,?,?)
    ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
      payload_json=excluded.payload_json,
      modified_at=excluded.modified_at,
      modified_by=excluded.modified_by,
      version=documents.version+1
    WHERE documents.payload_json<>excluded.payload_json
  `);
  /**
   * `chiThem`: thêm bản ghi mới, KHÔNG đụng bản ghi đã có.
   *
   * Dùng cho sổ nhập tay. Ở đó người dùng sửa trực tiếp trong app, còn file JSON chỉ là chỗ
   * agent ghi hộ dòng mới — nên file KHÔNG phải nguồn sự thật. Đè lên bằng nội dung file là
   * xoá âm thầm việc người ta vừa gõ, mà không lệnh nào báo.
   */
  const chenChiThem = db.prepare(`
    INSERT INTO documents
      (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
    VALUES (?,?,?,?,?,0,'Draft',1,?,?,?,?)
    ON CONFLICT(tenant_id,doc_key) DO NOTHING
  `);
  const chenTim = db.prepare(`
    INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
      title=excluded.title, content=excluded.content, modified_at=excluded.modified_at
  `);

  const daCo = new Set(db.prepare("SELECT name FROM documents WHERE tenant_id=? AND doctype=?").all(TENANT, doctype).map((r) => r.name));

  db.exec("BEGIN");
  try {
    for (const { name, payload, title, content } of banGhi) {
      if (!name) throw new Error(`${doctype}: bản ghi thiếu \`name\``);
      const chen = chiThem ? chenChiThem : chenDoc;
      chen.run(TENANT, `${doctype}:${name}`, doctype, name, NGUOI_GHI, luc, luc, NGUOI_GHI, JSON.stringify(payload));
      if (!chiThem || !daCo.has(name)) chenTim.run(TENANT, doctype, name, title ?? name, content ?? title ?? name, luc);
    }
    db.exec("COMMIT");
  } catch (loi) {
    db.exec("ROLLBACK");
    throw loi;
  }

  const sau = dem(db, doctype);
  return { doctype, dinhGhi: banGhi.length, truoc, sau, themMoi: sau - truoc };
}

/** Tên các document đã có của một doctype — dùng để kiểm tra tham chiếu trước khi ghi. */
export function tenDaCo(phien, doctype) {
  return new Set(
    phien.db.prepare("SELECT name FROM documents WHERE tenant_id=? AND doctype=?")
      .all(TENANT, doctype).map((d) => d.name),
  );
}

/**
 * Chặn trước khi ghi: mọi giá trị `dung` phải có mặt trong danh mục `doctype`.
 *
 * Kiểm TRƯỚC khi ghi chứ không sau: một Item trỏ vào đơn vị không tồn tại vẫn ghi được vào
 * SQLite (không có khoá ngoại), nó chỉ vỡ ra ở màn hình khi người dùng mở ô chọn — tức là
 * muộn nhất có thể và xa nhất khỏi nguyên nhân.
 */
export function kiemThamChieu(phien, doctype, dung, nhan) {
  const co = tenDaCo(phien, doctype);
  const thieu = [...new Set(dung)].filter((v) => v && !co.has(v));
  if (thieu.length) {
    throw new Error(`${nhan}: thiếu ${thieu.length} ${doctype} trong D1 → ${thieu.join(", ")}`);
  }
  return co.size;
}


/**
 * XOÁ những bản ghi của một doctype KHÔNG còn trong nguồn.
 *
 * VÌ SAO CẦN
 * `ghiLo` chỉ biết thêm và sửa. Đổi khuôn mã mà không xoá thì D1 giữ cả mã cũ lẫn mã mới — danh
 * mục phình đôi, và mỗi mặt hàng hiện hai lần trên màn hình chọn với hai mã khác nhau. Đó là
 * kiểu hỏng im lặng: không lệnh nào báo lỗi, chỉ có người bán thấy danh sách lạ.
 *
 * CHỈ XOÁ ĐƯỢC KHI CHƯA CÓ CHỨNG TỪ. Hàm này đếm tham chiếu trước; thấy dòng nào trỏ vào bản
 * ghi sắp xoá thì DỪNG, vì xoá mặt hàng đã có tồn kho hay đã lên hoá đơn là làm thủng sổ.
 */
export function xoaMaThua(phien, doctype, tenGiuLai, { bangThamChieu = [] } = {}) {
  const { db } = phien;
  const giu = new Set(tenGiuLai);
  const co = db.prepare("SELECT name FROM documents WHERE tenant_id=? AND doctype=?").all(TENANT, doctype).map((r) => r.name);
  const thua = co.filter((n) => !giu.has(n));
  if (!thua.length) return { doctype, xoa: 0, ten: [] };

  for (const { bang, cot } of bangThamChieu) {
    const q = `SELECT COUNT(*) c FROM ${bang} WHERE ${cot} IN (${thua.map(() => "?").join(",")})`;
    let n = 0;
    try { n = db.prepare(q).get(...thua).c; } catch { n = 0; }
    if (n) throw new Error(`Không xoá được ${thua.length} ${doctype}: còn ${n} dòng trong ${bang}.${cot} trỏ vào. Dọn chứng từ trước.`);
  }

  const xoaDoc = db.prepare("DELETE FROM documents WHERE tenant_id=? AND doctype=? AND name=?");
  const xoaTim = db.prepare("DELETE FROM document_search WHERE tenant_id=? AND doctype=? AND name=?");
  db.exec("BEGIN");
  try {
    for (const n of thua) { xoaDoc.run(TENANT, doctype, n); xoaTim.run(TENANT, doctype, n); }
    db.exec("COMMIT");
  } catch (loi) { db.exec("ROLLBACK"); throw loi; }
  return { doctype, xoa: thua.length, ten: thua };
}


/**
 * ĐIỀN CÁC Ô DO SERVER SUY RA (`fetch_from`) trước khi ghi.
 *
 * VÌ SAO PHẢI CÓ
 * Ghi thẳng vào SQLite là bỏ qua toàn bộ tầng xử lý của app — kể cả phần app tự điền hộ. Trên
 * `Item`, `inventory_mode` khai `fetch_from: "measurement_profile.inventory_mode"` và
 * `serverEnforced: true`: tạo qua giao diện thì app điền, ghi thẳng thì ô rỗng.
 *
 * Ô rỗng đó KHÔNG kêu lúc ghi. Nó kêu lúc người dùng mở bản ghi ra rồi bấm Lưu — form gửi lên giá
 * trị đã suy ra, server so với ô rỗng đang lưu, thấy một trường read-only bị đổi và chặn:
 * "Field is read-only: inventory_mode". Tức là lỗi hiện ra ở chỗ xa nhất khỏi nguyên nhân, và
 * đổ lên đầu người dùng chứ không phải người nhập.
 *
 * Hàm này đọc chính metadata của doctype để biết ô nào suy từ đâu — không hardcode tên trường,
 * nên thêm `fetch_from` mới trong app là nó tự theo.
 */
export function dienTruongSuyRa(phien, doctype, banGhi) {
  const { db } = phien;
  const dinhNghia = db.prepare("SELECT metadata_json FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, doctype)
    ?? db.prepare("SELECT metadata_json FROM doctype_definitions WHERE tenant_id='__standard__' AND doctype=?").get(doctype);
  if (!dinhNghia) return { doctype, dien: 0, truong: [] };

  const meta = JSON.parse(dinhNghia.metadata_json);
  const suy = (meta.fields ?? [])
    .filter((f) => typeof f.fetch_from === "string" && f.fetch_from.includes("."))
    .map((f) => {
      const [truongLink, truongDich] = f.fetch_from.split(".");
      const dinhNghiaLink = (meta.fields ?? []).find((x) => x.fieldname === truongLink);
      return { dich: f.fieldname, truongLink, truongDich, doctypeLink: dinhNghiaLink?.options };
    })
    .filter((x) => x.doctypeLink);

  if (!suy.length) return { doctype, dien: 0, truong: [] };

  const layLink = db.prepare("SELECT payload_json FROM documents WHERE tenant_id=? AND doctype=? AND name=?");
  const dem = new Map();
  for (const r of banGhi) {
    for (const x of suy) {
      const ten = r.payload?.[x.truongLink];
      if (!ten) continue;
      // Tự trỏ vào chính mình (`item_code.item_group`) thì không có gì để đi lấy.
      if (x.doctypeLink === doctype && ten === r.name) continue;
      const nguon = layLink.get(TENANT, x.doctypeLink, ten);
      if (!nguon) continue;
      const gt = JSON.parse(nguon.payload_json)?.[x.truongDich];
      if (gt === undefined || gt === null || gt === r.payload[x.dich]) continue;
      r.payload[x.dich] = gt;
      dem.set(x.dich, (dem.get(x.dich) ?? 0) + 1);
    }
  }
  return { doctype, dien: [...dem.values()].reduce((a, b) => a + b, 0), truong: [...dem].map(([k, n]) => `${k} (${n})`) };
}


/**
 * CHUẨN HOÁ payload cho khớp ĐÚNG hình dạng app tự tạo ra.
 *
 * VÌ SAO — TRIỆU CHỨNG NÓ CHỮA
 * Người dùng bấm Lưu, app báo thành công, nhưng nút Lưu sáng lại ngay: form tưởng vẫn còn thay
 * đổi chưa lưu. Nguyên nhân ở `generic-controller.ts`: khi lưu, server CHỈ giữ những khoá là
 * trường thật của doctype rồi đóng dấu `_metadata_revision`. Bản ghi ghi thẳng SQLite mang thêm
 * khoá lạ (`is_fixed_asset`, `_migration_source`…) và thiếu con dấu đó — nên tài liệu server trả
 * về khác tài liệu client đang giữ, và client kết luận là còn thay đổi. Lưu bao nhiêu lần cũng
 * không sạch, vì mỗi lần lưu lại sinh ra đúng khác biệt cũ.
 *
 * Ba việc:
 *   1. BỎ mọi khoá không phải trường của doctype
 *   2. Ô `Check` về đúng boolean — app ghi `false`, bộ nhập hay ghi `0`
 *   3. Đóng dấu `_metadata_revision` bằng revision hiện hành
 *
 * Provenance (`_migration_source`) vì thế KHÔNG sống trong payload được: nó sống ở file nguồn
 * trong `nhap/du-lieu/`, nơi không ai lưu đè lên.
 */
export function chuanHoaTheoDoctype(phien, doctype, banGhi) {
  const { db } = phien;
  const r = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, doctype);
  if (!r) return { doctype, boKhoa: 0, doiKieu: 0, dongDau: 0 };

  const meta = JSON.parse(r.metadata_json);
  const truong = new Set((meta.fields ?? []).filter((f) => !/Break/.test(f.fieldtype)).map((f) => f.fieldname));
  const oCheck = new Set((meta.fields ?? []).filter((f) => f.fieldtype === "Check").map((f) => f.fieldname));
  const revision = meta.revision ?? r.revision;

  let boKhoa = 0, doiKieu = 0, dongDau = 0;
  for (const bg of banGhi) {
    for (const k of Object.keys(bg.payload)) {
      if (truong.has(k) || k === "_metadata_revision" || k === "workflow_state") continue;
      delete bg.payload[k];
      boKhoa += 1;
    }
    for (const k of oCheck) {
      if (bg.payload[k] === undefined) continue;
      const b = bg.payload[k] === true || bg.payload[k] === 1 || bg.payload[k] === "1";
      if (bg.payload[k] !== b) { bg.payload[k] = b; doiKieu += 1; }
    }
    if (bg.payload._metadata_revision !== revision) { bg.payload._metadata_revision = revision; dongDau += 1; }
  }
  return { doctype, boKhoa, doiKieu, dongDau };
}

export function dongPhien(phien) {
  phien.db.close();
}

export function inBaoCao(tang, ketQua, phien) {
  const dong = Array.isArray(ketQua) ? ketQua : [ketQua];
  console.log(`\n── TẦNG ${tang} ──`);
  for (const k of dong) {
    console.log(`  ${k.doctype.padEnd(22)} định ghi ${String(k.dinhGhi).padStart(5)} | ${k.truoc} → ${k.sau} (thêm ${k.themMoi})`);
  }
  console.log(`  sao lưu: ${phien.duongSaoLuu}`);
  console.log(`TANG_${tang.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}=OK`);
}
