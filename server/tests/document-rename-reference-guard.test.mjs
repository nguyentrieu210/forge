import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { D1MutationStore } from "../dist/packages/document-kernel/src/d1-store.js";

/**
 * Guard "đang được tham chiếu thì không cho đổi tên" phải nhìn được vào MẢNG CON.
 *
 * Guard cũ dùng `json_each(payload_json)`, mà json_each chỉ liệt kê thành viên tầng trên cùng.
 * Mọi tham chiếu kiểu `items[].item_code` — tức gần hết chứng từ — lọt lưới.
 *
 * Đo trên danh mục Alumdoor 19/08, trên 372 mã hàng đổi tên 1:1: guard cũ từ chối 296 mã và cho
 * qua 76. Trong 76 mã "sạch" đó có 3 mã đang được `Purchase Receipt.items[].item_code` trỏ tới.
 * Đổi tên ba mã ấy qua API là ba dòng phiếu nhập trỏ vào mặt hàng không còn tồn tại — không lỗi,
 * không cảnh báo, chỉ là dữ liệu hỏng lặng lẽ.
 */

class StatementAdapter {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  parameters() {
    if (!/\?\d+/.test(this.sql)) return this.args;
    return Object.fromEntries(this.args.map((value, index) => [String(index + 1), value]));
  }
  async first() {
    const p = this.parameters();
    return (Array.isArray(p) ? this.db.prepare(this.sql).get(...p) : this.db.prepare(this.sql).get(p)) ?? null;
  }
  async all() {
    const p = this.parameters();
    return { results: Array.isArray(p) ? this.db.prepare(this.sql).all(...p) : this.db.prepare(this.sql).all(p) };
  }
  async run() {
    const p = this.parameters();
    const r = Array.isArray(p) ? this.db.prepare(this.sql).run(...p) : this.db.prepare(this.sql).run(p);
    return { meta: { changes: Number(r.changes ?? 0) } };
  }
}

class D1Adapter {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    // Lược đồ chép từ D1 thật; chỉ giữ các bảng lệnh đổi tên có đụng tới.
    this.db.exec(`
      CREATE TABLE documents (
        tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, doctype TEXT NOT NULL, name TEXT NOT NULL,
        owner TEXT NOT NULL, docstatus INTEGER NOT NULL CHECK (docstatus IN (0,1,2)), status TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0), created_at TEXT NOT NULL, modified_at TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)), modified_by TEXT NOT NULL DEFAULT '',
        amended_from TEXT, PRIMARY KEY (tenant_id, doc_key), UNIQUE (tenant_id, doctype, name));
      CREATE TABLE document_children (
        tenant_id TEXT NOT NULL, parent_key TEXT NOT NULL, fieldname TEXT NOT NULL, child_doctype TEXT NOT NULL,
        row_id TEXT NOT NULL, idx INTEGER NOT NULL CHECK (idx > 0),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        PRIMARY KEY (tenant_id, parent_key, fieldname, row_id));
      CREATE TABLE versions (tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, version INTEGER NOT NULL,
        command_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
        snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)), created_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, doc_key, version));
      CREATE TABLE document_comments (tenant_id TEXT NOT NULL, comment_id TEXT NOT NULL, doctype TEXT NOT NULL,
        name TEXT NOT NULL, comment_type TEXT NOT NULL, content TEXT NOT NULL, owner TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY (tenant_id,comment_id));
      CREATE TABLE assignments (tenant_id TEXT NOT NULL, assignment_id TEXT NOT NULL, doctype TEXT NOT NULL,
        name TEXT NOT NULL, assigned_to TEXT NOT NULL, description TEXT, status TEXT NOT NULL,
        priority TEXT, due_date TEXT, owner TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id,assignment_id));
      CREATE TABLE document_shares (tenant_id TEXT NOT NULL, share_id TEXT NOT NULL, doctype TEXT NOT NULL,
        name TEXT NOT NULL, PRIMARY KEY (tenant_id,share_id));
      CREATE TABLE document_tags (tenant_id TEXT NOT NULL, tag_id TEXT NOT NULL, doctype TEXT NOT NULL,
        name TEXT NOT NULL, PRIMARY KEY (tenant_id,tag_id));
      CREATE TABLE files (tenant_id TEXT NOT NULL, file_id TEXT NOT NULL, attached_to_doctype TEXT,
        attached_to_name TEXT, PRIMARY KEY (tenant_id,file_id));
    `);
  }
  prepare(sql) { return new StatementAdapter(this.db, sql); }
  withSession() { return this; }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      this.db.exec("COMMIT");
      return out;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}

function seed(adapter, doctype, name, payload) {
  adapter.db.prepare(
    `INSERT INTO documents (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json,modified_by)
     VALUES ('t',?,?,?,'u',0,'Draft',1,'2026-08-19','2026-08-19',?,'u')`,
  ).run(`${doctype}:${name}`, doctype, name, JSON.stringify(payload));
}

const store = () => { const a = new D1Adapter(); return { a, s: new D1MutationStore(a) }; };
const rename = (s, from, to) => s.renameDocument("t", "Item", from, to, "u", "2026-08-19T00:00:00Z", "item_code");

test("tham chiếu nằm trong mảng con vẫn chặn được đổi tên", async () => {
  // Đúng hình dạng đã suýt làm hỏng 3 mã thật: mã nằm ở items[].item_code, không phải tầng trên.
  const { a, s } = store();
  seed(a, "Item", "TẨY NHÔM", { item_code: "TẨY NHÔM" });
  seed(a, "Purchase Receipt", "PR-1", { supplier: "NCC-1", items: [{ item_code: "TẨY NHÔM", qty: 3 }] });
  await assert.rejects(() => rename(s, "TẨY NHÔM", "VT-TAY-NHOM"), /referenced elsewhere/);
});

test("mặt hàng không ai trỏ tới thì vẫn đổi tên được", async () => {
  const { a, s } = store();
  seed(a, "Item", "TP-CU", { item_code: "TP-CU" });
  seed(a, "Purchase Receipt", "PR-1", { items: [{ item_code: "MA-KHAC" }] });
  await rename(s, "TP-CU", "PK-MOI");
  const row = a.db.prepare("SELECT name, doc_key, payload_json FROM documents WHERE doctype='Item'").get();
  assert.equal(row.name, "PK-MOI");
  assert.equal(row.doc_key, "Item:PK-MOI");
  assert.equal(JSON.parse(row.payload_json).item_code, "PK-MOI", "trường đặt tên phải đi theo");
});

test("chuỗi con KHÔNG bị tính là tham chiếu", async () => {
  // TP-CUA là chuỗi con của TP-CUADL1LY. Nếu guard so chuỗi con thì mọi mã ngắn đều bị khoá cứng.
  const { a, s } = store();
  seed(a, "Item", "TP-CUA", { item_code: "TP-CUA" });
  seed(a, "Purchase Receipt", "PR-1", { items: [{ item_code: "TP-CUADL1LY" }] });
  await rename(s, "TP-CUA", "CUA-MOI");
  assert.equal(a.db.prepare("SELECT name FROM documents WHERE doctype='Item'").get().name, "CUA-MOI");
});

test("tham chiếu chôn sâu nhiều tầng cũng chặn", async () => {
  // BOM Rule khai applicability[].component_item — sâu hơn một tầng so với ví dụ phiếu nhập.
  const { a, s } = store();
  seed(a, "Item", "NVL-X", { item_code: "NVL-X" });
  seed(a, "BOM Rule", "BR-1", { rule: { nested: { applicability: [{ component_item: "NVL-X" }] } } });
  await assert.rejects(() => rename(s, "NVL-X", "VT-X"), /referenced elsewhere/);
});

test("bảng con document_children cũng được soi tới đáy", async () => {
  const { a, s } = store();
  seed(a, "Item", "NVL-Y", { item_code: "NVL-Y" });
  seed(a, "Sales Order", "SO-1", { customer: "KH-1" });
  a.db.prepare(
    `INSERT INTO document_children (tenant_id,parent_key,fieldname,child_doctype,row_id,idx,payload_json)
     VALUES ('t','Sales Order:SO-1','items','Sales Order Item','r1',1,?)`,
  ).run(JSON.stringify({ detail: { item_code: "NVL-Y" } }));
  await assert.rejects(() => rename(s, "NVL-Y", "VT-Y"), /referenced elsewhere/);
});
