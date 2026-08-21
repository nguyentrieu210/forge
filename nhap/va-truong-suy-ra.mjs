/**
 * VÁ các ô do server suy ra (`fetch_from`) trên những bản ghi ĐÃ nằm trong D1.
 *
 * Bộ nhập nay tự điền lúc ghi, nhưng bản ghi cũ thì đã lỡ rỗng rồi — và tầng nhập tay cố ý
 * KHÔNG đè bản ghi có sẵn, nên chạy lại nó không vá được. Đây là lượt vá riêng.
 *
 * An toàn với việc người dùng đang sửa: các ô này `read_only` + `serverEnforced`, người dùng
 * không gõ vào được, nên điền đúng giá trị suy ra không thể ghi đè thứ ai đó vừa nhập.
 *
 * CHẠY:  node nhap/va-truong-suy-ra.mjs Item
 */

import { moPhienGhi, dongPhien, dienTruongSuyRa, chuanHoaTheoDoctype, TENANT } from "./lib/d1.mjs";

const doctype = process.argv[2];
if (!doctype) throw new Error("Thiếu tên doctype. Ví dụ: node nhap/va-truong-suy-ra.mjs Item");

const phien = await moPhienGhi({ tang: `va-truong-suy-ra-${doctype}` });
try {
  const rows = phien.db.prepare("SELECT name, payload_json FROM documents WHERE tenant_id=? AND doctype=?")
    .all(TENANT, doctype)
    .map((r) => ({ name: r.name, payload: JSON.parse(r.payload_json), truoc: r.payload_json }));

  if (!rows.length) { console.log(`Không có bản ghi ${doctype} nào.`); process.exit(0); }

  const kq = dienTruongSuyRa(phien, doctype, rows);
  const ch = chuanHoaTheoDoctype(phien, doctype, rows);
  const doi = rows.filter((r) => JSON.stringify(r.payload) !== r.truoc);

  if (!doi.length) { console.log(`${rows.length} bản ghi ${doctype} — không ô nào cần vá.`); }
  else {
    const ghi = phien.db.prepare("UPDATE documents SET payload_json=?, modified_at=?, version=version+1 WHERE tenant_id=? AND doctype=? AND name=?");
    const luc = new Date().toISOString();
    phien.db.exec("BEGIN");
    try {
      for (const r of doi) ghi.run(JSON.stringify(r.payload), luc, TENANT, doctype, r.name);
      phien.db.exec("COMMIT");
    } catch (loi) { phien.db.exec("ROLLBACK"); throw loi; }
    console.log(`${rows.length} bản ghi ${doctype} · vá ${doi.length} bản ghi`);
    console.log(`   ô suy ra điền  : ${kq.dien}${kq.truong.length ? ` (${kq.truong.join(", ")})` : ""}`);
    console.log(`   khoá lạ bỏ đi  : ${ch.boKhoa}`);
    console.log(`   ô Check về bool: ${ch.doiKieu}`);
    console.log(`   đóng dấu revision: ${ch.dongDau}`);
    for (const r of doi.slice(0, 20)) console.log(`   · ${r.name}`);
  }
  console.log(`sao lưu: ${phien.duongSaoLuu}`);
} finally {
  dongPhien(phien);
}
